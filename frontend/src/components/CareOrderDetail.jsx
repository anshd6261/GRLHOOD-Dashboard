import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  X, User, MapPin, Phone, MessageSquare, Package, Truck,
  AlertTriangle, ExternalLink, Clock, XOctagon, Mail,
  Calendar, Smartphone, Shield, ChevronRight, Hash, Copy
} from 'lucide-react';

/* ═══════════════════════════════════════════
   CARE ORDER DETAIL — Full-screen Modal
   ═══════════════════════════════════════════ */

function Section({ title, icon: Icon, children, className = '' }) {
  return (
    <div className={`mb-6 ${className}`}>
      <div className="flex items-center gap-2.5 mb-3">
        {Icon && <Icon size={14} className="text-[#e3cfd8] opacity-50" />}
        <h3 className="text-[10px] font-black text-[rgba(245,245,245,0.35)] uppercase tracking-[0.18em]">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value, mono = false, link = false, href = '', copyable = false }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-center py-2 border-b border-[rgba(245,245,245,0.03)] last:border-0">
      <span className="text-[11px] text-[rgba(245,245,245,0.3)] font-medium shrink-0 mr-4">{label}</span>
      <div className="flex items-center gap-2">
        {link && href ? (
          <a href={href} target="_blank" className={`text-[12px] text-[#e3cfd8] font-semibold hover:text-white hover:underline transition-colors ${mono ? 'font-mono' : ''}`}>
            {value} <ExternalLink size={10} className="inline ml-1 opacity-50" />
          </a>
        ) : (
          <span className={`text-[12px] text-[rgba(245,245,245,0.7)] font-semibold text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
        )}
        {copyable && (
          <button
            onClick={() => { navigator.clipboard.writeText(value); }}
            className="text-[rgba(245,245,245,0.2)] hover:text-[rgba(245,245,245,0.5)] transition-colors"
            title="Copy"
          >
            <Copy size={11} />
          </button>
        )}
      </div>
    </div>
  );
}

function CareOrderDetail({ group, onClose, onCancel, allOrders }) {
  const phone = group.shippingDetails?.phone || group.customer?.phone;
  const email = group.email || group.customer?.email || '';
  const addr = group.shippingDetails;

  // Customer history
  const customerHistory = useMemo(() => {
    if (!allOrders || !group.customerName) return [];
    const name = group.customerName.toLowerCase();
    const ph = phone?.replace(/[^0-9]/g, '');
    const grouped = {};
    allOrders.forEach(o => {
      if (o.orderId === group.orderId) return;
      const oName = o.customerName?.toLowerCase();
      const oPhone = (o.shippingDetails?.phone || o.customer?.phone)?.replace(/[^0-9]/g, '');
      if (oName === name || (ph && oPhone === ph)) {
        if (!grouped[o.orderId]) {
          grouped[o.orderId] = {
            orderId: o.orderId, customerName: o.customerName, payment: o.payment,
            createdAt: o.createdAt, fulfillmentStatus: o.fulfillmentStatus, itemCount: 0,
          };
        }
        grouped[o.orderId].itemCount++;
      }
    });
    return Object.values(grouped).sort((a, b) => (parseInt(b.orderId) || 0) - (parseInt(a.orderId) || 0));
  }, [allOrders, group.orderId, group.customerName, phone]);

  const fullAddress = [addr?.address1, addr?.city, addr?.state, addr?.zip]
    .filter(Boolean).join(', ');

  const orderAge = Math.floor((Date.now() - new Date(group.createdAt).getTime()) / 86400000);

  const getEDD = () => {
    if (group.fulfillmentStatus === 'DELIVERED') return 'Delivered';
    const created = new Date(group.createdAt);
    const edd = new Date(created);
    edd.setDate(edd.getDate() + (group.fulfillmentStatus === 'FULFILLED' ? 5 : 7));
    if (edd < new Date()) return 'Overdue';
    return edd.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const statusLabel = group.fulfillmentStatus === 'FULFILLED' ? 'Shipped' : group.fulfillmentStatus === 'DELIVERED' ? 'Delivered' : 'Unfulfilled';
  const statusColor = group.fulfillmentStatus === 'FULFILLED' ? '#34d399' : group.fulfillmentStatus === 'DELIVERED' ? '#818cf8' : 'rgba(245,245,245,0.4)';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-8"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
        className="relative glass-card w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* ═══ HEADER ═══ */}
        <div className="px-7 py-5 border-b border-[rgba(227,207,216,0.08)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <span className="font-mono font-black text-2xl text-white">#{group.orderId}</span>
            <span className={`text-[9px] uppercase font-black px-3 py-1 rounded-full tracking-wider ${
              group.payment === 'Cash on Delivery' ? 'badge-cod' : 'badge-prepaid'
            }`}>
              {group.payment === 'Cash on Delivery' ? 'COD' : 'Prepaid'}
            </span>
            <span className="text-[9px] uppercase font-black px-3 py-1 rounded-full tracking-wider"
              style={{ background: `${statusColor}15`, border: `1px solid ${statusColor}40`, color: statusColor }}>
              {statusLabel}
            </span>
          </div>
          <button onClick={onClose} className="glass-icon-btn" style={{ width: 42, height: 42 }}>
            <X size={18} />
          </button>
        </div>

        {/* ═══ BODY — Scrollable ═══ */}
        <div className="flex-1 overflow-y-auto px-7 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-2">

            {/* LEFT COLUMN */}
            <div>
              {/* RTO Risk */}
              {group.aiRiskLevel && group.aiRiskLevel !== 'Unknown' && (
                <Section title="RTO Risk" icon={Shield}>
                  <div className={`glass-card-sm p-4 rounded-2xl ${
                    group.aiRiskLevel === 'High' ? 'border-[rgba(255,20,147,0.2)]' :
                    group.aiRiskLevel === 'Medium' ? 'border-[rgba(227,207,216,0.15)]' :
                    'border-[rgba(52,211,153,0.15)]'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-base font-black uppercase tracking-wider ${
                        group.aiRiskLevel === 'High' ? 'text-[#ff1493] drop-shadow-[0_0_8px_rgba(255,20,147,0.4)]' :
                        group.aiRiskLevel === 'Medium' ? 'text-[#e3cfd8]' : 'text-emerald-400'
                      }`}>
                        {group.aiRiskLevel} Risk
                      </span>
                      {group.aiRiskScore != null && (
                        <span className="text-sm font-bold text-[rgba(245,245,245,0.4)]">{group.aiRiskScore}%</span>
                      )}
                    </div>
                    {group.aiRiskReasons?.length > 0 && (
                      <div className="space-y-1.5 mt-2">
                        {group.aiRiskReasons.filter(r => r && r !== 'RTO check unavailable').map((reason, i) => (
                          <div key={i} className="text-[11px] text-[rgba(245,245,245,0.4)] flex items-start gap-2">
                            <AlertTriangle size={10} className="shrink-0 mt-0.5 opacity-50" />
                            <span>{reason}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Section>
              )}

              {/* Customer */}
              <Section title="Customer" icon={User}>
                <div className="glass-card-sm p-4 rounded-2xl">
                  <InfoRow label="Name" value={group.customerName} />
                  <InfoRow label="Phone" value={phone} mono copyable />
                  <InfoRow label="Email" value={email} copyable />
                  <InfoRow label="Total Orders" value={
                    (group.customerOrdersCount || 1) > 1
                      ? `${group.customerOrdersCount} (repeat buyer)`
                      : '1 (first time)'
                  } />
                </div>
              </Section>

              {/* Quick Contact */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                {phone && (
                  <>
                    <a href={`tel:${phone}`}
                      className="glass-card-sm p-3 rounded-2xl flex items-center justify-center gap-2 text-[11px] font-bold text-[#e3cfd8] hover:bg-[rgba(227,207,216,0.08)] transition-colors">
                      <Phone size={14} /> Call
                    </a>
                    <a href={`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hi ${group.customerName}, this is GRLHOOD Customer Support! How can we help you today?`)}`}
                      target="_blank"
                      className="glass-card-sm p-3 rounded-2xl flex items-center justify-center gap-2 text-[11px] font-bold text-[#25D366] hover:bg-[rgba(37,211,102,0.08)] transition-colors">
                      <MessageSquare size={14} /> WhatsApp
                    </a>
                  </>
                )}
                {email && (
                  <a href={`mailto:${email}`}
                    className="glass-card-sm p-3 rounded-2xl flex items-center justify-center gap-2 text-[11px] font-bold text-[rgba(245,245,245,0.4)] hover:bg-[rgba(245,245,245,0.04)] transition-colors">
                    <Mail size={14} /> Email
                  </a>
                )}
              </div>

              {/* Products */}
              <Section title={`Products (${group.items.length})`} icon={Package}>
                <div className="space-y-2.5">
                  {group.items.map((item, idx) => (
                    <div key={idx} className="glass-card-sm p-4 rounded-2xl flex gap-4">
                      {item.thumbnail ? (
                        <img src={item.thumbnail} className="w-14 h-14 rounded-xl object-cover border border-[rgba(227,207,216,0.06)]" />
                      ) : (
                        <div className="w-14 h-14 rounded-xl bg-[rgba(227,207,216,0.03)] flex items-center justify-center shrink-0">
                          <Package size={20} className="text-[rgba(245,245,245,0.1)]" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-white text-[13px] truncate">{item.category || item.title || 'Product'}</div>
                        <div className="text-[11px] text-[rgba(245,245,245,0.35)] mt-1 truncate">
                          {item.model || 'Unknown Model'}
                        </div>
                        {item.sku && (
                          <div className="text-[10px] text-[rgba(245,245,245,0.2)] mt-0.5 font-mono">SKU: {item.sku}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            </div>

            {/* RIGHT COLUMN */}
            <div>
              {/* Order Info */}
              <Section title="Order Details" icon={Calendar}>
                <div className="glass-card-sm p-4 rounded-2xl">
                  <InfoRow label="Placed" value={new Date(group.createdAt).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} />
                  <InfoRow label="Age" value={orderAge === 0 ? 'Today' : `${orderAge} day${orderAge > 1 ? 's' : ''} ago`} />
                  <InfoRow label="Est. Delivery" value={getEDD()} />
                  <InfoRow label="Items" value={`${group.items.length} item${group.items.length > 1 ? 's' : ''}`} />
                </div>
              </Section>

              {/* Shipping Address */}
              <Section title="Shipping Address" icon={MapPin}>
                <div className="glass-card-sm p-4 rounded-2xl">
                  <div className="text-[12px] text-[rgba(245,245,245,0.6)] font-medium leading-relaxed">
                    {fullAddress || 'No address available'}
                  </div>
                  {fullAddress && (
                    <a
                      href={`https://www.google.com/maps/search/${encodeURIComponent(fullAddress)}`}
                      target="_blank"
                      className="inline-flex items-center gap-1.5 mt-3 text-[10px] font-bold text-[#e3cfd8] hover:text-white transition-colors"
                    >
                      <MapPin size={11} /> View on Maps <ExternalLink size={9} className="opacity-50" />
                    </a>
                  )}
                </div>
              </Section>

              {/* Tracking */}
              <Section title="Tracking" icon={Truck}>
                <div className="glass-card-sm p-4 rounded-2xl">
                  {group.awb ? (
                    <>
                      <InfoRow label="Courier" value={group.courier || 'Unknown'} />
                      <InfoRow
                        label="AWB"
                        value={group.awb}
                        mono
                        link
                        href={group.trackingUrl || `https://www.google.com/search?q=${encodeURIComponent(group.awb + ' tracking')}`}
                        copyable
                      />
                      <div className="mt-3">
                        <a
                          href={`https://app.rapidshyp.com/orders/all?search=%23${group.orderId.replace('#', '')}`}
                          target="_blank"
                          className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[rgba(245,245,245,0.4)] hover:text-[#e3cfd8] transition-colors"
                        >
                          Open in RapidShyp <ExternalLink size={9} className="opacity-50" />
                        </a>
                      </div>
                    </>
                  ) : (
                    <div className="text-[12px] text-[rgba(245,245,245,0.25)] italic py-2">
                      No tracking information yet
                    </div>
                  )}
                </div>
              </Section>

              {/* Customer History */}
              {customerHistory.length > 0 && (
                <Section title={`Customer History (${customerHistory.length})`} icon={Clock}>
                  <div className="space-y-2">
                    {customerHistory.slice(0, 10).map(h => {
                      const st = h.fulfillmentStatus === 'FULFILLED' ? 'Shipped' : h.fulfillmentStatus === 'DELIVERED' ? 'Delivered' : 'Unfulfilled';
                      return (
                        <div key={h.orderId} className="glass-card-sm p-3 rounded-xl flex items-center justify-between">
                          <div>
                            <span className="font-mono font-bold text-[12px] text-white">#{h.orderId}</span>
                            <div className="text-[9px] text-[rgba(245,245,245,0.25)] mt-0.5">
                              {new Date(h.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} — {h.itemCount} item{h.itemCount > 1 ? 's' : ''} — {st}
                            </div>
                          </div>
                          <span className={`text-[8px] uppercase font-bold px-2 py-0.5 rounded-full tracking-wider ${
                            h.payment === 'Cash on Delivery' ? 'badge-cod' : 'badge-prepaid'
                          }`}>
                            {h.payment === 'Cash on Delivery' ? 'COD' : 'Prepaid'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </Section>
              )}
            </div>
          </div>
        </div>

        {/* ═══ FOOTER ═══ */}
        <div className="px-7 py-4 border-t border-[rgba(245,245,245,0.05)] flex items-center justify-between shrink-0">
          <a
            href={group.orderLink || '#'}
            target="_blank"
            className="text-[11px] font-bold text-[rgba(245,245,245,0.3)] hover:text-[#e3cfd8] transition-colors flex items-center gap-1.5"
          >
            <ExternalLink size={12} /> Open in Shopify
          </a>
          <button
            onClick={() => onCancel(group.items[0])}
            className="px-5 py-2.5 rounded-xl text-[11px] font-bold flex items-center gap-2 risk-high border-none cursor-pointer hover:brightness-125 transition-all"
          >
            <XOctagon size={13} /> Cancel Order
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default CareOrderDetail;
