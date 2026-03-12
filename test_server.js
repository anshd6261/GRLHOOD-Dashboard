require('dotenv').config();
const { processOrders } = require('./src/processor');
const { getUnfulfilledOrders } = require('./src/shopify');

(async () => {
    try {
        console.log("Starting test...");
        // Emulating exact request payloads passed by the Express Router
        const startDate = "2026-03-01T00:00:00.000Z";
        const endDate = "2026-03-10T23:59:59.999Z";
        const rawOrders = await getUnfulfilledOrders(1, startDate, endDate, "unfulfilled");
        console.log("Fetched raw orders:", rawOrders.length);

        const processedRows = processOrders(rawOrders, 18);
        console.log("Success! Extracted formatted UI rows:", processedRows.length);
    } catch (e) {
        console.error("CRITICAL EXCEPTION:", e);
    }
})();
