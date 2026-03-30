const axios = require('axios');
require('dotenv').config();

/**
 * RapidShyp Public API Integration
 *
 * Uses the public API (rapidshyp-token header) for shipping operations.
 * Note: The public API only supports action endpoints (create, ship, track, cancel, label).
 * Order listing and wallet balance require the session/JWT API which is not available.
 *
 * Orders are fetched from Shopify directly. RTO prediction uses Shiprocket Sense API.
 */

const PUBLIC_API_BASE = 'https://api.rapidshyp.com/rapidshyp/apis/v1';
const SESSION_API_BASE = 'https://api.rapidshyp.com/session/seller';

const rsApi = axios.create({ timeout: process.env.VERCEL ? 8000 : 30000 });

rsApi.interceptors.response.use(
    (response) => response,
    async (error) => {
        const config = error.config;
        if (error.response?.status === 429 && (!config._retryCount || config._retryCount < 3)) {
            config._retryCount = (config._retryCount || 0) + 1;
            const delay = Math.pow(2, config._retryCount) * 1000;
            console.warn(`[RAPIDSHYP] Rate limited. Retrying in ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
            return rsApi(config);
        }
        return Promise.reject(error);
    }
);

/**
 * Get headers for the public API (API key via rapidshyp-token).
 */
const getPublicHeaders = () => {
    const apiKey = process.env.RAPIDSHYP_API_KEY;
    if (!apiKey) throw new Error('RAPIDSHYP_API_KEY is not set in .env');
    return {
        'Content-Type': 'application/json',
        'rapidshyp-token': apiKey
    };
};

/**
 * Get headers for the session API (JWT Bearer token) — optional.
 * Returns null if JWT is not configured (graceful degradation).
 */
const getSessionHeaders = () => {
    const jwt = process.env.RAPIDSHYP_JWT;
    if (!jwt) return null;
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`
    };
};

const mapRTORisk = (score) => {
    if (score === 0) return 'High';
    if (score === 1) return 'Medium';
    if (score === 2) return 'Low';
    return 'Unknown';
};

const buildRTOReason = (addressScore) => {
    if (!addressScore) return '';
    const parts = [];
    if (addressScore.invalid_address === 1) parts.push('Invalid address detected');
    if (addressScore.landmark === 0) parts.push('No landmark found');
    if (addressScore.house_number === 0) parts.push('Missing house number');
    if (addressScore.address_length === 0) parts.push('Address too short');
    if (addressScore.address_entities === 0) parts.push('Incomplete address details');
    if (addressScore.pin_code_score === 0) parts.push(`Risky pincode area (${(addressScore.pin_code_probability * 100).toFixed(0)}% RTO rate)`);
    if (addressScore.buyer_experience_score === 0) parts.push('First-time/risky buyer');
    if (addressScore.buyer_experience_score === 1 && addressScore.buyer_experience_probability > 0.3) {
        parts.push(`Moderate buyer risk (${(addressScore.buyer_experience_probability * 100).toFixed(0)}%)`);
    }
    return parts.join('; ') || 'No specific risk factors';
};

/**
 * Fetch orders from RapidShyp. Requires JWT (session API) for order listing.
 * If JWT is not available, returns empty gracefully — orders come from Shopify instead.
 */
const fetchOrdersWithRTO = async (status = 'ALL', maxPages = 10) => {
    const sessionHeaders = getSessionHeaders();
    if (!sessionHeaders) {
        console.log('[RAPIDSHYP] No JWT configured — skipping order fetch (orders come from Shopify).');
        return { success: false, data: [], message: 'JWT not configured' };
    }

    try {
        let allOrders = [];
        let page = 1;
        let hasMore = true;

        while (hasMore && page <= maxPages) {
            const body = { page, limit: 100 };
            if (status && status !== 'ALL') body.status = status;

            const response = await rsApi.post(`${SESSION_API_BASE}/orders/get_orders`, body, { headers: sessionHeaders });
            const records = response.data?.records || [];

            if (records.length === 0) {
                hasMore = false;
                break;
            }

            const normalized = records.map(order => ({
                order_id: order.order_id,
                seller_order_id: order.seller_order_id,
                channel_order_id: order.seller_order_id?.replace('#', ''),
                market_place_order_id: order.market_place_order_id,
                rto_prediction: mapRTORisk(order.address_score?.rto_risk_score),
                rto_reason: buildRTOReason(order.address_score),
                address_score: order.address_score,
                order_status: order.order_status,
                payment_method: order.payment_method,
                contact_name: order.contact_name,
                contact_details: order.contact_details,
                total_order_value: order.total_order_value,
                store_name: order.store_name,
                created_on: order.created_on,
                awb_number: order.awb_number || "",
                id: order.order_id
            }));

            allOrders = allOrders.concat(normalized);

            if (records.length < 100) {
                hasMore = false;
            } else {
                page++;
                await new Promise(r => setTimeout(r, 200));
            }
        }

        console.log(`[RAPIDSHYP] Fetched ${allOrders.length} orders (${page} pages).`);
        return { success: true, data: allOrders };
    } catch (e) {
        console.error('[RAPIDSHYP] fetchOrdersWithRTO Error:', e.response?.status, e.response?.data || e.message);
        return { success: false, data: [] };
    }
};

/**
 * Cancel an order on RapidShyp.
 * Uses session API for order lookup (if JWT available), then public API for cancellation.
 * If no JWT, attempts direct cancel by order name.
 */
const cancelOrder = async (channelOrderId) => {
    try {
        const headers = getPublicHeaders();
        const cleanId = channelOrderId.toString().replace('#', '');

        // Try to find the order via session API (if JWT available)
        const sessionHeaders = getSessionHeaders();
        let match = null;

        if (sessionHeaders) {
            try {
                const searchRes = await rsApi.post(`${SESSION_API_BASE}/orders/get_orders`, {
                    search: cleanId, page: 1, limit: 10
                }, { headers: sessionHeaders });
                const records = searchRes.data?.records || [];
                match = records.find(r =>
                    r.seller_order_id === `#${cleanId}` || r.seller_order_id === cleanId
                );
            } catch (searchErr) {
                console.warn(`[RAPIDSHYP] Session search failed: ${searchErr.response?.status || searchErr.message}`);
            }
        }

        if (!match) {
            // Without JWT, we can't search for the RS order ID.
            // Try cancelling with the channel order ID directly.
            console.log(`[RAPIDSHYP] No JWT / order not found. Attempting cancel with channel ID ${cleanId}...`);
            try {
                const cancelRes = await rsApi.post(`${PUBLIC_API_BASE}/cancel_order`, {
                    orderId: cleanId,
                }, { headers });
                return { success: true, data: cancelRes.data };
            } catch (directErr) {
                // Try with # prefix
                try {
                    const cancelRes = await rsApi.post(`${PUBLIC_API_BASE}/cancel_order`, {
                        orderId: `#${cleanId}`,
                    }, { headers });
                    return { success: true, data: cancelRes.data };
                } catch (prefixErr) {
                    const msg = directErr.response?.data?.message || directErr.message;
                    console.warn(`[RAPIDSHYP] Direct cancel failed for ${cleanId}: ${msg}`);
                    return { success: false, message: `Could not cancel: ${msg}. JWT needed for order lookup.` };
                }
            }
        }

        if ((match.order_status || '').toLowerCase().includes('cancel')) {
            return { success: true, message: 'Already cancelled' };
        }

        const cancelRes = await rsApi.post(`${PUBLIC_API_BASE}/cancel_order`, {
            orderId: match.order_id,
            storeName: match.store_name || 'DEFAULT'
        }, { headers });

        console.log(`[RAPIDSHYP] Cancelled ${cleanId}:`, cancelRes.data);
        return { success: true, data: cancelRes.data };

    } catch (e) {
        const errMsg = e.response?.data?.message || e.response?.data || e.message;
        console.error(`[RAPIDSHYP] Cancel Failed for ${channelOrderId}:`, errMsg);
        return { success: false, message: typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg) };
    }
};

/**
 * Track a shipment by AWB number (public API — works with API key).
 */
const trackOrder = async (awb) => {
    try {
        const headers = getPublicHeaders();
        const response = await rsApi.post(`${PUBLIC_API_BASE}/track_order`, { awb }, { headers });
        return { success: true, data: response.data };
    } catch (e) {
        console.error(`[RAPIDSHYP] Tracking Error:`, e.response?.data || e.message);
        return { success: false, data: null };
    }
};

/**
 * Generate Shipping Label(s) (public API — works with API key).
 */
const generateLabel = async (orderIds) => {
    try {
        const headers = getPublicHeaders();
        console.log(`[RAPIDSHYP] Generating label for orders:`, orderIds);
        const response = await rsApi.post(`${PUBLIC_API_BASE}/generate_label`, {
            orderId: orderIds
        }, { headers });

        console.log(`[RAPIDSHYP] Label API Response:`, response.data);
        return { success: true, data: response.data };
    } catch (e) {
        const errMsg = e.response?.data?.message || e.response?.data || e.message;
        console.error(`[RAPIDSHYP] Label Generation Failed:`, errMsg);
        return { success: false, message: typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg) };
    }
};

/**
 * Bulk assign AWB to multiple orders.
 * Uses session API for lookup (if JWT available), then public API for AWB assignment.
 */
const bulkAssignAWB = async (orderNames) => {
    const headers = getPublicHeaders();
    const sessionHeaders = getSessionHeaders();
    const results = [];

    for (const name of orderNames) {
        const cleanId = name.toString().replace('#', '');
        try {
            let match = null;

            // Try session API search if JWT available
            if (sessionHeaders) {
                try {
                    const searchRes = await rsApi.post(`${SESSION_API_BASE}/orders/get_orders`, {
                        search: cleanId, page: 1, limit: 10
                    }, { headers: sessionHeaders });
                    const records = searchRes.data?.records || [];
                    match = records.find(r =>
                        r.seller_order_id === `#${cleanId}` || r.seller_order_id === cleanId
                    );
                } catch (searchErr) {
                    console.warn(`[RAPIDSHYP] Session search failed for ${cleanId}: ${searchErr.response?.status || searchErr.message}`);
                }
            }

            if (!match) {
                // Without JWT we can't look up the RS order ID for AWB assignment
                // Try assigning directly with the Shopify order ID
                try {
                    const assignRes = await rsApi.post(`${PUBLIC_API_BASE}/assign_awb`, {
                        shipment_id: cleanId
                    }, { headers });
                    const data = assignRes.data;
                    results.push({
                        orderId: cleanId,
                        success: true,
                        awb: data.awb || '',
                        courier: data.courier_name || '',
                        shipmentId: data.shipment_id || cleanId
                    });
                    console.log(`[RAPIDSHYP] Assigned AWB for ${cleanId}: ${data.awb}`);
                } catch (directErr) {
                    const msg = directErr.response?.data?.message || directErr.response?.data?.remarks || directErr.message;
                    results.push({ orderId: cleanId, success: false, message: typeof msg === 'string' ? msg : JSON.stringify(msg) });
                }
                await new Promise(r => setTimeout(r, 300));
                continue;
            }

            if (match.awb_number) {
                results.push({ orderId: cleanId, success: true, awb: match.awb_number, courier: match.courier_name || '', message: 'Already assigned' });
                continue;
            }

            const shipmentId = match.shipment_id || match.order_id;
            const assignRes = await rsApi.post(`${PUBLIC_API_BASE}/assign_awb`, {
                shipment_id: shipmentId
            }, { headers });

            const data = assignRes.data;
            results.push({
                orderId: cleanId,
                success: true,
                awb: data.awb || '',
                courier: data.courier_name || '',
                shipmentId: data.shipment_id || shipmentId,
                rsOrderId: match.order_id
            });

            console.log(`[RAPIDSHYP] Assigned AWB for ${cleanId}: ${data.awb}`);
            await new Promise(r => setTimeout(r, 300));
        } catch (e) {
            const errMsg = e.response?.data?.message || e.response?.data?.remarks || e.message;
            console.error(`[RAPIDSHYP] Assign AWB failed for ${cleanId}:`, errMsg);
            results.push({ orderId: cleanId, success: false, message: typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg) });
        }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[RAPIDSHYP] Bulk AWB: ${successCount}/${orderNames.length} assigned.`);
    return { success: successCount > 0, results };
};

/**
 * Get wallet balance from RapidShyp. Requires JWT (session API).
 * Returns 0 gracefully if JWT is not available.
 */
const getWalletBalance = async () => {
    const sessionHeaders = getSessionHeaders();
    if (!sessionHeaders) {
        console.log('[RAPIDSHYP] No JWT configured — wallet balance unavailable.');
        return { success: false, balance: 0, message: 'JWT not configured. Set RAPIDSHYP_JWT in env to enable wallet.' };
    }

    try {
        const res = await rsApi.post(`${SESSION_API_BASE}/wallet/get_balance`, {}, { headers: sessionHeaders });
        const balance = res.data?.balance ?? res.data?.available_balance ?? res.data?.wallet_balance ?? 0;
        console.log(`[RAPIDSHYP] Wallet balance: ₹${balance}`);
        return { success: true, balance: parseFloat(balance) || 0 };
    } catch (e) {
        // Fallback to GET endpoint
        try {
            const res = await rsApi.get(`${SESSION_API_BASE}/wallet/balance`, { headers: sessionHeaders });
            const balance = res.data?.balance ?? res.data?.available_balance ?? 0;
            return { success: true, balance: parseFloat(balance) || 0 };
        } catch (e2) {
            console.error('[RAPIDSHYP] Wallet error:', e2.response?.status, e2.response?.data || e2.message);
            return { success: false, balance: 0 };
        }
    }
};

/**
 * Generate labels for multiple orders (public API — works with API key).
 */
const bulkGenerateLabels = async (orderIds) => {
    try {
        const headers = getPublicHeaders();
        console.log(`[RAPIDSHYP] Generating labels for ${orderIds.length} orders...`);

        const response = await rsApi.post(`${PUBLIC_API_BASE}/generate_label`, {
            orderId: orderIds
        }, { headers });

        const data = response.data;
        const labelUrl = data.label_pdf_url || '';
        const labels = data.labels || data.data || [];

        console.log(`[RAPIDSHYP] Labels generated. URL: ${labelUrl || 'check individual labels'}`);
        return { success: true, labelUrl, labels, data };
    } catch (e) {
        const errMsg = e.response?.data?.message || e.response?.data || e.message;
        console.error(`[RAPIDSHYP] Bulk label generation failed:`, errMsg);
        return { success: false, labelUrl: '', labels: [], message: typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg) };
    }
};

/**
 * Look up RapidShyp order ID from an AWB number.
 * Uses session API search if JWT available, falls back to tracking.
 */
const findOrderIdByAWB = async (awb) => {
    if (!awb) return null;

    // Try session API search first
    const sessionHeaders = getSessionHeaders();
    if (sessionHeaders) {
        try {
            const searchRes = await rsApi.post(`${SESSION_API_BASE}/orders/get_orders`, {
                search: awb, page: 1, limit: 10
            }, { headers: sessionHeaders });
            const records = searchRes.data?.records || [];
            const match = records.find(r => r.awb_number === awb);
            if (match) {
                console.log(`[RAPIDSHYP] Found RS order ${match.order_id} for AWB ${awb}`);
                return match.order_id;
            }
        } catch (e) {
            console.warn(`[RAPIDSHYP] Session search by AWB failed: ${e.response?.status || e.message}`);
        }
    }

    // Fallback: try tracking to get shipment info
    try {
        const headers = getPublicHeaders();
        const trackRes = await rsApi.post(`${PUBLIC_API_BASE}/track_order`, { awb }, { headers });
        const orderId = trackRes.data?.order_id || trackRes.data?.shipment_id;
        if (orderId) {
            console.log(`[RAPIDSHYP] Found RS order ${orderId} for AWB ${awb} via tracking`);
            return orderId;
        }
    } catch (e) {
        console.warn(`[RAPIDSHYP] Track lookup by AWB failed: ${e.response?.status || e.message}`);
    }

    console.warn(`[RAPIDSHYP] Could not find RS order ID for AWB ${awb}`);
    return null;
};

module.exports = {
    getPublicHeaders,
    getSessionHeaders,
    fetchOrdersWithRTO,
    cancelOrder,
    trackOrder,
    generateLabel,
    bulkAssignAWB,
    getWalletBalance,
    bulkGenerateLabels,
    findOrderIdByAWB,
    mapRTORisk,
    buildRTOReason
};
