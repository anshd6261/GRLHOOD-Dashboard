const shiprocket = require('./src/shiprocket');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const TARGET_ORDERS = ['1481', '1479', '1477'];

async function run() {
    console.log(`[MANUAL] Starting Label Gen for: ${TARGET_ORDERS.join(', ')}`);

    try {
        await shiprocket.authenticate();
        console.log('[MANUAL] Authenticated.');

        const validShipmentIds = [];
        const failedOrders = [];
        const shipmentToOrderMap = {};

        // 1. Search
        for (const orderName of TARGET_ORDERS) {
            console.log(`[MANUAL] Searching for ${orderName}...`);
            try {
                // Mimic server logic: search by name
                const search = await shiprocket.findOrderByShopifyId(orderName);

                if (search.found) {
                    console.log(`   ✅ Found: Shipment ID ${search.shipment_id} (Status: ${search.status})`);

                    if (search.shipment_id) {
                        validShipmentIds.push({
                            shipmentId: search.shipment_id,
                            orderId: search.order_id
                        });
                        shipmentToOrderMap[search.shipment_id] = orderName;
                    } else {
                        console.warn(`   ⚠️ Found but NO Shipment ID.`);
                        failedOrders.push({ orderId: orderName, error: 'No Shipment ID' });
                    }
                } else {
                    console.warn(`   ❌ Not Found.`);
                    failedOrders.push({ orderId: orderName, error: 'Not Found in Shiprocket' });
                }
            } catch (e) {
                console.error(`   ❌ Error: ${e.message}`);
                failedOrders.push({ orderId: orderName, error: e.message });
            }
        }

        if (validShipmentIds.length === 0) {
            console.log('[MANUAL] No valid shipments found to process.');
            generateFailedReport(failedOrders);
            return;
        }

        // 2. Assign
        console.log(`[MANUAL] Assigning Couriers for ${validShipmentIds.length} shipments...`);
        const assignmentRes = await shiprocket.bulkAssignCouriers(validShipmentIds);

        assignmentRes.failed.forEach(f => {
            const oid = shipmentToOrderMap[f.id] || f.id;
            failedOrders.push({ orderId: oid, error: 'Assign Failed: ' + f.error });
        });

        const readyToShipIds = assignmentRes.successful;
        console.log(`[MANUAL] ${readyToShipIds.length} shipments ready for labels.`);

        if (readyToShipIds.length > 0) {
            // 3. Generate Label
            console.log(`[MANUAL] Generating Labels...`);
            const labelRes = await shiprocket.bulkGenerateLabel(readyToShipIds);

            if (labelRes.success) {
                console.log('\n=============================================');
                console.log('🎉 LABEL GENERATED SUCCESSFULLY');
                console.log('👉 LABEL URL:', labelRes.url);
                console.log('=============================================\n');
            } else {
                console.error('❌ Label Generation Failed:', labelRes.error);
                readyToShipIds.forEach(sid => {
                    const oid = shipmentToOrderMap[sid] || sid;
                    failedOrders.push({ orderId: oid, error: 'Label Gen Failed: ' + labelRes.error });
                });
            }
        }

        // 4. Reports
        if (failedOrders.length > 0) {
            generateFailedReport(failedOrders);
        } else {
            console.log('[MANUAL] No Failures. All Requested Orders Processed.');
        }

    } catch (e) {
        console.error('[MANUAL] Critical Error:', e);
    }
}

function generateFailedReport(failedOrders) {
    console.log('\n⚠️ FAILED ORDERS REPORT:');
    const headers = ['Order ID', 'Error Message'];
    const csvRows = [headers.join(',')];

    failedOrders.forEach(o => {
        console.log(`   - Order ${o.orderId}: ${o.error}`);
        csvRows.push(`${o.orderId},"${o.error.replace(/"/g, '""')}"`);
    });

    const filename = `MANUAL_FAILED_REPORT_${Date.now()}.csv`;
    fs.writeFileSync(filename, csvRows.join('\n'));
    console.log(`\n📄 Saved Failed Report to: ${process.cwd()}/${filename}`);
}

run();
