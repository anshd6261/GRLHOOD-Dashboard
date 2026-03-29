const axios = require('axios');
require('dotenv').config();

// Custom Shiprocket API Instance with Rate Limit Protection
const srApi = axios.create();

srApi.interceptors.response.use(
    (response) => response,
    async (error) => {
        const config = error.config;

        // Only retry if it's a 429 Rate Limit error and we haven't exceeded max retries
        if (error.response && error.response.status === 429 && config) {
            config.__retryCount = config.__retryCount || 0;

            if (config.__retryCount < 5) {
                config.__retryCount += 1;
                // Exponential Backoff: 1s, 2s, 4s, 8s, 16s
                const waitTime = Math.pow(2, config.__retryCount - 1) * 1000;

                console.warn(`[SHIPROCKET] Rate Limited (429). Retrying attempt ${config.__retryCount}/5 in ${waitTime}ms...`);

                // Wait for the delay
                await new Promise(resolve => setTimeout(resolve, waitTime));

                // Return the axios request promise to seamlessly retry
                return srApi(config);
            }
        }

        // If it's not a 429, or we ran out of retries, reject normally
        return Promise.reject(error);
    }
);

let token = null;
let tokenExpiry = null;
let authPromise = null;

const authenticate = async () => {
    // If we have a valid token, return it instantly
    if (token && tokenExpiry && new Date() < tokenExpiry) {
        return token;
    }

    // If an authentication request is already in-flight, await its completion
    // instead of triggering a duplicate request (Prevents 429 Too Many Requests bursts)
    if (authPromise) {
        return authPromise;
    }

    // Create a new Singleton Promise for authentication
    authPromise = (async () => {
        try {
            console.log('[SHIPROCKET] Fetching new authentication token...');
            const response = await srApi.post('https://apiv2.shiprocket.in/v1/external/auth/login', {
                email: process.env.SHIPROCKET_EMAIL,
                password: process.env.SHIPROCKET_PASSWORD
            });
            token = response.data.token;
            // Shiprocket tokens last 10 days, but we refresh every 24 hours to be absolutely safe
            tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
            console.log('[SHIPROCKET] Token obtained successfully.');
            return token;
        } catch (error) {
            console.error('[SHIPROCKET] Auth Failed:', error.response?.data || error.message);
            throw new Error('Shiprocket Authentication Failed');
        } finally {
            // Clear the promise lock once resolved or rejected
            authPromise = null;
        }
    })();

    return authPromise;
};

const getHeaders = async () => {
    const t = await authenticate();
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${t}`
    };
};

const getWalletBalance = async () => {
    try {
        const headers = await getHeaders();
        const response = await srApi.get('https://apiv2.shiprocket.in/v1/external/account/details/statement', { headers });

        if (response.data && response.data.data && response.data.data.length > 0) {
            const balanceStr = response.data.data[0].balance_amount;
            return parseFloat(balanceStr);
        }
        return 0;
    } catch (e) {
        console.warn('[SHIPROCKET] Failed to fetch wallet balance (ignoring check):', e.response?.status);
        return null;
    }
};

const createOrder = async (order) => {
    try {
        const headers = await getHeaders();
        const date = new Date(order.createdAt);
        const formattedDate = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours()}:${date.getMinutes()}`;

        const items = order.lineItems.edges.map(e => ({
            name: e.node.title,
            sku: e.node.sku || e.node.variant?.sku || 'Ref-SKU',
            units: parseInt(e.node.quantity) || 1,
            selling_price: parseFloat(e.node.originalUnitPrice) || 0,
            discount: 0,
            tax: 0,
            hsn: 0
        }));

        const shipping = order.shippingAddress || {};
        const splitName = (shipping.name || "Customer").split(' ');

        const payload = {
            order_id: order.id.split('/').pop(),
            order_date: formattedDate,
            pickup_location: "Primary",
            billing_customer_name: splitName[0],
            billing_last_name: splitName.slice(1).join(' ') || "",
            billing_address: shipping.address1 || "No Address",
            billing_address_2: shipping.address2 || "",
            billing_city: shipping.city || "City",
            billing_pincode: shipping.zip || "110001",
            billing_state: shipping.province || "Delhi",
            billing_country: shipping.country || "India",
            billing_email: order.email || "noreply@cloutcases.in",
            billing_phone: (() => {
                const raw = order.phone || order.shippingAddress?.phone || "9876543210";
                let cleaned = raw.replace(/\D/g, '');
                if (cleaned.length > 10) cleaned = cleaned.slice(-10);
                if (cleaned.length < 10) return "9876543210";
                return cleaned;
            })(),
            shipping_is_billing: true,
            order_items: items,
            payment_method: (order.displayFinancialStatus || 'PENDING') === 'PAID' ? 'Prepaid' : 'COD',
            sub_total: items.reduce((acc, item) => acc + (item.selling_price * item.units), 0),
            length: 8,
            breadth: 5,
            height: 2,
            weight: 0.5
        };

        const response = await srApi.post('https://apiv2.shiprocket.in/v1/external/orders/create/adhoc', payload, { headers });
        return { success: true, shipment_id: response.data.shipment_id, order_id: response.data.order_id };

    } catch (error) {
        console.error(`[SHIPROCKET] Order Create Failed for ${order.name}:`, error.response?.data || error.message);
        const msg = error.response?.data?.message || error.message;
        if ((typeof msg === 'string' && msg.includes('already exists')) || error.response?.status === 422) {
            return { success: false, error: "DUPLICATE", message: msg };
        }
        return { success: false, error: msg };
    }
};


const ensureReplacementOrder = async (order) => {
    try {
        const headers = await getHeaders();
        const replacementOrderId = `${order.name}-Fixed`;

        const search = await srApi.get(`https://apiv2.shiprocket.in/v1/external/orders?per_page=50`, { headers });
        const match = search.data.data.find(o => o.channel_order_id == replacementOrderId);

        if (match) {
            console.log(`[SR] Found existing ${replacementOrderId}. Shipment: ${match.shipments?.[0]?.id}`);
            return {
                shipment_id: match.shipments?.[0]?.id,
                order_id: match.id
            };
        }

        const date = new Date(order.createdAt);
        const formattedDate = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours()}:${date.getMinutes()}`;

        const items = order.lineItems.edges.map(e => ({
            name: e.node.title,
            sku: e.node.sku || e.node.variant?.sku || 'Ref-SKU',
            units: parseInt(e.node.quantity) || 1,
            selling_price: parseFloat(e.node.originalUnitPrice) || 0
        }));

        const shipping = order.shippingAddress || {};
        const splitName = (shipping.name || "Customer").split(' ');

        const payload = {
            order_id: replacementOrderId,
            order_date: formattedDate,
            pickup_location: "Primary",
            billing_customer_name: splitName[0],
            billing_last_name: splitName.slice(1).join(' ') || "",
            billing_address: shipping.address1 || "No Address",
            billing_address_2: shipping.address2 || "",
            billing_city: shipping.city || "City",
            billing_pincode: shipping.zip || "110001",
            billing_state: shipping.province || "Delhi",
            billing_country: shipping.country || "India",
            billing_email: order.email || "noreply@cloutcases.in",
            billing_phone: (() => {
                const raw = order.phone || order.shippingAddress?.phone || "9876543210";
                let cleaned = raw.replace(/\D/g, '');
                if (cleaned.length > 10) cleaned = cleaned.slice(-10);
                if (cleaned.length < 10) cleaned = "9876543210";
                return cleaned;
            })(),
            shipping_is_billing: true,
            order_items: items,
            payment_method: "Prepaid",
            sub_total: items.reduce((sum, i) => sum + (i.selling_price * i.units), 0),
            length: 8, breadth: 5, height: 2, weight: 0.5
        };

        console.log(`[SR] Creating Replacement Order ${replacementOrderId}...`);

        try {
            const res = await srApi.post('https://apiv2.shiprocket.in/v1/external/orders/create/adhoc', payload, { headers });
            console.log(`[SR] Created ${replacementOrderId}:`, res.data.order_id);
            return {
                shipment_id: res.data.shipment_id,
                order_id: res.data.order_id
            };
        } catch (createError) {
            console.error(`[SR] Failed to create replacement ${replacementOrderId}:`, createError.response?.data || createError.message);
            return null;
        }

    } catch (error) {
        console.error(`[SR] ensureReplacementOrder Error for ${order.name}:`, error.message);
        return null;
    }
};




const fetchRecentOrdersForSync = async (days = 3) => {
    try {
        const headers = await getHeaders();
        const d = new Date();
        const end = d.toISOString().split('T')[0] + ' 23:59:59';
        d.setDate(d.getDate() - days);
        const start = d.toISOString().split('T')[0] + ' 00:00:00';

        let allOrders = [];
        let page = 1;

        // Grab a few pages to get the most recent ones roughly (or just per_page=100)
        // Adjust pagination as needed, normally 50-100 is enough for a sync.
        const res = await srApi.get(`https://apiv2.shiprocket.in/v1/external/orders?from=${start}&to=${end}&per_page=100&page=${page}`, { headers });
        if (res.data && res.data.data) {
            allOrders = res.data.data;
        }

        return { success: true, data: allOrders };
    } catch (e) {
        console.error(`[SHIPROCKET] fetchRecentOrdersForSync Error:`, e.message);
        return { success: false, data: [] };
    }
};

const assignCourier = async (shipmentId) => {
    try {
        const headers = await getHeaders();
        const payload = { shipment_id: shipmentId };
        const response = await srApi.post('https://apiv2.shiprocket.in/v1/external/courier/assign/awb', payload, { headers });
        return { success: true, awb: response.data.response.data.awb_code };
    } catch (error) {
        let msg = "Unknown Error";
        if (error.response?.data) {
            const d = error.response.data;
            if (typeof d.message === 'string') msg = d.message;
            else if (d.message && typeof d.message === 'object') msg = JSON.stringify(d.message);
            else if (d.errors) msg = JSON.stringify(d.errors);
            else msg = JSON.stringify(d);
        } else {
            msg = error.message;
        }

        const msgLower = msg.toLowerCase();
        if (msgLower.includes("wallet") || msgLower.includes("balance") || msgLower.includes("insufficient")) {
            return { success: false, error: "LOW_WALLET", message: msg };
        }
        return { success: false, error: msg };
    }
};

const getLocalDate = (offsetDays = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const schedulePickup = async (shipmentId) => {
    const headers = await getHeaders();
    try {
        const dateToday = getLocalDate(0);
        console.log(`[SHIPROCKET] Attempting pickup for TODAY (${dateToday})...`);
        const payload = { shipment_id: [shipmentId], pickup_date: dateToday };
        await srApi.post('https://apiv2.shiprocket.in/v1/external/courier/generate/pickup', payload, { headers });
        console.log(`[SHIPROCKET] Pickup scheduled for TODAY.`);
        return { success: true, date: dateToday };
    } catch (error) {
        console.warn(`[SHIPROCKET] Pickup for TODAY failed. Trying TOMORROW...`);
    }

    try {
        const dateTomorrow = getLocalDate(1);
        console.log(`[SHIPROCKET] Attempting pickup for TOMORROW (${dateTomorrow})...`);
        const payload = { shipment_id: [shipmentId], pickup_date: dateTomorrow };
        await srApi.post('https://apiv2.shiprocket.in/v1/external/courier/generate/pickup', payload, { headers });
        console.log(`[SHIPROCKET] Pickup scheduled for TOMORROW.`);
        return { success: true, date: dateTomorrow };
    } catch (error) {
        console.error(`[SHIPROCKET] Pickup Scheduling Failed completely.`);
        return { success: false, error: error.message };
    }
};

const findOrderByShopifyId = async (shopifyOrderId) => {
    try {
        const headers = await getHeaders();
        const MAX_PAGES = 5;
        const PER_PAGE = 100;

        for (let page = 1; page <= MAX_PAGES; page++) {
            const response = await srApi.get(`https://apiv2.shiprocket.in/v1/external/orders?per_page=${PER_PAGE}&page=${page}`, { headers });

            if (response.data?.data?.length > 0) {
                // Strict Match on Page
                const match = response.data.data.find(o => o.channel_order_id == shopifyOrderId || o.channel_order_id == `#${shopifyOrderId}`);

                if (match) {
                    console.log(`[SHIPROCKET] Search for ${shopifyOrderId} -> Found MATCH on Page ${page}: ${match.id}`);
                    console.log('FULL ORDER SEARCH RESULT:', JSON.stringify(match, null, 2));
                    return {
                        found: true,
                        order_id: match.id,
                        channel_order_id: match.channel_order_id,
                        channel_id: match.channel_id,
                        shipment_id: match.shipment_id || (match.shipments && match.shipments.length > 0 ? match.shipments[0].id : null),
                        status: match.status,
                        status_code: match.status_code
                    };
                }
            } else {
                break; // End of results
            }
        }

        console.warn(`[SHIPROCKET] Search for ${shopifyOrderId} scanned ${MAX_PAGES} pages but NOT FOUND.`);
        return { found: false };

    } catch (error) {
        return { found: false, error: error.message };
    }
};

const generateLabel = async (shipmentId) => {
    try {
        const headers = await getHeaders();
        const payload = { shipment_id: [shipmentId] };
        const response = await srApi.post('https://apiv2.shiprocket.in/v1/external/courier/generate/label', payload, { headers });
        if (response.data.label_url) return { success: true, url: response.data.label_url };
        return { success: false, error: 'No URL in response' };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

const bulkAssignCouriers = async (items) => {
    const results = {
        successful: [],
        failed: []
    };

    console.log(`[SHIPROCKET] Starting Bulk Assignment for ${items.length} shipments...`);

    for (const item of items) {
        const sid = item.shipmentId;
        const oid = item.orderId;

        let res = await assignCourier(sid);

        if (res.success) {
            results.successful.push(sid);
            console.log(`   ✅ Signed: ${sid}`);
        } else {
            // Check for known errors and log clearly
            const errLower = (res.error || "").toLowerCase();
            if (errLower.includes("weight") || errLower.includes("dimension")) {
                console.error(`   ❌ Failed: ${sid} (Missing Dimensions - Please update in Shiprocket Panel)`);
                results.failed.push({ id: sid, error: "Missing Dimensions. Auto-update not allowed for Channel Orders." });
            } else {
                console.log(`   ❌ Failed: ${sid} (${res.error})`);
                results.failed.push({ id: sid, error: res.error });
            }
        }
    }
    return results;
};

const bulkGenerateLabel = async (shipmentIds) => {
    if (!shipmentIds || shipmentIds.length === 0) return { success: false, error: "No IDs provided" };
    try {
        const headers = await getHeaders();
        console.log(`[SHIPROCKET] Generating Bulk Label for ${shipmentIds.length} shipments...`);
        const response = await srApi.post('https://apiv2.shiprocket.in/v1/external/courier/generate/label', { shipment_id: shipmentIds }, { headers });

        if (response.data.label_url) return { success: true, url: response.data.label_url };
        return { success: false, error: 'No URL in response' };
    } catch (error) {
        console.error('[SHIPROCKET] Bulk Label Failed:', error.message);
        return { success: false, error: error.message };
    }
};

const fetchOrdersByDate = async (startDate, endDate) => {
    try {
        const headers = await getHeaders();
        const startStr = startDate.split('T')[0];
        const endStr = endDate.split('T')[0];

        console.log(`[SHIPROCKET] Fetching orders from ${startStr} to ${endStr}...`);

        let allOrders = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            const url = `https://apiv2.shiprocket.in/v1/external/orders?filter_by=date&from=${startStr}&to=${endStr}&per_page=100&page=${page}`;
            const response = await srApi.get(url, { headers });

            if (response.data && response.data.data && response.data.data.length > 0) {
                allOrders = allOrders.concat(response.data.data);
                page++;
            } else {
                hasMore = false;
            }
        }

        console.log(`[SHIPROCKET] Fetched ${allOrders.length} orders in range.`);
        return { success: true, data: allOrders };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

const getOrdersForSync = async (daysLookback, startDate, endDate) => {
    let startStr, endStr;

    if (startDate && endDate) {
        // Use provided ISO strings
        startStr = startDate;
        endStr = endDate;
    } else {
        // Fallback to daysLookback
        const dEnd = new Date();
        endStr = dEnd.toISOString();
        
        const dStart = new Date();
        dStart.setDate(dStart.getDate() - (daysLookback > 0 ? daysLookback : 3));
        startStr = dStart.toISOString();
    }

    return fetchOrdersByDate(startStr, endStr);
};

const cancelOrderByChannelId = async (channelOrderId) => {
    try {
        const headers = await getHeaders();
        // The channelOrderId is typically the #1005 without the #
        const cleanId = channelOrderId.toString().replace('#', '');

        // Find the Shiprocket order
        const searchRes = await srApi.get(`https://apiv2.shiprocket.in/v1/external/orders?search=${cleanId}`, { headers });
        const orders = searchRes.data?.data || [];

        const match = orders.find(o => o.channel_order_id === cleanId);
        if (!match) {
            throw new Error(`Order ${cleanId} not found in Shiprocket.`);
        }

        if (match.status_code === 5) {
            console.log(`[SHIPROCKET] Order ${cleanId} is already canceled.`);
            return { success: true, message: 'Already canceled' };
        }

        // Cancel it
        const payload = {
            ids: [match.id]
        };
        const cancelRes = await srApi.post('https://apiv2.shiprocket.in/v1/external/orders/cancel', payload, { headers });
        console.log(`[SHIPROCKET] Cancelled ${cleanId} (${match.id}):`, cancelRes.data);
        return { success: true, data: cancelRes.data };

    } catch (e) {
        console.error(`[SHIPROCKET] Cancel Failed for ${channelOrderId}:`, e.response?.data || e.message);
        throw new Error(e.response?.data?.message || e.message);
    }
};

/**
 * Fetch RTO risk data for recent orders from Shiprocket.
 * Shiprocket's API returns rto_risk, rto_prediction, rto_reason, and order_tag
 * for each order — powered by cross-merchant buyer history data.
 *
 * @param {number} pages - Number of pages to fetch (50 orders per page)
 * @returns {Object} Map of channel_order_id → { rtoRisk, rtoReason, rtoTags }
 */
const fetchRTORiskMap = async (pages = 5) => {
    try {
        const headers = await getHeaders();
        const rtoMap = {};

        for (let page = 1; page <= pages; page++) {
            const res = await srApi.get(
                `https://apiv2.shiprocket.in/v1/external/orders?per_page=50&page=${page}`,
                { headers }
            );
            const orders = res.data?.data || [];
            if (orders.length === 0) break;

            for (const o of orders) {
                const id = o.channel_order_id;
                if (!id) continue;

                rtoMap[id] = {
                    rtoRisk: o.rto_risk || '',           // "low" or "high"
                    rtoPrediction: o.rto_prediction || '', // "low" or "high" (COD only)
                    rtoReason: o.rto_reason || '',         // "Buyer has high RTO risk."
                    rtoShow: o.rto_show || 0,              // 1 for COD, 0 for prepaid
                    rtoTags: o.order_tag || [],             // ["COD", "FlexAssure:LowRisk", ...]
                };
                // Also map with # prefix for Shopify order name matching
                rtoMap[`#${id}`] = rtoMap[id];
            }
        }

        console.log(`[SHIPROCKET] Fetched RTO risk for ${Object.keys(rtoMap).length / 2} orders.`);
        return { success: true, data: rtoMap };
    } catch (e) {
        console.error('[SHIPROCKET] fetchRTORiskMap failed:', e.response?.status, e.message);
        return { success: false, data: {} };
    }
};

module.exports = {
    authenticate,
    assignCourier,
    schedulePickup,
    generateLabel,
    bulkAssignCouriers,
    bulkGenerateLabel,
    getHeaders,
    findOrderByShopifyId,
    getWalletBalance,
    createOrder,
    ensureReplacementOrder,
    fetchOrdersByDate,
    getOrdersForSync,
    cancelOrderByChannelId,
    fetchRecentOrdersForSync,
    fetchRTORiskMap
};
