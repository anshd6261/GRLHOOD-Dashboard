const axios = require('axios');
require('dotenv').config();

const SHIPROCKET_EMAIL = process.env.SHIPROCKET_EMAIL;
const SHIPROCKET_PASSWORD = process.env.SHIPROCKET_PASSWORD;

const getHeaders = async () => {
    const res = await axios.post('https://apiv2.shiprocket.in/v1/external/auth/login', {
        email: SHIPROCKET_EMAIL,
        password: SHIPROCKET_PASSWORD
    });
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${res.data.token}`
    };
};

// Check if tracking was synced to Shopify
const checkShopifyTracking = async () => {
    try {
        const headers = await getHeaders();
        const targetOrderName = "1573";

        console.log(`\n🔍 Checking Order #${targetOrderName} in Shiprocket for tracking...`);
        const searchRes = await axios.get(`https://apiv2.shiprocket.in/v1/external/orders?per_page=50`, { headers });

        // Look for the ADHOC order (should be the one with order_id 1573 but no channel_id)
        const orders = searchRes.data.data.filter(o => o.channel_order_id == targetOrderName);

        console.log(`\n📋 Found ${orders.length} order(s) with ID #${targetOrderName}:`);
        orders.forEach((o, i) => {
            console.log(`\n   Order ${i + 1}:`);
            console.log(`   - Internal ID: ${o.id}`);
            console.log(`   - Channel: ${o.channel_id ? `Channel ${o.channel_id}` : 'CUSTOM/ADHOC'}`);
            console.log(`   - Status: ${o.status}`);
            console.log(`   - AWB: ${o.awb_code || 'Not assigned'}`);
            console.log(`   - Courier: ${o.courier_name || 'Not assigned'}`);
            console.log(`   - Shipment ID: ${o.shipments?.[0]?.id || 'None'}`);
            console.log(`   - Shipment Status: ${o.shipments?.[0]?.status_code || 'None'}`);
        });

        console.log(`\n✅ Next: Check your Shopify admin for Order #${targetOrderName}`);
        console.log(`   Look for the tracking number in the fulfillment section.`);
        console.log(`   If it appears, the sync is working! 🎉`);

    } catch (error) {
        console.error('\n❌ Check Failed:', error.response?.data || error.message);
    }
};

checkShopifyTracking();
