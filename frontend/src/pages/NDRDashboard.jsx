import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import {
  Package, RefreshCw, Truck, CheckCircle, AlertTriangle, RotateCcw,
  Phone, MessageSquare, MapPin, Calendar, Copy, ExternalLink, Search,
  ChevronDown, ChevronUp, Send, X, Settings, IndianRupee, Clock
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';
const API_URL = API_BASE ? `${API_BASE}/api` : '/api';

const BUCKETS = [
  { id: 'orders', label: 'Orders', color: '#e3cfd8', desc: 'All synced store orders' },
  { id: 'ready', label: 'Ready to Dispatch', color: '#818cf8', desc: 'Courier assigned, not picked up' },
  { id: 'transit', label: 'In Transit', color: '#38bdf8', desc: 'On the way to customer' },
  { id: 'delivered', label: 'Delivered', color: '#34d399', desc: 'Accepted by customer' },
  { id: 'ndr', label: 'NDR', color: '#ff1493', desc: 'Failed delivery — take action' },
  { id: 'rto', label: 'RTO', color: '#fb923c', desc: 'Returning to origin' },
];

const DATE_FILTERS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: '7 Days' },
  { id: '30d', label: '30 Days' },
];

// Bucket-relevant date: NDR/transit/delivered → last scan; else order date
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

export default function NDRDashboard() {
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [bucket, setBucket] = useState('ndr');
  const [dateFilter, setDateFilter] = useState('7d');
  const [customRange, setCustomRange] = useState([null, null]); // [start, end] for single date or window
  const [sortDesc, setSortDesc] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(new Set());
  const [actioning, setActioning] = useState(null); // awb currently posting
  const [reattemptFor, setReattemptFor] = useState(null); // awb showing reattempt form
  const [reattemptDate, setReattemptDate] = useState('');
  const [reattemptPhone, setReattemptPhone] = useState('');
  const [toast, setToast] = useState(null);
  const [showWaSettings, setShowWaSettings] = useState(false);
  const [waNumber, setWaNumber] = useState(() => localStorage.getItem('ndr_wa_number') || '');

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); } }, [toast]);

  const fetchBoard = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      // Fetch window must reach back to the custom range's start date
      let days = dateFilter === '30d' ? 30 : 7;
      if (dateFilter === 'custom' && customRange[0]) {
        days = Math.min(90, Math.max(1, Math.ceil((istNow() - customRange[0]) / 864e5) + 1));
      }
      const r = await axios.get(`${API_URL}/ndr/board?days=${days}${refresh ? '&refresh=1' : ''}`, { timeout: 240000 });
      setBoard(r.data);
    } catch (e) {
      setToast({ msg: `Load failed: ${e.response?.data?.error || e.message}`, err: true });
    } finally { setLoading(false); }
  }, [dateFilter, customRange]);

  useEffect(() => { fetchBoard(); }, [fetchBoard]);

  const visible = useMemo(() => {
    if (!board?.orders) return [];
    const s = search.toLowerCase().trim();
    return board.orders
      .filter(o => bucket === 'orders' ? true : o.bucket === bucket)
      .filter(o => inDateFilter(o, dateFilter, customRange))
      .filter(o => !s ||
        o.orderNumber?.toLowerCase().includes(s) ||
        o.awb?.includes(s) ||
        o.customer?.phone?.includes(s) ||
        o.customer?.name?.toLowerCase().includes(s))
      .sort((a, b) => sortDesc ? relevantDate(b) - relevantDate(a) : relevantDate(a) - relevantDate(b));
  }, [board, bucket, dateFilter, customRange, sortDesc, search]);

  const counts = useMemo(() => {
    const c = { orders: 0, ready: 0, transit: 0, delivered: 0, ndr: 0, rto: 0 };
    (board?.orders || []).filter(o => inDateFilter(o, dateFilter, customRange)).forEach(o => {
      c.orders++;
      if (c[o.bucket] !== undefined && o.bucket !== 'orders') c[o.bucket]++;
    });
    return c;
  }, [board, dateFilter, customRange]);

  const toggleExpand = (id) => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const copy = (text, label = 'Copied') => {
    navigator.clipboard.writeText(text).then(() => setToast({ msg: label })).catch(() => {});
  };

  const openWaReport = (o) => {
    const msg = buildWaReport(o);
    if (waNumber) {
      window.open(`https://wa.me/${waNumber.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
    } else {
      // Team number not configured: copy the report, then open the wa.link
      copy(msg, 'Report copied — paste it in WhatsApp');
      setTimeout(() => window.open('https://wa.link/fylf9t', '_blank'), 400);
    }
  };

  const takeAction = async (o, action, extra = {}) => {
    setActioning(o.awb);
    try {
      const r = await axios.post(`${API_URL}/ndr/action`, { awb: o.awb, action, ...extra }, { timeout: 60000 });
      setToast({ msg: r.data?.message || 'Done', err: !r.data?.success });
      if (r.data?.success) setReattemptFor(null);
    } catch (e) {
      setToast({ msg: e.response?.data?.message || e.response?.data?.error || e.message, err: true });
    } finally { setActioning(null); }
  };

  const bucketMeta = BUCKETS.find(b => b.id === bucket);

  return (
    <div className="max-w-[1200px] mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black text-white tracking-wide">Shipment Board</h1>
          <p className="text-[11px] text-[rgba(245,245,245,0.35)]">
            {bucketMeta?.desc} · {board?.generatedAt ? `updated ${fmtDT(board.generatedAt)}` : 'loading...'}
            {board?.cached ? ' (cached)' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowWaSettings(true)} className="glass-icon-btn" title="WhatsApp report settings"><Settings size={14} /></button>
          <button onClick={() => fetchBoard(true)} disabled={loading} className="glass-btn px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Status pills */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        {BUCKETS.map(b => (
          <button key={b.id} onClick={() => setBucket(b.id)}
            className={`px-4 py-2 rounded-2xl text-[11px] font-black uppercase tracking-wider border transition-all ${
              bucket === b.id ? '' : 'opacity-45 hover:opacity-80'
            }`}
            style={{
              background: bucket === b.id ? `${b.color}1a` : 'rgba(255,255,255,0.03)',
              borderColor: bucket === b.id ? `${b.color}55` : 'rgba(255,255,255,0.07)',
              color: bucket === b.id ? b.color : 'rgba(245,245,245,0.7)',
            }}>
            {b.label} <span className="ml-1 font-mono">{counts[b.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Date filter + sort + search */}
      <div className="flex items-center gap-2 flex-wrap mb-5">
        {DATE_FILTERS.map(f => (
          <button key={f.id} onClick={() => { setDateFilter(f.id); setCustomRange([null, null]); }}
            className={`glass-pill text-[11px] font-bold tracking-wider cursor-pointer transition-all ${
              dateFilter === f.id ? 'glass-pill-active' : 'text-[rgba(245,245,245,0.35)] hover:text-[rgba(245,245,245,0.6)]'
            }`}>
            {f.label}
          </button>
        ))}
        {/* Custom single date or date window */}
        <div className={`glass-pill flex items-center gap-1.5 ${dateFilter === 'custom' ? 'glass-pill-active' : 'text-[rgba(245,245,245,0.35)]'}`}>
          <Calendar size={10} className="shrink-0" />
          <DatePicker
            selectsRange
            startDate={customRange[0]}
            endDate={customRange[1]}
            maxDate={new Date()}
            onChange={(update) => {
              setCustomRange(update);
              if (update?.[0]) setDateFilter('custom');
            }}
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

      {/* Loading */}
      {loading && !board && (
        <div className="flex flex-col items-center py-20 text-[rgba(245,245,245,0.35)]">
          <RefreshCw size={28} className="animate-spin mb-3 text-[#e3cfd8]" />
          <span className="text-xs">Syncing store orders + live tracking from iThink...</span>
          <span className="text-[10px] mt-1 opacity-60">first load can take up to a minute</span>
        </div>
      )}

      {/* Empty */}
      {!loading && visible.length === 0 && (
        <div className="flex flex-col items-center py-20 opacity-30">
          <Package size={40} />
          <span className="mt-3 text-sm">Nothing in {bucketMeta?.label} for this period</span>
        </div>
      )}

      {/* Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {visible.map(o => {
          const isOpen = expanded.has(o.shopifyId);
          const color = BUCKETS.find(b => b.id === o.bucket)?.color || '#e3cfd8';
          const isNdr = o.bucket === 'ndr';
          return (
            <div key={o.shopifyId} className="glass-card overflow-hidden" style={{ borderLeft: `3px solid ${color}66` }}>
              {/* ── Card header: order + status ── */}
              <div className="p-4 pb-3">
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

                {/* ── Dates strip: ORDER / NDR / RTO dates, clearly labeled ── */}
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

                {/* ── NDR reason banner ── */}
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

                {/* RTO reason line */}
                {o.bucket === 'rto' && (o.ndrRemark || o.ndrReason) && (
                  <div className="mt-3 rounded-xl px-3 py-2 bg-[rgba(251,146,60,0.07)] border border-[rgba(251,146,60,0.18)] text-[10px] text-orange-300 flex items-center gap-1.5">
                    <RotateCcw size={10} /> {o.ndrReason || o.ndrRemark}
                  </div>
                )}

                {/* ── Customer block ── */}
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

                {/* ── Products ── */}
                <div className="mt-3 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)] divide-y divide-[rgba(255,255,255,0.04)]">
                  {(o.products || []).slice(0, isOpen ? 99 : 2).map((p, i) => (
                    <div key={i} className="px-3 py-1.5 flex items-center justify-between gap-2 text-[10px]">
                      <span className="text-[rgba(245,245,245,0.7)] truncate">{p.name}{p.qty > 1 ? ` ×${p.qty}` : ''}</span>
                      <span className="text-[rgba(245,245,245,0.4)] font-mono shrink-0">₹{p.price}</span>
                    </div>
                  ))}
                  {o.products?.length > 2 && !isOpen && (
                    <button onClick={() => toggleExpand(o.shopifyId)} className="w-full px-3 py-1 text-[9px] text-[rgba(245,245,245,0.35)] hover:text-white">
                      +{o.products.length - 2} more items
                    </button>
                  )}
                  <div className="px-3 py-1.5 flex items-center justify-between text-[10px] font-bold">
                    <span className="text-[rgba(245,245,245,0.5)] uppercase tracking-wider text-[9px]">Total</span>
                    <span className="text-white font-mono flex items-center"><IndianRupee size={9} />{o.totalAmount}</span>
                  </div>
                </div>
              </div>

              {/* ── Actions (NDR bucket) ── */}
              {isNdr && o.awb && (
                <div className="px-4 pb-4 pt-1 space-y-2">
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => { setReattemptFor(reattemptFor === o.awb ? null : o.awb); setReattemptDate(''); setReattemptPhone(''); }}
                      className="glass-btn-accent px-3.5 py-2 rounded-xl text-[10px] font-bold flex items-center gap-1.5 flex-1 justify-center">
                      <Truck size={11} /> Re-Attempt Delivery
                    </button>
                    <button onClick={() => { if (confirm(`Mark ${o.orderNumber} (AWB ${o.awb}) for RTO — return to origin?`)) takeAction(o, 'rto', { remark: 'Customer unreachable / delivery failed — RTO from GRLHOOD NDR dashboard' }); }}
                      disabled={actioning === o.awb}
                      className="glass-btn px-3.5 py-2 rounded-xl text-[10px] font-bold flex items-center gap-1.5 text-orange-400 border-orange-400/20">
                      {actioning === o.awb ? <RefreshCw size={11} className="animate-spin" /> : <RotateCcw size={11} />} RTO
                    </button>
                    <button onClick={() => openWaReport(o)}
                      className="glass-btn px-3.5 py-2 rounded-xl text-[10px] font-bold flex items-center gap-1.5 text-[#25D366] border-[#25D366]/20">
                      <Send size={11} /> Report on WhatsApp
                    </button>
                  </div>

                  {/* Reattempt inline form */}
                  {reattemptFor === o.awb && (
                    <div className="rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] p-3 space-y-2">
                      <div className="text-[9px] uppercase font-bold tracking-wider text-[rgba(245,245,245,0.4)]">Schedule re-attempt</div>
                      <div className="flex gap-2 flex-wrap">
                        <input type="date" value={reattemptDate} onChange={e => setReattemptDate(e.target.value)}
                          min={new Date(Date.now() + 864e5).toISOString().slice(0, 10)}
                          className="glass-input text-[10px] px-2.5 py-1.5 rounded-lg" />
                        <input type="tel" placeholder="New phone (optional)" value={reattemptPhone} onChange={e => setReattemptPhone(e.target.value)}
                          className="glass-input text-[10px] px-2.5 py-1.5 rounded-lg w-36" />
                        <button onClick={() => takeAction(o, 'reattempt', { date: reattemptDate || undefined, phone: reattemptPhone || undefined })}
                          disabled={actioning === o.awb}
                          className="glass-btn-accent px-3.5 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5">
                          {actioning === o.awb ? <RefreshCw size={10} className="animate-spin" /> : <CheckCircle size={10} />} Confirm
                        </button>
                        <button onClick={() => setReattemptFor(null)} className="glass-btn px-2.5 py-1.5 rounded-lg text-[10px]"><X size={10} /></button>
                      </div>
                      <p className="text-[9px] text-[rgba(245,245,245,0.3)]">Defaults to tomorrow if no date picked. Phone updates the courier's contact number for the attempt.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Delivered footer */}
              {o.bucket === 'delivered' && (
                <div className="px-4 pb-3 flex items-center gap-1.5 text-[10px] text-emerald-400">
                  <CheckCircle size={11} /> Delivered {fmtDT(o.statusDateTime)}{o.attemptCount > 1 ? ` · took ${o.attemptCount} attempts` : ''}
                </div>
              )}

              {/* Ready warning */}
              {o.bucket === 'ready' && (() => {
                const age = (istNow() - relevantDate(o)) / 864e5;
                return age > 2 ? (
                  <div className="px-4 pb-3 flex items-center gap-1.5 text-[10px] text-amber-400">
                    <AlertTriangle size={11} /> Not picked up for {Math.floor(age)} days — chase the courier
                  </div>
                ) : null;
              })()}
            </div>
          );
        })}
      </div>

      {/* WhatsApp settings modal */}
      {showWaSettings && (
        <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowWaSettings(false)}>
          <div className="glass-card p-5 w-full max-w-sm space-y-3" onClick={e => e.stopPropagation()}>
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
        <div className={`fixed bottom-8 right-8 z-[300] px-5 py-3 rounded-2xl shadow-2xl border backdrop-blur-xl bg-[rgba(26,26,30,0.92)] border-[rgba(227,207,216,0.2)] text-sm font-bold ${toast.err ? 'text-[#ff1493]' : 'text-white'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
