const axios = require('axios');
const { getDb } = require('./database');
const { getHeaders } = require('./shiprocket');
require('dotenv').config();

// Map Shiprocket status to simple order_status
const mapStatusToOrder = (status) => {
    const s = status.toLowerCase();
    if (s.includes('delivered')) return 'delivered';
    if (s.includes('rto') || s.includes('return')) return 'rto';
    if (s.includes('shipped') || s.includes('in transit') || s.includes('out for delivery')) return 'shipped';
    if (s.includes('canceled') || s.includes('cancelled')) return 'cancelled';
    return null; // Don't update if we don't confidently map it
};

const syncShipments = async (daysBack = 30) => {
    console.log(`[Shiprocket Sync] Fetching shipments for the last ${daysBack} days...`);
    const headers = await getHeaders();
    const db = getDb();

    // Calculate Dates (Shiprocket uses YYYY-MM-DD HH:mm:ss)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const fromDate = startDate.toISOString().split('T')[0] + ' 00:00:00';
    const toDate = endDate.toISOString().split('T')[0] + ' 23:59:59';

    let currentPage = 1;
    let hasMorePages = true;
    let processedCount = 0;

    const upsertShipment = db.prepare(`
        INSERT INTO shipments (
            order_id, awb_number, courier_name, shipped_date, delivered_date,
            current_status, forward_shipping_cost, weight_kg, is_rto, rto_date,
            return_shipping_cost, rto_reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(order_id) DO UPDATE SET
            awb_number=excluded.awb_number,
            courier_name=excluded.courier_name,
            shipped_date=excluded.shipped_date,
            delivered_date=excluded.delivered_date,
            current_status=excluded.current_status,
            forward_shipping_cost=excluded.forward_shipping_cost,
            weight_kg=excluded.weight_kg,
            is_rto=excluded.is_rto,
            rto_date=excluded.rto_date,
            return_shipping_cost=excluded.return_shipping_cost,
            rto_reason=excluded.rto_reason
    `);

    // Helper to safely get the correct order ID reference format
    const findOrderId = db.prepare('SELECT order_id FROM orders WHERE order_id = ? OR order_id = ?');

    const updateOrderStatus = db.prepare('UPDATE orders SET order_status = ?, updated_at = CURRENT_TIMESTAMP WHERE order_id = ?');

    const transaction = db.transaction((shipmentsBatch) => {
        let batchProcessed = 0;
        for (const shipment of shipmentsBatch) {
            let channelOrderId = shipment.channel_order_id;
            if (!channelOrderId) continue;

            const possibleId1 = channelOrderId.toString();
            const possibleId2 = `#${channelOrderId}`;

            // Check if we have this order
            const match = findOrderId.get(possibleId1, possibleId2);
            if (!match) continue; // Skip if we don't have the order in DB yet

            const orderId = match.order_id;

            const awb = shipment.awb_code || '';
            const courier = shipment.courier_name || '';
            const status = shipment.status || '';

            // Dates
            const shippedDate = shipment.shipments?.shipped_date || null;
            const deliveredDate = shipment.shipments?.delivered_date || null;

            // Costs
            const forwardCost = parseFloat(shipment.freight_charges || 0);
            const weight = parseFloat(shipment.weight || 0);

            // RTO Logic
            const isRto = status.toLowerCase().includes('rto') ? 1 : 0;
            // Note: Exact return cost might need a separate API call or estimation. Using forwardCost as proxy for now if RTO.
            const returnCost = isRto ? forwardCost : 0;
            const rtoReason = isRto ? shipment.status_reason || 'RTO initiated' : null;
            // Use delivered_date as rto_date if delivered back
            const rtoDate = isRto ? (shipment.shipments?.delivered_date || new Date().toISOString()) : null;

            // 1. Upsert Shipment
            upsertShipment.run(
                orderId, awb, courier, shippedDate, deliveredDate,
                status, forwardCost, weight, isRto, rtoDate, returnCost, rtoReason
            );

            // 2. Update Order Status
            const newOrderStatus = mapStatusToOrder(status);
            if (newOrderStatus) {
                updateOrderStatus.run(newOrderStatus, orderId);
            }

            batchProcessed++;
        }
        return batchProcessed;
    });

    while (hasMorePages) {
        try {
            const response = await axios.get('https://apiv2.shiprocket.in/v1/external/orders', {
                headers,
                params: {
                    from: fromDate,
                    to: toDate,
                    per_page: 50,
                    page: currentPage
                }
            });

            const shipments = response.data.data;
            if (!shipments || shipments.length === 0) {
                hasMorePages = false;
                break;
            }

            // Sync this batch
            const batchCount = transaction(shipments);
            processedCount += batchCount;

            // Check pagination
            const pagination = response.data.meta?.pagination;
            if (pagination && currentPage >= pagination.total_pages) {
                hasMorePages = false;
            } else {
                currentPage++;
                // Add a small delay to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 500));
            }

        } catch (error) {
            console.error('[Shiprocket Sync] Pagination Error:', error.response?.data || error.message);
            break;
        }
    }

    console.log(`[Shiprocket Sync] Complete. Processed & matched ${processedCount} shipments.`);
    return { processed: processedCount };
};

const syncRecentShipments = () => {
    return syncShipments(2); // Last 48 hours for regular updates
};

const getShipmentByOrderId = (orderId) => {
    const db = getDb();
    return db.prepare('SELECT * FROM shipments WHERE order_id = ?').get(orderId);
};

// Auto-run if executed directly for testing
if (require.main === module) {
    (async () => {
        try {
            // Need a sleep to ensure SQLite doesn't face BUSY errors if another script is holding it
            await syncShipments(7); // Test 7 days

            const db = getDb();
            const sampleShipment = db.prepare('SELECT * FROM shipments LIMIT 1').get();
            if (sampleShipment) {
                console.log('\n[TEST] Sample Shipment Fetched:', sampleShipment);
            } else {
                console.log('\n[TEST] No shipments matched to existing local orders in DB.');
            }
        } catch (e) {
            console.error('[TEST] Failed:', e);
        }
    })();
}

module.exports = {
    syncShipments,
    syncRecentShipments,
    getShipmentByOrderId
};
