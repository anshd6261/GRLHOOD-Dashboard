const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
require('dotenv').config();

const SESSION_API_BASE = 'https://api.rapidshyp.com/session';
const PUBLIC_API_BASE = 'https://api.rapidshyp.com/rapidshyp/apis/v1';

// Route through static IP proxy if configured (solves Vercel rotating IP issue)
const proxyUrl = process.env.FIXIE_URL || process.env.QUOTAGUARD_URL || process.env.STATIC_PROXY_URL;
const axiosConfig = { timeout: process.env.VERCEL ? 8000 : 30000 };
if (proxyUrl) {
    const agent = new HttpsProxyAgent(proxyUrl);
    axiosConfig.httpAgent = agent;
    axiosConfig.httpsAgent = agent;
    axiosConfig.proxy = false; // let the agent handle it
    console.log('[RAPIDSHYP] Using static IP proxy');
}
const rsApi = axios.create(axiosConfig);

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
 * Get headers for the internal session API (JWT Bearer token).
 * This is the primary API used for fetching orders + RTO data.
 */
const getSessionHeaders = () => {
    const jwt = process.env.RAPIDSHYP_JWT;
    if (!jwt) throw new Error('RAPIDSHYP_JWT is not set in .env');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`
    };
};

/**
 * Get headers for the public API (API key via rapidshyp-token).
 * Used for serviceability checks and other public endpoints.
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
 * Map RapidShyp's numeric rto_risk_score to a risk label.
 * 0 = High, 1 = Medium, 2 = Low
 */
const mapRTORisk = (score) => {
    if (score === 0) return 'High';
    if (score === 1) return 'Medium';
    if (score === 2) return 'Low';
    return 'Unknown';
};

/**
 * Build a detailed RTO reason from the address_score breakdown.
 */
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
 * Fetch all orders from RapidShyp with RTO risk data.
 * Uses the internal session API which returns address_score with rto_risk_score.
 * @param {string} status - Filter by status: 'APPROVAL_PENDING', 'PROCESSING', 'ALL', etc.
 * @param {number} maxPages - Max pages to fetch (default 10, each page = 25 orders)
 * @returns {Object} { success, data: normalized order array }
 */
const fetchOrdersWithRTO = async (status = 'ALL', maxPages = 10) => {
    try {
        const headers = getSessionHeaders();
        let allOrders = [];
        let page = 1;
        let hasMore = true;

        while (hasMore && page <= maxPages) {
            const body = { page, limit: 100 };
            if (status && status !== 'ALL') body.status = status;

            const response = await rsApi.post(`${SESSION_API_BASE}/orders/get_orders`, body, { headers });
            const records = response.data?.records || [];

            if (records.length === 0) {
                hasMore = false;
                break;
            }

            // Normalize each order with RTO data
            const normalized = records.map(order => ({
                // IDs
                order_id: order.order_id,                          // RS MongoDB ID
                seller_order_id: order.seller_order_id,            // Shopify name (#3419)
                channel_order_id: order.seller_order_id?.replace('#', ''), // Clean ID (3419)
                market_place_order_id: order.market_place_order_id, // Shopify numeric ID

                // RTO Risk
                rto_prediction: mapRTORisk(order.address_score?.rto_risk_score),
                rto_reason: buildRTOReason(order.address_score),
                address_score: order.address_score,

                // Order details
                order_status: order.order_status,
                payment_method: order.payment_method,
                contact_name: order.contact_name,
                contact_details: order.contact_details,
                total_order_value: order.total_order_value,
                store_name: order.store_name,
                created_on: order.created_on,
                awb_number: order.awb_number || "",

                // Keep original id for backward compat
                id: order.order_id
            }));

            allOrders = allOrders.concat(normalized);

            // RapidShyp returns 25 per page by default, if less than limit, no more pages
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
 * Uses the public API's cancel_order endpoint.
 * @param {string} channelOrderId - Shopify order name (#3419 or 3419)
 */
const cancelOrder = async (channelOrderId) => {
    try {
        const headers = getPublicHeaders();
        const cleanId = channelOrderId.toString().replace('#', '');

        // First, find the RapidShyp order ID via session API
        console.log(`[RAPIDSHYP] Looking up order ${cleanId} for cancellation...`);
        const sessionHeaders = getSessionHeaders();
        const searchRes = await rsApi.post(`${SESSION_API_BASE}/orders/get_orders`, {
            search: cleanId,
            page: 1,
            limit: 10
        }, { headers: sessionHeaders });

        const records = searchRes.data?.records || [];
        const match = records.find(r =>
            r.seller_order_id === `#${cleanId}` ||
            r.seller_order_id === cleanId
        );

        if (!match) {
            console.warn(`[RAPIDSHYP] Order ${cleanId} not found.`);
            return { success: false, message: `Order ${cleanId} not found in RapidShyp` };
        }

        if ((match.order_status || '').toLowerCase().includes('cancel')) {
            console.log(`[RAPIDSHYP] Order ${cleanId} is already cancelled.`);
            return { success: true, message: 'Already cancelled' };
        }

        // Cancel using the public API
        console.log(`[RAPIDSHYP] Cancelling order ${cleanId} (RS ID: ${match.order_id})...`);
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
 * Track a shipment by AWB number.
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
 * Generate Shipping Label(s)
 * @param {Array<string>} orderIds - Array of RapidShyp internal order IDs
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
 * Bulk assign AWB to multiple orders by their Shopify order names.
 * Looks up each order in RapidShyp, then assigns AWB.
 * @param {string[]} orderNames - Array of Shopify order names (e.g., ["3419", "3420"])
 * @returns {{ success: boolean, results: Array }}
 */
const bulkAssignAWB = async (orderNames) => {
    const sessionHeaders = getSessionHeaders();
    const publicHeaders = getPublicHeaders();
    const results = [];

    for (const name of orderNames) {
        const cleanId = name.toString().replace('#', '');
        try {
            // Look up the RS order
            const searchRes = await rsApi.post(`${SESSION_API_BASE}/orders/get_orders`, {
                search: cleanId,
                page: 1,
                limit: 10
            }, { headers: sessionHeaders });

            const records = searchRes.data?.records || [];
            const match = records.find(r =>
                r.seller_order_id === `#${cleanId}` ||
                r.seller_order_id === cleanId
            );

            if (!match) {
                results.push({ orderId: cleanId, success: false, message: 'Not found in RapidShyp' });
                continue;
            }

            if (match.awb_number) {
                results.push({ orderId: cleanId, success: true, awb: match.awb_number, courier: match.courier_name || '', message: 'Already assigned' });
                continue;
            }

            // Get the shipment_id from the order
            const shipmentId = match.shipment_id || match.order_id;

            // Assign AWB
            const assignRes = await rsApi.post(`${PUBLIC_API_BASE}/assign_awb`, {
                shipment_id: shipmentId
            }, { headers: publicHeaders });

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
            await new Promise(r => setTimeout(r, 300)); // Rate limit buffer
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
 * Get wallet balance from RapidShyp session API.
 * @returns {{ success: boolean, balance: number }}
 */
const getWalletBalance = async () => {
    try {
        const headers = getSessionHeaders();
        // Try the session wallet endpoint
        const res = await rsApi.post(`${SESSION_API_BASE}/wallet/get_balance`, {}, { headers });
        const balance = res.data?.balance ?? res.data?.available_balance ?? res.data?.wallet_balance ?? 0;
        console.log(`[RAPIDSHYP] Wallet balance: ₹${balance}`);
        return { success: true, balance: parseFloat(balance) || 0 };
    } catch (e) {
        // Fallback: try alternative endpoint
        try {
            const headers = getSessionHeaders();
            const res = await rsApi.get(`${SESSION_API_BASE}/wallet/balance`, { headers });
            const balance = res.data?.balance ?? res.data?.available_balance ?? 0;
            return { success: true, balance: parseFloat(balance) || 0 };
        } catch (e2) {
            console.error('[RAPIDSHYP] Wallet balance error:', e2.response?.data || e2.message);
            return { success: false, balance: 0 };
        }
    }
};

/**
 * Generate labels for multiple orders and return the PDF URL.
 * @param {string[]} orderIds - Array of RapidShyp order IDs
 * @returns {{ success: boolean, labelUrl: string, labels: Array }}
 */
const bulkGenerateLabels = async (orderIds) => {
    try {
        const headers = getPublicHeaders();
        console.log(`[RAPIDSHYP] Generating labels for ${orderIds.length} orders...`);

        const response = await rsApi.post(`${PUBLIC_API_BASE}/generate_label`, {
            orderId: orderIds
        }, { headers });

        const data = response.data;
        // The API returns label_pdf_url for bulk or an array of labels
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

module.exports = {
    getSessionHeaders,
    getPublicHeaders,
    fetchOrdersWithRTO,
    cancelOrder,
    trackOrder,
    generateLabel,
    bulkAssignAWB,
    getWalletBalance,
    bulkGenerateLabels,
    mapRTORisk,
    buildRTOReason
};
