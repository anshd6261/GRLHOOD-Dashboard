const axios = require('axios');
const { getHeaders } = require('./src/shiprocket');
require('dotenv').config();

const testUpdateAdhoc = async () => {
    try {
        const headers = await getHeaders();
        const fromDate = '2026-02-09';
        const toDate = '2026-03-10';

        console.log(`[SHIPROCKET] Fetching NEW orders from ${fromDate} to ${toDate}...`);
        const url = `https://apiv2.shiprocket.in/v1/external/orders?filter_by=date&from=${fromDate}&to=${toDate}&per_page=10`;
        const response = await axios.get(url, { headers });

        const orders = response.data.data.filter(o => o.status === 'NEW' || o.status_code === 1);

        if (orders.length === 0) {
            console.log("No NEW orders found.");
            return;
        }

        const targetOrder = orders[0];
        console.log(`\nTesting update on Order: ${targetOrder.id} (Channel ID: ${targetOrder.channel_order_id})`);

        // Fetch full order details
        const detailsRes = await axios.get(`https://apiv2.shiprocket.in/v1/external/orders/show/${targetOrder.id}`, { headers });
        const oDetails = detailsRes.data.data;

        // Construct update payload (similar to create)
        const payload = {
            order_id: oDetails.channel_order_id, // For update adhoc, order_id is usually channel_order_id if channel_id is provided, OR internal ID. In Shiprocket, update/adhoc uses channel_order_id if it's a channel order, or internal ID? Let's try what test_update_order used.
            channel_id: oDetails.channel_id,
            order_date: oDetails.created_at,
            pickup_location: oDetails.pickup_location || "Primary",
            billing_customer_name: oDetails.billing_customer_name || "Customer",
            billing_last_name: oDetails.billing_last_name || "",
            billing_address: oDetails.billing_address || "Address",
            billing_address_2: oDetails.billing_address_2 || "",
            billing_city: oDetails.billing_city || "City",
            billing_pincode: oDetails.billing_pincode || "110001",
            billing_state: oDetails.billing_state || "State",
            billing_country: oDetails.billing_country || "India",
            billing_email: oDetails.billing_email || "test@test.com",
            billing_phone: (() => {
                let p = oDetails.billing_phone || "9876543210";
                p = p.replace(/\D/g, '');
                if (p.length > 10) p = p.slice(-10);
                if (p.length < 10) p = "9876543210";
                return p;
            })(),
            shipping_is_billing: true,
            shipping_customer_name: oDetails.shipping_customer_name || oDetails.billing_customer_name || "Customer",
            shipping_last_name: oDetails.shipping_last_name || "",
            shipping_address: oDetails.shipping_address,
            shipping_address_2: oDetails.shipping_address_2 || "",
            shipping_city: oDetails.shipping_city,
            shipping_pincode: oDetails.shipping_pincode,
            shipping_country: oDetails.shipping_country,
            shipping_state: oDetails.shipping_state,
            shipping_phone: (() => {
                let p = oDetails.shipping_phone || oDetails.billing_phone || "9876543210";
                p = p.replace(/\D/g, '');
                if (p.length > 10) p = p.slice(-10);
                if (p.length < 10) p = "9876543210";
                return p;
            })(),
            order_items: oDetails.products.map(p => ({
                name: p.name,
                sku: p.sku || "REF-SKU",
                units: p.quantity,
                selling_price: p.selling_price
            })),
            payment_method: (oDetails.payment_method === 'Prepaid' || oDetails.payment_method === 'COD') ? oDetails.payment_method : "Prepaid",
            sub_total: oDetails.net_total,
            length: 8,
            breadth: 5,
            height: 2,
            weight: 0.5
        };

        console.log(`[SHIPROCKET] Sending UPDATE ADHOC request for ${targetOrder.id}...`);

        try {
            const updateRes = await axios.post('https://apiv2.shiprocket.in/v1/external/orders/update/adhoc', payload, { headers });
            console.log(`✅ Update ADHOC Response:`, updateRes.data);
        } catch (updateErr) {
            console.error(`❌ Update ADHOC Failed:`, updateErr.response?.data || updateErr.message);

            console.log("\nRetrying with internal ID as order_id...");
            payload.order_id = targetOrder.id; // Try internal ID
            const retryRes = await axios.post('https://apiv2.shiprocket.in/v1/external/orders/update/adhoc', payload, { headers });
            console.log(`✅ Retry Response:`, retryRes.data);
        }

        // Verify changes
        console.log(`\n[SHIPROCKET] Re-fetching order to verify dimensions...`);
        const verifyRes = await axios.get(`https://apiv2.shiprocket.in/v1/external/orders/show/${targetOrder.id}`, { headers });
        const vDetails = verifyRes.data.data;

        if (vDetails.shipments && vDetails.shipments.length > 0) {
            const s = vDetails.shipments[0];
            console.log(`Dimensions: L=${s.length}, B=${s.breadth}, H=${s.height}, W=${s.weight}`);
            if (s.length == 8 && s.breadth == 5 && s.height == 2) {
                console.log(`🎉 SUCCESS! Dimensions updated.`);
            } else {
                console.log(`⚠️ Dimensions did not update: ${s.length}x${s.breadth}x${s.height}`);
            }
        } else {
            console.log(`No shipments array found on order. Wait, checking products...`);
            console.log(`Product Dims:`, vDetails.products[0].dimensions);
        }

    } catch (e) {
        console.error("Test Failed:", e.message);
        if (e.response?.data) console.error("API Error Details:", JSON.stringify(e.response.data, null, 2));
    }
};

testUpdateAdhoc();
