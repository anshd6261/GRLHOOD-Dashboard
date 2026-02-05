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

const testUpdateV2 = async () => {
    try {
        const headers = await getHeaders();
        const orderId = 1167917953; // Order 1561

        console.log(`--- TEST 3: create/adhoc with Numeric ID & NO Channel ID ---`);
        const payload = {
            order_id: orderId,
            // channel_id: REMOVED
            order_date: "2026-02-04 14:52",
            pickup_location: "Primary",
            billing_customer_name: "Test Update V2",
            billing_last_name: "User",
            billing_address: "Test Address",
            billing_city: "Delhi",
            billing_pincode: "110001",
            billing_state: "Delhi",
            billing_country: "India",
            billing_email: "test@example.com",
            billing_phone: "9876543210",
            shipping_is_billing: true,
            order_items: [
                {
                    name: "Cloud - Double Armoured",
                    sku: "399",
                    units: 1,
                    selling_price: 749
                }
            ],
            payment_method: "Prepaid",
            sub_total: 100,
            length: 8,
            breadth: 5,
            height: 2,
            weight: 0.5
        };

        try {
            const r = await axios.post('https://apiv2.shiprocket.in/v1/external/orders/create/adhoc', payload, { headers });
            console.log('✅ Update Response:', r.data);

            console.log(`\n--- VERIFY ---`);
            const v = await axios.get(`https://apiv2.shiprocket.in/v1/external/orders/show/${orderId}`, { headers });
            const s = v.data.data.shipments[0];
            if (s) {
                console.log(`Shipment Dims: L=${s.length}, B=${s.breadth}, H=${s.height}`);
            } else {
                console.log(`No Shipment found (Still 0?)`);
            }

        } catch (e) {
            console.log('❌ Error:', e.response?.data || e.message);
        }

        console.log(`\n--- TEST 4: orders/update/adhoc with Channel ID ---`);
        const payload4 = {
            order_id: "1561", // Channel Order ID
            channel_id: 9321795,
            order_date: "2026-02-04 14:52",
            pickup_location: "Primary",
            billing_customer_name: "Test Update V4",
            billing_last_name: "User",
            billing_address: "Test Address",
            billing_city: "Delhi",
            billing_pincode: "110001",
            billing_state: "Delhi",
            billing_country: "India",
            billing_email: "test@example.com",
            billing_phone: "9876543210",
            shipping_is_billing: true,
            order_items: [
                {
                    name: "Cloud - Double Armoured",
                    sku: "399",
                    units: 1,
                    selling_price: 749
                }
            ],
            payment_method: "Prepaid",
            sub_total: 100,
            length: 8,
            breadth: 5,
            height: 2,
            weight: 0.5
        };
        try {
            const r4 = await axios.post('https://apiv2.shiprocket.in/v1/external/orders/update/adhoc', payload4, { headers });
            console.log('✅ Response:', r4.data);
            // Verify
            const v = await axios.get(`https://apiv2.shiprocket.in/v1/external/orders/show/${orderId}`, { headers });
            const s = v.data.data.shipments[0];
            if (s) console.log(`Shipment Dims: L=${s.length}, B=${s.breadth}, H=${s.height}`);
        } catch (e) {
            console.log('❌ Error:', e.response?.data || e.message);
        }

    } catch (error) {
        console.error('Test Failed:', error.message);
    }
};

testUpdateV2();
