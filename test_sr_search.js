const shiprocket = require('./src/shiprocket');
const axios = require('axios');

const run = async () => {
    try {
        await shiprocket.authenticate();
        const headers = await shiprocket.getHeaders();
        const SEARCH_ID = '1561';

        console.log('--- TEST 3: Using "search" parameter ---');
        // Many APIs use ?search=xyz
        try {
            const res = await axios.get(`https://apiv2.shiprocket.in/v1/external/orders?search=${SEARCH_ID}`, { headers });
            const match = res.data.data.find(o => o.channel_order_id == SEARCH_ID);
            console.log(`Found Match: ${!!match}`);
            if (match) console.log('Match:', match.channel_order_id);
            else console.log('Top Result:', res.data.data[0]?.channel_order_id);
        } catch (e) { console.log('Search Param Failed', e.message); }

    } catch (e) {
        console.error('Error:', e);
    }
};

run();
