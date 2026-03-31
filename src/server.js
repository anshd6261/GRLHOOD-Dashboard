const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { getUnfulfilledOrders, searchOrders, assignSkuToProduct, getOrder } = require('./shopify');
const { processOrders } = require('./processor');
// RTO prediction now powered by Shiprocket Sense API (shiprocket_sense.js)
const rapidshyp = require('./rapidshyp');
const shiprocketSense = require('./shiprocket_sense');
const riskValidator = require('./riskValidator'); // Fixed Import
const { v4: uuidv4 } = require('uuid');
const { generateSupplierCSV, generateFinancialCSV, getFormattedDate, saveCSV } = require('./csv_generator');
const { generateExcel } = require('./excel');

// RTO risk now handled by Shiprocket Sense API (no local model needed)
const { getHistory, saveBatch, updateBatch } = require('./history');
const emailService = require('./email');
const { getAggregatedPandL, getDailyPandL, getCashPosition } = require('./calculations');
const { getAllAlerts } = require('./alerts');
const { syncPayUApi } = require('./sync_payu');
const { uploadOrderPayload } = require('./dropbox');
const analytics = require('./analytics');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve Static Frontend (Production)
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// 1. Status Check
app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        store: process.env.SHOPIFY_STORE_DOMAIN,
        connected: !!(process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET),
        shiprocketToken: !!(process.env.SHIPROCKET_TOKEN),
        shiprocketTokenLen: (process.env.SHIPROCKET_TOKEN || '').trim().length,
        rapidshypJwt: !!(process.env.RAPIDSHYP_JWT),
        senseKey: !!(process.env.SHIPROCKET_SENSE_API_KEY),
    });
});

// 1.1 Get server's outgoing IP (for API whitelisting)
app.get('/api/my-ip', async (req, res) => {
    try {
        const https = require('https');
        const ip = await new Promise((resolve, reject) => {
            https.get('https://api.ipify.org', (r) => {
                let d = ''; r.on('data', c => d += c); r.on('end', () => resolve(d));
            }).on('error', reject);
        });
        res.json({ ip });
    } catch (e) {
        res.json({ ip: 'unknown', error: e.message });
    }
});

// 1.5 Auth / Login Endpoint
app.post('/api/login', (req, res) => {
    let { username, password } = req.body;
    username = (username || '').trim();
    password = (password || '').trim();
    
    // Hardcoded credentials as per user request
    if (username === 'Anshd6261@' && password === 'Anshd62616@') {
        return res.json({ success: true, role: 'admin', token: 'mock-jwt-admin-token-7x9' });
    }
    
    if (username === 'nextbige101' && password === 'nextbige101') {
        return res.json({ success: true, role: 'supplier', token: 'mock-jwt-supplier-token-2a4' });
    }
    
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
});

// 2. Fetch & Process Orders
app.get('/api/orders', async (req, res) => {
    try {
        const daysLookback = parseInt(req.query.days || process.env.DETAILS_LOOKBACK_DAYS || 3);
        const startDate = req.query.startDate || null;
        const endDate = req.query.endDate || null;

        // Allow frontend to specify status ('unfulfilled' or 'all'). Default to 'all' for the new analytics home page.
        const statusMode = req.query.status || 'all';
        const gstRate = parseFloat(process.env.GST_RATE || 18);

        console.log(`[API] Fetching orders... Options:`, { daysLookback, startDate, endDate, statusMode });

        // Fetch from Shopify and RapidShyp concurrently (RapidShyp is non-blocking)
        const [rawOrders, rsRes] = await Promise.all([
            getUnfulfilledOrders(daysLookback, startDate, endDate, statusMode),
            rapidshyp.fetchOrdersWithRTO('ALL', 10).catch(e => {
                console.warn('[API] RapidShyp fetch failed (non-blocking):', e.message);
                return { success: false, data: [] };
            }),
        ]);

        // Build shipping data map from RapidShyp (AWB, status, IDs only)
        const rtoMap = {};
        if (rsRes.success && rsRes.data) {
            rsRes.data.forEach(rsOrder => {
                const sellerId = rsOrder.seller_order_id; // e.g., "#3419"
                const cleanId = rsOrder.channel_order_id; // e.g., "3419"
                if (sellerId || cleanId) {
                    const shippingEntry = {
                        rsOrderId: rsOrder.order_id,
                        rsStatus: rsOrder.order_status || "",
                        awb: rsOrder.awb_number || ""
                    };
                    if (sellerId) rtoMap[sellerId] = shippingEntry;
                    if (cleanId) {
                        rtoMap[cleanId] = shippingEntry;
                        rtoMap[`#${cleanId}`] = shippingEntry;
                    }
                }
            });
            console.log(`[API] Built shipping map with ${Object.keys(rtoMap).length} entries from RapidShyp.`);
        }

        // Fetch RTO risk from Shiprocket Sense API (non-blocking — dashboard loads even if Sense is slow)
        let senseRiskMap = {};
        try {
            senseRiskMap = await shiprocketSense.batchPredictRisk(rawOrders);
            console.log(`[API] Shiprocket Sense RTO risk loaded for ${Object.keys(senseRiskMap).length} orders.`);
        } catch (e) {
            console.warn('[API] Shiprocket Sense failed (non-blocking):', e.message);
        }

        // Process orders with shipping map + Sense RTO risk
        const processedRows = processOrders(rawOrders, gstRate, rtoMap, senseRiskMap);
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

// 2.5 Search ALL Orders
app.get('/api/orders/search', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query) return res.status(400).json({ success: false, error: 'Missing query' });

        console.log(`[API] Searching ALL orders for: ${query}`);
        const rawOrders = await searchOrders(query);

        // Fetch RTO info for these specific orders from RapidShyp & Shiprocket
        // (For a highly optimized V3 search, we'll try to get their specific RTO from RapidShyp if possible)
        // For now, we process them as safe to display in the UI quickly.
        const gstRate = parseFloat(process.env.GST_RATE || 18);
        let senseRiskMap = {};
        try {
            senseRiskMap = await shiprocketSense.batchPredictRisk(rawOrders);
        } catch (e) {
            console.warn('[API] Sense failed in search (non-blocking):', e.message);
        }
        const processedRows = processOrders(rawOrders, gstRate, {}, senseRiskMap);

        res.json({
            success: true,
            orders: processedRows
        });
    } catch (e) {
        console.error('[API] Error in /api/orders/search:', e.message);
        res.status(500).json({ success: false, error: e.message });
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

        // Save to History (Async) ONLY if not skipping (e.g. Save & Download)
        let batch = { id: '000' }; // Dummy ID if skipped
        if (!req.body.skipHistory) {
            batch = saveBatch({
                type: 'DOWNLOAD',
                count: rows.length,
                rows: rows
            });
        }

        let csvContent, filename;
        const datePrefix = getFormattedDate();
        const middleFix = req.body.isSelected ? ' Selected Order' : ' Order';

        if (req.body.type === 'financial') {
            csvContent = generateFinancialCSV(rows, gstRate);
            filename = `${datePrefix}${middleFix} - Financial Report.csv`;
        } else {
            csvContent = generateSupplierCSV(rows);
            filename = `${datePrefix}${middleFix}.csv`;
        }

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('X-Filename', filename); // Custom header for frontend to read
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Filename');
        res.send(csvContent);

    } catch (error) {
        console.error('[API] Error generating CSV:', error.message);
        console.error(error.stack);
        res.status(500).json({ error: error.message });
    }
});

// --- V2 workflow endpoints ---

const { sendApprovalEmail } = require('./email');
const { uploadToPortal } = require('./uploader');
// fs already required at top

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
        const csvContent = generateSupplierCSV(rows);
        const filename = `${getFormattedDate()} Order.csv`;

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

// 5.5 Direct Dropbox Upload
app.post('/api/dropbox/upload', async (req, res) => {
    try {
        const { orders } = req.body;
        if (!orders || !Array.isArray(orders)) return res.status(400).json({ success: false, error: 'Invalid orders provided.' });

        const standardCsvContent = generateSupplierCSV(orders);
        const financialCsvContent = generateFinancialCSV(orders, parseFloat(process.env.GST_RATE || 18));

        const { uploadOrderPayload } = require('./dropbox');
        const finalPath = await uploadOrderPayload(null, standardCsvContent, financialCsvContent);
        
        res.json({ success: true, dropboxPaths: finalPath });
    } catch (e) {
        console.error('[DROPBOX] Direct Upload Failed:', e.response?.data || e.message);
        const detail = e.response?.data?.error_description || e.response?.data?.error || e.message;
        res.status(500).json({ success: false, error: detail, hasRefresh: !!process.env.DROPBOX_REFRESH_TOKEN, hasKey: !!process.env.DROPBOX_APP_KEY, hasSecret: !!process.env.DROPBOX_APP_SECRET });
    }
});

// 6. Upload to Portal
app.post('/api/upload-portal', async (req, res) => {
    try {
        const { rows } = req.body;
        const csvContent = generateSupplierCSV(rows);

        const tempPath = process.env.VERCEL ? path.join('/tmp', 'temp_upload.csv') : path.join(__dirname, '..', 'temp_upload.csv');
        fs.writeFileSync(tempPath, csvContent);

        if (process.env.VERCEL) {
             console.log('[PORTAL] Bypassing Puppeteer on Vercel. Proceeding directly to Automation Engine.');
        } else {
             await uploadToPortal(tempPath);
        }

        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

        res.json({ success: true, message: 'Upload complete' });
    } catch (error) {
        console.error('[API] Upload Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 7. Cancel Order (Triple Sync: RapidShyp + Shiprocket + Shopify)
app.post('/api/orders/:id/cancel', async (req, res) => {
    try {
        const numericId = req.params.id; // e.g., 123456789 from Shopify
        const { orderName } = req.body; // e.g., #1005

        if (!numericId || !orderName) {
            return res.status(400).json({ error: 'Missing numeric ID or orderName' });
        }

        console.log(`[API] Processing Cancellation for Order ${orderName} (${numericId})...`);

        // 1. Cancel in RapidShyp
        let rsResult = { success: false, message: 'Skipped' };
        try {
            rsResult = await rapidshyp.cancelOrder(orderName);
        } catch (e) {
            console.warn(`[API] RapidShyp Cancel Warning:`, e.message);
            rsResult.message = e.message;
        }

        // 2. Cancel in Shopify
        const { cancelOrder: shopifyCancelOrder } = require('./shopify');
        await shopifyCancelOrder(numericId);

        console.log(`[API] Cancel Success: ${orderName}`);

        res.json({
            success: true,
            message: `Order ${orderName} cancelled successfully.`,
            rapidshyp: rsResult,
        });

    } catch (e) {
        console.error('[API] Cancellation Error:', e);
        res.status(500).json({ success: false, error: e.message || 'Failed to cancel order' });
    }
});

// 7.5 Generate Label (RapidShyp)
app.post('/api/rapidshyp/label', async (req, res) => {
    try {
        const { orderIds, awbs, shopifyOrderId } = req.body;

        let resolvedIds = [];

        // Priority 1: AWB tracking lookup (gives correct shipment_id format like S2603415750)
        if (awbs && Array.isArray(awbs) && awbs.length > 0) {
            console.log(`[API] Looking up shipment IDs from AWBs:`, awbs);
            for (const awb of awbs.filter(Boolean)) {
                const shipId = await rapidshyp.findOrderIdByAWB(awb);
                if (shipId) resolvedIds.push(shipId);
            }
        }

        // Priority 2: Direct order IDs (from rsOrderId — but these are MongoDB ObjectIds, may not work)
        if (resolvedIds.length === 0 && orderIds && Array.isArray(orderIds)) {
            resolvedIds = orderIds.filter(Boolean);
        }

        // Priority 3: Search by Shopify order ID via session API
        if (resolvedIds.length === 0 && shopifyOrderId) {
            console.log(`[API] Looking up RS order for Shopify #${shopifyOrderId}...`);
            const sessionHeaders = rapidshyp.getSessionHeaders();
            if (sessionHeaders) {
                try {
                    const searchRes = await require('axios').post(
                        'https://api.rapidshyp.com/session/orders/get_orders',
                        { search: shopifyOrderId.toString(), page: 1, limit: 5 },
                        { headers: sessionHeaders, timeout: 8000 }
                    );
                    const records = searchRes.data?.records || [];
                    const match = records.find(r =>
                        r.seller_order_id === `#${shopifyOrderId}` ||
                        r.seller_order_id === shopifyOrderId.toString()
                    );
                    if (match?.order_id) {
                        resolvedIds.push(match.order_id);
                        console.log(`[API] Found RS order ${match.order_id} for Shopify #${shopifyOrderId}`);
                    }
                } catch (searchErr) {
                    console.warn(`[API] Session search failed:`, searchErr.message);
                }
            }
        }

        if (resolvedIds.length === 0) {
            return res.status(400).json({ success: false, error: 'Order not found in RapidShyp. Assign a courier first.' });
        }

        console.log(`[API] Generating labels for RapidShyp IDs:`, resolvedIds);
        const result = await rapidshyp.generateLabel(resolvedIds);

        if (result.success) {
            res.json(result.data);
        } else {
            res.json({ success: false, error: result.message || 'Label generation failed' });
        }
    } catch (e) {
        console.error('[API] Label Gen Error:', e);
        res.json({ success: false, error: e.message });
    }
});

// ==========================================
// RAPIDSHYP FULFILLMENT ENDPOINTS
// ==========================================

// Bulk Assign AWB
app.post('/api/rapidshyp/bulk-assign', async (req, res) => {
    try {
        const { orderNames } = req.body;
        if (!orderNames || !Array.isArray(orderNames) || orderNames.length === 0) {
            return res.status(400).json({ error: 'Missing or invalid orderNames array' });
        }

        console.log(`[API] Bulk assigning AWB for ${orderNames.length} orders...`);
        const result = await rapidshyp.bulkAssignAWB(orderNames);
        res.json(result);
    } catch (e) {
        console.error('[API] Bulk Assign Error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Get Wallet Balance
app.get('/api/rapidshyp/wallet', async (req, res) => {
    try {
        const result = await rapidshyp.getWalletBalance();
        res.json(result);
    } catch (e) {
        console.error('[API] Wallet Error:', e);
        res.json({ success: false, balance: 0, error: e.message });
    }
});

// Bulk Generate Labels + Upload to Dropbox
app.post('/api/rapidshyp/bulk-labels-dropbox', async (req, res) => {
    try {
        const { orderIds, orders } = req.body;
        if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
            return res.status(400).json({ error: 'Missing or invalid orderIds array' });
        }

        console.log(`[API] Generating labels for ${orderIds.length} orders + Dropbox upload...`);

        // Generate labels
        const labelResult = await rapidshyp.bulkGenerateLabels(orderIds);
        if (!labelResult.success) {
            return res.status(500).json({ success: false, error: labelResult.message || 'Label generation failed' });
        }

        const labelUrl = labelResult.labelUrl;

        // Upload labels PDF to Dropbox if we have a URL
        let dropboxPath = null;
        if (labelUrl) {
            try {
                const { uploadOrderPayload } = require('./dropbox');
                dropboxPath = await uploadOrderPayload(labelUrl, null, null);
                console.log(`[API] Labels uploaded to Dropbox: ${dropboxPath}`);
            } catch (dbxErr) {
                console.warn('[API] Dropbox label upload failed (non-blocking):', dbxErr.message);
            }
        }

        res.json({
            success: true,
            labelUrl,
            labels: labelResult.labels,
            dropboxPath
        });
    } catch (e) {
        console.error('[API] Bulk Labels+Dropbox Error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// 8. History Endpoints
app.get('/api/history', (req, res) => {
    res.json(getHistory());
});

app.put('/api/history/:id', (req, res) => {
    const { rows } = req.body;
    const updated = updateBatch(req.params.id, rows);
    if (updated) {
        res.json({ success: true, batch: updated });
    } else {
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});


// ==========================================
// NEW FINANCIAL DASHBOARD ENDPOINTS
// ==========================================

// 1. Get Summary metrics (Today vs MTD)
app.get('/api/financials/summary', async (req, res) => {
    try {
        const todayStr = new Date().toISOString().split('T')[0];

        // MTD Dates
        const date = new Date();
        const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
        const firstDayStr = firstDay.toISOString().split('T')[0];

        const todayData = getDailyPandL(todayStr);
        const mtdData = getAggregatedPandL(firstDayStr, todayStr);
        const cashPos = getCashPosition();
        const alerts = getAllAlerts();

        res.json({
            today: todayData.metrics,
            mtd: mtdData.totals,
            cashPosition: cashPos,
            alerts: alerts
        });
    } catch (error) {
        console.error('[Financial Error]', error);
        // Return empty data instead of 500 (DB may be unavailable on Vercel)
        const empty = { orders: 0, revenue: 0, cogs: 0, shipping: 0, rto: 0, gatewayFees: 0, grossProfit: 0, adSpend: 0, otherExpenses: 0, netProfit: 0, roas: 0, blendedMargin: 0 };
        res.json({ today: empty, mtd: { ...empty, aov: 0 }, cashPosition: { netCash: 0, settledAmount: 0, totalCashOut: 0, pendingCod: 0, pendingPrepaid: 0, totalPending: 0, rtoRiskValue: 0 }, alerts: [] });
    }
});

// 2. Get full Daily Breakdown for a period
app.get('/api/financials/breakdown', async (req, res) => {
    try {
        const { start, end } = req.query;
        if (!start || !end) return res.status(400).json({ error: 'Missing start or end date' });

        const data = getAggregatedPandL(start, end);
        res.json(data);
    } catch (error) {
        console.error('[Financial Error]', error);
        res.status(500).json({ error: 'Failed to fetch breakdown' });
    }
});

// 3. Trigger manual PayU sync
app.post('/api/financials/sync-payu', async (req, res) => {
    try {
        const dateStr = req.body.date || new Date().toISOString().split('T')[0];
        const result = await syncPayUApi(dateStr);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Sync failed' });
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


// Helper to serve temp files
app.get('/api/download-file/:filename', (req, res) => {
    const filename = req.params.filename;
    // Security check: simple alphanumeric + underscore/dash/dot
    if (!/^[a-zA-Z0-9_\-\.]+$/.test(filename)) {
        return res.status(400).send('Invalid filename');
    }
    const filepath = process.env.VERCEL ? path.join('/tmp', filename) : path.join(__dirname, '..', filename);
    if (fs.existsSync(filepath)) {
        res.download(filepath);
    } else {
        res.status(404).send('File not found');
    }
});



// ==========================================
// ANALYTICS ENDPOINTS
// ==========================================

// Analytics Dashboard
app.get('/api/analytics/dashboard', async (req, res) => {
    try {
        const days = parseInt(req.query.days || 30);
        console.log(`[API] Generating analytics for last ${days} days...`);
        const data = await analytics.generateAnalytics(days);
        res.json({ success: true, data });
    } catch (e) {
        console.error('[API] Analytics Dashboard Error:', e.message);
        res.json({ success: true, data: { overview: { revenue: 0, netProfit: 0, netMargin: 0, orders: 0, rtoRate: 0, totalAdSpend: 0, aov: 0, cac: 0, roas: 0 }, costs: { cogs: 0, shipping: 0, adSpend: 0, rtoLoss: 0, total: 0 }, orders: [], breakdown_charts: { costDistribution: [] } } });
    }
});

// Ad Spend - Save Entry
app.post('/api/analytics/ad-spend', (req, res) => {
    try {
        const entry = req.body;
        if (!entry.date || !entry.amount) {
            return res.status(400).json({ success: false, error: 'Missing date or amount' });
        }
        const data = analytics.saveAdSpend(entry);
        res.json({ success: true, data });
    } catch (e) {
        console.error('[API] Ad Spend Save Error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Consultation Form Submit
app.post('/api/consultation/submit', (req, res) => {
    try {
        const formData = req.body;
        console.log('[API] Consultation form submitted');
        // Save to file for persistence
        const dataDir = path.join(__dirname, '..', 'data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        const filePath = path.join(dataDir, 'consultations.json');
        let existing = [];
        try { existing = JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch (e) { /* empty */ }
        existing.push({ ...formData, submittedAt: new Date().toISOString() });
        fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));
        res.json({ success: true, message: 'Consultation submitted successfully' });
    } catch (e) {
        console.error('[API] Consultation Submit Error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// 10. Catch-All for Frontend
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist', 'index.html'));
});

// Start Server
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`\n📦 Fulfillment V2 API running on http://localhost:${PORT}`);
    });
}

module.exports = app;
