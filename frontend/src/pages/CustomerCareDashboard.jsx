import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import {
  Search, X, Settings, Clock, Copy, ExternalLink,
  MoreVertical, Phone, Mail, MapPin, Package,
  ChevronDown, Send, AlertCircle, CheckCircle2,
  Truck, FileText, RefreshCw, MessageSquare,
  Instagram, Hash, IndianRupee, ShoppingBag,
  XCircle, ArrowRight, Eye, Download, History,
  User, Calendar, Filter, ChevronRight, Loader2
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';
const API = API_BASE ? `${API_BASE}/api` : '/api';

/* ═══════════════════════════════════════════
   STATUS & PAYMENT CONFIGS
   ═══════════════════════════════════════════ */
const STATUS_COLORS = {
  'FULFILLED': { bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.25)', text: '#10B981', label: 'Fulfilled' },
  'UNFULFILLED': { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)', text: '#F59E0B', label: 'Unfulfilled' },
  'PARTIALLY_FULFILLED': { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.25)', text: '#3B82F6', label: 'Partial' },
  'IN_TRANSIT': { bg: 'rgba(99,102,241,0.1)', border: 'rgba(99,102,241,0.25)', text: '#6366F1', label: 'In Transit' },
  'DELIVERED': { bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.25)', text: '#10B981', label: 'Delivered' },
  'RTO': { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.25)', text: '#EF4444', label: 'RTO' },
  'CANCELLED': { bg: 'rgba(107,114,128,0.1)', border: 'rgba(107,114,128,0.25)', text: '#6B7280', label: 'Cancelled' },
};

const ESCALATION_CATEGORIES = [
  { key: 'refund', label: 'Refund Request', color: '#EF4444' },
  { key: 'replacement', label: 'Replacement', color: '#10B981' },
  { key: 'angry_customer', label: 'Angry Customer', color: '#F59E0B' },
  { key: 'delivery_issue', label: 'Delivery Issue', color: '#3B82F6' },
  { key: 'quality', label: 'Quality Complaint', color: '#8B5CF6' },
  { key: 'custom', label: 'Custom', color: '#e3cfd8' },
];

const ACTION_COLORS = {
  escalation: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)', text: '#F59E0B' },
  cancel: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.2)', text: '#EF4444' },
  note: { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.2)', text: '#3B82F6' },
  replacement: { bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.2)', text: '#10B981' },
  other: { bg: 'rgba(139,92,246,0.1)', border: 'rgba(139,92,246,0.2)', text: '#8B5CF6' },
};

/* ═══════════════════════════════════════════
   HELPER FUNCTIONS
   ═══════════════════════════════════════════ */
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).catch(() => {});
}

function getStatusConfig(status) {
  const rs = (status || '').toUpperCase().replace(/ /g, '_');
  return STATUS_COLORS[rs] || STATUS_COLORS['UNFULFILLED'];
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(amount || 0);
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ═══════════════════════════════════════════
   TOAST COMPONENT
   ═══════════════════════════════════════════ */
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  const colors = type === 'success'
    ? { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.3)', text: '#10B981' }
    : { bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.3)', text: '#EF4444' };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 30 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 rounded-2xl text-sm font-medium"
      style={{ background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text }}
    >
      {message}
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   MANIFEST VIEWER (Glassmorphic Image Overlay)
   ═══════════════════════════════════════════ */
function ManifestViewer({ url, onClose }) {
  if (!url) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[150] flex items-center justify-center p-8"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      {/* Image container */}
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="care-manifest-overlay relative p-6 max-w-2xl max-h-[85vh] overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center bg-white/5 border border-white/10 hover:bg-white/10 transition-all z-10"
        >
          <X size={16} className="text-white/70" />
        </button>
        <img src={url} alt="Manifest" className="w-full h-auto rounded-3xl" />
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   CANCEL ORDER MODAL (Double Confirmation)
   ═══════════════════════════════════════════ */
function CancelModal({ order, onClose, onConfirm, loading }) {
  const [step, setStep] = useState(1);
  const [typed, setTyped] = useState('');
  const orderId = order?.orderId || '';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[150] flex items-center justify-center p-8"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="care-manifest-overlay relative p-8 w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        {step === 1 ? (
          <>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <XCircle size={18} className="text-red-400" />
              </div>
              <h3 className="text-lg font-bold text-white">Cancel Order #{orderId}?</h3>
            </div>
            <p className="text-sm text-white/50 mb-6">
              This will cancel the order in Shopify and RapidShyp. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={onClose} className="care-action-pill flex-1 text-center">Go Back</button>
              <button onClick={() => setStep(2)} className="care-action-pill care-action-pill-danger flex-1 text-center">
                Yes, Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-lg font-bold text-white mb-2">Type order ID to confirm</h3>
            <p className="text-xs text-white/40 mb-4">Enter <span className="font-mono text-red-400">{orderId}</span> below</p>
            <input
              type="text"
              value={typed}
              onChange={e => setTyped(e.target.value)}
              placeholder={orderId}
              className="w-full glass-input px-4 py-3 rounded-2xl text-sm font-mono mb-5"
              autoFocus
            />
            <div className="flex gap-3">
              <button onClick={onClose} className="care-action-pill flex-1 text-center">Go Back</button>
              <button
                disabled={typed !== orderId || loading}
                onClick={() => onConfirm(order)}
                className="care-action-pill care-action-pill-danger flex-1 text-center disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Confirm Cancel'}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   ESCALATION MENU (3-dot → dropdown w/ msg + send)
   ═══════════════════════════════════════════ */
function EscalationMenu({ order, onClose, onSend, loading }) {
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState('');
  const [instagram, setInstagram] = useState('');

  const handleSend = () => {
    if (!category) return;
    onSend({
      category,
      customerName: order.customerName,
      orderId: order.orderId,
      orderAmount: formatCurrency(order.price),
      units: 1,
      productDetails: `${order.category} — ${order.model}`,
      instagram,
      message,
      employeeName: 'Care Team',
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: -8 }}
      transition={{ type: 'spring', damping: 25, stiffness: 350 }}
      className="care-escalation-menu absolute top-12 right-0 w-80 p-5 z-50"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-bold text-white">Escalate</h4>
        <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {ESCALATION_CATEGORIES.map(cat => (
          <button
            key={cat.key}
            onClick={() => setCategory(cat.key)}
            className="text-[11px] px-3 py-1.5 rounded-xl font-medium transition-all"
            style={{
              background: category === cat.key ? `${cat.color}20` : 'rgba(255,255,255,0.03)',
              border: `1px solid ${category === cat.key ? `${cat.color}40` : 'rgba(255,255,255,0.06)'}`,
              color: category === cat.key ? cat.color : 'rgba(255,255,255,0.5)',
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Instagram handle */}
      <div className="flex items-center gap-2 mb-3">
        <Instagram size={13} className="text-white/30 flex-shrink-0" />
        <input
          type="text"
          value={instagram}
          onChange={e => setInstagram(e.target.value)}
          placeholder="Instagram handle"
          className="w-full bg-transparent text-xs text-white/70 placeholder:text-white/20 outline-none border-b border-white/8 pb-1"
        />
      </div>

      {/* Message */}
      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        placeholder="Add details for the team..."
        rows={3}
        className="w-full bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3 text-xs text-white/70 placeholder:text-white/20 outline-none resize-none mb-4"
      />

      {/* Send */}
      <button
        disabled={!category || loading}
        onClick={handleSend}
        className="w-full care-action-pill text-center flex items-center justify-center gap-2 disabled:opacity-30"
        style={{ borderColor: category ? 'rgba(227,207,216,0.2)' : undefined, color: category ? '#e3cfd8' : undefined }}
      >
        {loading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
        Send to Slack
      </button>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   ORDER CARD (2-col: Customer Info | Units)
   ═══════════════════════════════════════════ */
function OrderCard({ order, onClose, onCancel, onEscalate, onReplace, onViewManifest, onAddNote }) {
  const [showEscalation, setShowEscalation] = useState(false);
  const [escalationLoading, setEscalationLoading] = useState(false);
  const menuRef = useRef(null);

  const st = getStatusConfig(order.fulfillmentStatus);
  const rsStatus = order.rsStatus || '';

  // Determine Shopify + NBE combined status display
  const shopifyStatus = order.fulfillmentStatus || 'UNFULFILLED';
  const nbeStatus = rsStatus || 'Pending';

  // Build EDD estimate (rough: 5-7 days from order date)
  const orderDate = order.createdAt ? new Date(order.createdAt) : null;
  const edd = orderDate ? new Date(orderDate.getTime() + 6 * 86400000) : null;
  const eddStr = edd ? edd.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'N/A';

  const handleEscalationSend = async (params) => {
    setEscalationLoading(true);
    await onEscalate(params);
    setEscalationLoading(false);
    setShowEscalation(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.97 }}
      transition={{ type: 'spring', damping: 28, stiffness: 300 }}
      className="care-order-card p-6 w-full max-w-3xl relative"
    >
      {/* ─── Header Row ─── */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-all care-glow-hover"
          >
            <X size={14} className="text-white/60" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white font-mono">#{order.orderId}</h2>
              <button onClick={() => copyToClipboard(order.orderId)} className="text-white/20 hover:text-white/50 transition-colors">
                <Copy size={12} />
              </button>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {/* Payment badge */}
              <span className="text-[10px] px-2.5 py-0.5 rounded-lg font-semibold"
                style={{
                  background: order.payment === 'Prepaid' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                  border: `1px solid ${order.payment === 'Prepaid' ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)'}`,
                  color: order.payment === 'Prepaid' ? '#10B981' : '#F59E0B',
                }}>
                {order.payment === 'Prepaid' ? 'Prepaid' : 'COD'}
              </span>
              {/* Shopify Status */}
              <span className="care-status-tag text-[10px]" style={{ background: st.bg, borderColor: st.border, color: st.text }}>
                {st.label}
              </span>
            </div>
          </div>
        </div>

        {/* 3-dot menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowEscalation(!showEscalation)}
            className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-all care-glow-hover"
          >
            <MoreVertical size={15} className="text-white/50" />
          </button>
          <AnimatePresence>
            {showEscalation && (
              <EscalationMenu
                order={order}
                onClose={() => setShowEscalation(false)}
                onSend={handleEscalationSend}
                loading={escalationLoading}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ─── Two Column Layout ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">

        {/* LEFT: Customer Info */}
        <div className="space-y-3">
          <h4 className="text-[10px] uppercase tracking-widest text-white/30 font-bold mb-2">Customer Info</h4>

          {/* Name */}
          <div className="flex items-center gap-2.5">
            <User size={13} className="text-white/25 flex-shrink-0" />
            <span className="text-sm font-semibold text-white">{order.customerName || 'Guest'}</span>
            {order.customerOrdersCount > 1 && (
              <span className="text-[9px] px-2 py-0.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/40">
                {order.customerOrdersCount}x buyer
              </span>
            )}
          </div>

          {/* Phone */}
          <div className="flex items-center gap-2.5">
            <Phone size={13} className="text-white/25 flex-shrink-0" />
            <span className="text-sm text-white/70 font-mono">{order.shippingDetails?.phone || 'N/A'}</span>
            <button onClick={() => copyToClipboard(order.shippingDetails?.phone || '')} className="text-white/15 hover:text-white/40 transition-colors">
              <Copy size={11} />
            </button>
            {order.shippingDetails?.phone && (
              <a
                href={`https://wa.me/${(order.shippingDetails.phone || '').replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[9px] px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/15 transition-colors"
              >
                WhatsApp
              </a>
            )}
          </div>

          {/* Address */}
          <div className="flex items-start gap-2.5">
            <MapPin size={13} className="text-white/25 flex-shrink-0 mt-0.5" />
            <span className="text-xs text-white/50 leading-relaxed">
              {order.shippingDetails?.address1 || ''}{order.shippingDetails?.city ? `, ${order.shippingDetails.city}` : ''}{order.shippingDetails?.state ? `, ${order.shippingDetails.state}` : ''} {order.shippingDetails?.zip || ''}
            </span>
          </div>

          {/* Shopify link */}
          {order.orderLink && (
            <a href={order.orderLink} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[11px] text-white/30 hover:text-[#e3cfd8] transition-colors">
              <ExternalLink size={11} />
              View on Shopify
            </a>
          )}

          {/* AWB */}
          {order.awb && (
            <div className="flex items-center gap-2.5 mt-1">
              <Truck size={13} className="text-white/25 flex-shrink-0" />
              <span className="text-xs font-mono text-white/60">{order.awb}</span>
              <button onClick={() => copyToClipboard(order.awb)} className="text-white/15 hover:text-white/40 transition-colors">
                <Copy size={11} />
              </button>
              <a
                href={`https://www.delhivery.com/track/package/${order.awb}`}
                target="_blank" rel="noopener noreferrer"
                className="text-[9px] px-2 py-0.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/40 hover:text-white/60 transition-colors"
              >
                Track
              </a>
            </div>
          )}
        </div>

        {/* RIGHT: Units / Product Info */}
        <div className="space-y-3">
          <h4 className="text-[10px] uppercase tracking-widest text-white/30 font-bold mb-2">Units</h4>

          {/* Product card */}
          <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
            {order.thumbnail ? (
              <img src={order.thumbnail} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                <Package size={18} className="text-white/20" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{order.category || 'Product'}</p>
              <p className="text-xs text-white/40 truncate">{order.model || ''}</p>
              {order.sku && <p className="text-[10px] text-white/25 font-mono mt-0.5">{order.sku}</p>}
            </div>
          </div>

          {/* Price */}
          <div className="flex items-center gap-2.5">
            <IndianRupee size={13} className="text-white/25 flex-shrink-0" />
            <span className="text-lg font-bold text-white">{formatCurrency(order.price)}</span>
            {order.cogs > 0 && (
              <span className="text-[10px] text-white/25">COGS: {formatCurrency(order.cogs)}</span>
            )}
          </div>

          {/* Order date */}
          <div className="flex items-center gap-2.5">
            <Calendar size={13} className="text-white/25 flex-shrink-0" />
            <span className="text-xs text-white/50">{formatDate(order.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* ─── NBE & Shopify Status Row ─── */}
      <div className="flex items-center gap-3 mb-5 p-3 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
        <div className="flex-1">
          <span className="text-[10px] uppercase tracking-widest text-white/25 block mb-1">Shopify</span>
          <span className="care-status-tag text-[10px]" style={{ background: st.bg, borderColor: st.border, color: st.text }}>
            {shopifyStatus.replace(/_/g, ' ')}
          </span>
        </div>
        <div className="w-px h-8 bg-white/[0.06]" />
        <div className="flex-1">
          <span className="text-[10px] uppercase tracking-widest text-white/25 block mb-1">Courier</span>
          <span className="text-xs text-white/60">{nbeStatus || '—'}</span>
        </div>
        <div className="w-px h-8 bg-white/[0.06]" />
        <div className="flex-1">
          <span className="text-[10px] uppercase tracking-widest text-white/25 block mb-1">EDD</span>
          <span className="text-xs text-white/60">{eddStr}</span>
        </div>
      </div>

      {/* ─── Bottom Action Pills ─── */}
      <div className="flex flex-wrap gap-2.5">
        <button onClick={() => onCancel(order)} className="care-action-pill care-action-pill-danger flex items-center gap-2">
          <XCircle size={13} /> Cancel
        </button>
        <button onClick={() => onViewManifest(order)} className="care-action-pill flex items-center gap-2 care-glow-hover">
          <FileText size={13} /> Manifest
        </button>
        <button className="care-action-pill flex items-center gap-2 care-glow-hover" title={`EDD: ${eddStr}`}>
          <Clock size={13} /> EDD: {eddStr}
        </button>
        <button className="care-action-pill flex items-center gap-2 care-glow-hover">
          <span className="w-2 h-2 rounded-full" style={{ background: st.text }} /> {st.label}
        </button>
        <button onClick={() => onReplace(order)} className="care-action-pill flex items-center gap-2 care-glow-hover" style={{ borderColor: 'rgba(16,185,129,0.2)', color: '#10B981' }}>
          <RefreshCw size={13} /> Replace
        </button>
        <button onClick={() => onAddNote(order)} className="care-action-pill flex items-center gap-2 care-glow-hover">
          <MessageSquare size={13} /> Note
        </button>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   SEARCH RESULT ITEM
   ═══════════════════════════════════════════ */
function SearchResultItem({ order, onClick }) {
  const st = getStatusConfig(order.fulfillmentStatus);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="care-result-item p-4 flex items-center gap-4"
      onClick={() => onClick(order)}
    >
      {/* Thumbnail */}
      {order.thumbnail ? (
        <img src={order.thumbnail} alt="" className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
      ) : (
        <div className="w-10 h-10 rounded-xl bg-white/[0.04] flex items-center justify-center flex-shrink-0">
          <Package size={16} className="text-white/20" />
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-bold text-white font-mono">#{order.orderId}</span>
          <span className="text-xs text-white/40">{order.customerName}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/30">{order.category} · {order.model}</span>
        </div>
      </div>

      {/* Right side */}
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-semibold text-white">{formatCurrency(order.price)}</p>
        <span className="care-status-tag text-[9px] inline-block mt-1" style={{ background: st.bg, borderColor: st.border, color: st.text }}>
          {st.label}
        </span>
      </div>

      <ChevronRight size={14} className="text-white/15 flex-shrink-0" />
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   HISTORY DRAWER (slide-out from right)
   ═══════════════════════════════════════════ */
function HistoryDrawer({ open, onClose }) {
  const [history, setHistory] = useState([]);
  const [filterAction, setFilterAction] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    axios.get(`${API}/care/history`, { params: { action: filterAction } })
      .then(r => setHistory(r.data.history || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, filterAction]);

  const actionFilters = ['', 'escalation', 'cancel', 'note', 'replacement'];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="care-drawer fixed top-0 right-0 h-full w-full max-w-md z-[101] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <History size={16} className="text-[#e3cfd8]" />
                <h3 className="text-base font-bold text-white">Action History</h3>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-all">
                <X size={14} className="text-white/60" />
              </button>
            </div>

            {/* Filter pills */}
            <div className="flex items-center gap-2 p-4 overflow-x-auto no-scrollbar">
              {actionFilters.map(f => (
                <button
                  key={f || 'all'}
                  onClick={() => setFilterAction(f)}
                  className={`text-[10px] px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-all ${
                    filterAction === f ? 'glass-pill-active' : 'glass-pill'
                  }`}
                >
                  {f || 'All'}
                </button>
              ))}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={20} className="animate-spin text-white/20" />
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-16 text-white/20 text-sm">No actions logged yet</div>
              ) : (
                history.map(h => {
                  const ac = ACTION_COLORS[h.action] || ACTION_COLORS.other;
                  return (
                    <div key={h.id} className="p-3 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[10px] px-2 py-0.5 rounded-lg font-semibold capitalize"
                          style={{ background: ac.bg, border: `1px solid ${ac.border}`, color: ac.text }}>
                          {h.action}
                        </span>
                        <span className="text-[10px] text-white/25 font-mono">#{h.orderId}</span>
                        <span className="text-[10px] text-white/20 ml-auto">{timeAgo(h.timestamp)}</span>
                      </div>
                      <p className="text-xs text-white/50">{h.details || h.customerName}</p>
                      <p className="text-[10px] text-white/20 mt-1">{h.employeeName}</p>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ═══════════════════════════════════════════
   SETTINGS DRAWER
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="care-drawer fixed top-0 right-0 h-full w-full max-w-sm z-[101] flex flex-col"
          >
            <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <Settings size={16} className="text-[#e3cfd8]" />
                <h3 className="text-base font-bold text-white">Settings</h3>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-all">
                <X size={14} className="text-white/60" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* NBE Connection */}
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
                <h4 className="text-xs font-bold text-white/60 uppercase tracking-wider mb-3">NBE Connection</h4>
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${nbeStatus?.connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  <span className="text-sm text-white/70">{nbeStatus?.connected ? 'Connected' : 'Disconnected'}</span>
                </div>
              </div>

              {/* Slack config */}
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
                <h4 className="text-xs font-bold text-white/60 uppercase tracking-wider mb-3">Slack Integration</h4>
                <p className="text-xs text-white/40">Escalations are sent to the configured Slack webhook. Update SLACK_WEBHOOK_URL in your environment.</p>
              </div>

              {/* Quick info */}
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
                <h4 className="text-xs font-bold text-white/60 uppercase tracking-wider mb-3">Keyboard Shortcuts</h4>
                <div className="space-y-2 text-xs text-white/40">
                  <div className="flex justify-between"><span>Focus search</span><kbd className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/50">/</kbd></div>
                  <div className="flex justify-between"><span>Close card</span><kbd className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/50">Esc</kbd></div>
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
   ADD NOTE MODAL
   ═══════════════════════════════════════════ */
function NoteModal({ order, onClose, onSave, loading }) {
  const [note, setNote] = useState('');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[150] flex items-center justify-center p-8"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.9 }}
        className="care-manifest-overlay relative p-8 w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-white mb-4">Add Note — #{order.orderId}</h3>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Write a note..."
          rows={4}
          className="w-full bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 text-sm text-white/70 placeholder:text-white/20 outline-none resize-none mb-4"
          autoFocus
        />
        <div className="flex gap-3">
          <button onClick={onClose} className="care-action-pill flex-1 text-center">Cancel</button>
          <button
            disabled={!note.trim() || loading}
            onClick={() => onSave(order, note)}
            className="care-action-pill flex-1 text-center disabled:opacity-30"
            style={{ borderColor: 'rgba(59,130,246,0.2)', color: '#3B82F6' }}
          >
            {loading ? <Loader2 size={13} className="animate-spin mx-auto" /> : 'Save Note'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   MAIN DASHBOARD
   ═══════════════════════════════════════════ */
export default function CustomerCareDashboard() {
  // ─── State ───
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [recentSearches, setRecentSearches] = useState(() => {
    try { return JSON.parse(localStorage.getItem('care_recent') || '[]'); } catch { return []; }
  });

  // Modals & drawers
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [noteTarget, setNoteTarget] = useState(null);
  const [noteLoading, setNoteLoading] = useState(false);
  const [manifestUrl, setManifestUrl] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const searchRef = useRef(null);
  const debounceRef = useRef(null);

  // ─── Keyboard shortcut: / to focus search, Esc to close card ───
  useEffect(() => {
    const handler = (e) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape') {
        if (manifestUrl) setManifestUrl(null);
        else if (cancelTarget) setCancelTarget(null);
        else if (noteTarget) setNoteTarget(null);
        else if (selectedOrder) setSelectedOrder(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedOrder, manifestUrl, cancelTarget, noteTarget]);

  // ─── Search ───
  const doSearch = useCallback(async (q) => {
    if (!q || q.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const { data } = await axios.get(`${API}/orders/search`, { params: { q } });
      setResults(data.orders || []);
      // Save to recents
      const updated = [q, ...recentSearches.filter(r => r !== q)].slice(0, 6);
      setRecentSearches(updated);
      localStorage.setItem('care_recent', JSON.stringify(updated));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [recentSearches]);

  const handleSearchInput = (val) => {
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 350);
  };

  // ─── Actions ───
  const handleCancel = async (order) => {
    setCancelLoading(true);
    try {
      await axios.post(`${API}/orders/${order.id}/cancel`, { orderName: `#${order.orderId}` });
      await axios.post(`${API}/care/history`, {
        action: 'cancel', orderId: order.orderId, customerName: order.customerName,
        employeeName: 'Care Team', details: `Cancelled order #${order.orderId}`,
      });
      setToast({ message: `Order #${order.orderId} cancelled`, type: 'success' });
      setCancelTarget(null);
      setSelectedOrder(null);
      // Refresh results
      if (query) doSearch(query);
    } catch (e) {
      setToast({ message: e.response?.data?.error || 'Cancel failed', type: 'error' });
    } finally {
      setCancelLoading(false);
    }
  };

  const handleEscalate = async (params) => {
    try {
      await axios.post(`${API}/slack/escalate`, params);
      await axios.post(`${API}/care/history`, {
        action: 'escalation', orderId: params.orderId, customerName: params.customerName,
        employeeName: params.employeeName, details: `${params.category}: ${params.message || 'Escalated'}`,
        category: params.category,
      });
      setToast({ message: 'Escalation sent to Slack', type: 'success' });
    } catch (e) {
      setToast({ message: e.response?.data?.error || 'Escalation failed', type: 'error' });
    }
  };

  const handleReplace = async (order) => {
    try {
      await axios.post(`${API}/nbe/replacements`, {
        orderType: 'Dropship POD', caseTypeName: order.category || 'Soft Case',
        productName: order.model || '', originalOrderId: order.orderId,
      });
      await axios.post(`${API}/care/history`, {
        action: 'replacement', orderId: order.orderId, customerName: order.customerName,
        employeeName: 'Care Team', details: `Replacement initiated for #${order.orderId}`,
      });
      setToast({ message: 'Replacement created via NBE', type: 'success' });
    } catch (e) {
      setToast({ message: e.response?.data?.error || 'Replacement failed', type: 'error' });
    }
  };

  const handleViewManifest = async (order) => {
    try {
      const { data } = await axios.get(`${API}/nbe/orders/${order.orderId}/labels`);
      if (data.data && Array.isArray(data.data) && data.data.length > 0) {
        setManifestUrl(data.data[0].url || data.data[0].label_url || '');
      } else if (data.data?.url) {
        setManifestUrl(data.data.url);
      } else {
        setToast({ message: 'No manifest found for this order', type: 'error' });
      }
    } catch {
      setToast({ message: 'Could not fetch manifest', type: 'error' });
    }
  };

  const handleSaveNote = async (order, note) => {
    setNoteLoading(true);
    try {
      await axios.post(`${API}/care/history`, {
        action: 'note', orderId: order.orderId, customerName: order.customerName,
        employeeName: 'Care Team', details: note,
      });
      setToast({ message: 'Note saved', type: 'success' });
      setNoteTarget(null);
    } catch {
      setToast({ message: 'Failed to save note', type: 'error' });
    } finally {
      setNoteLoading(false);
    }
  };

  // ─── Are we on the home screen or showing results? ───
  const showHome = !query && results.length === 0 && !selectedOrder;

  return (
    <motion.div
      key="customer-care"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="relative min-h-[80vh]"
    >
      {/* ─── Top Right: Settings + History ─── */}
      <div className="absolute top-0 right-0 flex items-center gap-2 z-20">
        <button
          onClick={() => setHistoryOpen(true)}
          className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.12] transition-all care-glow-hover"
          title="Action History"
        >
          <History size={15} className="text-white/40" />
        </button>
        <button
          onClick={() => setSettingsOpen(true)}
          className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.12] transition-all care-glow-hover"
          title="Settings"
        >
          <Settings size={15} className="text-white/40" />
        </button>
      </div>

      {/* ═══ HOME SCREEN: Logo + Search ═══ */}
      <AnimatePresence mode="wait">
        {showHome ? (
          <motion.div
            key="home"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col items-center justify-center pt-16 pb-8"
          >
            {/* Big Logo */}
            <motion.img
              src="/logo.png"
              alt="GRLHOOD"
              className="w-44 h-44 object-contain mb-10 care-logo-float drop-shadow-[0_0_60px_rgba(227,207,216,0.1)]"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 0.9, y: 0 }}
              transition={{ delay: 0.1 }}
            />

            {/* Search Bar */}
            <motion.div
              className="care-search-bar w-full max-w-xl flex items-center gap-3 px-6 py-4 care-pulse-glow"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              <Search size={18} className="text-white/30 flex-shrink-0" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={e => handleSearchInput(e.target.value)}
                placeholder="Search order, name, phone..."
                className="flex-1 bg-transparent text-[15px] text-white placeholder:text-white/25 outline-none"
              />
              {query && (
                <button onClick={() => { setQuery(''); setResults([]); }} className="text-white/20 hover:text-white/50 transition-colors">
                  <X size={16} />
                </button>
              )}
            </motion.div>

            {/* Recent searches */}
            {recentSearches.length > 0 && (
              <motion.div
                className="flex items-center gap-2 mt-5 flex-wrap justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                <span className="text-[10px] text-white/20 mr-1">Recent:</span>
                {recentSearches.map(r => (
                  <button
                    key={r}
                    onClick={() => { setQuery(r); doSearch(r); }}
                    className="text-[11px] px-3 py-1 rounded-xl bg-white/[0.03] border border-white/[0.06] text-white/35 hover:text-white/60 hover:border-white/[0.12] transition-all"
                  >
                    {r}
                  </button>
                ))}
              </motion.div>
            )}

            {/* Hint */}
            <p className="text-[11px] text-white/15 mt-6">
              Press <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.05] text-white/25 mx-0.5">/</kbd> to search
            </p>
          </motion.div>
        ) : (
          /* ═══ RESULTS / ORDER VIEW ═══ */
          <motion.div
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pt-2"
          >
            {/* Search Bar (compact, top) */}
            <div className="mb-6">
              <div className="care-search-bar w-full max-w-xl mx-auto flex items-center gap-3 px-5 py-3">
                <Search size={16} className="text-white/30 flex-shrink-0" />
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={e => handleSearchInput(e.target.value)}
                  placeholder="Search order, name, phone..."
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 outline-none"
                />
                {searching && <Loader2 size={14} className="animate-spin text-white/25" />}
                {query && !searching && (
                  <button onClick={() => { setQuery(''); setResults([]); setSelectedOrder(null); }} className="text-white/20 hover:text-white/50 transition-colors">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            <AnimatePresence mode="wait">
              {/* Selected Order Card */}
              {selectedOrder ? (
                <motion.div
                  key="order-card"
                  className="flex justify-center"
                >
                  <OrderCard
                    order={selectedOrder}
                    onClose={() => setSelectedOrder(null)}
                    onCancel={(o) => setCancelTarget(o)}
                    onEscalate={handleEscalate}
                    onReplace={handleReplace}
                    onViewManifest={handleViewManifest}
                    onAddNote={(o) => setNoteTarget(o)}
                  />
                </motion.div>
              ) : (
                /* Search Results List */
                <motion.div
                  key="results-list"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="max-w-2xl mx-auto space-y-2"
                >
                  {searching ? (
                    <div className="flex items-center justify-center py-20">
                      <Loader2 size={24} className="animate-spin text-white/20" />
                    </div>
                  ) : results.length === 0 && query ? (
                    <div className="text-center py-20">
                      <Search size={32} className="mx-auto text-white/10 mb-3" />
                      <p className="text-sm text-white/25">No orders found for "{query}"</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-[11px] text-white/25 mb-3 px-1">{results.length} result{results.length !== 1 ? 's' : ''}</p>
                      {results.map((order, i) => (
                        <SearchResultItem
                          key={`${order.orderId}-${i}`}
                          order={order}
                          onClick={(o) => setSelectedOrder(o)}
                        />
                      ))}
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ MODALS & OVERLAYS ═══ */}
      <AnimatePresence>
        {cancelTarget && (
          <CancelModal
            order={cancelTarget}
            onClose={() => setCancelTarget(null)}
            onConfirm={handleCancel}
            loading={cancelLoading}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {noteTarget && (
          <NoteModal
            order={noteTarget}
            onClose={() => setNoteTarget(null)}
            onSave={handleSaveNote}
            loading={noteLoading}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {manifestUrl && (
          <ManifestViewer url={manifestUrl} onClose={() => setManifestUrl(null)} />
        )}
      </AnimatePresence>

      {/* Drawers */}
      <HistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} />
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Toast */}
      <AnimatePresence>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </AnimatePresence>
    </motion.div>
  );
}
