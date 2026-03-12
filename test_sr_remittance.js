const sr = require('./src/shiprocket');
const axios = require('axios');

const run = async () => {
    try {
        await sr.authenticate();
        const headers = await sr.getHeaders();

        console.log("Testing remittance APIs...");
        // Try common remittance endpoints
        const endpoints = [
            'https://apiv2.shiprocket.in/v1/external/billing/remittance',
            'https://apiv2.shiprocket.in/v1/external/remittance',
            'https://apiv2.shiprocket.in/v1/external/cod/remittance'
        ];

        for (const url of endpoints) {
            try {
                const r = await axios.get(url, { headers });
                console.log("SUCCESS:", url, Object.keys(r.data));
            } catch (e) {
                console.log("FAILED:", url, e.response?.status);
            }
        }

        const res = await axios.get('https://apiv2.shiprocket.in/v1/external/orders?per_page=100&page=1', { headers });
        const orders = res.data.data;
        console.log("Payment methods found in recent orders:", [...new Set(orders.map(o => o.payment_method))]);
        const cod = orders.find(o => String(o.payment_method).toLowerCase().includes('cod'));
        if (cod) {
            console.log("Found COD keys:", Object.keys(cod));
            console.log("Delivered date?", cod.delivered_date, "Shipment details?", cod.shipments?.[0]?.delivered_date);
        }

    } catch (e) {
        console.error("Error:", e.response ? e.response.data : e.message);
    }
};
run();
