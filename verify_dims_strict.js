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

const verifyDims = async () => {
    try {
        const headers = await getHeaders();
        const orderId = 1167917953; // Order 1561

        console.log(`\n--- STEP 1: Fetch Current Order Details ---`);
        const v1 = await axios.get(`https://apiv2.shiprocket.in/v1/external/orders/show/${orderId}`, { headers });
        const o1 = v1.data.data;
        console.log(`Order Status: ${o1.status}`);
        console.log(`Order Weight: ${o1.net_total} (Total?), Dims: ${JSON.stringify(o1.other_sub_orders)}`); // Guessing
        console.log(`Shipments Array Length: ${o1.shipments?.length}`);
        if (o1.shipments?.length > 0) {
            console.log(`Shipment 0:`, o1.shipments[0]);
        }
        else {
            console.log(`No Shipments found.`);
            // Check products if no shipment
            if (o1.products?.length) console.log(`Product 0 Dims:`, o1.products[0]);
        }

        console.log(`\n--- STEP 2: Attempt Update via address/update (Force 10x10x10) ---`);
        const payload = {
            order_id: orderId,
            shipping_customer_name: "Dim Check Two", // No digits
            shipping_phone: "9876543210",
            shipping_address: "Test Address Two",
            shipping_city: "Delhi",
            shipping_pincode: "110001",
            shipping_state: "Delhi",
            shipping_country: "India",
            // Trying different field names
            length: 10, breadth: 10, height: 10, weight: 1.5,
            box_length: 10, box_breadth: 10, box_height: 10,
            volumetric_weight: 1.5
        };
        try {
            const r = await axios.post('https://apiv2.shiprocket.in/v1/external/orders/address/update', payload, { headers });
            console.log('Update Response:', JSON.stringify(r.data));
        } catch (e) {
            console.log('Update Error:', e.response?.data || e.message);
        }

        console.log(`\n--- STEP 3: Fetch New Dims ---`);
        const v2 = await axios.get(`https://apiv2.shiprocket.in/v1/external/orders/show/${orderId}`, { headers });
        const o2 = v2.data.data;
        console.log(`New Order Weight: ${o2.net_total}`); // Check where weight is
        if (o2.shipments?.length > 0) console.log(`New Shipment:`, o2.shipments[0]);

        // Also check if 'customer_name' changed (proof that update worked at all)
        console.log(`Customer Name: ${o1.customer_name} -> ${o2.customer_name}`);
        console.log(`Shipping Name: ${o1.billing_customer_name} -> ${o2.billing_customer_name}? Or shipping? ${JSON.stringify(o2.shipping_address)}`);

    } catch (error) {
        console.error('Test Failed:', error.message);
    }
};

verifyDims();
