const { getHeaders } = require('./src/shiprocket.js');
const axios = require('axios');

async function test() {
    const headers = await getHeaders();
    const res = await axios.get('https://apiv2.shiprocket.in/v1/external/orders?per_page=5', { headers });
    console.log(JSON.stringify(res.data.data[0], null, 2));
}

test().catch(console.error);
