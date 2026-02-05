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

const testEdit = async () => {
    try {
        const headers = await getHeaders();
        const orderId = 1167917953; // Order 1561 (Numeric)

        console.log(`--- TEST 1: orders/update with Numeric ID ---`);
        // Payload strictly matching "Update Order" docs if they exist
        const payload1 = {
            order_id: orderId,
            length: 8,
            breadth: 5,
            height: 2,
            weight: 0.5
        };
        try {
            console.log('POST /orders/update', payload1);
            const r1 = await axios.post('https://apiv2.shiprocket.in/v1/external/orders/update', payload1, { headers });
            console.log('✅ Response:', r1.data);
        } catch (e) {
            console.log('❌ Error:', e.response?.data || e.message);
        }

        console.log(`\n--- TEST 2: orders/address/update ---`);
        const payload2 = {
            order_id: orderId,
            shipping_customer_name: "Test Update", // Req field?
            shipping_phone: "9876543210",
            shipping_address: "Address Update Check",
            shipping_city: "Delhi",
            shipping_pincode: "110001",
            shipping_state: "Delhi",
            shipping_country: "India",
            // Can we sneak in dims?
            length: 8, breadth: 5, height: 2, weight: 0.5
        };
        try {
            console.log('POST /orders/address/update', payload2);
            const r2 = await axios.post('https://apiv2.shiprocket.in/v1/external/orders/address/update', payload2, { headers });
            console.log('✅ Response:', JSON.stringify(r2.data));

            console.log(`\n--- VERIFY: Fetch Order ---`);
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

    } catch (error) {
        console.error('Test Failed:', error.message);
    }
};

testEdit();
