import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Phone, MessageSquare, Mail, Clock, CheckCircle2,
  AlertCircle, XCircle, User, ChevronRight, Filter,
  ArrowUpRight, ArrowDownRight, BarChart3, Inbox,
  SendHorizonal, Paperclip, MoreVertical, Star,
  RefreshCw, Tag, Hash, Circle
} from 'lucide-react';

/* ═══════════════════════════════════════════
   MOCK DATA — replace with real API later
   ═══════════════════════════════════════════ */
const MOCK_TICKETS = [
  { id: 'TKT-1042', customer: 'Priya Sharma', phone: '+91 98765 43210', email: 'priya@gmail.com', subject: 'Order not received — 7 days past EDD', status: 'open', priority: 'high', channel: 'whatsapp', created: '2026-04-01T14:30:00', lastReply: '2026-04-02T09:15:00', orderRef: '#GRL-4821', messages: 3, tags: ['delivery', 'escalated'] },
  { id: 'TKT-1041', customer: 'Ananya Gupta', phone: '+91 91234 56789', email: 'ananya.g@yahoo.com', subject: 'Wrong size delivered — need exchange', status: 'in-progress', priority: 'medium', channel: 'email', created: '2026-04-01T11:20:00', lastReply: '2026-04-01T18:45:00', orderRef: '#GRL-4798', messages: 5, tags: ['exchange', 'size-issue'] },
  { id: 'TKT-1040', customer: 'Meera Patel', phone: '+91 87654 32100', email: 'meera.p@outlook.com', subject: 'Refund not processed after 10 days', status: 'open', priority: 'high', channel: 'phone', created: '2026-03-31T16:00:00', lastReply: '2026-04-01T10:30:00', orderRef: '#GRL-4756', messages: 4, tags: ['refund', 'urgent'] },
  { id: 'TKT-1039', customer: 'Kavya Reddy', phone: '+91 99887 76655', email: 'kavya.r@gmail.com', subject: 'Product quality complaint — fabric issue', status: 'in-progress', priority: 'medium', channel: 'whatsapp', created: '2026-03-31T09:10:00', lastReply: '2026-03-31T15:20:00', orderRef: '#GRL-4712', messages: 6, tags: ['quality', 'complaint'] },
  { id: 'TKT-1038', customer: 'Riya Nair', phone: '+91 77665 54433', email: 'riya.n@icloud.com', subject: 'Address change request before shipping', status: 'resolved', priority: 'low', channel: 'email', created: '2026-03-30T13:45:00', lastReply: '2026-03-30T14:10:00', orderRef: '#GRL-4689', messages: 2, tags: ['address-change'] },
  { id: 'TKT-1037', customer: 'Divya Singh', phone: '+91 88776 65544', email: 'divya.s@gmail.com', subject: 'COD order — wants to prepay now', status: 'resolved', priority: 'low', channel: 'whatsapp', created: '2026-03-30T10:00:00', lastReply: '2026-03-30T11:30:00', orderRef: '#GRL-4665', messages: 3, tags: ['payment', 'cod'] },
  { id: 'TKT-1036', customer: 'Ishita Verma', phone: '+91 99001 12233', email: 'ishita.v@hotmail.com', subject: 'Order cancelled but amount deducted', status: 'open', priority: 'high', channel: 'phone', created: '2026-03-29T17:30:00', lastReply: '2026-03-30T09:00:00', orderRef: '#GRL-4631', messages: 7, tags: ['refund', 'cancellation', 'escalated'] },
  { id: 'TKT-1035', customer: 'Sneha Joshi', phone: '+91 70098 87766', email: 'sneha.j@gmail.com', subject: 'Tracking not updating for 3 days', status: 'in-progress', priority: 'medium', channel: 'email', created: '2026-03-29T12:15:00', lastReply: '2026-03-29T16:40:00', orderRef: '#GRL-4598', messages: 4, tags: ['tracking', 'shipping'] },
];

const MOCK_MESSAGES = [
  { id: 1, sender: 'customer', text: 'Hi, my order #GRL-4821 was supposed to arrive 7 days ago but I still haven\'t received it. Can you help?', time: '2:30 PM' },
  { id: 2, sender: 'agent', text: 'Hi Priya! I\'m so sorry about the delay. Let me check the tracking status for your order right away.', time: '2:35 PM' },
  { id: 3, sender: 'agent', text: 'I can see your order is currently stuck at the local hub. I\'ve raised an escalation with our shipping partner. You should receive it within 24-48 hours.', time: '2:38 PM' },
  { id: 4, sender: 'customer', text: 'Thank you! Please keep me updated.', time: '9:15 AM' },
];

/* ═══════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════ */
const statusConfig = {
  'open': { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)', label: 'Open', icon: AlertCircle },
  'in-progress': { color: '#3B82F6', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.25)', label: 'In Progress', icon: Clock },
  'resolved': { color: '#10B981', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.25)', label: 'Resolved', icon: CheckCircle2 },
  'closed': { color: '#6B7280', bg: 'rgba(107,114,128,0.1)', border: 'rgba(107,114,128,0.25)', label: 'Closed', icon: XCircle },
};

const priorityConfig = {
  'high': { color: '#EF4444', dot: '#EF4444' },
  'medium': { color: '#F59E0B', dot: '#F59E0B' },
  'low': { color: '#10B981', dot: '#10B981' },
};

const channelIcon = {
  'whatsapp': MessageSquare,
  'email': Mail,
  'phone': Phone,
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ═══════════════════════════════════════════
   METRIC CARD
   ═══════════════════════════════════════════ */
function MetricCard({ label, value, delta, deltaType, icon: Icon, accent }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card-sm p-5 flex flex-col gap-3 relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-[0.04]" style={{ background: accent, filter: 'blur(30px)', transform: 'translate(30%, -30%)' }} />
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest" style={{ color: 'rgba(245,245,245,0.4)' }}>{label}</span>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${accent}15` }}>
          <Icon size={15} style={{ color: accent }} />
        </div>
      </div>
      <div className="flex items-end gap-3">
        <span className="text-3xl font-bold text-[#f5f5f5]">{value}</span>
        {delta != null && (
          <span className={`text-xs font-medium flex items-center gap-1 mb-1 ${deltaType === 'up' ? 'text-red-400' : 'text-emerald-400'}`}>
            {deltaType === 'up' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {delta}%
          </span>
        )}
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   TICKET ROW
   ═══════════════════════════════════════════ */
function TicketRow({ ticket, isSelected, onClick }) {
  const st = statusConfig[ticket.status];
  const pr = priorityConfig[ticket.priority];
  const ChannelIcon = channelIcon[ticket.channel] || MessageSquare;

  return (
    <motion.div
      layout
      onClick={onClick}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className={`p-4 cursor-pointer transition-all duration-200 border-b border-[rgba(255,255,255,0.04)] hover:bg-[rgba(227,207,216,0.04)] ${isSelected ? 'bg-[rgba(227,207,216,0.06)] border-l-2 border-l-[#e3cfd8]' : 'border-l-2 border-l-transparent'}`}
    >
      <div className="flex items-start gap-3">
        {/* Priority dot */}
        <div className="mt-1.5">
          <Circle size={8} fill={pr.dot} color={pr.dot} />
        </div>

        <div className="flex-1 min-w-0">
          {/* Top line */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-mono" style={{ color: 'rgba(245,245,245,0.3)' }}>{ticket.id}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ color: st.color, background: st.bg, border: `1px solid ${st.border}` }}>
              {st.label}
            </span>
            <ChannelIcon size={12} style={{ color: 'rgba(245,245,245,0.3)' }} />
          </div>

          {/* Subject */}
          <p className="text-sm font-medium text-[#f5f5f5] truncate mb-1">{ticket.subject}</p>

          {/* Bottom line */}
          <div className="flex items-center gap-3 text-[11px]" style={{ color: 'rgba(245,245,245,0.35)' }}>
            <span className="flex items-center gap-1"><User size={10} /> {ticket.customer}</span>
            <span>{ticket.orderRef}</span>
            <span className="ml-auto flex items-center gap-1"><Clock size={10} /> {timeAgo(ticket.lastReply)}</span>
          </div>

          {/* Tags */}
          {ticket.tags?.length > 0 && (
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {ticket.tags.map(tag => (
                <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ color: '#e3cfd8', background: 'rgba(227,207,216,0.08)', border: '1px solid rgba(227,207,216,0.12)' }}>
                  <Tag size={8} className="inline mr-1" style={{ verticalAlign: 'middle' }} />{tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <ChevronRight size={16} style={{ color: 'rgba(245,245,245,0.15)', marginTop: 4 }} />
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   CHAT PANEL
   ═══════════════════════════════════════════ */
function ChatPanel({ ticket }) {
  const [reply, setReply] = useState('');

  if (!ticket) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4" style={{ color: 'rgba(245,245,245,0.2)' }}>
        <Inbox size={48} strokeWidth={1} />
        <p className="text-sm">Select a ticket to view conversation</p>
      </div>
    );
  }

  const st = statusConfig[ticket.status];
  const StatusIcon = st.icon;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Chat Header */}
      <div className="px-5 py-4 border-b border-[rgba(255,255,255,0.06)] flex items-center gap-4">
        {/* Customer avatar */}
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: 'rgba(227,207,216,0.12)', color: '#e3cfd8' }}>
          {ticket.customer.split(' ').map(n => n[0]).join('')}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-semibold text-[#f5f5f5]">{ticket.customer}</h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ color: st.color, background: st.bg, border: `1px solid ${st.border}` }}>
              <StatusIcon size={10} className="inline mr-1" style={{ verticalAlign: 'middle' }} />{st.label}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] mt-0.5" style={{ color: 'rgba(245,245,245,0.35)' }}>
            <span>{ticket.orderRef}</span>
            <span>·</span>
            <span>{ticket.email}</span>
            <span>·</span>
            <span>{ticket.phone}</span>
          </div>
        </div>
        {/* Actions */}
        <div className="flex items-center gap-2">
          <button className="glass-icon-btn-sm" title="Call"><Phone size={14} /></button>
          <button className="glass-icon-btn-sm" title="WhatsApp"><MessageSquare size={14} /></button>
          <button className="glass-icon-btn-sm" title="Star"><Star size={14} /></button>
          <button className="glass-icon-btn-sm" title="More"><MoreVertical size={14} /></button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 custom-scrollbar">
        {/* Subject banner */}
        <div className="text-center mb-6">
          <span className="text-[11px] px-3 py-1.5 rounded-full" style={{ color: 'rgba(245,245,245,0.4)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {ticket.subject}
          </span>
        </div>

        {MOCK_MESSAGES.map(msg => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${msg.sender === 'agent' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[75%] px-4 py-3 rounded-2xl text-[13px] leading-relaxed ${
                msg.sender === 'agent'
                  ? 'rounded-br-md'
                  : 'rounded-bl-md'
              }`}
              style={{
                background: msg.sender === 'agent' ? 'rgba(227,207,216,0.12)' : 'rgba(255,255,255,0.06)',
                color: '#f5f5f5',
                border: msg.sender === 'agent' ? '1px solid rgba(227,207,216,0.15)' : '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {msg.text}
              <div className="text-[10px] mt-1.5" style={{ color: 'rgba(245,245,245,0.3)' }}>
                {msg.time}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Reply Box */}
      <div className="px-4 py-3 border-t border-[rgba(255,255,255,0.06)]">
        <div className="flex items-end gap-3 glass-card-sm p-3 rounded-2xl">
          <button className="glass-icon-btn-sm flex-shrink-0 mb-0.5"><Paperclip size={14} /></button>
          <textarea
            value={reply}
            onChange={e => setReply(e.target.value)}
            placeholder="Type a reply..."
            rows={1}
            className="flex-1 bg-transparent text-sm text-[#f5f5f5] placeholder:text-[rgba(245,245,245,0.25)] resize-none outline-none"
            style={{ minHeight: 24, maxHeight: 120 }}
            onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
          />
          <button
            className="glass-btn-accent flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
            onClick={() => setReply('')}
          >
            <SendHorizonal size={16} />
          </button>
        </div>
        {/* Quick actions */}
        <div className="flex items-center gap-2 mt-2 px-1">
          <button className="text-[10px] px-2.5 py-1 rounded-full transition-colors" style={{ color: 'rgba(245,245,245,0.4)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            Mark Resolved
          </button>
          <button className="text-[10px] px-2.5 py-1 rounded-full transition-colors" style={{ color: 'rgba(245,245,245,0.4)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            Escalate
          </button>
          <button className="text-[10px] px-2.5 py-1 rounded-full transition-colors" style={{ color: 'rgba(245,245,245,0.4)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            Request Info
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN DASHBOARD
   ═══════════════════════════════════════════ */
export default function CustomerCareDashboard() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedTicket, setSelectedTicket] = useState(null);

  const filteredTickets = useMemo(() => {
    return MOCK_TICKETS.filter(t => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          t.customer.toLowerCase().includes(q) ||
          t.subject.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q) ||
          t.orderRef.toLowerCase().includes(q) ||
          t.tags.some(tag => tag.includes(q))
        );
      }
      return true;
    });
  }, [searchQuery, statusFilter]);

  const metrics = useMemo(() => ({
    open: MOCK_TICKETS.filter(t => t.status === 'open').length,
    inProgress: MOCK_TICKETS.filter(t => t.status === 'in-progress').length,
    resolved: MOCK_TICKETS.filter(t => t.status === 'resolved').length,
    avgResponse: '18m',
  }), []);

  const statusFilters = [
    { id: 'all', label: 'All', count: MOCK_TICKETS.length },
    { id: 'open', label: 'Open', count: metrics.open },
    { id: 'in-progress', label: 'In Progress', count: metrics.inProgress },
    { id: 'resolved', label: 'Resolved', count: metrics.resolved },
  ];

  return (
    <motion.div
      key="customer-care"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      {/* ─── Metrics Row ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MetricCard label="Open Tickets" value={metrics.open} delta={12} deltaType="up" icon={AlertCircle} accent="#F59E0B" />
        <MetricCard label="In Progress" value={metrics.inProgress} icon={Clock} accent="#3B82F6" />
        <MetricCard label="Resolved Today" value={metrics.resolved} delta={8} deltaType="down" icon={CheckCircle2} accent="#10B981" />
        <MetricCard label="Avg Response" value={metrics.avgResponse} icon={BarChart3} accent="#e3cfd8" />
      </div>

      {/* ─── Main Split View ─── */}
      <div className="glass-card rounded-2xl overflow-hidden flex" style={{ height: 'calc(100vh - 280px)', minHeight: 500 }}>

        {/* Left: Ticket List */}
        <div className="w-[380px] flex-shrink-0 border-r border-[rgba(255,255,255,0.06)] flex flex-col">

          {/* Search & Filter Bar */}
          <div className="px-4 pt-4 pb-2">
            <div className="glass-input flex items-center gap-2 px-3 py-2 rounded-xl">
              <Search size={14} style={{ color: 'rgba(245,245,245,0.35)' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search tickets, customers, orders..."
                className="bg-transparent text-sm text-[#f5f5f5] placeholder:text-[rgba(245,245,245,0.25)] outline-none flex-1"
              />
            </div>
          </div>

          {/* Status Filter Pills */}
          <div className="flex items-center gap-1.5 px-4 pb-3 overflow-x-auto custom-scrollbar">
            {statusFilters.map(f => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                className={`text-[11px] px-3 py-1.5 rounded-full whitespace-nowrap font-medium transition-all ${
                  statusFilter === f.id
                    ? 'glass-pill-active'
                    : 'glass-pill'
                }`}
              >
                {f.label}
                <span className="ml-1.5 text-[10px] opacity-60">{f.count}</span>
              </button>
            ))}
          </div>

          {/* Ticket List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <AnimatePresence>
              {filteredTickets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16" style={{ color: 'rgba(245,245,245,0.2)' }}>
                  <Inbox size={32} strokeWidth={1} />
                  <p className="text-xs mt-3">No tickets found</p>
                </div>
              ) : (
                filteredTickets.map(ticket => (
                  <TicketRow
                    key={ticket.id}
                    ticket={ticket}
                    isSelected={selectedTicket?.id === ticket.id}
                    onClick={() => setSelectedTicket(ticket)}
                  />
                ))
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right: Chat / Detail */}
        <ChatPanel ticket={selectedTicket} />
      </div>
    </motion.div>
  );
}
