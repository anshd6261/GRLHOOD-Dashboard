const { getUnfulfilledOrders } = require('./src/shopify');

async function run() {
    console.log("Testing Date Filter...");

    // Test Case: Last 2 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 2);

    console.log(`Input: ${startDate.toISOString()} to ${endDate.toISOString()}`);

    try {
        const orders = await getUnfulfilledOrders(3, startDate.toISOString(), endDate.toISOString());
        console.log(`Orders Found: ${orders.length}`);
        if (orders.length > 0) {
            console.log("First Order Created At:", orders[0].createdAt);
            console.log("Last Order Created At:", orders[orders.length - 1].createdAt);
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

run();
