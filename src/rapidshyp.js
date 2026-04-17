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

// Cache of shipment_ids from approve responses — survives across approve → assign calls
const _shipmentCache = new Map(); // cleanId → shipment_id

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
 * Priority for resolving shipment_id:
 *   1. approveShipmentMap (from approve response — best case, no extra calls)
 *   2. Session API bulk lookup (reads all orders once, maps seller_order_id → shipment_id)
 *   3. track_order fallback (works for orders that already have AWB)
 * All write operations (assign_awb) use PUBLIC API only.
 */
const bulkAssignAWB = async (orderNames, approveShipmentMap = {}) => {
    const headers = getPublicHeaders();
    const cleanIds = orderNames.map(id => id.toString().replace('#', ''));
    const BATCH_SIZE = 10;

    console.log(`[RAPIDSHYP] Bulk assign AWB: ${cleanIds.length} orders, ${Object.keys(approveShipmentMap).length} shipment IDs from approve`);

    // Build session shipment map for orders not in approveShipmentMap
    // (handles already-approved orders where approve response was empty)
    const needLookup = cleanIds.filter(id => !approveShipmentMap[id]);
    const sessionShipmentMap = new Map(); // cleanId → { shipment_id, awb }

    if (needLookup.length > 0) {
        const sessionHeaders = getSessionHeaders();
        if (sessionHeaders) {
            try {
                const needed = new Set(needLookup);
                for (let page = 1; page <= 10; page++) {
                    const res = await rsApi.post(`${SESSION_API_BASE}/orders/get_orders`, {
                        page, limit: 200
                    }, { headers: sessionHeaders, timeout: 10000 });
                    const records = res.data?.records || [];
                    for (const r of records) {
                        if (r.seller_order_id) {
                            const clean = r.seller_order_id.replace('#', '');
                            if (needed.has(clean)) {
                                // Get shipment_id from the order's shipment array
                                const shipment = r.shipments?.[0] || {};
                                const shipmentId = shipment.shipment_id || r.shipment_id;
                                if (shipmentId) {
                                    sessionShipmentMap.set(clean, {
                                        shipmentId,
                                        awb: shipment.awb || r.awb_number || null,
                                        courier: shipment.courier_name || ''
                                    });
                                }
                            }
                        }
                    }
                    if (records.length < 200) break;
                }
                console.log(`[RAPIDSHYP] Session lookup: found ${sessionShipmentMap.size}/${needLookup.length} shipment IDs`);
            } catch (e) {
                console.warn(`[RAPIDSHYP] Session lookup failed:`, e.message);
            }
        }
    }

    // For each order, resolve shipment_id
    const resolveShipment = async (cleanId) => {
        // 1. From approve response (newly approved orders)
        if (approveShipmentMap[cleanId]) {
            return { cleanId, shipmentId: approveShipmentMap[cleanId], awb: null };
        }

        // 2. From server-side cache (shipment_ids from recent approve calls)
        if (_shipmentCache.has(cleanId)) {
            return { cleanId, shipmentId: _shipmentCache.get(cleanId), awb: null };
        }

        // 3. From session API lookup (already-approved orders)
        const sessionData = sessionShipmentMap.get(cleanId);
        if (sessionData?.shipmentId) {
            return { cleanId, shipmentId: sessionData.shipmentId, awb: sessionData.awb, courier: sessionData.courier };
        }

        // 3. Fallback: track_order with #orderId (works for orders that already have AWB)
        try {
            const res = await rsApi.post(`${PUBLIC_API_BASE}/track_order`, {
                orderId: `#${cleanId}`
            }, { headers, timeout: 10000 });
            const shipment = res.data?.records?.[0]?.shipment_details?.[0];
            if (shipment?.shipment_id) {
                return { cleanId, shipmentId: shipment.shipment_id, awb: shipment.awb || null, courier: shipment.courier_name || '' };
            }
        } catch (e) { /* no tracking data */ }

        return { cleanId, shipmentId: null, awb: null };
    };

    // Resolve all in parallel batches
    const resolved = [];
    for (let i = 0; i < cleanIds.length; i += BATCH_SIZE) {
        const batch = cleanIds.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(batch.map(resolveShipment));
        for (const r of results) {
            resolved.push(r.status === 'fulfilled' ? r.value : { cleanId: batch[0], shipmentId: null, awb: null });
        }
    }

    const withShipment = resolved.filter(r => r.shipmentId);
    const withAwb = resolved.filter(r => r.awb);
    const noShipment = resolved.filter(r => !r.shipmentId);
    console.log(`[RAPIDSHYP] Resolved: ${withShipment.length} have shipment_id, ${withAwb.length} already have AWB, ${noShipment.length} not found`);

    // Assign AWBs
    const finalResults = [];
    const toAssign = [];

    for (const r of resolved) {
        if (r.awb) {
            finalResults.push({ orderId: r.cleanId, success: true, awb: r.awb, courier: r.courier || '', shipmentId: r.shipmentId, message: 'Already assigned' });
        } else if (r.shipmentId) {
            toAssign.push(r);
        } else {
            finalResults.push({ orderId: r.cleanId, success: false, message: `No shipment_id found — order #${r.cleanId} may not be approved yet` });
        }
    }

    for (let i = 0; i < toAssign.length; i += BATCH_SIZE) {
        const batch = toAssign.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(batch.map(async (o) => {
            try {
                const res = await rsApi.post(`${PUBLIC_API_BASE}/assign_awb`, {
                    shipment_id: o.shipmentId
                }, { headers, timeout: 15000 });
                const data = res.data;
                console.log(`[RAPIDSHYP] AWB assigned #${o.cleanId}: shipment=${o.shipmentId} awb=${data.awb}`);
                return {
                    orderId: o.cleanId, success: true, awb: data.awb || '',
                    courier: data.courier_name || '', shipmentId: data.shipment_id || o.shipmentId,
                    rsOrderId: data.order_id || ''
                };
            } catch (e) {
                const msg = e.response?.data?.remarks || e.response?.data?.message || e.message;
                console.error(`[RAPIDSHYP] AWB failed #${o.cleanId} (shipment=${o.shipmentId}):`, msg);
                return { orderId: o.cleanId, success: false, message: typeof msg === 'string' ? msg : JSON.stringify(msg) };
            }
        }));
        for (const r of results) {
            finalResults.push(r.status === 'fulfilled' ? r.value : { orderId: '?', success: false, message: r.reason?.message || 'Unknown' });
        }
    }

    const successCount = finalResults.filter(r => r.success).length;
    console.log(`[RAPIDSHYP] Bulk AWB done: ${successCount}/${cleanIds.length} assigned`);
    return { success: successCount > 0, results: finalResults };
};

/**
 * Bulk approve orders in RapidShyp.
 * 1. Fetches session data to check order_status (APPROVAL_PENDING vs already approved)
 * 2. Sends ONLY pending orders to approve API (avoids "already approved" failure)
 * 3. Captures shipment_id from approve response for AWB assignment
 * 4. Retries transient errors and falls back to per-order approval for ambiguous batch failures
 */
const bulkApproveOrders = async (shopifyOrderIds, orderIdMap = {}) => {
    const headers = getPublicHeaders();
    const cleanIds = shopifyOrderIds.map(id => id.toString().replace('#', ''));

    console.log(`[RAPIDSHYP] Bulk approve: ${cleanIds.length} orders, ${Object.keys(orderIdMap).length} marketplace IDs from frontend`);

    // Step 1: Fetch session data to check which orders need approval
    const sessionHeaders = getSessionHeaders();
    const sessionMap = new Map(); // cleanId → { order_status, market_place_order_id }

    if (sessionHeaders) {
        try {
            // Paginate up to 25 pages (5000 orders) to catch older orders
            for (let page = 1; page <= 25; page++) {
                const res = await rsApi.post(`${SESSION_API_BASE}/orders/get_orders`, {
                    page, limit: 200
                }, { headers: sessionHeaders, timeout: 10000 });
                const records = res.data?.records || [];
                for (const r of records) {
                    if (r.seller_order_id) {
                        const clean = r.seller_order_id.replace('#', '');
                        sessionMap.set(clean, {
                            order_status: r.order_status,
                            market_place_order_id: String(r.market_place_order_id || ''),
                            awb_number: r.awb_number || ''
                        });
                    }
                }
                if (records.length < 200) break;
            }
            console.log(`[RAPIDSHYP] Session: ${sessionMap.size} orders fetched`);
        } catch (e) {
            console.warn(`[RAPIDSHYP] Session fetch failed:`, e.message);
        }
    }

    // Step 2: Classify orders
    const pendingApproval = [];
    let alreadyApproved = 0;
    let notFound = 0;
    const perOrderStatus = {}; // cleanId → 'approved' | 'already_approved' | 'not_found' | 'failed'

    for (const cleanId of cleanIds) {
        const session = sessionMap.get(cleanId);
        const marketplaceId = orderIdMap[cleanId]
            ? String(orderIdMap[cleanId])
            : (session?.market_place_order_id || null);

        if (!marketplaceId) {
            notFound++;
            perOrderStatus[cleanId] = 'not_found';
            console.warn(`[RAPIDSHYP] No marketplace ID for #${cleanId}`);
            continue;
        }

        const status = (session?.order_status || '').toUpperCase();
        if (status === 'APPROVAL_PENDING' || status === 'NEW' || !status) {
            pendingApproval.push({ cleanId, marketplaceId });
        } else {
            alreadyApproved++;
            perOrderStatus[cleanId] = 'already_approved';
            if (alreadyApproved <= 5) console.log(`[RAPIDSHYP] #${cleanId} already ${status}, mpId=${marketplaceId}`);
        }
    }

    console.log(`[RAPIDSHYP] ${pendingApproval.length} pending, ${alreadyApproved} already approved, ${notFound} not found`);

    if (pendingApproval.length === 0) {
        return { success: alreadyApproved > 0, approved: 0, alreadyApproved, notFound, failed: 0,
            shipmentMap: {}, perOrderStatus,
            message: `0 to approve, ${alreadyApproved} already approved` };
    }

    // Helper: call approve_orders API with one batch, retry on transient errors
    const callApproveApi = async (marketplaceIds, attempt = 1) => {
        try {
            const res = await rsApi.post(`${PUBLIC_API_BASE}/approve_orders`, {
                order_id: marketplaceIds,
                store_name: 'GRLHOOD'
            }, { headers, timeout: 30000 });
            return { ok: true, data: res.data || {} };
        } catch (e) {
            const status = e.response?.status;
            const transient = !status || status >= 500 || status === 429 || e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT';
            if (transient && attempt < 3) {
                const delay = Math.pow(2, attempt) * 1000;
                console.warn(`[RAPIDSHYP] Approve batch error (attempt ${attempt}, status=${status || e.code}), retry in ${delay}ms`);
                await new Promise(r => setTimeout(r, delay));
                return callApproveApi(marketplaceIds, attempt + 1);
            }
            return { ok: false, error: e.response?.data || e.message, status };
        }
    };

    // Step 3: Approve pending orders in batches of 50 (API limit)
    const APPROVE_BATCH = 50;
    let approvedCount = 0;
    let failedCount = 0;
    const orderShipmentMap = {};
    const errors = [];

    for (let i = 0; i < pendingApproval.length; i += APPROVE_BATCH) {
        const batch = pendingApproval.slice(i, i + APPROVE_BATCH);
        const batchIds = batch.map(o => o.marketplaceId);
        const batchNum = Math.floor(i / APPROVE_BATCH) + 1;

        console.log(`[RAPIDSHYP] Approving batch ${batchNum}: ${batch.length} orders...`);
        const result = await callApproveApi(batchIds);

        if (!result.ok) {
            // Batch completely failed — fall back to per-order approval
            console.warn(`[RAPIDSHYP] Batch ${batchNum} failed (${result.status}): ${JSON.stringify(result.error).slice(0, 200)} — falling back to per-order`);
            for (const o of batch) {
                const single = await callApproveApi([o.marketplaceId]);
                if (single.ok) {
                    const d = single.data;
                    const sc = d.success_count || 0;
                    const fc = d.failure_count || 0;
                    const remark = (d.remark || d.remarks || '').toLowerCase();
                    if (sc > 0) {
                        approvedCount++;
                        perOrderStatus[o.cleanId] = 'approved';
                        for (const ol of (d.order_list || [])) {
                            for (const s of (ol.shipment || [])) {
                                if (s.shipment_id) orderShipmentMap[o.cleanId] = s.shipment_id;
                            }
                        }
                    } else if (fc > 0 && remark.includes('already approved')) {
                        alreadyApproved++;
                        perOrderStatus[o.cleanId] = 'already_approved';
                    } else {
                        failedCount++;
                        perOrderStatus[o.cleanId] = 'failed';
                        errors.push({ orderId: o.cleanId, error: d.remark || 'unknown' });
                    }
                } else {
                    failedCount++;
                    perOrderStatus[o.cleanId] = 'failed';
                    errors.push({ orderId: o.cleanId, error: typeof single.error === 'string' ? single.error : JSON.stringify(single.error).slice(0, 200) });
                }
            }
            continue;
        }

        const data = result.data;
        const successCount = data.success_count || 0;
        const failCount = data.failure_count || 0;
        const remark = (data.remark || data.remarks || '').toLowerCase();
        console.log(`[RAPIDSHYP] Batch ${batchNum}: success=${successCount}, fail=${failCount}, remark="${data.remark || ''}", order_list=${(data.order_list||[]).length}`);

        approvedCount += successCount;

        // Mark all batch orders as approved by default — will refine via order_list
        for (const o of batch) perOrderStatus[o.cleanId] = 'approved';

        // Extract shipment_id mapping from newly approved orders
        for (const ol of (data.order_list || [])) {
            const match = batch.find(b => b.marketplaceId === String(ol.order_id));
            if (!match) continue;
            for (const s of (ol.shipment || [])) {
                if (s.shipment_id) orderShipmentMap[match.cleanId] = s.shipment_id;
            }
        }

        // Handle failures
        if (failCount > 0) {
            if (remark.includes('already approved') || remark.includes('already_approved')) {
                // Whole batch was already-approved — count all as alreadyApproved
                alreadyApproved += failCount;
                // Reclassify: orders in this batch that didn't get a shipment_id are the failures
                if (successCount === 0) {
                    for (const o of batch) perOrderStatus[o.cleanId] = 'already_approved';
                }
                console.log(`[RAPIDSHYP] Batch ${batchNum}: ${failCount} already approved`);
            } else {
                // Ambiguous failure — retry each failed order individually to get real status
                console.warn(`[RAPIDSHYP] Batch ${batchNum}: ${failCount} failed with remark "${data.remark}" — retrying individually`);
                // Identify which orders in batch didn't appear in success order_list
                const approvedInBatch = new Set((data.order_list || []).map(ol => String(ol.order_id)));
                const failedInBatch = batch.filter(o => !approvedInBatch.has(o.marketplaceId));

                for (const o of failedInBatch) {
                    const single = await callApproveApi([o.marketplaceId]);
                    if (single.ok) {
                        const d = single.data;
                        const sRemark = (d.remark || d.remarks || '').toLowerCase();
                        if ((d.success_count || 0) > 0) {
                            approvedCount++;
                            perOrderStatus[o.cleanId] = 'approved';
                            for (const ol of (d.order_list || [])) {
                                for (const s of (ol.shipment || [])) {
                                    if (s.shipment_id) orderShipmentMap[o.cleanId] = s.shipment_id;
                                }
                            }
                        } else if (sRemark.includes('already approved')) {
                            alreadyApproved++;
                            perOrderStatus[o.cleanId] = 'already_approved';
                        } else {
                            failedCount++;
                            perOrderStatus[o.cleanId] = 'failed';
                            errors.push({ orderId: o.cleanId, error: d.remark || 'unknown' });
                        }
                    } else {
                        failedCount++;
                        perOrderStatus[o.cleanId] = 'failed';
                        errors.push({ orderId: o.cleanId, error: typeof single.error === 'string' ? single.error : JSON.stringify(single.error).slice(0, 200) });
                    }
                }
            }
        }
    }

    // Cache shipment_ids so assign AWB can use them even without fresh approve
    for (const [id, shipId] of Object.entries(orderShipmentMap)) {
        _shipmentCache.set(id, shipId);
    }
    console.log(`[RAPIDSHYP] Approve done: ${approvedCount} new, ${alreadyApproved} already approved, ${notFound} not found, ${failedCount} failed, ${Object.keys(orderShipmentMap).length} shipment IDs`);

    return {
        success: approvedCount > 0 || alreadyApproved > 0,
        approved: approvedCount,
        alreadyApproved,
        notFound,
        failed: failedCount,
        shipmentMap: orderShipmentMap,
        perOrderStatus,
        errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
        message: `${approvedCount} approved, ${alreadyApproved} already approved${failedCount > 0 ? `, ${failedCount} failed` : ''}`
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
