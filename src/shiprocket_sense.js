/**
 * Shiprocket Sense API — RTO Risk Prediction
 *
 * Uses Shiprocket's cross-merchant buyer intelligence (4.8B data points)
 * to predict RTO risk for ALL orders (COD and Prepaid).
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
 * Detect payment method from Shopify order data.
 * Checks gateway names first (most reliable), then falls back to financial status.
 */
function detectPayment(order) {
    const gateways = (order.paymentGatewayNames || []).join(' ').toLowerCase();

    // COD indicators — check these first
    if (gateways.includes('cash on delivery') ||
        gateways.includes('manual') ||
        gateways.includes('cod')) {
        return 'Cash on Delivery';
    }

    // Prepaid indicators — explicit online payment gateways
    if (gateways.includes('razorpay') ||
        gateways.includes('paytm') ||
        gateways.includes('stripe') ||
        gateways.includes('paypal') ||
        gateways.includes('phonepe') ||
        gateways.includes('upi')) {
        return 'Prepaid';
    }

    // Fallback: check financial status (less reliable — COD collected also shows PAID)
    const financialStatus = order.displayFinancialStatus || '';
    if (financialStatus === 'PENDING') {
        return 'Cash on Delivery';
    }

    // Default to COD if uncertain — safer for RTO prediction
    return 'Cash on Delivery';
}

/**
 * Predict RTO risk for a single order via Shiprocket Sense.
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

        return defaultResult('API returned unsuccessful response');
    } catch (e) {
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
 * Batch predict RTO risk for ALL orders (COD and Prepaid).
 * Runs predictions in parallel (capped concurrency) with a global timeout.
 */
async function batchPredictRisk(orders, paymentMap = {}) {
    const results = {};
    const allPredictions = [];

    for (const order of orders) {
        const orderId = order.name || order.id;
        const payment = paymentMap[orderId] || detectPayment(order);
        allPredictions.push({ order, orderId, payment });
    }

    const CONCURRENCY = 5;
    const GLOBAL_TIMEOUT_MS = process.env.VERCEL ? 6000 : 30000;

    const runPredictions = async () => {
        let i = 0;
        const next = async () => {
            if (i >= allPredictions.length) return;
            const idx = i++;
            const { order, orderId, payment } = allPredictions[idx];
            results[orderId] = await predictRisk(order, payment);
            return next();
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, allPredictions.length) }, () => next()));
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
    for (const { orderId } of allPredictions) {
        if (!results[orderId]) {
            results[orderId] = defaultResult('RTO check timed out');
        }
    }

    const checked = allPredictions.filter(c => results[c.orderId]?.risk !== 'unknown' || results[c.orderId]?.reasons?.[0] !== 'RTO check timed out').length;
    console.log(`[SENSE] Batch RTO: ${checked}/${allPredictions.length} orders checked.`);
    return results;
}

module.exports = {
    predictRisk,
    batchPredictRisk,
    detectPayment,
};
