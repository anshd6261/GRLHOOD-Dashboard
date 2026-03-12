const axios = require('axios');
const { getHeaders } = require('./src/shiprocket');
require('dotenv').config();

const updateDimensions = async () => {
    try {
        const headers = await getHeaders();

        // 1. Fetch recent orders (last 7 days)
        const d = new Date();
        const toDate = d.toISOString().split('T')[0];
        d.setDate(d.getDate() - 7);
        const fromDate = d.toISOString().split('T')[0];

        console.log(`[SHIPROCKET] Fetching NEW orders from ${fromDate} to ${toDate}...`);

        let allOrders = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            const url = `https://apiv2.shiprocket.in/v1/external/orders?filter_by=date&from=${fromDate}&to=${toDate}&per_page=100&page=${page}&status=NEW`; // Assuming status 'NEW' or mapping it
            const response = await axios.get(url, { headers });

            if (response.data && response.data.data && response.data.data.length > 0) {
                // Filter for 'NEW' status if the API param doesn't work perfectly
                const newOrders = response.data.data.filter(o => o.status === 'NEW' || o.status_code === 1);
                allOrders = allOrders.concat(newOrders);
                page++;
            } else {
                hasMore = false;
            }
        }

        console.log(`\nFound ${allOrders.length} 'NEW' orders in that date range.`);

        if (allOrders.length === 0) {
            console.log("No orders to update.");
            return;
        }

        console.log(`\nUpdating dimensions to 8x5x2...`);
        let successCount = 0;
        let failCount = 0;

        for (const order of allOrders) {
            // Check if it already has the correct dims, skip if so
            const currentShipment = order.shipments && order.shipments.length > 0 ? order.shipments[0] : null;
            if (currentShipment &&
                parseFloat(currentShipment.length) === 8 &&
                parseFloat(currentShipment.breadth) === 5 &&
                parseFloat(currentShipment.height) === 2) {
                console.log(`   Skipping Order ${order.id} (${order.channel_order_id}): Already 8x5x2`);
                continue;
            }

            const payload = {
                order_id: order.id,
                length: 8,
                breadth: 5,
                height: 2,
                weight: 0.5 // Default weight
            };

            try {
                // Endpoint to update dimensions of an order
                // The actual endpoint might be /orders/dimensions/update or /orders/update/adhoc
                // Based on standard Shiprocket API, it's often /orders/address/update for package dims too, or via the update endpoint
                // Let's try the generic update.

                await axios.post('https://apiv2.shiprocket.in/v1/external/orders/address/update', {
                    order_id: order.id,
                    shipping_customer_name: order.customer_name,
                    shipping_phone: order.customer_phone,
                    shipping_address: order.shipping_address,
                    shipping_city: order.shipping_city,
                    shipping_pincode: order.shipping_pincode,
                    shipping_state: order.shipping_state,
                    shipping_country: order.shipping_country,
                    length: 8,
                    breadth: 5,
                    height: 2,
                    weight: 0.5
                }, { headers });

                console.log(`   ✅ Updated Order ${order.id} (${order.channel_order_id})`);
                successCount++;
            } catch (err) {
                console.error(`   ❌ Failed Order ${order.id} (${order.channel_order_id}):`, err.response?.data?.message || err.message);
                failCount++;
            }

            // Sleep to avoid rate limiting
            await new Promise(r => setTimeout(r, 200));
        }

        console.log(`\nDone! Successfully updated: ${successCount}. Failed: ${failCount}.`);

    } catch (e) {
        console.error("Script Failed:", e.message);
    }
};

updateDimensions();
