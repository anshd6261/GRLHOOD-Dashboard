const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config();

const { getUnfulfilledOrders, searchOrders, assignSkuToProduct, getOrder } = require('./shopify');
const { processOrders } = require('./processor');
// RTO prediction now powered by Shiprocket Sense API (shiprocket_sense.js)
const ithink = require('./ithink');
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
        ithink: !!(process.env.ITHINK_ACCESS_TOKEN && process.env.ITHINK_SECRET_KEY),
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

    // NDR management login — sees ONLY the NDR dashboard
    if (username === 'ITHINKGRL' && password === 'ITHINKGRL') {
        return res.json({ success: true, role: 'ndr', token: 'mock-jwt-ndr-token-5k8' });
    }

    // NDR agent login (iThink employee): NDR board + welcome/reminders/notes,
    // every action reported by email to the owner
    if (username === 'ITHINKGRLL' && password === 'ITHINKGRLL') {
        return res.json({ success: true, role: 'ndr-agent', token: 'mock-jwt-ndragent-token-9q2' });
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

        // Fetch from Shopify. (iThink creates the AWB at ship time; AWB shows via
        // Shopify fulfillment tracking, so no separate aggregator order-list fetch is needed.)
        const rawOrders = await getUnfulfilledOrders(daysLookback, startDate, endDate, statusMode);

        // Shipping data map (AWB/status) — populated from Shopify fulfillment in the processor.
        const rtoMap = {};

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

// 2.2b RTO Status — Read-only diagnostic (no API calls, no credits used)
app.get('/api/rto-status', (req, res) => {
    const senseKey = (process.env.SHIPROCKET_SENSE_API_KEY || '').trim();
    const senseSecret = (process.env.SHIPROCKET_SENSE_API_SECRET || '').trim();
    const cached = shiprocketSense.exportCache();
    const cacheSize = cached ? Object.keys(cached).length : 0;
    res.json({
        credsConfigured: !!(senseKey && senseSecret),
        keyPrefix: senseKey ? senseKey.slice(0, 4) + '...' : 'MISSING',
        secretPrefix: senseSecret ? senseSecret.slice(0, 4) + '...' : 'MISSING',
        cacheSize,
        sampleCached: cached ? Object.entries(cached).slice(0, 3).map(([k, v]) => ({ orderId: k, risk: v.risk, probability: v.probability })) : [],
    });
});

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
        const finalizePayload = {
            key,
            description: `${getFormattedDate()} Order`,
            order_type: 'Dropship POD',
            partial_fulfillment: 'no',
            providing_shipping_label: 'yes',
            is_urgent_order: false,
        };
        console.log('[NBE] Finalize payload:', JSON.stringify(finalizePayload));
        const finalizeRes = await axios.post(`${nbeBase}/raw-order-files/finalize/`, finalizePayload, { headers: nbeHeaders, timeout: 30000 });

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
        const { orderName, awb } = req.body; // e.g., #1005, and the iThink AWB if shipped

        if (!numericId || !orderName) {
            return res.status(400).json({ error: 'Missing numeric ID or orderName' });
        }

        console.log(`[API] Processing Cancellation for Order ${orderName} (${numericId}), awb=${awb || 'none'}...`);

        // Cancel on iThink (by AWB, only if shipped) + Shopify in parallel
        const { cancelOrder: shopifyCancelOrder } = require('./shopify');
        const [itlResult, shopifyResult] = await Promise.allSettled([
            awb ? ithink.cancelOrder(awb) : Promise.resolve({ success: true, message: 'No AWB — nothing to cancel on courier' }),
            shopifyCancelOrder(numericId)
        ]);

        const itlRes = itlResult.status === 'fulfilled' ? itlResult.value : { success: false, message: itlResult.reason?.message };
        if (shopifyResult.status === 'rejected') {
            throw new Error(`Shopify cancel failed: ${shopifyResult.reason?.message}`);
        }

        console.log(`[API] Cancel Success: ${orderName}`);

        res.json({
            success: true,
            message: `Order ${orderName} cancelled successfully.`,
            courier: itlRes,
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

// 7.5 Generate Label (iThink — print by AWB/waybill)
app.post('/api/rapidshyp/label', async (req, res) => {
    try {
        const { awbs, awb } = req.body;
        const awbList = (Array.isArray(awbs) ? awbs : [awbs || awb]).filter(Boolean).map(String);

        if (awbList.length === 0) {
            return res.status(400).json({ success: false, error: 'No AWB provided. Ship the order first to get a waybill.' });
        }

        console.log(`[API] Generating label for AWB(s):`, awbList);
        const result = await ithink.printLabel(awbList);

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
// ITHINK LOGISTICS FULFILLMENT ENDPOINTS
// (Paths kept under /api/rapidshyp/* for frontend compatibility; backed by iThink.)
// ==========================================

// Approve — iThink has no separate approve step (order creation assigns the AWB
// directly). Kept as an instant no-op so the wizard's approve stage completes.
app.post('/api/rapidshyp/approve-batch', async (req, res) => {
    const { orderIds } = req.body;
    const cleanIds = (orderIds || []).map(id => id.toString().replace('#', ''));
    res.json({
        success_count: cleanIds.length,
        alreadyApproved_count: 0,
        failure_count: 0,
        remark: 'iThink: no approval needed — AWB is assigned at ship time',
        shipmentMap: {},
        approved: cleanIds.map(orderId => ({ orderId })),
        alreadyApproved: [],
        failed: [],
    });
});

// Resolve shipments — not applicable for iThink (AWB is created at ship time).
// Kept as a no-op returning an empty map so the wizard flow proceeds.
app.post('/api/rapidshyp/resolve-shipments', async (req, res) => {
    const { orderIds } = req.body;
    res.json({ shipmentMap: {}, found: 0, total: (orderIds || []).length, notInMap: 0, inMapNoShipment: 0 });
});

// Ship — create the order(s) on iThink. The waybill (AWB) is returned immediately.
// Frontend sends full order objects (address + items + payment) under `orders`.
// Courier: by default iThink's own recommendation engine assigns the courier.
// Pass `logistics` (e.g. "xpressbees", "dtdc") to force a specific courier —
// used for manual re-ship after a serviceability failure.
// Failed shipments are auto-diagnosed (pincode serviceability + courier
// alternatives) so the UI can offer a manual courier picker.
app.post('/api/rapidshyp/assign-batch', async (req, res) => {
    try {
        const { orders, orderIds, logistics } = req.body;
        if (!orders?.length) {
            return res.status(400).json({
                error: 'Missing order data. iThink needs full order details (address + items) to ship. Re-run from the wizard.',
                results: (orderIds || []).map(id => ({ orderId: String(id).replace('#', ''), success: false, message: 'No order data sent' })),
            });
        }

        console.log(`[API] iThink ship: creating ${orders.length} order(s)${logistics ? ` via ${logistics}` : ' (auto courier)'}`);
        const result = await ithink.createOrders(orders, logistics ? { logistics } : {});

        // Record orderNumber→AWB so the NDR board tracks these shipments even
        // if the store order's awb_no backfill lags.
        try {
            const map = {};
            result.results.forEach(r => { if (r.success && r.awb) map[r.orderId] = r.awb; });
            if (Object.keys(map).length) require('./ndr').registerAwbs(map);
        } catch { /* non-blocking */ }

        // Diagnose failures in parallel: what's wrong + which couriers ARE available
        const failures = result.results.filter(r => !r.success && r.pincode);
        await Promise.all(failures.slice(0, 15).map(async f => { // cap to avoid hammering the API
            try {
                f.diagnosis = await ithink.diagnoseServiceability({
                    pincode: f.pincode,
                    paymentMethod: f.paymentMethod,
                    mrp: f.mrp,
                });
            } catch (dErr) {
                console.warn(`[API] diagnose failed for #${f.orderId}:`, dErr.message);
            }
        }));

        res.json(result);
    } catch (e) {
        console.error('[API] iThink ship error:', e.response?.data || e.message);
        res.status(500).json({ error: e.message });
    }
});

// Diagnose a pincode: serviceability + available couriers with rates/TAT.
app.post('/api/rapidshyp/diagnose', async (req, res) => {
    try {
        const { pincode, payment, paymentMethod, mrp } = req.body;
        if (!pincode) return res.status(400).json({ error: 'No pincode provided' });
        const method = paymentMethod || (String(payment || '').toLowerCase().includes('prepaid') ? 'prepaid' : 'cod');
        const result = await ithink.diagnoseServiceability({ pincode, paymentMethod: method, mrp: mrp || 0 });
        res.json({ success: true, ...result });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Schedule Pickup — iThink schedules pickup automatically at order creation. No-op.
app.post('/api/rapidshyp/schedule-pickup', async (req, res) => {
    res.json({ success: true, scheduled: 0, message: 'iThink schedules pickup automatically at order creation' });
});

// Wallet — attempts iThink wallet endpoints; the public API does not document
// one, so this degrades gracefully with a dashboard link when unavailable.
app.get('/api/rapidshyp/wallet', async (req, res) => {
    try {
        const result = await ithink.getWalletBalance();
        res.json(result);
    } catch (e) {
        res.json({ success: false, balance: null, message: e.message });
    }
});

// Track a shipment by AWB
app.post('/api/rapidshyp/track', async (req, res) => {
    try {
        const { awb, awbs } = req.body;
        const list = (Array.isArray(awbs) ? awbs : [awbs || awb]).filter(Boolean);
        if (list.length === 0) return res.status(400).json({ error: 'No AWB provided' });
        const result = await ithink.trackOrder(list);
        res.json(result);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Pincode serviceability
app.post('/api/rapidshyp/pincode', async (req, res) => {
    try {
        const { pincode } = req.body;
        if (!pincode) return res.status(400).json({ error: 'No pincode provided' });
        const result = await ithink.checkPincode(pincode);
        res.json(result);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Courier rates
app.post('/api/rapidshyp/rate', async (req, res) => {
    try {
        const result = await ithink.getRate(req.body || {});
        res.json(result);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Warehouses (pickup addresses)
app.get('/api/rapidshyp/warehouses', async (req, res) => {
    try {
        const result = await ithink.getWarehouses(req.query.warehouseId);
        res.json(result);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Helper: print labels by AWB + upload PDF(s) to Dropbox.
// >100 AWBs produce multiple PDFs (iThink caps 100/call) — all are uploaded.
async function printLabelsToDropbox(awbList) {
    const awbs = (awbList || []).filter(Boolean).map(String);
    if (awbs.length === 0) return { success: false, error: 'No AWB numbers provided' };

    const labelResult = await ithink.printLabel(awbs);
    if (!labelResult.success) {
        return { success: false, error: labelResult.message || 'Label generation failed', labelUrls: labelResult.labelUrls || [] };
    }
    const labelUrls = labelResult.labelUrls || [labelResult.labelUrl].filter(Boolean);

    let dropboxPath = null;
    try {
        const { uploadOrderPayload } = require('./dropbox');
        for (let i = 0; i < labelUrls.length; i++) {
            const suffix = labelUrls.length > 1 ? ` Part ${i + 1}` : '';
            dropboxPath = await uploadOrderPayload(labelUrls[i], null, null, suffix);
        }
        console.log(`[API] ${labelUrls.length} label PDF(s) uploaded to Dropbox: ${dropboxPath}`);
    } catch (dbxErr) {
        console.warn('[API] Dropbox label upload failed (non-blocking):', dbxErr.message);
    }
    return { success: true, labelUrl: labelUrls[0], label_pdf_url: labelUrls[0], labelUrls, dropboxPath };
}

// Bulk Generate Labels (by AWB) + Upload to Dropbox
app.post('/api/rapidshyp/bulk-labels-dropbox', async (req, res) => {
    try {
        const { awbs, orderIds } = req.body;
        // orderIds may carry AWBs in the iThink world (waybill == shipment id)
        const awbList = (awbs && awbs.length ? awbs : orderIds) || [];
        const result = await printLabelsToDropbox(awbList);
        if (!result.success) return res.status(400).json(result);
        res.json(result);
    } catch (e) {
        console.error('[API] Bulk Labels+Dropbox Error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Bulk Generate Labels by AWB (fallback path)
app.post('/api/rapidshyp/bulk-labels-by-orders', async (req, res) => {
    try {
        const { awbs, orderIds } = req.body;
        const awbList = (awbs && awbs.length ? awbs : orderIds) || [];
        if (awbList.length === 0) {
            return res.status(400).json({ error: 'No AWB numbers provided. Ship the orders first to get waybills.' });
        }
        const result = await printLabelsToDropbox(awbList);
        if (!result.success) return res.status(400).json(result);
        res.json(result);
    } catch (e) {
        console.error('[API] Bulk Labels by Orders Error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ==========================================
// NDR MANAGEMENT (iThink store orders + tracking board)
// ==========================================
const ndr = require('./ndr');

// Full shipment board: synced store orders bucketed by live courier status.
// ?days=30 (window), ?refresh=1 (bust the 10-min cache)
app.get('/api/ndr/board', async (req, res) => {
    try {
        const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 90);
        const refresh = req.query.refresh === '1';
        const board = await ndr.buildBoard(days, refresh);
        res.json(board);
    } catch (e) {
        console.error('[API] NDR board error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Seed orderNumber→AWB mappings (admin browser's awbMap) so standalone-created
// shipments get tracked on the board even without store awb_no backfill.
app.post('/api/ndr/awb-map', (req, res) => {
    try {
        const result = ndr.registerAwbs(req.body?.map || {});
        res.json({ success: true, ...result });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Formatted action-report email to the owner (best-effort, non-blocking)
const OWNER_EMAIL = process.env.NDR_REPORT_EMAIL || 'grlhood18@gmail.com';
async function sendNdrReport(subject, rows) {
    try {
        const nodemailer = require('nodemailer');
        const t = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
        const html = `
        <div style="font-family:Helvetica,Arial,sans-serif;max-width:520px;margin:auto;background:#fbfafc;border-radius:18px;padding:28px">
          <h2 style="margin:0 0 4px;letter-spacing:-0.5px">GRLHOOD<sup>®</sup></h2>
          <p style="margin:0 0 20px;color:#97949e;font-size:13px">NDR Management activity report</p>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            ${rows.map(([k, v]) => `<tr><td style="padding:7px 10px;color:#97949e;white-space:nowrap;vertical-align:top">${k}</td><td style="padding:7px 10px;color:#1b1b1f;font-weight:600">${v || '—'}</td></tr>`).join('')}
          </table>
          <p style="margin:20px 0 0;color:#c5c2cb;font-size:11px">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST · grlhood-dashboard.vercel.app</p>
        </div>`;
        await t.sendMail({ from: process.env.GMAIL_USER, to: OWNER_EMAIL, subject: `GRLHOOD® — ${subject}`, html });
    } catch (e) { console.warn('[NDR] report email failed:', e.message); }
}

// Save a note on an order (synced server-side, included in the board + reports)
app.post('/api/ndr/note', async (req, res) => {
    try {
        const { orderNumber, awb, note, author } = req.body || {};
        const saved = ndr.saveNote(orderNumber, note, author);
        if (!saved) return res.status(400).json({ success: false, error: 'orderNumber required' });
        if (author === 'ITHINKGRLL') {
            sendNdrReport(`Note added on ${orderNumber}`, [
                ['Agent', author], ['Order', orderNumber], ['AWB', awb], ['Note', saved.note],
            ]);
        }
        res.json({ success: true, note: saved });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Take NDR action: { awb, action: 'reattempt'|'rto', date?, time?, phone?, address?, remark? }
app.post('/api/ndr/action', async (req, res) => {
    try {
        const result = await ndr.takeAction(req.body || {});
        if (result.success && req.body?.author === 'ITHINKGRLL') {
            sendNdrReport(`${String(req.body.action || '').toUpperCase()} requested — ${req.body.orderNumber || req.body.awb}`, [
                ['Agent', req.body.author], ['Action', req.body.action], ['Order', req.body.orderNumber],
                ['AWB', req.body.awb], ['Re-attempt date', req.body.date], ['New phone', req.body.phone],
                ['NDR reason', req.body.reason], ['Note', req.body.note],
            ]);
        }
        res.status(result.success ? 200 : 400).json(result);
    } catch (e) {
        console.error('[API] NDR action error:', e.message);
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
