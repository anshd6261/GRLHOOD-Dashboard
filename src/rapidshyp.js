const axios = require('axios');
require('dotenv').config();

const SESSION_API_BASE = 'https://api.rapidshyp.com/session';
const PUBLIC_API_BASE = 'https://api.rapidshyp.com/rapidshyp/apis/v1';

// Custom axios instance with retry for rate limits
const rsApi = axios.create({ timeout: 30000 });

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

module.exports = {
    getSessionHeaders,
    getPublicHeaders,
    fetchOrdersWithRTO,
    cancelOrder,
    trackOrder,
    generateLabel,
    mapRTORisk,
    buildRTOReason
};
