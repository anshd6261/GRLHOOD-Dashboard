const shiprocket = require('./src/shiprocket');

const run = async () => {
    try {
        await shiprocket.authenticate();
        const SEARCH_ID = '1561';

        console.log('--- TEST 1: findOrderByShopifyId("1561") ---');
        const res1 = await shiprocket.findOrderByShopifyId(SEARCH_ID);
        console.log('Result:', JSON.stringify(res1, null, 2));

        // Note: verify if it was found in list
        // We can't see the list here because findOrderByShopifyId swallows it unless we modify it to return list.
        // But we can check logs if we add a log inside findOrderByShopifyId to print ALL ids.

        console.log('\n--- TEST 2: findOrderByShopifyId("#1561") ---');
        const res2 = await shiprocket.findOrderByShopifyId('#' + SEARCH_ID);
        console.log('Result:', JSON.stringify(res2, null, 2));

    } catch (e) {
        console.error('Error:', e);
    }
};

run();
