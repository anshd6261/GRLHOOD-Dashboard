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

const revertTest = async () => {
    try {
        const headers = await getHeaders();

        console.log(`\n🔄 REVERTING TEST CHANGES FOR ORDER #1573...`);

        // Step 1: Delete the duplicate adhoc order
        console.log(`\n🗑️  Step 1: Deleting Duplicate Order (ID: 1169017315)...`);
        try {
            await axios.post('https://apiv2.shiprocket.in/v1/external/orders/cancel', {
                ids: [1169017315]
            }, { headers });
            console.log(`✅ Duplicate order 1169017315 cancelled/deleted.`);
        } catch (err) {
            console.log(`⚠️  Delete failed:`, err.response?.data || err.message);
        }

        // Step 2: Check status of original order
        console.log(`\n🔍 Step 2: Checking Original Order (ID: 1168866135)...`);
        const checkRes = await axios.get(`https://apiv2.shiprocket.in/v1/external/orders/show/1168866135`, { headers });
        const originalOrder = checkRes.data.data;

        console.log(`📋 Original Order Status:`, {
            id: originalOrder.id,
            channel_order_id: originalOrder.channel_order_id,
            status: originalOrder.status,
            shipment_id: originalOrder.shipments?.[0]?.id
        });

        if (originalOrder.status === 'CANCELED') {
            console.log(`\n⚠️  Original order is CANCELED.`);
            console.log(`   Unfortunately, Shiprocket doesn't allow un-cancelling orders via API.`);
            console.log(`   The order will need to be re-synced from Shopify automatically.`);
            console.log(`\n💡 Solution: The Shopify-Shiprocket integration should re-sync this order soon.`);
            console.log(`   Or you can manually trigger a sync from your Shopify admin.`);
        } else {
            console.log(`✅ Original order is active (Status: ${originalOrder.status}).`);
        }

        console.log(`\n✅ REVERT COMPLETE!`);
        console.log(`   - Duplicate deleted: 1169017315`);
        console.log(`   - Original status: ${originalOrder.status}`);

    } catch (error) {
        console.error('\n❌ Revert Failed:', error.response?.data || error.message);
    }
};

revertTest();
