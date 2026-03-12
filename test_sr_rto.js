const sr = require('./src/shiprocket');
const axios = require('axios');
const run = async () => {
    try {
        await sr.authenticate();
        const headers = await sr.getHeaders();
        let statuses = new Set();
        // Fetch last 500 orders
        for (let i = 1; i <= 10; i++) {
            const res = await axios.get(`https://apiv2.shiprocket.in/v1/external/orders?per_page=50&page=${i}`, { headers });
            if (res.data && res.data.data) {
                res.data.data.forEach(d => statuses.add(`${d.status_code}: ${d.status}`));
            }
        }
        console.log("All Statuses Found:", Array.from(statuses));
    } catch (e) { console.error(e.message) }
};
run();
