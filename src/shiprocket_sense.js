/**
 * Shiprocket Sense API — RTO Risk Prediction
 *
 * Uses Shiprocket's cross-merchant buyer intelligence (4.8B data points)
 * to predict RTO risk for COD orders.
 *
 * Endpoint: POST https://sense.shiprocket.in/v3/rto/predict
 * Auth: Basic (api_key:api_secret)
 */

const axios = require('axios');

const SENSE_URL = 'https://sense.shiprocket.in/v3/rto/predict';
const API_KEY = process.env.SHIPROCKET_SENSE_API_KEY || 'kmvl9y5PGP57Z5v1';
const API_SECRET = process.env.SHIPROCKET_SENSE_API_SECRET || 'd70a717ecbd8fd337afb1635c03907c27d70';

const BASIC_AUTH = 'Basic ' + Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64');

/**
 * Predict RTO risk for a single order via Shiprocket Sense.
 *
 * @param {Object} order - Shopify order object
 * @param {string} paymentMethod - 'COD' or 'Prepaid'
 * @returns {{ risk: string, reasons: string[], riskTags: Object[], score: number, probability: number }}
 */
async function predictRisk(order, paymentMethod) {
    const shipping = order.shippingAddress || {};
    let phone = shipping.phone || order.phone || order.customer?.phone || '';
    phone = phone.replace(/\D/g, '');
    if (phone.length > 10) phone = phone.slice(-10);

    const address = [
        shipping.address1 || '',
        shipping.address2 || '',
    ].filter(Boolean).join(', ') || 'NA';

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
            email: order.email || order.customer?.email || '',
            address: address,
            pincode: shipping.zip || '',
            city: shipping.city || '',
            state: shipping.province || '',
        },
        products,
        order_total: orderTotal,
        cod: paymentMethod === 'COD' || paymentMethod === 'Cash on Delivery' ? 1 : 0,
        source_company: 'SR',
    };

    try {
        const res = await axios.post(SENSE_URL, payload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': BASIC_AUTH,
            },
            timeout: 10000,
        });

        if (res.data?.success && res.data?.data) {
            const d = res.data.data;
            return {
                risk: d.risk || 'unknown',       // "low", "high", "very high"
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

        return defaultResult('API returned unsuccessful response');
    } catch (e) {
        // Retry once on rate limit (429)
        if (e.response?.status === 429) {
            console.warn(`[SENSE] Rate limited, retrying after 2s...`);
            await new Promise(r => setTimeout(r, 2000));
            try {
                const retry = await axios.post(SENSE_URL, payload, {
                    headers: { 'Content-Type': 'application/json', 'Authorization': BASIC_AUTH },
                    timeout: 10000,
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
                console.error(`[SENSE] Retry also failed:`, retryErr.message);
            }
        }
        const errMsg = e.response?.data?.errors?.[0]?.message || e.message;
        console.error(`[SENSE] Predict failed for order ${order.name || '?'}:`, errMsg);
        return defaultResult(errMsg);
    }
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
 * Batch predict RTO risk for multiple orders.
 * Runs COD predictions in parallel (capped concurrency) with a global timeout
 * so the endpoint never hangs on Vercel serverless.
 *
 * @param {Object[]} orders - Array of Shopify order objects
 * @param {Object} paymentMap - Map of orderId → paymentMethod
 * @returns {Object} Map of orderId → risk result
 */
async function batchPredictRisk(orders, paymentMap = {}) {
    const results = {};
    const codOrders = [];

    for (const order of orders) {
        const orderId = order.name || order.id;
        const payment = paymentMap[orderId] || detectPayment(order);

        if (payment !== 'COD' && payment !== 'Cash on Delivery') {
            results[orderId] = {
                risk: 'low',
                score: 0,
                probability: 0,
                reasons: ['Prepaid order (low risk)'],
                reasonCodes: [],
                riskTags: [],
            };
        } else {
            codOrders.push({ order, orderId, payment });
        }
    }

    // Run COD predictions with concurrency limit and global timeout
    const CONCURRENCY = 5;
    const GLOBAL_TIMEOUT_MS = process.env.VERCEL ? 6000 : 30000;

    const runPredictions = async () => {
        let i = 0;
        const next = async () => {
            if (i >= codOrders.length) return;
            const idx = i++;
            const { order, orderId, payment } = codOrders[idx];
            results[orderId] = await predictRisk(order, payment);
            return next();
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, codOrders.length) }, () => next()));
    };

    try {
        await Promise.race([
            runPredictions(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Sense batch timeout')), GLOBAL_TIMEOUT_MS)),
        ]);
    } catch (e) {
        console.warn(`[SENSE] ${e.message} — filling remaining with defaults`);
    }

    // Fill any orders that didn't complete in time
    for (const { orderId } of codOrders) {
        if (!results[orderId]) {
            results[orderId] = defaultResult('RTO check timed out');
        }
    }

    const checked = codOrders.filter(c => results[c.orderId]?.risk !== 'unknown' || results[c.orderId]?.reasons?.[0] !== 'RTO check timed out').length;
    console.log(`[SENSE] Batch RTO: ${checked}/${codOrders.length} COD checked, ${orders.length - codOrders.length} prepaid skipped.`);
    return results;
}

function detectPayment(order) {
    const financialStatus = order.displayFinancialStatus || '';
    const gateways = (order.paymentGatewayNames || []).join(' ').toLowerCase();

    if (financialStatus === 'PAID' ||
        gateways.includes('razorpay') ||
        gateways.includes('paytm') ||
        gateways.includes('stripe') ||
        gateways.includes('paypal')) {
        return 'Prepaid';
    }
    return 'Cash on Delivery';
}

module.exports = {
    predictRisk,
    batchPredictRisk,
};
