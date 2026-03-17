const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { getUnfulfilledOrders, assignSkuToProduct, getOrder } = require('./shopify');
const { processOrders } = require('./processor');
const shiprocket = require('./shiprocket');
const rapidshyp = require('./rapidshyp');
const riskValidator = require('./riskValidator'); // Fixed Import
const { v4: uuidv4 } = require('uuid');
const { generateCSV } = require('./csv_generator');
const { generateExcel } = require('./excel');
const { getHistory, saveBatch, updateBatch } = require('./history');
const emailService = require('./email');
const { getAggregatedPandL, getDailyPandL, getCashPosition } = require('./calculations');
const { getAllAlerts } = require('./alerts');
const { syncPayUApi } = require('./sync_payu');
const { uploadOrderPayload } = require('./dropbox');

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
        connected: !!(process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET)
    });
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

        // Fetch from Shopify and RapidShyp concurrently
        const [rawOrders, rsRes] = await Promise.all([
            getUnfulfilledOrders(daysLookback, startDate, endDate, statusMode),
            rapidshyp.fetchOrdersWithRTO('ALL', 10) // Fetch all orders with RTO risk data
        ]);

        // Build RTO Map from RapidShyp data (keyed by seller_order_id which is #3419 format)
        const rtoMap = {};
        if (rsRes.success && rsRes.data) {
            rsRes.data.forEach(rsOrder => {
                const sellerId = rsOrder.seller_order_id; // e.g., "#3419"
                const cleanId = rsOrder.channel_order_id; // e.g., "3419"
                if (sellerId || cleanId) {
                    const rtoEntry = {
                        risk: rsOrder.rto_prediction || "Unknown",
                        reason: rsOrder.rto_reason || "",
                        shiprocketId: rsOrder.order_id // RS MongoDB ID for linking
                    };
                    if (sellerId) rtoMap[sellerId] = rtoEntry;
                    if (cleanId) {
                        rtoMap[cleanId] = rtoEntry;
                        rtoMap[`#${cleanId}`] = rtoEntry;
                    }
                }
            });
            console.log(`[API] Built RTO map with ${Object.keys(rtoMap).length} entries from RapidShyp.`);
        }

        // Process orders with the RTO map
        const processedRows = processOrders(rawOrders, gstRate, rtoMap);
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

        // Save to History (Async) ONLY if not skipping (e.g. Save & Download)
        let batch = { id: '000' }; // Dummy ID if skipped
        if (!req.body.skipHistory) {
            batch = saveBatch({
                type: 'DOWNLOAD',
                count: rows.length,
                rows: rows
            });
        }

        const csvContent = generateCSV(rows, gstRate);

        // Determine File Name Based on Content
        const today = new Date().toISOString().split('T')[0];
        const hasPrepaid = rows.some(r => r.payment === 'Prepaid');
        const hasCOD = rows.some(r => r.payment === 'Cash on Delivery');

        let type = 'MIXED';
        if (hasPrepaid && !hasCOD) type = 'PREPAID';
        if (!hasPrepaid && hasCOD) type = 'COD';

        const batchId = batch.id.slice(-3);
        const filename = `${today}_NLG_POD_${type}_BATCH-${batchId}.csv`;

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

// 5.5 Direct Dropbox Upload
app.post('/api/dropbox/upload', async (req, res) => {
    try {
        const { orders } = req.body;
        if (!orders || !Array.isArray(orders)) return res.status(400).json({ success: false, error: 'Invalid orders provided.' });

        const standardCsvContent = generateCSV(orders, parseFloat(process.env.GST_RATE || 18));
            
        const reqHeaders = ['Order ID', 'Customer Name', 'City', 'State', 'Product', 'Model', 'Payment Type', 'Total Revenue', 'COGS BASE', 'GST (18%)', 'Total Outflow'];
        const rows = orders.map(o => [
            o.orderId,
            `"${o.customerName || ''}"`,
            `"${o.city || ''}"`,
            `"${o.state || ''}"`,
            `"${o.productName || ''}"`,
            `"${o.model || ''}"`,
            o.payment,
            o.total || 0,
            o.cogs || 0,
            o.gst || 0,
            (o.cogs || 0) + (o.gst || 0)
        ]);
        const financialCsvContent = [reqHeaders.join(','), ...rows.map(r => r.join(','))].join('\n');

        const { uploadOrderPayload } = require('./dropbox');
        const finalPath = await uploadOrderPayload(null, standardCsvContent, financialCsvContent);
        
        res.json({ success: true, dropboxPaths: finalPath });
    } catch (e) {
        console.error('[DROPBOX] Direct Upload Failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// 6. Upload to Portal
app.post('/api/upload-portal', async (req, res) => {
    try {
        const { rows } = req.body;
        const gstRate = parseFloat(process.env.GST_RATE || 18);
        const csvContent = generateCSV(rows, gstRate);

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

        console.log(`[API] Processing Triple Cancellation for Order ${orderName} (${numericId})...`);

        // 1. Cancel in RapidShyp first
        let rsResult = { success: false, message: 'Skipped' };
        try {
            rsResult = await rapidshyp.cancelOrder(orderName);
        } catch (e) {
            console.warn(`[API] RapidShyp Cancel Warning:`, e.message);
            rsResult.message = e.message;
        }

        // 2. Cancel in Shiprocket
        let srResult = { success: false, message: 'Skipped' };
        try {
            srResult = await shiprocket.cancelOrderByChannelId(orderName);
        } catch (e) {
            console.warn(`[API] Shiprocket Cancel Warning:`, e.message);
            srResult.message = e.message;
        }

        // 3. Cancel in Shopify
        await shopify.cancelOrder(numericId);

        console.log(`[API] Triple Cancel Success: ${orderName}`);

        res.json({
            success: true,
            message: `Order ${orderName} cancelled successfully on all platforms.`,
            rapidshyp: rsResult,
            shiprocket: srResult
        });

    } catch (e) {
        console.error('[API] Cancellation Error:', e);
        res.status(500).json({ success: false, error: e.message || 'Failed to cancel order' });
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
// SHIPROCKET STATS ENDPOINT (COD & RTO Tracking)
// ==========================================
app.get('/api/shiprocket/stats', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Missing start or end date' });

        const rs = await shiprocket.fetchOrdersByDate(startDate, endDate);
        if (!rs.success) {
            return res.status(500).json({ error: 'Failed to fetch tracking stats.' });
        }

        const orders = rs.data || [];

        let totalOrders = orders.length;
        let rtoOrdersCount = 0;
        let rtoLossValue = 0;
        let rtoProductsCount = 0;
        let pendingCodValue = 0;
        let pendingCodCount = 0;
        let collectedCodValue = 0;
        let collectedCodCount = 0;
        let validOrdersCount = 0;

        const RTO_CODES = [12, 13, 14, 15, 16, 55]; // RTO statuses
        const CANCELED_CODES = [5];
        const DELIVERED_CODES = [7];

        orders.forEach(o => {
            const status = parseInt(o.status_code);
            const total = parseFloat(o.total) || 0;
            const pm = (o.payment_method || '').toLowerCase();
            const isRTO = RTO_CODES.includes(status);
            const isCanceled = CANCELED_CODES.includes(status);
            const isDelivered = DELIVERED_CODES.includes(status);

            if (!isCanceled) validOrdersCount++;

            // RTO Tracking
            if (isRTO) {
                rtoOrdersCount++;
                rtoLossValue += total;
                if (o.products && Array.isArray(o.products)) {
                    rtoProductsCount += o.products.reduce((acc, p) => acc + (parseInt(p.quantity) || 1), 0);
                }
            }

            // Expected COD Pipeline (Active, COD, Not RTO, Not Canceled, Not Delivered)
            // It could be NEW (1), READY TO SHIP (3), IN TRANSIT (20), OUT FOR DELIVERY (19), UNDELIVERED (36) etc.
            if (pm === 'cod') {
                if (isDelivered) {
                    collectedCodValue += total;
                    collectedCodCount++;
                } else if (!isRTO && !isCanceled) {
                    pendingCodValue += total;
                    pendingCodCount++;
                }
            }
        });

        const rtoPercentage = validOrdersCount > 0 ? ((rtoOrdersCount / validOrdersCount) * 100).toFixed(1) : 0;

        res.json({
            success: true,
            rtoStats: {
                percentage: parseFloat(rtoPercentage),
                lossValue: rtoLossValue,
                ordersCount: rtoOrdersCount,
                itemsCount: rtoProductsCount
            },
            codStats: {
                pendingValue: pendingCodValue,
                pendingCount: pendingCodCount,
                collectedValue: collectedCodValue,
                collectedCount: collectedCodCount
            }
        });
    } catch (e) {
        console.error('[API] Shiprocket Stats Error:', e);
        res.status(500).json({ error: e.message });
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
        res.status(500).json({ error: 'Failed to fetch financial summary' });
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

// 9. Shiprocket Label Generation - ASYNC JOB SYSTEM
const jobQueue = {}; // In-memory Job Store

app.post('/api/shiprocket/generate-labels', async (req, res) => {
    try {
        const jobId = 'JOB-' + Date.now();
        // Return Immediately
        res.json({ success: true, jobId, message: 'Processing started in background' });

        // Start processing background
        processLabelGenerationJob(jobId);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/shiprocket/job/:id', (req, res) => {
    const job = jobQueue[req.params.id];
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
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

async function processLabelGenerationJob(jobId) {
    jobQueue[jobId] = { status: 'STARTING', logs: [] };

    try {
        const history = getHistory();
        if (history.length === 0) {
            jobQueue[jobId] = { status: 'FAILED', error: 'No CSV history found.' };
            return;
        }

        const lastBatch = history[0]; // Most recent
        const ordersToProcess = lastBatch.rows;

        console.log(`[JOB ${jobId}] Processing Batch ${lastBatch.id} with ${ordersToProcess.length} orders...`);

        jobQueue[jobId].status = 'FETCHING_DETAILS';
        jobQueue[jobId].totalInfo = ordersToProcess.length;

        let safeOrders = []; // Full Shopify Objects
        const highRiskOrders = []; // Rows + Data
        const failedOrders = [];

        // 1. Wallet Check (Check BEFORE Fetching Info)
        jobQueue[jobId].status = 'CHECKING_WALLET';

        // Count UNIQUE Orders (not CSV rows/line items)
        const uniqueOrderIds = new Set();
        ordersToProcess.forEach(row => {
            let orderId = row.id || row.orderId;
            if (orderId && orderId.includes('/')) orderId = orderId.split('/').pop();
            if (orderId) uniqueOrderIds.add(orderId);
        });
        const uniqueOrderCount = uniqueOrderIds.size;

        console.log(`[WALLET] Processing ${ordersToProcess.length} line items for ${uniqueOrderCount} unique orders`);

        // Calculate Average Shipping Cost from History
        let avgShippingCost = 95; // Default fallback
        try {
            const historyPath = path.join(__dirname, '..', 'data', 'history.json');
            if (fs.existsSync(historyPath)) {
                const historyData = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
                const allShippingCosts = [];

                historyData.forEach(batch => {
                    if (batch.rows && Array.isArray(batch.rows)) {
                        batch.rows.forEach(row => {
                            if (row.shippingCost && !isNaN(parseFloat(row.shippingCost))) {
                                allShippingCosts.push(parseFloat(row.shippingCost));
                            }
                        });
                    }
                });

                if (allShippingCosts.length > 0) {
                    avgShippingCost = Math.ceil(allShippingCosts.reduce((a, b) => a + b, 0) / allShippingCosts.length);
                    console.log(`[WALLET] Calculated average shipping cost: ₹${avgShippingCost} (from ${allShippingCosts.length} samples)`);
                }
            }
        } catch (e) {
            console.warn('[WALLET] Could not calculate average shipping cost:', e.message);
        }

        // Add safety margin (10%)
        const EST_COST_PER_ORDER = Math.ceil(avgShippingCost * 1.1);
        const totalEstimatedCost = uniqueOrderCount * EST_COST_PER_ORDER;

        await shiprocket.authenticate();
        const walletBalance = await shiprocket.getWalletBalance();

        if (walletBalance !== null && walletBalance < totalEstimatedCost) {
            const shortfall = Math.ceil(totalEstimatedCost - walletBalance);
            console.warn(`[WALLET] Insufficient Funds. Need ~₹${totalEstimatedCost}, Have ₹${walletBalance}, Shortfall: ₹${shortfall}`);
            jobQueue[jobId] = {
                status: 'REQUIRES_MONEY',
                estimatedCost: totalEstimatedCost,
                currentBalance: walletBalance,
                shortfall: shortfall,
                orderCount: uniqueOrderCount,
                lineItemCount: ordersToProcess.length,
                avgCostPerOrder: EST_COST_PER_ORDER
            };
            return;
        }

        // 2. Fetch & Filter Risk
        jobQueue[jobId].status = 'FETCHING_DETAILS';
        let processedCount = 0;

        for (const row of ordersToProcess) {
            processedCount++;
            if (processedCount % 5 === 0) jobQueue[jobId].progress = `Reviewing Order ${processedCount}/${ordersToProcess.length}`;

            let orderId = row.id || row.orderId;
            // Clean up if it's a URL or GID
            if (orderId && orderId.includes('/')) orderId = orderId.split('/').pop();

            if (!orderId) {
                failedOrders.push({ ...row, error: 'No ID found' });
                continue;
            }

            try {
                // Fetch full details to check risk
                const fullOrder = await getOrder(orderId);

                if (fullOrder.riskLevel === 'HIGH') {
                    console.log(`[RISK] Order ${orderId} is HIGH RISK. Skipping.`);
                    highRiskOrders.push({ ...row, riskLevel: 'HIGH', riskAnalysis: 'Shopify marked HIGH' });
                    continue;
                }

                safeOrders.push(fullOrder); // Use full object for further processing if needed
            } catch (e) {
                failedOrders.push({ ...row, error: 'Fetch Failed: ' + e.message });
            }
        }

        // --- V8: RISK VALIDATION ---
        console.log(`[JOB ${jobId}] Validating ${safeOrders.length} potential orders...`);
        const validatedSafeOrders = [];

        // 1. Check Address & Phone
        for (const order of safeOrders) {
            const addrVal = riskValidator.validateAddress(order);
            if (!addrVal.valid) {
                console.log(`⚠️ Risk Check Failed (Address): ${order.name} - ${addrVal.reason}`);
                highRiskOrders.push({
                    'Order ID': order.name,
                    'Customer': order.shippingAddress?.name || "Unknown",
                    'Risk': 'HIGH (Validator)',
                    'Reason': addrVal.reason
                });
                continue;
            }

            const phoneVal = riskValidator.validatePhone(order.phone || order.shippingAddress?.phone);
            if (!phoneVal.valid) {
                console.log(`⚠️ Risk Check Failed (Phone): ${order.name} - ${phoneVal.reason}`);
                highRiskOrders.push({
                    'Order ID': order.name,
                    'Customer': order.shippingAddress?.name || "Unknown",
                    'Risk': 'HIGH (Validator)',
                    'Reason': phoneVal.reason
                });
                continue;
            }
            validatedSafeOrders.push(order);
        }

        // 2. Check Duplicates (Same Address, Diff Name)
        const duplicateMap = riskValidator.findDuplicates(validatedSafeOrders);
        const finalSafeOrders = [];

        for (const order of validatedSafeOrders) {
            if (duplicateMap.has(order.id)) {
                const reason = duplicateMap.get(order.id);
                console.log(`⚠️ Risk Check Failed (Duplicate): ${order.name}`);
                highRiskOrders.push({
                    'Order ID': order.name,
                    'Customer': order.shippingAddress?.name || "Unknown",
                    'Risk': 'HIGH (Duplicate)',
                    'Reason': reason
                });
            } else {
                finalSafeOrders.push(order);
            }
        }

        safeOrders = finalSafeOrders; // Update main list
        console.log(`[JOB ${jobId}] Validation Complete. Safe Orders: ${safeOrders.length}`);


        if (safeOrders.length === 0) {
            // Generate High Risk Report if needed
            let highRiskUrl = null;
            if (highRiskOrders.length > 0) {
                // Use Dynamic CSV for Risk Report
                const { generateDynamicCSV } = require('./csv');
                const csv = generateDynamicCSV(highRiskOrders);
                const p = process.env.VERCEL ? path.join('/tmp', `HIGH_RISK_${jobId}.csv`) : path.join(__dirname, '..', `HIGH_RISK_${jobId}.csv`);

                // Ensure unique name or overwrite?
                // Using jobId makes it unique per run
                fs.writeFileSync(p, csv);
                highRiskUrl = `/api/download-file/HIGH_RISK_${jobId}.csv`;
            }

            jobQueue[jobId] = {
                status: 'COMPLETED',
                labelUrl: null,
                highRiskUrl,
                highRiskUrl,
                message: 'No safe orders to process.',
                highRiskCount: highRiskOrders.length
            };

            if (failedOrders.length > 0) {
                console.log('[DEBUG] Failed Orders:', JSON.stringify(failedOrders, null, 2));
            }
            return;
        }

        // 3. Process Safe Orders (Find -> Assign -> Label)
        jobQueue[jobId].status = 'PROCESSING_SHIPROCKET';

        const validShipmentIds = [];
        const shipmentToOrderMap = {}; // To trace back failed IDs

        let procWithSR = 0;
        console.log(`[JOB ${jobId}] Starting Shiprocket ID Lookup for ${safeOrders.length} orders...`);

        // A. Bulk Identify
        for (const order of safeOrders) {
            procWithSR++;
            if (procWithSR % 5 === 0) jobQueue[jobId].progress = `Identifying Orders ${procWithSR}/${safeOrders.length}`;

            // FIX: Shiprocket stores 'channel_order_id' as the Order Name (e.g. "1573"), not the GID.
            // We search by Name.
            const searchKey = order.name.replace('#', '');

            try {
                let search = await shiprocket.findOrderByShopifyId(searchKey);

                // Fallback: Try with Hash if undefined (just in case)
                if (!search.found) {
                    search = await shiprocket.findOrderByShopifyId(order.name);
                }

                // Fallback 2: Try with Shopify Long ID (GID or numeric)
                if (!search.found && order.id) {
                    // order.id might be "gid://..." or "630..."
                    const numericId = order.id.split('/').pop();
                    search = await shiprocket.findOrderByShopifyId(numericId);
                }

                if (search.found) {
                    let finalShipmentId = search.shipment_id;

                    // FIX v2: Use Replacement Order Strategy (Force Dimensions)
                    // "Address Update" ignores dims, so we MUST create a Replacement Order to get a valid shipment.
                    try {
                        console.log(`[SR] Attempting Replacement Order Creation for ${order.name}...`);
                        const repRes = await shiprocket.ensureReplacementOrder(order);
                        if (repRes && repRes.shipment_id) {
                            finalShipmentId = repRes.shipment_id;
                            // Note: We use the *Replacement* Shipment ID for label generation
                        }
                    } catch (updErr) {
                        console.warn(`[SR] Replacement Order Logic Failed for ${order.name}:`, updErr.message);
                    }

                    if (finalShipmentId) {
                        validShipmentIds.push({
                            shipmentId: finalShipmentId,
                            orderId: search.order_id,
                            shopifyOrder: order
                        });
                        shipmentToOrderMap[finalShipmentId] = order.name;
                    } else {
                        console.warn(`[SR] Order ${order.name} found but NO Shipment ID available.`);
                        failedOrders.push({ orderId: order.name, error: 'Shipment Creation Failed' });
                    }
                } else {
                    console.warn(`[SR] Order ${order.name} not found in Shiprocket.`);
                    failedOrders.push({ orderId: order.name, error: 'Not found in Shiprocket (Sync Issue)' });
                }
            } catch (e) {
                failedOrders.push({ orderId: order.name, error: 'Lookup Failed: ' + e.message });
            }
        }

        if (validShipmentIds.length === 0) {
            jobQueue[jobId].status = 'COMPLETED';
            jobQueue[jobId].message = 'No valid Shiprocket orders found.';
            jobQueue[jobId].failedCount = failedOrders.length;
            return;
        }

        // B. Bulk Assign Couriers
        jobQueue[jobId].progress = `Bulk Assigning Couriers for ${validShipmentIds.length} shipments...`;
        console.log(`[JOB ${jobId}] Bulk Assigning ${validShipmentIds.length} shipments...`);

        const assignmentRes = await shiprocket.bulkAssignCouriers(validShipmentIds);

        // Track Failures
        assignmentRes.failed.forEach(f => {
            const oid = shipmentToOrderMap[f.id] || f.id;
            failedOrders.push({ orderId: oid, error: 'Assign Failed: ' + f.error });
        });

        const readyToShipIds = assignmentRes.successful;

        // C. Bulk Generate Label
        let finalLabelUrl = null;

        if (readyToShipIds.length > 0) {
            jobQueue[jobId].progress = `Generating Bulk Label for ${readyToShipIds.length} shipments...`;
            console.log(`[JOB ${jobId}] Generating Bulk Label for ${readyToShipIds.length} assignments...`);

            const labelRes = await shiprocket.bulkGenerateLabel(readyToShipIds);

            if (labelRes.success) {
                finalLabelUrl = labelRes.url;
            } else {
                // If bulk label fails, mark all as failed? Or just generic error?
                console.error(`[JOB ${jobId}] Bulk Label Failed: ${labelRes.error}`);
                // Add a generic error to the job?
                readyToShipIds.forEach(sid => {
                    const oid = shipmentToOrderMap[sid] || sid;
                    failedOrders.push({ orderId: oid, error: 'Label Gen Failed: ' + labelRes.error });
                });
            }
        } else {
            console.warn(`[JOB ${jobId}] No orders were successfully assigned.`);
        }

        // 4. Finalize
        jobQueue[jobId].status = 'COMPLETED';
        const fs = require('fs'); // Ensure requires are available if not global

        // Generate High Risk Report if exists
        let highRiskUrl = null;
        if (highRiskOrders.length > 0) {
            const csv = generateCSV(highRiskOrders, 18);
            const p = process.env.VERCEL ? path.join('/tmp', `HIGH_RISK_${jobId}.csv`) : path.join(__dirname, '..', `HIGH_RISK_${jobId}.csv`);
            fs.writeFileSync(p, csv);
            highRiskUrl = `/api/download-file/HIGH_RISK_${jobId}.csv`;
        }

        jobQueue[jobId].labelUrl = finalLabelUrl;
        jobQueue[jobId].highRiskUrl = highRiskUrl;
        jobQueue[jobId].failedCount = failedOrders.length;
        jobQueue[jobId].successCount = finalLabelUrl ? readyToShipIds.length : 0;

    } catch (e) {
        console.error(`[JOB ${jobId}] Critical Error:`, e);
        jobQueue[jobId] = { status: 'FAILED', error: e.message };
    }
}


// 9.5 RapidShyp/Shiprocket Direct Bulk Workflows
app.post('/api/rapidshyp/bulk-assign', async (req, res) => {
    try {
        const { orderIds } = req.body;
        if (!orderIds || !Array.isArray(orderIds)) return res.status(400).json({ success: false, error: 'Invalid orderIds provided.' });

        await shiprocket.authenticate();

        const validShipmentIds = [];
        const failedOrders = [];
        
        console.log(`[BULK-ASSIGN] Searching Shiprocket for ${orderIds.length} orders...`);
        for (let orderNum of orderIds) {
            let cleanId = orderNum.toString().replace('#', '');
            try {
                const search = await shiprocket.findOrderByShopifyId(cleanId);
                if (search.found && search.shipment_id) {
                    validShipmentIds.push({ shipmentId: search.shipment_id, orderId: orderNum });
                } else {
                    failedOrders.push(orderNum);
                }
            } catch (e) {
                failedOrders.push(orderNum);
            }
        }
        
        if (validShipmentIds.length === 0) {
            return res.json({ success: false, error: 'No matched orders found in Shiprocket to assign.' });
        }

        const assignmentRes = await shiprocket.bulkAssignCouriers(validShipmentIds);
        res.json({ success: true, successful: assignmentRes.successful, failed: assignmentRes.failed, notFound: failedOrders });
    } catch (e) {
        console.error('[BULK-ASSIGN] Failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/rapidshyp/bulk-labels-dropbox', async (req, res) => {
    try {
        const { orderIds, orders } = req.body; 
        if (!orderIds || !Array.isArray(orderIds)) return res.status(400).json({ success: false, error: 'Invalid orderIds provided.' });

        await shiprocket.authenticate();

        const validShipmentIds = [];
        for (let orderNum of orderIds) {
            let cleanId = orderNum.toString().replace('#', '');
            try {
                const search = await shiprocket.findOrderByShopifyId(cleanId);
                if (search.found && search.shipment_id) {
                    validShipmentIds.push(search.shipment_id);
                }
            } catch (e) {}
        }

        if (validShipmentIds.length === 0) return res.json({ success: false, error: 'No successful shipments found for labels.' });

        console.log(`[BULK-LABELS] Generating labels for ${validShipmentIds.length} shipments...`);
        const labelRes = await shiprocket.bulkGenerateLabel(validShipmentIds);
        
        if (!labelRes.success) return res.json({ success: false, error: labelRes.error });

        // Generate CSVPayloads for Dropbox
        let standardCsvContent = null;
        let financialCsvContent = null;
        if (orders && orders.length > 0) {
            standardCsvContent = generateCSV(orders, parseFloat(process.env.GST_RATE || 18));
            
            const reqHeaders = ['Order ID', 'Customer Name', 'City', 'State', 'Product', 'Model', 'Payment Type', 'Total Revenue', 'COGS BASE', 'GST (18%)', 'Total Outflow'];
            const rows = orders.map(o => [
                o.orderId,
                `"${o.customerName || ''}"`,
                `"${o.city || ''}"`,
                `"${o.state || ''}"`,
                `"${o.productName || ''}"`,
                `"${o.model || ''}"`,
                o.payment,
                o.total || 0,
                o.cogs || 0,
                o.gst || 0,
                (o.cogs || 0) + (o.gst || 0)
            ]);
            financialCsvContent = [reqHeaders.join(','), ...rows.map(r => r.join(','))].join('\n');
        }

        console.log(`[DROPBOX] Pending PDF upload for Label URL: ${labelRes.url}`);
        let finalPath = '';
        try {
            finalPath = await uploadOrderPayload(labelRes.url, standardCsvContent, financialCsvContent);
        } catch (dbError) {
            console.error('[API] Dropbox Upload Failed:', dbError.message);
            // Don't fail the whole request just because Dropbox failed, still return the URL
            finalPath = 'Dropbox Upload Failed';
        }
        
        res.json({ success: true, url: labelRes.url, dropboxPaths: finalPath });
    } catch (e) {
        console.error('[BULK-LABELS] Failed:', e);
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
