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
const SESSION_API_BASE = 'https://api.rapidshyp.com/session';

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
 * Get headers for the public API (API key via rapidshyp-token).
 */
const getPublicHeaders = () => {
    const apiKey = (process.env.RAPIDSHYP_API_KEY || '').trim();
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
    const jwt = (process.env.RAPIDSHYP_JWT || '').trim();
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
                await new Promise(r => setTimeout(r, 50));
            }
        }

        console.log(`[RAPIDSHYP] Fetched ${allOrders.length} orders (${page} pages).`);
        return { success: true, data: allOrders };
    } catch (e) {
        console.error('[RAPIDSHYP] fetchOrdersWithRTO Error:', e.response?.status, e.response?.data || e.message);
        return { success: false, data: [] };
    }
};

// ==========================================
// CACHED ORDER MAP (works around broken session search)
// ==========================================

let _orderMapCache = null;
let _orderMapTimestamp = 0;
const ORDER_MAP_TTL = 2 * 60 * 1000; // 2 minutes

/**
 * Fetch ALL orders from session API via pagination and build a lookup map.
 * The session search param is broken (returns all orders regardless of search term),
 * so we paginate everything and build our own Map<seller_order_id, record>.
 * Cached for 2 minutes to avoid re-fetching during bulk operations.
 */
const fetchAllOrders = async () => {
    if (_orderMapCache && (Date.now() - _orderMapTimestamp < ORDER_MAP_TTL)) {
        return _orderMapCache;
    }

    const sessionHeaders = getSessionHeaders();
    if (!sessionHeaders) return new Map();

    const orderMap = new Map();
    const PAGE_SIZE = 200;
    let page = 1;
    let totalFetched = 0;

    try {
        while (true) {
            const res = await rsApi.post(`${SESSION_API_BASE}/orders/get_orders`, {
                page, limit: PAGE_SIZE
            }, { headers: sessionHeaders, timeout: 15000 });

            const records = res.data?.records || [];
            const totalRecords = res.data?.total_records || 0;

            for (const r of records) {
                if (r.seller_order_id) {
                    const clean = r.seller_order_id.replace('#', '');
                    orderMap.set(clean, r);
                    orderMap.set(r.seller_order_id, r);
                }
                if (r.awb_number) {
                    orderMap.set(r.awb_number, r);
                }
                if (r.order_id) {
                    orderMap.set(r.order_id, r);
                }
            }

            totalFetched += records.length;
            if (records.length < PAGE_SIZE || totalFetched >= totalRecords) break;
            page++;
            await new Promise(r => setTimeout(r, 50));
        }

        console.log(`[RAPIDSHYP] Order map built: ${orderMap.size} entries from ${totalFetched} orders (${page} pages)`);
        _orderMapCache = orderMap;
        _orderMapTimestamp = Date.now();
        return orderMap;
    } catch (e) {
        console.error(`[RAPIDSHYP] Failed to build order map:`, e.response?.status || e.message);
        return orderMap.size > 0 ? orderMap : new Map();
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

        // Resolve order via session map + public API fallback
        const orderMap = await fetchAllOrders();
        const match = await resolveOrder(cleanId, orderMap);

        if (!match) {
            // Last resort: try cancelling with channel order ID directly
            console.log(`[RAPIDSHYP] Order not resolved. Attempting direct cancel for ${cleanId}...`);
            try {
                const cancelRes = await rsApi.post(`${PUBLIC_API_BASE}/cancel_order`, {
                    orderId: `#${cleanId}`, storeName: 'DEFAULT'
                }, { headers });
                return { success: true, data: cancelRes.data };
            } catch (directErr) {
                const msg = directErr.response?.data?.message || directErr.message;
                return { success: false, message: `Could not cancel: ${msg}` };
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
 * Get order info by Shopify order number (public API).
 * Uses track_order with orderId param — works for any order (fulfilled or unfulfilled).
 * Returns shipment_details with shipment_id and awb.
 */
const getOrderInfo = async (channelOrderId) => {
    try {
        const headers = getPublicHeaders();
        const cleanId = channelOrderId.toString().replace('#', '');
        const response = await rsApi.post(`${PUBLIC_API_BASE}/track_order`, {
            orderId: `#${cleanId}`
        }, { headers });

        const record = response.data?.records?.[0];
        if (!record) {
            console.warn(`[RAPIDSHYP] No tracking data for order #${cleanId}`);
            return { success: false, data: null };
        }

        // Extract shipment_id and awb from shipment_details
        const shipmentDetails = record.shipment_details || [];
        const shipmentLines = shipmentDetails.map(s => ({
            shipment_id: s.shipment_id,
            awb: s.awb,
            courier_name: s.courier_name,
            shipment_status: s.shipment_status
        }));

        console.log(`[RAPIDSHYP] Order #${cleanId}: ${shipmentLines.length} shipment(s), IDs: ${shipmentLines.map(s => s.shipment_id).join(', ')}`);
        return {
            success: true,
            data: {
                ...record,
                shipment_lines: shipmentLines,
                shipment_id: shipmentDetails[0]?.shipment_id,
                awb: shipmentDetails[0]?.awb
            }
        };
    } catch (e) {
        console.error(`[RAPIDSHYP] Get Order Info Error:`, e.response?.status, e.response?.data || e.message);
        return { success: false, data: null };
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
 * Docs: GET /generate_label with body { shipmentId: ["id1", "id2"] }
 * Response: { status: true, remarks: "...", labelData: [{ shipmentId, labelURL, labelRemarks }] }
 * https://docs.rapidshyp.com/docs/DocumentationSidebar/Forward%20B2C/Shipments/GET%20Label%20PDF
 */
const generateLabel = async (shipmentIds) => {
    try {
        const headers = getPublicHeaders();
        const payload = { shipmentId: shipmentIds };
        console.log(`[RAPIDSHYP] Generating label for shipments:`, shipmentIds);

        // POST works reliably (GET-with-body gets 400 from proxies/CDNs)
        const response = await rsApi.post(`${PUBLIC_API_BASE}/generate_label`, payload, { headers });

        console.log(`[RAPIDSHYP] Label API Response:`, JSON.stringify(response.data));
        const data = response.data || {};
        const labelUrl = data.label_url || data.labelUrl || (data.labelData?.[0]?.labelURL) || '';
        return { success: true, data: { ...data, label_url: labelUrl, labelUrl, label_pdf_url: labelUrl } };
    } catch (e) {
        const errMsg = e.response?.data?.remarks || e.response?.data?.message || e.response?.data || e.message;
        console.error(`[RAPIDSHYP] Label Generation Failed:`, errMsg);
        return { success: false, message: typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg) };
    }
};

/**
 * Resolve order details from RapidShyp by Shopify order ID.
 * Tries: 1) session order map (instant), 2) GET /shipment_details, 3) POST /track_order.
 * Returns { order_id, shipment_id, order_status, awb_number, store_name } or null.
 */
const resolveOrder = async (cleanId, orderMap) => {
    // 1. Try session API map (instant if cached)
    const match = orderMap.get(cleanId);
    if (match) return match;

    const headers = getPublicHeaders();

    // 2. Try GET /shipment_details with seller order ID variants
    // The shipment_details endpoint accepts a shipment_id param — try the order name
    for (const idVariant of [`#${cleanId}`, cleanId]) {
        try {
            const res = await rsApi.get(`${PUBLIC_API_BASE}/shipment_details`, {
                headers, params: { shipment_id: idVariant }, timeout: 10000
            });
            const details = res.data?.shipment_details;
            if (details && details.shipment_id) {
                const resolved = {
                    order_id: details.order_id || details.shipment_id,
                    shipment_id: details.shipment_id,
                    seller_order_id: `#${cleanId}`,
                    order_status: details.shipment_status || '',
                    awb_number: details.awb || '',
                    courier_name: details.courier_name || '',
                    store_name: 'DEFAULT',
                    _resolved_via: 'shipment_details',
                };
                orderMap.set(cleanId, resolved);
                orderMap.set(`#${cleanId}`, resolved);
                if (resolved.awb_number) orderMap.set(resolved.awb_number, resolved);
                console.log(`[RAPIDSHYP] Resolved ${cleanId} via shipment_details: shipment=${resolved.shipment_id}, awb=${resolved.awb_number}`);
                return resolved;
            }
        } catch (e) {
            // Expected for orders without shipments yet — continue to next fallback
        }
    }

    // 3. Fallback: POST /track_order (works for orders with tracking data)
    for (const idVariant of [`#${cleanId}`, cleanId]) {
        try {
            const res = await rsApi.post(`${PUBLIC_API_BASE}/track_order`, {
                orderId: idVariant
            }, { headers, timeout: 10000 });
            const record = res.data?.records?.[0];
            if (record) {
                const shipmentDetails = record.shipment_details || [];
                const shipment = shipmentDetails[0] || {};
                const resolved = {
                    order_id: record.order_id || shipment.shipment_id,
                    shipment_id: shipment.shipment_id || record.order_id,
                    seller_order_id: `#${cleanId}`,
                    order_status: record.order_status || shipment.shipment_status || '',
                    awb_number: shipment.awb || '',
                    courier_name: shipment.courier_name || '',
                    store_name: record.store_name || 'DEFAULT',
                    _resolved_via: 'track_order',
                };
                orderMap.set(cleanId, resolved);
                orderMap.set(`#${cleanId}`, resolved);
                if (resolved.awb_number) orderMap.set(resolved.awb_number, resolved);
                console.log(`[RAPIDSHYP] Resolved ${cleanId} via track_order: shipment=${resolved.shipment_id}, status=${resolved.order_status}`);
                return resolved;
            }
        } catch (e) {
            // Continue to next variant
        }
    }

    console.warn(`[RAPIDSHYP] Could not resolve order ${cleanId} via session map, shipment_details, or track_order`);
    return null;
};

/**
 * Bulk assign AWB to multiple orders.
 * Uses session API for lookup (if JWT available), falls back to public track_order API,
 * then assigns AWB via public API.
 */
const bulkAssignAWB = async (orderNames) => {
    const headers = getPublicHeaders();

    // Build order map once for all lookups (cached for 2 min)
    const orderMap = await fetchAllOrders();
    console.log(`[RAPIDSHYP] Using order map with ${orderMap.size} entries for ${orderNames.length} orders`);

    // Separate into already-assigned (instant) and need-API-call
    const instantResults = [];
    const toAssign = [];

    // First pass: resolve all orders (session map + public API fallback in parallel)
    const resolveResults = await Promise.allSettled(
        orderNames.map(name => {
            const cleanId = name.toString().replace('#', '');
            return resolveOrder(cleanId, orderMap).then(match => ({ cleanId, match }));
        })
    );

    for (const r of resolveResults) {
        if (r.status !== 'fulfilled') continue;
        const { cleanId, match } = r.value;

        if (match && match.awb_number) {
            instantResults.push({
                orderId: cleanId,
                success: true,
                awb: match.awb_number,
                courier: match.courier_name || '',
                shipmentId: match.shipment_id || match.order_id,
                rsOrderId: match.order_id,
                message: 'Already assigned'
            });
        } else {
            toAssign.push({ cleanId, match });
        }
    }

    // Assign AWBs concurrently in batches of 5
    const BATCH_SIZE = 5;
    const apiResults = [];
    for (let i = 0; i < toAssign.length; i += BATCH_SIZE) {
        const batch = toAssign.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.allSettled(batch.map(async ({ cleanId, match }) => {
            try {
                if (!match) {
                    return { orderId: cleanId, success: false, message: `Order #${cleanId} not found in RapidShyp` };
                }

                // Try multiple ID formats: shipment_id, order_id, seller_order_id variants
                const idsToTry = [
                    match.shipment_id,
                    match.order_id,
                    `#${cleanId}`,
                    cleanId,
                ].filter(Boolean);

                // Remove duplicates while preserving order
                const uniqueIds = [...new Set(idsToTry)];

                let lastError = null;
                for (const tryId of uniqueIds) {
                    try {
                        const assignRes = await rsApi.post(`${PUBLIC_API_BASE}/assign_awb`, {
                            shipment_id: tryId
                        }, { headers });
                        const data = assignRes.data;
                        console.log(`[RAPIDSHYP] Assigned AWB for ${cleanId} (used id: ${tryId}): awb=${data.awb}`);
                        return {
                            orderId: cleanId,
                            success: true,
                            awb: data.awb || '',
                            courier: data.courier_name || '',
                            shipmentId: data.shipment_id || tryId,
                            rsOrderId: data.order_id || match.order_id
                        };
                    } catch (tryErr) {
                        lastError = tryErr;
                        // Only retry with next ID if it's a "not found" type error
                        const msg = tryErr.response?.data?.message || tryErr.response?.data?.remarks || '';
                        if (typeof msg === 'string' && (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('invalid'))) {
                            continue;
                        }
                        // For other errors (rate limit, server error), don't retry with different ID
                        throw tryErr;
                    }
                }
                // All ID variants failed
                const errMsg = lastError?.response?.data?.message || lastError?.response?.data?.remarks || lastError?.message || 'Unknown error';
                return { orderId: cleanId, success: false, message: typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg) };
            } catch (e) {
                const errMsg = e.response?.data?.message || e.response?.data?.remarks || e.message;
                console.error(`[RAPIDSHYP] Assign AWB failed for ${cleanId}:`, errMsg);
                return { orderId: cleanId, success: false, message: typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg) };
            }
        }));
        for (const r of batchResults) {
            apiResults.push(r.status === 'fulfilled' ? r.value : { orderId: '?', success: false, message: r.reason?.message || 'Unknown error' });
        }
    }

    const results = [...instantResults, ...apiResults];
    const successCount = results.filter(r => r.success).length;
    console.log(`[RAPIDSHYP] Bulk AWB: ${successCount}/${orderNames.length} assigned (${instantResults.length} instant, ${apiResults.length} via API).`);
    return { success: successCount > 0, results };
};

/**
 * Bulk approve unapproved orders in RapidShyp.
 * Uses PUBLIC API: POST /approve_orders with rapidshyp-token header.
 * Docs: https://docs.rapidshyp.com/docs/DocumentationSidebar/Forward%20B2C/Orders/POST%20Approve%20Order%20API
 *
 * Fetches all orders via session API, finds unapproved ones matching the given
 * Shopify order IDs, and approves them via public API so AWB assignment won't fail.
 */
const bulkApproveOrders = async (shopifyOrderIds) => {
    const headers = getPublicHeaders();
    const cleanIds = shopifyOrderIds.map(id => id.toString().replace('#', ''));

    console.log(`[RAPIDSHYP] Bulk approve: ${cleanIds.length} orders. Trying direct approve first...`);

    // Strategy 1: Try approving ALL order IDs directly (no session lookup needed).
    // RapidShyp approve_orders accepts seller_order_id format.
    // Try multiple ID formats in parallel to find what works.
    let approvedCount = 0;
    let alreadyApproved = 0;
    const errors = [];

    // Try with #ID format (seller_order_id as stored in RapidShyp)
    const hashIds = cleanIds.map(id => `#${id}`);
    try {
        const res = await rsApi.post(`${PUBLIC_API_BASE}/approve_orders`, {
            order_id: hashIds,
            store_name: 'DEFAULT'
        }, { headers, timeout: 15000 });

        const data = res.data || {};
        console.log(`[RAPIDSHYP] Direct approve response:`, JSON.stringify(data).slice(0, 500));

        if (data.status === 'success' || data.status === 'SUCCESS' || data.success) {
            approvedCount = cleanIds.length;
            console.log(`[RAPIDSHYP] Direct approve succeeded for ${approvedCount} orders`);
            _orderMapTimestamp = 0; // Invalidate cache
            return { success: true, approved: approvedCount, alreadyApproved: 0, notFound: 0, message: `${approvedCount} orders approved` };
        }

        // Check if "already approved" type response
        const remark = (data.remark || data.remarks || data.message || '').toString().toLowerCase();
        if (remark.includes('already') || remark.includes('approved')) {
            console.log(`[RAPIDSHYP] Orders already approved`);
            return { success: true, approved: 0, alreadyApproved: cleanIds.length, notFound: 0, message: 'All orders already approved' };
        }
    } catch (directErr) {
        const msg = directErr.response?.data?.remarks || directErr.response?.data?.message || directErr.message;
        console.warn(`[RAPIDSHYP] Direct approve with #IDs failed:`, msg);
    }

    // Strategy 2: If direct approve didn't work, try with internal order IDs via session map.
    // Use a fast, limited fetch (only first 3 pages to stay within Vercel timeout).
    console.log(`[RAPIDSHYP] Direct approve failed. Trying session lookup (limited pages)...`);

    const sessionHeaders = getSessionHeaders();
    if (!sessionHeaders) {
        return { success: false, approved: 0, alreadyApproved: 0, notFound: cleanIds.length,
            errors: [{ error: 'No JWT configured and direct approve failed' }],
            message: 'Cannot approve: no JWT and direct approve failed' };
    }

    // Quick session fetch — limited to 3 pages (600 orders) to stay within timeout
    const orderMap = new Map();
    try {
        for (let page = 1; page <= 5; page++) {
            const res = await rsApi.post(`${SESSION_API_BASE}/orders/get_orders`, {
                page, limit: 200
            }, { headers: sessionHeaders, timeout: 8000 });
            const records = res.data?.records || [];
            for (const r of records) {
                if (r.seller_order_id) {
                    const clean = r.seller_order_id.replace('#', '');
                    orderMap.set(clean, r);
                }
                if (r.order_id) orderMap.set(r.order_id, r);
            }
            if (records.length < 200) break;
        }
    } catch (e) {
        console.warn(`[RAPIDSHYP] Session fetch partially failed:`, e.message);
    }

    console.log(`[RAPIDSHYP] Quick session map: ${orderMap.size} entries`);

    const toApprove = [];
    let notFound = 0;

    for (const cleanId of cleanIds) {
        const match = orderMap.get(cleanId);
        if (!match) { notFound++; continue; }
        const status = (match.order_status || '').toLowerCase();
        if (status === 'approved' || status === 'shipped' || status === 'in_transit' ||
            status === 'delivered' || match.awb_number) {
            alreadyApproved++;
            continue;
        }
        toApprove.push({ orderId: match.order_id, storeName: match.store_name || 'DEFAULT', cleanId });
    }

    if (toApprove.length === 0) {
        return { success: true, approved: 0, alreadyApproved, notFound, message: 'All orders already approved or not found' };
    }

    // Group by store and approve
    const byStore = {};
    for (const item of toApprove) {
        const store = item.storeName;
        if (!byStore[store]) byStore[store] = [];
        byStore[store].push(item);
    }

    const storeResults = await Promise.allSettled(Object.entries(byStore).map(async ([storeName, items]) => {
        const orderIds = items.map(o => o.orderId).filter(Boolean);
        try {
            const res = await rsApi.post(`${PUBLIC_API_BASE}/approve_orders`, {
                order_id: orderIds,
                store_name: storeName
            }, { headers, timeout: 15000 });
            if (res.data?.status === 'success' || res.data?.status === 'SUCCESS' || res.data?.success) {
                return { approved: orderIds.length };
            }
            const remark = res.data?.remark || res.data?.remarks || res.data?.message || 'Unknown';
            return { error: { store: storeName, error: remark } };
        } catch (e) {
            const msg = e.response?.data?.remarks || e.response?.data?.message || e.message;
            return { error: { store: storeName, error: typeof msg === 'string' ? msg : JSON.stringify(msg) } };
        }
    }));

    for (const r of storeResults) {
        if (r.status === 'fulfilled') {
            if (r.value.approved) approvedCount += r.value.approved;
            if (r.value.error) errors.push(r.value.error);
        }
    }

    _orderMapTimestamp = 0; // Invalidate cache after approval

    return {
        success: approvedCount > 0 || alreadyApproved > 0,
        approved: approvedCount,
        alreadyApproved,
        notFound,
        errors: errors.length > 0 ? errors : undefined,
        message: `${approvedCount} approved, ${alreadyApproved} already approved, ${notFound} not in RapidShyp`
    };
};

/**
 * Get wallet balance from RapidShyp. Requires JWT (session API).
 * Endpoint: GET /session/payments/get_wallet_balance
 * Response: { status: true, amount: 1234.56, hold_amount: 0, credit_limit: 0 }
 */
const getWalletBalance = async () => {
    const sessionHeaders = getSessionHeaders();
    if (!sessionHeaders) {
        console.log('[RAPIDSHYP] No JWT configured — wallet balance unavailable.');
        return { success: false, balance: 0, message: 'JWT not configured. Set RAPIDSHYP_JWT in env to enable wallet.' };
    }

    try {
        const res = await rsApi.get(`${SESSION_API_BASE}/payments/get_wallet_balance`, { headers: sessionHeaders, timeout: 10000 });
        const balance = res.data?.amount ?? res.data?.balance ?? res.data?.available_balance ?? 0;
        const holdAmount = res.data?.hold_amount ?? 0;
        const creditLimit = res.data?.credit_limit ?? 0;
        console.log(`[RAPIDSHYP] Wallet: ₹${balance} (hold: ₹${holdAmount}, credit: ₹${creditLimit})`);
        return { success: true, balance: parseFloat(balance) || 0, holdAmount: parseFloat(holdAmount) || 0, creditLimit: parseFloat(creditLimit) || 0 };
    } catch (e) {
        console.error('[RAPIDSHYP] Wallet error:', e.response?.status, e.response?.data || e.message);
        return { success: false, balance: 0, message: e.response?.data?.message || e.message };
    }
};

/**
 * Generate labels for multiple shipments (public API — works with API key).
 * Per docs: GET /generate_label with body { shipmentId: ["id1", "id2"] }
 */
const bulkGenerateLabels = async (shipmentIds) => {
    try {
        const headers = getPublicHeaders();
        const payload = { shipmentId: shipmentIds };
        console.log(`[RAPIDSHYP] Generating labels for ${shipmentIds.length} shipments...`);

        const response = await rsApi.post(`${PUBLIC_API_BASE}/generate_label`, payload, { headers });

        const data = response.data || {};
        const labelUrl = data.label_url || data.labelUrl || (data.labelData?.[0]?.labelURL) || '';

        console.log(`[RAPIDSHYP] Labels generated. URL: ${labelUrl || 'check individual labels'}`);
        return { success: true, labelUrl, labels: data.labelData || [], data: { ...data, label_url: labelUrl, label_pdf_url: labelUrl } };
    } catch (e) {
        const errMsg = e.response?.data?.remarks || e.response?.data?.message || e.response?.data || e.message;
        console.error(`[RAPIDSHYP] Bulk label generation failed:`, errMsg);
        return { success: false, labelUrl: '', labels: [], message: typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg) };
    }
};

/**
 * Look up RapidShyp shipment ID from an AWB number.
 * Uses session API search if JWT available, falls back to tracking.
 * Returns the shipment_id needed for label generation.
 */
const findOrderIdByAWB = async (awb) => {
    if (!awb) return null;

    // Check cached order map first (fast, no API call if cached)
    if (_orderMapCache) {
        const cached = _orderMapCache.get(awb);
        if (cached) {
            const shipId = cached.shipment_id || cached.order_id;
            console.log(`[RAPIDSHYP] Found shipment ${shipId} for AWB ${awb} from cache`);
            return shipId;
        }
    }

    // Use public shipment_details endpoint (reliable, works with API key)
    // Docs: GET /shipment_details?shipment_id=X
    try {
        const headers = getPublicHeaders();
        const detailRes = await rsApi.get(`${PUBLIC_API_BASE}/shipment_details`, {
            headers,
            params: { shipment_id: awb }
        });
        const shipId = detailRes.data?.shipment_details?.shipment_id || detailRes.data?.shipment_id;
        if (shipId) {
            console.log(`[RAPIDSHYP] Found shipment ${shipId} for AWB ${awb} via shipment_details`);
            return shipId;
        }
    } catch (e) {
        console.warn(`[RAPIDSHYP] Shipment details lookup by AWB failed: ${e.response?.status || e.message}`);
    }

    // Use tracking endpoint — returns records[].shipment_details[].shipment_id
    try {
        const headers = getPublicHeaders();
        const trackRes = await rsApi.post(`${PUBLIC_API_BASE}/track_order`, { awb }, { headers });
        const records = trackRes.data?.records || [];
        if (records.length > 0) {
            const shipments = records[0].shipment_details || [];
            const match = shipments.find(s => s.awb === awb);
            const shipId = match?.shipment_id || shipments[0]?.shipment_id;
            if (shipId) {
                console.log(`[RAPIDSHYP] Found shipment ${shipId} for AWB ${awb} via tracking`);
                return shipId;
            }
        }
    } catch (e) {
        console.warn(`[RAPIDSHYP] Track lookup by AWB failed: ${e.response?.status || e.message}`);
    }

    console.warn(`[RAPIDSHYP] Could not find shipment ID for AWB ${awb}`);
    return null;
};

/**
 * Schedule pickup for a shipment (public API).
 * Docs: POST /schedule_pickup with { shipment_id, awb (optional) }
 * Should be called after AWB assignment.
 */
const schedulePickup = async (shipmentId, awb) => {
    try {
        const headers = getPublicHeaders();
        const payload = { shipment_id: shipmentId };
        if (awb) payload.awb = awb;

        const res = await rsApi.post(`${PUBLIC_API_BASE}/schedule_pickup`, payload, { headers, timeout: 15000 });
        console.log(`[RAPIDSHYP] Scheduled pickup for shipment ${shipmentId}: ${res.data?.status || 'OK'}`);
        return { success: true, data: res.data };
    } catch (e) {
        const errMsg = e.response?.data?.message || e.response?.data?.remarks || e.message;
        console.warn(`[RAPIDSHYP] Schedule pickup failed for ${shipmentId}:`, errMsg);
        return { success: false, message: typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg) };
    }
};

/**
 * Bulk schedule pickup for multiple shipments (after AWB assignment).
 * Runs in parallel batches of 5.
 */
const bulkSchedulePickup = async (assignments) => {
    // assignments = [{ shipmentId, awb }]
    const validAssignments = assignments.filter(a => a.shipmentId && a.awb);
    if (validAssignments.length === 0) {
        return { success: true, scheduled: 0, message: 'No valid assignments to schedule' };
    }

    console.log(`[RAPIDSHYP] Scheduling pickup for ${validAssignments.length} shipments...`);
    const BATCH_SIZE = 5;
    let scheduled = 0;
    const errors = [];

    for (let i = 0; i < validAssignments.length; i += BATCH_SIZE) {
        const batch = validAssignments.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
            batch.map(a => schedulePickup(a.shipmentId, a.awb))
        );
        for (const r of results) {
            if (r.status === 'fulfilled' && r.value.success) {
                scheduled++;
            } else {
                errors.push(r.status === 'fulfilled' ? r.value.message : r.reason?.message);
            }
        }
    }

    console.log(`[RAPIDSHYP] Pickup scheduled: ${scheduled}/${validAssignments.length}`);
    return { success: scheduled > 0, scheduled, total: validAssignments.length, errors: errors.length > 0 ? errors : undefined };
};

module.exports = {
    getPublicHeaders,
    getSessionHeaders,
    fetchAllOrders,
    fetchOrdersWithRTO,
    bulkApproveOrders,
    cancelOrder,
    trackOrder,
    getOrderInfo,
    generateLabel,
    bulkAssignAWB,
    getWalletBalance,
    bulkGenerateLabels,
    findOrderIdByAWB,
    schedulePickup,
    bulkSchedulePickup,
    mapRTORisk,
    buildRTOReason
};
