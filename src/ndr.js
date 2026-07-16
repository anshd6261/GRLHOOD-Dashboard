const ithink = require('./ithink');

/**
 * NDR / Shipment Board
 *
 * Builds a full picture of every synced store order + its live courier
 * status, bucketed for the NDR-management dashboard:
 *
 *   orders     — every synced store order (the master list)
 *   ready      — AWB assigned but not picked up yet (Manifested / Not Picked)
 *   transit    — moving (Picked Up → Out For Delivery, incl. Delayed/Misrouted)
 *   delivered  — Delivered
 *   ndr        — Undelivered (failed delivery attempt) — the actionable bucket
 *   rto        — any RTO status
 *
 * Status names come from iThink's documented tracking table. The status CODE
 * (UD/DL/RT/CN) is coarse, so bucketing uses the status NAME.
 */

// current_status name → bucket
const STATUS_BUCKET = [
    [/^delivered$/i, 'delivered'],
    [/^rto/i, 'rto'],
    [/^(undelivered|damaged)$/i, 'ndr'],
    [/^(manifested|not picked|pending pickup|pickup scheduled)$/i, 'ready'],
    [/^(picked ?up|in transit|reached at destination|out for delivery|out of delivery area|delayed|misrouted)$/i, 'transit'],
    [/^cancelled$/i, 'cancelled'],
];

const bucketFor = (status) => {
    const s = String(status || '').trim();
    if (!s) return 'ready'; // AWB exists but no scans yet
    for (const [re, bucket] of STATUS_BUCKET) if (re.test(s)) return bucket;
    return 'transit'; // unknown intermediate statuses default to transit
};

// ── Cache (module-level; survives warm serverless instances) ──
let boardCache = { key: null, ts: 0, board: null };
const storeDetailsCache = {}; // shopifyOrderId -> details (address/products don't change)
const BOARD_TTL_MS = 10 * 60 * 1000;

/** Run async worker over items with limited concurrency. */
const mapLimit = async (items, limit, worker) => {
    const results = new Array(items.length);
    let idx = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (idx < items.length) {
            const i = idx++;
            try { results[i] = await worker(items[i], i); }
            catch (e) { results[i] = null; console.warn('[NDR] worker failed:', e.message); }
        }
    });
    await Promise.all(runners);
    return results;
};

const chunk = (arr, n) => {
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
};

const fmtDate = (d) => {
    const dt = d instanceof Date ? d : new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

/**
 * Build the full board for the last `days` days of synced store orders.
 */
const buildBoard = async (days = 30, refresh = false) => {
    const key = `d${days}`;
    if (!refresh && boardCache.board && boardCache.key === key && Date.now() - boardCache.ts < BOARD_TTL_MS) {
        return { ...boardCache.board, cached: true };
    }

    // IST "today" so date windows match Indian business days
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // 1. Synced store order ids (Shopify platform = 2)
    const listRes = await ithink.storeOrderList(fmtDate(start), fmtDate(now));
    const orderIds = listRes.orderIds || [];

    // 2. Store order details (chunks of 10, capped concurrency), cached per id
    const missing = orderIds.filter(id => !storeDetailsCache[id]);
    await mapLimit(chunk(missing, 10), 6, async (ids) => {
        const map = await ithink.getStoreOrderDetails(ids);
        Object.entries(map).forEach(([id, det]) => { storeDetailsCache[id] = det; });
    });

    const details = orderIds.map(id => ({ shopifyId: id, ...(storeDetailsCache[id] || {}) }))
        .filter(d => d.order_number || d.order_id);

    // 3. Track every AWB (chunks of 10, capped concurrency) — always fresh
    const awbs = details.map(d => d.awb_no).filter(Boolean);
    const trackMap = {};
    await mapLimit(chunk([...new Set(awbs)], 10), 6, async (batch) => {
        const r = await ithink.trackOrder(batch);
        if (r.success && r.data) Object.assign(trackMap, r.data);
    });

    // 4. Merge + bucket
    const orders = details.map(d => {
        const awb = d.awb_no || '';
        const t = awb ? (trackMap[awb] || null) : null;
        const status = t?.current_status || '';
        const bucket = awb ? bucketFor(status) : 'orders';
        const last = t?.last_scan_details || {};
        const isPartial = String(d.payment_mode || '').toLowerCase().includes('partial');
        const isCod = isPartial || String(d.payment_mode || '').toLowerCase() === 'cod';

        return {
            shopifyId: d.shopifyId,
            orderNumber: d.order_number || '',
            orderDate: d.order_date || '',
            awb,
            courier: t?.logistic || '',
            status: status || (awb ? 'AWB Assigned' : 'Not Shipped'),
            statusDateTime: last.status_date_time || '',
            scanLocation: last.scan_location || '',
            bucket,
            ndrReason: last.reason || '',
            ndrRemark: last.remark || '',
            attemptCount: parseInt(t?.ofd_count, 10) || 0,
            edd: t?.expected_delivery_date || t?.promise_delivery_date || '',
            customer: {
                name: d.billing_name || '',
                phone: String(d.customer_phone || '').replace(/\D/g, '').slice(-10),
                email: d.customer_email || '',
                address: [d.customer_address1, d.customer_address2 !== d.customer_address1 ? d.customer_address2 : '']
                    .filter(Boolean).join(', '),
                city: d.customer_city || '',
                state: d.customer_state || '',
                pincode: d.customer_pincode || '',
            },
            products: (d.products || []).map(p => ({
                name: p.product_name || '',
                sku: p.product_sku || '',
                qty: parseInt(p.product_quantity, 10) || 1,
                price: parseFloat(p.product_price) || 0,
            })),
            totalAmount: parseFloat(d.total_amount) || 0,
            paymentMode: isPartial ? 'Partially Paid' : (isCod ? 'COD' : 'Prepaid'),
            isCod,
            trackingUrl: awb ? `https://ithinklogistics.co.in/postship/tracking/${awb}` : '',
        };
    });

    const counts = { orders: orders.length, ready: 0, transit: 0, delivered: 0, ndr: 0, rto: 0, cancelled: 0 };
    orders.forEach(o => { if (counts[o.bucket] !== undefined && o.bucket !== 'orders') counts[o.bucket]++; });

    const board = {
        success: true,
        generatedAt: new Date().toISOString(),
        days,
        counts,
        orders,
    };
    boardCache = { key, ts: Date.now(), board };
    return board;
};

/**
 * Take an NDR action on a shipment (iThink ndr/add-reattempt-rto.json).
 * action: 'reattempt' (1) — requires date (Y-m-d); optional phone/address update
 *         'rto' (2)      — requires remark
 */
const takeAction = async ({ awb, action, date, time, phone, address, addressType, remark }) => {
    if (!awb) return { success: false, message: 'AWB required' };
    const isRto = String(action).toLowerCase() === 'rto';

    const shipment = {
        awb_numbers: String(awb),
        ndr_action: isRto ? 2 : 1,
    };
    if (isRto) {
        shipment.rto_remark = remark || 'RTO initiated from GRLHOOD NDR dashboard';
    } else {
        // Default reattempt: tomorrow (IST)
        const d = date || fmtDate(new Date(new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).getTime() + 24 * 60 * 60 * 1000));
        shipment.reattempt_date = d;
        if (time) shipment.reattempt_time = time;
        if (phone) shipment.reattempt_mobile_number = String(phone).replace(/\D/g, '').slice(-10);
        if (address) {
            shipment.reattempt_address = address;
            shipment.reattempt_address_type = addressType === 2 ? 2 : 1;
        }
    }

    const data = await ithink.postRaw('/ndr/add-reattempt-rto.json', { shipments: [shipment] });
    const entry = Object.values(data?.data || {})[0] || {};
    const ok = String(data?.status || '').toLowerCase() === 'success' &&
        String(entry.status || '').toLowerCase() === 'success';
    return {
        success: ok,
        message: entry.remark || data?.html_message || (ok ? 'Done' : 'Action failed'),
        raw: data,
    };
};

module.exports = { buildBoard, takeAction, bucketFor };
