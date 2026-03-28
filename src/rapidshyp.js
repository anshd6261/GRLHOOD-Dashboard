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
 * Get wallet balance from RapidShyp.
 * Tries session API endpoint.
 */
const getWalletBalance = async () => {
    try {
        const headers = getSessionHeaders();
        const response = await rsApi.get(`${SESSION_API_BASE}/wallet/balance`, { headers });
        if (response.data && response.data.balance !== undefined) {
            return { success: true, balance: parseFloat(response.data.balance) || 0 };
        }
        // Try alternative response structure
        if (response.data && typeof response.data === 'object') {
            const bal = response.data.available_balance || response.data.wallet_balance || response.data.amount || 0;
            return { success: true, balance: parseFloat(bal) || 0 };
        }
        return { success: true, balance: 0 };
    } catch (e) {
        console.error('[RAPIDSHYP] Wallet balance error:', e.response?.status, e.response?.data || e.message);
        // Fallback: try public API
        try {
            const headers = getPublicHeaders();
            const res = await rsApi.get(`${PUBLIC_API_BASE}/wallet/balance`, { headers });
            const bal = res.data?.balance || res.data?.available_balance || 0;
            return { success: true, balance: parseFloat(bal) || 0 };
        } catch (e2) {
            console.error('[RAPIDSHYP] Wallet balance fallback failed:', e2.response?.status);
            return { success: false, balance: 0 };
        }
    }
};

/**
 * RapidShyp Wrapper API - Creates order, assigns AWB, generates label in one call.
 * This is used for bulk shipping - we call it per order.
 * @param {Object} orderData - Order details from Shopify
 * @returns {Object} { success, shipmentId, awb, courierName, labelURL, shippingCharges }
 */
const wrapperCreateAndShip = async (orderData) => {
    try {
        const headers = getPublicHeaders();
        const shipping = orderData.shippingDetails || {};

        const cleanPhone = (phone) => {
            if (!phone) return '9876543210';
            let cleaned = phone.replace(/\D/g, '');
            if (cleaned.length > 10) cleaned = cleaned.slice(-10);
            return cleaned.length === 10 ? cleaned : '9876543210';
        };

        const nameParts = (shipping.name || orderData.customerName || 'Customer').split(' ');
        const firstName = nameParts[0] || 'Customer';
        const lastName = nameParts.slice(1).join(' ') || '';

        const payload = {
            orderId: (orderData.orderId || '').toString().replace('#', ''),
            orderDate: new Date(orderData.createdAt || Date.now()).toISOString().split('T')[0],
            pickupAddressName: 'Primary',
            storeName: 'DEFAULT',
            billingIsShipping: true,
            shippingAddress: {
                firstName,
                lastName,
                addressLine1: shipping.address1 || 'No Address',
                addressLine2: shipping.address2 || '',
                pinCode: shipping.zip || '110001',
                email: orderData.email || 'noreply@grlhood.com',
                phone: cleanPhone(shipping.phone)
            },
            billingAddress: {
                firstName,
                lastName,
                addressLine1: shipping.address1 || 'No Address',
                addressLine2: shipping.address2 || '',
                pinCode: shipping.zip || '110001',
                email: orderData.email || 'noreply@grlhood.com',
                phone: cleanPhone(shipping.phone)
            },
            orderItems: [{
                itemName: orderData.category || orderData.productName || 'Phone Case',
                sku: orderData.sku || 'CASE-001',
                description: `${orderData.category || 'Case'} - ${orderData.model || 'Standard'}`,
                quantity: 1,
                unitPrice: parseFloat(orderData.price) || 0,
                weight: 0.15
            }],
            paymentMethod: (orderData.payment || 'Prepaid').toLowerCase() === 'cash on delivery' ? 'COD' : 'Prepaid',
            totalOrderValue: parseFloat(orderData.price) || 0,
            collectableAmount: (orderData.payment || 'Prepaid').toLowerCase() === 'cash on delivery' ? (parseFloat(orderData.price) || 0) : 0,
            length: 8,
            breadth: 5,
            height: 2,
            weight: 0.15
        };

        console.log(`[RAPIDSHYP] Wrapper API call for order ${payload.orderId}...`);
        const response = await rsApi.post(`${PUBLIC_API_BASE}/wrapper`, payload, { headers });

        if (response.data?.status === 'SUCCESS' || response.data?.orderCreated) {
            return {
                success: true,
                orderId: response.data.orderId,
                shipmentId: response.data.shipmentId,
                awb: response.data.awb,
                courierName: response.data.courierName || response.data.parentCourierName,
                labelURL: response.data.labelURL,
                manifestURL: response.data.manifestURL,
                shippingCharges: response.data.shippingCharges,
                awbGenerated: response.data.awbGenerated,
                labelGenerated: response.data.labelGenerated
            };
        }

        return { success: false, error: response.data?.remarks || response.data?.message || 'Wrapper API failed' };
    } catch (e) {
        const errMsg = e.response?.data?.message || e.response?.data?.remarks || e.message;
        console.error(`[RAPIDSHYP] Wrapper failed for ${orderData.orderId}:`, errMsg);
        return { success: false, error: typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg) };
    }
};

/**
 * Generate label PDF for given shipment IDs.
 * @param {string[]} shipmentIds - Array of RapidShyp shipment IDs
 * @returns {Object} { success, labels: [{ shipmentId, labelURL }] }
 */
const generateLabel = async (shipmentIds) => {
    try {
        const headers = getPublicHeaders();
        const ids = Array.isArray(shipmentIds) ? shipmentIds : [shipmentIds];

        console.log(`[RAPIDSHYP] Generating labels for ${ids.length} shipments...`);
        const response = await rsApi.post(`${PUBLIC_API_BASE}/generate_label`, {
            shipmentId: ids
        }, { headers });

        if (response.data?.status === true || response.data?.labelData) {
            return {
                success: true,
                labels: response.data.labelData || [],
                remarks: response.data.remarks
            };
        }

        return { success: false, error: response.data?.remarks || 'Label generation failed' };
    } catch (e) {
        console.error('[RAPIDSHYP] Label generation error:', e.response?.data || e.message);
        return { success: false, error: e.response?.data?.message || e.message };
    }
};

/**
 * De-allocate AWB from a shipment to allow re-assignment.
 * @param {string} orderId - RapidShyp order ID
 * @param {string} shipmentId - RapidShyp shipment ID
 */
const deAllocateShipment = async (orderId, shipmentId) => {
    try {
        const headers = getPublicHeaders();
        const response = await rsApi.post(`${PUBLIC_API_BASE}/de_allocate_shipment`, {
            orderId,
            shipmentId
        }, { headers });
        return { success: true, data: response.data };
    } catch (e) {
        console.error('[RAPIDSHYP] De-allocate error:', e.response?.data || e.message);
        return { success: false, error: e.message };
    }
};

/**
 * Bulk ship orders via the Wrapper API.
 * Calls wrapper for each order and collects results.
 * @param {Object[]} orders - Array of order objects
 * @returns {Object} { successful: [], failed: [] }
 */
const bulkShipOrders = async (orders) => {
    const results = { successful: [], failed: [] };

    for (const order of orders) {
        const res = await wrapperCreateAndShip(order);
        if (res.success) {
            results.successful.push({
                orderId: order.orderId,
                shipmentId: res.shipmentId,
                awb: res.awb,
                courierName: res.courierName,
                labelURL: res.labelURL,
                shippingCharges: res.shippingCharges
            });
            console.log(`   ✅ Shipped: ${order.orderId} → AWB: ${res.awb} (${res.courierName})`);
        } else {
            results.failed.push({
                orderId: order.orderId,
                error: res.error
            });
            console.log(`   ❌ Failed: ${order.orderId} - ${res.error}`);
        }

        // Small delay between calls to avoid rate limiting
        await new Promise(r => setTimeout(r, 300));
    }

    return results;
};

module.exports = {
    getSessionHeaders,
    getPublicHeaders,
    fetchOrdersWithRTO,
    cancelOrder,
    trackOrder,
    mapRTORisk,
    buildRTOReason,
    getWalletBalance,
    wrapperCreateAndShip,
    generateLabel,
    deAllocateShipment,
    bulkShipOrders
};
