import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Package, Truck, User, MapPin, Calendar, Smartphone, FileText, Download,
  ExternalLink, AlertTriangle, ShieldCheck, Phone, MessageSquare,
  CreditCard, Hash, Tag, Sparkles, TrendingUp, Activity
} from 'lucide-react';

function RiskGauge({ score, level }) {
  const pct = Math.min(score || 0, 100);
  const color = level === 'High' ? '#ff1493' : level === 'Medium' ? '#e3cfd8' : '#34d399';
  const bgColor = level === 'High' ? 'rgba(255,20,147,0.1)' : level === 'Medium' ? 'rgba(227,207,216,0.08)' : 'rgba(52,211,153,0.08)';

  return (
    <div className="flex items-center gap-4">
      <div className="relative w-20 h-20">
        <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
          <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(245,245,245,0.06)" strokeWidth="6" />
          <motion.circle
            cx="40" cy="40" r="34" fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 34}`}
            initial={{ strokeDashoffset: 2 * Math.PI * 34 }}
            animate={{ strokeDashoffset: 2 * Math.PI * 34 * (1 - pct / 100) }}
            transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
            style={{ filter: `drop-shadow(0 0 8px ${color}50)` }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.span
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, type: 'spring' }}
            className="text-2xl font-black text-white"
          >
            {score ? `${score}%` : 'N/A'}
          </motion.span>
        </div>
      </div>
      <div>
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-xl inline-block"
          style={{ background: bgColor, border: `1px solid ${color}30`, color }}
        >
          {level || 'Unknown'} Risk
        </motion.div>
        <div className="text-[10px] text-[rgba(245,245,245,0.35)] uppercase font-bold tracking-widest mt-1.5 flex items-center gap-1">
          <Sparkles size={10} /> XGBoost AI Model
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono, accent }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-[rgba(245,245,245,0.4)]">{label}</span>
      <span className={`font-bold ${mono ? 'font-mono' : ''} ${accent ? 'text-[#e3cfd8]' : 'text-white'}`}>
        {value || 'N/A'}
      </span>
    </div>
  );
}

const sectionVariant = {
  hidden: { opacity: 0, y: 15 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.4, ease: 'easeOut' }
  }),
};

export default function AestheticDetailModal({ order, onClose }) {
  if (!order) return null;

  const phone = order.shippingDetails?.phone || '';
  const cleanPhone = phone.replace(/[^0-9]/g, '');

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-xl">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0"
        onClick={onClose}
      />

      <motion.div
        initial={{ scale: 0.88, y: 30, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 10, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto no-scrollbar glass-panel rounded-3xl border border-[rgba(227,207,216,0.15)] shadow-[0_25px_80px_rgba(0,0,0,0.7)] p-0 flex flex-col"
      >
        {/* Header with gradient */}
        <div className="relative px-6 sm:px-8 pt-6 pb-5 border-b border-[rgba(227,207,216,0.1)]">
          <div className="absolute inset-0 bg-gradient-to-b from-[rgba(227,207,216,0.03)] to-transparent pointer-events-none rounded-t-3xl" />
          <div className="relative flex justify-between items-start">
            <motion.div initial={{ opacity: 0, x: -15 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-3xl font-black text-white tracking-tight glow-text">{order.orderId}</h2>
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.3, type: 'spring' }}
                  className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-xl border bg-[rgba(227,207,216,0.1)] text-[#e3cfd8] border-[rgba(227,207,216,0.2)]"
                >
                  {order.fulfillmentStatus || 'UNFULFILLED'}
                </motion.span>
              </div>
              <p className="text-sm text-[rgba(245,245,245,0.4)] font-medium flex items-center gap-1.5">
                <Calendar size={13} className="opacity-60" />
                {order.createdAt ? new Date(order.createdAt).toLocaleString() : 'Date unavailable'}
              </p>
            </motion.div>
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              className="p-2 rounded-xl bg-[rgba(245,245,245,0.05)] hover:bg-[rgba(245,245,245,0.1)] transition-colors text-white"
            >
              <X size={20} />
            </motion.button>
          </div>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-6 sm:p-8">

          {/* Product Specs — All Units */}
          <motion.div custom={0} variants={sectionVariant} initial="hidden" animate="visible" className="glass-card-sm p-5 space-y-4">
            <h3 className="text-[10px] uppercase tracking-widest text-[rgba(245,245,245,0.4)] font-bold flex items-center gap-2">
              <Package size={14} /> Product Specs
              {(order.allItems?.length || 1) > 1 && (
                <span className="ml-auto text-[9px] text-[#e3cfd8] bg-[rgba(227,207,216,0.1)] px-2 py-0.5 rounded-full border border-[rgba(227,207,216,0.15)]">
                  {order.allItems.length} units
                </span>
              )}
            </h3>
            {(order.allItems || [order]).map((item, idx) => (
              <div key={idx} className={`${idx > 0 ? 'pt-3 border-t border-[rgba(227,207,216,0.06)]' : ''}`}>
                <div className="flex items-center gap-4">
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    className="w-14 h-14 rounded-2xl bg-[rgba(227,207,216,0.05)] border border-[rgba(227,207,216,0.1)] overflow-hidden shrink-0"
                  >
                    {item.thumbnail ? (
                      <img src={item.thumbnail} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[rgba(245,245,245,0.2)]"><Smartphone size={16} /></div>
                    )}
                  </motion.div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-[#e3cfd8] mb-0.5 truncate">{item.model || 'Unknown Model'}</div>
                    <div className="text-[10px] text-[rgba(245,245,245,0.5)] uppercase tracking-wider">{item.category || 'GripPad'}</div>
                    <div className="text-[10px] text-[rgba(245,245,245,0.3)] font-mono mt-0.5">{item.sku}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-white font-bold">₹{item.price || 0}</div>
                    <div className="text-[10px] text-[#e3cfd8]">COGS ₹{item.cogs || 0}</div>
                  </div>
                </div>
              </div>
            ))}
          </motion.div>

          {/* Customer Profile */}
          <motion.div custom={1} variants={sectionVariant} initial="hidden" animate="visible" className="glass-card-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] uppercase tracking-widest text-[rgba(245,245,245,0.4)] font-bold flex items-center gap-2">
                <User size={14} /> Customer Profile
              </h3>
              {cleanPhone && (
                <div className="flex gap-1.5">
                  <a href={`tel:${phone}`} className="p-1.5 rounded-lg bg-[rgba(52,211,153,0.06)] border border-[rgba(52,211,153,0.12)] text-emerald-400 hover:bg-[rgba(52,211,153,0.15)] transition-colors">
                    <Phone size={12} />
                  </a>
                  <a
                    href={`https://wa.me/${cleanPhone}?text=${encodeURIComponent(`Hi ${order.customerName}, this is GRLHOOD! We have an update regarding your order ${order.orderId}.`)}`}
                    target="_blank"
                    className="p-1.5 rounded-lg bg-[rgba(37,211,102,0.06)] border border-[rgba(37,211,102,0.12)] text-[#25D366] hover:bg-[rgba(37,211,102,0.15)] transition-colors"
                  >
                    <MessageSquare size={12} />
                  </a>
                  {order.awb && (
                    <a
                      href={order.awb.startsWith('http') ? order.awb : `https://seller.rapidshyp.com/orders/forward-orders`}
                      target="_blank"
                      className="p-1.5 rounded-lg bg-[rgba(227,207,216,0.06)] border border-[rgba(227,207,216,0.12)] text-[#e3cfd8] hover:bg-[rgba(227,207,216,0.15)] transition-colors"
                      title="Download Label"
                    >
                      <Download size={12} />
                    </a>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-3">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase text-[rgba(245,245,245,0.3)] font-bold mb-0.5">Name</span>
                <div className="text-white font-medium">{order.customerName || 'Unknown'}</div>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase text-[rgba(245,245,245,0.3)] font-bold mb-0.5">Contact</span>
                <div className="text-white font-mono text-sm">{phone || 'No phone'}</div>
                {order.shippingDetails?.email && (
                  <div className="text-white text-xs opacity-70 mt-0.5">{order.shippingDetails.email}</div>
                )}
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase text-[rgba(245,245,245,0.3)] font-bold mb-0.5">Payment</span>
                <div className="flex items-center gap-2">
                  <CreditCard size={13} className="text-[rgba(245,245,245,0.3)]" />
                  <span className="text-sm text-white font-medium">{order.payment || 'Unknown'}</span>
                </div>
              </div>
              {order.customerOrdersCount > 1 && (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="text-xs font-bold text-[#e3cfd8] bg-[rgba(227,207,216,0.08)] px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 border border-[rgba(227,207,216,0.12)]"
                >
                  <TrendingUp size={12} /> Repeat Customer ({order.customerOrdersCount} Orders)
                </motion.div>
              )}
            </div>
          </motion.div>

          {/* AI Risk Analysis */}
          <motion.div custom={2} variants={sectionVariant} initial="hidden" animate="visible" className="glass-card-sm p-5 space-y-4">
            <h3 className="text-[10px] uppercase tracking-widest text-[rgba(245,245,245,0.4)] font-bold flex items-center gap-2">
              <ShieldCheck size={14} /> RTO Risk (Shiprocket Sense)
            </h3>

            <RiskGauge score={order.aiRiskScore} level={order.aiRiskLevel} />

            <div className="space-y-2 pt-3 border-t border-[rgba(227,207,216,0.06)]">
              <span className="text-[10px] uppercase text-[rgba(245,245,245,0.3)] font-bold mb-1 block flex items-center gap-1">
                <Activity size={10} /> Detected Risk Factors
              </span>
              {order.aiRiskReasons && order.aiRiskReasons.length > 0 ? (
                <ul className="space-y-1.5">
                  {order.aiRiskReasons.map((reason, idx) => (
                    <motion.li
                      key={idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 + idx * 0.1 }}
                      className="flex items-start gap-2 text-sm text-[rgba(245,245,245,0.8)]"
                    >
                      <span className="w-1 h-1 rounded-full bg-[#e3cfd8] mt-2 shrink-0" />
                      {reason}
                    </motion.li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-[rgba(245,245,245,0.4)] italic">No specific risk factors detected.</div>
              )}
            </div>
          </motion.div>

          {/* Shipping & Fulfillment */}
          <motion.div custom={3} variants={sectionVariant} initial="hidden" animate="visible" className="glass-card-sm p-5 space-y-4">
            <h3 className="text-[10px] uppercase tracking-widest text-[rgba(245,245,245,0.4)] font-bold flex items-center gap-2">
              <Truck size={14} /> Shipping & Fulfillment
            </h3>

            <div className="space-y-3 relative">
              <MapPin className="absolute right-0 top-0 text-[rgba(245,245,245,0.04)] h-20 w-20 -mr-3 -mt-3 animate-pulse-soft" />
              <div className="flex flex-col relative z-10">
                <span className="text-[10px] uppercase text-[rgba(245,245,245,0.3)] font-bold mb-1">Delivery Address</span>
                <div className="text-sm text-white space-y-0.5">
                  <div>{order.shippingDetails?.address1}</div>
                  {order.shippingDetails?.address2 && <div className="text-[rgba(245,245,245,0.7)]">{order.shippingDetails.address2}</div>}
                  <div className="text-[rgba(245,245,245,0.7)]">
                    {order.shippingDetails?.city}, {order.shippingDetails?.province} {order.shippingDetails?.zip}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[rgba(227,207,216,0.06)] space-y-3">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase text-[rgba(245,245,245,0.3)] font-bold mb-0.5">AWB / Tracking</span>
                  {order.awb ? (
                    <div className="flex items-center gap-2">
                      <a href={order.awb.startsWith('http') ? order.awb : `https://www.google.com/search?q=${order.awb}+tracking`}
                        target="_blank" className="text-[#e3cfd8] font-bold font-mono text-sm hover:underline decoration-white/30 underline-offset-4">
                        {order.awb.startsWith('http') ? order.awb.match(/\d{10,}/)?.[0] || order.awb.split('/').pop() : order.awb}
                      </a>
                      <a href={order.awb.startsWith('http') ? order.awb : '#'} target="_blank"
                        className="p-1 rounded-md bg-[rgba(227,207,216,0.06)] border border-[rgba(227,207,216,0.1)] text-[#e3cfd8] hover:bg-[rgba(227,207,216,0.15)] transition-colors" title="Download Label">
                        <Download size={11} />
                      </a>
                    </div>
                  ) : <span className="text-[rgba(245,245,245,0.4)] text-sm">Not generated yet</span>}
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase text-[rgba(245,245,245,0.3)] font-bold mb-0.5">Status</span>
                  <span className={`text-sm font-bold ${order.rsStatus ? 'text-[#e3cfd8]' : 'text-[rgba(245,245,245,0.4)]'}`}>
                    {order.rsStatus || 'Awaiting Shipment'}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Footer Quick Links */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="px-6 sm:px-8 py-4 border-t border-[rgba(227,207,216,0.06)] flex items-center gap-2"
        >
          {order.orderLink && (
            <a href={order.orderLink} target="_blank" className="glass-pill text-[10px] hover:bg-[rgba(245,245,245,0.08)] transition-colors inline-flex items-center gap-1.5">
              <ExternalLink size={10} /> Shopify Admin
            </a>
          )}
          {order.shiprocketId && (
            <a href={`https://seller.rapidshyp.com/orders/forward-orders?search=${order.orderId}`} target="_blank" className="glass-pill text-[10px] hover:bg-[rgba(245,245,245,0.08)] transition-colors inline-flex items-center gap-1.5">
              <ExternalLink size={10} /> RapidShyp
            </a>
          )}
          {order.customerProfileUrl && (
            <a href={order.customerProfileUrl} target="_blank" className="glass-pill text-[10px] hover:bg-[rgba(245,245,245,0.08)] transition-colors inline-flex items-center gap-1.5">
              <ExternalLink size={10} /> Customer Profile
            </a>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}
