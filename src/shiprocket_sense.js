/**
 * Shiprocket RTO Risk — via Shiprocket Shipping API
 *
 * Fetches orders from Shiprocket Shipping API which includes
 * rto_risk, rto_prediction, rto_reason, and rto_show for each order.
 * This is FREE — no Sense credits needed.
 *
 * Auth: SHIPROCKET_TOKEN (static Bearer token) or SHIPROCKET_EMAIL+PASSWORD
 * Endpoint: GET https://apiv2.shiprocket.in/v1/external/orders
 */

const axios = require('axios');

const SR_API_BASE = 'https://apiv2.shiprocket.in/v1/external';
const SR_STATIC_TOKEN = (process.env.SHIPROCKET_TOKEN || '').trim();
const SR_EMAIL = (process.env.SHIPROCKET_EMAIL || '').trim();
const SR_PASSWORD = (process.env.SHIPROCKET_PASSWORD || '').trim();

let srToken = null;
let srTokenExpiry = null;

async function getSRToken() {
    if (SR_STATIC_TOKEN) return SR_STATIC_TOKEN;
    if (srToken && srTokenExpiry && Date.now() < srTokenExpiry) return srToken;
    if (!SR_EMAIL || !SR_PASSWORD) {
        console.warn('[SHIPROCKET] No credentials — set SHIPROCKET_TOKEN or SHIPROCKET_EMAIL+PASSWORD.');
        return null;
    }
    try {
        const res = await axios.post(`${SR_API_BASE}/auth/login`, {
            email: SR_EMAIL, password: SR_PASSWORD,
        }, { timeout: 10000 });
        srToken = res.data?.token;
        srTokenExpiry = Date.now() + 9 * 24 * 60 * 60 * 1000;
        console.log('[SHIPROCKET] Auth token obtained.');
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

/**
 * Fetch RTO risk from Shiprocket Shipping API for all orders.
 * The API returns rto_risk, rto_prediction, rto_reason for each order.
 */
async function batchPredictRisk(shopifyOrders) {
    const results = {};
    const token = await getSRToken();

    if (!token) {
        for (const order of shopifyOrders) {
            results[order.name || order.id] = defaultResult('Shiprocket credentials not configured');
        }
        return results;
    }

    try {
        // Fetch Shiprocket orders (they contain RTO data)
        const rtoMap = {};
        let page = 1;
        const maxPages = process.env.VERCEL ? 3 : 10;
        const perPage = process.env.VERCEL ? 20 : 100;

        while (page <= maxPages) {
            console.log(`[SHIPROCKET] Fetching page ${page} (per_page=${perPage})...`);
            const res = await axios.get(`${SR_API_BASE}/orders`, {
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                params: { per_page: perPage, page, sort_by: 'created_at', sort: 'desc' },
                timeout: 7000,
            });

            const orders = res.data?.data || [];
            if (orders.length === 0) break;

            for (const sr of orders) {
                const channelId = sr.channel_order_id?.toString() || '';
                if (!channelId) continue;

                const riskLevel = (sr.rto_risk || sr.rto_prediction || '').toLowerCase();
                const reason = sr.rto_reason || '';

                rtoMap[channelId] = { risk: riskLevel, reason };
                rtoMap[`#${channelId}`] = { risk: riskLevel, reason };
            }

            if (orders.length < perPage) break;
            page++;
        }

        console.log(`[SHIPROCKET] Fetched RTO for ${Object.keys(rtoMap).length / 2} orders (${page} pages).`);

        // Match to Shopify orders
        for (const order of shopifyOrders) {
            const orderId = order.name || order.id;
            const cleanId = orderId?.toString().replace('#', '');
            const sr = rtoMap[orderId] || rtoMap[cleanId] || rtoMap[`#${cleanId}`];

            if (sr && sr.risk && sr.risk !== 'unknown' && sr.risk !== '') {
                results[orderId] = {
                    risk: sr.risk,
                    score: sr.risk === 'high' || sr.risk === 'very high' ? 0.8 : sr.risk === 'low' ? 0.2 : 0.5,
                    probability: sr.risk === 'high' || sr.risk === 'very high' ? 0.8 : sr.risk === 'low' ? 0.2 : 0.5,
                    reasons: sr.reason ? [sr.reason] : [`RTO risk: ${sr.risk}`],
                    reasonCodes: [],
                    riskTags: [],
                };
            } else {
                results[orderId] = defaultResult('Order not found in Shiprocket');
            }
        }
    } catch (e) {
        console.error('[SHIPROCKET] RTO fetch error:', e.response?.status, e.response?.data?.message || e.message);
        for (const order of shopifyOrders) {
            const orderId = order.name || order.id;
            if (!results[orderId]) {
                results[orderId] = defaultResult(e.message);
            }
        }
    }

    const checked = Object.values(results).filter(r => r.risk !== 'unknown').length;
    console.log(`[SHIPROCKET] RTO: ${checked}/${shopifyOrders.length} orders with risk data.`);
    return results;
}

module.exports = {
    predictRisk: async () => defaultResult('Use batchPredictRisk instead'),
    batchPredictRisk,
    detectPayment,
};
