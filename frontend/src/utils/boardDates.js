/**
 * Date logic for the NDR shipment board — extracted so it can be unit-tested
 * directly (tests/boardDates.test.mjs runs this exact module).
 *
 * All calendar comparisons are in IST (Asia/Kolkata) to match Indian
 * business days and iThink's own panel.
 */

// The date each bucket is judged/sorted by:
//   orders / ready        → order date (nothing has moved yet)
//   manifested / transit / delivered / ndr / rto → last status scan time
export const relevantDate = (o) => {
  const d = (o.bucket === 'orders' || o.bucket === 'ready') ? o.orderDate : (o.statusDateTime || o.orderDate);
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? new Date(0) : dt;
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
