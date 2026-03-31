/**
 * Shiprocket RTO Risk — Dual Strategy
 *
 * Strategy 1 (preferred): Shiprocket Shipping API — GET /orders returns rto_risk
 *   for each order. Fast batch fetch, no per-order API calls.
 *   Requires: SHIPROCKET_TOKEN or SHIPROCKET_EMAIL+PASSWORD
 *
 * Strategy 2 (fallback): Shiprocket Sense API — POST per-order prediction.
 *   Slower, uses credits. Only used if Shipping API not configured.
 *   Requires: SHIPROCKET_SENSE_API_KEY + SHIPROCKET_SENSE_API_SECRET
 */

const axios = require('axios');

// --- Shiprocket Shipping API config ---
const SR_API_BASE = 'https://apiv2.shiprocket.in/v1/external';
const SR_STATIC_TOKEN = (process.env.SHIPROCKET_TOKEN || '').trim();
const SR_EMAIL = (process.env.SHIPROCKET_EMAIL || '').trim();
const SR_PASSWORD = (process.env.SHIPROCKET_PASSWORD || '').trim();

// --- Shiprocket Sense API config ---
const SENSE_URL = 'https://sense.shiprocket.in/v3/rto/predict';
const SENSE_API_KEY = (process.env.SHIPROCKET_SENSE_API_KEY || 'kmvl9y5PGP57Z5v1').trim();
const SENSE_API_SECRET = (process.env.SHIPROCKET_SENSE_API_SECRET || 'd70a717ecbd8fd337afb1635c03907c27d70').trim();
const SENSE_AUTH = 'Basic ' + Buffer.from(`${SENSE_API_KEY}:${SENSE_API_SECRET}`).toString('base64');

let srToken = null;
let srTokenExpiry = null;

/**
 * Get Shiprocket Bearer token for Shipping API.
 */
async function getSRToken() {
    if (SR_STATIC_TOKEN) return SR_STATIC_TOKEN;
    if (srToken && srTokenExpiry && Date.now() < srTokenExpiry) return srToken;
    if (!SR_EMAIL || !SR_PASSWORD) return null;

    try {
        const res = await axios.post(`${SR_API_BASE}/auth/login`, {
            email: SR_EMAIL, password: SR_PASSWORD,
        }, { timeout: 10000 });
        srToken = res.data?.token;
        srTokenExpiry = Date.now() + 9 * 24 * 60 * 60 * 1000;
        console.log('[SHIPROCKET] Auth token obtained via login.');
        return srToken;
    } catch (e) {
        console.error('[SHIPROCKET] Login failed:', e.response?.data?.message || e.message);
        return null;
    }
}

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

// ─── Strategy 1: Shiprocket Shipping API (batch, fast) ───

async function batchViaShippingAPI(shopifyOrders) {
    const token = await getSRToken();
    if (!token) {
        console.log('[SHIPROCKET] No token available for Shipping API.');
        return null;
    }
    console.log(`[SHIPROCKET] Shipping API: token available (${token.length} chars), fetching orders...`);

    const results = {};
    try {
        const rtoMap = {};
        let page = 1;
        const maxPages = process.env.VERCEL ? 2 : 10;
        const perPage = process.env.VERCEL ? 50 : 100;

        while (page <= maxPages) {
            const res = await axios.get(`${SR_API_BASE}/orders`, {
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                params: { per_page: perPage, page, sort_by: 'created_at', sort: 'desc' },
                timeout: 6000,
            });

            const orders = res.data?.data || [];
            if (orders.length === 0) break;

            for (const srOrder of orders) {
                const channelId = srOrder.channel_order_id?.toString() || '';
                if (channelId) {
                    rtoMap[channelId] = {
                        risk: srOrder.rto_risk || srOrder.rto_prediction || 'unknown',
                        reason: srOrder.rto_reason || '',
                    };
                    rtoMap[`#${channelId}`] = rtoMap[channelId];
                }
            }

            if (orders.length < 100) break;
            page++;
            await new Promise(r => setTimeout(r, 200));
        }

        console.log(`[SHIPROCKET] Shipping API: fetched RTO for ${Object.keys(rtoMap).length / 2} orders (${page} pages).`);

        for (const order of shopifyOrders) {
            const orderId = order.name || order.id;
            const cleanId = orderId?.toString().replace('#', '');
            const srData = rtoMap[orderId] || rtoMap[cleanId] || rtoMap[`#${cleanId}`];

            if (srData && srData.risk && srData.risk !== 'unknown') {
                const riskLevel = srData.risk.toLowerCase();
                results[orderId] = {
                    risk: riskLevel,
                    score: riskLevel === 'high' || riskLevel === 'very high' ? 0.8 : riskLevel === 'low' ? 0.2 : 0.5,
                    probability: riskLevel === 'high' || riskLevel === 'very high' ? 0.8 : riskLevel === 'low' ? 0.2 : 0.5,
                    reasons: srData.reason ? [srData.reason] : [`RTO risk: ${riskLevel}`],
                    reasonCodes: [],
                    riskTags: [],
                };
            } else {
                results[orderId] = defaultResult('No RTO data from Shiprocket');
            }
        }

        return results;
    } catch (e) {
        console.error('[SHIPROCKET] Shipping API error:', e.response?.status, e.response?.data?.message || e.message);
        return null; // Fall back to Sense
    }
}

// ─── Strategy 2: Shiprocket Sense API (per-order, slower) ───

async function predictRiskViaSense(order, paymentMethod) {
    const shipping = order.shippingAddress || {};
    let phone = shipping.phone || order.phone || order.customer?.phone || '';
    phone = phone.replace(/\D/g, '');
    if (phone.length > 10) phone = phone.slice(-10);

    const address = [shipping.address1 || '', shipping.address2 || ''].filter(Boolean).join(', ') || 'NA';

    const products = [];
    if (order.lineItems?.edges) {
        for (const edge of order.lineItems.edges) {
            const item = edge.node;
            products.push({ name: item.title || 'Product', qty: item.quantity || 1, price: parseFloat(item.originalUnitPrice) || 0 });
        }
    }
    if (products.length === 0) products.push({ name: 'Product', qty: 1, price: 0 });

    const orderTotal = products.reduce((sum, p) => sum + (p.price * p.qty), 0);

    const payload = {
        customer: {
            mobile_no: phone,
            email: order.email || order.customer?.email || '',
            address, pincode: shipping.zip || '',
            city: shipping.city || '', state: shipping.province || '',
        },
        products, order_total: orderTotal,
        cod: paymentMethod === 'COD' || paymentMethod === 'Cash on Delivery' ? 1 : 0,
        source_company: 'SR',
    };

    try {
        const res = await axios.post(SENSE_URL, payload, {
            headers: { 'Content-Type': 'application/json', 'Authorization': SENSE_AUTH },
            timeout: 10000,
        });

        if (res.data?.success && res.data?.data) {
            const d = res.data.data;
            return {
                risk: d.risk || 'unknown', score: d.score || 0, probability: d.model_probability || 0,
                reasons: (d.reasons || []).map(r => r.reason),
                reasonCodes: (d.reasons || []).map(r => r.reason_code),
                riskTags: (d.risk_tags || []).map(t => ({ code: t.code, reason: t.reason })),
            };
        }
        return defaultResult('Sense API returned unsuccessful response');
    } catch (e) {
        const errMsg = e.response?.data?.errors?.[0]?.message || e.message;
        return defaultResult(errMsg);
    }
}

async function batchViaSense(shopifyOrders, paymentMap = {}) {
    const results = {};

    // Only predict unfulfilled orders to save credits
    const toPredict = [];
    for (const order of shopifyOrders) {
        const orderId = order.name || order.id;
        const status = (order.displayFulfillmentStatus || '').toUpperCase();
        if (status === 'FULFILLED' || status === 'SHIPPED' || status === 'DELIVERED') {
            results[orderId] = defaultResult('Already fulfilled — RTO check skipped');
        } else {
            toPredict.push({ order, orderId, payment: paymentMap[orderId] || detectPayment(order) });
        }
    }

    // Cap at 10 orders on Vercel to stay within timeout
    const maxPredictions = process.env.VERCEL ? 10 : 50;
    const limited = toPredict.slice(0, maxPredictions);
    if (toPredict.length > maxPredictions) {
        console.log(`[SENSE] Capping predictions to ${maxPredictions} (${toPredict.length} unfulfilled).`);
        for (const { orderId } of toPredict.slice(maxPredictions)) {
            results[orderId] = defaultResult('RTO check skipped (batch limit)');
        }
    }

    const CONCURRENCY = 3;
    const TIMEOUT_MS = process.env.VERCEL ? 6000 : 30000;

    const run = async () => {
        let i = 0;
        const next = async () => {
            if (i >= limited.length) return;
            const { order, orderId, payment } = limited[i++];
            results[orderId] = await predictRiskViaSense(order, payment);
            return next();
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, limited.length) }, () => next()));
    };

    try {
        await Promise.race([run(), new Promise((_, rej) => setTimeout(() => rej(new Error('Sense batch timeout')), TIMEOUT_MS))]);
    } catch (e) {
        console.warn(`[SENSE] ${e.message}`);
    }

    for (const { orderId } of limited) {
        if (!results[orderId]) results[orderId] = defaultResult('RTO check timed out');
    }

    return results;
}

// ─── Main entry point ───

async function batchPredictRisk(shopifyOrders, paymentMap = {}) {
    // Strategy 1: Try Shiprocket Shipping API (fast batch fetch)
    const shippingResult = await batchViaShippingAPI(shopifyOrders);
    if (shippingResult) {
        const checked = Object.values(shippingResult).filter(r => r.risk !== 'unknown').length;
        console.log(`[RTO] Shipping API: ${checked}/${shopifyOrders.length} orders with risk data.`);
        return shippingResult;
    }

    // Strategy 2: Fall back to Sense API (per-order, slower)
    console.log('[RTO] Shipping API unavailable, falling back to Sense API...');
    const senseResult = await batchViaSense(shopifyOrders, paymentMap);
    const checked = Object.values(senseResult).filter(r => r.risk !== 'unknown').length;
    console.log(`[RTO] Sense API: ${checked}/${shopifyOrders.length} orders with risk data.`);
    return senseResult;
}

module.exports = {
    predictRisk: predictRiskViaSense,
    batchPredictRisk,
    detectPayment,
};
