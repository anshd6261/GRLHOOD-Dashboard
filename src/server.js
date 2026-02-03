const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { getUnfulfilledOrders } = require('./shopify');
const { processOrders } = require('./processor');
const { generateCSV } = require('./csv');
const { generateExcel } = require('./excel');
const { getHistory, saveBatch, updateBatch } = require('./history');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Serve Static Frontend (Production)
app.use(express.static(path.join(__dirname, '../frontend/dist')));

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
        const totalRevenue = processedRows.reduce((sum, row) => sum + (row.price || 0), 0);
        const gstAmount = totalCOGS * (gstRate / 100);
        const grandTotal = totalCOGS + gstAmount;

        // Unique Orders count
        const uniqueOrders = new Set(processedRows.map(r => r.orderId)).size;

        // Read Settings (mocked or from file)
        let settings = { automationEnabled: false, schedule: '0 9 */3 * *' };
        try {
            if (require('fs').existsSync('./settings.json')) {
                settings = require('../settings.json');
            }
        } catch (e) { }

        res.json({
            success: true,
            stats: {
                totalOrders: uniqueOrders,
                totalItems: processedRows.length,
                subtotal: totalCOGS,
                revenue: totalRevenue,
                gst: gstAmount,
                total: grandTotal
            },
            orders: processedRows,
            settings,
            rawCount: rawOrders.length
        });

    } catch (error) {
        console.error('[API] Error in /api/orders:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. Download CSV
app.post('/api/download', async (req, res) => {
    try {
        const { rows } = req.body;
        const gstRate = parseFloat(process.env.GST_RATE || 18);

        if (!rows || !Array.isArray(rows)) {
            return res.status(400).json({ error: 'Invalid data provided' });
        }

        // Save to History (Async)
        saveBatch({
            type: 'DOWNLOAD',
            count: rows.length,
            rows: rows
        });

        const csvContent = generateCSV(rows, gstRate);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
        res.send(csvContent);

    } catch (error) {
        console.error('[API] Error generating CSV:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// 3.1 Create SKU Endpoint
app.post('/api/create-sku', async (req, res) => {
    try {
        const { productId } = req.body;
        if (!productId) return res.status(400).json({ error: 'Product ID required' });

        const newSku = await require('./shopify').assignSkuToProduct(productId);
        res.json({ success: true, sku: newSku });
    } catch (error) {
        console.error('[API] SKU Creation Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- V2 workflow endpoints ---

const { sendApprovalEmail } = require('./email');
const { uploadToPortal } = require('./uploader');
const fs = require('fs');

// 4. V2 Status Check
app.get('/api/v2/status', (req, res) => {
    res.json({
        gmail: !!process.env.GMAIL_APP_PASSWORD,
        portal: !!(process.env.PORTAL_USERNAME && process.env.PORTAL_PASSWORD),
        lookback: process.env.DETAILS_LOOKBACK_DAYS || 3
    });
});

// 5. Send Email for Approval
app.post('/api/email-approval', async (req, res) => {
    try {
        const { rows } = req.body;
        const gstRate = parseFloat(process.env.GST_RATE || 18);
        const csvContent = generateCSV(rows, gstRate);
        const date = new Date();
        const filename = `FULFILLMENT-${date.getMonth() + 1}-${date.getDate()}.csv`;

        const sent = await sendApprovalEmail(csvContent, filename);

        if (sent) {
            res.json({ success: true, message: 'Email sent successfully' });
        } else {
            res.status(500).json({ success: false, error: 'Failed to send email' });
        }
    } catch (error) {
        console.error('[API] Email Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 6. Upload to Portal
app.post('/api/upload-portal', async (req, res) => {
    try {
        const { rows } = req.body;
        // Generate temporary file for Puppeteer to grab
        const gstRate = parseFloat(process.env.GST_RATE || 18);
        const csvContent = generateCSV(rows, gstRate);

        const tempPath = path.join(__dirname, '..', 'temp_upload.csv');
        fs.writeFileSync(tempPath, csvContent);

        await uploadToPortal(tempPath);

        // Cleanup
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

        res.json({ success: true, message: 'Upload complete' });
    } catch (error) {
        console.error('[API] Upload Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 7. History Endpoints
app.get('/api/history', (req, res) => {
    res.json(getHistory());
});

app.put('/api/history/:id', (req, res) => {
    const { rows } = req.body;
    const updated = updateBatch(req.params.id, rows);
    if (updated) {
        res.json({ success: true, batch: updated });
    } else {
        res.status(404).json({ error: 'Batch not found' });
    }
});

// 7. Catch-All for Frontend
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
    console.log(`\n📦 Fulfillment V2 API running on http://localhost:${PORT}`);
});
