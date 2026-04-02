/**
 * Shiprocket Sense API — RTO Risk Prediction
 *
 * Uses Shiprocket Sense (cross-merchant buyer intelligence, 4.8B data points)
 * to predict RTO risk for unfulfilled COD orders only.
 *
 * Credit-saving optimizations:
 *   1. Skip prepaid orders (COD only)
 *   2. Skip customers who have a delivered order in the current batch
 *   3. Cache results per order — no re-call on dashboard refresh
 *   4. /tmp file persistence across Vercel invocations
 *
 * Auth: Basic (API_KEY:API_SECRET)
 * Endpoint: POST https://sense.shiprocket.in/v3/rto/predict
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// --- Config ---
const SENSE_URL = 'https://sense.shiprocket.in/v3/rto/predict';
const API_KEY = (process.env.SHIPROCKET_SENSE_API_KEY || '').trim();
const API_SECRET = (process.env.SHIPROCKET_SENSE_API_SECRET || '').trim();
const CONCURRENCY = 2;
const PER_REQUEST_TIMEOUT = 60000;
const CACHE_FILE = '/tmp/rto_cache.json';
const REPO_CACHE_FILE = path.join(__dirname, '..', 'data', 'rto_cache.json');

// --- In-memory cache ---
const rtoCache = new Map();
let cacheLoaded = false;

function getAuthHeader() {
    if (!API_KEY || !API_SECRET) return null;
    return 'Basic ' + Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64');
}

// --- Cache I/O ---
function loadCache() {
    if (cacheLoaded) return;

    // Priority 1: /tmp cache (warm Vercel instance)
    let loaded = 0;
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            for (const [k, v] of Object.entries(raw)) {
                const risk = v.risk || (v.aiRiskLevel ? v.aiRiskLevel.toLowerCase() : null);
                if (risk && risk !== 'unknown') {
                    rtoCache.set(k, v);
                    loaded++;
                }
            }
            console.log(`[SENSE] Loaded ${loaded} cached RTO results from /tmp.`);
        }
    } catch (e) {
        console.warn('[SENSE] /tmp cache load failed (non-fatal):', e.message);
    }

    // Priority 2: Bundled repo file (cold start fallback — survives deploys)
    if (loaded === 0) {
        try {
            if (fs.existsSync(REPO_CACHE_FILE)) {
                const raw = JSON.parse(fs.readFileSync(REPO_CACHE_FILE, 'utf8'));
                let repoLoaded = 0;
                for (const [k, v] of Object.entries(raw)) {
                    const risk = v.risk || (v.aiRiskLevel ? v.aiRiskLevel.toLowerCase() : null);
                    if (risk && risk !== 'unknown') {
                        rtoCache.set(k, v);
                        repoLoaded++;
                    }
                }
                if (repoLoaded > 0) {
                    console.log(`[SENSE] Loaded ${repoLoaded} cached RTO results from repo backup.`);
                    saveCache(); // Copy to /tmp for faster access
                }
            }
        } catch (e) {
            console.warn('[SENSE] Repo cache load failed (non-fatal):', e.message);
        }
    }

    cacheLoaded = true;
}

function saveCache() {
    try {
        const obj = Object.fromEntries(rtoCache);
        fs.writeFileSync(CACHE_FILE, JSON.stringify(obj));
    } catch (e) {
        console.warn('[SENSE] /tmp cache save failed (non-fatal):', e.message);
    }
    // Also save to repo-level backup (survives deploys + cold starts)
    try {
        const obj = Object.fromEntries(rtoCache);
        fs.writeFileSync(REPO_CACHE_FILE, JSON.stringify(obj));
    } catch (e) {
        // Expected to fail on Vercel (read-only filesystem outside /tmp)
    }
}

// --- Payment detection ---
function detectPayment(order) {
    const gateways = (order.paymentGatewayNames || []).join(' ').toLowerCase();
    if (gateways.includes('cash on delivery') || gateways.includes('manual') || gateways.includes('cod')) {
        return 'Cash on Delivery';
    }
    if (gateways.includes('razorpay') || gateways.includes('paytm') || gateways.includes('stripe') ||
        gateways.includes('paypal') || gateways.includes('phonepe') || gateways.includes('upi')) {
        return 'Prepaid';
    }
    if ((order.displayFinancialStatus || '') === 'PENDING') return 'Cash on Delivery';
    return 'Cash on Delivery';
}

// --- Default result ---
function defaultResult(fallbackReason) {
    return {
        risk: 'unknown',
        score: 0,
        probability: 0,
        reasons: [fallbackReason || 'RTO check unavailable'],
        reasonCodes: [],
        riskTags: [],
    };
}

// --- Build delivered-customer set ---
// Returns a Set of normalized phone numbers for customers who have a delivered/fulfilled order
function buildDeliveredCustomerSet(allOrders) {
    const delivered = new Set();
    for (const order of allOrders) {
        const status = (order.displayFulfillmentStatus || '').toUpperCase();
        if (status === 'FULFILLED' || status === 'DELIVERED') {
            const phone = normalizePhone(order);
            if (phone) delivered.add(phone);
        }
    }
    return delivered;
}

function normalizePhone(order) {
    let phone = order.shippingAddress?.phone || order.phone || order.customer?.phone || '';
    phone = phone.replace(/\D/g, '');
    if (phone.length > 10) phone = phone.slice(-10);
    return phone.length >= 10 ? phone : '';
}

// --- Single order prediction ---
async function predictSingleOrder(order, authHeader) {
    const shipping = order.shippingAddress || {};
    const phone = normalizePhone(order);

    const address = [shipping.address1 || '', shipping.address2 || '']
        .filter(Boolean).join(', ') || 'NA';

    const products = [];
    if (order.lineItems?.edges) {
        for (const edge of order.lineItems.edges) {
            const item = edge.node;
            products.push({
                name: item.title || 'Product',
                qty: item.quantity || 1,
                price: parseFloat(item.originalUnitPrice) || 0,
            });
        }
    }
    if (products.length === 0) {
        products.push({ name: 'Product', qty: 1, price: 0 });
    }

    const orderTotal = products.reduce((sum, p) => sum + (p.price * p.qty), 0);

    const payload = {
        customer: {
            mobile_no: phone,
            email: order.email || order.customer?.email || `${phone || 'customer'}@noemail.local`,
            address,
            pincode: shipping.zip || 'NA',
            city: shipping.city || 'NA',
            state: shipping.province || shipping.state || 'NA',
        },
        products,
        order_total: orderTotal,
        cod: 1,
        source_company: 'SR',
    };

    try {
        const res = await axios.post(SENSE_URL, payload, {
            headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
            timeout: PER_REQUEST_TIMEOUT,
        });

        if (res.data?.success && res.data?.data) {
            const d = res.data.data;
            return {
                risk: d.risk || 'unknown',
                score: d.score || 0,
                probability: d.model_probability || 0,
                reasons: (d.reasons || []).map(r => r.reason),
                reasonCodes: (d.reasons || []).map(r => r.reason_code),
                riskTags: (d.risk_tags || []).map(t => ({
                    code: t.code,
                    reason: t.reason,
                })),
            };
        }

        return defaultResult('Sense API returned unsuccessful response');
    } catch (e) {
        const status = e.response?.status;
        if (status === 402) {
            console.error('[SENSE] 402 — Sense wallet has no balance. Recharge at sense.shiprocket.in');
        } else if (status === 429) {
            // Rate limited — wait and retry once
            console.warn('[SENSE] Rate limited (429), retrying after 1.5s...');
            await new Promise(r => setTimeout(r, 1500));
            try {
                const retry = await axios.post(SENSE_URL, payload, {
                    headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
                    timeout: PER_REQUEST_TIMEOUT,
                });
                if (retry.data?.success && retry.data?.data) {
                    const d = retry.data.data;
                    return {
                        risk: d.risk || 'unknown',
                        score: d.score || 0,
                        probability: d.model_probability || 0,
                        reasons: (d.reasons || []).map(r => r.reason),
                        reasonCodes: (d.reasons || []).map(r => r.reason_code),
                        riskTags: (d.risk_tags || []).map(t => ({ code: t.code, reason: t.reason })),
                    };
                }
            } catch (retryErr) {
                console.warn('[SENSE] Retry also failed:', retryErr.message);
            }
        }
        return defaultResult(e.response?.data?.message || e.message);
    }
}

// --- Concurrency-limited executor ---
async function runWithConcurrency(tasks, limit) {
    const results = new Array(tasks.length);
    let idx = 0;

    const worker = async () => {
        while (idx < tasks.length) {
            const i = idx++;
            results[i] = await tasks[i]();
        }
    };

    await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()));
    return results;
}

// --- Main batch prediction ---
async function batchPredictRisk(shopifyOrders) {
    const results = {};

    // Load disk cache
    loadCache();

    const authHeader = getAuthHeader();
    if (!authHeader) {
        console.warn('[SENSE] No API key/secret configured — set SHIPROCKET_SENSE_API_KEY + SHIPROCKET_SENSE_API_SECRET');
        for (const order of shopifyOrders) {
            results[order.name || order.id] = defaultResult('Sense API credentials not configured');
        }
        return results;
    }

    // Build set of customers with delivered orders
    const deliveredCustomers = buildDeliveredCustomerSet(shopifyOrders);

    // Classify orders
    const pendingOrders = [];
    let skippedPrepaid = 0;
    let skippedDelivered = 0;
    let cachedCount = 0;

    for (const order of shopifyOrders) {
        const orderId = order.name || order.id;

        // 1. Check cache — only use successful predictions, re-check errors
        if (rtoCache.has(orderId)) {
            const cached = rtoCache.get(orderId);
            if (cached.risk && cached.risk !== 'unknown') {
                results[orderId] = cached;
                cachedCount++;
                continue;
            }
        }

        // 2. Skip fulfilled/delivered orders — only unfulfilled need RTO check
        const fulfillmentStatus = (order.displayFulfillmentStatus || '').toUpperCase();
        if (fulfillmentStatus === 'FULFILLED' || fulfillmentStatus === 'DELIVERED' || fulfillmentStatus === 'SHIPPED') {
            const result = defaultResult('Already fulfilled — RTO check skipped');
            result.risk = 'low';
            result.probability = 0.05;
            results[orderId] = result;
            rtoCache.set(orderId, result);
            continue;
        }

        // 3. Skip prepaid orders — COD only
        const payment = detectPayment(order);
        if (payment === 'Prepaid') {
            const result = defaultResult('Prepaid order — RTO check skipped');
            result.risk = 'low';
            result.probability = 0.05;
            results[orderId] = result;
            rtoCache.set(orderId, result);
            skippedPrepaid++;
            continue;
        }

        // 4. Skip customers with a delivered order in current batch
        const phone = normalizePhone(order);
        if (phone && deliveredCustomers.has(phone)) {
            const result = defaultResult('Repeat customer with delivered order — RTO check skipped');
            result.risk = 'low';
            result.probability = 0.1;
            results[orderId] = result;
            rtoCache.set(orderId, result);
            skippedDelivered++;
            continue;
        }

        // 5. Queue for Sense API call
        pendingOrders.push({ order, orderId });
    }

    console.log(`[SENSE] Batch: ${cachedCount} cached, ${skippedPrepaid} prepaid skipped, ${skippedDelivered} delivered-customer skipped, ${pendingOrders.length} to check via Sense API.`);

    if (pendingOrders.length > 0) {
        const tasks = pendingOrders.map(({ order, orderId }) => async () => {
            const result = await predictSingleOrder(order, authHeader);
            results[orderId] = result;
            if (result.risk && result.risk !== 'unknown') {
                rtoCache.set(orderId, result);
            }
        });

        try {
            await runWithConcurrency(tasks, CONCURRENCY);
        } catch (e) {
            console.warn(`[SENSE] ${e.message} — filling remaining with defaults`);
        }

        for (const { orderId } of pendingOrders) {
            if (!results[orderId]) {
                results[orderId] = defaultResult('RTO check failed');
            }
        }
    }

    // Save cache to disk
    saveCache();

    const checked = Object.values(results).filter(r => r.risk !== 'unknown').length;
    console.log(`[SENSE] Results: ${checked}/${shopifyOrders.length} with risk data.`);
    return results;
}

/**
 * Quick cache-only lookup — returns cached results without making API calls.
 * Used by /api/orders to return instant results for already-checked orders.
 */
function getCachedResults(shopifyOrders) {
    loadCache();
    const results = {};
    for (const order of shopifyOrders) {
        const orderId = order.name || order.id;
        if (rtoCache.has(orderId)) {
            const cached = rtoCache.get(orderId);
            // Skip cached errors — let them be re-checked
            const risk = cached.risk || (cached.aiRiskLevel ? cached.aiRiskLevel.toLowerCase() : null);
            if (risk && risk !== 'unknown') {
                results[orderId] = cached;
            }
        }
    }
    return results;
}

/**
 * Warm the server cache from frontend localStorage data.
 * Called on page load so server has cache even after cold start.
 */
function warmCache(cacheData) {
    loadCache();
    let added = 0;
    for (const [orderId, rto] of Object.entries(cacheData)) {
        if (rtoCache.has(orderId)) continue;

        // Accept both server format (risk) and frontend format (aiRiskLevel)
        const risk = rto.risk || (rto.aiRiskLevel ? rto.aiRiskLevel.toLowerCase() : null);
        if (!risk || risk === 'unknown') continue;

        // Normalize to server format if coming from frontend
        const entry = rto.risk ? rto : {
            risk: risk,
            score: rto.aiRiskScore || 0,
            probability: rto.aiRiskScore > 0 ? rto.aiRiskScore / 100 : 0,
            reasons: rto.aiRiskReasons || [],
            reasonCodes: [],
            riskTags: [],
            _warmed: true, // Mark as warmed from frontend (don't re-check)
        };
        rtoCache.set(orderId, entry);
        added++;
    }
    if (added > 0) {
        saveCache();
        console.log(`[SENSE] Warmed cache with ${added} entries from frontend. Total: ${rtoCache.size}`);
    }
    return { added, total: rtoCache.size };
}

/**
 * Export the full cache as a plain object (for GitHub backup).
 */
function exportCache() {
    loadCache();
    const obj = {};
    for (const [k, v] of rtoCache) {
        const risk = v.risk || (v.aiRiskLevel ? v.aiRiskLevel.toLowerCase() : null);
        if (risk && risk !== 'unknown') {
            obj[k] = v;
        }
    }
    return obj;
}

module.exports = {
    predictRisk: async () => defaultResult('Use batchPredictRisk instead'),
    batchPredictRisk,
    getCachedResults,
    warmCache,
    exportCache,
    detectPayment,
};
