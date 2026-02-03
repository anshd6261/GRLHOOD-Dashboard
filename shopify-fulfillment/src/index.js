const cron = require('node-cron');
require('dotenv').config();

const { getUnfulfilledOrders } = require('./shopify');
const { processOrders } = require('./processor');
const { generateCSV, saveCSV } = require('./csv');

const runFulfillmentJob = async () => {
    console.log('\n════════════════════════════════════════');
    console.log(`[JOB] Starting Fulfillment Sync: ${new Date().toLocaleString()}`);
    console.log('════════════════════════════════════════');

    try {
        // 1. Fetch Orders
        const daysLookback = parseInt(process.env.DETAILS_LOOKBACK_DAYS || 3);
        const orders = await getUnfulfilledOrders(daysLookback);

        if (orders.length === 0) {
            console.log('[JOB] No unfulfilled orders found. Exiting.');
            return;
        }

        // 2. Process Data
        const gstRate = parseFloat(process.env.GST_RATE || 18);
        const processedRows = processOrders(orders, gstRate);
        console.log(`[JOB] Processed ${processedRows.length} items from ${orders.length} orders.`);

        // 3. Generate CSV
        const csvContent = generateCSV(processedRows, gstRate);
        const filePath = saveCSV(csvContent);

        console.log(`[JOB] SUCCESS! File generated: ${filePath}`);

    } catch (error) {
        console.error('[JOB] FAILED:', error.message);
    }
};

// Parse command line arguments
const args = process.argv.slice(2);

if (args.includes('--run-now')) {
    // Manual Run
    runFulfillmentJob();
} else {
    // Scheduled Run: Every 3 days at 00:00
    // Cron expression: "0 0 */3 * *"
    console.log('[SCHEDULER] Service started. Running every 3 days.');
    console.log('[SCHEDULER] Press Ctrl+C to stop.');

    cron.schedule('0 0 */3 * *', () => {
        runFulfillmentJob();
    });
}
