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

const testUpdate = async () => {
    try {
        const headers = await getHeaders();
        const orderId = 1167917953; // Order 1561
        const channelId = 9321795;

        console.log(`Testing Channel Order Update for ${orderId} (Channel ${channelId})...`);

        // Payload for Adhoc Update but mapped to Channel
        const payload = {
            order_id: "1561", // Try Channel Order ID here
            channel_id: channelId,
            order_date: "2026-02-04 12:00", // Required for create/update logic?
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
            order_items: [
                {
                    name: "Test Item",
                    sku: "TEST-SKU",
                    units: 1,
                    selling_price: 100
                }
            ],
            payment_method: "Prepaid",
            sub_total: 100,
            length: 8,
            breadth: 5,
            height: 2,
            weight: 0.5
        };

        // Try Adhoc Create/Update
        console.log('Sending request to: https://apiv2.shiprocket.in/v1/external/orders/create/adhoc');
        const response = await axios.post('https://apiv2.shiprocket.in/v1/external/orders/create/adhoc', payload, { headers });

        console.log('✅ Update Success!', response.data);

    } catch (error) {
        console.error('❌ Update Failed:', error.response?.data || error.message);
    }
};

testUpdate();
