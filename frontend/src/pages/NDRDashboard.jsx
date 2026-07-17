import React, { useState, useEffect, useMemo, useCallback, useDeferredValue } from 'react';
import axios from 'axios';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package, RefreshCw, Truck, CheckCircle, AlertTriangle, RotateCcw,
  Phone, MessageSquare, MapPin, Calendar, Copy, ExternalLink, Search,
  Send, X, Settings, Clock, LayoutDashboard, Zap, TrendingDown,
  ChevronDown, ArrowDownUp
} from 'lucide-react';
import { relevantDate, istNow, inDateFilter, sortByDate, parseDate } from '../utils/boardDates';

const API_BASE = import.meta.env.VITE_API_URL || '';
const API_URL = API_BASE ? `${API_BASE}/api` : '/api';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'orders', label: 'Orders' },
  { id: 'ready', label: 'Ready' },
  { id: 'manifested', label: 'Manifested' },
  { id: 'transit', label: 'In Transit' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'ndr', label: 'NDR' },
  { id: 'rto', label: 'RTO' },
  { id: 'action', label: 'Action' },
];

const DATE_FILTERS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: '7 Days' },
  { id: '30d', label: '30 Days' },
];

const PAGE_SIZE = 24;

const fmtDT = (v) => {
  if (!v) return '—';
  const d = parseDate(v);
  if (d.getTime() === 0) return String(v);
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const fmtD = (v) => {
  if (!v) return '—';
  const d = parseDate(v);
  if (d.getTime() === 0) return String(v);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

const buildWaReport = (o) => (
`*NDR UPDATE — GRLHOOD*

Order: ${o.orderNumber}
AWB: ${o.awb} (${o.courier || 'courier n/a'})
Status: ${o.status}${o.attemptCount ? ` (Attempt ${o.attemptCount})` : ''}
Reason: ${o.ndrReason || o.ndrRemark || 'Not specified'}
Last scan: ${fmtDT(o.statusDateTime)}${o.scanLocation ? ` — ${o.scanLocation}` : ''}

Customer: ${o.customer?.name}
Phone: +91${o.customer?.phone}
Address: ${o.customer?.address}, ${o.customer?.city}, ${o.customer?.state} ${o.customer?.pincode}

Items: ${(o.products || []).map(p => `${p.name} x${p.qty}`).join(', ')}
Amount: Rs${o.totalAmount} (${o.paymentMode})

Please verify with the customer — this may be a FAKE delivery attempt. Goal: get it DELIVERED.`
);

const loadActions = () => { try { return JSON.parse(localStorage.getItem('ndr_actions') || '{}'); } catch { return {}; } };

const STATUS_LABEL = { orders: 'Not Shipped', ready: 'AWB Assigned' };

const cardVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: (i) => ({ opacity: 1, y: 0, transition: { duration: 0.34, delay: Math.min(i, 10) * 0.04, ease: [0.25, 0.46, 0.45, 0.94] } }),
  exit: { opacity: 0, y: 12, transition: { duration: 0.16 } },
};

/* ═══════════════ Board Card — light, block-planned, expandable ═══════════════ */
const BoardCard = React.memo(function BoardCard({ o, i, actionEntry, onAction, onWaReport, onToast }) {
  const isNdr = o.bucket === 'ndr';
  const isRto = o.bucket === 'rto';
  // NDR person needs customer contact instantly — open by default on NDR cards
  const [open, setOpen] = useState(isNdr);
  const [showForm, setShowForm] = useState(false);
  const [date, setDate] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  const copy = (text, label = 'Copied') => {
    navigator.clipboard.writeText(text).then(() => onToast({ msg: label })).catch(() => {});
  };

  const submitReattempt = async () => {
    setBusy(true);
    const ok = await onAction(o, 'reattempt', { date: date || undefined, phone: phone || undefined });
    setBusy(false);
    if (ok) setShowForm(false);
  };

  const statusText = o.status || STATUS_LABEL[o.bucket] || '—';
  const eventChip =
    isNdr && o.ndrDate ? { label: 'NDR', value: fmtDT(o.ndrDate), pink: true } :
    isRto && o.rtoInitiatedAt ? { label: 'RTO Initiated', value: fmtDT(o.rtoInitiatedAt), pink: true } :
    o.bucket === 'delivered' ? { label: 'Delivered', value: fmtDT(o.deliveredAt || o.statusDateTime), pink: true } :
    (o.bucket === 'manifested' || o.bucket === 'transit') && o.statusDateTime ? { label: 'Last Scan', value: fmtDT(o.statusDateTime), pink: false } :
    null;

  return (
    <motion.article layout="position" custom={i} variants={cardVariants} initial="hidden" animate="visible" exit="exit" className="np-card">
      <div className="p-6 sm:p-7 space-y-5">

        {/* ── BLOCK 1 · identity — the three big things: order, status, amount ── */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-[17px] font-extrabold tracking-tight leading-none" style={{ color: 'var(--np-text)' }}>{o.orderNumber}</h3>
            <p className="text-[12px] mt-1.5 font-normal truncate" style={{ color: 'var(--np-text-2)' }}>
              {o.customer?.name || 'Customer'}{o.courier ? ` · ${o.courier}` : ''}
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className={`text-[12px] font-extrabold uppercase tracking-[0.08em] leading-none ${isNdr ? '' : ''}`}
              style={{ color: isNdr || isRto ? 'var(--np-pink-deep)' : 'var(--np-text)' }}>
              {statusText}
            </div>
            <div className="text-[15px] font-bold mt-1.5 tabular-nums" style={{ color: 'var(--np-text)' }}>
              ₹{o.totalAmount}
              <span className="text-[10px] font-semibold ml-1" style={{ color: 'var(--np-text-2)' }}>{o.paymentMode}</span>
            </div>
          </div>
        </div>

        {/* ── BLOCK 2 · dates, together (order → event → EDD) ── */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="np-chip"><span className="l">Ordered</span><span className="v">{fmtD(o.orderDate)}</span></span>
          {eventChip && (
            <span className={eventChip.pink ? 'np-chip np-chip-pink' : 'np-chip'}>
              <span className="l">{eventChip.label}</span><span className="v">{eventChip.value}</span>
            </span>
          )}
          {o.edd && o.bucket !== 'delivered' && o.bucket !== 'rto' && (
            <span className="np-chip"><span className="l">EDD</span><span className="v">{fmtD(o.edd)}</span></span>
          )}
          {o.attemptCount > 0 && (isNdr || o.bucket === 'delivered') && (
            <span className="np-chip"><span className="l">Attempts</span><span className="v">{o.attemptCount}</span></span>
          )}
        </div>

        {/* ── BLOCK 3 · NDR / RTO reason ── */}
        {isNdr && (
          <div className="rounded-2xl px-4 py-3.5" style={{ background: 'var(--np-pink)', border: '1px solid var(--np-pink-line)' }}>
            <div className="flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--np-pink-deep)' }} />
              <div className="min-w-0">
                <p className="text-[13px] font-bold leading-snug" style={{ color: '#8f2f5e' }}>
                  {o.ndrReason || o.ndrRemark || 'Delivery failed — reason not given'}
                </p>
                {o.ndrReason && o.ndrRemark && o.ndrRemark !== o.ndrReason && (
                  <p className="text-[11px] mt-1 font-normal" style={{ color: 'rgba(143,47,94,0.75)' }}>{o.ndrRemark}</p>
                )}
                {o.scanLocation && (
                  <p className="text-[10px] mt-1.5 font-normal flex items-center gap-1" style={{ color: 'rgba(143,47,94,0.6)' }}>
                    <MapPin size={9} /> {o.scanLocation}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
        {isRto && (o.ndrReason || o.ndrRemark) && (
          <div className="rounded-2xl px-4 py-3 flex items-center gap-2" style={{ background: '#f6f6f8', border: '1px solid var(--np-line)' }}>
            <RotateCcw size={12} style={{ color: 'var(--np-text-2)' }} />
            <p className="text-[12px] font-medium" style={{ color: 'var(--np-text-2)' }}>{o.ndrReason || o.ndrRemark}</p>
          </div>
        )}

        {/* ── BLOCK 4 · expandable detail (customer · items · awb) ── */}
        <div className="rounded-2xl" style={{ border: '1px solid var(--np-line)' }}>
          <button onClick={() => setOpen(!open)}
            className="w-full flex items-center justify-between px-4 py-3 cursor-pointer bg-transparent border-none">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--np-text-2)' }}>
              {open ? 'Details' : `${o.products?.length || 0} item${(o.products?.length || 0) !== 1 ? 's' : ''} · ${o.customer?.city || '—'}${o.awb ? ' · AWB' : ''}`}
            </span>
            <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.22 }}>
              <ChevronDown size={14} style={{ color: 'var(--np-text-3)' }} />
            </motion.span>
          </button>

          <AnimatePresence initial={false}>
            {open && (
              <motion.div key="detail" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.26, ease: [0.25, 0.46, 0.45, 0.94] }} className="overflow-hidden">
                <div className="px-4 pb-4 space-y-4" style={{ borderTop: '1px solid var(--np-line)' }}>

                  {/* customer */}
                  <div className="pt-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-[0.12em] mb-1.5" style={{ color: 'var(--np-text-3)' }}>Customer</p>
                      <p className="text-[13px] font-bold" style={{ color: 'var(--np-text)' }}>{o.customer?.name}</p>
                      <p className="text-[12px] mt-1 leading-relaxed font-normal" style={{ color: 'var(--np-text-2)' }}>
                        {o.customer?.address}<br />
                        {o.customer?.city}, {o.customer?.state} — <span className="tabular-nums font-medium" style={{ color: 'var(--np-text)' }}>{o.customer?.pincode}</span>
                      </p>
                      {o.customer?.phone && (
                        <button onClick={() => copy(o.customer.phone, 'Phone copied')}
                          className="mt-1.5 text-[12px] font-semibold tabular-nums flex items-center gap-1.5 bg-transparent border-none cursor-pointer p-0"
                          style={{ color: 'var(--np-pink-deep)' }}>
                          +91 {o.customer.phone} <Copy size={10} className="opacity-60" />
                        </button>
                      )}
                    </div>
                    {o.customer?.phone && (
                      <div className="flex gap-2 shrink-0">
                        <a href={`tel:+91${o.customer.phone}`} className="np-btn !p-3" title="Call"><Phone size={14} /></a>
                        <a href={`https://wa.me/91${o.customer.phone}?text=${encodeURIComponent(`Hi ${o.customer?.name}, this is GRLHOOD! Regarding your order ${o.orderNumber} — the courier (${o.courier}) marked a delivery attempt${o.ndrReason ? ` ("${o.ndrReason}")` : ''}. Were you contacted for delivery? We want to get this to you ASAP!`)}`}
                          target="_blank" rel="noopener noreferrer" className="np-btn !p-3" title="WhatsApp"><MessageSquare size={14} /></a>
                      </div>
                    )}
                  </div>

                  {/* items */}
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.12em] mb-2" style={{ color: 'var(--np-text-3)' }}>Items</p>
                    <div className="space-y-1.5">
                      {(o.products || []).map((p, pi) => (
                        <div key={pi} className="flex items-center justify-between gap-3">
                          <span className="text-[12px] font-normal truncate" style={{ color: 'var(--np-text)' }}>{p.name}{p.qty > 1 ? ` ×${p.qty}` : ''}</span>
                          <span className="text-[12px] font-medium tabular-nums shrink-0" style={{ color: 'var(--np-text-2)' }}>₹{p.price}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* awb */}
                  {o.awb && (
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-[0.12em] mb-1" style={{ color: 'var(--np-text-3)' }}>AWB</p>
                        <button onClick={() => copy(o.awb, 'AWB copied')}
                          className="text-[12px] font-semibold tabular-nums flex items-center gap-1.5 bg-transparent border-none cursor-pointer p-0"
                          style={{ color: 'var(--np-text)' }}>
                          {o.awb} <Copy size={10} style={{ color: 'var(--np-text-3)' }} />
                        </button>
                      </div>
                      {o.trackingUrl && (
                        <a href={o.trackingUrl} target="_blank" rel="noopener noreferrer" className="np-btn !py-2 !px-4 text-[11px]">
                          Track <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── BLOCK 5 · actions (NDR only) ── */}
        {isNdr && o.awb && (
          <div className="space-y-3">
            {actionEntry && (
              <p className="text-[11px] font-semibold flex items-center gap-1.5" style={{ color: 'var(--np-pink-deep)' }}>
                <CheckCircle size={12} /> Re-attempt requested {fmtD(actionEntry.ts)}
              </p>
            )}
            <div className="flex gap-2.5 flex-wrap">
              <button onClick={() => { setShowForm(!showForm); setDate(''); setPhone(''); }} className="np-btn np-btn-accent flex-1 min-w-[150px]">
                <Truck size={13} /> Re-Attempt Delivery
              </button>
              <button onClick={() => onWaReport(o)} className="np-btn">
                <Send size={13} /> Report
              </button>
            </div>
            <AnimatePresence>
              {showForm && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22 }} className="overflow-hidden">
                  <div className="rounded-2xl p-4 space-y-3" style={{ background: '#f6f6f8', border: '1px solid var(--np-line)' }}>
                    <p className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--np-text-2)' }}>Schedule re-attempt</p>
                    <div className="flex gap-2 flex-wrap items-center">
                      <input type="date" value={date} onChange={e => setDate(e.target.value)}
                        min={new Date(Date.now() + 864e5).toISOString().slice(0, 10)}
                        className="np-input !py-2 !px-3.5 text-[12px]" />
                      <input type="tel" placeholder="New phone (optional)" value={phone} onChange={e => setPhone(e.target.value)}
                        className="np-input !py-2 !px-3.5 text-[12px] w-40" />
                      <button onClick={submitReattempt} disabled={busy} className="np-btn np-btn-accent !py-2.5">
                        {busy ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle size={12} />} Confirm
                      </button>
                      <button onClick={() => setShowForm(false)} className="np-btn !p-2.5"><X size={12} /></button>
                    </div>
                    <p className="text-[10px] font-normal" style={{ color: 'var(--np-text-2)' }}>Defaults to tomorrow. Phone updates the courier's contact for the attempt.</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* footers per bucket */}
        {(o.bucket === 'ready' || o.bucket === 'manifested') && (() => {
          const age = (istNow() - relevantDate(o)) / 864e5;
          return age > 2 ? (
            <p className="text-[11px] font-semibold flex items-center gap-1.5" style={{ color: 'var(--np-pink-deep)' }}>
              <AlertTriangle size={12} /> {o.bucket === 'manifested' ? 'Not picked up' : 'Not manifested'} for {Math.floor(age)} days — chase the courier
            </p>
          ) : null;
        })()}
      </div>
    </motion.article>
  );
});

/* ═══════════════ Overview ═══════════════ */
function Overview({ orders, onJump }) {
  const now = istNow();
  const stats = useMemo(() => {
    const shipped = orders.filter(o => o.awb);
    const by = (b) => orders.filter(o => o.bucket === b);
    const ndr = by('ndr'), rto = by('rto'), delivered = by('delivered'), transit = by('transit'), ready = by('ready'), manifested = by('manifested');
    const closed = delivered.length + rto.length;
    const newNdr48 = ndr.filter(o => o.ndrDate && (now - parseDate(o.ndrDate)) <= 48 * 3600e3 && parseDate(o.ndrDate).getTime() > 0);
    const newRto48 = rto.filter(o => o.rtoInitiatedAt && (now - parseDate(o.rtoInitiatedAt)) <= 48 * 3600e3 && parseDate(o.rtoInitiatedAt).getTime() > 0);
    const codAtRisk = ndr.reduce((s, o) => s + (o.isCod ? o.totalAmount : 0), 0) + rto.reduce((s, o) => s + (o.isCod ? o.totalAmount : 0), 0);
    const couriers = {};
    shipped.forEach(o => {
      const c = o.courier || 'Unassigned';
      if (!couriers[c]) couriers[c] = { name: c, shipped: 0, transit: 0, delivered: 0, ndr: 0, rto: 0, ready: 0, manifested: 0 };
      couriers[c].shipped++;
      if (couriers[c][o.bucket] !== undefined) couriers[c][o.bucket]++;
    });
    const reasons = {};
    ndr.forEach(o => { const r = (o.ndrReason || o.ndrRemark || 'Unknown').slice(0, 60); reasons[r] = (reasons[r] || 0) + 1; });
    return {
      total: orders.length, shippedCount: shipped.length,
      ndr, rto, delivered, transit, ready, manifested, newNdr48, newRto48, codAtRisk,
      ndrRate: shipped.length ? (ndr.length / shipped.length) * 100 : 0,
      rtoRate: closed ? (rto.length / closed) * 100 : 0,
      couriers: Object.values(couriers).sort((a, b) => b.shipped - a.shipped),
      reasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]),
    };
  }, [orders]);

  const Tile = ({ label, value, sub, accent, onClick, i = 0 }) => (
    <motion.button custom={i} variants={cardVariants} initial="hidden" animate="visible" exit="exit"
      onClick={onClick} disabled={!onClick}
      className="np-card p-5 text-left w-full disabled:cursor-default border-none cursor-pointer">
      <p className="text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--np-text-2)' }}>{label}</p>
      <p className="text-[26px] font-extrabold mt-1.5 tracking-tight tabular-nums leading-none" style={{ color: accent ? 'var(--np-pink-deep)' : 'var(--np-text)' }}>{value}</p>
      {sub && <p className="text-[10px] font-normal mt-1.5" style={{ color: 'var(--np-text-2)' }}>{sub}</p>}
    </motion.button>
  );

  const Bar = ({ pct }) => (
    <div className="h-1.5 rounded-full w-full overflow-hidden" style={{ background: '#f1f1f4' }}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: 'linear-gradient(90deg,#f6b5d2,#ef8fbc)' }} />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* manage today */}
      <motion.section custom={0} variants={cardVariants} initial="hidden" animate="visible" exit="exit" className="np-card p-6 sm:p-7">
        <div className="flex items-center gap-2 mb-5">
          <Zap size={15} style={{ color: 'var(--np-pink-deep)' }} />
          <h3 className="text-[15px] font-extrabold tracking-tight" style={{ color: 'var(--np-text)' }}>Manage Today</h3>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile i={1} label="Open NDRs" value={stats.ndr.length} sub="need action now" accent onClick={() => onJump('ndr')} />
          <Tile i={2} label="New NDRs · 48h" value={stats.newNdr48.length} sub="fresh failed attempts" accent onClick={() => onJump('ndr')} />
          <Tile i={3} label="RTO · 48h" value={stats.newRto48.length} sub="just started returning" onClick={() => onJump('rto')} />
          <Tile i={4} label="COD at risk" value={`₹${Math.round(stats.codAtRisk).toLocaleString('en-IN')}`} sub="NDR + RTO value" />
        </div>
        {stats.newNdr48.length > 0 && (
          <div className="mt-5">
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] mb-2.5" style={{ color: 'var(--np-text-3)' }}>Fresh NDRs — start here</p>
            <div className="flex gap-2 flex-wrap">
              {stats.newNdr48.slice(0, 12).map(o => (
                <button key={o.awb} onClick={() => onJump('ndr')} className="np-pill !py-2 !px-4 text-[11px]">
                  {o.orderNumber} · {(o.ndrReason || 'no reason').slice(0, 22)}
                </button>
              ))}
            </div>
          </div>
        )}
      </motion.section>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <Tile i={1} label="Shipped" value={stats.shippedCount} sub={`of ${stats.total} orders`} />
        <Tile i={2} label="Delivered" value={stats.delivered.length} onClick={() => onJump('delivered')} />
        <Tile i={3} label="In Transit" value={stats.transit.length} onClick={() => onJump('transit')} />
        <Tile i={4} label="Manifested" value={stats.manifested.length} sub="awaiting pickup" onClick={() => onJump('manifested')} />
        <Tile i={5} label="Ready" value={stats.ready.length} sub="courier assigned" onClick={() => onJump('ready')} />
        <Tile i={6} label="NDR Rate" value={`${stats.ndrRate.toFixed(1)}%`} sub={`${stats.ndr.length} of ${stats.shippedCount}`} accent />
        <Tile i={7} label="RTO Rate" value={`${stats.rtoRate.toFixed(1)}%`} sub={`${stats.rto.length} of ${stats.delivered.length + stats.rto.length} closed`} accent />
      </div>

      {/* courier performance */}
      <motion.section custom={2} variants={cardVariants} initial="hidden" animate="visible" exit="exit" className="np-card p-6 sm:p-7">
        <div className="flex items-center gap-2 mb-5">
          <Truck size={14} style={{ color: 'var(--np-text-2)' }} />
          <h3 className="text-[15px] font-extrabold tracking-tight" style={{ color: 'var(--np-text)' }}>Courier Performance</h3>
        </div>
        <div className="space-y-5">
          {stats.couriers.map(c => {
            const ndrPct = c.shipped ? (c.ndr / c.shipped) * 100 : 0;
            const rtoPct = c.shipped ? (c.rto / c.shipped) * 100 : 0;
            return (
              <div key={c.name} className="grid sm:grid-cols-[130px_1fr] gap-3 items-center">
                <div>
                  <p className="text-[13px] font-bold" style={{ color: 'var(--np-text)' }}>{c.name}</p>
                  <p className="text-[10px] font-normal" style={{ color: 'var(--np-text-2)' }}>{c.shipped} shipped</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-2 text-[11px]">
                  <p style={{ color: 'var(--np-text-2)' }}><span className="font-bold" style={{ color: 'var(--np-text)' }}>{c.delivered}</span> delivered</p>
                  <p style={{ color: 'var(--np-text-2)' }}><span className="font-bold" style={{ color: 'var(--np-text)' }}>{c.transit}</span> transit</p>
                  <div className="space-y-1">
                    <p style={{ color: 'var(--np-text-2)' }}><span className="font-bold" style={{ color: 'var(--np-pink-deep)' }}>{c.ndr}</span> NDR ({ndrPct.toFixed(0)}%)</p>
                    <Bar pct={ndrPct} />
                  </div>
                  <div className="space-y-1">
                    <p style={{ color: 'var(--np-text-2)' }}><span className="font-bold" style={{ color: 'var(--np-pink-deep)' }}>{c.rto}</span> RTO ({rtoPct.toFixed(0)}%)</p>
                    <Bar pct={rtoPct} />
                  </div>
                </div>
              </div>
            );
          })}
          {stats.couriers.length === 0 && <p className="text-[12px]" style={{ color: 'var(--np-text-2)' }}>No shipped orders in this window</p>}
        </div>
      </motion.section>

      {/* ndr reasons */}
      {stats.reasons.length > 0 && (
        <motion.section custom={3} variants={cardVariants} initial="hidden" animate="visible" exit="exit" className="np-card p-6 sm:p-7">
          <div className="flex items-center gap-2 mb-5">
            <TrendingDown size={14} style={{ color: 'var(--np-pink-deep)' }} />
            <h3 className="text-[15px] font-extrabold tracking-tight" style={{ color: 'var(--np-text)' }}>NDR Reasons</h3>
          </div>
          <div className="space-y-3">
            {stats.reasons.map(([reason, count]) => (
              <div key={reason} className="flex items-center gap-4">
                <p className="flex-1 text-[12px] font-normal truncate" style={{ color: 'var(--np-text)' }}>{reason}</p>
                <div className="w-32 sm:w-48"><Bar pct={(count / stats.ndr.length) * 100} /></div>
                <p className="w-6 text-right text-[12px] font-bold tabular-nums" style={{ color: 'var(--np-text)' }}>{count}</p>
              </div>
            ))}
          </div>
        </motion.section>
      )}
    </div>
  );
}

/* ═══════════════ Main page ═══════════════ */
export default function NDRDashboard() {
  const [board, setBoard] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ndr_board_cache') || 'null'); } catch { return null; }
  });
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('overview');
  const [dateFilter, setDateFilter] = useState('7d');
  const [customRange, setCustomRange] = useState([null, null]);
  const [sortDesc, setSortDesc] = useState(true);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [actions, setActions] = useState(loadActions);
  const [toast, setToast] = useState(null);
  const [showWaSettings, setShowWaSettings] = useState(false);
  const [waNumber, setWaNumber] = useState(() => localStorage.getItem('ndr_wa_number') || '');

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3200); return () => clearTimeout(t); } }, [toast]);
  useEffect(() => { setPageSize(PAGE_SIZE); }, [tab, dateFilter, deferredSearch, customRange]);

  const fetchBoard = useCallback(async (refresh = false, extraDays = 0) => {
    setLoading(true);
    try {
      const days = Math.min(90, Math.max(30, extraDays));
      const r = await axios.get(`${API_URL}/ndr/board?days=${days}${refresh ? '&refresh=1' : ''}`, { timeout: 240000 });
      setBoard(r.data);
      try { localStorage.setItem('ndr_board_cache', JSON.stringify(r.data)); } catch {}
    } catch (e) {
      setToast({ msg: `Sync failed: ${e.response?.data?.error || e.message}`, err: true });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const m = JSON.parse(localStorage.getItem('awbMap') || '{}');
        if (Object.keys(m).length) await axios.post(`${API_URL}/ndr/awb-map`, { map: m }).catch(() => {});
      } catch {}
      await fetchBoard(false);
      if (alive) fetchBoard(true);
    })();
    const iv = setInterval(() => fetchBoard(true), 5 * 60 * 1000);
    return () => { alive = false; clearInterval(iv); };
  }, [fetchBoard]);

  useEffect(() => {
    if (dateFilter === 'custom' && customRange[0] && board?.days) {
      const needed = Math.ceil((istNow() - customRange[0]) / 864e5) + 1;
      if (needed > board.days) fetchBoard(false, needed);
    }
  }, [dateFilter, customRange, board?.days, fetchBoard]);

  const dateFiltered = useMemo(() =>
    (board?.orders || []).filter(o => inDateFilter(o, dateFilter, customRange)),
  [board, dateFilter, customRange]);

  const visible = useMemo(() => {
    const s = deferredSearch.toLowerCase().trim();
    const filtered = dateFiltered
      .filter(o => {
        if (tab === 'overview') return true;
        if (tab === 'action') return o.bucket === 'ndr' || actions[o.awb];
        return o.bucket === tab;
      })
      .filter(o => !s ||
        o.orderNumber?.toLowerCase().includes(s) ||
        o.awb?.includes(s) ||
        o.customer?.phone?.includes(s) ||
        o.customer?.name?.toLowerCase().includes(s));
    return sortByDate(filtered, sortDesc);
  }, [dateFiltered, tab, actions, deferredSearch, sortDesc]);

  const counts = useMemo(() => {
    const c = { overview: null, orders: 0, ready: 0, manifested: 0, transit: 0, delivered: 0, ndr: 0, rto: 0, action: 0 };
    dateFiltered.forEach(o => {
      if (c[o.bucket] !== undefined) c[o.bucket]++;
      if (o.bucket === 'ndr' || actions[o.awb]) c.action++;
    });
    return c;
  }, [dateFiltered, actions]);

  const handleToast = useCallback((t) => setToast(t), []);

  const handleWaReport = useCallback((o) => {
    const msg = buildWaReport(o);
    const num = localStorage.getItem('ndr_wa_number') || '';
    if (num) {
      window.open(`https://wa.me/${num.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
    } else {
      navigator.clipboard.writeText(msg).then(() => setToast({ msg: 'Report copied — paste it in WhatsApp' })).catch(() => {});
      setTimeout(() => window.open('https://wa.link/fylf9t', '_blank'), 400);
    }
  }, []);

  const handleAction = useCallback(async (o, action, extra = {}) => {
    try {
      const r = await axios.post(`${API_URL}/ndr/action`, { awb: o.awb, action, ...extra }, { timeout: 60000 });
      setToast({ msg: r.data?.message || 'Done', err: !r.data?.success });
      if (r.data?.success) {
        setActions(prev => {
          const next = { ...prev, [o.awb]: { action, ts: new Date().toISOString(), orderNumber: o.orderNumber } };
          try { localStorage.setItem('ndr_actions', JSON.stringify(next)); } catch {}
          return next;
        });
        return true;
      }
      return false;
    } catch (e) {
      setToast({ msg: e.response?.data?.message || e.response?.data?.error || e.message, err: true });
      return false;
    }
  }, []);

  const actionRequired = tab === 'action' ? visible.filter(o => o.bucket === 'ndr' && !actions[o.awb]) : [];
  const actionRequested = tab === 'action' ? visible.filter(o => actions[o.awb]) : [];

  // key that identifies the visible set — drives fade-out/fade-in transitions
  const viewKey = `${tab}|${dateFilter}|${customRange[0]?.toDateString?.() || ''}|${customRange[1]?.toDateString?.() || ''}|${sortDesc}`;

  const renderCards = (list) => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {list.slice(0, pageSize).map((o, i) => (
        <BoardCard key={o.shopifyId} o={o} i={i} actionEntry={actions[o.awb]} onAction={handleAction} onWaReport={handleWaReport} onToast={handleToast} />
      ))}
    </div>
  );

  return (
    <div className="ndr-light min-h-screen rounded-[32px]" style={{ background: 'var(--np-bg)' }}>
      <div className="max-w-[1160px] mx-auto px-6 sm:px-8 pt-6 pb-40">

        {/* status line */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-[11px] font-normal" style={{ color: 'var(--np-text-2)' }}>
            {board?.generatedAt ? `Updated ${fmtDT(board.generatedAt)}` : 'Loading…'}
            {loading && board ? ' · syncing' : ''}
          </p>
          <button onClick={() => setShowWaSettings(true)} className="np-btn !p-2.5" title="WhatsApp report settings">
            <Settings size={13} />
          </button>
        </div>

        {/* tabs — horizontally scrollable pills */}
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 mb-4" style={{ scrollbarWidth: 'none' }}>
          {TABS.map(b => (
            <button key={b.id} onClick={() => setTab(b.id)} className={`np-pill shrink-0 ${tab === b.id ? 'np-pill-active' : ''}`}>
              {b.id === 'overview' && <LayoutDashboard size={12} />}
              {b.label}
              {counts[b.id] !== null && counts[b.id] !== undefined && (
                <span className="tabular-nums opacity-70">{counts[b.id]}</span>
              )}
            </button>
          ))}
        </div>

        {/* filters */}
        {tab !== 'overview' && (
          <div className="flex items-center gap-2 flex-wrap mb-7">
            {DATE_FILTERS.map(f => (
              <button key={f.id} onClick={() => { setDateFilter(f.id); setCustomRange([null, null]); }}
                className={`np-pill ${dateFilter === f.id ? 'np-pill-active' : ''}`}>
                {f.label}
              </button>
            ))}
            <div className={`np-pill ${dateFilter === 'custom' ? 'np-pill-active' : ''}`}>
              <Calendar size={11} className="shrink-0" />
              <DatePicker
                selectsRange
                startDate={customRange[0]}
                endDate={customRange[1]}
                maxDate={new Date()}
                onChange={(update) => { setCustomRange(update); if (update?.[0]) setDateFilter('custom'); }}
                dateFormat="d MMM"
                placeholderText="Pick dates"
                className="bg-transparent outline-none w-[104px] cursor-pointer text-[12px] font-semibold"
              />
              {customRange[0] && (
                <button onClick={() => { setCustomRange([null, null]); setDateFilter('7d'); }}
                  className="bg-transparent border-none cursor-pointer p-0 flex"><X size={11} /></button>
              )}
            </div>
            <button onClick={() => setSortDesc(!sortDesc)} className="np-pill">
              <ArrowDownUp size={11} /> {sortDesc ? 'Newest' : 'Oldest'}
            </button>
            <div className="relative ml-auto w-full sm:w-auto mt-1 sm:mt-0">
              <Search size={13} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--np-text-3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Order · AWB · phone · name"
                className="np-input !pl-10 w-full sm:w-60" />
            </div>
          </div>
        )}

        {/* first load */}
        {loading && !board && (
          <div className="flex flex-col items-center py-24" style={{ color: 'var(--np-text-2)' }}>
            <RefreshCw size={26} className="animate-spin mb-4" style={{ color: 'var(--np-pink-deep)' }} />
            <p className="text-[13px] font-semibold">Syncing orders &amp; live tracking…</p>
            <p className="text-[11px] mt-1 font-normal opacity-70">first load can take up to a minute</p>
          </div>
        )}

        {/* content — fades out & in on any tab / date change */}
        <AnimatePresence mode="wait">
          <motion.div key={viewKey} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.14 } }}>
            {tab === 'overview' && board && <Overview orders={dateFiltered} onJump={setTab} />}

            {tab === 'action' && board && (
              <div className="space-y-10">
                <section>
                  <div className="flex items-baseline gap-2.5 mb-4">
                    <h3 className="text-[15px] font-extrabold tracking-tight" style={{ color: 'var(--np-pink-deep)' }}>Action Required</h3>
                    <span className="text-[11px] font-normal" style={{ color: 'var(--np-text-2)' }}>{actionRequired.length} NDRs with no re-attempt yet</span>
                  </div>
                  {actionRequired.length ? renderCards(actionRequired) : <p className="text-[13px] py-4" style={{ color: 'var(--np-text-2)' }}>All NDRs actioned 🎉</p>}
                </section>
                <section>
                  <div className="flex items-baseline gap-2.5 mb-4">
                    <h3 className="text-[15px] font-extrabold tracking-tight" style={{ color: 'var(--np-text)' }}>Action Requested</h3>
                    <span className="text-[11px] font-normal" style={{ color: 'var(--np-text-2)' }}>{actionRequested.length} waiting on courier</span>
                  </div>
                  {actionRequested.length ? renderCards(actionRequested) : <p className="text-[13px] py-4" style={{ color: 'var(--np-text-2)' }}>No pending requests</p>}
                </section>
              </div>
            )}

            {tab !== 'overview' && tab !== 'action' && (
              <>
                {!loading && visible.length === 0 && (
                  <div className="flex flex-col items-center py-24" style={{ color: 'var(--np-text-3)' }}>
                    <Package size={38} />
                    <p className="mt-4 text-[13px] font-semibold" style={{ color: 'var(--np-text-2)' }}>Nothing here for this period</p>
                  </div>
                )}
                {renderCards(visible)}
                {visible.length > pageSize && (
                  <button onClick={() => setPageSize(p => p + PAGE_SIZE)} className="np-btn w-full mt-6 !py-4">
                    Show {Math.min(PAGE_SIZE, visible.length - pageSize)} more of {visible.length - pageSize}
                  </button>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {/* WA settings */}
        <AnimatePresence>
          {showWaSettings && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[300] flex items-center justify-center p-6" style={{ background: 'rgba(30,25,32,0.35)', backdropFilter: 'blur(6px)' }}
              onClick={() => setShowWaSettings(false)}>
              <motion.div initial={{ scale: 0.94, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }}
                className="np-card p-7 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
                <h3 className="text-[16px] font-extrabold tracking-tight" style={{ color: 'var(--np-text)' }}>WhatsApp Report Number</h3>
                <p className="text-[12px] font-normal leading-relaxed" style={{ color: 'var(--np-text-2)' }}>
                  Reports go to this number (with country code, e.g. 919876543210). Leave empty to use the wa.link — the report is copied for pasting.
                </p>
                <input value={waNumber} onChange={e => setWaNumber(e.target.value)} placeholder="91XXXXXXXXXX"
                  className="np-input w-full tabular-nums" />
                <div className="flex gap-2.5">
                  <button onClick={() => { localStorage.setItem('ndr_wa_number', waNumber.trim()); setShowWaSettings(false); setToast({ msg: 'Saved' }); }}
                    className="np-btn np-btn-accent flex-1">Save</button>
                  <button onClick={() => setShowWaSettings(false)} className="np-btn">Cancel</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* toast */}
        <AnimatePresence>
          {toast && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
              className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[300] np-pill np-pill-active !py-3 !px-6 text-[13px]"
              style={toast.err ? { color: '#b3134f' } : undefined}>
              {toast.msg}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
