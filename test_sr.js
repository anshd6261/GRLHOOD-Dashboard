const shiprocket = require('./src/shiprocket');

const run = async () => {
    try {
        await shiprocket.authenticate();

        const SEARCH_ID = '1561';
        console.log(`Searching for Order: ${SEARCH_ID}`);

        const result = await shiprocket.findOrderByShopifyId(SEARCH_ID);
        console.log('Result:', JSON.stringify(result, null, 2));

    } catch (e) {
        console.error('Error:', e);
    }
};

run();
