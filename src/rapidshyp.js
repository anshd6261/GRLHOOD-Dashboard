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
                market_place_order_id: order.market_place_order_id, // Shopify internal ID — used for public API approve
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
    const PAGE_SIZE = 50; // Smaller pages = faster responses on Vercel
    let page = 1;
    let totalFetched = 0;

    try {
        while (true) {
            const res = await rsApi.post(`${SESSION_API_BASE}/orders/get_orders`, {
                page, limit: PAGE_SIZE
            }, { headers: sessionHeaders, timeout: 20000 });

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
                if (r.market_place_order_id) {
                    orderMap.set(r.market_place_order_id, r);
                }
            }

            totalFetched += records.length;
            if (records.length < PAGE_SIZE || totalFetched >= totalRecords) break;
            page++;
            // No delay between pages — speed is critical on Vercel
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
                    storeName: 'DEFAULT'
                }, { headers });
                return { success: true, data: cancelRes.data };
            } catch (directErr) {
                // Try with # prefix
                try {
                    const cancelRes = await rsApi.post(`${PUBLIC_API_BASE}/cancel_order`, {
                        orderId: `#${cleanId}`,
                        storeName: 'DEFAULT'
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
 * Bulk assign AWB to multiple orders.
 * Uses session API for lookup (if JWT available), then public API for AWB assignment.
 */
const bulkAssignAWB = async (orderNames) => {
    const headers = getPublicHeaders();
    const results = [];

    // Invalidate cache to get fresh data (approval may have just happened)
    _orderMapCache = null;
    _orderMapTimestamp = 0;

    const orderMap = await fetchAllOrders();
    console.log(`[RAPIDSHYP] Using order map with ${orderMap.size} entries for ${orderNames.length} orders. Shipment cache: ${_shipmentIdCache.size}`);

    for (const name of orderNames) {
        const cleanId = name.toString().replace('#', '');
        try {
            const match = orderMap.get(cleanId) || null;

            // Already has AWB — skip
            if (match?.awb_number) {
                results.push({
                    orderId: cleanId, success: true, awb: match.awb_number,
                    courier: match.courier_name || '', shipmentId: match.shipment_id || '',
                    message: 'Already assigned'
                });
                continue;
            }

            // Resolve shipment_id: cache first, then match fields, then track_order fallback
            let shipmentId = _shipmentIdCache.get(cleanId) || match?.shipment_id || null;

            if (!shipmentId && match?.market_place_order_id) {
                // Try track_order with marketplace ID to get shipment_id
                try {
                    const trackRes = await rsApi.post(`${PUBLIC_API_BASE}/track_order`, {
                        orderId: match.market_place_order_id
                    }, { headers, timeout: 10000 });
                    const shipments = trackRes.data?.records?.[0]?.shipment_details || [];
                    if (shipments.length > 0) {
                        shipmentId = shipments[0].shipment_id;
                        _shipmentIdCache.set(cleanId, shipmentId);
                    }
                } catch (trackErr) {
                    console.warn(`[RAPIDSHYP] Track failed for ${cleanId}: ${trackErr.response?.status || trackErr.message}`);
                }
            }

            if (!shipmentId) {
                results.push({ orderId: cleanId, success: false, message: 'No shipment_id — order may need approval first' });
                continue;
            }

            const assignRes = await rsApi.post(`${PUBLIC_API_BASE}/assign_awb`, {
                shipment_id: shipmentId
            }, { headers, timeout: 15000 });

            const data = assignRes.data;
            results.push({
                orderId: cleanId, success: true,
                awb: data.awb || '', courier: data.courier_name || '',
                shipmentId: data.shipment_id || shipmentId, rsOrderId: data.order_id || ''
            });
            console.log(`[RAPIDSHYP] Assigned AWB for ${cleanId}: ${data.awb} (shipment: ${shipmentId})`);
            await new Promise(r => setTimeout(r, 200));
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
 * Bulk approve unapproved orders in RapidShyp.
 * Uses PUBLIC API: POST /approve_orders with rapidshyp-token header.
 * Docs: https://docs.rapidshyp.com/docs/DocumentationSidebar/Forward%20B2C/Orders/POST%20Approve%20Order%20API
 *
 * Fetches all orders via session API, finds unapproved ones matching the given
 * Shopify order IDs, and approves them via public API so AWB assignment won't fail.
 */
/**
 * Shipment ID cache — populated by bulkApproveOrders response.
 * Maps Shopify order ID (clean, no #) → shipment_id from approve response.
 * Used by bulkAssignAWB to avoid needing to re-fetch.
 */
const _shipmentIdCache = new Map();

const bulkApproveOrders = async (shopifyOrderIds) => {
    const headers = getPublicHeaders();
    const orderMap = await fetchAllOrders();
    const toApprove = [];
    let alreadyApproved = 0;
    let notFound = 0;

    for (const id of shopifyOrderIds) {
        const cleanId = id.toString().replace('#', '');
        const match = orderMap.get(cleanId);
        if (!match) {
            notFound++;
            continue;
        }
        const status = (match.order_status || '').toLowerCase();
        if (status === 'approved' || status === 'shipped' || status === 'in_transit' ||
            status === 'delivered' || match.awb_number) {
            alreadyApproved++;
            continue;
        }
        // Use market_place_order_id — this is what the public API accepts
        const mpId = match.market_place_order_id;
        if (!mpId) {
            console.warn(`[RAPIDSHYP] Order ${cleanId} has no market_place_order_id`);
            notFound++;
            continue;
        }
        toApprove.push({ marketPlaceId: mpId, storeName: match.store_name || 'DEFAULT', cleanId });
    }

    console.log(`[RAPIDSHYP] Bulk approve: ${toApprove.length} to approve, ${alreadyApproved} already approved, ${notFound} not found in RS`);

    if (toApprove.length === 0) {
        return { success: true, approved: 0, alreadyApproved, notFound, message: 'All orders already approved or not found' };
    }

    let approvedCount = 0;
    const errors = [];

    // Group by store_name since the API requires it
    const byStore = {};
    for (const item of toApprove) {
        const store = item.storeName;
        if (!byStore[store]) byStore[store] = [];
        byStore[store].push(item);
    }

    for (const [storeName, items] of Object.entries(byStore)) {
        const marketPlaceIds = items.map(o => o.marketPlaceId).filter(Boolean);
        try {
            const res = await rsApi.post(`${PUBLIC_API_BASE}/approve_orders`, {
                order_id: marketPlaceIds,
                store_name: storeName
            }, { headers, timeout: 30000 });

            if (res.data?.status === 'success' || res.data?.status === 'SUCCESS' || res.data?.success) {
                approvedCount += (res.data.success_count || marketPlaceIds.length);
                console.log(`[RAPIDSHYP] Approved ${res.data.success_count || marketPlaceIds.length} orders (store: ${storeName})`);

                // Cache shipment_ids from approve response for bulkAssignAWB
                const orderList = res.data.order_list || [];
                for (const ol of orderList) {
                    const shipments = ol.shipment || [];
                    if (shipments.length > 0 && ol.order_id) {
                        // Find the matching cleanId for this market_place_order_id
                        const item = items.find(i => i.marketPlaceId === ol.order_id);
                        if (item) {
                            _shipmentIdCache.set(item.cleanId, shipments[0].shipment_id);
                            console.log(`[RAPIDSHYP] Cached shipment ${shipments[0].shipment_id} for order ${item.cleanId}`);
                        }
                    }
                }
            } else {
                console.warn(`[RAPIDSHYP] Approve response for store ${storeName}:`, res.data);
                const remark = res.data?.remark || res.data?.remarks || res.data?.message || 'Unknown response';
                errors.push({ store: storeName, error: remark });
            }
        } catch (e) {
            const msg = e.response?.data?.remarks || e.response?.data?.message || e.response?.data?.remark || e.message;
            console.error(`[RAPIDSHYP] Approve failed for store ${storeName}:`, msg);
            errors.push({ store: storeName, error: typeof msg === 'string' ? msg : JSON.stringify(msg) });
        }
    }

    // Invalidate order map cache so next fetch sees updated statuses
    _orderMapCache = null;
    _orderMapTimestamp = 0;

    return {
        success: approvedCount > 0 || alreadyApproved > 0,
        approved: approvedCount,
        alreadyApproved,
        notFound,
        shipmentsCached: _shipmentIdCache.size,
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
    mapRTORisk,
    buildRTOReason
};
