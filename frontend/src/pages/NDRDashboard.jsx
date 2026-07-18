import React, { useState, useEffect, useMemo, useCallback, useDeferredValue, useRef } from 'react';
import axios from 'axios';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package, RefreshCw, Truck, CheckCircle, AlertTriangle, RotateCcw,
  Phone, MessageSquare, MapPin, Calendar, Copy, ExternalLink, Search,
  Send, X, Settings, LayoutDashboard, Zap, TrendingDown,
  ChevronDown, ArrowDownUp, Image as ImageIcon, Download, Upload, Check, FileText, IndianRupee
} from 'lucide-react';
import { relevantDate, istNow, inDateFilter, sortByDate, parseDate } from '../utils/boardDates';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/* Logo as a dark dataURL for the white PDF (the app logo is white, so recolor
   its shape to ink while keeping transparency). */
let _logoData = null;
const getLogoData = async () => {
  if (_logoData) return _logoData;
  try {
    const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = '/logo.png'; });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    ctx.globalCompositeOperation = 'source-in'; // fill the logo shape with ink
    ctx.fillStyle = '#1b1b1f';
    ctx.fillRect(0, 0, c.width, c.height);
    _logoData = c.toDataURL('image/png');
  } catch { _logoData = null; }
  return _logoData;
};

/* Clean, aesthetic NDR/RTO report PDF with the GRLHOOD logo. */
const downloadReportPdf = async (orders) => {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const pink = [194, 73, 127];
  const ink = [27, 27, 31];
  const grey = [151, 148, 158];

  // Logo (centered, dark version on white)
  const logo = await getLogoData();
  if (logo) {
    try {
      const props = doc.getImageProperties(logo);
      const w = 120, h = (props.height / props.width) * w;
      doc.addImage(logo, 'PNG', (W - w) / 2, 42, w, h);
    } catch {}
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...ink);
  doc.text('NDR / RTO Report', W / 2, 118, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...grey);
  const when = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  doc.text(`${orders.length} order${orders.length !== 1 ? 's' : ''} · Generated ${when} IST`, W / 2, 134, { align: 'center' });

  const fmtd = (v) => { if (!v) return '—'; const d = parseDate(v); return d.getTime() === 0 ? String(v) : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
  const rows = orders.map(o => {
    const isRto = o.bucket === 'rto';
    return [
      o.orderNumber || '—',
      o.awb || '—',
      isRto ? 'RTO' : 'NDR',
      o.ndrReason || o.ndrRemark || '—',
      fmtd(isRto ? (o.rtoInitiatedAt || o.statusDateTime) : (o.ndrDate || o.statusDateTime)),
      String(o.attemptCount || 0),
    ];
  });

  autoTable(doc, {
    startY: 158,
    head: [['Order ID', 'AWB', 'Type', 'Reason', 'Date', 'Attempts']],
    body: rows,
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 7, textColor: ink, lineColor: [236, 234, 239], lineWidth: 0.5 },
    headStyles: { fontStyle: 'bold', fontSize: 8.5, textColor: [255, 255, 255], fillColor: pink, cellPadding: 8 },
    alternateRowStyles: { fillColor: [250, 249, 251] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 66 },
      1: { cellWidth: 92, font: 'courier', fontSize: 8.5 },
      2: { cellWidth: 40, halign: 'center', fontStyle: 'bold' },
      3: { cellWidth: 'auto' },
      4: { cellWidth: 82 },
      5: { cellWidth: 52, halign: 'center' },
    },
    margin: { left: 36, right: 36 },
    didParseCell: (d) => { if (d.section === 'body' && d.column.index === 2) d.cell.styles.textColor = pink; },
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight();
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...grey);
      doc.text('GRLHOOD® — NDR Management', 36, h - 22);
      doc.text('grlhood-dashboard.vercel.app', W - 36, h - 22, { align: 'right' });
    },
  });

  doc.save(`GRLHOOD NDR-RTO Report ${new Date().toISOString().slice(0, 10)}.pdf`);
};

const API_BASE = import.meta.env.VITE_API_URL || '';
const API_URL = API_BASE ? `${API_BASE}/api` : '/api';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'orders', label: 'Orders' },
  { id: 'ready', label: 'Ready' },
  { id: 'manifested', label: 'Manifested' },
  { id: 'transit', label: 'Transit' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'ndr', label: 'NDR' },
  { id: 'rto', label: 'RTO' },
  { id: 'requested', label: 'Action Requested' },
];

const DATE_FILTERS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: '7 Days' },
  { id: '30d', label: '30 Days' },
];

const PAGE_SIZE = 24;

// Live-pipeline tabs show EVERY order currently in that state — date filters
// don't apply to them (only to event tabs: orders/delivered/ndr/rto).
const ALWAYS_ALL = ['ready', 'manifested', 'transit'];

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

const STATUS_LABEL = { orders: 'Not Shipped', ready: 'AWB Assigned' };

/* Horizontal scroll row with edge fades: right fade while more content exists,
   left fade only appears once scrolled. */
function ScrollRow({ children }) {
  const ref = useRef(null);
  const [fade, setFade] = useState({ l: false, r: false });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const update = () => setFade({ l: el.scrollLeft > 6, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 6 });
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { el.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, []);
  const mask = `linear-gradient(to right, ${fade.l ? 'transparent 0, black 30px' : 'black 0'}, black calc(100% - ${fade.r ? '30px' : '0px'}), ${fade.r ? 'transparent 100%' : 'black 100%'})`;
  return <div ref={ref} className="scroll-row" style={{ maskImage: mask, WebkitMaskImage: mask }}>{children}</div>;
}

/* Filter controls — top-level component so the calendar never remounts
   (in-component definition caused the month-jump / jitter bug). */
const FilterRow = React.memo(function FilterRow({ dateFilter, setDateFilter, customRange, setCustomRange, sortDesc, setSortDesc, search, setSearch }) {
  return (
    <div className="mb-6"><ScrollRow>
      {DATE_FILTERS.map(f => (
        <button key={f.id}
          onClick={() => { setDateFilter(f.id); setCustomRange([null, null]); }}
          className={`pill ${dateFilter === f.id ? 'on' : ''}`}>
          {f.label}
        </button>
      ))}
      <div className={`pill ${dateFilter === 'custom' ? 'on' : ''}`}>
        <Calendar size={11} className="shrink-0" />
        <DatePicker
          selectsRange
          startDate={customRange[0]}
          endDate={customRange[1]}
          maxDate={new Date()}
          onChange={(u) => { setCustomRange(u); if (u?.[0]) setDateFilter('custom'); }}
          dateFormat="d MMM"
          placeholderText="Pick dates"
          className="bg-transparent outline-none w-[96px] cursor-pointer text-[11px] font-semibold text-center"
        />
        {customRange[0] && (
          <button onClick={() => { setCustomRange([null, null]); setDateFilter('7d'); }}
            className="bg-transparent border-none cursor-pointer p-0 flex"><X size={11} /></button>
        )}
      </div>
      <button onClick={() => setSortDesc(!sortDesc)} className="pill">
        <ArrowDownUp size={11} /> {sortDesc ? 'Newest' : 'Oldest'}
      </button>
      <div className="relative">
        <Search size={12} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Order · AWB · phone"
          className="tinput !h-[30px] !pl-9 !pr-4 !text-[11px] w-44 sm:w-60" />
      </div>
    </ScrollRow></div>
  );
});

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i) => ({ opacity: 1, y: 0, transition: { duration: 0.3, delay: Math.min(i, 9) * 0.035, ease: [0.25, 0.46, 0.45, 0.94] } }),
  exit: { opacity: 0, y: 10, transition: { duration: 0.14 } },
};

/* ═══════════ Card v2 — zoned, not stacked. Desktop: identity rail | info | actions ═══════════ */
const BoardCard = React.memo(function BoardCard({ o, i, actionEntry, onAction, onWaReport, onToast, onSaveNote, onOpenChat, onUploadProof, selected, selectionMode, onLongPress, onTapSelect }) {
  const pressTimer = React.useRef(null);
  const didLongPress = React.useRef(false);
  const startPress = () => {
    didLongPress.current = false;
    pressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      if ('vibrate' in navigator) navigator.vibrate(35);
      onLongPress(o);
    }, 420);
  };
  const endPress = () => { if (pressTimer.current) clearTimeout(pressTimer.current); };
  const onCardClick = (e) => {
    if (didLongPress.current) { didLongPress.current = false; return; } // consume the click after a long-press
    if (!selectionMode) return;                                          // normal mode: inner controls act as usual
    if (e.target.closest('button, a, input, label, select')) return;    // don't hijack real controls
    onTapSelect(o);
  };
  const isNdr = o.bucket === 'ndr';
  const isRto = o.bucket === 'rto';
  const [open, setOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [date, setDate] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [noteText, setNoteText] = useState(o.note?.note || '');
  const [noteBusy, setNoteBusy] = useState(false);

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
    (o.bucket === 'manifested' || o.bucket === 'transit') && o.statusDateTime ? { label: 'Last Scan', value: fmtDT(o.statusDateTime) } :
    null;

  const age = (istNow() - relevantDate(o)) / 864e5;
  const stale = (o.bucket === 'ready' || o.bucket === 'manifested') && age > 2;

  return (
    <motion.article layout="position" custom={i} variants={fadeUp} initial="hidden" animate="visible" exit="exit"
      className="tcard"
      onPointerDown={startPress} onPointerUp={endPress} onPointerLeave={endPress} onPointerCancel={endPress}
      onClick={onCardClick}
      style={selected ? { outline: '2px solid var(--accent-deep)', outlineOffset: -2 } : (selectionMode ? { cursor: 'pointer' } : undefined)}>
      <div className="sm:grid sm:grid-cols-[190px_1fr] lg:grid-cols-[210px_1fr]">

        {/* ═ ZONE A · identity rail (left on desktop, top on mobile) ═ */}
        <div className="p-6 sm:border-r flex sm:flex-col items-start justify-between sm:justify-start gap-2 sm:gap-3 relative"
          style={{ borderColor: 'var(--line-2)', background: selected ? 'var(--accent-soft)' : 'var(--card-2)' }}>
          <div>
            <h3 className="t-display text-[20px] leading-none" style={{ color: 'var(--text)' }}>{o.orderNumber}</h3>
            <p className="t-sub text-[11px] mt-2" style={{ color: 'var(--text-2)' }}>{o.courier || '—'}</p>
          </div>
          <div className="text-right sm:text-left">
            <p className="t-head text-[12px] uppercase tracking-[0.06em] leading-none"
              style={{ color: isNdr || isRto ? 'var(--accent-deep)' : 'var(--text)' }}>
              {statusText}
            </p>
            {/* Recovered: had an NDR, now delivered — happy tag */}
            {o.bucket === 'delivered' && hadNdr(o) && (
              <span className="inline-flex items-center gap-1 mt-1.5 rounded-full px-2 py-0.5 whitespace-nowrap"
                style={{ background: 'rgba(52,211,153,0.15)' }}>
                <CheckCircle size={10} className="shrink-0" style={{ color: '#059669' }} />
                <span className="text-[9px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: '#059669' }}>Recovered · Delivered</span>
              </span>
            )}
            {o.statusDateTime && o.bucket !== 'orders' && o.bucket !== 'ready' && (
              <p className="t-sub text-[10px] mt-1.5 leading-snug" style={{ color: 'var(--text-2)' }}>
                {fmtDT(o.statusDateTime)}{o.scanLocation ? ` · ${o.scanLocation.split(',')[0]}` : ''}
              </p>
            )}
            <p className="t-display text-[21px] mt-2 tabular-nums leading-none" style={{ color: 'var(--text)' }}>₹{o.totalAmount}</p>
            <p className="t-sub text-[10px] mt-1.5" style={{ color: 'var(--text-2)' }}>{o.paymentMode}</p>
          </div>
        </div>

        {/* ═ ZONE B · info column ═ */}
        <div className="min-w-0">

          {/* dates — always together, one row */}
          <div className="zone px-6 py-4 flex items-center gap-2 flex-wrap">
            <span className="chip"><span className="l">Ordered</span><span className="v">{fmtD(o.orderDate)}</span></span>
            {eventChip && (
              <span className={`chip ${eventChip.pink ? 'pink' : ''}`}>
                <span className="l">{eventChip.label}</span><span className="v">{eventChip.value}</span>
              </span>
            )}
            {o.edd && o.bucket !== 'delivered' && o.bucket !== 'rto' && (
              <span className="chip"><span className="l">EDD</span><span className="v">{fmtD(o.edd)}</span></span>
            )}
            {o.attemptCount > 0 && (isNdr || o.bucket === 'delivered') && (
              <span className="chip"><span className="l">Attempts</span><span className="v">{o.attemptCount}</span></span>
            )}
          </div>

          {/* reason strip — flat, accent left border (no box-in-box) */}
          {(isNdr || (isRto && (o.ndrReason || o.ndrRemark))) && (
            <div className="zone px-6 py-4" style={{ borderLeft: '3px solid var(--accent-deep)', background: 'var(--accent-soft)' }}>
              <div className="flex items-start gap-2.5">
                {isNdr ? <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--accent-deep)' }} />
                       : <RotateCcw size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--accent-deep)' }} />}
                <div className="min-w-0">
                  <p className="t-head text-[13px] leading-snug" style={{ color: 'var(--accent-deep)' }}>
                    {o.ndrReason || o.ndrRemark || 'Delivery failed — reason not given'}
                  </p>
                  {o.ndrReason && o.ndrRemark && o.ndrRemark !== o.ndrReason && (
                    <p className="t-sub text-[11px] mt-1" style={{ color: 'var(--text-2)' }}>{o.ndrRemark}</p>
                  )}
                  {actionEntry && (
                    <span className="chip pink mt-2.5">
                      <CheckCircle size={10} style={{ color: 'var(--accent-deep)' }} />
                      <span className="v" style={{ color: 'var(--accent-deep)' }}>Re-attempt requested · {fmtD(actionEntry.ts)}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* customer — one calm line, contact on the right */}
          <div className="zone px-6 py-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="t-head text-[13px] truncate" style={{ color: 'var(--text)' }}>{o.customer?.name || 'Customer'}</p>
              <p className="t-sub text-[11px] mt-1 truncate" style={{ color: 'var(--text-2)' }}>
                {o.customer?.city}{o.customer?.state ? `, ${o.customer.state}` : ''} · <span className="tabular-nums">{o.customer?.pincode}</span>
              </p>
            </div>
            {o.customer?.phone && (
              <div className="flex gap-2 shrink-0 items-center">
                {o.proof && (
                  <button onClick={() => onOpenChat(o)} className="tbtn !h-9 !px-3.5 !text-[11px]" title="Customer Chat">
                    <ImageIcon size={13} /> Customer Chat
                  </button>
                )}
                <a href={`tel:+91${o.customer.phone}`} className="tbtn icon" title="Call"><Phone size={14} /></a>
                <a href={`https://wa.me/91${o.customer.phone}?text=${encodeURIComponent(`Hi ${o.customer?.name}, this is GRLHOOD! Regarding your order ${o.orderNumber} — the courier (${o.courier}) marked a delivery attempt${o.ndrReason ? ` ("${o.ndrReason}")` : ''}. Were you contacted for delivery? We want to get this to you ASAP!`)}`}
                  target="_blank" rel="noopener noreferrer" className="tbtn icon" title="WhatsApp"><MessageSquare size={14} /></a>
              </div>
            )}
          </div>

          {/* expand: full address · items · awb */}
          <div className="zone">
            <button onClick={() => setOpen(!open)}
              className="w-full flex items-center justify-between px-6 py-3.5 bg-transparent border-none cursor-pointer">
              <span className="t-sub text-[10px] uppercase tracking-[0.12em] font-bold" style={{ color: 'var(--text-2)' }}>
                {open ? 'Less' : `${o.products?.length || 0} item${(o.products?.length || 0) !== 1 ? 's' : ''}${o.awb ? ' · AWB' : ''} · full address`}
              </span>
              <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="flex">
                <ChevronDown size={14} style={{ color: 'var(--text-3)' }} />
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {open && (
                <motion.div key="d" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.24, ease: [0.25, 0.46, 0.45, 0.94] }} className="overflow-hidden">
                  <div className="px-6 pb-5 space-y-4">
                    <div>
                      <p className="t-sub text-[9px] uppercase tracking-[0.12em] font-bold mb-1.5" style={{ color: 'var(--text-3)' }}>Address</p>
                      <p className="t-sub text-[12px] leading-relaxed" style={{ color: 'var(--text-2)' }}>
                        {o.customer?.address}<br />{o.customer?.city}, {o.customer?.state} — <span className="tabular-nums" style={{ color: 'var(--text)' }}>{o.customer?.pincode}</span>
                      </p>
                      {o.customer?.phone && (
                        <button onClick={() => copy(o.customer.phone, 'Phone copied')}
                          className="mt-1.5 text-[12px] font-semibold tabular-nums flex items-center gap-1.5 bg-transparent border-none cursor-pointer p-0"
                          style={{ color: 'var(--accent-deep)' }}>
                          +91 {o.customer.phone} <Copy size={10} className="opacity-60" />
                        </button>
                      )}
                    </div>
                    <div>
                      <p className="t-sub text-[9px] uppercase tracking-[0.12em] font-bold mb-1.5" style={{ color: 'var(--text-3)' }}>Items</p>
                      {(o.products || []).map((p, pi) => (
                        <div key={pi} className="flex items-center justify-between gap-3 py-0.5">
                          <span className="t-sub text-[12px] truncate" style={{ color: 'var(--text)' }}>{p.name}{p.qty > 1 ? ` ×${p.qty}` : ''}</span>
                          <span className="t-sub text-[12px] tabular-nums shrink-0" style={{ color: 'var(--text-2)' }}>₹{p.price}</span>
                        </div>
                      ))}
                    </div>
                    {(o.bucket === 'ndr' || o.bucket === 'rto' || actionEntry) && (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="t-sub text-[9px] uppercase tracking-[0.12em] font-bold" style={{ color: 'var(--text-3)' }}>Customer Chat Proof</p>
                          <label className="tbtn !h-8 !px-3 !text-[11px] cursor-pointer">
                            <Upload size={12} /> {o.proof ? 'Replace' : 'Attach'}
                            <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onUploadProof(o, f); e.target.value=''; }} />
                          </label>
                        </div>
                        {o.proof && <button onClick={() => onOpenChat(o)} className="tbtn !h-8 w-full !text-[11px] mb-3"><ImageIcon size={12} /> View customer chat</button>}
                        <p className="t-sub text-[9px] uppercase tracking-[0.12em] font-bold mb-1.5" style={{ color: 'var(--text-3)' }}>Note</p>
                        <div className="flex gap-2">
                          <input value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Add a note — synced & reported"
                            className="tinput !h-9 !text-[12px] flex-1" maxLength={500} />
                          <button onClick={async () => { setNoteBusy(true); await onSaveNote(o, noteText); setNoteBusy(false); }}
                            disabled={noteBusy || !noteText.trim()} className="tbtn !h-9">
                            {noteBusy ? <RefreshCw size={12} className="animate-spin" /> : 'Save'}
                          </button>
                        </div>
                        {o.note?.ts && <p className="t-sub text-[10px] mt-1.5" style={{ color: 'var(--text-3)' }}>Last note by {o.note.author || '—'} · {fmtDT(o.note.ts)}</p>}
                      </div>
                    )}
                    {o.timeline?.length > 0 && (
                      <div>
                        <p className="t-sub text-[9px] uppercase tracking-[0.12em] font-bold mb-2" style={{ color: 'var(--text-3)' }}>Tracking history</p>
                        <div className="space-y-2.5">
                          {o.timeline.map((t, ti) => (
                            <div key={ti} className="flex gap-3">
                              <div className="flex flex-col items-center pt-1">
                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ti === 0 ? 'var(--accent-deep)' : 'var(--text-3)' }} />
                                {ti < o.timeline.length - 1 && <span className="w-px flex-1 mt-1" style={{ background: 'var(--line-2)' }} />}
                              </div>
                              <div className="min-w-0 pb-0.5">
                                <p className="t-head text-[11px] leading-none" style={{ color: ti === 0 ? 'var(--text)' : 'var(--text-2)' }}>
                                  {t.status}<span className="t-sub font-normal" style={{ color: 'var(--text-3)' }}> · {fmtDT(t.at)}</span>
                                </p>
                                {(t.location || t.remark) && (
                                  <p className="t-sub text-[10px] mt-1 leading-snug" style={{ color: 'var(--text-2)' }}>
                                    {[t.location, t.remark].filter(Boolean).join(' — ')}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {o.awb && (
                      <div className="flex items-center justify-between gap-3">
                        <button onClick={() => copy(o.awb, 'AWB copied')}
                          className="text-[12px] font-semibold tabular-nums flex items-center gap-1.5 bg-transparent border-none cursor-pointer p-0"
                          style={{ color: 'var(--text)' }}>
                          AWB {o.awb} <Copy size={10} style={{ color: 'var(--text-3)' }} />
                        </button>
                        {o.trackingUrl && (
                          <a href={o.trackingUrl} target="_blank" rel="noopener noreferrer" className="tbtn !h-8 !px-4 text-[11px]">
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

          {/* actions / footers */}
          {isNdr && o.awb && (
            <div className="zone px-6 py-4 space-y-3">
              <div className="flex gap-2.5">
                <button onClick={() => { setShowForm(!showForm); setDate(''); setPhone(''); }} className="tbtn accent big flex-1">
                  <Truck size={14} /> Re-Attempt
                </button>
                <button onClick={() => onWaReport(o)} className="tbtn big flex-1"><Send size={14} /> Report</button>
              </div>
              <AnimatePresence>
                {showForm && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }} className="overflow-hidden">
                    <div className="pt-1 flex gap-2 flex-wrap items-center">
                      <input type="date" value={date} onChange={e => setDate(e.target.value)}
                        min={new Date(Date.now() + 864e5).toISOString().slice(0, 10)} className="tinput !h-9 text-[12px]" />
                      <input type="tel" placeholder="New phone (optional)" value={phone} onChange={e => setPhone(e.target.value)}
                        className="tinput !h-9 text-[12px] w-40" />
                      <button onClick={submitReattempt} disabled={busy} className="tbtn accent !h-9">
                        {busy ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle size={12} />} Confirm
                      </button>
                      <button onClick={() => setShowForm(false)} className="tbtn icon !h-9 !w-9"><X size={12} /></button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
          {stale && (
            <div className="zone px-6 py-3.5">
              <p className="t-sub text-[11px] font-semibold flex items-center gap-1.5" style={{ color: 'var(--accent-deep)' }}>
                <AlertTriangle size={12} /> {o.bucket === 'manifested' ? 'Not picked up' : 'Not manifested'} for {Math.floor(age)} days — chase the courier
              </p>
            </div>
          )}
        </div>
      </div>
    </motion.article>
  );
});

/* ═══════════ Overview ═══════════ */
const hadNdr = (o) => !!(o.ndrDate && parseDate(o.ndrDate).getTime() > 0);
const wentRto = (o) => o.bucket === 'rto' || !!(o.rtoInitiatedAt && parseDate(o.rtoInitiatedAt).getTime() > 0);

function Overview({ allOrders, onJump }) {
  const now = istNow();
  // Overview has its OWN date filter — independent from the tab date filter.
  const [ovFilter, setOvFilter] = useState('30d');
  const [ovRange, setOvRange] = useState([null, null]);
  const [remit, setRemit] = useState(null);
  const [openRemit, setOpenRemit] = useState(null);
  const [openYet, setOpenYet] = useState(false);

  useEffect(() => {
    axios.get(`${API_URL}/ndr/remittances?days=60`, { timeout: 120000 }).then(r => setRemit(r.data)).catch(() => {});
  }, []);

  // COD money lifecycle: cross-reference board orders with the remittance
  // order list to split COD into settled / unsettled / to-collect.
  // Uses the ACTUAL COD amount to collect (codAmount) and respects the
  // Overview date filter.
  const codPipeline = useMemo(() => {
    if (!remit) return null;
    const norm = (s) => String(s || '').replace('#', '').trim().toUpperCase();
    const settledNos = new Set();
    (remit.remittances || []).forEach(r => (r.orders || []).forEach(o => settledNos.add(norm(o.orderNo))));
    const scope = allOrders.filter(o => inDateFilter(o, ovFilter, ovRange));
    const cod = scope.filter(o => o.isCod);
    const codVal = (o) => (o.codAmount != null ? o.codAmount : o.totalAmount) || 0;
    const delivered = cod.filter(o => o.bucket === 'delivered');
    const settled = delivered.filter(o => settledNos.has(norm(o.orderNumber)));
    const yetToSettle = delivered.filter(o => !settledNos.has(norm(o.orderNumber)));
    const inPipeline = cod.filter(o => ['ready', 'manifested', 'transit'].includes(o.bucket)); // not collected yet
    const sum = (arr) => arr.reduce((s, o) => s + codVal(o), 0);
    return {
      settledAmount: remit.totals?.codRemitted || sum(settled),
      settledCount: remit.totals?.orders || settled.length,
      yetAmount: sum(yetToSettle), yetCount: yetToSettle.length, yetOrders: yetToSettle,
      unsettledAmount: sum(inPipeline), unsettledCount: inPipeline.length,
    };
  }, [remit, allOrders, ovFilter, ovRange]);

  const stats = useMemo(() => {
    // analytical set respects the Overview date filter (by event date)
    const orders = allOrders.filter(o => inDateFilter(o, ovFilter, ovRange));
    const shipped = orders.filter(o => o.awb);
    const by = (b) => orders.filter(o => o.bucket === b);
    const rto = by('rto'), delivered = by('delivered'), transit = by('transit'), ready = by('ready'), manifested = by('manifested');

    // ACCURATE rates: count every shipment that EVER had an NDR / went RTO
    // (an order that failed then delivered still counts as an NDR), using the
    // event dates extracted from the full scan history.
    const everNdr = shipped.filter(hadNdr);
    const everRto = shipped.filter(wentRto);
    const closed = delivered.length + everRto.length;

    // Manage Today comes from the FULL board (always current, filter-independent)
    const openNdr = allOrders.filter(o => o.bucket === 'ndr');
    const newNdr48 = allOrders.filter(o => hadNdr(o) && (now - parseDate(o.ndrDate)) <= 48 * 3600e3);
    const newRto48 = allOrders.filter(o => o.rtoInitiatedAt && parseDate(o.rtoInitiatedAt).getTime() > 0 && (now - parseDate(o.rtoInitiatedAt)) <= 48 * 3600e3);

    const couriers = {};
    shipped.forEach(o => {
      const c = o.courier || 'Unassigned';
      if (!couriers[c]) couriers[c] = { name: c, shipped: 0, delivered: 0, transit: 0, ndr: 0, rto: 0 };
      couriers[c].shipped++;
      if (o.bucket === 'delivered') couriers[c].delivered++;
      if (o.bucket === 'transit') couriers[c].transit++;
      if (hadNdr(o)) couriers[c].ndr++;
      if (wentRto(o)) couriers[c].rto++;
    });
    const reasons = {};
    everNdr.forEach(o => { const r = (o.ndrScanReason || o.ndrReason || o.ndrRemark || 'Unknown').slice(0, 60); reasons[r] = (reasons[r] || 0) + 1; });

    const ndrRate = shipped.length ? (everNdr.length / shipped.length) * 100 : 0;
    const rtoRate = closed ? (everRto.length / closed) * 100 : 0;

    // ── Warning system (all from the FULL board, always current) ──
    const days = (v) => (now - parseDate(v)) / 864e5;
    const agingNdr = openNdr.filter(o => !o.requested && o.ndrDate && days(o.ndrDate) > 3);
    const stuckPickup = allOrders.filter(o => ['ready', 'manifested'].includes(o.bucket) && days(o.orderDate) > 2);
    const staleTransit = allOrders.filter(o => o.bucket === 'transit' && days(o.statusDateTime) > 7);
    const warnings = [];
    if (agingNdr.length) warnings.push({ level: 'high', text: `${agingNdr.length} NDR${agingNdr.length > 1 ? 's' : ''} open 3+ days with no re-attempt`, tab: 'ndr' });
    if (stuckPickup.length) warnings.push({ level: 'high', text: `${stuckPickup.length} order${stuckPickup.length > 1 ? 's' : ''} not picked up for 2+ days`, tab: 'manifested' });
    if (staleTransit.length) warnings.push({ level: 'mid', text: `${staleTransit.length} shipment${staleTransit.length > 1 ? 's' : ''} stuck in transit 7+ days`, tab: 'transit' });
    if (rtoRate > 10) warnings.push({ level: 'high', text: `RTO rate is ${rtoRate.toFixed(1)}% — above the 10% threshold` });
    if (ndrRate > 15) warnings.push({ level: 'mid', text: `NDR rate is ${ndrRate.toFixed(1)}% — running high` });

    return {
      shippedCount: shipped.length,
      delivered, transit, ready, manifested,
      rtoCount: everRto.length, ndrCount: everNdr.length,
      openNdr, newNdr48, newRto48, warnings,
      ndrRate, rtoRate,
      couriers: Object.values(couriers).sort((a, b) => b.shipped - a.shipped),
      reasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]),
    };
  }, [allOrders, ovFilter, ovRange, now]);

  const Tile = ({ label, value, sub, accent, onClick, i = 0 }) => (
    <motion.button custom={i} variants={fadeUp} initial="hidden" animate="visible" exit="exit"
      onClick={onClick} disabled={!onClick}
      className="tcard p-5 text-left w-full disabled:cursor-default border-none cursor-pointer">
      <p className="t-sub text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--text-2)' }}>{label}</p>
      <p className="t-display text-[26px] mt-2 tabular-nums leading-none" style={{ color: accent ? 'var(--accent-deep)' : 'var(--text)' }}>{value}</p>
      {sub && <p className="t-sub text-[10px] mt-2" style={{ color: 'var(--text-2)' }}>{sub}</p>}
    </motion.button>
  );
  const Bar = ({ pct }) => (
    <div className="h-1.5 rounded-full w-full overflow-hidden" style={{ background: 'var(--line-2)' }}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: 'var(--accent-deep)', opacity: 0.75 }} />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* ═ Warnings ═ */}
      {stats.warnings.length > 0 && (
        <motion.section variants={fadeUp} initial="hidden" animate="visible" exit="exit" className="tcard overflow-hidden"
          style={{ borderLeft: '4px solid #e11d48' }}>
          <div className="p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={15} style={{ color: '#e11d48' }} />
              <h3 className="t-display text-[15px]" style={{ color: 'var(--text)' }}>Needs Attention</h3>
              <span className="t-sub text-[11px]" style={{ color: 'var(--text-2)' }}>{stats.warnings.length} warning{stats.warnings.length > 1 ? 's' : ''}</span>
            </div>
            <div className="space-y-2">
              {stats.warnings.map((w, wi) => (
                <button key={wi} onClick={() => w.tab && onJump(w.tab)} disabled={!w.tab}
                  className="w-full flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left border-none cursor-pointer disabled:cursor-default"
                  style={{ background: w.level === 'high' ? 'rgba(225,29,72,0.08)' : 'rgba(245,158,11,0.1)' }}>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: w.level === 'high' ? '#e11d48' : '#f59e0b' }} />
                  <span className="t-head text-[12px] flex-1" style={{ color: w.level === 'high' ? '#e11d48' : '#b45309' }}>{w.text}</span>
                  {w.tab && <ChevronDown size={13} style={{ color: 'var(--text-3)', transform: 'rotate(-90deg)' }} />}
                </button>
              ))}
            </div>
          </div>
        </motion.section>
      )}

      <motion.section custom={0} variants={fadeUp} initial="hidden" animate="visible" exit="exit" className="tcard p-6 sm:p-7">
        <div className="flex items-center gap-2 mb-5">
          <Zap size={15} style={{ color: 'var(--accent-deep)' }} />
          <h3 className="t-display text-[15px]" style={{ color: 'var(--text)' }}>Manage Today</h3>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Tile i={1} label="Open NDRs" value={stats.openNdr.length} sub="need action now" accent onClick={() => onJump('ndr')} />
          <Tile i={2} label="New NDRs · 48h" value={stats.newNdr48.length} sub="fresh failed attempts" accent onClick={() => onJump('ndr')} />
          <Tile i={3} label="RTO · 48h" value={stats.newRto48.length} sub="just started returning" onClick={() => onJump('rto')} />
        </div>
        {stats.newNdr48.length > 0 && (
          <div className="mt-5">
            <p className="t-sub text-[9px] font-bold uppercase tracking-[0.12em] mb-2.5" style={{ color: 'var(--text-3)' }}>Fresh NDRs — start here</p>
            <div className="flex gap-2 flex-wrap">
              {stats.newNdr48.slice(0, 12).map(o => (
                <button key={o.awb} onClick={() => onJump('ndr')} className="pill !h-8 text-[11px]">
                  {o.orderNumber} · {(o.ndrReason || 'no reason').slice(0, 22)}
                </button>
              ))}
            </div>
          </div>
        )}
      </motion.section>

      {/* Overview's OWN date filter — independent of the tab date filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="t-sub text-[10px] font-bold uppercase tracking-[0.12em] mr-1" style={{ color: 'var(--text-3)' }}>Analytics period</span>
        {DATE_FILTERS.map(f => (
          <button key={f.id} onClick={() => { setOvFilter(f.id); setOvRange([null, null]); }}
            className={`pill ${ovFilter === f.id ? 'on' : ''}`}>{f.label}</button>
        ))}
        <div className={`pill ${ovFilter === 'custom' ? 'on' : ''}`}>
          <Calendar size={11} className="shrink-0" />
          <DatePicker selectsRange startDate={ovRange[0]} endDate={ovRange[1]} maxDate={new Date()}
            onChange={(u) => { setOvRange(u); if (u?.[0]) setOvFilter('custom'); }}
            dateFormat="d MMM" placeholderText="Pick dates"
            className="bg-transparent outline-none w-[92px] cursor-pointer text-[11px] font-semibold text-center" />
          {ovRange[0] && <button onClick={() => { setOvRange([null, null]); setOvFilter('30d'); }} className="bg-transparent border-none cursor-pointer p-0 flex"><X size={11} /></button>}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Tile i={1} label="Delivered" value={stats.delivered.length} />
        <Tile i={2} label="NDR Rate" value={`${stats.ndrRate.toFixed(1)}%`} sub={`${stats.ndrCount} of ${stats.shippedCount} shipped`} accent />
        <Tile i={3} label="RTO Rate" value={`${stats.rtoRate.toFixed(1)}%`} sub={`${stats.rtoCount} of ${stats.delivered.length + stats.rtoCount} closed`} accent />
        <Tile i={4} label="RTO Orders" value={stats.rtoCount} sub="returned / returning" accent onClick={() => onJump('rto')} />
        <Tile i={5} label="In Transit" value={stats.transit.length} onClick={() => onJump('transit')} />
      </div>

      <motion.section custom={2} variants={fadeUp} initial="hidden" animate="visible" exit="exit" className="tcard p-6 sm:p-7">
        <div className="flex items-center gap-2 mb-5">
          <Truck size={14} style={{ color: 'var(--text-2)' }} />
          <h3 className="t-display text-[15px]" style={{ color: 'var(--text)' }}>Courier Performance</h3>
        </div>
        <div className="space-y-5">
          {stats.couriers.map(c => {
            const ndrPct = c.shipped ? (c.ndr / c.shipped) * 100 : 0;
            const rtoPct = c.shipped ? (c.rto / c.shipped) * 100 : 0;
            return (
              <div key={c.name} className="grid sm:grid-cols-[130px_1fr] gap-3 items-center">
                <div>
                  <p className="t-head text-[13px]" style={{ color: 'var(--text)' }}>{c.name}</p>
                  <p className="t-sub text-[10px]" style={{ color: 'var(--text-2)' }}>{c.shipped} shipped</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-2 text-[11px]">
                  <p style={{ color: 'var(--text-2)' }}><span className="t-head" style={{ color: 'var(--text)' }}>{c.delivered}</span> delivered</p>
                  <p style={{ color: 'var(--text-2)' }}><span className="t-head" style={{ color: 'var(--text)' }}>{c.transit}</span> transit</p>
                  <div className="space-y-1">
                    <p style={{ color: 'var(--text-2)' }}><span className="t-head" style={{ color: 'var(--accent-deep)' }}>{c.ndr}</span> NDR ({ndrPct.toFixed(0)}%)</p>
                    <Bar pct={ndrPct} />
                  </div>
                  <div className="space-y-1">
                    <p style={{ color: 'var(--text-2)' }}><span className="t-head" style={{ color: 'var(--accent-deep)' }}>{c.rto}</span> RTO ({rtoPct.toFixed(0)}%)</p>
                    <Bar pct={rtoPct} />
                  </div>
                </div>
              </div>
            );
          })}
          {stats.couriers.length === 0 && <p className="t-sub text-[12px]" style={{ color: 'var(--text-2)' }}>No shipped orders in this window</p>}
        </div>
      </motion.section>

      {stats.reasons.length > 0 && (
        <motion.section custom={3} variants={fadeUp} initial="hidden" animate="visible" exit="exit" className="tcard p-6 sm:p-7">
          <div className="flex items-center gap-2 mb-5">
            <TrendingDown size={14} style={{ color: 'var(--accent-deep)' }} />
            <h3 className="t-display text-[15px]" style={{ color: 'var(--text)' }}>NDR Reasons</h3>
          </div>
          <div className="space-y-3">
            {stats.reasons.map(([reason, count]) => (
              <div key={reason} className="flex items-center gap-4">
                <p className="flex-1 t-sub text-[12px] truncate" style={{ color: 'var(--text)' }}>{reason}</p>
                <div className="w-28 sm:w-48"><Bar pct={(count / (stats.ndrCount || 1)) * 100} /></div>
                <p className="w-6 text-right t-head text-[12px] tabular-nums" style={{ color: 'var(--text)' }}>{count}</p>
              </div>
            ))}
          </div>
        </motion.section>
      )}

      {/* ═ Remittance (COD payouts from iThink) ═ */}
      <motion.section custom={4} variants={fadeUp} initial="hidden" animate="visible" exit="exit" className="tcard p-6 sm:p-7">
        <div className="flex items-center gap-2 mb-5">
          <IndianRupee size={14} style={{ color: 'var(--accent-deep)' }} />
          <h3 className="t-display text-[15px]" style={{ color: 'var(--text)' }}>COD Remittances</h3>
          {remit?.cached && <span className="t-sub text-[10px]" style={{ color: 'var(--text-3)' }}>cached</span>}
        </div>
        {!remit ? (
          <p className="t-sub text-[12px] flex items-center gap-2" style={{ color: 'var(--text-2)' }}>
            <RefreshCw size={12} className="animate-spin" /> Loading remittances…
          </p>
        ) : (remit.remittances || []).length === 0 ? (
          <p className="t-sub text-[12px]" style={{ color: 'var(--text-2)' }}>No COD remittances in the last {remit.days} days</p>
        ) : (
          <>
            {/* Headline: all COD still in the pipeline (in transit + ready + manifested) */}
            {codPipeline && (
              <div className="rounded-2xl p-5 mb-5 flex items-center justify-between gap-4" style={{ background: 'var(--accent-soft)' }}>
                <div>
                  <p className="t-sub text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--accent-deep)' }}>Total Remittance To Be Collected</p>
                  <p className="t-display text-[30px] mt-1.5 tabular-nums leading-none" style={{ color: 'var(--accent-deep)' }}>₹{Math.round(codPipeline.unsettledAmount).toLocaleString('en-IN')}</p>
                </div>
                <p className="t-sub text-[11px] text-right shrink-0" style={{ color: 'var(--accent-deep)' }}>{codPipeline.unsettledCount} COD orders<br /><span style={{ color: 'var(--text-2)' }}>in transit · ready · manifested</span></p>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="rounded-2xl p-4" style={{ background: 'var(--accent-soft)' }}>
                <p className="t-sub text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--accent-deep)' }}>COD Remitted</p>
                <p className="t-display text-[21px] mt-1.5 tabular-nums leading-none" style={{ color: 'var(--accent-deep)' }}>₹{Math.round(remit.totals.codRemitted).toLocaleString('en-IN')}</p>
                <p className="t-sub text-[10px] mt-1.5" style={{ color: 'var(--text-2)' }}>paid out · {remit.days}d</p>
              </div>
              <div className="rounded-2xl p-4" style={{ background: 'var(--card-2)' }}>
                <p className="t-sub text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--text-2)' }}>COD Generated</p>
                <p className="t-display text-[21px] mt-1.5 tabular-nums leading-none" style={{ color: 'var(--text)' }}>₹{Math.round(remit.totals.codGenerated).toLocaleString('en-IN')}</p>
                <p className="t-sub text-[10px] mt-1.5" style={{ color: 'var(--text-2)' }}>{remit.totals.orders} orders</p>
              </div>
              <div className="rounded-2xl p-4" style={{ background: 'var(--card-2)' }}>
                <p className="t-sub text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--text-2)' }}>Charges</p>
                <p className="t-display text-[21px] mt-1.5 tabular-nums leading-none" style={{ color: 'var(--text)' }}>₹{Math.round(remit.totals.charges).toLocaleString('en-IN')}</p>
                <p className="t-sub text-[10px] mt-1.5" style={{ color: 'var(--text-2)' }}>freight + GST</p>
              </div>
              <div className="rounded-2xl p-4" style={{ background: 'var(--card-2)' }}>
                <p className="t-sub text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--text-2)' }}>Last Payout</p>
                <p className="t-display text-[21px] mt-1.5 tabular-nums leading-none" style={{ color: 'var(--text)' }}>₹{Math.round(remit.lastPaid?.codRemitted || 0).toLocaleString('en-IN')}</p>
                <p className="t-sub text-[10px] mt-1.5" style={{ color: 'var(--text-2)' }}>{remit.lastPaid?.dateLabel || '—'}</p>
              </div>
            </div>
            {/* COD money lifecycle: settled / yet-to-settle / unsettled */}
            {codPipeline && (
              <div className="mb-6">
                <p className="t-sub text-[9px] font-bold uppercase tracking-[0.12em] mb-2.5" style={{ color: 'var(--text-3)' }}>COD settlement status</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-2xl p-4" style={{ background: 'var(--accent-soft)' }}>
                    <p className="t-sub text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--accent-deep)' }}>Settled</p>
                    <p className="t-display text-[20px] mt-1.5 tabular-nums leading-none" style={{ color: 'var(--accent-deep)' }}>₹{Math.round(codPipeline.settledAmount).toLocaleString('en-IN')}</p>
                    <p className="t-sub text-[10px] mt-1.5" style={{ color: 'var(--text-2)' }}>{codPipeline.settledCount} orders remitted</p>
                  </div>
                  <button onClick={() => setOpenYet(!openYet)} disabled={!codPipeline.yetCount}
                    className="rounded-2xl p-4 text-left border-none cursor-pointer disabled:cursor-default" style={{ background: 'var(--card-2)' }}>
                    <p className="t-sub text-[9px] font-bold uppercase tracking-[0.14em] flex items-center gap-1" style={{ color: 'var(--text-2)' }}>
                      Unsettled {codPipeline.yetCount > 0 && <ChevronDown size={10} style={{ transform: openYet ? 'rotate(180deg)' : 'none' }} />}
                    </p>
                    <p className="t-display text-[20px] mt-1.5 tabular-nums leading-none" style={{ color: 'var(--text)' }}>₹{Math.round(codPipeline.yetAmount).toLocaleString('en-IN')}</p>
                    <p className="t-sub text-[10px] mt-1.5" style={{ color: 'var(--text-2)' }}>{codPipeline.yetCount} collected · not settled to bank</p>
                  </button>
                  <div className="rounded-2xl p-4" style={{ background: 'var(--card-2)' }}>
                    <p className="t-sub text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--text-2)' }}>To Be Collected</p>
                    <p className="t-display text-[20px] mt-1.5 tabular-nums leading-none" style={{ color: 'var(--text)' }}>₹{Math.round(codPipeline.unsettledAmount).toLocaleString('en-IN')}</p>
                    <p className="t-sub text-[10px] mt-1.5" style={{ color: 'var(--text-2)' }}>{codPipeline.unsettledCount} in transit · not collected</p>
                  </div>
                </div>
                <AnimatePresence initial={false}>
                  {openYet && codPipeline.yetOrders.length > 0 && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22 }} className="overflow-hidden">
                      <div className="mt-3 rounded-lg overflow-hidden" style={{ background: 'var(--card-2)' }}>
                        <p className="t-sub text-[9px] font-bold uppercase tracking-[0.12em] px-3 pt-2.5 pb-1" style={{ color: 'var(--text-3)' }}>Delivered — COD collected, not yet settled to bank</p>
                        {codPipeline.yetOrders.map((o, oi) => (
                          <div key={oi} className="flex items-center justify-between px-3 py-1.5 text-[11px]" style={{ borderTop: '1px solid var(--line-2)' }}>
                            <div className="min-w-0">
                              <span className="t-head" style={{ color: 'var(--text)' }}>{o.orderNumber}</span>
                              <span className="t-sub ml-2" style={{ color: 'var(--text-3)' }}>{o.courier || ''} · del {fmtD(o.deliveredAt || o.statusDateTime)}</span>
                            </div>
                            <span className="tabular-nums font-semibold" style={{ color: 'var(--text)' }}>₹{Math.round(o.totalAmount).toLocaleString('en-IN')}</span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            <p className="t-sub text-[9px] font-bold uppercase tracking-[0.12em] mb-2.5" style={{ color: 'var(--text-3)' }}>Payout history — tap a payout for its orders</p>
            <div className="space-y-1.5">
              {remit.remittances.map(r => (
                <div key={r.id} className="rounded-xl overflow-hidden" style={{ background: 'var(--card-2)' }}>
                  <button onClick={() => setOpenRemit(openRemit === r.id ? null : r.id)}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 bg-transparent border-none cursor-pointer">
                    <div className="text-left">
                      <p className="t-head text-[12px]" style={{ color: 'var(--text)' }}>{r.dateLabel}</p>
                      <p className="t-sub text-[10px]" style={{ color: 'var(--text-2)' }}>
                        {r.orderCount} orders · #{r.id}{r.transactionCharges + r.transactionGst > 0 ? ` · charges ₹${Math.round(r.transactionCharges + r.transactionGst)}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="t-head text-[14px] tabular-nums" style={{ color: 'var(--accent-deep)' }}>₹{Math.round(r.codRemitted).toLocaleString('en-IN')}</p>
                      <motion.span animate={{ rotate: openRemit === r.id ? 180 : 0 }} transition={{ duration: 0.2 }} className="flex"><ChevronDown size={13} style={{ color: 'var(--text-3)' }} /></motion.span>
                    </div>
                  </button>
                  <AnimatePresence initial={false}>
                    {openRemit === r.id && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22 }} className="overflow-hidden">
                        <div className="px-3.5 pb-3.5 pt-1">
                          {/* full financial breakdown */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-1.5 mb-3 text-[11px]">
                            {[['COD generated', r.codGenerated], ['COD remitted', r.codRemitted], ['Freight charges', r.transactionCharges], ['GST', r.transactionGst], ['Bill adjusted', r.billAdjusted], ['Refund adjusted', r.refundAdjusted], ['Wallet', r.walletAmount], ['Advance hold', r.advanceHold]]
                              .filter(([, v]) => v).map(([k, v]) => (
                                <div key={k} className="flex justify-between"><span style={{ color: 'var(--text-2)' }}>{k}</span><span className="tabular-nums font-semibold" style={{ color: 'var(--text)' }}>₹{Math.round(v).toLocaleString('en-IN')}</span></div>
                              ))}
                          </div>
                          {r.orders?.length > 0 && (
                            <div className="rounded-lg overflow-hidden" style={{ background: 'var(--card)' }}>
                              {r.orders.map((o, oi) => (
                                <div key={oi} className="flex items-center justify-between px-3 py-1.5 text-[11px]" style={{ borderTop: oi ? '1px solid var(--line-2)' : 'none' }}>
                                  <div className="min-w-0">
                                    <span className="t-head" style={{ color: 'var(--text)' }}>{o.orderNo}</span>
                                    <span className="t-sub ml-2" style={{ color: 'var(--text-3)' }}>{o.deliveredDate ? `del ${fmtD(o.deliveredDate)}` : ''}</span>
                                  </div>
                                  <span className="tabular-nums font-semibold" style={{ color: 'var(--accent-deep)' }}>₹{Math.round(o.amount).toLocaleString('en-IN')}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </>
        )}
      </motion.section>
    </div>
  );
}

/* ═══════════ Main page ═══════════ */
const REMINDERS_10 = [
  'Morning check ☀️ — any fresh NDRs waiting? Customers are up, perfect time to call.',
  'Hey, did you peek at the NDR board yet? New failed attempts land overnight 👀',
  'Quick one — open NDRs and RTOs need eyes before couriers head out 🚚',
  'Start strong: clear the Action Required list before lunch 💪',
];
const REMINDERS_15 = [
  'Afternoon sweep 🕒 — re-attempts confirmed? RTOs challenged?',
  'Did you follow up on this morning\'s NDRs? Couriers still have time today ⏳',
  'Last good window to save today\'s deliveries — check the board 📦',
  'Any fake delivery attempts caught today? Verify with customers now 📞',
];

/** Agent reminders: 10AM & 15PM IST, varied daily, GRLHOOD® branded. */
function useAgentReminders(enabled) {
  useEffect(() => {
    if (!enabled || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const tick = () => {
      const now = istNow();
      const slot = now.getHours() === 10 ? '10' : now.getHours() === 15 ? '15' : null;
      if (!slot) return;
      const key = `ndr_notif_${slot}_${now.toDateString()}`;
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
      const list = slot === '10' ? REMINDERS_10 : REMINDERS_15;
      const body = list[now.getDate() % list.length];
      try {
        const n = new Notification('GRLHOOD®', { body, icon: '/logo.png', badge: '/logo.png', tag: `grl-${slot}` });
        n.onclick = () => { window.focus(); n.close(); };
      } catch {}
    };
    tick();
    const iv = setInterval(tick, 60 * 1000);
    return () => clearInterval(iv);
  }, [enabled]);
}

export default function NDRDashboard() {
  const authUser = useMemo(() => { try { return JSON.parse(localStorage.getItem('grlhood_user') || '{}'); } catch { return {}; } }, []);
  const isAgent = authUser.role === 'ndr-agent';
  const [showWelcome, setShowWelcome] = useState(() => isAgent && !localStorage.getItem('ndr_welcomed_v1'));
  useAgentReminders(isAgent);

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
    // Pipeline tabs ignore the date filter and show the full live set
    const source = ALWAYS_ALL.includes(tab) ? (board?.orders || []) : dateFiltered;
    const filtered = source
      .filter(o => {
        if (tab === 'overview') return true;
        if (tab === 'requested') return !!o.requested;   // reattempt already requested
        // NDR tab: EVERY order that ever had an NDR in this timeline — current
        // NDRs + ones since delivered (happy tag) + ones now RTO. Requested
        // ones stay here too (with a pill) and also appear in Action Requested.
        if (tab === 'ndr') return hadNdr(o);
        return o.bucket === tab;
        return o.bucket === tab;
      })
      .filter(o => !s ||
        o.orderNumber?.toLowerCase().includes(s) ||
        o.awb?.includes(s) ||
        o.customer?.phone?.includes(s) ||
        o.customer?.name?.toLowerCase().includes(s));
    return sortByDate(filtered, sortDesc);
  }, [dateFiltered, board, tab, deferredSearch, sortDesc]);

  const counts = useMemo(() => {
    const c = { overview: null, orders: 0, ready: 0, manifested: 0, transit: 0, delivered: 0, ndr: 0, rto: 0, requested: 0 };
    dateFiltered.forEach(o => {
      if (o.requested) c.requested++;                    // Action Requested tab
      if (hadNdr(o)) c.ndr++;                             // NDR tab = every order that ever had an NDR
      if (o.bucket !== 'ndr' && c[o.bucket] !== undefined && !ALWAYS_ALL.includes(o.bucket)) c[o.bucket]++;
    });
    (board?.orders || []).forEach(o => { if (ALWAYS_ALL.includes(o.bucket)) c[o.bucket]++; });
    return c;
  }, [dateFiltered, board]);

  const [chatOrder, setChatOrder] = useState(null); // order whose proof is open in the viewer
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [pdfBusy, setPdfBusy] = useState(false);
  const handleToast = useCallback((t) => setToast(t), []);
  const toggleSelect = useCallback((o) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(o.shopifyId) ? n.delete(o.shopifyId) : n.add(o.shopifyId); return n; });
  }, []);
  const handleLongPress = useCallback((o) => {
    setSelectedIds(prev => { const n = new Set(prev); n.add(o.shopifyId); return n; });
  }, []);
  // clear selection when leaving a tab
  useEffect(() => { setSelectedIds(new Set()); }, [tab]);
  const handleOpenChat = useCallback((o) => setChatOrder(o), []);
  const handleUploadProof = useCallback(async (o, file) => {
    if (file.size > 4 * 1024 * 1024) { setToast({ msg: 'Image too large (max 4MB)', err: true }); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const author = (JSON.parse(localStorage.getItem('grlhood_user') || '{}').username) || '';
        const r = await axios.post(`${API_URL}/ndr/proof`, { orderNumber: o.orderNumber, imageBase64: reader.result, author });
        if (r.data?.success) {
          setToast({ msg: 'Customer chat saved — synced forever' });
          setBoard(prev => prev ? { ...prev, orders: prev.orders.map(x => x.shopifyId === o.shopifyId ? { ...x, proof: true } : x) } : prev);
        } else setToast({ msg: r.data?.error || 'Upload failed', err: true });
      } catch (e) { setToast({ msg: e.response?.data?.error || e.message, err: true }); }
    };
    reader.readAsDataURL(file);
  }, []);
  const handleSaveNote = useCallback(async (o, note) => {
    try {
      const author = (JSON.parse(localStorage.getItem('grlhood_user') || '{}').username) || '';
      const r = await axios.post(`${API_URL}/ndr/note`, { orderNumber: o.orderNumber, awb: o.awb, note, author });
      setToast({ msg: r.data?.success ? 'Note saved & synced' : (r.data?.error || 'Note failed'), err: !r.data?.success });
      if (r.data?.success) setBoard(prev => prev ? { ...prev, orders: prev.orders.map(x => x.shopifyId === o.shopifyId ? { ...x, note: r.data.note } : x) } : prev);
      return !!r.data?.success;
    } catch (e) { setToast({ msg: e.message, err: true }); return false; }
  }, []);
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
      const r = await axios.post(`${API_URL}/ndr/action`, { awb: o.awb, action, orderNumber: o.orderNumber, reason: o.ndrReason || o.ndrRemark, note: o.note?.note, author: (JSON.parse(localStorage.getItem('grlhood_user') || '{}').username) || '', ...extra }, { timeout: 60000 });
      setToast({ msg: r.data?.message || 'Done', err: !r.data?.success });
      if (r.data?.success) {
        setBoard(prev => prev ? { ...prev, orders: prev.orders.map(x => x.shopifyId === o.shopifyId ? { ...x, requested: { action, ts: new Date().toISOString() } } : x) } : prev);
        return true;
      }
      return false;
    } catch (e) {
      setToast({ msg: e.response?.data?.message || e.response?.data?.error || e.message, err: true });
      return false;
    }
  }, []);

  const viewKey = `${tab}|${dateFilter}|${customRange[0]?.toDateString?.() || ''}|${customRange[1]?.toDateString?.() || ''}|${sortDesc}`;
  const renderCards = (list) => (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      {list.slice(0, pageSize).map((o, i) => (
        <BoardCard key={o.shopifyId} o={o} i={i} actionEntry={o.requested} onAction={handleAction} onWaReport={handleWaReport} onToast={handleToast} onSaveNote={handleSaveNote} onOpenChat={handleOpenChat} onUploadProof={handleUploadProof} selected={selectedIds.has(o.shopifyId)} selectionMode={selectedIds.size > 0} onLongPress={handleLongPress} onTapSelect={toggleSelect} />
      ))}
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Floating top-left download button — appears when orders are selected */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div initial={{ opacity: 0, y: -10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="fixed left-4 sm:left-6 z-[130] flex items-center gap-2"
            style={{ top: 'max(14px, env(safe-area-inset-top, 0px) + 8px)' }}>
            <button onClick={async () => {
              setPdfBusy(true);
              const chosen = (board?.orders || []).filter(o => selectedIds.has(o.shopifyId));
              try { await downloadReportPdf(chosen); setToast({ msg: `PDF with ${chosen.length} orders downloaded` }); }
              catch (e) { setToast({ msg: 'PDF failed: ' + e.message, err: true }); }
              finally { setPdfBusy(false); }
            }} disabled={pdfBusy} className="glass-btn-bar circle" title={`Download PDF · ${selectedIds.size}`}>
              {pdfBusy ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
            </button>
            <button onClick={() => setSelectedIds(new Set())} className="glass-btn-bar">
              <X size={14} /> Unselect
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-[1160px] mx-auto px-6 sm:px-8 pb-44">

        {/* status + settings */}
        <div className="flex items-center justify-between mb-5">
          <p className="t-sub text-[11px]" style={{ color: 'var(--text-2)' }}>
            {board?.generatedAt ? `Updated ${fmtDT(board.generatedAt)}` : 'Loading…'}{loading && board ? ' · syncing' : ''}
          </p>
          <button onClick={() => setShowWaSettings(true)} className="tbtn icon !h-9 !w-9" title="Settings"><Settings size={13} /></button>
        </div>

        {/* tabs — snap-scrolling segmented strip, sticky on mobile */}
        <div className="sticky top-[64px] sm:static z-30 -mx-6 px-6 sm:mx-0 sm:px-0 py-1.5 mb-3"
          style={{ background: 'linear-gradient(to bottom, var(--bg) 75%, transparent)' }}>
          <ScrollRow>
            {TABS.map(b => (
              <button key={b.id} onClick={() => setTab(b.id)}
                style={{ scrollSnapAlign: 'start' }}
                className={`pill shrink-0 ${tab === b.id ? 'on' : ''}`}>
                {b.id === 'overview' && <LayoutDashboard size={12} />}
                {b.label}
                {counts[b.id] !== null && counts[b.id] !== undefined && <span className="tabular-nums opacity-70">{counts[b.id]}</span>}
              </button>
            ))}
          </ScrollRow>
        </div>

        {/* filters — one scrollable line (like the tabs) on every screen size */}
        {tab !== 'overview' && (
          <FilterRow
            dateFilter={dateFilter} setDateFilter={setDateFilter}
            customRange={customRange} setCustomRange={setCustomRange}
            sortDesc={sortDesc} setSortDesc={setSortDesc}
            search={search} setSearch={setSearch}
          />
        )}

        {/* first load */}
        {loading && !board && (
          <div className="flex flex-col items-center py-24" style={{ color: 'var(--text-2)' }}>
            <RefreshCw size={26} className="animate-spin mb-4" style={{ color: 'var(--accent-deep)' }} />
            <p className="t-head text-[13px]">Syncing orders &amp; live tracking…</p>
            <p className="t-sub text-[11px] mt-1 opacity-70">first load can take up to a minute</p>
          </div>
        )}

        {/* content — fades out and in on any change */}
        <AnimatePresence mode="wait">
          <motion.div key={viewKey} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.13 } }}>
            {tab === 'overview' && board && <Overview allOrders={board.orders || []} onJump={setTab} />}

            {tab === 'requested' && board && (
              <>
                {!loading && visible.length === 0 && (
                  <div className="flex flex-col items-center py-24" style={{ color: 'var(--text-3)' }}>
                    <CheckCircle size={38} />
                    <p className="mt-4 t-head text-[13px]" style={{ color: 'var(--text-2)' }}>No re-attempts requested yet</p>
                  </div>
                )}
                {renderCards(visible)}
                {visible.length > pageSize && (
                  <button onClick={() => setPageSize(p => p + PAGE_SIZE)} className="tbtn w-full mt-6 !h-12">
                    Show {Math.min(PAGE_SIZE, visible.length - pageSize)} more of {visible.length - pageSize}
                  </button>
                )}
              </>
            )}

            {tab !== 'overview' && tab !== 'requested' && (
              <>
                {!loading && visible.length === 0 && (
                  <div className="flex flex-col items-center py-24" style={{ color: 'var(--text-3)' }}>
                    <Package size={38} />
                    <p className="mt-4 t-head text-[13px]" style={{ color: 'var(--text-2)' }}>Nothing here for this period</p>
                  </div>
                )}
                {renderCards(visible)}
                {visible.length > pageSize && (
                  <button onClick={() => setPageSize(p => p + PAGE_SIZE)} className="tbtn w-full mt-6 !h-12">
                    Show {Math.min(PAGE_SIZE, visible.length - pageSize)} more of {visible.length - pageSize}
                  </button>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Customer chat proof viewer */}
        <AnimatePresence>
          {chatOrder && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[310]" style={{ background: 'var(--dim)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}
                onClick={() => setChatOrder(null)} />
              <motion.div
                initial={{ opacity: 0, scale: 0.94, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 10 }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                className="fixed z-[311] left-1/2 -translate-x-1/2 bottom-1/2 translate-y-1/2 sm:left-auto sm:right-6 sm:translate-x-0 sm:bottom-6 sm:translate-y-0"
                style={{ width: 'min(340px, calc(100vw - 32px))' }}>
                <div className="relative rounded-[26px] overflow-hidden" style={{ background: 'var(--card-solid)', boxShadow: 'var(--shadow)' }}>
                  <div className="flex items-center justify-between px-4 py-3">
                    <p className="t-head text-[12px]" style={{ color: 'var(--text)' }}>Customer Chat · {chatOrder.orderNumber}</p>
                    <button onClick={() => setChatOrder(null)} className="tbtn icon !h-8 !w-8"><X size={13} /></button>
                  </div>
                  <div className="relative">
                    <img src={`${API_URL}/ndr/proof/${encodeURIComponent(chatOrder.orderNumber.replace('#',''))}`} alt="Customer chat"
                      className="w-full block" style={{ maxHeight: '70vh', objectFit: 'contain', background: 'var(--card-2)' }} />
                    <a href={`${API_URL}/ndr/proof/${encodeURIComponent(chatOrder.orderNumber.replace('#',''))}`}
                      download={`${chatOrder.orderNumber} - customer chat.png`}
                      className="absolute bottom-3 left-3 tbtn accent !h-9 !px-4 !text-[11px]" style={{ boxShadow: 'var(--shadow)' }}>
                      <Download size={13} /> Download
                    </a>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* agent welcome + notification permission */}
        <AnimatePresence>
          {showWelcome && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[320] flex items-center justify-center p-6 sheet-backdrop">
              <motion.div initial={{ scale: 0.94, y: 14 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }}
                className="tcard p-8 w-full max-w-sm text-center space-y-4">
                <img src="/logo.png" alt="GRLHOOD" className="h-12 mx-auto object-contain" style={{ filter: 'var(--tw-empty,)' }} />
                <h3 className="t-display text-[20px]" style={{ color: 'var(--text)' }}>Welcome 👋</h3>
                <p className="t-sub text-[13px] leading-relaxed" style={{ color: 'var(--text-2)' }}>
                  This is your GRLHOOD® NDR board. Your mission: catch fake delivery attempts and get every order <b>delivered</b>.
                </p>
                <button onClick={async () => {
                  try { await Notification.requestPermission(); } catch {}
                  localStorage.setItem('ndr_welcomed_v1', '1'); setShowWelcome(false);
                }} className="tbtn accent big w-full">Get Started</button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* WA settings */}
        <AnimatePresence>
          {showWaSettings && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[300] flex items-center justify-center p-6 sheet-backdrop" onClick={() => setShowWaSettings(false)}>
              <motion.div initial={{ scale: 0.94, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }}
                className="tcard p-7 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
                <h3 className="t-display text-[16px]" style={{ color: 'var(--text)' }}>WhatsApp Report Number</h3>
                <p className="t-sub text-[12px] leading-relaxed" style={{ color: 'var(--text-2)' }}>
                  Reports go to this number (with country code, e.g. 919876543210). Leave empty to use the wa.link — the report is copied for pasting.
                </p>
                <input value={waNumber} onChange={e => setWaNumber(e.target.value)} placeholder="91XXXXXXXXXX" className="tinput w-full tabular-nums" />
                <div className="flex gap-2.5">
                  <button onClick={() => { localStorage.setItem('ndr_wa_number', waNumber.trim()); setShowWaSettings(false); setToast({ msg: 'Saved' }); }}
                    className="tbtn accent flex-1">Save</button>
                  <button onClick={() => setShowWaSettings(false)} className="tbtn">Cancel</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* toast */}
        <AnimatePresence>
          {toast && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
              className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[300] pill on !h-11 !px-6 text-[13px]"
              style={toast.err ? { color: '#c2185b' } : undefined}>
              {toast.msg}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
