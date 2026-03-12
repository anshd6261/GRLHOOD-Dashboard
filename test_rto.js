const axios = require('axios');
require('dotenv').config();

(async () => {
    try {
        const auth = await axios.post('https://apiv2.shiprocket.in/v1/external/auth/login', {
            email: process.env.SHIPROCKET_EMAIL,
            password: process.env.SHIPROCKET_PASSWORD
        });
        const token = auth.data.token;
        const headers = { 'Authorization': `Bearer ${token}` };

        const orders = await axios.get('https://apiv2.shiprocket.in/v1/external/orders?per_page=1', { headers });
        console.log("Order Data:");
        console.log(JSON.stringify(orders.data.data[0], null, 2));

    } catch (e) {
        console.error("Error:", e.response ? e.response.data : e.message);
    }
})();
