/**
 * Shiprocket RTO Risk — via Shiprocket Shipping API
 *
 * Uses the main Shiprocket order listing API which includes RTO risk
 * data (rto_risk, rto_prediction, rto_reason) for each order.
 * No separate Sense API needed — RTO data comes free with orders.
 *
 * Auth: Bearer token from Shiprocket login API
 * Endpoint: GET https://apiv2.shiprocket.in/v1/external/orders
 */

const axios = require('axios');

const SR_API_BASE = 'https://apiv2.shiprocket.in/v1/external';
const SR_EMAIL = (process.env.SHIPROCKET_EMAIL || '').trim();
const SR_PASSWORD = (process.env.SHIPROCKET_PASSWORD || '').trim();

let srToken = null;
let srTokenExpiry = null;

/**
 * Get Shiprocket Bearer token (cached for 24h).
 */
async function getSRToken() {
    if (srToken && srTokenExpiry && Date.now() < srTokenExpiry) return srToken;
    if (!SR_EMAIL || !SR_PASSWORD) {
        console.warn('[SHIPROCKET] No credentials configured — RTO risk unavailable.');
        return null;
    }
    try {
        const res = await axios.post(`${SR_API_BASE}/auth/login`, {
            email: SR_EMAIL,
            password: SR_PASSWORD,
        }, { timeout: 10000 });
        srToken = res.data?.token;
        srTokenExpiry = Date.now() + 23 * 60 * 60 * 1000; // 23 hours
        console.log('[SHIPROCKET] Auth token obtained.');
        return srToken;
    } catch (e) {
        console.error('[SHIPROCKET] Login failed:', e.response?.data?.message || e.message);
        return null;
    }
}

/**
 * Detect payment method from Shopify order data.
 */
function detectPayment(order) {
    const gateways = (order.paymentGatewayNames || []).join(' ').toLowerCase();
    if (gateways.includes('cash on delivery') || gateways.includes('manual') || gateways.includes('cod')) {
        return 'Cash on Delivery';
    }
    if (gateways.includes('razorpay') || gateways.includes('paytm') || gateways.includes('stripe') ||
        gateways.includes('paypal') || gateways.includes('phonepe') || gateways.includes('upi')) {
        return 'Prepaid';
    }
    if ((order.displayFinancialStatus || '') === 'PENDING') {
        return 'Cash on Delivery';
    }
    return 'Cash on Delivery';
}

/**
 * Fetch RTO risk data from Shiprocket for all orders.
 * Returns a map: { "#orderId": { risk, reasons, ... }, ... }
 */
async function batchPredictRisk(shopifyOrders) {
    const results = {};
    const token = await getSRToken();
    if (!token) {
        // Fill all with defaults
        for (const order of shopifyOrders) {
            const orderId = order.name || order.id;
            results[orderId] = defaultResult('Shiprocket credentials not configured');
        }
        return results;
    }

    try {
        // Fetch orders from Shiprocket (they contain RTO risk data)
        const rtoMap = {};
        let page = 1;
        const maxPages = process.env.VERCEL ? 3 : 10;

        while (page <= maxPages) {
            const res = await axios.get(`${SR_API_BASE}/orders`, {
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                params: { per_page: 100, page, sort_by: 'created_at', sort: 'desc' },
                timeout: 8000,
            });

            const orders = res.data?.data || [];
            if (orders.length === 0) break;

            for (const srOrder of orders) {
                const channelId = srOrder.channel_order_id?.toString() || '';
                if (channelId) {
                    rtoMap[channelId] = {
                        risk: srOrder.rto_risk || srOrder.rto_prediction || 'unknown',
                        reason: srOrder.rto_reason || '',
                        show: srOrder.rto_show || 0,
                    };
                    rtoMap[`#${channelId}`] = rtoMap[channelId];
                }
            }

            if (orders.length < 100) break;
            page++;
            await new Promise(r => setTimeout(r, 200));
        }

        console.log(`[SHIPROCKET] Fetched RTO data for ${Object.keys(rtoMap).length / 2} orders (${page} pages).`);

        // Match Shopify orders to Shiprocket RTO data
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
    } catch (e) {
        console.error('[SHIPROCKET] RTO fetch error:', e.message);
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

module.exports = {
    batchPredictRisk,
    detectPayment,
};
