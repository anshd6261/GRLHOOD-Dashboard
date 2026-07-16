/**
 * Date filter/sort tests for the NDR board.
 * Runs the EXACT module the UI uses (frontend/src/utils/boardDates.js).
 * Run with: TZ=Asia/Kolkata node tests/boardDates.test.mjs
 */
import { relevantDate, inDateFilter, sortByDate, sameDay, parseDate } from '../frontend/src/utils/boardDates.js';

let pass = 0, fail = 0;
const t = (name, cond) => {
  if (cond) { pass++; }
  else { fail++; console.log(`  ✗ FAIL: ${name}`); }
};

// Fixed "now": 15 July 2026, 14:30 IST (tests run with TZ=Asia/Kolkata)
const NOW = new Date('2026-07-15T14:30:00');

const mk = (bucket, orderDate, statusDateTime = '') => ({ bucket, orderDate, statusDateTime });

/* ── 1. relevantDate: which date each bucket is judged by ── */
t('orders → orderDate', relevantDate(mk('orders', '2026-07-10', '2026-07-14 12:00:00')).getDate() === 10);
t('ready → orderDate', relevantDate(mk('ready', '2026-07-10', '2026-07-14 12:00:00')).getDate() === 10);
t('manifested → statusDateTime', relevantDate(mk('manifested', '2026-07-10', '2026-07-14 12:00:00')).getDate() === 14);
t('transit → statusDateTime', relevantDate(mk('transit', '2026-07-10', '2026-07-13 09:00:00')).getDate() === 13);
t('delivered → statusDateTime (delivery date)', relevantDate(mk('delivered', '2026-06-20', '2026-07-14 18:45:00')).getDate() === 14);
t('ndr → statusDateTime (attempt date)', relevantDate(mk('ndr', '2026-07-01', '2026-07-15 11:00:00')).getDate() === 15);
t('rto → statusDateTime', relevantDate(mk('rto', '2026-07-01', '2026-07-12 10:00:00')).getDate() === 12);
t('delivered w/o scan falls back to orderDate', relevantDate(mk('delivered', '2026-07-08', '')).getDate() === 8);
t('invalid date → epoch (never crashes)', relevantDate(mk('transit', 'garbage', 'also-garbage')).getTime() === 0);

/* ── 2. today ── */
t('today: same-day scan matches', inDateFilter(mk('delivered', '2026-06-01', '2026-07-15 09:00:00'), 'today', null, NOW));
t('today: 00:00 boundary matches', inDateFilter(mk('delivered', '2026-06-01', '2026-07-15 00:00:00'), 'today', null, NOW));
t('today: 23:59 matches', inDateFilter(mk('delivered', '2026-06-01', '2026-07-15 23:59:59'), 'today', null, NOW));
t('today: yesterday 23:59 does NOT match', !inDateFilter(mk('delivered', '2026-06-01', '2026-07-14 23:59:59'), 'today', null, NOW));
t('today: judges delivered by DELIVERY date not order date', inDateFilter(mk('delivered', '2026-06-20', '2026-07-15 10:00:00'), 'today', null, NOW));
t('today: old order still in orders bucket does NOT match', !inDateFilter(mk('orders', '2026-07-10', ''), 'today', null, NOW));
t('today: order placed today (date-only string) matches', inDateFilter(mk('orders', '2026-07-15', ''), 'today', null, NOW));

/* ── 3. yesterday ── */
t('yesterday: 14 Jul matches', inDateFilter(mk('ndr', '2026-07-01', '2026-07-14 16:20:00'), 'yesterday', null, NOW));
t('yesterday: today does NOT match', !inDateFilter(mk('ndr', '2026-07-01', '2026-07-15 01:00:00'), 'yesterday', null, NOW));
t('yesterday: 2 days ago does NOT match', !inDateFilter(mk('ndr', '2026-07-01', '2026-07-13 16:20:00'), 'yesterday', null, NOW));

/* ── 4. 7 days (calendar: 9–15 Jul inclusive) ── */
t('7d: today matches', inDateFilter(mk('transit', '2026-07-01', '2026-07-15 12:00:00'), '7d', null, NOW));
t('7d: exactly 6 days ago 00:00 matches (9 Jul)', inDateFilter(mk('transit', '2026-07-01', '2026-07-09 00:00:00'), '7d', null, NOW));
t('7d: 7 days ago (8 Jul) does NOT match', !inDateFilter(mk('transit', '2026-07-01', '2026-07-08 23:59:00'), '7d', null, NOW));
t('7d: 8 Jul 23:59 excluded even late in day', !inDateFilter(mk('delivered', '2026-07-01', '2026-07-08 23:59:59'), '7d', null, NOW));
t('7d: order-bucket judged by order date (12 Jul in)', inDateFilter(mk('orders', '2026-07-12', ''), '7d', null, NOW));
t('7d: order-bucket 1 Jul out', !inDateFilter(mk('orders', '2026-07-01', ''), '7d', null, NOW));

/* ── 5. 30 days (calendar: 16 Jun – 15 Jul inclusive) ── */
t('30d: 16 Jun 00:00 matches', inDateFilter(mk('rto', '2026-06-01', '2026-06-16 00:00:00'), '30d', null, NOW));
t('30d: 15 Jun does NOT match', !inDateFilter(mk('rto', '2026-06-01', '2026-06-15 23:59:59'), '30d', null, NOW));
t('30d: today matches', inDateFilter(mk('rto', '2026-06-01', '2026-07-15 08:00:00'), '30d', null, NOW));

/* ── 6. custom: single date ── */
const single = [new Date('2026-07-12T00:00:00'), null];
t('custom single: that day 00:01 matches', inDateFilter(mk('delivered', '2026-06-01', '2026-07-12 00:01:00'), 'custom', single, NOW));
t('custom single: that day 23:58 matches', inDateFilter(mk('delivered', '2026-06-01', '2026-07-12 23:58:00'), 'custom', single, NOW));
t('custom single: day before does NOT match', !inDateFilter(mk('delivered', '2026-06-01', '2026-07-11 23:59:00'), 'custom', single, NOW));
t('custom single: day after does NOT match', !inDateFilter(mk('delivered', '2026-06-01', '2026-07-13 00:01:00'), 'custom', single, NOW));

/* ── 7. custom: range (10–13 Jul, picker gives midday Date objects) ── */
const range = [new Date('2026-07-10T11:30:00'), new Date('2026-07-13T09:15:00')];
t('custom range: start day 00:05 matches (start-of-day inclusive)', inDateFilter(mk('ndr', '2026-06-01', '2026-07-10 00:05:00'), 'custom', range, NOW));
t('custom range: end day 23:50 matches (end-of-day inclusive)', inDateFilter(mk('ndr', '2026-06-01', '2026-07-13 23:50:00'), 'custom', range, NOW));
t('custom range: middle day matches', inDateFilter(mk('ndr', '2026-06-01', '2026-07-11 15:00:00'), 'custom', range, NOW));
t('custom range: 9 Jul out', !inDateFilter(mk('ndr', '2026-06-01', '2026-07-09 23:59:00'), 'custom', range, NOW));
t('custom range: 14 Jul out', !inDateFilter(mk('ndr', '2026-06-01', '2026-07-14 00:10:00'), 'custom', range, NOW));
t('custom: no start selected = show all', inDateFilter(mk('ndr', '2026-06-01', '2026-05-01 10:00:00'), 'custom', [null, null], NOW));

/* ── 8. windows nest correctly (today ⊆ 7d ⊆ 30d) ── */
const probes = [];
for (let day = 1; day <= 15; day++) probes.push(mk('delivered', '2026-06-01', `2026-07-${String(day).padStart(2, '0')} 12:00:00`));
for (const p of probes) {
  if (inDateFilter(p, 'today', null, NOW)) t(`nesting: today→7d (${p.statusDateTime})`, inDateFilter(p, '7d', null, NOW));
  if (inDateFilter(p, '7d', null, NOW)) t(`nesting: 7d→30d (${p.statusDateTime})`, inDateFilter(p, '30d', null, NOW));
  t(`exclusive: today/yesterday disjoint (${p.statusDateTime})`,
    !(inDateFilter(p, 'today', null, NOW) && inDateFilter(p, 'yesterday', null, NOW)));
}

/* ── 9. sorting ── */
const unsorted = [
  mk('delivered', '2026-06-01', '2026-07-10 10:00:00'),
  mk('orders', '2026-07-14', ''),
  mk('ndr', '2026-06-01', '2026-07-15 09:00:00'),
  mk('transit', '2026-06-01', '2026-07-12 18:00:00'),
  mk('rto', '2026-06-01', 'garbage'), // invalid → epoch, must sink to the end when newest-first
];
const desc = sortByDate(unsorted, true);
t('sort desc: newest first (15 Jul ndr)', desc[0].bucket === 'ndr');
t('sort desc: then 14 Jul order', desc[1].bucket === 'orders');
t('sort desc: then 12 Jul transit', desc[2].bucket === 'transit');
t('sort desc: then 10 Jul delivered', desc[3].bucket === 'delivered');
t('sort desc: invalid date last', desc[4].bucket === 'rto');
const asc = sortByDate(unsorted, false);
t('sort asc: invalid date first', asc[0].bucket === 'rto');
t('sort asc: oldest valid next (10 Jul)', asc[1].bucket === 'delivered');
t('sort asc: newest last', asc[4].bucket === 'ndr');
t('sort: original array untouched', unsorted[0].bucket === 'delivered');

/* ── 10. THE REPORTED BUG: RTO initiated 8 Jul, still moving (last scan today)
        must NOT appear under "Today" — judged by RTO-initiated date ── */
const movingRto = { bucket: 'rto', orderDate: '2026-07-05', statusDateTime: '2026-07-15 11:00:00', rtoInitiatedAt: '2026-07-08 14:00:00' };
t('BUG: moving RTO judged by initiated date (8 Jul)', relevantDate(movingRto).getDate() === 8);
t('BUG: moving RTO NOT in Today', !inDateFilter(movingRto, 'today', null, NOW));
t('BUG: moving RTO NOT in yesterday', !inDateFilter(movingRto, 'yesterday', null, NOW));
t('BUG: moving RTO IS in its own single-date filter (8 Jul)', inDateFilter(movingRto, 'custom', [new Date('2026-07-08T12:00:00'), null], NOW));
t('BUG: moving RTO IS in 30d', inDateFilter(movingRto, '30d', null, NOW));
t('RTO without scan history falls back to last scan', relevantDate({ bucket: 'rto', orderDate: '2026-07-05', statusDateTime: '2026-07-12 10:00:00' }).getDate() === 12);

/* NDR judged by the failed-attempt scan, not any later scan */
const ndrLaterScan = { bucket: 'ndr', orderDate: '2026-07-01', statusDateTime: '2026-07-15 09:00:00', ndrDate: '2026-07-13 17:30:00' };
t('NDR judged by NDR date (13 Jul), not last scan', relevantDate(ndrLaterScan).getDate() === 13);
t('NDR with later scan NOT in Today', !inDateFilter(ndrLaterScan, 'today', null, NOW));

/* Delivered judged by the delivery scan */
const delv = { bucket: 'delivered', orderDate: '2026-06-20', statusDateTime: '2026-07-14 20:00:00', deliveredAt: '2026-07-14 19:45:00' };
t('delivered judged by deliveredAt', relevantDate(delv).getHours() === 19);

/* ── 11. Safari/iOS parsing: iThink's "YYYY-MM-DD HH:MM:SS" space format ── */
t('parseDate handles space format', parseDate('2026-07-14 12:54:00').getDate() === 14 && parseDate('2026-07-14 12:54:00').getHours() === 12);
t('parseDate handles ISO T format', parseDate('2026-07-14T12:54:00').getDate() === 14);
t('parseDate handles date-only', parseDate('2026-07-14').getTime() > 0);
t('parseDate: 0000-00-00 → epoch', parseDate('0000-00-00').getTime() === 0);
t('parseDate: empty → epoch', parseDate('').getTime() === 0);
t('parseDate: garbage → epoch', parseDate('not-a-date').getTime() === 0);
t('parseDate: Date object passthrough', parseDate(new Date('2026-07-14T10:00:00')).getDate() === 14);
t('epoch dates excluded from every window', !inDateFilter({ bucket: 'transit', orderDate: 'garbage', statusDateTime: '' }, '30d', null, NOW));

/* ── 12. cross-midnight IST sanity: "today" at 00:10 IST ── */
const MIDNIGHT = new Date('2026-07-15T00:10:00');
t('midnight: scan at 00:05 today matches today', inDateFilter(mk('delivered', '2026-06-01', '2026-07-15 00:05:00'), 'today', null, MIDNIGHT));
t('midnight: scan 23:55 yesterday is yesterday not today', !inDateFilter(mk('delivered', '2026-06-01', '2026-07-14 23:55:00'), 'today', null, MIDNIGHT) && inDateFilter(mk('delivered', '2026-06-01', '2026-07-14 23:55:00'), 'yesterday', null, MIDNIGHT));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
