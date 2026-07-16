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
// orders     = synced, NO courier assigned yet (no AWB)
// ready      = courier/AWB assigned, not manifested yet (no scans)
// manifested = manifest generated / awaiting pickup
const STATUS_BUCKET = [
    [/^delivered$/i, 'delivered'],
    [/^rto/i, 'rto'],
    [/^(undelivered|damaged)$/i, 'ndr'],
    [/^(manifested|not picked|pending pickup|pickup scheduled)$/i, 'manifested'],
    [/^(picked ?up|in transit|reached at destination|out for delivery|out of delivery area|delayed|misrouted)$/i, 'transit'],
    [/^cancelled$/i, 'cancelled'],
];

const bucketFor = (status) => {
    const s = String(status || '').trim();
    if (!s) return 'ready'; // AWB exists but no scans yet — courier assigned, pre-manifest
    for (const [re, bucket] of STATUS_BUCKET) if (re.test(s)) return bucket;
    return 'transit'; // unknown intermediate statuses default to transit
};

// ── Fixed wide fetch window ──
// The board always loads this many days of orders so buckets are ACCURATE:
// an order placed 3 weeks ago and delivered yesterday must appear in
// "delivered last 7 days". Date filtering happens client-side on the
// bucket-relevant date (delivery date, NDR date, order date...).
const WINDOW_DAYS = Math.min(parseInt(process.env.NDR_WINDOW_DAYS || '30', 10) || 30, 90);

// Journeys that can never change again — their tracking is cached forever.
const TERMINAL_STATUS = /^(delivered|rto delivered|cancelled)$/i;

// ── Caches (module-level; survive warm serverless instances, persisted to /tmp) ──
let boardCache = { ts: 0, board: null };
let storeDetailsCache = {};   // shopifyOrderId -> details (address/products don't change)
let trackingCache = {};       // awb -> { ts, terminal, data }
const BOARD_TTL_MS = 5 * 60 * 1000;
const TRACK_TTL_MS = 5 * 60 * 1000;

const fs = require('fs');
const CACHE_FILE = '/tmp/ndr_cache.json';
try {
    const disk = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    storeDetailsCache = disk.storeDetailsCache || {};
    trackingCache = disk.trackingCache || {};
    console.log(`[NDR] warm cache loaded: ${Object.keys(storeDetailsCache).length} orders, ${Object.keys(trackingCache).length} trackings`);
} catch { /* cold start */ }

let lastSave = 0;
const persistCaches = () => {
    if (Date.now() - lastSave < 30000) return;
    lastSave = Date.now();
    try { fs.writeFileSync(CACHE_FILE, JSON.stringify({ storeDetailsCache, trackingCache })); } catch { /* read-only fs */ }
};

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
 * Build the full board. Always loads WINDOW_DAYS of synced store orders so
 * buckets are accurate regardless of the UI's date filter; the `days`
 * argument only extends the window when a wider custom range is requested.
 */
const buildBoard = async (days = WINDOW_DAYS, refresh = false) => {
    const windowDays = Math.min(Math.max(days || WINDOW_DAYS, WINDOW_DAYS), 90);
    if (!refresh && boardCache.board && boardCache.board.days >= windowDays && Date.now() - boardCache.ts < BOARD_TTL_MS) {
        return { ...boardCache.board, cached: true };
    }

    // IST "today" so date windows match Indian business days
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const start = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

    // 1. Synced store order ids (Shopify platform = 2)
    const listRes = await ithink.storeOrderList(fmtDate(start), fmtDate(now));
    const orderIds = listRes.orderIds || [];

    // 2. Store order details — cached per id, but re-fetch orders that have no
    //    AWB yet (the AWB gets backfilled onto the store order once shipped).
    const missing = orderIds.filter(id => !storeDetailsCache[id] || !storeDetailsCache[id].awb_no);
    await mapLimit(chunk(missing, 10), 6, async (ids) => {
        const map = await ithink.getStoreOrderDetails(ids);
        Object.entries(map).forEach(([id, det]) => { storeDetailsCache[id] = det; });
    });

    const details = orderIds.map(id => ({ shopifyId: id, ...(storeDetailsCache[id] || {}) }))
        .filter(d => d.order_number || d.order_id);

    // 3. Tracking — terminal journeys (Delivered / RTO Delivered / Cancelled)
    //    never change, so they're served from cache forever; live journeys
    //    re-fetch after TRACK_TTL (or immediately on refresh).
    const awbs = [...new Set(details.map(d => d.awb_no).filter(Boolean))];
    const trackMap = {};
    const needFetch = [];
    for (const awb of awbs) {
        const c = trackingCache[awb];
        if (c && (c.terminal || (!refresh && Date.now() - c.ts < TRACK_TTL_MS))) {
            trackMap[awb] = c.data;
        } else {
            needFetch.push(awb);
        }
    }
    await mapLimit(chunk(needFetch, 10), 6, async (batch) => {
        const r = await ithink.trackOrder(batch);
        if (r.success && r.data) {
            Object.entries(r.data).forEach(([awb, t]) => {
                trackMap[awb] = t;
                trackingCache[awb] = { ts: Date.now(), terminal: TERMINAL_STATUS.test(String(t?.current_status || '')), data: t };
            });
        }
    });
    persistCaches();

    // 4. Merge + bucket
    const orders = details.map(d => {
        const awb = d.awb_no || '';
        const t = awb ? (trackMap[awb] || null) : null;
        const status = t?.current_status || '';
        const bucket = awb ? bucketFor(status) : 'orders';
        const last = t?.last_scan_details || {};
        // Scan history: when did RTO start / when was the (last) NDR attempt
        const scans = Array.isArray(t?.scan_details) ? t.scan_details : [];
        const rtoInitiatedAt = scans.filter(s => /^rto/i.test(String(s?.status || '')))
            .map(s => s.status_date_time).filter(Boolean).sort()[0] || '';
        const ndrAt = scans.filter(s => /^undelivered$/i.test(String(s?.status || '')))
            .map(s => s.status_date_time).filter(Boolean).sort().pop() || '';
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
            ndrDate: ndrAt || (bucket === 'ndr' ? last.status_date_time || '' : ''),
            rtoInitiatedAt: rtoInitiatedAt || (bucket === 'rto' ? last.status_date_time || '' : ''),
            attemptCount: parseInt(t?.ofd_count, 10) || 0,
            edd: [t?.expected_delivery_date, t?.promise_delivery_date].find(v => v && !v.startsWith('0000')) || '',
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

    const counts = { total: orders.length, orders: 0, ready: 0, manifested: 0, transit: 0, delivered: 0, ndr: 0, rto: 0, cancelled: 0 };
    orders.forEach(o => { if (counts[o.bucket] !== undefined) counts[o.bucket]++; });

    const board = {
        success: true,
        generatedAt: new Date().toISOString(),
        days: windowDays,
        counts,
        orders,
    };
    boardCache = { ts: Date.now(), board };
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
