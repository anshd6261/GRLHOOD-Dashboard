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

const verifyDimsV3 = async () => {
    try {
        const headers = await getHeaders();
        const orderId = 1167917953;

        console.log(`\n--- Test 3: Nested Objects in address/update ---`);
        const payload = {
            order_id: orderId,
            shipping_customer_name: "Dim Check Three",
            shipping_phone: "9876543210",
            shipping_address: "Test Address V3",
            shipping_city: "Delhi",
            shipping_pincode: "110001",
            shipping_state: "Delhi",
            shipping_country: "India",

            // Hypothesis 1: Nested shipment_details
            shipment_details: {
                length: 12, breadth: 12, height: 12, weight: 2.0
            },

            // Hypothesis 2: Nested order_items update (unlikely for addr update but trying)
            order_items: [
                {
                    sku: "399",
                    quantity: 1,
                    selling_price: 749,
                    weight: 2.0,
                    length: 12, breadth: 12, height: 12
                }
            ],

            // Hypothesis 3: Flat fields with pickup_location (trigger recalc)
            pickup_location: "Primary",
            length: 12, breadth: 12, height: 12, weight: 2.0
        };

        try {
            const r = await axios.post('https://apiv2.shiprocket.in/v1/external/orders/address/update', payload, { headers });
            console.log('Update Response:', r.status);
        } catch (e) {
            console.log('Update Error:', e.response?.data || e.message);
        }

        console.log(`\n--- Check Results ---`);
        const v2 = await axios.get(`https://apiv2.shiprocket.in/v1/external/orders/show/${orderId}`, { headers });
        const o2 = v2.data.data;

        console.log(`Name: ${o2.customer_name}`);
        console.log(`Weight: ${o2.net_total} (Wrong field), Search products...`);
        if (o2.products?.length) {
            console.log(`Product 0 Updated?`, o2.products[0].weight, o2.products[0].dimensions);
        }

    } catch (error) {
        console.error('Test Failed:', error.message);
    }
};

verifyDimsV3();
