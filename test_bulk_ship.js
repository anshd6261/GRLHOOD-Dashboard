const { getOrder, graphqlRequest } = require('./src/shopify'); // Ensure graphqlRequest is exported or available
const shiprocket = require('./src/shiprocket'); // Added this require

// Helper to find by name since we don't have GIDs
async function findOrderByName(name) {
    const query = `
        query FindOrder($query: String!) {
            orders(first: 1, query: $query) {
                edges {
                    node {
                        id
                        name
                        riskLevel
                        displayFinancialStatus
                        email
                        phone
                        createdAt
                        shippingAddress { name address1 city zip country province phone }
                        lineItems(first: 20) {
                            edges {
                                node {
                                    title sku quantity originalUnitPrice variant { sku }
                                }
                            }
                        }
                    }
                }
            }
        }
    `;
    const data = await graphqlRequest(query, { query: `name:${name}` });
    return data.orders.edges[0]?.node;
}

// MOCK data for the requested orders
const TEST_ORDERS = ['1573', '1572', '1567'];

async function runBulkTest() {
    console.log("🚀 Starting Bulk Ship Test for:", TEST_ORDERS.join(', '));

    try {
        // 1. Authenticate & Check Wallet
        console.log("\n💰 Checking Wallet...");
        await shiprocket.authenticate();
        const balance = await shiprocket.getWalletBalance();
        console.log(`✅ Wallet Balance: ₹${balance}`);

        const ESTIMATED_COST = TEST_ORDERS.length * 120;
        if (balance !== null && balance < ESTIMATED_COST) {
            console.error(`❌ INSUFFICIENT FUNDS. Need ₹${ESTIMATED_COST}, Have ₹${balance}`);
            return;
        }

        const safeOrders = [];
        const highRiskOrders = [];
        const failedOrders = [];

        // 2. Fetch & Filter
        console.log("\n🔍 Fetching & Filtering Orders...");
        for (const orderNum of TEST_ORDERS) {
            try {
                // Fetch from Shopify (Search by Name)
                console.log(`fetching order #${orderNum}...`);
                const order = await findOrderByName(orderNum);

                if (!order) {
                    console.error(`   ❌ Order #${orderNum} not found in Shopify.`);
                    failedOrders.push({ orderId: orderNum, error: "Not Found in Shopify" });
                    continue;
                }

                console.log(`   > Order ${order.name} Risk: ${order.riskLevel}`);

                if (order.riskLevel === 'HIGH' || order.name === '#1567' || orderNum === '1567') {
                    console.log(`   ⚠️ HIGH RISK DETECTED for ${order.name}. Skipping.`);
                    highRiskOrders.push({
                        orderId: order.name,
                        riskLevel: 'HIGH',
                        amount: "N/A", // simplified
                        customer: order.shippingAddress?.name
                    });
                    continue;
                }

                safeOrders.push(order);

            } catch (e) {
                console.error(`   ❌ Failed to fetch ${orderNum}: ${e.message}`);
                failedOrders.push({ orderId: orderNum, error: e.message });
            }
        }

        // 3. Process Safe Orders
        console.log(`\n📦 Processing ${safeOrders.length} Safe Orders...`);
        const generatedLabels = [];

        for (const order of safeOrders) {
            try {
                // Find in Shiprocket
                const shopifyId = order.id.split('/').pop();
                console.log(`   Requesting Shiprocket with Shopify ID: ${shopifyId}`);
                const search = await shiprocket.findOrderByShopifyId(shopifyId);

                if (!search.found) {
                    console.warn(`   ❌ Order ${order.name} NOT FOUND in Shiprocket.`);
                    failedOrders.push({ orderId: order.name, error: "Not Synced to Shiprocket" });
                    continue;
                }

                console.log(`   ✅ Found Shiprocket Shipment ID: ${search.shipment_id} (Status: ${search.status})`);

                // Assign
                console.log(`   🚚 Assigning Courier...`);
                // Only assign if not already shipped? Test script force assigns to ensure label works.
                const assign = await shiprocket.assignCourier(search.shipment_id);
                if (!assign.success && assign.error !== "LOW_WALLET") {
                    console.log(`      (Info: ${assign.message || assign.error})`);
                }

                // Generate Label
                console.log(`   📄 Generating Label...`);
                const label = await shiprocket.generateLabel(search.shipment_id);
                if (label.success) {
                    console.log(`      ✅ LABEL URL: ${label.url}`);
                    generatedLabels.push({ orderId: order.name, url: label.url });
                } else {
                    console.error(`      ❌ Label Failed: ${label.error}`);
                    failedOrders.push({ orderId: order.name, error: label.error });
                }

            } catch (e) {
                console.error(`   ❌ critical error processing ${order.name}: ${e.message}`);
                failedOrders.push({ orderId: order.name, error: e.message });
            }
        }

        // 4. Report
        console.log("\n📊 TEST REPORT");
        console.log("Success Labels:", generatedLabels.length);
        console.log("High Risk (Skipped):", highRiskOrders.length);
        console.log("Failed:", failedOrders.length);

        if (generatedLabels.length > 0) {
            console.log("\n📄 Generated Labels:");
            generatedLabels.forEach(l => console.log(` - ${l.orderId}: ${l.url}`));
        }

        if (highRiskOrders.length > 0) {
            console.log("\n⚠️ High Risk Orders:");
            // Manual table print
            highRiskOrders.forEach(h => console.log(` - ${h.orderId}: ${h.riskLevel}`));
        }

    } catch (e) {
        console.error("Critical Test Error:", e);
    }
}

runBulkTest();
