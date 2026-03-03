const { graphqlRequest } = require('./shopify');
const { getDb } = require('./database');

// Map Shopify fulfillment status to our DB status
const mapOrderStatus = (displayFulfillmentStatus) => {
    switch (displayFulfillmentStatus) {
        case 'FULFILLED': return 'shipped'; // Will be updated by Shiprocket later
        case 'UNFULFILLED': return 'pending';
        case 'PARTIALLY_FULFILLED': return 'pending';
        case 'RESTOCKED': return 'returned';
        case 'PENDING_FULFILLMENT': return 'pending';
        default: return 'pending';
    }
};

// Extract SKU category logic
const extractCategory = (title) => {
    const t = title.toLowerCase();
    if (t.includes('tough')) return 'Tough Case';
    if (t.includes('glass')) return 'Glass Case';
    if (t.includes('hard')) return 'Hard Case';
    if (t.includes('clear')) return 'Clear Case';
    if (t.includes('grip') || t.includes('pad')) return 'GripPad';
    if (t.includes('sleeve')) return 'Laptop Sleeve';
    if (t.includes('airpod')) return 'AirPods Case';
    return 'Other';
};

// Fallback COGS logic if not in Products DB
const getFallbackCOGS = (category) => {
    switch (category) {
        case 'Tough Case': return 150;
        case 'Glass Case': return 180;
        case 'Hard Case': return 120;
        case 'Clear Case': return 100;
        case 'GripPad': return 80;
        case 'Laptop Sleeve': return 300;
        case 'AirPods Case': return 100;
        default: return 150;
    }
};

const syncOrders = async (daysBack = 30) => {
    console.log(`[Shopify Sync] Starting sync for the last ${daysBack} days...`);
    const db = getDb();

    // Calculate past date
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - daysBack);
    const queryDateStr = pastDate.toISOString();

    const query = `
        query getOrders($cursor: String, $query: String!) {
            orders(first: 50, after: $cursor, query: $query) {
                pageInfo {
                    hasNextPage
                    endCursor
                }
                edges {
                    node {
                        id
                        name
                        createdAt
                        displayFulfillmentStatus
                        totalPriceSet { shopMoney { amount } }
                        totalDiscountsSet { shopMoney { amount } }
                        totalShippingPriceSet { shopMoney { amount } }
                        paymentGatewayNames
                        customer {
                            firstName
                            lastName
                            email
                            phone
                        }
                        shippingAddress {
                            phone
                            formatted
                            city
                            provinceCode
                            zip
                        }
                        lineItems(first: 50) {
                            edges {
                                node {
                                    id
                                    sku
                                    title
                                    variantTitle
                                    quantity
                                    originalUnitPriceSet { shopMoney { amount } }
                                    discountedTotalSet { shopMoney { amount } }
                                }
                            }
                        }
                        refunds(first: 10) {
                            createdAt
                            totalRefundedSet { shopMoney { amount } }
                        }
                    }
                }
            }
        }
    `;

    let hasNextPage = true;
    let cursor = null;
    let processedCount = 0;
    let updatedCount = 0;
    let insertedCount = 0;

    // Prepare DB statements
    const upsertOrder = db.prepare(`
        INSERT INTO orders (
            order_id, order_date, customer_name, customer_phone, customer_email,
            shipping_address, city, state, pincode, gross_amount, discount_amount,
            shipping_charged, net_amount, payment_method, payment_gateway,
            order_status, refund_amount, refund_date, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(order_id) DO UPDATE SET
            customer_name=excluded.customer_name,
            shipping_address=excluded.shipping_address,
            order_status=excluded.order_status,
            refund_amount=excluded.refund_amount,
            refund_date=excluded.refund_date,
            updated_at=CURRENT_TIMESTAMP
    `);

    const insertOrderItem = db.prepare(`
        INSERT INTO order_items (
            order_id, sku, product_name, category, phone_model, quantity, unit_price, total_price, cogs
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const deleteOrderItems = db.prepare('DELETE FROM order_items WHERE order_id = ?');

    // Start Transaction
    const transaction = db.transaction((nodes) => {
        for (const node of nodes) {
            const orderId = node.name; // e.g. #1001

            // Check if exists for logging
            const existing = db.prepare('SELECT order_id FROM orders WHERE order_id = ?').get(orderId);
            if (existing) updatedCount++;
            else insertedCount++;

            // Customer Details
            const firstName = node.customer?.firstName || '';
            const lastName = node.customer?.lastName || '';
            const customerName = `${firstName} ${lastName}`.trim();
            const email = node.customer?.email || '';
            const phone = node.shippingAddress?.phone || node.customer?.phone || '';

            // Address
            const addr = node.shippingAddress;
            const formattedAddress = addr?.formatted ? addr.formatted.join(', ') : '';
            const city = addr?.city || '';
            const state = addr?.provinceCode || '';
            const pincode = addr?.zip || '';

            // Financials
            const gross = parseFloat(node.totalPriceSet?.shopMoney?.amount || 0);
            const discount = parseFloat(node.totalDiscountsSet?.shopMoney?.amount || 0);
            const shippingCharged = parseFloat(node.totalShippingPriceSet?.shopMoney?.amount || 0);

            // Note: Shopify's totalPrice already has discounts subtracted and shipping added
            const netAmount = gross;
            const calcGross = netAmount + discount - shippingCharged; // Internal Gross before any discounts/shipping

            // Payment
            const gatewayNames = node.paymentGatewayNames || [];
            const gatewayStr = gatewayNames.join(', ');
            const paymentMethod = gatewayStr.toLowerCase().includes('cod') || gatewayStr.toLowerCase().includes('cash') ? 'COD' : 'Prepaid';

            // Refunds
            let refundTotal = 0;
            let firstRefundDate = null;
            if (node.refunds && node.refunds.length > 0) {
                firstRefundDate = node.refunds[0].createdAt;
                refundTotal = node.refunds.reduce((sum, r) => sum + parseFloat(r.totalRefundedSet?.shopMoney?.amount || 0), 0);
            }

            const status = mapOrderStatus(node.displayFulfillmentStatus);

            // 1. Upsert Order
            upsertOrder.run(
                orderId, node.createdAt, customerName, phone, email,
                formattedAddress, city, state, pincode, calcGross, discount,
                shippingCharged, netAmount, paymentMethod, gatewayStr,
                status, refundTotal, firstRefundDate
            );

            // 2. Clear existing line items to prevent duplicates on update
            deleteOrderItems.run(orderId);

            // 3. Insert Line Items
            if (node.lineItems && node.lineItems.edges) {
                for (const itemEdge of node.lineItems.edges) {
                    const item = itemEdge.node;
                    const qty = item.quantity;
                    const unitPrice = parseFloat(item.originalUnitPriceSet?.shopMoney?.amount || 0);
                    const totalPrice = parseFloat(item.discountedTotalSet?.shopMoney?.amount || (unitPrice * qty));

                    const category = extractCategory(item.title);
                    const phoneModel = item.variantTitle || '';

                    // Simple COGS fallback logic (can be replaced by DB lookup later)
                    const cogs = getFallbackCOGS(category);

                    insertOrderItem.run(
                        orderId, item.sku || '', item.title, category, phoneModel,
                        qty, unitPrice, totalPrice, cogs
                    );
                }
            }
            processedCount++;
        }
    });

    while (hasNextPage) {
        const graphqlQuery = `created_at:>=${queryDateStr}`;
        const variables = { cursor, query: graphqlQuery };

        try {
            const data = await graphqlRequest(query, variables);
            const nodes = data.orders.edges.map(e => e.node);

            // Execute DB transaction for this batch
            transaction(nodes);

            hasNextPage = data.orders.pageInfo.hasNextPage;
            cursor = data.orders.pageInfo.endCursor;
        } catch (error) {
            console.error('[Shopify Sync] Error processing batch:', error);
            break; // Stop on error
        }
    }

    console.log(`[Shopify Sync] Complete. Processed: ${processedCount} | Inserted: ${insertedCount} | Updated: ${updatedCount}`);
    return { processed: processedCount, inserted: insertedCount, updated: updatedCount };
};

const syncRecentOrders = () => {
    return syncOrders(1); // Last 24 hours / 1 day
};

const getOrderById = (orderId) => {
    const db = getDb();
    const order = db.prepare('SELECT * FROM orders WHERE order_id = ?').get(orderId);
    if (!order) return null;

    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
    order.items = items;
    return order;
};

// Auto-run if executed directly for testing
if (require.main === module) {
    (async () => {
        try {
            // Test with last 3 days
            await syncOrders(3);

            // Fetch an example order to verify
            const db = getDb();
            const sampleOrder = db.prepare('SELECT order_id FROM orders LIMIT 1').get();
            if (sampleOrder) {
                console.log('\n[TEST] Sample Order Fetched:', getOrderById(sampleOrder.order_id));
            }
        } catch (e) {
            console.error('[TEST] Failed:', e);
        }
    })();
}

module.exports = {
    syncOrders,
    syncRecentOrders,
    getOrderById
};
