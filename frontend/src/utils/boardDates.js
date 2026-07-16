/**
 * Date logic for the NDR shipment board — extracted so it can be unit-tested
 * directly (tests/boardDates.test.mjs runs this exact module).
 *
 * All calendar comparisons are in IST (Asia/Kolkata) to match Indian
 * business days and iThink's own panel.
 */

/**
 * Robust parser for iThink's date strings.
 * iThink returns "YYYY-MM-DD HH:MM:SS" — the space form is NON-standard and
 * Safari/iOS returns Invalid Date for it. Normalize to "YYYY-MM-DDTHH:MM:SS".
 * Invalid/empty input → epoch (sorts to the bottom, never crashes).
 */
export const parseDate = (v) => {
  if (v instanceof Date) return isNaN(v.getTime()) ? new Date(0) : v;
  const s = String(v || '').trim();
  if (!s || s.startsWith('0000')) return new Date(0);
  const normalized = /^\d{4}-\d{2}-\d{2} \d/.test(s) ? s.replace(' ', 'T') : s;
  const dt = new Date(normalized);
  return isNaN(dt.getTime()) ? new Date(0) : dt;
};

/**
 * The date each bucket is judged and sorted by — the date that MEANS something
 * for that bucket, not just the latest courier scan:
 *   orders / ready → order date (nothing has moved yet)
 *   ndr            → NDR date (the failed-attempt scan)
 *   rto            → RTO-INITIATED date (an RTO started 8 Jul that is still
 *                    moving today must NOT appear under "Today")
 *   delivered      → delivery scan time
 *   manifested / transit → last status scan time
 */
export const relevantDate = (o) => {
  switch (o.bucket) {
    case 'orders':
    case 'ready':
      return parseDate(o.orderDate);
    case 'ndr':
      return parseDate(o.ndrDate || o.statusDateTime || o.orderDate);
    case 'rto':
      return parseDate(o.rtoInitiatedAt || o.statusDateTime || o.orderDate);
    case 'delivered':
      return parseDate(o.deliveredAt || o.statusDateTime || o.orderDate);
    default: // manifested, transit, unknown
      return parseDate(o.statusDateTime || o.orderDate);
  }
};

export const istNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

export const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

/**
 * filter: 'today' | 'yesterday' | '7d' | '30d' | 'custom' | anything-else (= all)
 * '7d'/'30d' are CALENDAR windows: today plus the previous 6/29 days —
 * matching how "last N days" reads on courier panels (not a rolling 168h).
 * 'custom': [start] = that single day; [start, end] = inclusive window.
 * Epoch dates (unparseable) never match any window except 'all'.
 * `now` injectable for tests.
 */
export const inDateFilter = (o, filter, customRange, now = istNow()) => {
  const d = relevantDate(o);
  if (filter === 'custom') {
    const [start, end] = customRange || [];
    if (!start) return true;
    return d >= startOfDay(start) && d <= endOfDay(end || start);
  }
  if (filter === 'today') return sameDay(d, now);
  if (filter === 'yesterday') return sameDay(d, new Date(now.getTime() - 864e5));
  if (filter === '7d') return d >= startOfDay(new Date(now.getTime() - 6 * 864e5)) && d <= endOfDay(now);
  if (filter === '30d') return d >= startOfDay(new Date(now.getTime() - 29 * 864e5)) && d <= endOfDay(now);
  return true;
};

export const sortByDate = (list, desc = true) =>
  [...list].sort((a, b) => desc ? relevantDate(b) - relevantDate(a) : relevantDate(a) - relevantDate(b));
