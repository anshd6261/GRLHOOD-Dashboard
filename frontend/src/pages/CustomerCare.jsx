import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import axios from 'axios';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import {
  MessageSquare, Mail, Search, MoreVertical, Check, Send,
  AlertTriangle, Calendar, ChevronRight, X, Package,
  ExternalLink, Truck, XOctagon, ArrowUpRight, Filter,
  Inbox, Clock, Tag, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = import.meta.env.VITE_API_URL || '';
const API_URL = API_BASE ? `${API_BASE}/api` : '/api';

const CATEGORIES = ['general', 'order_issue', 'return', 'complaint', 'feedback', 'shipping'];
const CATEGORY_LABELS = { general: 'General', order_issue: 'Order Issue', return: 'Return', complaint: 'Complaint', feedback: 'Feedback', shipping: 'Shipping' };
const STATUS_OPTIONS = ['open', 'in_progress', 'resolved', 'spam'];
const PRIORITY_OPTIONS = ['low', 'normal', 'high', 'urgent'];

const spring = { type: 'spring', damping: 28, stiffness: 280 };

// ─── Instagram SVG Icon ───
const InstagramIcon = ({ size = 16, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

// ─── Relative time helper ───
const timeAgo = (dateStr) => {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString();
};

// ─── Stats Bar ───
const StatsBar = ({ stats, onDateClick, dateLabel }) => {
  const cards = [
    { label: 'Open', value: stats.open || 0, icon: Inbox },
    { label: 'Urgent', value: stats.urgent || 0, icon: AlertTriangle },
    { label: 'Instagram', value: stats.instagram || 0, icon: InstagramIcon },
    { label: 'Email', value: stats.email || 0, icon: Mail },
  ];

  return (
    <div className="flex items-center gap-4 mb-5">
      <div className="flex-1 grid grid-cols-4 gap-3">
        {cards.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, ...spring }}
            className="flex items-center gap-3 px-4 py-3"
            style={{
              background: 'linear-gradient(145deg, rgba(35,35,40,0.5), rgba(25,25,30,0.35))',
              backdropFilter: 'blur(16px)',
              borderRadius: '20px',
              border: '1px solid rgba(227,207,216,0.06)',
              boxShadow: '6px 6px 18px rgba(0,0,0,0.35), -3px -3px 12px rgba(60,60,70,0.06), inset 0 1px 0 rgba(227,207,216,0.04)'
            }}
          >
            <c.icon size={16} className="text-[#e3cfd8] opacity-60" />
            <div>
              <motion.span
                key={c.value}
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-lg font-bold text-[#f5f5f5] block leading-none"
              >
                {c.value}
              </motion.span>
              <span className="text-[10px] font-semibold text-[rgba(245,245,245,0.35)] uppercase tracking-wider">{c.label}</span>
            </div>
          </motion.div>
        ))}
      </div>
      <button
        onClick={onDateClick}
        className="glass-btn flex items-center gap-2 text-xs font-semibold whitespace-nowrap"
        style={{ borderRadius: '20px' }}
      >
        <Calendar size={14} className="text-[#e3cfd8] opacity-70" />
        <span>{dateLabel}</span>
      </button>
    </div>
  );
};

// ─── Sidebar ───
const Sidebar = ({ channel, setChannel, statusFilter, setStatusFilter, categoryFilter, setCategoryFilter, priorityFilter, setPriorityFilter, search, setSearch }) => {
  const channels = [
    { id: 'all', label: 'All', icon: Inbox },
    { id: 'instagram', label: 'Instagram', icon: InstagramIcon },
    { id: 'email', label: 'Email', icon: Mail },
  ];

  const FilterDropdown = ({ label, value, onChange, options, labelMap }) => (
    <div className="mb-3">
      <label className="text-[10px] font-bold text-[rgba(245,245,245,0.3)] uppercase tracking-wider mb-1.5 block">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full glass-input text-xs py-2 px-3"
        style={{ borderRadius: '14px', background: 'rgba(15,15,18,0.6)' }}
      >
        <option value="all">All</option>
        {options.map(o => <option key={o} value={o}>{labelMap?.[o] || o.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
      </select>
    </div>
  );

  return (
    <div
      className="flex-shrink-0 w-[200px] flex flex-col gap-1 p-4 mr-3 overflow-y-auto"
      style={{
        background: 'linear-gradient(145deg, rgba(35,35,40,0.5), rgba(25,25,30,0.35))',
        backdropFilter: 'blur(16px)',
        borderRadius: '20px',
        border: '1px solid rgba(227,207,216,0.06)',
        boxShadow: '6px 6px 18px rgba(0,0,0,0.35), -3px -3px 12px rgba(60,60,70,0.06), inset 0 1px 0 rgba(227,207,216,0.04)'
      }}
    >
      {/* Channel Selector */}
      <div className="mb-4">
        <label className="text-[10px] font-bold text-[rgba(245,245,245,0.3)] uppercase tracking-wider mb-2 block">Channel</label>
        {channels.map(ch => (
          <button
            key={ch.id}
            onClick={() => setChannel(ch.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 mb-1 text-xs font-semibold transition-all duration-200`}
            style={{
              borderRadius: '14px',
              background: channel === ch.id ? 'rgba(227,207,216,0.1)' : 'transparent',
              color: channel === ch.id ? '#e3cfd8' : 'rgba(245,245,245,0.4)',
              border: channel === ch.id ? '1px solid rgba(227,207,216,0.15)' : '1px solid transparent'
            }}
          >
            <ch.icon size={14} />
            <span>{ch.label}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <FilterDropdown label="Status" value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} />
      <FilterDropdown label="Category" value={categoryFilter} onChange={setCategoryFilter} options={CATEGORIES} labelMap={CATEGORY_LABELS} />
      <FilterDropdown label="Priority" value={priorityFilter} onChange={setPriorityFilter} options={PRIORITY_OPTIONS} />

      {/* Search */}
      <div className="mt-2">
        <label className="text-[10px] font-bold text-[rgba(245,245,245,0.3)] uppercase tracking-wider mb-1.5 block">Search</label>
        <div className="relative">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[rgba(245,245,245,0.25)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, handle..."
            className="glass-input w-full text-xs py-2 pl-8 pr-3"
            style={{ borderRadius: '14px' }}
          />
        </div>
      </div>
    </div>
  );
};

// ─── Query Card ───
const QueryCard = ({ query, isSelected, onClick }) => {
  const isIG = query.channel === 'instagram';
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className="w-full text-left p-3.5 mb-2 transition-all duration-200"
      style={{
        background: isSelected
          ? 'linear-gradient(145deg, rgba(227,207,216,0.08), rgba(227,207,216,0.03))'
          : 'linear-gradient(145deg, rgba(35,35,40,0.4), rgba(25,25,30,0.25))',
        borderRadius: '20px',
        border: isSelected ? '1px solid rgba(227,207,216,0.2)' : '1px solid rgba(227,207,216,0.04)',
        boxShadow: isSelected
          ? '0 0 20px rgba(227,207,216,0.04), 6px 6px 18px rgba(0,0,0,0.3)'
          : '4px 4px 12px rgba(0,0,0,0.2), -2px -2px 8px rgba(60,60,70,0.04)'
      }}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center text-sm font-bold"
          style={{
            borderRadius: '14px',
            background: isIG ? 'rgba(227,207,216,0.1)' : 'rgba(227,207,216,0.06)',
            color: '#e3cfd8'
          }}
        >
          {query.customer_name?.[0]?.toUpperCase() || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-bold text-[#f5f5f5] truncate">{query.customer_name || query.customer_handle || 'Unknown'}</span>
            {isIG ? <InstagramIcon size={11} className="text-[#e3cfd8] opacity-50 flex-shrink-0" /> : <Mail size={11} className="text-[#e3cfd8] opacity-50 flex-shrink-0" />}
          </div>
          <p className="text-[11px] text-[rgba(245,245,245,0.4)] truncate mb-1">{query.last_message_text || 'No messages'}</p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[rgba(245,245,245,0.25)]">{timeAgo(query.last_message_at)}</span>
            {query.status && query.status !== 'open' && (
              <span
                className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5"
                style={{
                  borderRadius: '8px',
                  background: query.status === 'resolved' ? 'rgba(227,207,216,0.06)' : 'rgba(227,207,216,0.1)',
                  color: query.status === 'resolved' ? 'rgba(245,245,245,0.25)' : '#e3cfd8'
                }}
              >
                {query.status.replace(/_/g, ' ')}
              </span>
            )}
            {query.category && query.category !== 'general' && (
              <span className="text-[9px] font-semibold text-[rgba(245,245,245,0.2)]">
                {CATEGORY_LABELS[query.category] || query.category}
              </span>
            )}
            {query.priority === 'urgent' && (
              <AlertTriangle size={10} className="text-[#e3cfd8]" />
            )}
          </div>
        </div>
      </div>
    </motion.button>
  );
};

// ─── Date Picker Popup ───
const DatePickerPopup = ({ isOpen, onClose, dateRange, setDateRange }) => {
  const [startDate, endDate] = dateRange;
  const presets = [
    { label: 'Today', fn: () => { const t = new Date(); t.setHours(0,0,0,0); setDateRange([t, new Date()]); onClose(); }},
    { label: 'Yesterday', fn: () => { const y = new Date(); y.setDate(y.getDate()-1); y.setHours(0,0,0,0); const ye = new Date(y); ye.setHours(23,59,59,999); setDateRange([y, ye]); onClose(); }},
    { label: 'Last 30 Days', fn: () => { const s = new Date(); s.setDate(s.getDate()-30); s.setHours(0,0,0,0); setDateRange([s, new Date()]); onClose(); }},
    { label: 'Maximum', fn: () => { setDateRange([null, null]); onClose(); }},
  ];

  const activePreset = (() => {
    if (!startDate && !endDate) return 'Maximum';
    const now = new Date();
    const today = new Date(); today.setHours(0,0,0,0);
    if (startDate && startDate.toDateString() === today.toDateString() && endDate && endDate.toDateString() === now.toDateString()) return 'Today';
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1); yesterday.setHours(0,0,0,0);
    if (startDate && startDate.toDateString() === yesterday.toDateString()) return 'Yesterday';
    const d30 = new Date(); d30.setDate(d30.getDate()-30); d30.setHours(0,0,0,0);
    if (startDate && Math.abs(startDate - d30) < 86400000) return 'Last 30 Days';
    return null;
  })();

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-start justify-end pt-20 pr-8"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={spring}
          onClick={(e) => e.stopPropagation()}
          className="flex overflow-hidden"
          style={{
            background: 'linear-gradient(160deg, rgba(30,30,35,0.95), rgba(20,20,25,0.9))',
            backdropFilter: 'blur(32px) saturate(1.4)',
            borderRadius: '20px',
            border: '1px solid rgba(227,207,216,0.1)',
            boxShadow: '0 25px 80px rgba(0,0,0,0.7), inset 0 1px 0 rgba(227,207,216,0.05)'
          }}
        >
          {/* Presets */}
          <div className="flex flex-col gap-1.5 p-4 pr-0 min-w-[140px]">
            <span className="text-[10px] font-bold text-[rgba(245,245,245,0.3)] uppercase tracking-wider mb-1">Quick Select</span>
            {presets.map(p => (
              <button
                key={p.label}
                onClick={p.fn}
                className="text-left px-3 py-2 text-xs font-semibold transition-all duration-200"
                style={{
                  borderRadius: '12px',
                  background: activePreset === p.label ? 'rgba(227,207,216,0.12)' : 'transparent',
                  color: activePreset === p.label ? '#e3cfd8' : 'rgba(245,245,245,0.45)',
                  border: activePreset === p.label ? '1px solid rgba(227,207,216,0.2)' : '1px solid transparent'
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          {/* Divider */}
          <div className="w-px my-4" style={{ background: 'rgba(227,207,216,0.08)' }} />
          {/* Calendar */}
          <div className="p-4">
            <DatePicker
              selectsRange
              inline
              startDate={startDate}
              endDate={endDate}
              onChange={(update) => {
                setDateRange(update);
                if (update[1]) onClose();
              }}
              maxDate={new Date()}
            />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// ─── PLACEHOLDER: Conversation Drawer (will be added in Step 2) ───
const ConversationDrawer = ({ query, messages, onClose, onReply, onResolve, onUpdateQuery, toast }) => {
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [attachOrderOpen, setAttachOrderOpen] = useState(false);
  const [orderInput, setOrderInput] = useState('');
  const [linkingOrder, setLinkingOrder] = useState(false);
  const [orderDetails, setOrderDetails] = useState(null);
  const messagesEndRef = useRef(null);
  const menuRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close menu on outside click
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
        setCategoryMenuOpen(false);
        setAttachOrderOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Load order details if linked
  useEffect(() => {
    if (query?.linked_order_id) {
      setOrderDetails({
        name: query.linked_order_id,
        numericId: query.linked_order_gid,
        awb: query.linked_awb,
        shopifyLink: query.linked_order_gid ? `https://${window.location.hostname}/admin/orders/${query.linked_order_gid}` : null,
        trackingLink: query.linked_awb ? `https://www.rapidshyp.com/track/${query.linked_awb}` : null
      });
    } else {
      setOrderDetails(null);
    }
  }, [query]);

  const handleSend = async () => {
    if (!replyText.trim() || sending) return;
    setSending(true);
    await onReply(replyText.trim());
    setReplyText('');
    setSending(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleLinkOrder = async () => {
    if (!orderInput.trim() || linkingOrder) return;
    setLinkingOrder(true);
    try {
      const res = await axios.post(`${API_URL}/customer-care/queries/${query.id}/link-order`, { orderName: orderInput.trim() });
      if (res.data.success) {
        setOrderDetails(res.data.orderDetails);
        setAttachOrderOpen(false);
        setMenuOpen(false);
        setOrderInput('');
        toast({ message: `Order ${res.data.orderDetails.name} linked!`, type: 'success' });
        onUpdateQuery({});
      } else {
        toast({ message: res.data.error || 'Order not found', type: 'error' });
      }
    } catch (e) {
      toast({ message: e.response?.data?.error || 'Failed to link order', type: 'error' });
    }
    setLinkingOrder(false);
  };

  const handleEscalate = async () => {
    setMenuOpen(false);
    try {
      const res = await axios.post(`${API_URL}/customer-care/queries/${query.id}/escalate`);
      if (res.data.success) {
        toast({ message: 'Escalated to #care-desk!', type: 'success' });
        onUpdateQuery({});
      } else {
        toast({ message: res.data.error || 'Escalation failed', type: 'error' });
      }
    } catch (e) {
      toast({ message: 'Escalation failed', type: 'error' });
    }
  };

  const handleCancelOrder = async () => {
    if (!orderDetails?.numericId) return;
    if (!confirm(`Cancel order ${orderDetails.name} on Shopify & RapidShyp?`)) return;
    setMenuOpen(false);
    try {
      await axios.post(`${API_URL}/orders/${orderDetails.numericId}/cancel`, { orderName: orderDetails.name });
      toast({ message: `Order ${orderDetails.name} cancelled`, type: 'success' });
    } catch (e) {
      toast({ message: 'Cancel failed', type: 'error' });
    }
  };

  const handleCategoryChange = (cat) => {
    setCategoryMenuOpen(false);
    setMenuOpen(false);
    onUpdateQuery({ category: cat });
    toast({ message: `Category: ${CATEGORY_LABELS[cat]}`, type: 'success' });
  };

  const isIG = query?.channel === 'instagram';

  const menuBtnStyle = {
    borderRadius: '14px',
    background: 'transparent',
    transition: 'all 0.2s ease',
  };

  return (
    <div
      className="h-full flex flex-col"
      style={{
        background: 'linear-gradient(145deg, rgba(35,35,40,0.5), rgba(25,25,30,0.35))',
        backdropFilter: 'blur(16px)',
        borderRadius: '20px',
        border: '1px solid rgba(227,207,216,0.06)',
        boxShadow: '6px 6px 18px rgba(0,0,0,0.35), -3px -3px 12px rgba(60,60,70,0.06), inset 0 1px 0 rgba(227,207,216,0.04)'
      }}
    >
      {/* ─── Chat Header ─── */}
      <div
        className="flex items-center gap-3 px-5 py-3.5"
        style={{ borderBottom: '1px solid rgba(227,207,216,0.06)' }}
      >
        {/* Avatar */}
        <div
          className="w-10 h-10 flex items-center justify-center text-sm font-bold flex-shrink-0"
          style={{
            borderRadius: '16px',
            background: isIG ? 'rgba(227,207,216,0.1)' : 'rgba(227,207,216,0.06)',
            color: '#e3cfd8'
          }}
        >
          {query.customer_name?.[0]?.toUpperCase() || '?'}
        </div>
        {/* Name + handle */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-[#f5f5f5] truncate">{query.customer_name || 'Unknown'}</span>
            {isIG
              ? <InstagramIcon size={13} className="text-[#e3cfd8] opacity-50 flex-shrink-0" />
              : <Mail size={13} className="text-[#e3cfd8] opacity-50 flex-shrink-0" />}
          </div>
          <span className="text-[11px] text-[rgba(245,245,245,0.3)] truncate block">{query.customer_handle}</span>
        </div>

        {/* Resolve button */}
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          onClick={onResolve}
          className="w-9 h-9 flex items-center justify-center flex-shrink-0 transition-all duration-200"
          style={{
            borderRadius: '14px',
            background: 'rgba(227,207,216,0.08)',
            border: '1px solid rgba(227,207,216,0.12)',
            color: '#e3cfd8'
          }}
          title="Resolve"
        >
          <Check size={16} />
        </motion.button>

        {/* Three-dot menu */}
        <div className="relative" ref={menuRef}>
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => { setMenuOpen(!menuOpen); setCategoryMenuOpen(false); setAttachOrderOpen(false); }}
            className="w-9 h-9 flex items-center justify-center flex-shrink-0 glass-icon-btn"
            style={{ borderRadius: '14px' }}
          >
            <MoreVertical size={16} />
          </motion.button>

          {/* Menu Dropdown */}
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -5, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -5, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-12 z-50 min-w-[200px] p-2"
                style={{
                  background: 'linear-gradient(160deg, rgba(30,30,35,0.95), rgba(20,20,25,0.9))',
                  backdropFilter: 'blur(32px) saturate(1.4)',
                  borderRadius: '20px',
                  border: '1px solid rgba(227,207,216,0.1)',
                  boxShadow: '0 20px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(227,207,216,0.05)'
                }}
              >
                {/* Attach Order */}
                <button
                  onClick={() => { setAttachOrderOpen(!attachOrderOpen); setCategoryMenuOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-semibold text-[rgba(245,245,245,0.6)] hover:text-[#e3cfd8] hover:bg-[rgba(227,207,216,0.06)] transition-all duration-200"
                  style={menuBtnStyle}
                >
                  <Package size={14} />
                  <span>{orderDetails ? `Order: ${orderDetails.name}` : 'Attach Order'}</span>
                </button>

                {/* Attach Order Input */}
                <AnimatePresence>
                  {attachOrderOpen && !orderDetails && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden px-2 pb-1"
                    >
                      <div className="flex gap-1.5 mt-1">
                        <input
                          type="text"
                          value={orderInput}
                          onChange={(e) => setOrderInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleLinkOrder()}
                          placeholder="Order # (e.g. 3419)"
                          className="glass-input flex-1 text-xs py-1.5 px-2.5"
                          style={{ borderRadius: '12px', fontSize: '11px' }}
                          autoFocus
                        />
                        <button
                          onClick={handleLinkOrder}
                          disabled={linkingOrder}
                          className="glass-btn-accent px-2.5 py-1.5 text-[10px] font-bold"
                          style={{ borderRadius: '12px' }}
                        >
                          {linkingOrder ? <RefreshCw size={10} className="animate-spin" /> : 'Link'}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Order-linked actions */}
                {orderDetails && (
                  <>
                    {orderDetails.trackingLink && (
                      <a
                        href={orderDetails.trackingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setMenuOpen(false)}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-semibold text-[rgba(245,245,245,0.6)] hover:text-[#e3cfd8] hover:bg-[rgba(227,207,216,0.06)] transition-all duration-200"
                        style={menuBtnStyle}
                      >
                        <Truck size={14} />
                        <span>Track ({orderDetails.awb})</span>
                        <ArrowUpRight size={10} className="ml-auto opacity-40" />
                      </a>
                    )}
                    {orderDetails.numericId && (
                      <a
                        href={`https://${import.meta.env.VITE_SHOPIFY_DOMAIN || 'your-store.myshopify.com'}/admin/orders/${orderDetails.numericId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setMenuOpen(false)}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-semibold text-[rgba(245,245,245,0.6)] hover:text-[#e3cfd8] hover:bg-[rgba(227,207,216,0.06)] transition-all duration-200"
                        style={menuBtnStyle}
                      >
                        <ExternalLink size={14} />
                        <span>Open in Shopify</span>
                        <ArrowUpRight size={10} className="ml-auto opacity-40" />
                      </a>
                    )}
                    <button
                      onClick={handleCancelOrder}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-semibold text-[rgba(245,245,245,0.6)] hover:text-[#e3cfd8] hover:bg-[rgba(227,207,216,0.06)] transition-all duration-200"
                      style={menuBtnStyle}
                    >
                      <XOctagon size={14} />
                      <span>Cancel Order</span>
                    </button>
                  </>
                )}

                {/* Divider */}
                <div className="my-1.5 mx-2" style={{ height: '1px', background: 'rgba(227,207,216,0.06)' }} />

                {/* Escalate */}
                <button
                  onClick={handleEscalate}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-semibold text-[rgba(245,245,245,0.6)] hover:text-[#e3cfd8] hover:bg-[rgba(227,207,216,0.06)] transition-all duration-200"
                  style={menuBtnStyle}
                >
                  <AlertTriangle size={14} />
                  <span>Escalate to Slack</span>
                </button>

                {/* Category */}
                <div className="relative">
                  <button
                    onClick={() => setCategoryMenuOpen(!categoryMenuOpen)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-semibold text-[rgba(245,245,245,0.6)] hover:text-[#e3cfd8] hover:bg-[rgba(227,207,216,0.06)] transition-all duration-200"
                    style={menuBtnStyle}
                  >
                    <Tag size={14} />
                    <span>Category: {CATEGORY_LABELS[query.category] || 'General'}</span>
                    <ChevronRight size={12} className="ml-auto opacity-40" />
                  </button>

                  {/* Category submenu */}
                  <AnimatePresence>
                    {categoryMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, x: -5 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -5 }}
                        className="absolute right-full top-0 mr-2 p-2 min-w-[160px]"
                        style={{
                          background: 'linear-gradient(160deg, rgba(30,30,35,0.95), rgba(20,20,25,0.9))',
                          backdropFilter: 'blur(32px)',
                          borderRadius: '16px',
                          border: '1px solid rgba(227,207,216,0.1)',
                          boxShadow: '0 15px 40px rgba(0,0,0,0.5)'
                        }}
                      >
                        {CATEGORIES.map(cat => (
                          <button
                            key={cat}
                            onClick={() => handleCategoryChange(cat)}
                            className="w-full text-left px-3 py-2 text-xs font-semibold transition-all duration-200"
                            style={{
                              borderRadius: '10px',
                              color: query.category === cat ? '#e3cfd8' : 'rgba(245,245,245,0.5)',
                              background: query.category === cat ? 'rgba(227,207,216,0.1)' : 'transparent'
                            }}
                          >
                            {CATEGORY_LABELS[cat]}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Close button */}
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center flex-shrink-0 glass-icon-btn"
          style={{ borderRadius: '14px' }}
        >
          <X size={16} />
        </motion.button>
      </div>

      {/* ─── Messages Area ─── */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-[rgba(245,245,245,0.15)] font-semibold">No messages yet</p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isOutbound = msg.direction === 'outbound';
            return (
              <motion.div
                key={msg.id || i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className="max-w-[75%]"
                  style={{
                    background: isOutbound
                      ? 'linear-gradient(145deg, rgba(227,207,216,0.1), rgba(227,207,216,0.04))'
                      : 'linear-gradient(145deg, rgba(35,35,40,0.6), rgba(28,28,32,0.4))',
                    borderRadius: '20px',
                    border: isOutbound
                      ? '1px solid rgba(227,207,216,0.12)'
                      : '1px solid rgba(227,207,216,0.04)',
                    boxShadow: isOutbound
                      ? '4px 4px 12px rgba(0,0,0,0.2), inset 0 1px 0 rgba(227,207,216,0.06)'
                      : '4px 4px 12px rgba(0,0,0,0.25), -2px -2px 8px rgba(60,60,70,0.04), inset 0 1px 0 rgba(227,207,216,0.03)',
                    padding: '12px 16px'
                  }}
                >
                  <p className="text-[10px] font-semibold mb-1" style={{ color: isOutbound ? '#e3cfd8' : 'rgba(245,245,245,0.35)' }}>
                    {isOutbound ? 'You' : (msg.sender_name || msg.sender_handle || 'Customer')}
                  </p>
                  <p className="text-[13px] text-[#f5f5f5] leading-relaxed whitespace-pre-wrap break-words">
                    {msg.body}
                  </p>
                  <p className="text-[9px] text-[rgba(245,245,245,0.2)] mt-1.5 text-right">
                    {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </p>
                </div>
              </motion.div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ─── Reply Bar ─── */}
      <div
        className="px-4 py-3 flex items-end gap-2.5"
        style={{ borderTop: '1px solid rgba(227,207,216,0.06)' }}
      >
        <textarea
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Reply to ${query.customer_name || 'customer'}...`}
          rows={1}
          className="glass-input flex-1 text-sm py-2.5 px-4 resize-none"
          style={{
            borderRadius: '20px',
            minHeight: '42px',
            maxHeight: '120px'
          }}
          onInput={(e) => {
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
          }}
        />
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          onClick={handleSend}
          disabled={!replyText.trim() || sending}
          className="flex-shrink-0 w-10 h-10 flex items-center justify-center transition-all duration-200"
          style={{
            borderRadius: '16px',
            background: replyText.trim()
              ? 'linear-gradient(135deg, rgba(227,207,216,0.2), rgba(227,207,216,0.08))'
              : 'rgba(227,207,216,0.04)',
            border: replyText.trim()
              ? '1px solid rgba(227,207,216,0.25)'
              : '1px solid rgba(227,207,216,0.06)',
            color: replyText.trim() ? '#e3cfd8' : 'rgba(245,245,245,0.2)',
            boxShadow: replyText.trim() ? '0 0 15px rgba(227,207,216,0.06)' : 'none'
          }}
        >
          {sending ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
        </motion.button>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════
const CustomerCare = () => {
  // State
  const [queries, setQueries] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [selectedQueryId, setSelectedQueryId] = useState(null);
  const [selectedQuery, setSelectedQuery] = useState(null);
  const [messages, setMessages] = useState([]);
  const [toast, setToast] = useState(null);

  // Filters
  const [channel, setChannel] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState([null, null]);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const hasInitialized = useRef(false);

  // Toast auto-dismiss
  useEffect(() => { if (toast) setTimeout(() => setToast(null), 3000); }, [toast]);

  // Date label
  const dateLabel = useMemo(() => {
    const [start, end] = dateRange;
    if (!start && !end) return 'All Time';
    if (start && !end) return start.toLocaleDateString();
    if (start && end) {
      if (start.toDateString() === end.toDateString()) return start.toLocaleDateString();
      return `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`;
    }
    return 'Select Dates';
  }, [dateRange]);

  // Fetch queries
  const fetchQueries = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (channel !== 'all') params.set('channel', channel);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      if (priorityFilter !== 'all') params.set('priority', priorityFilter);
      if (search) params.set('search', search);
      if (dateRange[0]) { const d = new Date(dateRange[0]); d.setHours(0,0,0,0); params.set('startDate', d.toISOString()); }
      if (dateRange[1]) { const d = new Date(dateRange[1]); d.setHours(23,59,59,999); params.set('endDate', d.toISOString()); }

      const res = await axios.get(`${API_URL}/customer-care/queries?${params.toString()}`);
      if (res.data.success) setQueries(res.data.queries);
    } catch (e) {
      console.error('Fetch queries error:', e);
    }
  }, [channel, statusFilter, categoryFilter, priorityFilter, search, dateRange]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/customer-care/stats`);
      if (res.data.success) setStats(res.data.stats);
    } catch (e) {
      console.error('Fetch stats error:', e);
    }
  }, []);

  // Initial sync + fetch
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    setLoading(true);
    axios.post(`${API_URL}/customer-care/sync`).then(() => {
      return Promise.all([fetchQueries(), fetchStats()]);
    }).catch(console.error).finally(() => setLoading(false));
  }, [fetchQueries, fetchStats]);

  // Refetch on filter change
  useEffect(() => {
    if (hasInitialized.current) fetchQueries();
  }, [fetchQueries]);

  // Fetch single query messages
  const selectQuery = useCallback(async (queryId) => {
    setSelectedQueryId(queryId);
    try {
      const res = await axios.get(`${API_URL}/customer-care/queries/${queryId}`);
      if (res.data.success) {
        setSelectedQuery(res.data.query);
        setMessages(res.data.messages);
      }
    } catch (e) {
      console.error('Fetch query detail error:', e);
      setToast({ message: 'Failed to load conversation', type: 'error' });
    }
  }, []);

  // Reply handler
  const handleReply = useCallback(async (message) => {
    if (!selectedQueryId) return;
    try {
      const res = await axios.post(`${API_URL}/customer-care/queries/${selectedQueryId}/reply`, { message });
      if (res.data.success) {
        setMessages(prev => [...prev, {
          id: Date.now(),
          external_id: res.data.messageId,
          channel: selectedQuery?.channel,
          direction: 'outbound',
          sender_name: 'GRLHOOD',
          body: message,
          timestamp: new Date().toISOString()
        }]);
        setToast({ message: 'Reply sent!', type: 'success' });
        fetchQueries();
        fetchStats();
      } else {
        setToast({ message: res.data.error || 'Failed to send', type: 'error' });
      }
    } catch (e) {
      setToast({ message: 'Failed to send reply', type: 'error' });
    }
  }, [selectedQueryId, selectedQuery, fetchQueries, fetchStats]);

  // Resolve handler
  const handleResolve = useCallback(async () => {
    if (!selectedQueryId) return;
    try {
      await axios.patch(`${API_URL}/customer-care/queries/${selectedQueryId}`, { status: 'resolved' });
      setToast({ message: 'Query resolved', type: 'success' });
      setSelectedQueryId(null);
      setSelectedQuery(null);
      setMessages([]);
      fetchQueries();
      fetchStats();
    } catch (e) {
      setToast({ message: 'Failed to resolve', type: 'error' });
    }
  }, [selectedQueryId, fetchQueries, fetchStats]);

  // Update query handler
  const handleUpdateQuery = useCallback(async (updates) => {
    if (!selectedQueryId) return;
    try {
      const res = await axios.patch(`${API_URL}/customer-care/queries/${selectedQueryId}`, updates);
      if (res.data.success) {
        setSelectedQuery(res.data.query);
        fetchQueries();
        fetchStats();
      }
    } catch (e) {
      setToast({ message: 'Failed to update', type: 'error' });
    }
  }, [selectedQueryId, fetchQueries, fetchStats]);

  return (
    <div className="max-w-[1400px] mx-auto px-2">
      {/* Stats Bar */}
      <StatsBar
        stats={stats}
        onDateClick={() => setShowDatePicker(true)}
        dateLabel={dateLabel}
      />

      {/* Date Picker Popup */}
      <DatePickerPopup
        isOpen={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        dateRange={dateRange}
        setDateRange={setDateRange}
      />

      {/* Main Content Area */}
      <div className="flex" style={{ height: 'calc(100vh - 180px)' }}>
        {/* Sidebar */}
        <Sidebar
          channel={channel} setChannel={setChannel}
          statusFilter={statusFilter} setStatusFilter={setStatusFilter}
          categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter}
          priorityFilter={priorityFilter} setPriorityFilter={setPriorityFilter}
          search={search} setSearch={setSearch}
        />

        {/* Query Feed */}
        <motion.div
          className="flex-1 overflow-y-auto pr-3"
          animate={{ marginRight: selectedQueryId ? '0px' : '0px' }}
          style={{ minWidth: 0 }}
        >
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw size={20} className="animate-spin text-[#e3cfd8] opacity-40" />
            </div>
          ) : queries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Inbox size={40} className="text-[rgba(245,245,245,0.1)] mb-3" />
              <p className="text-sm text-[rgba(245,245,245,0.2)] font-semibold">No queries found</p>
              <p className="text-xs text-[rgba(245,245,245,0.12)] mt-1">Try adjusting your filters</p>
            </div>
          ) : (
            queries.map(q => (
              <QueryCard
                key={q.id}
                query={q}
                isSelected={selectedQueryId === q.id}
                onClick={() => selectQuery(q.id)}
              />
            ))
          )}
        </motion.div>

        {/* Conversation Drawer */}
        <AnimatePresence>
          {selectedQueryId && selectedQuery && (
            <motion.div
              key="drawer"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: '55%', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={spring}
              className="flex-shrink-0 overflow-hidden ml-3"
            >
              <ConversationDrawer
                query={selectedQuery}
                messages={messages}
                onClose={() => { setSelectedQueryId(null); setSelectedQuery(null); setMessages([]); }}
                onReply={handleReply}
                onResolve={handleResolve}
                onUpdateQuery={handleUpdateQuery}
                toast={setToast}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed bottom-8 right-8 z-[300] px-5 py-3 flex items-center gap-3 backdrop-blur-xl"
            style={{
              background: 'rgba(26,26,30,0.9)',
              borderRadius: '20px',
              border: '1px solid rgba(227,207,216,0.2)',
              boxShadow: '0 10px 40px rgba(0,0,0,0.5)'
            }}
          >
            {toast.type === 'error'
              ? <X size={16} className="text-[#e3cfd8] opacity-60" />
              : <Check size={16} className="text-[#e3cfd8]" />}
            <span className="font-bold text-sm text-[#f5f5f5]">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CustomerCare;
