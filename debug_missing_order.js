const { getUnfulfilledOrders } = require('./src/shopify');
const shiprocket = require('./src/shiprocket');
require('dotenv').config();

async function findMissingOrder() {
    console.log('--- STARTING MISSING ORDER INVESTIGATION ---');

    console.log('1. Fetching unfulfilled orders from Shopify (Last 7 days)...');
    try {
        // Fetch last 7 days to be safe
        const shopifyOrders = await getUnfulfilledOrders(7);
        console.log(`✅ Shopify returned ${shopifyOrders.length} unfulfilled orders.`);

        console.log('2. Authenticating with Shiprocket...');
        await shiprocket.authenticate();

        console.log('3. Checking each order in Shiprocket...');
        const missingOrders = [];

        let count = 0;
        // Optimization: The missing order is likely recent. Check last 50 first.
        const recentOrders = shopifyOrders.slice(0, 50);

        for (const order of recentOrders) {
            count++;
            if (count % 10 === 0) console.log(`Processed ${count}/${shopifyOrders.length}...`);

            // Use order Name (e.g., #1001) as the key, stripped of # for search
            const searchKey = order.name.replace('#', '');

            // Search
            const result = await shiprocket.findOrderByShopifyId(searchKey);

            if (!result.found) {
                // Double check with full name
                const result2 = await shiprocket.findOrderByShopifyId(order.name);
                if (!result2.found) {
                    console.log(`❌ MISSING: Order ${order.name} (ID: ${order.id}) not found in Shiprocket.`);
                    missingOrders.push({
                        name: order.name,
                        id: order.id,
                        customer: order.shippingAddress?.name || 'Unknown',
                        financialParam: order.displayFinancialStatus
                    });
                }
            }
        }

        console.log('\n--- RESULTS ---');
        if (missingOrders.length === 0) {
            console.log('✅ All orders found in Shiprocket! Discrepancy might be status-related (e.g. Canceled/Returned).');
        } else {
            console.log(`⚠️ FOUND ${missingOrders.length} MISSING ORDERS:`);
            missingOrders.forEach(o => {
                console.log(`- ${o.name} (${o.customer}) [${o.financialParam}]`);
            });
        }

    } catch (error) {
        console.error('CRITICAL ERROR:', error);
    }
}

findMissingOrder();
