/**
 * Full integration test - tests the complete RapidShyp integration
 */
require('dotenv').config();
const rapidshyp = require('./src/rapidshyp');

(async () => {
    console.log('=== RapidShyp Full Integration Test ===\n');

    // 1. Fetch orders with RTO data
    console.log('--- Fetching ALL orders with RTO ---');
    const result = await rapidshyp.fetchOrdersWithRTO('ALL', 2);
    console.log(`Success: ${result.success}`);
    console.log(`Orders: ${result.data.length}`);

    if (result.data.length > 0) {
        // Show RTO distribution
        const high = result.data.filter(o => o.rto_prediction === 'High').length;
        const med = result.data.filter(o => o.rto_prediction === 'Medium').length;
        const low = result.data.filter(o => o.rto_prediction === 'Low').length;
        const unknown = result.data.filter(o => o.rto_prediction === 'Unknown').length;

        console.log(`\n🔴 High Risk: ${high}`);
        console.log(`🟠 Medium Risk: ${med}`);
        console.log(`🟢 Low Risk: ${low}`);
        console.log(`⚪ Unknown: ${unknown}`);

        // Show a few sample orders
        console.log('\n--- Sample Orders ---');
        for (const order of result.data.slice(0, 5)) {
            console.log(`${order.seller_order_id} | ${order.rto_prediction} | ${order.payment_method} | ${order.contact_name}`);
            console.log(`   Reason: ${order.rto_reason}`);
        }
    }

    console.log('\n=== Test Complete ===');
})();
