const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
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
const verification = require('./verification');
const { getAllAlerts } = require('./alerts');
const { syncPayUApi } = require('./sync_payu');
const { uploadOrderPayload } = require('./dropbox');
const analytics = require('./analytics');
const seo = require('./seo');

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
        rapidshypJwt: !!(process.env.RAPIDSHYP_JWT),
        senseKey: !!(process.env.SHIPROCKET_SENSE_API_KEY),
        senseSecret: !!(process.env.SHIPROCKET_SENSE_API_SECRET),
        bingWebmaster: !!(process.env.BING_WEBMASTER_API_KEY),
        ga4MeasurementId: process.env.GA4_MEASUREMENT_ID || null,
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
    if (username === 'Anshd6261' && password === 'Anshd6261') {
        return res.json({ success: true, role: 'admin', token: 'mock-jwt-admin-token-7x9' });
    }
    
    if (username === 'nextbige101' && password === 'nextbige101') {
        return res.json({ success: true, role: 'supplier', token: 'mock-jwt-supplier-token-2a4' });
    }
    
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
});

// 2. Fetch & Process Orders
// Support both GET (backward compat) and POST (with inline cache for Vercel serverless)
app.get('/api/orders', handleOrders);
app.post('/api/orders', handleOrders);

async function handleOrders(req, res) {
    try {
        const query = req.query || {};
        const body = req.body || {};
        const daysLookback = parseInt(query.days || process.env.DETAILS_LOOKBACK_DAYS || 3);
        const startDate = query.startDate || null;
        const endDate = query.endDate || null;
        const statusMode = query.status || 'all';
        const gstRate = parseFloat(process.env.GST_RATE || 18);

        // Warm RTO cache inline (same instance — solves Vercel serverless isolation)
        if (body.rtoCache && typeof body.rtoCache === 'object') {
            const normalized = {};
            for (const [k, v] of Object.entries(body.rtoCache)) {
                normalized[k.startsWith('#') ? k : `#${k}`] = v;
                normalized[k] = v;
            }
            const warmResult = shiprocketSense.warmCache(normalized);
            console.log(`[API] Inline cache warm: ${warmResult.added} added, ${warmResult.total} total`);
        }
        // Mark checked IDs from frontend (prevents double-billing on cold starts)
        if (Array.isArray(body.rtoCheckedIds) && body.rtoCheckedIds.length > 0) {
            shiprocketSense.markChecked(body.rtoCheckedIds);
        }

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

        // RTO risk: try quick cache lookup only (don't block order loading with Sense API calls)
        // Full Sense API calls happen via separate /api/rto-check endpoint
        let senseRiskMap = {};
        try {
            senseRiskMap = await shiprocketSense.getCachedResults(rawOrders);
        } catch (e) {
            console.warn('[API] Sense cache lookup failed (non-blocking):', e.message);
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
}

// 2.3 RTO Risk Check — Dedicated endpoint for Sense API (gets full 10s budget)
// Frontend calls this after loading orders to enrich them with RTO data
app.post('/api/rto-check', async (req, res) => {
    try {
        const { orders } = req.body; // Array of order objects from frontend
        if (!orders || !Array.isArray(orders) || orders.length === 0) {
            return res.status(400).json({ success: false, error: 'Missing orders array' });
        }

        console.log(`[API] RTO check requested for ${orders.length} orders.`);

        // Convert frontend order format to Shopify-like format for Sense
        const shopifyLikeOrders = orders.map(o => ({
            name: `#${o.orderId}`,
            id: o.orderId,
            displayFulfillmentStatus: o.fulfillmentStatus || 'UNFULFILLED',
            displayFinancialStatus: o.payment === 'Cash on Delivery' ? 'PENDING' : 'PAID',
            paymentGatewayNames: o.payment === 'Cash on Delivery' ? ['Cash on Delivery'] : ['Prepaid'],
            shippingAddress: o.shippingDetails ? {
                phone: o.shippingDetails.phone || '',
                address1: o.shippingDetails.address1 || '',
                city: o.shippingDetails.city || '',
                zip: o.shippingDetails.zip || '',
                province: o.shippingDetails.state || '',
            } : {},
            email: '',
            customer: { numberOfOrders: o.customerOrdersCount || 1 },
            lineItems: { edges: [{ node: { title: 'Product', quantity: 1, originalUnitPrice: o.price || 0 } }] },
        }));

        const riskMap = await shiprocketSense.batchPredictRisk(shopifyLikeOrders);

        // Transform to frontend-friendly format
        const results = {};
        for (const [orderId, result] of Object.entries(riskMap)) {
            const cleanId = orderId.replace('#', '');
            const risk = (result.risk || '').toLowerCase();
            results[cleanId] = {
                aiRiskScore: calculateRtoScore(result),
                aiRiskLevel: risk === 'high' || risk === 'very high' ? 'High' : risk === 'low' ? 'Low' : risk === 'medium' ? 'Medium' : 'Unknown',
                aiRiskReasons: [
                    ...(result.reasons || []),
                    ...(result.riskTags || []).map(t => t.reason),
                ].filter(Boolean),
            };
        }

        const checked = Object.values(results).filter(r => r.aiRiskLevel !== 'Unknown').length;
        console.log(`[API] RTO check done: ${checked}/${orders.length} with risk data.`);
        res.json({ success: true, results });
    } catch (e) {
        console.error('[API] RTO check error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Warm server RTO cache from frontend localStorage (survives cold starts)
app.post('/api/rto-cache/warm', (req, res) => {
    try {
        const { cache, checkedIds } = req.body;
        if (!cache || typeof cache !== 'object') {
            return res.json({ success: true, added: 0, total: 0 });
        }
        // Normalize keys: frontend sends "3419", server uses "#3419"
        const normalized = {};
        for (const [k, v] of Object.entries(cache)) {
            normalized[k.startsWith('#') ? k : `#${k}`] = v;
            normalized[k] = v; // Keep original key too for getCachedResults lookup
        }
        const result = shiprocketSense.warmCache(normalized);
        // Also mark any extra checked IDs from frontend (prevents double-billing)
        if (Array.isArray(checkedIds)) {
            shiprocketSense.markChecked(checkedIds);
        }
        res.json({ success: true, ...result });
    } catch (e) {
        console.warn('[API] Cache warm failed:', e.message);
        res.json({ success: false, error: e.message });
    }
});

// Export current RTO cache (for GitHub backup)
app.get('/api/rto-cache/export', (req, res) => {
    try {
        const cache = shiprocketSense.exportCache();
        res.json({ success: true, count: Object.keys(cache).length, cache });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Helper for RTO percentage calculation (same logic as processor.js)
function calculateRtoScore(senseResult) {
    const prob = senseResult.probability || 0;
    const risk = (senseResult.risk || '').toLowerCase();
    if (risk === 'high' || risk === 'very high') return Math.round(Math.max(prob * 100, 60));
    if (risk === 'low') return Math.round(Math.max((1 - prob) * 100, 5));
    if (risk === 'medium') return Math.round(prob > 0 ? prob * 100 : 45);
    return 0;
}

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
            senseRiskMap = shiprocketSense.getCachedResults(rawOrders);
        } catch (e) {
            console.warn('[API] Sense cache lookup failed in search (non-blocking):', e.message);
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

// 6a. Upload to NBE Portal via Raw Order API (3-step: presign → upload → finalize)
app.post('/api/nbe/upload-order', async (req, res) => {
    try {
        const { rows } = req.body;
        if (!rows || !Array.isArray(rows) || rows.length === 0) {
            return res.status(400).json({ success: false, error: 'Missing rows' });
        }

        const nbeBase = (process.env.NBE_API_BASE || '').trim();
        const nbeKey = (process.env.NBE_API_KEY || '').trim();
        if (!nbeBase || !nbeKey) {
            return res.status(400).json({ success: false, error: 'NBE_API_BASE or NBE_API_KEY not configured' });
        }

        const nbeHeaders = { 'X-Customer-Api-Key': nbeKey, 'Content-Type': 'application/json' };
        console.log(`[NBE] Uploading ${rows.length} items via Raw Order API...`);

        // Generate the supplier CSV
        const csvContent = generateSupplierCSV(rows);
        const filename = `${getFormattedDate()} Order.csv`;

        // Step 1: Presign — get upload URL + storage key
        const presignRes = await axios.post(`${nbeBase}/raw-order-files/presign/`, {
            filename,
            content_type: 'text/csv',
        }, { headers: nbeHeaders, timeout: 30000 });

        const { upload_url, key } = presignRes.data;
        if (!upload_url || !key) {
            console.error('[NBE] Presign response missing upload_url or key:', presignRes.data);
            return res.status(500).json({ success: false, error: 'Presign failed — no upload_url or key', response: presignRes.data });
        }
        console.log(`[NBE] Step 1 done: got presigned URL, key=${key}`);

        // Step 2: Upload CSV bytes to presigned URL (S3/R2)
        await axios.put(upload_url, Buffer.from(csvContent, 'utf-8'), {
            headers: { 'Content-Type': 'text/csv' },
            timeout: 30000,
        });
        console.log(`[NBE] Step 2 done: CSV uploaded to storage`);

        // Step 3: Finalize — register the uploaded file as a raw order
        const finalizeRes = await axios.post(`${nbeBase}/raw-order-files/finalize/`, {
            key,
            description: `${getFormattedDate()} Order`,
            order_type: 'Bulkship POD',
            partial_fulfillment: 'yes',
            is_urgent_order: false,
        }, { headers: nbeHeaders, timeout: 30000 });

        console.log(`[NBE] Step 3 done: finalized`, finalizeRes.data);

        res.json({
            success: true,
            key,
            items: rows.length,
            finalize: finalizeRes.data,
            message: `NBE raw order uploaded: ${rows.length} items (${filename})`
        });

    } catch (e) {
        console.error('[NBE] Raw Order Upload Error:', JSON.stringify({
            status: e.response?.status,
            statusText: e.response?.statusText,
            data: e.response?.data,
            url: e.config?.url,
            method: e.config?.method,
            message: e.message,
        }));
        const errData = e.response?.data;
        res.status(e.response?.status || 500).json({
            success: false,
            step: e.config?.url?.includes('presign') ? 1 : e.config?.url?.includes('finalize') ? 3 : e.config?.method === 'put' ? 2 : 'unknown',
            error: errData?.detail || errData?.error || errData?.message || (typeof errData === 'string' ? errData : null) || e.message,
            fullError: errData,
            url: e.config?.url,
        });
    }
});

// Debug: test NBE presign endpoint
app.get('/api/nbe/test-presign', async (req, res) => {
    try {
        const nbeBase = (process.env.NBE_API_BASE || '').trim();
        const nbeKey = (process.env.NBE_API_KEY || '').trim();
        const nbeHeaders = { 'X-Customer-Api-Key': nbeKey, 'Content-Type': 'application/json' };
        const presignRes = await axios.post(`${nbeBase}/raw-order-files/presign/`, {
            filename: 'test.csv',
            content_type: 'text/csv',
        }, { headers: nbeHeaders, timeout: 15000 });
        res.json({ success: true, nbeBase, data: presignRes.data });
    } catch (e) {
        res.json({ success: false, nbeBase: (process.env.NBE_API_BASE || '').trim(), status: e.response?.status, data: e.response?.data, url: e.config?.url, message: e.message });
    }
});

// NBE: Upload shipping label to an existing NBE order
app.post('/api/nbe/upload-label', async (req, res) => {
    try {
        const { orderId, labelUrl } = req.body;
        if (!orderId || !labelUrl) {
            return res.status(400).json({ success: false, error: 'Missing orderId or labelUrl' });
        }

        const nbeBase = (process.env.NBE_API_BASE || '').trim();
        const nbeKey = (process.env.NBE_API_KEY || '').trim();
        if (!nbeBase || !nbeKey) {
            return res.status(400).json({ success: false, error: 'NBE not configured' });
        }

        // Download the label PDF
        const pdfRes = await axios.get(labelUrl, { responseType: 'arraybuffer', timeout: 30000 });

        const FormData = require('form-data');
        const form = new FormData();
        form.append('order_id', orderId);
        form.append('upload_label', Buffer.from(pdfRes.data), {
            filename: `label_${orderId}.pdf`,
            contentType: 'application/pdf'
        });

        const uploadRes = await axios.post(`${nbeBase}/customer-orders/upload-shipping-label/`, form, {
            headers: { 'X-Customer-Api-Key': nbeKey, ...form.getHeaders() },
            timeout: 30000
        });

        console.log(`[NBE] Label uploaded for order ${orderId}`);
        res.json({ success: true, data: uploadRes.data });
    } catch (e) {
        console.error('[NBE] Label upload error:', e.response?.data || e.message);
        res.status(500).json({ success: false, error: e.response?.data?.error || e.message });
    }
});

// 6b. Upload to Portal (Legacy Puppeteer)
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

        // Cancel in RapidShyp + Shopify in parallel
        const { cancelOrder: shopifyCancelOrder } = require('./shopify');
        const [rsResult, shopifyResult] = await Promise.allSettled([
            rapidshyp.cancelOrder(orderName),
            shopifyCancelOrder(numericId)
        ]);

        const rsRes = rsResult.status === 'fulfilled' ? rsResult.value : { success: false, message: rsResult.reason?.message };
        if (shopifyResult.status === 'rejected') {
            throw new Error(`Shopify cancel failed: ${shopifyResult.reason?.message}`);
        }

        console.log(`[API] Cancel Success: ${orderName}`);

        res.json({
            success: true,
            message: `Order ${orderName} cancelled successfully.`,
            rapidshyp: rsRes,
        });

    } catch (e) {
        console.error('[API] Cancellation Error:', e);
        res.status(500).json({ success: false, error: e.message || 'Failed to cancel order' });
    }
});

// 7.6 Order Verification (manual checkmark in wizard)
app.post('/api/orders/verify', (req, res) => {
    try {
        const { orderId } = req.body;
        if (!orderId) return res.status(400).json({ error: 'Missing orderId' });
        verification.markVerified(orderId);
        console.log(`[API] Order #${orderId} marked as verified`);
        res.json({ success: true, orderId });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/orders/unverify', (req, res) => {
    try {
        const { orderId } = req.body;
        if (!orderId) return res.status(400).json({ error: 'Missing orderId' });
        verification.removeVerified(orderId);
        console.log(`[API] Order #${orderId} verification removed`);
        res.json({ success: true, orderId });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/orders/verified', (req, res) => {
    try {
        const orderIds = verification.getAll();
        res.json({ success: true, orderIds });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
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
            const lookups = await Promise.allSettled(awbs.filter(Boolean).map(awb => rapidshyp.findOrderIdByAWB(awb)));
            for (const r of lookups) {
                if (r.status === 'fulfilled' && r.value) resolvedIds.push(r.value);
            }
        }

        // Priority 2: Direct order IDs (from rsOrderId — but these are MongoDB ObjectIds, may not work)
        if (resolvedIds.length === 0 && orderIds && Array.isArray(orderIds)) {
            resolvedIds = orderIds.filter(Boolean);
        }

        // Priority 3: Search by Shopify order ID via order map (fetches all RS orders)
        if (resolvedIds.length === 0 && shopifyOrderId) {
            console.log(`[API] Looking up RS order for Shopify #${shopifyOrderId} via order map...`);
            try {
                const orderMap = await rapidshyp.fetchAllOrders();
                const cleanId = shopifyOrderId.toString().replace('#', '');
                const match = orderMap.get(cleanId);
                if (match) {
                    const shipId = match.shipment_id || match.order_id;
                    resolvedIds.push(shipId);
                    console.log(`[API] Found RS shipment ${shipId} for Shopify #${shopifyOrderId}`);
                }
            } catch (searchErr) {
                console.warn(`[API] Order map lookup failed:`, searchErr.message);
            }
        }

        // Priority 4: Use track_order public API (no JWT needed, works for any order)
        if (resolvedIds.length === 0 && shopifyOrderId) {
            console.log(`[API] Trying track_order for Shopify #${shopifyOrderId}...`);
            try {
                const infoResult = await rapidshyp.getOrderInfo(shopifyOrderId);
                if (infoResult.success && infoResult.data) {
                    const shipLines = infoResult.data.shipment_lines || [];
                    for (const s of shipLines) {
                        if (s.shipment_id) resolvedIds.push(s.shipment_id);
                    }
                    if (resolvedIds.length === 0 && infoResult.data.shipment_id) {
                        resolvedIds.push(infoResult.data.shipment_id);
                    }
                    if (resolvedIds.length > 0) {
                        console.log(`[API] Found shipment IDs via track_order:`, resolvedIds);
                    }
                }
            } catch (infoErr) {
                console.warn(`[API] track_order lookup failed:`, infoErr.message);
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

// Proxy PDF download (avoids CORS issues with cross-origin label PDFs)
app.get('/api/proxy-pdf', async (req, res) => {
    try {
        const { url, filename } = req.query;
        if (!url) return res.status(400).json({ error: 'Missing url parameter' });

        console.log(`[API] PDF Proxy fetching: ${url}`);
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 30000,
            headers: { 'Accept': 'application/pdf,*/*' },
        });

        const contentType = response.headers['content-type'] || 'application/pdf';
        console.log(`[API] PDF Proxy got ${response.data.length} bytes, type: ${contentType}`);

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': filename ? `attachment; filename="${filename}"` : 'attachment; filename="label.pdf"',
            'Content-Length': response.data.length,
            'Cache-Control': 'no-cache',
        });
        res.send(Buffer.from(response.data));
    } catch (e) {
        console.error('[API] PDF Proxy Error:', e.message);
        res.status(500).json({ error: 'Failed to fetch PDF' });
    }
});

// ==========================================
// RAPIDSHYP FULFILLMENT ENDPOINTS
// ==========================================

// Bulk Approve Orders (before AWB assignment)
app.post('/api/rapidshyp/bulk-approve', async (req, res) => {
    try {
        const { orderIds, orderIdMap } = req.body;
        if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
            return res.status(400).json({ error: 'Missing or invalid orderIds array' });
        }

        console.log(`[API] Bulk approving ${orderIds.length} orders (${Object.keys(orderIdMap || {}).length} marketplace IDs)...`);
        if (orderIdMap) {
            const sample = Object.entries(orderIdMap).slice(0, 3);
            console.log(`[API] orderIdMap sample:`, JSON.stringify(sample));
        } else {
            console.log(`[API] WARNING: orderIdMap is empty/missing!`);
        }
        const result = await rapidshyp.bulkApproveOrders(orderIds, orderIdMap || {});
        res.json(result);
    } catch (e) {
        console.error('[API] Bulk Approve Error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Debug: dump raw session API record fields for an order
app.get('/api/rapidshyp/debug-order/:orderId', async (req, res) => {
    try {
        const cleanId = req.params.orderId.replace('#', '');
        const sessionHeaders = rapidshyp.getSessionHeaders();
        if (!sessionHeaders) return res.status(400).json({ error: 'No JWT configured' });

        const axios = require('axios');
        const apiRes = await axios.post('https://api.rapidshyp.com/session/orders/get_orders', {
            page: 1, limit: 200
        }, { headers: sessionHeaders, timeout: 15000 });

        const records = apiRes.data?.records || [];
        const match = records.find(r => r.seller_order_id === `#${cleanId}` || r.seller_order_id === cleanId);

        if (!match) return res.json({ found: false, totalRecords: records.length, searchedFor: cleanId });

        res.json({
            found: true,
            allKeys: Object.keys(match).sort(),
            relevantFields: {
                order_id: match.order_id,
                seller_order_id: match.seller_order_id,
                market_place_order_id: match.market_place_order_id,
                order_status: match.order_status,
                awb_number: match.awb_number,
                shipment_id: match.shipment_id,
                shipments: match.shipments,
                shipment: match.shipment,
            },
            // Dump any field containing 'ship' in the key name
            shipFields: Object.fromEntries(Object.entries(match).filter(([k]) => k.toLowerCase().includes('ship'))),
            rawRecord: match
        });
    } catch (e) {
        res.status(500).json({ error: e.message, status: e.response?.status });
    }
});

// Bulk Assign AWB
app.post('/api/rapidshyp/bulk-assign', async (req, res) => {
    try {
        const { orderNames, shipmentMap } = req.body;
        if (!orderNames || !Array.isArray(orderNames) || orderNames.length === 0) {
            return res.status(400).json({ error: 'Missing or invalid orderNames array' });
        }

        console.log(`[API] Bulk assigning AWB for ${orderNames.length} orders, ${Object.keys(shipmentMap || {}).length} shipment IDs from frontend...`);
        const result = await rapidshyp.bulkAssignAWB(orderNames, shipmentMap || {});

        // Auto-schedule pickup for all successfully assigned orders
        const assigned = (result.results || []).filter(r => r.success && r.awb && r.shipmentId);
        if (assigned.length > 0) {
            console.log(`[API] Auto-scheduling pickup for ${assigned.length} assigned orders...`);
            const pickupResult = await rapidshyp.bulkSchedulePickup(
                assigned.map(r => ({ shipmentId: r.shipmentId, awb: r.awb }))
            );
            result.pickup = pickupResult;
        }

        res.json(result);
    } catch (e) {
        console.error('[API] Bulk Assign Error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Debug: inspect raw RapidShyp record for an order (temporary)
app.get('/api/rapidshyp/debug-order/:id', async (req, res) => {
    try {
        const orderMap = await rapidshyp.fetchAllOrders();
        const cleanId = req.params.id.replace('#', '');
        const match = orderMap.get(cleanId);

        // Also try track_order to get shipment_id
        let trackResult = null;
        try {
            trackResult = await rapidshyp.getOrderInfo(cleanId);
        } catch (e) { trackResult = { error: e.message }; }

        if (!match) return res.json({ found: false, mapSize: orderMap.size, triedKey: cleanId, trackResult });
        res.json({
            found: true,
            mapSize: orderMap.size,
            fields: Object.keys(match),
            order_id: match.order_id,
            shipment_id: match.shipment_id,
            seller_order_id: match.seller_order_id,
            order_status: match.order_status,
            awb_number: match.awb_number,
            store_name: match.store_name,
            id: match.id,
            contact_name: match.contact_name,
            trackResult,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Debug: test JWT and try login
app.get('/api/rapidshyp/test-jwt', async (req, res) => {
    try {
        const results = {};

        // Test current JWT
        const sessionHeaders = rapidshyp.getSessionHeaders();
        if (sessionHeaders) {
            try {
                const r = await axios.post('https://api.rapidshyp.com/session/orders/get_orders', {
                    page: 1, limit: 1
                }, { headers: sessionHeaders, timeout: 10000 });
                results.currentJwt = { status: 'OK', orderCount: r.data?.data?.length };
            } catch (e) {
                results.currentJwt = { status: 'FAILED', code: e.response?.status, data: e.response?.data || e.message };
            }
        } else {
            results.currentJwt = 'NO JWT SET';
        }

        // Try login to get fresh JWT
        const loginAttempts = [
            { url: 'https://api.rapidshyp.com/session/login', method: 'post' },
            { url: 'https://api.rapidshyp.com/session/auth/login', method: 'post' },
            { url: 'https://api.rapidshyp.com/rapidshyp/apis/v1/login', method: 'post' },
        ];
        for (const attempt of loginAttempts) {
            try {
                const r = await axios({ method: attempt.method, url: attempt.url, data: {}, timeout: 5000 });
                results[attempt.url] = { status: r.status, data: r.data };
            } catch (e) {
                results[attempt.url] = { status: e.response?.status, data: e.response?.data || e.message };
            }
        }

        res.json(results);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Debug: lookup order via session API + get_orders_info to find shipment_id
app.get('/api/rapidshyp/lookup/:orderId', async (req, res) => {
    try {
        const cleanId = req.params.orderId.replace('#', '');
        const publicHeaders = {
            'Content-Type': 'application/json',
            'rapidshyp-token': process.env.RAPIDSHYP_API_KEY.trim()
        };

        // Step 1: Find order in session API to get RapidShyp order_id + marketplace_id
        let sessionOrder = null;
        let allSessionOrders = [];
        const sessionHeaders = rapidshyp.getSessionHeaders();
        if (sessionHeaders) {
            try {
                // Session API uses POST, not GET
                // Paginate through records to find the order
                const totalRecordsEstimate = 1000;
                for (let page = 1; page <= 10; page++) {
                    const sr = await axios.post('https://api.rapidshyp.com/session/orders/get_orders', {
                        page, limit: 200
                    }, { headers: sessionHeaders, timeout: 15000 });
                    const pageOrders = sr.data?.records || sr.data?.data || [];
                    allSessionOrders.push(...pageOrders);
                    const found = pageOrders.find(o => {
                        const sellerClean = (o.seller_order_id || '').replace('#', '');
                        return sellerClean === cleanId;
                    });
                    if (found) { sessionOrder = found; break; }
                    if (pageOrders.length < 200) break;
                }
            } catch (e) {
                sessionOrder = { error: e.response?.status, errorData: e.response?.data || e.message };
            }
        }

        // Step 2: Try get_orders_info with different ID formats
        const results = {};
        const rsOrderId = sessionOrder?.order_id;
        const marketplaceId = sessionOrder?.market_place_order_id;

        // Try all param name combos (orderId vs order_id, Channel_order_id vs channel_order_id)
        const combos = [];
        if (rsOrderId && marketplaceId) {
            combos.push({ order_id: rsOrderId, channel_order_id: marketplaceId });
            combos.push({ orderId: rsOrderId, channel_order_id: marketplaceId });
            combos.push({ order_id: rsOrderId, Channel_order_id: marketplaceId });
        }
        if (rsOrderId) {
            combos.push({ order_id: rsOrderId, channel_order_id: rsOrderId });
        }
        // Also try with seller_order_id as channel
        if (rsOrderId) {
            combos.push({ order_id: rsOrderId, channel_order_id: `#${cleanId}` });
        }
        // Fallback: try without session API data
        combos.push({ order_id: `#${cleanId}`, channel_order_id: `#${cleanId}` });
        combos.push({ order_id: cleanId, channel_order_id: cleanId });

        for (const params of combos) {
            const key = JSON.stringify(params);
            try {
                const r = await axios.get('https://api.rapidshyp.com/rapidshyp/apis/v1/get_orders_info', {
                    params, headers: publicHeaders, timeout: 15000
                });
                results[key] = r.data;
            } catch (e) {
                results[key] = e.response?.data || e.message;
            }
        }

        res.json({
            orderId: cleanId,
            sessionOrder: sessionOrder || null,
            sessionOrderCount: allSessionOrders.length,
            results
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Schedule Pickup (after AWB assignment)
app.post('/api/rapidshyp/schedule-pickup', async (req, res) => {
    try {
        const { assignments } = req.body; // [{ shipmentId, awb }]
        if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
            return res.status(400).json({ error: 'Missing or invalid assignments array' });
        }
        const result = await rapidshyp.bulkSchedulePickup(assignments);
        res.json(result);
    } catch (e) {
        console.error('[API] Schedule Pickup Error:', e);
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
        const { orderIds, awbs, orders } = req.body;

        // Use shipment IDs directly (orderIds from frontend are already shipment IDs like S260444036)
        let shipmentIds = (orderIds || []).filter(Boolean);

        // Fallback: if no shipment IDs, resolve from AWBs via track_order
        if (shipmentIds.length === 0 && awbs && Array.isArray(awbs) && awbs.length > 0) {
            console.log(`[API] No shipment IDs provided, resolving ${awbs.length} AWBs...`);
            const lookups = await Promise.allSettled(awbs.filter(Boolean).map(awb => rapidshyp.findOrderIdByAWB(awb)));
            for (const r of lookups) {
                if (r.status === 'fulfilled' && r.value) shipmentIds.push(r.value);
            }
        }
        if (shipmentIds.length === 0) {
            return res.status(400).json({ error: 'No valid shipment IDs or AWBs provided' });
        }

        console.log(`[API] Generating labels for ${shipmentIds.length} shipments + Dropbox upload...`);

        // Generate labels
        const labelResult = await rapidshyp.bulkGenerateLabels(shipmentIds);
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

// Bulk Generate Labels by Shopify Order IDs (from CSV)
app.post('/api/rapidshyp/bulk-labels-by-orders', async (req, res) => {
    try {
        const { orderIds } = req.body;
        if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
            return res.status(400).json({ error: 'Missing or invalid orderIds array' });
        }

        console.log(`[API] Bulk labels by Shopify order IDs: ${orderIds.length} orders`);

        // Resolve shipment IDs via public track_order API (no JWT needed)
        const shipmentIds = [];
        const BATCH = 10;
        for (let i = 0; i < orderIds.length; i += BATCH) {
            const batch = orderIds.slice(i, i + BATCH);
            const results = await Promise.allSettled(batch.map(id => rapidshyp.getOrderInfo(id)));
            for (const r of results) {
                if (r.status === 'fulfilled' && r.value?.success && r.value.data?.shipment_id) {
                    shipmentIds.push(r.value.data.shipment_id);
                }
            }
        }

        if (shipmentIds.length === 0) {
            return res.status(400).json({ error: 'No matching shipments found in RapidShyp for these orders' });
        }

        console.log(`[API] Resolved ${shipmentIds.length}/${orderIds.length} orders to shipment IDs`);
        const labelResult = await rapidshyp.bulkGenerateLabels(shipmentIds);

        if (!labelResult.success) {
            return res.status(500).json({ success: false, error: labelResult.message || 'Label generation failed' });
        }

        const labelUrl = labelResult.labelUrl;

        // Upload to Dropbox
        let dropboxPath = null;
        if (labelUrl) {
            try {
                const { uploadOrderPayload } = require('./dropbox');
                dropboxPath = await uploadOrderPayload(labelUrl, null, null);
            } catch (dbxErr) {
                console.warn('[API] Dropbox label upload failed (non-blocking):', dbxErr.message);
            }
        }

        res.json({ success: true, labelUrl, label_pdf_url: labelUrl, labels: labelResult.labels, dropboxPath });
    } catch (e) {
        console.error('[API] Bulk Labels by Orders Error:', e);
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

// ─── 11. SEO Endpoints ────────────────────────────────────────

// SEO Dashboard — full audit overview
app.get('/api/seo/dashboard', async (req, res) => {
    try {
        const data = await seo.getSEODashboard();
        res.json({ success: true, data });
    } catch (e) {
        console.error('[SEO] Dashboard Error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Get all products with SEO data
app.get('/api/seo/products', async (req, res) => {
    try {
        const products = await seo.getProducts(250);
        const audits = products.map(p => ({ ...p, audit: seo.auditProductSEO(p) }));
        res.json({ success: true, data: audits });
    } catch (e) {
        console.error('[SEO] Products Error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Get all collections with SEO data
app.get('/api/seo/collections', async (req, res) => {
    try {
        const collections = await seo.getCollections();
        const audits = collections.map(c => ({ ...c, audit: seo.auditCollectionSEO(c) }));
        res.json({ success: true, data: audits });
    } catch (e) {
        console.error('[SEO] Collections Error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Update product SEO
app.post('/api/seo/products/:id', async (req, res) => {
    try {
        const { seoTitle, seoDescription } = req.body;
        if (!seoTitle && !seoDescription) return res.status(400).json({ error: 'Provide seoTitle or seoDescription' });
        const result = await seo.updateProductSEO(req.params.id, seoTitle, seoDescription);
        res.json({ success: true, data: result });
    } catch (e) {
        console.error('[SEO] Product Update Error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Update collection SEO
app.post('/api/seo/collections/:id', async (req, res) => {
    try {
        const { seoTitle, seoDescription, descriptionHtml } = req.body;
        const result = await seo.updateCollectionSEO(req.params.id, seoTitle, seoDescription, descriptionHtml);
        res.json({ success: true, data: result });
    } catch (e) {
        console.error('[SEO] Collection Update Error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Bing Webmaster: Submit sitemap
app.post('/api/seo/bing/sitemap', async (req, res) => {
    try {
        const result = await seo.bingSubmitSitemap();
        res.json({ success: true, data: result });
    } catch (e) {
        console.error('[SEO] Bing Sitemap Error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Bing Webmaster: Submit URL for indexing
app.post('/api/seo/bing/submit-url', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'Missing url' });
        const result = await seo.bingSubmitUrl(url);
        res.json({ success: true, data: result });
    } catch (e) {
        console.error('[SEO] Bing URL Submit Error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Bing Webmaster: Get submission quota
app.get('/api/seo/bing/quota', async (req, res) => {
    try {
        const result = await seo.bingGetUrlSubmissionQuota();
        res.json({ success: true, data: result });
    } catch (e) {
        console.error('[SEO] Bing Quota Error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// SEO: One-click bulk fix all products + collections + Bing submission
// Supports POST (dashboard button) and GET (Vercel cron)
app.all('/api/seo/fix-all', async (req, res) => {
    try {
        console.log('[SEO] Starting bulk fix-all...');
        const result = await seo.bulkFixAllSEO();
        res.json({ success: true, data: result });
    } catch (e) {
        console.error('[SEO] Bulk Fix Error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// SEO Execute: Install theme snippets
app.post('/api/seo/install-theme', async (req, res) => {
    try {
        const { schemaLiquid, metaLiquid, llmsTxt } = req.body;
        if (!schemaLiquid || !metaLiquid) return res.status(400).json({ success: false, error: 'schemaLiquid and metaLiquid required' });
        const result = await seo.installThemeSnippets(schemaLiquid, metaLiquid, llmsTxt || '');
        res.json({ success: true, data: result });
    } catch (e) {
        console.error('[SEO] Theme Install Error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// SEO Execute: Fix -copy URLs
app.post('/api/seo/fix-urls', async (req, res) => {
    try {
        const result = await seo.fixCopyUrls();
        res.json({ success: true, data: result });
    } catch (e) {
        console.error('[SEO] URL Fix Error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// SEO Execute: Fix image alt text
app.post('/api/seo/fix-alt-text', async (req, res) => {
    try {
        const result = await seo.fixImageAltText();
        res.json({ success: true, data: result });
    } catch (e) {
        console.error('[SEO] Alt Text Error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// SEO Execute: Submit all URLs to Bing
app.post('/api/seo/bing/submit-all', async (req, res) => {
    try {
        const result = await seo.bingSubmitAllUrls();
        res.json({ success: true, data: result });
    } catch (e) {
        console.error('[SEO] Bing Submit All Error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// SEO Execute: Full execution (all steps)
app.post('/api/seo/execute-all', async (req, res) => {
    try {
        const { schemaLiquid, metaLiquid, llmsTxt } = req.body;
        const result = await seo.executeFullSEO(schemaLiquid || '', metaLiquid || '', llmsTxt || '');
        res.json({ success: true, data: result });
    } catch (e) {
        console.error('[SEO] Execute All Error:', e.message);
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
