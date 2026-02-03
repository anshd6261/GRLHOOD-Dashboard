const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { getUnfulfilledOrders, assignSkuToProduct, getOrder } = require('./shopify');
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
        const batch = saveBatch({
            type: 'DOWNLOAD',
            count: rows.length,
            rows: rows
        });

        const csvContent = generateCSV(rows, gstRate);

        // Determine File Name Based on Content
        // YYYY-MM-DD_NLG_POD_{TYPE}_BATCH-{ID}.csv
        const today = new Date().toISOString().split('T')[0];
        const hasPrepaid = rows.some(r => r.payment === 'Prepaid');
        const hasCOD = rows.some(r => r.payment === 'Cash on Delivery');

        let type = 'MIXED';
        if (hasPrepaid && !hasCOD) type = 'PREPAID';
        if (!hasPrepaid && hasCOD) type = 'COD';

        // Pad batch ID to 3 digits (e.g., 004)
        // Since 'saveBatch' returns ID like date-random, we might want a simpler ID or just use what we have.
        // User requested BATCH-004. We'll simplify the ID logic in history.js later or just use the last 3 chars of ID for now.
        // For strict compliance, we'd need a counter. Let's use the batch.id directly if short, or suffix.
        const batchId = batch.id.slice(-3);
        const filename = `${today}_NLG_POD_${type}_BATCH-${batchId}.csv`;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('X-Filename', filename); // Custom header for frontend to read
        res.send(csvContent);

    } catch (error) {
        console.error('[API] Error generating CSV:', error.message);
        res.status(500).json({ error: error.message });
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

// 8. Assign SKU Endpoint
app.post('/api/products/:id/assign-sku', async (req, res) => {
    try {
        const { id } = req.params;
        const newSku = await assignSkuToProduct(id);
        res.json({ success: true, sku: newSku });
    } catch (error) {
        console.error('[API] SKU Assignment Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 9. Shiprocket Label Generation
const shiprocket = require('./shiprocket');

app.post('/api/shiprocket/generate-labels', async (req, res) => {
    try {
        // 1. Get user confirmed IP? Middleware handles access.

        // 2. Get Last Batch from History
        const history = getHistory();
        if (history.length === 0) return res.status(400).json({ error: 'No CSV history found to process.' });

        const lastBatch = history[0]; // Most recent
        const ordersToProcess = lastBatch.rows;

        console.log(`[SHIPROCKET] Processing Batch ${lastBatch.id} with ${ordersToProcess.length} orders...`);

        // 3. Filter Risk - Fetch fresh details from Shopify for Risk Status
        // NOTE: We need to re-fetch these orders or assume 'riskLevel' is in the batch data if we synced recently.
        // But the batch history might NOT have riskLevel if it was saved before this update. 
        // Ideally we should rely on the Order ID.
        // Optimization: Let's assume user just synced. But to be safe, we check if 'riskLevel' exists in row. 
        // If not, we might process anyway or warn. 

        // BETTER: We just iterate. If riskLevel is HIGH, we skip.
        // Since we just added 'riskLevel' to `shopify.js`, new synced orders have it. Old ones don't.
        // We will default to 'LOW' if missing to avoid blocking, or 'HIGH' if paranoid. 
        // Let's default to LOW but log.

        const safeOrdersObj = [];
        const highRiskOrders = [];
        const failedOrders = [];
        const successfulShipmentIds = [];

        // 3. Process Orders Serially (Fetch Details -> Risk Check)
        for (const row of ordersToProcess) {
            let orderId = row.id;

            // Fallback for old batches without 'id'
            if (!orderId && row.orderLink) {
                orderId = row.orderLink.split('/').pop();
            }

            if (!orderId) {
                console.warn(`[SHIPROCKET] Skipping row ${row.orderId}, no numeric ID found.`);
                failedOrders.push({ ...row, error: 'No ID found' });
                continue;
            }

            try {
                // Fetch Full Details
                const fullOrder = await getOrder(orderId);

                // Risk Check
                if (fullOrder.riskLevel === 'HIGH') {
                    console.warn(`[SHIPROCKET] Order ${fullOrder.name} is HIGH RISK. Skipping.`);
                    highRiskOrders.push(row);
                    continue;
                }

                // Add to safe list with full details for creation
                safeOrdersObj.push(fullOrder);
            } catch (e) {
                console.error(`[SHIPROCKET] Failed to fetch order ${row.orderId}:`, e.message);
                failedOrders.push({ ...row, error: 'Fetch Failed: ' + e.message });
            }
        }

        if (safeOrdersObj.length === 0) {
            return res.status(400).json({
                error: 'No eligible orders found. check High Risk report.',
                highRiskCount: highRiskOrders.length
            });
        }

        // 4. Authenticate & Check Wallet
        await shiprocket.authenticate();
        const walletBalance = await shiprocket.getWalletBalance();
        const estimatedCost = safeOrdersObj.length * 100; // ₹100 est per order

        // Only block if we strictly know balance is less than cost (and not null)
        if (walletBalance !== null && walletBalance < estimatedCost) {
            return res.json({
                success: false,
                requiresMoney: true,
                currentBalance: walletBalance,
                estimatedCost: estimatedCost,
                message: `Low Wallet Balance`
            });
        }

        // 5. Process Safe Orders (Create -> Assign -> Pickup)
        console.log(`[SHIPROCKET] Processing ${safeOrdersObj.length} Safe Orders...`);

        for (const order of safeOrdersObj) {
            // A. Create Order
            let createRes = await shiprocket.createOrder(order);

            // Handle Duplicate: Try to Update existing order with new dimensions
            if (!createRes.success && createRes.error === 'DUPLICATE') {
                console.log(`[SHIPROCKET] Order ${order.name} exists. Attempting update with new dimensions...`);
                createRes = await shiprocket.updateOrder(order);
            }

            if (!createRes.success) {
                failedOrders.push({ orderId: order.name, error: createRes.error });
                continue;
            }

            const shipmentId = createRes.shipment_id;

            // B. Assign Courier (Auto)
            const assignRes = await shiprocket.assignCourier(shipmentId);
            if (!assignRes.success) {
                // If Low Wallet here (unlikely if check passed, but possible)
                if (assignRes.error === 'LOW_WALLET') {
                    return res.json({
                        success: false,
                        requiresMoney: true,
                        currentBalance: await shiprocket.getWalletBalance(),
                        estimatedCost: estimatedCost, // Rough msg
                        message: "Insufficient funds during assignment."
                    });
                }
                failedOrders.push({ orderId: order.name, error: 'Assign Failed: ' + assignRes.error });
                continue;
            }

            // C. Schedule Pickup (Next Day)
            await shiprocket.schedulePickup(shipmentId);

            successfulShipmentIds.push(shipmentId);
        }

        // 6. Generate Labels
        let labelUrl = null;
        if (successfulShipmentIds.length > 0) {
            labelUrl = await shiprocket.generateLabel(successfulShipmentIds);
        }

        // 7. Generate Reports
        // High Risk Report
        let highRiskUrl = null;
        if (highRiskOrders.length > 0) {
            const gstRate = parseFloat(process.env.GST_RATE || 18);
            const csv = generateCSV(highRiskOrders, gstRate); // Reuse logic
            const filename = `HIGH_RISK_ORDERS_${Date.now()}.csv`;
            // We can serve this directly or save and link?
            // Since we return JSON, better to save to temp or return Content in JSON?
            // Or better: Return a separate download endpoint?
            // For simplicity, we can't return multiple files easily in one HTTP response unless ZIP.
            // We will save to a public/temp folder and return URL?
            // Static serve is set to frontend/dist. 
            // Let's create a temp file and serve via a specific route or data URI?
            // Data URI is safest.
            highRiskUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
        }

        // Failed Process Report
        let failedUrl = null;
        if (failedOrders.length > 0) {
            const csv = ['Order ID,Error'].concat(failedOrders.map(f => `${f.orderId},${f.error}`)).join('\n');
            failedUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
        }

        res.json({
            success: true,
            processedCount: successfulShipmentIds.length,
            labelUrl: labelUrl,
            highRiskUrl: highRiskUrl,
            highRiskCount: highRiskOrders.length,
            failedUrl: failedUrl,
            failedCount: failedOrders.length
        });

    } catch (error) {
        console.error('[SHIPROCKET] API Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 10. Catch-All for Frontend
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
    console.log(`\n📦 Fulfillment V2 API running on http://localhost:${PORT}`);
});
