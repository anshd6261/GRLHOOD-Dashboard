import React, { useState, useEffect, useMemo, useCallback, useDeferredValue } from 'react';
import axios from 'axios';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import {
  Package, RefreshCw, Truck, CheckCircle, AlertTriangle, RotateCcw,
  Phone, MessageSquare, MapPin, Calendar, Copy, ExternalLink, Search,
  Send, X, Settings, IndianRupee, Clock, LayoutDashboard, Zap, TrendingDown
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';
const API_URL = API_BASE ? `${API_BASE}/api` : '/api';

const TABS = [
  { id: 'overview', label: 'Overview', color: '#e3cfd8' },
  { id: 'orders', label: 'Orders', color: '#e3cfd8' },        // synced, NO courier yet
  { id: 'ready', label: 'Ready to Dispatch', color: '#818cf8' }, // courier/AWB assigned
  { id: 'manifested', label: 'Manifested', color: '#a78bfa' },   // manifest generated, awaiting pickup
  { id: 'transit', label: 'In Transit', color: '#38bdf8' },
  { id: 'delivered', label: 'Delivered', color: '#34d399' },
  { id: 'ndr', label: 'NDR', color: '#ff1493' },
  { id: 'rto', label: 'RTO', color: '#fb923c' },
  { id: 'action', label: 'Action', color: '#fbbf24' },
];

const DATE_FILTERS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: '7 Days' },
  { id: '30d', label: '30 Days' },
];

const PAGE_SIZE = 24;

/* ── date helpers ── */
const relevantDate = (o) => {
  const d = (o.bucket === 'orders' || o.bucket === 'ready') ? o.orderDate : (o.statusDateTime || o.orderDate);
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? new Date(0) : dt;
};
const istNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const inDateFilter = (o, filter, customRange) => {
  const d = relevantDate(o);
  const now = istNow();
  if (filter === 'custom') {
    const [start, end] = customRange || [];
    if (!start) return true;
    const from = new Date(start); from.setHours(0, 0, 0, 0);
    const to = new Date(end || start); to.setHours(23, 59, 59, 999);
    return d >= from && d <= to;
  }
  if (filter === 'today') return sameDay(d, now);
  if (filter === 'yesterday') { const y = new Date(now.getTime() - 864e5); return sameDay(d, y); }
  if (filter === '7d') return now - d <= 7 * 864e5;
  if (filter === '30d') return now - d <= 30 * 864e5;
  return true;
};

const fmtDT = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const fmtD = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
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

/* ═══════════════ Memoized board card — owns its own form state ═══════════════ */
const BoardCard = React.memo(function BoardCard({ o, actionEntry, onAction, onWaReport, onToast }) {
  const [showAll, setShowAll] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [date, setDate] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  const color = TABS.find(b => b.id === o.bucket)?.color || '#e3cfd8';
  const isNdr = o.bucket === 'ndr';

  const copy = (text, label = 'Copied') => {
    navigator.clipboard.writeText(text).then(() => onToast({ msg: label })).catch(() => {});
  };

  const submitReattempt = async () => {
    setBusy(true);
    const ok = await onAction(o, 'reattempt', { date: date || undefined, phone: phone || undefined });
    setBusy(false);
    if (ok) setShowForm(false);
  };

  return (
    <div className="board-card" style={{ borderLeft: `3px solid ${color}66` }}>
      <div className="p-4 pb-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-black text-base text-white">{o.orderNumber}</span>
              <span className={`text-[9px] uppercase font-black px-2 py-0.5 rounded-full tracking-wider ${
                o.paymentMode === 'Prepaid' ? 'bg-[rgba(52,211,153,0.1)] border border-[rgba(52,211,153,0.25)] text-emerald-400'
                : o.paymentMode === 'Partially Paid' ? 'bg-[rgba(251,191,36,0.1)] border border-[rgba(251,191,36,0.25)] text-amber-400'
                : 'bg-[rgba(255,20,147,0.08)] border border-[rgba(255,20,147,0.2)] text-[#ff7ab8]'
              }`}>{o.paymentMode}{o.isCod ? ` · ₹${o.totalAmount}` : ''}</span>
              {o.courier && <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded-full tracking-wider bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.08)] text-[rgba(245,245,245,0.6)]">{o.courier}</span>}
              {actionEntry && (
                <span className="text-[9px] uppercase font-black px-2 py-0.5 rounded-full tracking-wider bg-[rgba(251,191,36,0.1)] border border-[rgba(251,191,36,0.25)] text-amber-400">
                  Re-attempt requested {fmtD(actionEntry.ts)}
                </span>
              )}
            </div>
            {o.awb && (
              <button onClick={() => copy(o.awb, 'AWB copied')} className="mt-1 text-[10px] font-mono text-[rgba(245,245,245,0.45)] hover:text-white flex items-center gap-1">
                AWB {o.awb} <Copy size={9} className="opacity-50" />
                {o.trackingUrl && <a href={o.trackingUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-[#e3cfd8]"><ExternalLink size={9} /></a>}
              </button>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="text-[11px] font-black uppercase tracking-wider" style={{ color }}>{o.status}</div>
            <div className="text-[9px] text-[rgba(245,245,245,0.35)] font-mono mt-0.5 flex items-center justify-end gap-1">
              <Clock size={8} /> {fmtDT(o.bucket === 'orders' || o.bucket === 'ready' ? o.orderDate : o.statusDateTime)}
            </div>
            {o.edd && o.bucket !== 'delivered' && <div className="text-[9px] text-emerald-400/80 mt-0.5">EDD {fmtD(o.edd)}</div>}
          </div>
        </div>

        {/* Dates strip */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="px-2 py-1 rounded-lg bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)]">
            <span className="text-[8px] uppercase font-black tracking-wider text-[rgba(245,245,245,0.3)] mr-1.5">Order Date</span>
            <span className="text-[10px] font-mono text-[rgba(245,245,245,0.75)]">{fmtD(o.orderDate)}</span>
          </span>
          {(o.bucket === 'ndr' || (o.ndrDate && o.bucket === 'rto')) && o.ndrDate && (
            <span className="px-2 py-1 rounded-lg bg-[rgba(255,20,147,0.06)] border border-[rgba(255,20,147,0.18)]">
              <span className="text-[8px] uppercase font-black tracking-wider text-[#ff1493] mr-1.5">NDR Date</span>
              <span className="text-[10px] font-mono text-[#ff9ecb]">{fmtDT(o.ndrDate)}</span>
            </span>
          )}
          {o.bucket === 'rto' && o.rtoInitiatedAt && (
            <span className="px-2 py-1 rounded-lg bg-[rgba(251,146,60,0.06)] border border-[rgba(251,146,60,0.2)]">
              <span className="text-[8px] uppercase font-black tracking-wider text-orange-400 mr-1.5">RTO Initiated</span>
              <span className="text-[10px] font-mono text-orange-300">{fmtDT(o.rtoInitiatedAt)}</span>
            </span>
          )}
          {o.bucket === 'delivered' && (
            <span className="px-2 py-1 rounded-lg bg-[rgba(52,211,153,0.06)] border border-[rgba(52,211,153,0.18)]">
              <span className="text-[8px] uppercase font-black tracking-wider text-emerald-400 mr-1.5">Delivered</span>
              <span className="text-[10px] font-mono text-emerald-300">{fmtDT(o.statusDateTime)}</span>
            </span>
          )}
        </div>

        {/* NDR reason */}
        {isNdr && (
          <div className="mt-3 rounded-xl px-3 py-2.5 bg-[rgba(255,20,147,0.07)] border border-[rgba(255,20,147,0.18)]">
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-[#ff1493]">
              <AlertTriangle size={11} /> {o.ndrReason || o.ndrRemark || 'Delivery failed — reason not given'}
              {o.attemptCount > 0 && <span className="ml-auto font-mono normal-case">Attempt {o.attemptCount}</span>}
            </div>
            {o.ndrReason && o.ndrRemark && o.ndrRemark !== o.ndrReason && (
              <div className="text-[10px] text-[rgba(245,245,245,0.5)] mt-1">{o.ndrRemark}</div>
            )}
            {o.scanLocation && <div className="text-[9px] text-[rgba(245,245,245,0.35)] mt-1 flex items-center gap-1"><MapPin size={8} /> {o.scanLocation}</div>}
          </div>
        )}

        {o.bucket === 'rto' && (o.ndrRemark || o.ndrReason) && (
          <div className="mt-3 rounded-xl px-3 py-2 bg-[rgba(251,146,60,0.07)] border border-[rgba(251,146,60,0.18)] text-[10px] text-orange-300 flex items-center gap-1.5">
            <RotateCcw size={10} /> {o.ndrReason || o.ndrRemark}
          </div>
        )}

        {/* Customer */}
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2 items-start">
          <div className="min-w-0">
            <div className="text-[12px] font-bold text-white truncate">{o.customer?.name || 'Customer'}</div>
            <div className="text-[10px] text-[rgba(245,245,245,0.45)] leading-relaxed mt-0.5">
              {o.customer?.address}<br />
              {o.customer?.city}, {o.customer?.state} — <span className="font-mono text-[rgba(245,245,245,0.6)]">{o.customer?.pincode}</span>
            </div>
            {o.customer?.phone && (
              <button onClick={() => copy(o.customer.phone, 'Phone copied')} className="text-[10px] font-mono text-[#e3cfd8] mt-1 flex items-center gap-1">
                +91 {o.customer.phone} <Copy size={8} className="opacity-50" />
              </button>
            )}
          </div>
          {o.customer?.phone && (
            <div className="flex gap-1.5 shrink-0">
              <a href={`tel:+91${o.customer.phone}`} className="glass-btn p-2 rounded-xl" title="Call customer"><Phone size={13} className="text-[#e3cfd8]" /></a>
              <a href={`https://wa.me/91${o.customer.phone}?text=${encodeURIComponent(`Hi ${o.customer?.name}, this is GRLHOOD! Regarding your order ${o.orderNumber} — the courier (${o.courier}) marked a delivery attempt${o.ndrReason ? ` ("${o.ndrReason}")` : ''}. Were you contacted for delivery? We want to get this to you ASAP!`)}`}
                target="_blank" rel="noopener noreferrer" className="glass-btn p-2 rounded-xl" title="WhatsApp customer">
                <MessageSquare size={13} className="text-[#25D366]" />
              </a>
            </div>
          )}
        </div>

        {/* Products */}
        <div className="mt-3 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)] divide-y divide-[rgba(255,255,255,0.04)]">
          {(o.products || []).slice(0, showAll ? 99 : 2).map((p, i) => (
            <div key={i} className="px-3 py-1.5 flex items-center justify-between gap-2 text-[10px]">
              <span className="text-[rgba(245,245,245,0.7)] truncate">{p.name}{p.qty > 1 ? ` ×${p.qty}` : ''}</span>
              <span className="text-[rgba(245,245,245,0.4)] font-mono shrink-0">₹{p.price}</span>
            </div>
          ))}
          {o.products?.length > 2 && !showAll && (
            <button onClick={() => setShowAll(true)} className="w-full px-3 py-1 text-[9px] text-[rgba(245,245,245,0.35)] hover:text-white">
              +{o.products.length - 2} more items
            </button>
          )}
          <div className="px-3 py-1.5 flex items-center justify-between text-[10px] font-bold">
            <span className="text-[rgba(245,245,245,0.5)] uppercase tracking-wider text-[9px]">Total</span>
            <span className="text-white font-mono flex items-center"><IndianRupee size={9} />{o.totalAmount}</span>
          </div>
        </div>
      </div>

      {/* NDR actions (RTO removed by request — reattempt + report only) */}
      {isNdr && o.awb && (
        <div className="px-4 pb-4 pt-1 space-y-2">
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => { setShowForm(!showForm); setDate(''); setPhone(''); }}
              className="glass-btn-accent px-3.5 py-2 rounded-xl text-[10px] font-bold flex items-center gap-1.5 flex-1 justify-center">
              <Truck size={11} /> Re-Attempt Delivery
            </button>
            <button onClick={() => onWaReport(o)}
              className="glass-btn px-3.5 py-2 rounded-xl text-[10px] font-bold flex items-center gap-1.5 text-[#25D366] border-[#25D366]/20">
              <Send size={11} /> Report on WhatsApp
            </button>
          </div>
          {showForm && (
            <div className="rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] p-3 space-y-2">
              <div className="text-[9px] uppercase font-bold tracking-wider text-[rgba(245,245,245,0.4)]">Schedule re-attempt</div>
              <div className="flex gap-2 flex-wrap">
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  min={new Date(Date.now() + 864e5).toISOString().slice(0, 10)}
                  className="glass-input text-[10px] px-2.5 py-1.5 rounded-lg" />
                <input type="tel" placeholder="New phone (optional)" value={phone} onChange={e => setPhone(e.target.value)}
                  className="glass-input text-[10px] px-2.5 py-1.5 rounded-lg w-36" />
                <button onClick={submitReattempt} disabled={busy}
                  className="glass-btn-accent px-3.5 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5">
                  {busy ? <RefreshCw size={10} className="animate-spin" /> : <CheckCircle size={10} />} Confirm
                </button>
                <button onClick={() => setShowForm(false)} className="glass-btn px-2.5 py-1.5 rounded-lg text-[10px]"><X size={10} /></button>
              </div>
              <p className="text-[9px] text-[rgba(245,245,245,0.3)]">Defaults to tomorrow if no date picked. Phone updates the courier's contact number for the attempt.</p>
            </div>
          )}
        </div>
      )}

      {o.bucket === 'delivered' && (
        <div className="px-4 pb-3 flex items-center gap-1.5 text-[10px] text-emerald-400">
          <CheckCircle size={11} /> Delivered {fmtDT(o.statusDateTime)}{o.attemptCount > 1 ? ` · took ${o.attemptCount} attempts` : ''}
        </div>
      )}

      {(o.bucket === 'ready' || o.bucket === 'manifested') && (() => {
        const age = (istNow() - relevantDate(o)) / 864e5;
        return age > 2 ? (
          <div className="px-4 pb-3 flex items-center gap-1.5 text-[10px] text-amber-400">
            <AlertTriangle size={11} /> {o.bucket === 'manifested' ? 'Not picked up' : 'Not manifested'} for {Math.floor(age)} days — chase the courier
          </div>
        ) : null;
      })()}
    </div>
  );
});

/* ═══════════════ Overview tab ═══════════════ */
function Overview({ orders, onJump }) {
  const now = istNow();
  const stats = useMemo(() => {
    const shipped = orders.filter(o => o.awb);
    const by = (b) => orders.filter(o => o.bucket === b);
    const ndr = by('ndr'), rto = by('rto'), delivered = by('delivered'), transit = by('transit'), ready = by('ready'), manifested = by('manifested');
    const closed = delivered.length + rto.length; // journeys that ended
    const newNdr48 = ndr.filter(o => o.ndrDate && (now - new Date(o.ndrDate)) <= 48 * 3600e3);
    const newRto48 = rto.filter(o => o.rtoInitiatedAt && (now - new Date(o.rtoInitiatedAt)) <= 48 * 3600e3);
    const codAtRisk = ndr.reduce((s, o) => s + (o.isCod ? o.totalAmount : 0), 0) + rto.reduce((s, o) => s + (o.isCod ? o.totalAmount : 0), 0);

    // Per-courier breakdown
    const couriers = {};
    shipped.forEach(o => {
      const c = o.courier || 'Unassigned';
      if (!couriers[c]) couriers[c] = { name: c, shipped: 0, transit: 0, delivered: 0, ndr: 0, rto: 0, ready: 0, manifested: 0 };
      couriers[c].shipped++;
      if (couriers[c][o.bucket] !== undefined) couriers[c][o.bucket]++;
    });

    // NDR reasons
    const reasons = {};
    ndr.forEach(o => {
      const r = (o.ndrReason || o.ndrRemark || 'Unknown').slice(0, 60);
      reasons[r] = (reasons[r] || 0) + 1;
    });

    return {
      total: orders.length, shippedCount: shipped.length,
      ndr, rto, delivered, transit, ready, manifested,
      newNdr48, newRto48, codAtRisk,
      ndrRate: shipped.length ? (ndr.length / shipped.length) * 100 : 0,
      rtoRate: closed ? (rto.length / closed) * 100 : 0,
      deliveryRate: closed ? (delivered.length / closed) * 100 : 0,
      couriers: Object.values(couriers).sort((a, b) => b.shipped - a.shipped),
      reasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]),
    };
  }, [orders]);

  const Tile = ({ label, value, sub, color = '#e3cfd8', onClick }) => (
    <button onClick={onClick} disabled={!onClick}
      className="board-card p-4 text-left w-full disabled:cursor-default hover:brightness-110 transition-[filter]">
      <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[rgba(245,245,245,0.35)]">{label}</div>
      <div className="text-2xl font-black mt-1" style={{ color }}>{value}</div>
      {sub && <div className="text-[10px] text-[rgba(245,245,245,0.35)] mt-0.5">{sub}</div>}
    </button>
  );

  const Bar = ({ pct, color }) => (
    <div className="h-1.5 rounded-full bg-[rgba(255,255,255,0.05)] overflow-hidden w-full">
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* ── TO MANAGE TODAY ── */}
      <div className="board-card p-5" style={{ borderLeft: '3px solid #ff149366' }}>
        <div className="flex items-center gap-2 mb-3">
          <Zap size={15} className="text-[#ff1493]" />
          <h3 className="text-sm font-black text-white uppercase tracking-wider">Manage Today</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Tile label="Open NDRs" value={stats.ndr.length} sub="need action now" color="#ff1493" onClick={() => onJump('ndr')} />
          <Tile label="New NDRs · 48h" value={stats.newNdr48.length} sub="fresh failed attempts" color="#ff1493" onClick={() => onJump('ndr')} />
          <Tile label="RTOs initiated · 48h" value={stats.newRto48.length} sub="just started returning" color="#fb923c" onClick={() => onJump('rto')} />
          <Tile label="COD at risk" value={`₹${Math.round(stats.codAtRisk).toLocaleString('en-IN')}`} sub="NDR + RTO cod value" color="#fbbf24" />
        </div>
        {stats.newNdr48.length > 0 && (
          <div className="mt-3">
            <div className="text-[9px] uppercase font-bold tracking-wider text-[rgba(245,245,245,0.3)] mb-1.5">Fresh NDRs — start here</div>
            <div className="flex gap-1.5 flex-wrap">
              {stats.newNdr48.slice(0, 12).map(o => (
                <button key={o.awb} onClick={() => onJump('ndr')}
                  className="px-2.5 py-1 rounded-lg bg-[rgba(255,20,147,0.07)] border border-[rgba(255,20,147,0.2)] text-[10px] font-mono text-[#ff9ecb] hover:bg-[rgba(255,20,147,0.14)]">
                  {o.orderNumber} · {(o.ndrReason || 'no reason').slice(0, 24)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <Tile label="Shipped" value={stats.shippedCount} sub={`of ${stats.total} orders`} />
        <Tile label="Delivered" value={stats.delivered.length} color="#34d399" onClick={() => onJump('delivered')} />
        <Tile label="In Transit" value={stats.transit.length} color="#38bdf8" onClick={() => onJump('transit')} />
        <Tile label="Manifested" value={stats.manifested.length} sub="awaiting pickup" color="#a78bfa" onClick={() => onJump('manifested')} />
        <Tile label="Ready" value={stats.ready.length} sub="courier assigned" color="#818cf8" onClick={() => onJump('ready')} />
        <Tile label="NDR Rate" value={`${stats.ndrRate.toFixed(1)}%`} sub={`${stats.ndr.length} of ${stats.shippedCount} shipped`} color="#ff1493" />
        <Tile label="RTO Rate" value={`${stats.rtoRate.toFixed(1)}%`} sub={`${stats.rto.length} of ${stats.delivered.length + stats.rto.length} closed`} color="#fb923c" />
      </div>

      {/* ── Courier performance ── */}
      <div className="board-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Truck size={14} className="text-[#e3cfd8]" />
          <h3 className="text-sm font-black text-white uppercase tracking-wider">Courier Performance</h3>
        </div>
        <div className="space-y-3">
          {stats.couriers.map(c => {
            const ndrPct = c.shipped ? (c.ndr / c.shipped) * 100 : 0;
            const rtoPct = c.shipped ? (c.rto / c.shipped) * 100 : 0;
            return (
              <div key={c.name} className="grid grid-cols-[110px_1fr] gap-3 items-center">
                <div>
                  <div className="text-[11px] font-bold text-white">{c.name}</div>
                  <div className="text-[9px] text-[rgba(245,245,245,0.35)]">{c.shipped} shipped</div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-[9px]">
                  <div><span className="text-emerald-400 font-bold">{c.delivered}</span> <span className="text-[rgba(245,245,245,0.3)]">delivered</span></div>
                  <div><span className="text-[#38bdf8] font-bold">{c.transit}</span> <span className="text-[rgba(245,245,245,0.3)]">transit</span></div>
                  <div className="space-y-0.5">
                    <div><span className="text-[#ff1493] font-bold">{c.ndr}</span> <span className="text-[rgba(245,245,245,0.3)]">NDR ({ndrPct.toFixed(0)}%)</span></div>
                    <Bar pct={ndrPct} color="#ff1493" />
                  </div>
                  <div className="space-y-0.5">
                    <div><span className="text-orange-400 font-bold">{c.rto}</span> <span className="text-[rgba(245,245,245,0.3)]">RTO ({rtoPct.toFixed(0)}%)</span></div>
                    <Bar pct={rtoPct} color="#fb923c" />
                  </div>
                </div>
              </div>
            );
          })}
          {stats.couriers.length === 0 && <div className="text-xs text-[rgba(245,245,245,0.3)]">No shipped orders in this window</div>}
        </div>
      </div>

      {/* ── NDR reasons ── */}
      {stats.reasons.length > 0 && (
        <div className="board-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown size={14} className="text-[#ff1493]" />
            <h3 className="text-sm font-black text-white uppercase tracking-wider">NDR Reasons</h3>
          </div>
          <div className="space-y-2">
            {stats.reasons.map(([reason, count]) => (
              <div key={reason} className="flex items-center gap-3">
                <div className="flex-1 text-[10px] text-[rgba(245,245,245,0.6)] truncate">{reason}</div>
                <Bar pct={(count / stats.ndr.length) * 100} color="#ff1493" />
                <div className="w-8 text-right text-[10px] font-bold text-white">{count}</div>
              </div>
            ))}
          </div>
        </div>
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

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); } }, [toast]);
  useEffect(() => { setPageSize(PAGE_SIZE); }, [tab, dateFilter, deferredSearch, customRange]);

  // The server always loads a wide fixed window (30 days) so date filtering is
  // purely client-side and instant; only a custom range older than that widens
  // the request. No manual refresh — cached render → server-cache fetch →
  // background live sync, then auto-sync every 5 minutes.
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
      await fetchBoard(false);              // fast: server cache
      if (alive) fetchBoard(true);          // background: live tracking sync
    })();
    const iv = setInterval(() => fetchBoard(true), 5 * 60 * 1000);
    return () => { alive = false; clearInterval(iv); };
  }, [fetchBoard]);

  // Custom ranges reaching further back than the loaded window widen the fetch
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
    return dateFiltered
      .filter(o => {
        if (tab === 'overview') return true;
        if (tab === 'action') return o.bucket === 'ndr' || actions[o.awb];
        return o.bucket === tab; // 'orders' = synced with no courier assigned yet
      })
      .filter(o => !s ||
        o.orderNumber?.toLowerCase().includes(s) ||
        o.awb?.includes(s) ||
        o.customer?.phone?.includes(s) ||
        o.customer?.name?.toLowerCase().includes(s))
      .sort((a, b) => sortDesc ? relevantDate(b) - relevantDate(a) : relevantDate(a) - relevantDate(b));
  }, [dateFiltered, tab, actions, deferredSearch, sortDesc]);

  const counts = useMemo(() => {
    const c = { overview: null, orders: 0, ready: 0, manifested: 0, transit: 0, delivered: 0, ndr: 0, rto: 0, action: 0 };
    dateFiltered.forEach(o => {
      if (c[o.bucket] !== undefined) c[o.bucket]++;
      if (o.bucket === 'ndr' || actions[o.awb]) c.action++;
    });
    return c;
  }, [dateFiltered, actions]);

  /* Stable handlers for memoized cards */
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

  const tabMeta = TABS.find(b => b.id === tab);
  const actionRequired = tab === 'action' ? visible.filter(o => o.bucket === 'ndr' && !actions[o.awb]) : [];
  const actionRequested = tab === 'action' ? visible.filter(o => actions[o.awb]) : [];

  const renderCards = (list) => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {list.slice(0, pageSize).map(o => (
        <BoardCard key={o.shopifyId} o={o} actionEntry={actions[o.awb]} onAction={handleAction} onWaReport={handleWaReport} onToast={handleToast} />
      ))}
    </div>
  );

  return (
    <div className="max-w-[1200px] mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black text-white tracking-wide">Shipment Board</h1>
          <p className="text-[11px] text-[rgba(245,245,245,0.35)]">
            {board?.generatedAt ? `updated ${fmtDT(board.generatedAt)}` : 'loading...'}
            {loading ? ' · refreshing…' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loading && board && (
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-[rgba(245,245,245,0.35)]">
              <RefreshCw size={10} className="animate-spin text-[#e3cfd8]" /> live syncing
            </span>
          )}
          <button onClick={() => setShowWaSettings(true)} className="glass-icon-btn" title="WhatsApp report settings"><Settings size={14} /></button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        {TABS.map(b => (
          <button key={b.id} onClick={() => setTab(b.id)}
            className={`px-4 py-2 rounded-2xl text-[11px] font-black uppercase tracking-wider border transition-colors ${
              tab === b.id ? '' : 'opacity-45 hover:opacity-80'
            }`}
            style={{
              background: tab === b.id ? `${b.color}1a` : 'rgba(255,255,255,0.03)',
              borderColor: tab === b.id ? `${b.color}55` : 'rgba(255,255,255,0.07)',
              color: tab === b.id ? b.color : 'rgba(245,245,245,0.7)',
            }}>
            {b.id === 'overview' ? <LayoutDashboard size={11} className="inline mr-1 -mt-0.5" /> : null}
            {b.label}{counts[b.id] !== null && counts[b.id] !== undefined ? <span className="ml-1 font-mono">{counts[b.id]}</span> : ''}
          </button>
        ))}
      </div>

      {/* Filters */}
      {tab !== 'overview' && (
        <div className="flex items-center gap-2 flex-wrap mb-5">
          {DATE_FILTERS.map(f => (
            <button key={f.id} onClick={() => { setDateFilter(f.id); setCustomRange([null, null]); }}
              className={`glass-pill text-[11px] font-bold tracking-wider cursor-pointer transition-colors ${
                dateFilter === f.id ? 'glass-pill-active' : 'text-[rgba(245,245,245,0.35)] hover:text-[rgba(245,245,245,0.6)]'
              }`}>
              {f.label}
            </button>
          ))}
          <div className={`glass-pill flex items-center gap-1.5 ${dateFilter === 'custom' ? 'glass-pill-active' : 'text-[rgba(245,245,245,0.35)]'}`}>
            <Calendar size={10} className="shrink-0" />
            <DatePicker
              selectsRange
              startDate={customRange[0]}
              endDate={customRange[1]}
              maxDate={new Date()}
              onChange={(update) => { setCustomRange(update); if (update?.[0]) setDateFilter('custom'); }}
              dateFormat="d MMM"
              placeholderText="Pick date / range"
              className="bg-transparent text-[11px] font-bold outline-none w-[120px] cursor-pointer placeholder-[rgba(245,245,245,0.3)]"
            />
            {customRange[0] && (
              <button onClick={() => { setCustomRange([null, null]); setDateFilter('7d'); }} className="hover:text-white"><X size={10} /></button>
            )}
          </div>
          <button onClick={() => setSortDesc(!sortDesc)} className="glass-pill text-[11px] font-bold tracking-wider cursor-pointer text-[rgba(245,245,245,0.5)] flex items-center gap-1">
            <Calendar size={10} /> {sortDesc ? 'Newest first' : 'Oldest first'}
          </button>
          <div className="relative ml-auto">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[rgba(245,245,245,0.25)]" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Order / AWB / phone / name"
              className="glass-input pl-8 pr-3 py-2 text-xs rounded-xl w-56" />
          </div>
        </div>
      )}

      {/* First load */}
      {loading && !board && (
        <div className="flex flex-col items-center py-20 text-[rgba(245,245,245,0.35)]">
          <RefreshCw size={28} className="animate-spin mb-3 text-[#e3cfd8]" />
          <span className="text-xs">Syncing store orders + live tracking from iThink...</span>
          <span className="text-[10px] mt-1 opacity-60">first load can take up to a minute</span>
        </div>
      )}

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && board && (
        <Overview orders={dateFiltered} onJump={(b) => setTab(b)} />
      )}

      {/* ── ACTION tab: required vs requested ── */}
      {tab === 'action' && board && (
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={13} className="text-[#ff1493]" />
              <h3 className="text-xs font-black text-white uppercase tracking-wider">Action Required ({actionRequired.length})</h3>
              <span className="text-[10px] text-[rgba(245,245,245,0.3)]">— NDRs with no re-attempt requested yet</span>
            </div>
            {actionRequired.length ? renderCards(actionRequired) : <div className="text-xs text-[rgba(245,245,245,0.3)] py-4">All NDRs actioned 🎉</div>}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle size={13} className="text-amber-400" />
              <h3 className="text-xs font-black text-white uppercase tracking-wider">Action Requested ({actionRequested.length})</h3>
              <span className="text-[10px] text-[rgba(245,245,245,0.3)]">— waiting on the courier</span>
            </div>
            {actionRequested.length ? renderCards(actionRequested) : <div className="text-xs text-[rgba(245,245,245,0.3)] py-4">No pending requests</div>}
          </div>
        </div>
      )}

      {/* ── Card tabs ── */}
      {tab !== 'overview' && tab !== 'action' && (
        <>
          {!loading && visible.length === 0 && (
            <div className="flex flex-col items-center py-20 opacity-30">
              <Package size={40} />
              <span className="mt-3 text-sm">Nothing in {tabMeta?.label} for this period</span>
            </div>
          )}
          {renderCards(visible)}
          {visible.length > pageSize && (
            <button onClick={() => setPageSize(p => p + PAGE_SIZE)}
              className="glass-btn w-full mt-4 py-3 rounded-2xl text-xs font-bold text-[rgba(245,245,245,0.6)]">
              Show {Math.min(PAGE_SIZE, visible.length - pageSize)} more of {visible.length - pageSize}
            </button>
          )}
        </>
      )}

      {/* WhatsApp settings modal */}
      {showWaSettings && (
        <div className="fixed inset-0 z-[300] bg-black/70 flex items-center justify-center p-4" onClick={() => setShowWaSettings(false)}>
          <div className="board-card p-5 w-full max-w-sm space-y-3" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-black text-white">WhatsApp Report Number</div>
            <p className="text-[10px] text-[rgba(245,245,245,0.4)] leading-relaxed">
              The number reports are sent to (with country code, e.g. 919876543210). Leave empty to use the wa.link — the report gets copied to your clipboard to paste.
            </p>
            <input value={waNumber} onChange={e => setWaNumber(e.target.value)} placeholder="91XXXXXXXXXX"
              className="glass-input w-full text-xs px-3 py-2 rounded-xl font-mono" />
            <div className="flex gap-2">
              <button onClick={() => { localStorage.setItem('ndr_wa_number', waNumber.trim()); setShowWaSettings(false); setToast({ msg: 'Saved' }); }}
                className="glass-btn-accent px-4 py-2 rounded-xl text-xs font-bold flex-1">Save</button>
              <button onClick={() => setShowWaSettings(false)} className="glass-btn px-4 py-2 rounded-xl text-xs font-bold">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-8 right-8 z-[300] px-5 py-3 rounded-2xl shadow-2xl border bg-[rgba(26,26,30,0.97)] border-[rgba(227,207,216,0.2)] text-sm font-bold ${toast.err ? 'text-[#ff1493]' : 'text-white'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
