const axios = require('axios');
const { getHeaders } = require('./src/shiprocket');
require('dotenv').config();

const updateDimensionsViaDuplicate = async () => {
    try {
        const headers = await getHeaders();
        const fromDate = '2026-02-09';
        const toDate = '2026-03-10';

        console.log(`[SHIPROCKET] Fetching NEW orders from ${fromDate} to ${toDate}...`);

        let allOrders = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            const url = `https://apiv2.shiprocket.in/v1/external/orders?filter_by=date&from=${fromDate}&to=${toDate}&per_page=100&page=${page}`;
            const response = await axios.get(url, { headers });

            if (response.data && response.data.data && response.data.data.length > 0) {
                // Filter for 'NEW' status. Don't process already processed ones. Look for 'channel_id' to skip adhoc duplicates we just created, if we want or just check shipments length.
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

        let successCount = 0;
        let failCount = 0;
        let skippedCount = 0;

        for (const order of allOrders) {
            // Check if it already has the correct dims, skip if so
            const currentShipment = order.shipments && order.shipments.length > 0 ? order.shipments[0] : null;
            if (currentShipment &&
                parseFloat(currentShipment.length) === 8 &&
                parseFloat(currentShipment.breadth) === 5 &&
                parseFloat(currentShipment.height) === 2) {
                console.log(`   ⏭️  Skipping Order ${order.id} (${order.channel_order_id}): Already 8x5x2`);
                skippedCount++;
                continue;
            }

            // Also skip if it's already an Adhoc order without channel_id? 
            // Wait, we WANT to update channel orders that don't have dims.

            console.log(`   🔄 Updating Order ${order.id} (${order.channel_order_id}) via Duplicate Strategy...`);

            try {
                // Fetch full original order to ensure we have products
                const resDetails = await axios.get(`https://apiv2.shiprocket.in/v1/external/orders/show/${order.id}`, { headers });
                const originalOrder = resDetails.data.data;

                const customer = originalOrder.customer_name || "Customer";
                const splitName = customer.split(' ');

                let cleanPhone = (originalOrder.billing_phone || originalOrder.customer_phone || "9876543210").replace(/\D/g, '');
                if (cleanPhone.length > 10) cleanPhone = cleanPhone.slice(-10);
                if (cleanPhone.length < 10) cleanPhone = "9876543210";

                const duplicatePayload = {
                    order_id: originalOrder.channel_order_id, // Important: keep same ID for Shopify tracking
                    order_date: originalOrder.created_at,
                    pickup_location: originalOrder.pickup_location || "Primary",
                    billing_customer_name: splitName[0],
                    billing_last_name: splitName.slice(1).join(' ') || "",
                    billing_address: originalOrder.billing_address || originalOrder.customer_address || "Address",
                    billing_address_2: originalOrder.billing_address_2 || "",
                    billing_city: originalOrder.billing_city || originalOrder.customer_city || "City",
                    billing_pincode: originalOrder.billing_pincode || originalOrder.customer_pincode || "110001",
                    billing_state: originalOrder.billing_state || originalOrder.customer_state || "State",
                    billing_country: originalOrder.billing_country || originalOrder.customer_country || "India",
                    billing_email: originalOrder.billing_email || originalOrder.customer_email || "noreply@cloutcases.in",
                    billing_phone: cleanPhone,
                    shipping_is_billing: true,
                    order_items: originalOrder.products.map(p => ({
                        name: p.name,
                        sku: p.sku || "DEFAULT-SKU",
                        units: p.quantity,
                        selling_price: parseFloat(p.selling_price) || 1
                    })),
                    payment_method: originalOrder.payment_method === "COD" ? "COD" : "Prepaid",
                    sub_total: parseFloat(originalOrder.net_total || originalOrder.sub_total) || 1,
                    length: 8,
                    breadth: 5,
                    height: 2,
                    weight: 0.5
                };

                // Create Duplicate
                const createRes = await axios.post('https://apiv2.shiprocket.in/v1/external/orders/create/adhoc', duplicatePayload, { headers });

                // Cancel Original
                await axios.post('https://apiv2.shiprocket.in/v1/external/orders/cancel', {
                    ids: [originalOrder.id]
                }, { headers });

                console.log(`   ✅ Success! Replaced ${originalOrder.id} with ${createRes.data.order_id} (${originalOrder.channel_order_id})`);
                successCount++;
                break; // TEST ONLY: Stop after one order

            } catch (err) {
                console.error(`   ❌ Failed Order ${order.id} (${order.channel_order_id}):`, err.response?.data || err.message);
                failCount++;
            }

            // Sleep to avoid rate limiting
            await new Promise(r => setTimeout(r, 1000));
        }

        console.log(`\nDone! Successfully updated: ${successCount}. Skipped: ${skippedCount}. Failed: ${failCount}.`);

    } catch (e) {
        console.error("Script Failed:", e.message);
    }
};

updateDimensionsViaDuplicate();
