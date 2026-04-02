import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import {
  Search, X, Settings, Clock, Copy, Phone, Mail, MapPin, Package,
  Send, Truck, FileText, RefreshCw, MessageSquare, AlertTriangle,
  Hash, IndianRupee, XCircle, Eye, History, User, Calendar,
  ChevronRight, Loader2, ExternalLink
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';
const API = API_BASE ? `${API_BASE}/api` : '/api';

/* ═══════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════ */
function copyText(t) { navigator.clipboard.writeText(t).catch(() => {}); }

function fmtDate(d) {
  if (!d) return 'N/A';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtCurrency(a) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(a || 0);
}

function timeAgo(d) {
  if (!d) return '';
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Group search results by orderId — combine units into one order
function groupOrders(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = r.orderId;
    if (!map.has(key)) {
      map.set(key, { ...r, units: [r] });
    } else {
      map.get(key).units.push(r);
    }
  }
  return Array.from(map.values());
}

// Get delivery status from rsStatus (RapidShyp) — NOT fulfillment status
function getDeliveryStatus(order) {
  const rs = (order.rsStatus || '').toLowerCase();
  if (rs.includes('deliver')) return { label: 'Delivered', color: '#e3cfd8' };
  if (rs.includes('transit') || rs.includes('shipped')) return { label: 'In Transit', color: '#e3cfd8' };
  if (rs.includes('rto')) return { label: 'RTO', color: '#e3cfd8' };
  if (rs.includes('cancel')) return { label: 'Cancelled', color: 'rgba(245,245,245,0.4)' };
  if (rs.includes('pickup') || rs.includes('manifest')) return { label: 'Pickup Pending', color: 'rgba(245,245,245,0.4)' };
  if (rs.includes('out for')) return { label: 'Out for Delivery', color: '#e3cfd8' };
  if (order.awb) return { label: 'Shipped', color: '#e3cfd8' };
  if (order.fulfillmentStatus === 'FULFILLED') return { label: 'Fulfilled', color: 'rgba(245,245,245,0.4)' };
  return { label: 'Processing', color: 'rgba(245,245,245,0.3)' };
}

// Build tracking URL from AWB — try to use Shopify tracking URL if available
function getTrackUrl(order) {
  if (order.trackingUrl) return order.trackingUrl;
  if (!order.awb) return null;
  // Fallback: generic tracking
  return `https://www.google.com/search?q=track+${order.awb}`;
}

// Smooth spring transition preset
const smoothSpring = { type: 'spring', damping: 30, stiffness: 280 };
const fadeUp = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 16 } };

/* ═══════════════════════════════════════════
   TOAST
   ═══════════════════════════════════════════ */
function Toast({ message, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return (
    <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 rounded-3xl text-sm font-medium"
      style={{
        background: type === 'success' ? 'rgba(227,207,216,0.12)' : 'rgba(245,245,245,0.08)',
        border: `1px solid ${type === 'success' ? 'rgba(227,207,216,0.25)' : 'rgba(245,245,245,0.15)'}`,
        color: type === 'success' ? '#e3cfd8' : 'rgba(245,245,245,0.7)',
        backdropFilter: 'blur(24px)',
      }}>
      {message}
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   MANIFEST VIEWER — glass overlay
   ═══════════════════════════════════════════ */
function ManifestViewer({ url, onClose }) {
  if (!url) return null;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[160] flex items-center justify-center p-8" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" />
      <motion.div {...fadeUp} transition={smoothSpring}
        className="relative p-5 max-w-xl w-full rounded-[32px] overflow-hidden"
        style={{ background: 'rgba(20,20,24,0.85)', border: '1px solid rgba(227,207,216,0.1)', backdropFilter: 'blur(40px)', boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}
        onClick={e => e.stopPropagation()}>
        <button onClick={onClose}
          className="absolute top-4 right-4 w-9 h-9 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10 hover:bg-white/10 transition-all z-10">
          <X size={15} className="text-white/60" />
        </button>
        <img src={url} alt="Manifest" className="w-full h-auto rounded-[24px]" />
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   CANCEL MODAL — double confirm
   ═══════════════════════════════════════════ */
function CancelModal({ order, onClose, onConfirm, loading }) {
  const [step, setStep] = useState(1);
  const [typed, setTyped] = useState('');
  const id = order?.orderId || '';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[160] flex items-center justify-center p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" />
      <motion.div {...fadeUp} transition={smoothSpring}
        className="relative p-7 w-full max-w-sm rounded-[32px]"
        style={{ background: 'rgba(20,20,24,0.9)', border: '1px solid rgba(227,207,216,0.1)', backdropFilter: 'blur(40px)', boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}
        onClick={e => e.stopPropagation()}>
        {step === 1 ? (
          <>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/[0.04] border border-white/[0.08]">
                <XCircle size={18} className="text-[#e3cfd8]" />
              </div>
              <h3 className="text-base font-bold text-white">Cancel #{id}?</h3>
            </div>
            <p className="text-sm text-white/40 mb-6 leading-relaxed">This will cancel in Shopify & RapidShyp. Cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white/50 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.06] transition-all">Back</button>
              <button onClick={() => setStep(2)} className="flex-1 py-3 rounded-2xl text-sm font-semibold text-[#e3cfd8] bg-[rgba(227,207,216,0.08)] border border-[rgba(227,207,216,0.15)] hover:bg-[rgba(227,207,216,0.12)] transition-all">Yes, Cancel</button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-base font-bold text-white mb-2">Type order ID to confirm</h3>
            <p className="text-xs text-white/30 mb-4">Enter <span className="font-mono text-[#e3cfd8]">{id}</span></p>
            <input type="text" value={typed} onChange={e => setTyped(e.target.value)} placeholder={id} autoFocus
              className="w-full px-4 py-3 rounded-2xl text-sm font-mono mb-5 bg-white/[0.03] border border-white/[0.08] text-white placeholder:text-white/15 outline-none focus:border-[rgba(227,207,216,0.2)] transition-all" />
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white/50 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.06] transition-all">Back</button>
              <button disabled={typed !== id || loading} onClick={() => onConfirm(order)}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold text-[#e3cfd8] bg-[rgba(227,207,216,0.08)] border border-[rgba(227,207,216,0.15)] hover:bg-[rgba(227,207,216,0.12)] transition-all disabled:opacity-20 disabled:cursor-not-allowed">
                {loading ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Confirm'}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   ESCALATION OVERLAY — full screen focus
   ═══════════════════════════════════════════ */
function EscalationOverlay({ order, onClose, onSend, loading }) {
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState('');
  const [instagram, setInstagram] = useState('');
  const cats = [
    { key: 'refund', label: 'Refund' }, { key: 'replacement', label: 'Replacement' },
    { key: 'angry_customer', label: 'Angry Customer' }, { key: 'delivery_issue', label: 'Delivery' },
    { key: 'quality', label: 'Quality' }, { key: 'custom', label: 'Custom' },
  ];

  const handleSend = () => {
    if (!category) return;
    onSend({
      category, customerName: order.customerName, orderId: order.orderId,
      orderAmount: fmtCurrency(order.units ? order.units.reduce((s, u) => s + (u.price || 0), 0) : order.price),
      units: order.units?.length || 1,
      productDetails: order.units ? order.units.map(u => `${u.category} — ${u.model}`).join(', ') : `${order.category} — ${order.model}`,
      instagram, message, employeeName: 'Care Team',
    });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[160] flex items-center justify-center p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" />
      <motion.div {...fadeUp} transition={smoothSpring}
        className="relative p-7 w-full max-w-md rounded-[32px]"
        style={{ background: 'rgba(20,20,24,0.9)', border: '1px solid rgba(227,207,216,0.1)', backdropFilter: 'blur(40px)', boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-base font-bold text-white">Escalate #{order.orderId}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-2xl flex items-center justify-center bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-all">
            <X size={14} className="text-white/50" />
          </button>
        </div>

        {/* Category pills — only dark + pink */}
        <div className="flex flex-wrap gap-2 mb-5">
          {cats.map(c => (
            <button key={c.key} onClick={() => setCategory(c.key)}
              className="text-[11px] px-4 py-2 rounded-2xl font-semibold transition-all"
              style={{
                background: category === c.key ? 'rgba(227,207,216,0.12)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${category === c.key ? 'rgba(227,207,216,0.25)' : 'rgba(255,255,255,0.06)'}`,
                color: category === c.key ? '#e3cfd8' : 'rgba(255,255,255,0.4)',
              }}>
              {c.label}
            </button>
          ))}
        </div>

        {/* Instagram */}
        <input type="text" value={instagram} onChange={e => setInstagram(e.target.value)} placeholder="Instagram handle (optional)"
          className="w-full px-4 py-3 rounded-2xl text-sm mb-3 bg-white/[0.03] border border-white/[0.06] text-white/70 placeholder:text-white/20 outline-none focus:border-[rgba(227,207,216,0.15)] transition-all" />

        {/* Message */}
        <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Details for the team..." rows={3}
          className="w-full px-4 py-3 rounded-2xl text-sm mb-5 bg-white/[0.03] border border-white/[0.06] text-white/70 placeholder:text-white/20 outline-none resize-none focus:border-[rgba(227,207,216,0.15)] transition-all" />

        <button disabled={!category || loading} onClick={handleSend}
          className="w-full py-3.5 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-20"
          style={{ background: 'rgba(227,207,216,0.1)', border: '1px solid rgba(227,207,216,0.2)', color: '#e3cfd8' }}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Send to Slack
        </button>
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   NOTE MODAL
   ═══════════════════════════════════════════ */
function NoteModal({ order, onClose, onSave, loading }) {
  const [note, setNote] = useState('');
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[160] flex items-center justify-center p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" />
      <motion.div {...fadeUp} transition={smoothSpring}
        className="relative p-7 w-full max-w-sm rounded-[32px]"
        style={{ background: 'rgba(20,20,24,0.9)', border: '1px solid rgba(227,207,216,0.1)', backdropFilter: 'blur(40px)', boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}
        onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold text-white mb-4">Note — #{order.orderId}</h3>
        <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Write a note..." rows={4} autoFocus
          className="w-full px-4 py-3 rounded-2xl text-sm mb-5 bg-white/[0.03] border border-white/[0.06] text-white/70 placeholder:text-white/20 outline-none resize-none focus:border-[rgba(227,207,216,0.15)] transition-all" />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white/50 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.06] transition-all">Cancel</button>
          <button disabled={!note.trim() || loading} onClick={() => onSave(order, note)}
            className="flex-1 py-3 rounded-2xl text-sm font-semibold transition-all disabled:opacity-20"
            style={{ background: 'rgba(227,207,216,0.08)', border: '1px solid rgba(227,207,216,0.15)', color: '#e3cfd8' }}>
            {loading ? <Loader2 size={13} className="animate-spin mx-auto" /> : 'Save'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   ORDER CARD — centered overlay, grouped units
   ═══════════════════════════════════════════ */
function OrderCard({ order, onClose, onCancel, onEscalate, onReplace, onViewManifest, onAddNote }) {
  const delivery = getDeliveryStatus(order);
  const trackUrl = getTrackUrl(order);
  const units = order.units || [order];
  const totalPrice = units.reduce((s, u) => s + (u.price || 0), 0);
  const edd = order.createdAt ? new Date(new Date(order.createdAt).getTime() + 6 * 86400000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'N/A';

  return (
    <motion.div {...fadeUp} transition={smoothSpring}
      className="w-full max-w-2xl mx-auto rounded-[32px] p-7 relative"
      style={{ background: 'rgba(20,20,24,0.8)', border: '1px solid rgba(227,207,216,0.08)', backdropFilter: 'blur(32px)', boxShadow: '0 20px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(227,207,216,0.06)' }}>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={onClose}
            className="w-9 h-9 rounded-2xl flex items-center justify-center bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] transition-all">
            <X size={14} className="text-white/50" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white font-mono">#{order.orderId}</h2>
              <button onClick={() => copyText(order.orderId)} className="text-white/15 hover:text-white/40 transition-colors"><Copy size={12} /></button>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] px-3 py-1 rounded-xl font-semibold"
                style={{ background: 'rgba(227,207,216,0.08)', border: '1px solid rgba(227,207,216,0.15)', color: '#e3cfd8' }}>
                {order.payment === 'Prepaid' ? 'Prepaid' : 'COD'}
              </span>
              <span className="text-[10px] px-3 py-1 rounded-xl font-semibold"
                style={{ background: 'rgba(227,207,216,0.06)', border: '1px solid rgba(227,207,216,0.12)', color: delivery.color }}>
                {delivery.label}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">

        {/* LEFT — Customer */}
        <div className="space-y-4">
          <h4 className="text-[10px] uppercase tracking-[0.15em] text-white/25 font-bold">Customer</h4>
          <div className="flex items-center gap-3">
            <User size={14} className="text-white/20" />
            <span className="text-sm font-semibold text-white">{order.customerName || 'Guest'}</span>
            {order.customerOrdersCount > 1 && (
              <span className="text-[9px] px-2 py-0.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white/30">{order.customerOrdersCount}x</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Phone size={14} className="text-white/20" />
            <span className="text-sm text-white/60 font-mono">{order.shippingDetails?.phone || 'N/A'}</span>
            <button onClick={() => copyText(order.shippingDetails?.phone || '')} className="text-white/10 hover:text-white/30 transition-colors"><Copy size={11} /></button>
            {order.shippingDetails?.phone && (
              <a href={`https://wa.me/${(order.shippingDetails.phone || '').replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                className="text-[9px] px-2.5 py-1 rounded-xl bg-[rgba(227,207,216,0.06)] border border-[rgba(227,207,216,0.1)] text-[#e3cfd8] hover:bg-[rgba(227,207,216,0.1)] transition-all">
                WhatsApp
              </a>
            )}
          </div>
          <div className="flex items-start gap-3">
            <MapPin size={14} className="text-white/20 mt-0.5" />
            <span className="text-xs text-white/40 leading-relaxed">
              {[order.shippingDetails?.address1, order.shippingDetails?.city, order.shippingDetails?.state, order.shippingDetails?.zip].filter(Boolean).join(', ')}
            </span>
          </div>
          {order.awb && (
            <div className="flex items-center gap-3">
              <Truck size={14} className="text-white/20" />
              <span className="text-xs font-mono text-white/50">{order.awb}</span>
              <button onClick={() => copyText(order.awb)} className="text-white/10 hover:text-white/30 transition-colors"><Copy size={11} /></button>
              {trackUrl && (
                <a href={trackUrl} target="_blank" rel="noopener noreferrer"
                  className="text-[9px] px-2.5 py-1 rounded-xl bg-[rgba(227,207,216,0.06)] border border-[rgba(227,207,216,0.1)] text-[#e3cfd8] hover:bg-[rgba(227,207,216,0.1)] transition-all">
                  Track
                </a>
              )}
            </div>
          )}
        </div>

        {/* RIGHT — Units */}
        <div className="space-y-4">
          <h4 className="text-[10px] uppercase tracking-[0.15em] text-white/25 font-bold">Units ({units.length})</h4>
          <div className="space-y-2 max-h-48 overflow-y-auto no-scrollbar">
            {units.map((u, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.02] border border-white/[0.04]">
                {u.thumbnail ? (
                  <img src={u.thumbnail} alt="" className="w-10 h-10 rounded-xl object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-white/[0.04] flex items-center justify-center"><Package size={16} className="text-white/15" /></div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{u.category || 'Product'}</p>
                  <p className="text-[11px] text-white/35 truncate">{u.model || ''}</p>
                </div>
                <span className="text-sm font-semibold text-white/70">{fmtCurrency(u.price)}</span>
              </div>
            ))}
          </div>

          {/* Total */}
          <div className="flex items-center justify-between pt-2 border-t border-white/[0.04]">
            <span className="text-xs text-white/30">Total</span>
            <span className="text-lg font-bold text-white">{fmtCurrency(totalPrice)}</span>
          </div>

          <div className="flex items-center gap-3 text-xs text-white/30">
            <Calendar size={12} /> {fmtDate(order.createdAt)}
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 mb-6 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04]">
        <div className="flex-1">
          <span className="text-[9px] uppercase tracking-[0.15em] text-white/20 block mb-1">Status</span>
          <span className="text-xs font-semibold" style={{ color: delivery.color }}>{delivery.label}</span>
        </div>
        <div className="w-px h-6 bg-white/[0.06]" />
        <div className="flex-1">
          <span className="text-[9px] uppercase tracking-[0.15em] text-white/20 block mb-1">EDD</span>
          <span className="text-xs text-white/50">{edd}</span>
        </div>
        <div className="w-px h-6 bg-white/[0.06]" />
        <div className="flex-1">
          <span className="text-[9px] uppercase tracking-[0.15em] text-white/20 block mb-1">Payment</span>
          <span className="text-xs text-white/50">{order.payment}</span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'Cancel', icon: XCircle, action: () => onCancel(order) },
          { label: 'Manifest', icon: FileText, action: () => onViewManifest(order) },
          { label: 'Escalate', icon: AlertTriangle, action: () => onEscalate(order) },
          { label: 'Replace', icon: RefreshCw, action: () => onReplace(order) },
          { label: 'Note', icon: MessageSquare, action: () => onAddNote(order) },
        ].map(btn => (
          <button key={btn.label} onClick={btn.action}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold transition-all hover:translate-y-[-1px]"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(227,207,216,0.08)', color: 'rgba(227,207,216,0.7)', boxShadow: '4px 4px 14px rgba(0,0,0,0.3)' }}>
            <btn.icon size={13} /> {btn.label}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   SEARCH RESULT — grouped order
   ═══════════════════════════════════════════ */
function SearchResultItem({ order, onClick }) {
  const delivery = getDeliveryStatus(order);
  const units = order.units || [order];
  const total = units.reduce((s, u) => s + (u.price || 0), 0);

  return (
    <motion.div {...fadeUp} transition={{ ...smoothSpring, delay: 0.02 }}
      className="p-4 rounded-[24px] flex items-center gap-4 cursor-pointer transition-all hover:translate-y-[-2px]"
      style={{ background: 'rgba(20,20,24,0.5)', border: '1px solid rgba(227,207,216,0.06)', boxShadow: '4px 4px 16px rgba(0,0,0,0.3)' }}
      onClick={() => onClick(order)}
      whileHover={{ borderColor: 'rgba(227,207,216,0.15)', boxShadow: '0 0 30px rgba(227,207,216,0.03)' }}>
      {units[0]?.thumbnail ? (
        <img src={units[0].thumbnail} alt="" className="w-11 h-11 rounded-2xl object-cover" />
      ) : (
        <div className="w-11 h-11 rounded-2xl bg-white/[0.04] flex items-center justify-center"><Package size={16} className="text-white/15" /></div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-bold text-white font-mono">#{order.orderId}</span>
          <span className="text-xs text-white/35">{order.customerName}</span>
          {units.length > 1 && <span className="text-[9px] px-2 py-0.5 rounded-xl bg-white/[0.04] text-white/30">{units.length} items</span>}
        </div>
        <span className="text-[10px] text-white/25">{units.map(u => u.category).filter(Boolean).join(', ')}</span>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold text-white">{fmtCurrency(total)}</p>
        <span className="text-[10px] font-semibold" style={{ color: delivery.color }}>{delivery.label}</span>
      </div>
      <ChevronRight size={14} className="text-white/10" />
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   HISTORY DRAWER — glassmorphic
   ═══════════════════════════════════════════ */
function HistoryDrawer({ open, onClose }) {
  const [history, setHistory] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    axios.get(`${API}/care/history`, { params: { action: filter } })
      .then(r => setHistory(r.data.history || []))
      .catch(() => {}).finally(() => setLoading(false));
  }, [open, filter]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-lg z-[100]" onClick={onClose} />
          <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={smoothSpring}
            className="fixed top-0 right-0 h-full w-full max-w-md z-[101] flex flex-col rounded-l-[32px] overflow-hidden"
            style={{ background: 'rgba(14,14,17,0.95)', backdropFilter: 'blur(40px)', borderLeft: '1px solid rgba(227,207,216,0.08)' }}>
            <div className="flex items-center justify-between p-6 border-b border-white/[0.05]">
              <div className="flex items-center gap-3">
                <History size={16} className="text-[#e3cfd8]" />
                <h3 className="text-base font-bold text-white">Action History</h3>
              </div>
              <button onClick={onClose} className="w-9 h-9 rounded-2xl flex items-center justify-center bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] transition-all">
                <X size={14} className="text-white/50" />
              </button>
            </div>
            <div className="flex items-center gap-2 p-4 overflow-x-auto no-scrollbar">
              {['', 'escalation', 'cancel', 'note', 'replacement'].map(f => (
                <button key={f || 'all'} onClick={() => setFilter(f)}
                  className={`text-[10px] px-3.5 py-2 rounded-2xl font-semibold whitespace-nowrap transition-all ${filter === f ? 'bg-[rgba(227,207,216,0.1)] border border-[rgba(227,207,216,0.2)] text-[#e3cfd8]' : 'bg-white/[0.03] border border-white/[0.06] text-white/35 hover:text-white/50'}`}>
                  {f || 'All'}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {loading ? (
                <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-white/15" /></div>
              ) : history.length === 0 ? (
                <div className="text-center py-16 text-white/15 text-sm">No actions yet</div>
              ) : history.map(h => (
                <div key={h.id} className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04]">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] px-2.5 py-0.5 rounded-xl font-semibold capitalize bg-[rgba(227,207,216,0.06)] border border-[rgba(227,207,216,0.1)] text-[#e3cfd8]">{h.action}</span>
                    <span className="text-[10px] text-white/20 font-mono">#{h.orderId}</span>
                    <span className="text-[10px] text-white/15 ml-auto">{timeAgo(h.timestamp)}</span>
                  </div>
                  <p className="text-xs text-white/40">{h.details || h.customerName}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ═══════════════════════════════════════════
   SETTINGS DRAWER — glassmorphic
   ═══════════════════════════════════════════ */
function SettingsDrawer({ open, onClose }) {
  const [nbeStatus, setNbeStatus] = useState(null);
  useEffect(() => {
    if (!open) return;
    axios.get(`${API}/nbe/status`).then(r => setNbeStatus(r.data)).catch(() => setNbeStatus({ connected: false }));
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-lg z-[100]" onClick={onClose} />
          <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={smoothSpring}
            className="fixed top-0 right-0 h-full w-full max-w-sm z-[101] flex flex-col rounded-l-[32px] overflow-hidden"
            style={{ background: 'rgba(14,14,17,0.95)', backdropFilter: 'blur(40px)', borderLeft: '1px solid rgba(227,207,216,0.08)' }}>
            <div className="flex items-center justify-between p-6 border-b border-white/[0.05]">
              <div className="flex items-center gap-3">
                <Settings size={16} className="text-[#e3cfd8]" />
                <h3 className="text-base font-bold text-white">Settings</h3>
              </div>
              <button onClick={onClose} className="w-9 h-9 rounded-2xl flex items-center justify-center bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] transition-all">
                <X size={14} className="text-white/50" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="p-5 rounded-[24px] bg-white/[0.02] border border-white/[0.04]">
                <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-[0.15em] mb-3">NBE Connection</h4>
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${nbeStatus?.connected ? 'bg-[#e3cfd8]' : 'bg-white/20'}`} />
                  <span className="text-sm text-white/60">{nbeStatus?.connected ? 'Connected' : 'Disconnected'}</span>
                </div>
              </div>
              <div className="p-5 rounded-[24px] bg-white/[0.02] border border-white/[0.04]">
                <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-[0.15em] mb-3">Slack</h4>
                <p className="text-xs text-white/30 leading-relaxed">Escalations go to configured Slack webhook.</p>
              </div>
              <div className="p-5 rounded-[24px] bg-white/[0.02] border border-white/[0.04]">
                <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-[0.15em] mb-3">Shortcuts</h4>
                <div className="space-y-2 text-xs text-white/30">
                  <div className="flex justify-between"><span>Search</span><kbd className="text-[10px] px-2 py-0.5 rounded-xl bg-white/[0.04] text-white/40">/</kbd></div>
                  <div className="flex justify-between"><span>Close</span><kbd className="text-[10px] px-2 py-0.5 rounded-xl bg-white/[0.04] text-white/40">Esc</kbd></div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ═══════════════════════════════════════════
   MAIN DASHBOARD
   ═══════════════════════════════════════════ */
export default function CustomerCareDashboard() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [recentSearches, setRecentSearches] = useState(() => {
    try { return JSON.parse(localStorage.getItem('care_recent') || '[]'); } catch { return []; }
  });

  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [escalateTarget, setEscalateTarget] = useState(null);
  const [escalateLoading, setEscalateLoading] = useState(false);
  const [noteTarget, setNoteTarget] = useState(null);
  const [noteLoading, setNoteLoading] = useState(false);
  const [manifestUrl, setManifestUrl] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const searchRef = useRef(null);
  const debounceRef = useRef(null);

  // Grouped results
  const grouped = useMemo(() => groupOrders(results), [results]);

  // Keyboard: / to focus, Esc to close
  useEffect(() => {
    const handler = (e) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape') {
        if (manifestUrl) setManifestUrl(null);
        else if (cancelTarget) setCancelTarget(null);
        else if (escalateTarget) setEscalateTarget(null);
        else if (noteTarget) setNoteTarget(null);
        else if (selectedOrder) setSelectedOrder(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedOrder, manifestUrl, cancelTarget, escalateTarget, noteTarget]);

  // Search
  const doSearch = useCallback(async (q) => {
    if (!q || q.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const { data } = await axios.get(`${API}/orders/search`, { params: { q } });
      setResults(data.orders || []);
      const updated = [q, ...recentSearches.filter(r => r !== q)].slice(0, 6);
      setRecentSearches(updated);
      localStorage.setItem('care_recent', JSON.stringify(updated));
    } catch { setResults([]); }
    finally { setSearching(false); }
  }, [recentSearches]);

  const handleInput = (val) => {
    setQuery(val);
    if (!val) { setResults([]); setSelectedOrder(null); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 350);
  };

  // Actions
  const handleCancel = async (order) => {
    setCancelLoading(true);
    try {
      await axios.post(`${API}/orders/${order.id}/cancel`, { orderName: `#${order.orderId}` });
      await axios.post(`${API}/care/history`, { action: 'cancel', orderId: order.orderId, customerName: order.customerName, employeeName: 'Care Team', details: `Cancelled #${order.orderId}` });
      setToast({ message: `Order #${order.orderId} cancelled`, type: 'success' });
      setCancelTarget(null);
      setSelectedOrder(null);
      if (query) doSearch(query);
    } catch (e) { setToast({ message: e.response?.data?.error || 'Cancel failed', type: 'error' }); }
    finally { setCancelLoading(false); }
  };

  const handleEscalate = async (params) => {
    setEscalateLoading(true);
    try {
      await axios.post(`${API}/slack/escalate`, params);
      await axios.post(`${API}/care/history`, { action: 'escalation', orderId: params.orderId, customerName: params.customerName, employeeName: params.employeeName, details: `${params.category}: ${params.message || 'Escalated'}`, category: params.category });
      setToast({ message: 'Escalation sent to Slack', type: 'success' });
      setEscalateTarget(null);
    } catch (e) { setToast({ message: e.response?.data?.error || 'Escalation failed', type: 'error' }); }
    finally { setEscalateLoading(false); }
  };

  const handleReplace = async (order) => {
    try {
      await axios.post(`${API}/nbe/replacements`, { orderType: 'Dropship POD', caseTypeName: order.category || 'Soft Case', productName: order.model || '', originalOrderId: order.orderId });
      await axios.post(`${API}/care/history`, { action: 'replacement', orderId: order.orderId, customerName: order.customerName, employeeName: 'Care Team', details: `Replacement for #${order.orderId}` });
      setToast({ message: 'Replacement created via NBE', type: 'success' });
    } catch (e) { setToast({ message: e.response?.data?.error || 'Replacement failed', type: 'error' }); }
  };

  const handleManifest = async (order) => {
    try {
      const { data } = await axios.get(`${API}/nbe/orders/${order.orderId}/labels`);
      const labels = data.data;
      if (Array.isArray(labels) && labels.length > 0) {
        setManifestUrl(labels[0].url || labels[0].label_url || labels[0].file || '');
      } else if (labels?.url) {
        setManifestUrl(labels.url);
      } else {
        setToast({ message: 'No manifest found', type: 'error' });
      }
    } catch { setToast({ message: 'Could not fetch manifest', type: 'error' }); }
  };

  const handleNote = async (order, note) => {
    setNoteLoading(true);
    try {
      await axios.post(`${API}/care/history`, { action: 'note', orderId: order.orderId, customerName: order.customerName, employeeName: 'Care Team', details: note });
      setToast({ message: 'Note saved', type: 'success' });
      setNoteTarget(null);
    } catch { setToast({ message: 'Failed to save note', type: 'error' }); }
    finally { setNoteLoading(false); }
  };

  const showHome = !query && results.length === 0 && !selectedOrder;
  const showOverlay = !!selectedOrder;

  return (
    <div className="relative min-h-screen">

      {/* ─── Top right: History + Settings ─── */}
      <div className="fixed top-5 right-5 flex items-center gap-2 z-30">
        <button onClick={() => setHistoryOpen(true)} title="History"
          className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all hover:translate-y-[-1px]"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(227,207,216,0.06)', backdropFilter: 'blur(12px)' }}>
          <History size={15} className="text-white/30" />
        </button>
        <button onClick={() => setSettingsOpen(true)} title="Settings"
          className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all hover:translate-y-[-1px]"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(227,207,216,0.06)', backdropFilter: 'blur(12px)' }}>
          <Settings size={15} className="text-white/30" />
        </button>
      </div>

      {/* ═══ HOME: Logo + Search ═══ */}
      <AnimatePresence mode="wait">
        {showHome && (
          <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.98 }}
            className="flex flex-col items-center justify-center min-h-screen px-6 pb-20">
            <motion.img src="/logo.png" alt="GRLHOOD" className="w-40 h-40 object-contain mb-12 drop-shadow-[0_0_60px_rgba(227,207,216,0.08)]"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 0.85, y: 0 }} transition={{ delay: 0.1 }}
              style={{ animation: 'careLogoFloat 5s ease-in-out infinite' }} />

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
              className="w-full max-w-lg flex items-center gap-3 px-6 py-4 rounded-[999px]"
              style={{ background: 'rgba(20,20,24,0.6)', border: '1px solid rgba(227,207,216,0.08)', backdropFilter: 'blur(24px)', boxShadow: '8px 8px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(227,207,216,0.06)' }}>
              <Search size={18} className="text-white/25" />
              <input ref={searchRef} type="text" value={query} onChange={e => handleInput(e.target.value)}
                placeholder="Search order, name, phone..."
                className="flex-1 bg-transparent text-[15px] text-white placeholder:text-white/20 outline-none caret-[#e3cfd8]"
                style={{ caretColor: '#e3cfd8' }} />
            </motion.div>

            {recentSearches.length > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
                className="flex items-center gap-2 mt-6 flex-wrap justify-center">
                <span className="text-[10px] text-white/15">Recent:</span>
                {recentSearches.map(r => (
                  <button key={r} onClick={() => { setQuery(r); doSearch(r); }}
                    className="text-[11px] px-3 py-1.5 rounded-2xl bg-white/[0.03] border border-white/[0.05] text-white/25 hover:text-white/50 hover:border-white/[0.1] transition-all">
                    {r}
                  </button>
                ))}
              </motion.div>
            )}

            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
              className="text-[11px] text-white/10 mt-8">
              Press <kbd className="text-[10px] px-2 py-0.5 rounded-xl bg-white/[0.04] text-white/20 mx-0.5">/</kbd> to search
            </motion.p>
          </motion.div>
        )}

        {/* ═══ RESULTS VIEW ═══ */}
        {!showHome && (
          <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="min-h-screen px-6 pt-8 pb-20">

            {/* Compact search bar — fixed at top center */}
            <div className="max-w-lg mx-auto mb-8">
              <div className="flex items-center gap-3 px-5 py-3 rounded-[999px]"
                style={{ background: 'rgba(20,20,24,0.6)', border: '1px solid rgba(227,207,216,0.08)', backdropFilter: 'blur(24px)', boxShadow: '6px 6px 18px rgba(0,0,0,0.35)' }}>
                <Search size={15} className="text-white/25" />
                <input ref={searchRef} type="text" value={query} onChange={e => handleInput(e.target.value)}
                  placeholder="Search order, name, phone..."
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-white/20 outline-none"
                  style={{ caretColor: '#e3cfd8' }} />
                {searching && <Loader2 size={14} className="animate-spin text-white/20" />}
                {query && !searching && (
                  <button onClick={() => { setQuery(''); setResults([]); setSelectedOrder(null); }}
                    className="text-white/15 hover:text-white/40 transition-colors"><X size={14} /></button>
                )}
              </div>
            </div>

            {/* Blurred background when order card is open */}
            <div className={`transition-all duration-300 ${showOverlay ? 'blur-sm opacity-30 pointer-events-none' : ''}`}>
              <div className="max-w-2xl mx-auto space-y-3">
                {searching ? (
                  <div className="flex justify-center py-24"><Loader2 size={24} className="animate-spin text-white/15" /></div>
                ) : grouped.length === 0 && query ? (
                  <div className="text-center py-24">
                    <Search size={32} className="mx-auto text-white/8 mb-3" />
                    <p className="text-sm text-white/20">No orders found for "{query}"</p>
                  </div>
                ) : (
                  <>
                    <p className="text-[11px] text-white/20 mb-4 px-1">{grouped.length} order{grouped.length !== 1 ? 's' : ''}</p>
                    {grouped.map((order, i) => (
                      <SearchResultItem key={order.orderId} order={order} onClick={o => setSelectedOrder(o)} />
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* Order card overlay — centered, on top */}
            <AnimatePresence>
              {selectedOrder && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[80] flex items-center justify-center p-6"
                  onClick={() => setSelectedOrder(null)}>
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-lg" />
                  <div className="relative z-10 w-full max-w-2xl" onClick={e => e.stopPropagation()}>
                    <OrderCard
                      order={selectedOrder}
                      onClose={() => setSelectedOrder(null)}
                      onCancel={o => setCancelTarget(o)}
                      onEscalate={o => setEscalateTarget(o)}
                      onReplace={handleReplace}
                      onViewManifest={handleManifest}
                      onAddNote={o => setNoteTarget(o)}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ MODALS ═══ */}
      <AnimatePresence>
        {cancelTarget && <CancelModal order={cancelTarget} onClose={() => setCancelTarget(null)} onConfirm={handleCancel} loading={cancelLoading} />}
      </AnimatePresence>
      <AnimatePresence>
        {escalateTarget && <EscalationOverlay order={escalateTarget} onClose={() => setEscalateTarget(null)} onSend={handleEscalate} loading={escalateLoading} />}
      </AnimatePresence>
      <AnimatePresence>
        {noteTarget && <NoteModal order={noteTarget} onClose={() => setNoteTarget(null)} onSave={handleNote} loading={noteLoading} />}
      </AnimatePresence>
      <AnimatePresence>
        {manifestUrl && <ManifestViewer url={manifestUrl} onClose={() => setManifestUrl(null)} />}
      </AnimatePresence>

      <HistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} />
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <AnimatePresence>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </AnimatePresence>
    </div>
  );
}
