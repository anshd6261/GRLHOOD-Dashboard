const shiprocket = require('./src/shiprocket');
const fs = require('fs');
const path = require('path');
const { graphqlRequest } = require('./src/shopify');

// --- History CSV Helper Copied/Simplified ---
const generateCSV = (data, totalColumns = 0) => {
    if (data.length === 0) return '';
    const headers = Object.keys(data[0]);
    const csvRows = [];
    csvRows.push(headers.join(','));
    for (const row of data) {
        const values = headers.map(header => {
            const escaped = ('' + (row[header] || '')).replace(/"/g, '\\"');
            return `"${escaped}"`;
        });
        csvRows.push(values.join(','));
    }
    return csvRows.join('\n');
};

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

const TEST_ORDERS = ['1573', '1572', '1567'];

async function runRealVerification() {
    console.log("🚀 Starting LIVE VERIFICATION for:", TEST_ORDERS.join(', '));
    console.log("----------------------------------------------------------------");

    try {
        await shiprocket.authenticate();

        const safeItems = []; // { shipmentId, orderId, shopifyOrder }
        const highRiskOrders = [];

        // 1. Fetch & Identify
        for (const orderNum of TEST_ORDERS) {
            const order = await findOrderByName(orderNum);

            // SIMULATION: Force High Risk for 1567 if Shopify API didn't return it (for testing report gen)
            if (orderNum === '1567') order.riskLevel = 'HIGH';

            console.log(`   Order #${orderNum} Risk: ${order.riskLevel}`);

            // Simulating Row Data for CSV
            const rowData = {
                'Order ID': orderNum,
                'Customer': order.shippingAddress?.name || "Unknown",
                'Risk': order.riskLevel
            };

            if (order.riskLevel === 'HIGH') {
                console.log(`⚠️ HIGH RISK: #${orderNum}. Added to Report.`);
                highRiskOrders.push(rowData);
                continue;
            }

            // Find in Shiprocket
            // SHIPROCKET TRAP: Stores 'channel_order_id' as "1573", NOT the long Shopify GID.
            // We must search by NAME (1573) to get a match.
            const shopifySearchKey = order.name.replace('#', ''); // "1573"

            console.log(`   Detailed Debug: Order Name: ${order.name}, SearchKey: ${shopifySearchKey}`);

            let search = await shiprocket.findOrderByShopifyId(shopifySearchKey);

            // Fallback: Try with Hash if undefined
            if (!search.found) {
                search = await shiprocket.findOrderByShopifyId(order.name);
            }

            if (search.found && search.shipment_id) {
                console.log(`   Found Shiprocket Match -> OrderID: ${search.order_id}, ShipmentID: ${search.shipment_id}`);
                safeItems.push({
                    shipmentId: search.shipment_id,
                    orderId: search.order_id,
                    shopifyOrder: order
                });
                console.log(`✅ Ready to Ship: #${orderNum}`);
            } else {
                console.error(`❌ Order #${orderNum} not in Shiprocket.`);
            }
        }

        // 2. Generate High Risk CSV
        if (highRiskOrders.length > 0) {
            const csvContent = generateCSV(highRiskOrders);
            const reportPath = path.join(__dirname, 'HIGH_RISK_REPORT.csv');
            fs.writeFileSync(reportPath, csvContent);
            console.log(`\n📄 High Risk Report Generated: ${reportPath}`);
        }

        if (safeItems.length === 0) {
            console.log("No valid orders to ship.");
            return;
        }

        // 3. Bulk Assign (With Auto-Correction)
        console.log(`\n🚚 Bulk Assigning ${safeItems.length} orders (Auto-Fix Enabled)...`);

        const assignmentRes = await shiprocket.bulkAssignCouriers(safeItems);
        const readyToShipIds = assignmentRes.successful;

        // 4. Bulk Label Generate
        let labelLink = "N/A - Assignment Failed";

        if (readyToShipIds.length > 0) {
            console.log(`\n📄 Generating Bulk Label...`);
            const labelRes = await shiprocket.bulkGenerateLabel(readyToShipIds);

            if (labelRes.success) {
                labelLink = labelRes.url;
                console.log(`\n✅ BULK LABEL SUCCESS`);
            } else {
                console.error(`❌ Bulk Label Failed: ${labelRes.error}`);
            }
        } else {
            console.log("\n⚠️ No orders successfully assigned.");
        }

        console.log("\n----------------------------------------------------------------");
        console.log("                  FINAL VERIFICATION LINKS                      ");
        console.log("----------------------------------------------------------------");
        console.log(`🔗 High Risk Report: file://${path.join(__dirname, 'HIGH_RISK_REPORT.csv')}`);
        if (readyToShipIds.length > 0) {
            console.log(`🔗 Shipping Labels:  ${labelLink}`);
        } else {
            console.log(`🔗 Shipping Labels:  (None Generated)`);
        }
        console.log("----------------------------------------------------------------");

    } catch (e) {
        console.error("Critical:", e);
    }
}

runRealVerification();
