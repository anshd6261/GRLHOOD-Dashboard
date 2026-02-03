const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { getUnfulfilledOrders } = require('./shopify');
const { processOrders } = require('./processor');
const { generateCSV } = require('./csv');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// 1. Status Check
app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        store: process.env.SHOPIFY_STORE_DOMAIN,
        connected: !!(process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET)
    });
});

// 2. Fetch & Process Orders
app.get('/api/orders', async (req, res) => {
    try {
        const daysLookback = parseInt(req.query.days || process.env.DETAILS_LOOKBACK_DAYS || 3);
        const gstRate = parseFloat(process.env.GST_RATE || 18);

        console.log(`[API] Fetching orders (lookback: ${daysLookback} days)...`);

        // Fetch
        const rawOrders = await getUnfulfilledOrders(daysLookback);

        // Process
        const processedRows = processOrders(rawOrders, gstRate);

        // Calculate Stats
        const totalCOGS = processedRows.reduce((sum, row) => sum + (row.cogs || 0), 0);
        const gstAmount = totalCOGS * (gstRate / 100);
        const grandTotal = totalCOGS + gstAmount;

        // Unique Orders count
        const uniqueOrders = new Set(processedRows.map(r => r.orderId)).size;

        res.json({
            success: true,
            stats: {
                totalOrders: uniqueOrders,
                totalItems: processedRows.length,
                subtotal: totalCOGS,
                gst: gstAmount,
                total: grandTotal
            },
            orders: processedRows, // Send rows for table preview
            rawCount: rawOrders.length
        });

    } catch (error) {
        console.error('[API] Error in /api/orders:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. Download CSV
app.post('/api/download', (req, res) => {
    try {
        const { rows } = req.body;
        const gstRate = parseFloat(process.env.GST_RATE || 18);

        if (!rows || !Array.isArray(rows)) {
            return res.status(400).json({ error: 'Invalid data provided' });
        }

        const csvContent = generateCSV(rows, gstRate);

        const date = new Date();
        const filename = `FULFILLMENT-${date.getMonth() + 1}-${date.getDate()}.csv`;

        res.header('Content-Type', 'text/csv');
        res.attachment(filename);
        res.send(csvContent);

    } catch (error) {
        console.error('[API] Error generating CSV:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`\n📦 Fulfillment API running on http://localhost:${PORT}`);
});
