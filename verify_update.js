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

const verifyPersistence = async () => {
    try {
        const headers = await getHeaders();
        const orderId = 1167917953; // Order 1561

        console.log(`--- STEP 1: Fetch Current State of Order ${orderId} ---`);
        const res1 = await axios.get(`https://apiv2.shiprocket.in/v1/external/orders/show/${orderId}`, { headers });
        const o1 = res1.data.data;
        console.log(`Current Dims: ${o1.shipments.length} shipments`);
        if (o1.shipments.length > 0) {
            console.log(`Shipment 0 Dims: L=${o1.shipments[0].length}, B=${o1.shipments[0].breadth}, H=${o1.shipments[0].height}, W=${o1.shipments[0].weight}`);
        }

        console.log(`\n--- STEP 2: Create Replacement Order (1561-TEST-F) ---`);
        const payload = {
            order_id: "1561-TEST-F", // New Unique ID
            // NO channel_id (Treat as Pure Manual Order)
            order_date: o1.created_at,
            pickup_location: "Primary",
            billing_customer_name: "Test Update",
            billing_last_name: "User",
            billing_address: "Test Address",
            billing_city: "Delhi",
            billing_pincode: "110001",
            billing_state: "Delhi",
            billing_country: "India",
            billing_email: "test@example.com",
            billing_phone: "9876543210",
            shipping_is_billing: true,
            order_items: o1.products.map(p => ({
                name: p.name,
                sku: p.sku,
                units: p.quantity,
                selling_price: p.selling_price
            })),
            payment_method: "Prepaid",
            sub_total: 100,
            length: 8,
            breadth: 5,
            height: 2,
            weight: 0.5
        };

        const updateRes = await axios.post('https://apiv2.shiprocket.in/v1/external/orders/create/adhoc', payload, { headers });
        console.log('Creation Response:', updateRes.data);
        const newOrderId = updateRes.data.order_id;


        console.log(`\n--- STEP 3: Fetch NEW Order to Verify ---`);
        await new Promise(r => setTimeout(r, 2000));

        const res2 = await axios.get(`https://apiv2.shiprocket.in/v1/external/orders/show/${newOrderId}`, { headers });
        const o2 = res2.data.data;
        console.log(`New Order ID: ${newOrderId}`);
        console.log('FULL NEW ORDER:', JSON.stringify(o2, null, 2));
        console.log(`New Dims: ${o2.shipments.length} shipments`);
        if (o2.shipments.length > 0) {
            console.log(`Shipment 0 Dims: L=${o2.shipments[0].length}, B=${o2.shipments[0].breadth}, H=${o2.shipments[0].height}, W=${o2.shipments[0].weight}`);

            if (o2.shipments[0].length == 8) {
                console.log("✅ SUCCESS: Replacement Order has correct dimensions!");
            } else {
                console.log("❌ FAILURE: Replacement Order still missing dims.");
            }
        }


    } catch (error) {
        console.error('Test Failed:', error.response?.data || error.message);
    }
};

verifyPersistence();
