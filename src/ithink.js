const axios = require('axios');
require('dotenv').config();

/**
 * iThink Logistics API V3 Integration
 *
 * Replaces the previous RapidShyp integration.
 *
 * Key difference from RapidShyp: iThink creates the order AND assigns the AWB
 * (waybill) in a SINGLE call (`order/add.json`). There is no separate
 * approve → assign_awb → schedule_pickup flow and no "shipment_id" to resolve.
 * The waybill returned by order creation IS the shipment identifier used for
 * labels, tracking, manifests and cancellation.
 *
 * Auth: access_token + secret_key are passed inside the JSON body under `data`
 * (NOT in headers). Every endpoint follows the same { "data": { ...payload,
 * access_token, secret_key } } convention.
 *
 * Docs: https://docs.ithinklogistics.com/
 */

const ITHINK_BASE = (process.env.ITHINK_API_BASE || 'https://my.ithinklogistics.com/api_v3').replace(/\/$/, '');

// Pickup/return warehouse id (from warehouse/get.json). GRLHOOD ships from "NBE HQ" Noida.
const PICKUP_ADDRESS_ID = (process.env.ITHINK_PICKUP_ADDRESS_ID || '119349').trim();
const RETURN_ADDRESS_ID = (process.env.ITHINK_RETURN_ADDRESS_ID || PICKUP_ADDRESS_ID).trim();

// Courier selection. Default 'auto' = omit `logistics` from order/add.json so
// iThink's own courier recommendation engine assigns the best courier per
// shipment (docs: logistics is OPTIONAL). Set a specific courier name
// (delhivery, bluedart, xpressbees, ecom, ekart...) to force one.
const LOGISTICS = (process.env.ITHINK_LOGISTICS || 'auto').trim();
const SERVICE_TYPE = (process.env.ITHINK_SERVICE_TYPE || '').trim(); // air | surface (bluedart/delhivery only)

// Warehouse origin pincode — used for rate/check.json (courier recommendation + diagnosis).
const FROM_PINCODE = (process.env.ITHINK_FROM_PINCODE || '201301').trim();

// Default parcel dimensions/weight for GRLHOOD products (phone cases & grips — small/light).
const DEFAULT_WEIGHT_KG = (process.env.ITHINK_DEFAULT_WEIGHT_KG || '0.3').trim();
const DEFAULT_LENGTH_CM = (process.env.ITHINK_DEFAULT_LENGTH_CM || '15').trim();
const DEFAULT_WIDTH_CM = (process.env.ITHINK_DEFAULT_WIDTH_CM || '10').trim();
const DEFAULT_HEIGHT_CM = (process.env.ITHINK_DEFAULT_HEIGHT_CM || '3').trim();

const itlApi = axios.create({ timeout: 120000 });

itlApi.interceptors.response.use(
    (response) => response,
    async (error) => {
        const config = error.config;
        if (error.response?.status === 429 && (!config._retryCount || config._retryCount < 3)) {
            config._retryCount = (config._retryCount || 0) + 1;
            const delay = Math.pow(2, config._retryCount) * 1000;
            console.warn(`[ITHINK] Rate limited. Retrying in ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
            return itlApi(config);
        }
        return Promise.reject(error);
    }
);

const getCreds = () => {
    const access_token = (process.env.ITHINK_ACCESS_TOKEN || '').trim();
    const secret_key = (process.env.ITHINK_SECRET_KEY || '').trim();
    if (!access_token || !secret_key) {
        throw new Error('ITHINK_ACCESS_TOKEN / ITHINK_SECRET_KEY are not set in env');
    }
    return { access_token, secret_key };
};

/**
 * POST a payload to an iThink endpoint. Wraps the payload in { data: {...creds} }.
 */
const post = async (path, payload, timeout = 60000) => {
    const creds = getCreds();
    const body = { data: { ...payload, ...creds } };
    const res = await itlApi.post(`${ITHINK_BASE}${path}`, body, {
        headers: { 'Content-Type': 'application/json' },
        timeout,
    });
    return res.data;
};

// ──────────────────────────────────────────────────────────────────────────
// Helpers for mapping Shopify orders → iThink shipment payloads
// ──────────────────────────────────────────────────────────────────────────

const cleanPhone = (p) => {
    const digits = String(p || '').replace(/\D/g, '');
    return digits.length > 10 ? digits.slice(-10) : digits;
};

const formatOrderDate = (createdAt) => {
    const d = createdAt ? new Date(createdAt) : new Date();
    if (isNaN(d.getTime())) return formatOrderDate(null);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
};

const isCOD = (payment) => {
    const p = String(payment || '').toLowerCase();
    return p.includes('cod') || p.includes('cash');
};

/**
 * Build the iThink products[] array from an order's line items / units.
 * Aggregates identical SKUs into a single product line with summed quantity.
 */
const buildProducts = (order) => {
    const units = order.items || order.units || [];
    const grouped = {};

    for (const u of units) {
        const name = u.model || u.category || u.product_name || u.title || 'GRLHOOD Product';
        const sku = u.sku || u.product_sku || '';
        const price = parseFloat(u.price ?? u.product_price ?? 0) || 0;
        const qty = parseInt(u.quantity ?? u.product_quantity ?? 1, 10) || 1;
        const key = `${name}__${sku}__${price}`;
        if (!grouped[key]) {
            grouped[key] = { product_name: name, product_sku: sku, product_quantity: 0, product_price: String(price) };
        }
        grouped[key].product_quantity += qty;
    }

    let products = Object.values(grouped).map(p => ({ ...p, product_quantity: String(p.product_quantity) }));

    if (products.length === 0) {
        products = [{ product_name: 'GRLHOOD Product', product_sku: '', product_quantity: '1', product_price: String(order.orderTotal || order.total_amount || 0) }];
    }
    // iThink allows max 40 products per shipment
    return products.slice(0, 40);
};

/**
 * Compute the order's monetary total from line items (fallback to orderTotal field).
 */
const computeTotal = (order) => {
    if (order.orderTotal != null) return parseFloat(order.orderTotal) || 0;
    if (order.total_amount != null) return parseFloat(order.total_amount) || 0;
    const units = order.items || order.units || [];
    return units.reduce((sum, u) => {
        const price = parseFloat(u.price ?? u.product_price ?? 0) || 0;
        const qty = parseInt(u.quantity ?? u.product_quantity ?? 1, 10) || 1;
        return sum + price * qty;
    }, 0);
};

/**
 * Map a single Shopify-style order object into an iThink shipment object.
 */
const buildShipment = (order, overrides = {}) => {
    const ship = order.shippingDetails || {};
    const total = computeTotal(order);
    const paymentStr = String(order.payment ?? order.payment_mode ?? '').toLowerCase();
    const isPartial = paymentStr.includes('partial');
    const cod = isPartial || isCOD(order.payment ?? order.payment_mode);
    // Partially Paid: amount already collected goes to advance_amount,
    // outstanding balance is collected on delivery (cod_amount).
    const advance = isPartial ? Math.min(parseFloat(order.amountReceived) || 0, total) : 0;
    const codAmount = cod ? Math.max(0, total - advance) : 0;
    const orderRef = String(order.orderId ?? order.order ?? order.id ?? '').replace('#', '');

    return {
        order: orderRef,
        sub_order: '',
        order_date: formatOrderDate(order.createdAt),
        total_amount: String(total),
        name: order.customerName || ship.name || 'Customer',
        company_name: '',
        add: ship.address1 || ship.add || order.address1 || '',
        add2: ship.address2 || '',
        add3: '',
        pin: String(ship.zip || ship.pin || order.zip || ''),
        city: ship.city || order.city || '',
        state: ship.state || order.state || '',
        country: ship.country || 'India',
        phone: cleanPhone(ship.phone || order.phone),
        alt_phone: '',
        email: ship.email || order.email || '',
        is_billing_same_as_shipping: 'yes',
        products: buildProducts(order),
        shipment_length: String(overrides.length || DEFAULT_LENGTH_CM),
        shipment_width: String(overrides.width || DEFAULT_WIDTH_CM),
        shipment_height: String(overrides.height || DEFAULT_HEIGHT_CM),
        weight: String(overrides.weight || DEFAULT_WEIGHT_KG),
        shipping_charges: '0',
        giftwrap_charges: '0',
        transaction_charges: '0',
        total_discount: '0',
        first_attemp_discount: '0',
        cod_charges: '0',
        advance_amount: String(advance),
        cod_amount: String(codAmount),
        // Docs: allowed values "cod" or "Prepaid" (default: cod)
        payment_mode: cod ? 'cod' : 'Prepaid',
        return_address_id: RETURN_ADDRESS_ID,
    };
};

// ──────────────────────────────────────────────────────────────────────────
// Core API operations
// ──────────────────────────────────────────────────────────────────────────

/**
 * Get iThink's courier options for a destination via rate/check.json.
 * Returns ALL couriers on the lane with serviceability flags, rate and TAT —
 * sorted cheapest-first among serviceable options.
 *
 * @returns {{ success, couriers: Array<{name, serviceType, serviceable, cod, prepaid, rate, tat, zone}>, expectedDelivery, message }}
 */
const recommendCouriers = async ({ toPincode, paymentMethod = 'cod', mrp = 0, weightKg, length, width, height }) => {
    try {
        const wantCod = String(paymentMethod).toLowerCase() === 'cod';
        const data = await post('/rate/check.json', {
            from_pincode: FROM_PINCODE,
            to_pincode: String(toPincode || ''),
            shipping_length_cms: String(length || DEFAULT_LENGTH_CM),
            shipping_width_cms: String(width || DEFAULT_WIDTH_CM),
            shipping_height_cms: String(height || DEFAULT_HEIGHT_CM),
            shipping_weight_kg: String(weightKg || DEFAULT_WEIGHT_KG),
            order_type: 'forward',
            payment_method: wantCod ? 'cod' : 'prepaid',
            product_mrp: String(mrp || 0),
        });
        const raw = Array.isArray(data?.data) ? data.data : [];
        const couriers = raw.map(o => ({
            name: String(o.logistic_name || ''),
            serviceType: o.service_type || '',
            serviceable: wantCod ? o.cod === 'Y' : o.prepaid === 'Y',
            cod: o.cod === 'Y',
            prepaid: o.prepaid === 'Y',
            pickup: o.pickup === 'Y',
            rate: parseFloat(o.rate) || null,
            tat: o.delivery_tat || '',
            zone: o.logistics_zone || '',
        }));
        // Serviceable first, cheapest first within each bucket
        couriers.sort((a, b) => (b.serviceable - a.serviceable) || ((a.rate ?? 1e9) - (b.rate ?? 1e9)));
        return {
            success: String(data?.status || '').toLowerCase() === 'success',
            couriers,
            expectedDelivery: data?.expected_delivery_date || '',
            zone: data?.zone || '',
        };
    } catch (e) {
        console.warn('[ITHINK] recommendCouriers failed:', e.message);
        return { success: false, couriers: [], message: e.message };
    }
};

/**
 * Diagnose why a shipment failed / whether a pincode is serviceable, and what
 * courier alternatives exist. Combines pincode/check + rate/check.
 *
 * @returns {{ pincode, serviceable, issue, couriers, expectedDelivery }}
 */
const diagnoseServiceability = async ({ pincode, paymentMethod = 'cod', mrp = 0 }) => {
    const pin = String(pincode || '').trim();
    if (!/^\d{6}$/.test(pin)) {
        return { pincode: pin, serviceable: false, issue: `Invalid pincode "${pin}" — must be 6 digits`, couriers: [] };
    }

    const [pinRes, rateRes] = await Promise.all([
        checkPincode(pin),
        recommendCouriers({ toPincode: pin, paymentMethod, mrp }),
    ]);

    const couriers = rateRes.couriers || [];
    const available = couriers.filter(c => c.serviceable);
    const wantCod = String(paymentMethod).toLowerCase() === 'cod';

    let issue = null;
    if (!pinRes.success || !pinRes.data) {
        issue = `Pincode ${pin} is not serviceable by any courier`;
    } else if (available.length === 0 && couriers.length > 0) {
        issue = wantCod
            ? `Pincode ${pin} has no COD-serviceable courier (prepaid may work)`
            : `Pincode ${pin} has no prepaid-serviceable courier`;
    } else if (available.length === 0) {
        issue = `No courier services pincode ${pin} from warehouse ${FROM_PINCODE}`;
    }

    return {
        pincode: pin,
        serviceable: available.length > 0,
        issue,
        couriers,
        availableCouriers: available.map(c => c.name),
        expectedDelivery: rateRes.expectedDelivery || '',
    };
};

/**
 * Wallet balance. NOTE: iThink Logistics does NOT expose a wallet-balance
 * endpoint in its public API (verified against docs v1/v2/v3 and by probing
 * the API). We attempt known endpoint patterns in case one is enabled for
 * this account; otherwise we report unavailable with a dashboard link.
 */
const getWalletBalance = async () => {
    const candidates = ['/wallet/balance.json', '/wallet/get.json', '/account/balance.json'];
    for (const path of candidates) {
        try {
            const data = await post(path, {}, 15000);
            const bal = data?.data?.balance ?? data?.balance ?? data?.data?.wallet_balance ?? data?.wallet_balance;
            if (bal !== undefined && bal !== null && data && String(data?.status || '').toLowerCase() === 'success') {
                return { success: true, balance: parseFloat(bal), source: path };
            }
        } catch { /* try next */ }
    }
    return {
        success: false,
        balance: null,
        message: 'iThink API does not expose wallet balance — check my.ithinklogistics.com dashboard',
        dashboardUrl: 'https://my.ithinklogistics.com/',
    };
};

/**
 * Create (ship) one or more orders on iThink. Each shipment gets a waybill (AWB)
 * assigned immediately. Max 10 shipments per request.
 *
 * @param {Array} orders  Array of Shopify-style order objects.
 * @returns {{ results: Array<{orderId, success, awb, courier, trackingUrl, message}> }}
 */
const createOrders = async (orders, options = {}) => {
    const logistics = (options.logistics || LOGISTICS).trim().toLowerCase();
    const useRecommendation = !logistics || logistics === 'auto' || logistics === 'recommended';
    const results = [];
    const BATCH = 10; // iThink: max 10 shipments per request

    for (let i = 0; i < orders.length; i += BATCH) {
        const batch = orders.slice(i, i + BATCH);
        const shipments = batch.map(o => buildShipment(o));

        const payload = {
            shipments,
            pickup_address_id: PICKUP_ADDRESS_ID,
            order_type: 'forward',
            // iThink rejects requests where s_type is absent ("The Shipment
            // Service Type field must be present") even though the docs mark
            // it optional — verified live. An empty string passes validation
            // and lets the recommendation engine pick the mode.
            s_type: SERVICE_TYPE || '',
        };
        // Courier: omit `logistics` entirely for iThink's own recommendation
        // engine to assign the courier; set it only to force a specific one
        // (e.g. manual re-ship after a serviceability failure).
        if (!useRecommendation) {
            payload.logistics = logistics;
        }

        try {
            const data = await post('/order/add.json', payload, 150000);
            // Response: data.data is an object keyed "1","2"... matching shipment order
            const resultMap = data?.data || {};
            const entries = Object.values(resultMap);

            batch.forEach((order, idx) => {
                const orderRef = String(order.orderId ?? order.id ?? '').replace('#', '');
                // Match by refnum when possible, else positional
                let entry = entries.find(e => String(e.refnum || '').replace('#', '') === orderRef);
                if (!entry) entry = resultMap[String(idx + 1)] || entries[idx];

                const ok = entry && String(entry.status || '').toLowerCase() === 'success' && entry.waybill;
                if (ok) {
                    results.push({
                        orderId: orderRef,
                        success: true,
                        awb: String(entry.waybill),
                        shipmentId: String(entry.waybill), // waybill IS the shipment id for iThink
                        courier: entry.logistic_name || (useRecommendation ? '' : logistics),
                        trackingUrl: entry.tracking_url || '',
                        message: 'Created',
                    });
                } else {
                    results.push({
                        orderId: orderRef,
                        success: false,
                        message: entry?.remark || data?.html_message || data?.status || 'Order creation failed',
                        // Context for downstream diagnosis (pincode serviceability etc.)
                        pincode: shipments[idx]?.pin || '',
                        paymentMethod: shipments[idx]?.payment_mode || 'cod',
                        mrp: shipments[idx]?.total_amount || '0',
                        courierTried: useRecommendation ? 'auto (iThink recommendation)' : logistics,
                    });
                }
            });
        } catch (e) {
            const msg = e.response?.data?.html_message || e.response?.data?.status || e.message;
            console.error('[ITHINK] createOrders batch failed:', msg);
            batch.forEach((order, idx) => {
                const orderRef = String(order.orderId ?? order.id ?? '').replace('#', '');
                results.push({
                    orderId: orderRef,
                    success: false,
                    message: typeof msg === 'string' ? msg : JSON.stringify(msg),
                    pincode: shipments[idx]?.pin || '',
                    paymentMethod: shipments[idx]?.payment_mode || 'cod',
                    mrp: shipments[idx]?.total_amount || '0',
                    courierTried: useRecommendation ? 'auto (iThink recommendation)' : logistics,
                });
            });
        }
    }

    const ok = results.filter(r => r.success).length;
    console.log(`[ITHINK] createOrders: ${ok}/${orders.length} shipped${useRecommendation ? ' (courier: iThink recommendation)' : ` (courier: ${logistics})`}`);
    return { results };
};

/**
 * Print shipping label(s) by AWB number(s). Max 100 per request.
 * @returns {{ success, labelUrl, data }}
 */
const printLabel = async (awbNumbers, pageSize = 'A4') => {
    try {
        const awbs = (Array.isArray(awbNumbers) ? awbNumbers : [awbNumbers]).filter(Boolean).map(String);
        if (awbs.length === 0) return { success: false, message: 'No AWB numbers provided' };

        const data = await post('/shipping/label.json', {
            awb_numbers: awbs.join(','),
            page_size: pageSize,
            display_cod_prepaid: '',
            display_shipper_mobile: '',
            display_shipper_address: '',
        });

        const labelUrl = data?.file_name || '';
        const ok = String(data?.status || '').toLowerCase() === 'success' && labelUrl;
        if (!ok) {
            return { success: false, message: data?.html_message || data?.status || 'Label generation failed' };
        }
        console.log(`[ITHINK] Label generated for ${awbs.length} AWB(s): ${labelUrl}`);
        return { success: true, labelUrl, label_url: labelUrl, label_pdf_url: labelUrl, labelUrl, data: { ...data, label_pdf_url: labelUrl, label_url: labelUrl } };
    } catch (e) {
        const msg = e.response?.data?.html_message || e.message;
        console.error('[ITHINK] printLabel failed:', msg);
        return { success: false, message: typeof msg === 'string' ? msg : JSON.stringify(msg) };
    }
};

/**
 * Print manifest by AWB number(s).
 */
const printManifest = async (awbNumbers) => {
    try {
        const awbs = (Array.isArray(awbNumbers) ? awbNumbers : [awbNumbers]).filter(Boolean).map(String);
        if (awbs.length === 0) return { success: false, message: 'No AWB numbers provided' };
        const data = await post('/shipping/manifest.json', { awb_numbers: awbs.join(',') });
        const url = data?.file_name || '';
        const ok = String(data?.status || '').toLowerCase() === 'success' && url;
        return ok ? { success: true, manifestUrl: url, data } : { success: false, message: data?.html_message || 'Manifest failed' };
    } catch (e) {
        return { success: false, message: e.response?.data?.html_message || e.message };
    }
};

/**
 * Track a shipment by AWB number(s). Max 10 per request.
 */
const trackOrder = async (awbNumbers) => {
    try {
        const awbs = (Array.isArray(awbNumbers) ? awbNumbers : [awbNumbers]).filter(Boolean).map(String);
        if (awbs.length === 0) return { success: false, data: null };
        const data = await post('/order/track.json', { awb_number_list: awbs.join(',') });
        return { success: String(data?.status_code) === '200' || !!data?.data, data: data?.data || data };
    } catch (e) {
        console.error('[ITHINK] trackOrder failed:', e.response?.data || e.message);
        return { success: false, data: null };
    }
};

/**
 * Cancel order(s) by AWB number(s). Max 100 per request.
 */
const cancelOrder = async (awbNumbers) => {
    try {
        const awbs = (Array.isArray(awbNumbers) ? awbNumbers : [awbNumbers]).filter(Boolean).map(String);
        if (awbs.length === 0) return { success: false, message: 'No AWB number to cancel' };
        const data = await post('/order/cancel.json', { awb_numbers: awbs.join(',') });
        const ok = String(data?.status || '').toLowerCase() === 'success';
        return ok ? { success: true, data } : { success: false, message: data?.html_message || 'Cancel failed', data };
    } catch (e) {
        return { success: false, message: e.response?.data?.html_message || e.message };
    }
};

/**
 * Get full order/shipment details by AWB number(s). Max 500 per request.
 */
const getOrderDetails = async (awbNumbers) => {
    try {
        const awbs = (Array.isArray(awbNumbers) ? awbNumbers : [awbNumbers]).filter(Boolean).map(String);
        if (awbs.length === 0) return { success: false, data: null };
        const data = await post('/order/get_details.json', { awb_number_list: awbs.join(',') });
        return { success: !!data?.data, data: data?.data || null };
    } catch (e) {
        return { success: false, data: null };
    }
};

/**
 * Check pincode serviceability.
 */
const checkPincode = async (pincode) => {
    try {
        const data = await post('/pincode/check.json', { pincode: String(pincode) });
        return { success: String(data?.status || '').toLowerCase() === 'success', data: data?.data?.[pincode] || data?.data || null };
    } catch (e) {
        return { success: false, data: null, message: e.message };
    }
};

/**
 * Get courier rates for a shipment.
 */
const getRate = async ({ fromPincode, toPincode, weightKg, length, width, height, paymentMethod = 'cod', mrp }) => {
    try {
        const data = await post('/rate/check.json', {
            from_pincode: String(fromPincode || ''),
            to_pincode: String(toPincode || ''),
            shipping_length_cms: String(length || DEFAULT_LENGTH_CM),
            shipping_width_cms: String(width || DEFAULT_WIDTH_CM),
            shipping_height_cms: String(height || DEFAULT_HEIGHT_CM),
            shipping_weight_kg: String(weightKg || DEFAULT_WEIGHT_KG),
            order_type: 'forward',
            payment_method: paymentMethod,
            product_mrp: String(mrp || 0),
        });
        return { success: String(data?.status || '').toLowerCase() === 'success', rates: data?.data || [], zone: data?.zone };
    } catch (e) {
        return { success: false, rates: [], message: e.message };
    }
};

/**
 * Get warehouse(s). Returns the list of pickup addresses.
 */
const getWarehouses = async (warehouseId) => {
    try {
        const payload = {};
        if (warehouseId) payload.warehouse_id = String(warehouseId);
        const data = await post('/warehouse/get.json', payload);
        return { success: String(data?.status || '').toLowerCase() === 'success', warehouses: data?.data || [] };
    } catch (e) {
        return { success: false, warehouses: [], message: e.message };
    }
};

module.exports = {
    ITHINK_BASE,
    PICKUP_ADDRESS_ID,
    FROM_PINCODE,
    getCreds,
    buildShipment,
    createOrders,
    printLabel,
    printManifest,
    trackOrder,
    cancelOrder,
    getOrderDetails,
    checkPincode,
    getRate,
    getWarehouses,
    recommendCouriers,
    diagnoseServiceability,
    getWalletBalance,
    isCOD,
};
