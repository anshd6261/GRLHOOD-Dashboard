import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  X, User, MapPin, Phone, MessageSquare, Package, Truck, CreditCard,
  AlertTriangle, ExternalLink, Clock, Hash, XOctagon, ShieldCheck,
  Calendar, Smartphone, Tag, Activity
} from 'lucide-react';

/* ═══════════════════════════════════════════
   CARE ORDER DETAIL — Slide-in Panel
   Shows all order info for customer care
   ═══════════════════════════════════════════ */

function Section({ title, icon: Icon, children }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2.5">
        {Icon && <Icon size={13} className="text-[#e3cfd8] opacity-50" />}
        <h3 className="text-[9px] font-bold text-[rgba(245,245,245,0.4)] uppercase tracking-[0.15em]">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value, mono = false }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-start py-1.5 border-b border-[rgba(245,245,245,0.03)] last:border-0">
      <span className="text-[10px] text-[rgba(245,245,245,0.3)] font-medium shrink-0 mr-3">{label}</span>
      <span className={`text-[11px] text-[rgba(245,245,245,0.7)] font-semibold text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function CareOrderDetail({ group, onClose, onCancel, allOrders }) {
  const phone = group.shippingDetails?.phone || group.customer?.phone;
  const email = group.customer?.email || group.shippingDetails?.email;
  const addr = group.shippingDetails;

  // Customer history — all orders from same customer
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
            createdAt: o.createdAt, fulfillmentStatus: o.fulfillmentStatus, itemCount: 0
          };
        }
        grouped[o.orderId].itemCount++;
      }
    });
    return Object.values(grouped).sort((a, b) => (parseInt(b.orderId) || 0) - (parseInt(a.orderId) || 0));
  }, [allOrders, group.orderId, group.customerName, phone]);

  const fullAddress = [addr?.address1, addr?.address2, addr?.city, addr?.province, addr?.zip, addr?.country]
    .filter(Boolean).join(', ');

  const orderAge = Math.floor((Date.now() - new Date(group.createdAt).getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div className="glass-card h-full overflow-y-auto" style={{ maxHeight: 'calc(100vh - 100px)' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[rgba(14,14,17,0.95)] backdrop-blur-xl p-4 border-b border-[rgba(227,207,216,0.08)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-mono font-black text-lg text-white">{group.orderId}</span>
          <span className={`text-[8px] uppercase font-black px-2 py-0.5 rounded-full tracking-wider ${
            group.payment === 'Prepaid' ? 'badge-prepaid' : 'badge-cod'
          }`}>
            {group.payment === 'Cash on Delivery' ? 'COD' : 'Prepaid'}
          </span>
        </div>
        <button onClick={onClose} className="glass-icon-btn">
          <X size={15} />
        </button>
      </div>

      <div className="p-4 space-y-1">

        {/* ═══ RTO RISK ═══ */}
        {group.aiRiskLevel && group.aiRiskLevel !== 'Unknown' && (
          <Section title="RTO Risk Assessment" icon={AlertTriangle}>
            <div className={`glass-card-sm p-3 rounded-xl ${
              group.aiRiskLevel === 'High' ? 'border-[rgba(255,20,147,0.2)] bg-[rgba(255,20,147,0.04)]' :
              group.aiRiskLevel === 'Medium' ? 'border-[rgba(227,207,216,0.15)] bg-[rgba(227,207,216,0.04)]' :
              'border-[rgba(52,211,153,0.15)] bg-[rgba(52,211,153,0.04)]'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-sm font-black uppercase tracking-wider ${
                  group.aiRiskLevel === 'High' ? 'text-[#ff1493]' :
                  group.aiRiskLevel === 'Medium' ? 'text-[#e3cfd8]' : 'text-emerald-400'
                }`}>
                  {group.aiRiskLevel} Risk
                </span>
                {group.aiRiskScore != null && (
                  <span className="text-xs font-bold text-[rgba(245,245,245,0.5)]">{group.aiRiskScore}%</span>
                )}
              </div>
              {group.aiRiskReasons && group.aiRiskReasons.length > 0 && (
                <div className="space-y-1">
                  {group.aiRiskReasons.map((reason, i) => (
                    <div key={i} className="text-[10px] text-[rgba(245,245,245,0.4)] flex items-start gap-1.5">
                      <span className="text-[rgba(245,245,245,0.15)] mt-0.5">•</span>
                      <span>{reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>
        )}

        {/* ═══ CUSTOMER INFO ═══ */}
        <Section title="Customer" icon={User}>
          <div className="glass-card-sm p-3 rounded-xl">
            <InfoRow label="Name" value={group.customerName} />
            <InfoRow label="Phone" value={phone} mono />
            <InfoRow label="Email" value={email} />
            <InfoRow label="Orders" value={group.customerOrdersCount > 1 ? `${group.customerOrdersCount} orders (repeat)` : '1 order (first time)'} />
          </div>
        </Section>

        {/* ═══ QUICK CONTACT ═══ */}
        {phone && (
          <div className="flex gap-2 mb-4">
            <a
              href={`tel:${phone}`}
              className="flex-1 glass-card-sm p-2.5 rounded-xl flex items-center justify-center gap-2 text-[10px] font-bold text-[#e3cfd8] hover:bg-[rgba(227,207,216,0.06)] transition-colors"
            >
              <Phone size={13} /> Call
            </a>
            <a
              href={`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hi ${group.customerName}, this is GRLHOOD Customer Support! How can we help you today?`)}`}
              target="_blank"
              className="flex-1 glass-card-sm p-2.5 rounded-xl flex items-center justify-center gap-2 text-[10px] font-bold text-[#25D366] hover:bg-[rgba(37,211,102,0.06)] transition-colors"
            >
              <MessageSquare size={13} /> WhatsApp
            </a>
            <a
              href={`https://app.rapidshyp.com/orders/all?search=%23${group.orderId.replace('#', '')}`}
              target="_blank"
              className="flex-1 glass-card-sm p-2.5 rounded-xl flex items-center justify-center gap-2 text-[10px] font-bold text-[rgba(245,245,245,0.4)] hover:bg-[rgba(245,245,245,0.04)] transition-colors"
            >
              <ExternalLink size={13} /> RapidShyp
            </a>
          </div>
        )}

        {/* ═══ ORDER INFO ═══ */}
        <Section title="Order Details" icon={Package}>
          <div className="glass-card-sm p-3 rounded-xl">
            <InfoRow label="Date" value={new Date(group.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })} />
            <InfoRow label="Age" value={orderAge === 0 ? 'Today' : `${orderAge} day${orderAge > 1 ? 's' : ''}`} />
            <InfoRow label="Status" value={group.fulfillmentStatus || 'UNFULFILLED'} />
            <InfoRow label="Items" value={`${group.items.length} item${group.items.length > 1 ? 's' : ''}`} />
          </div>
        </Section>

        {/* ═══ PRODUCTS ═══ */}
        <Section title="Products" icon={Smartphone}>
          <div className="space-y-2">
            {group.items.map((item, idx) => (
              <div key={idx} className="glass-card-sm p-3 rounded-xl flex gap-3">
                {item.thumbnail ? (
                  <img src={item.thumbnail} className="w-12 h-12 rounded-lg object-cover border border-[rgba(227,207,216,0.05)]" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-[rgba(227,207,216,0.03)] flex items-center justify-center shrink-0">
                    <Package size={18} className="text-[rgba(245,245,245,0.12)]" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[#f5f5f5] text-xs truncate">{item.category || item.title || 'Product'}</div>
                  <div className="text-[10px] text-[rgba(245,245,245,0.3)] mt-0.5 truncate">
                    {item.model || 'Unknown Model'} {item.sku && `• SKU: ${item.sku}`}
                  </div>
                  {item.variantTitle && item.variantTitle !== 'Default Title' && (
                    <div className="text-[9px] text-[rgba(245,245,245,0.25)] mt-0.5">{item.variantTitle}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ═══ SHIPPING ═══ */}
        <Section title="Shipping Address" icon={MapPin}>
          <div className="glass-card-sm p-3 rounded-xl">
            <div className="text-xs text-[rgba(245,245,245,0.6)] font-medium leading-relaxed">{fullAddress || 'No address available'}</div>
          </div>
        </Section>

        {/* ═══ TRACKING ═══ */}
        {(group.awb || group.courier) && (
          <Section title="Tracking" icon={Truck}>
            <div className="glass-card-sm p-3 rounded-xl">
              <InfoRow label="Courier" value={group.courier} />
              <InfoRow label="AWB" value={group.awb} mono />
              {group.trackingUrl && (
                <div className="mt-2">
                  <a href={group.trackingUrl} target="_blank" className="text-[10px] font-bold text-[#e3cfd8] hover:underline flex items-center gap-1">
                    <ExternalLink size={10} /> Track Shipment
                  </a>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* ═══ CUSTOMER HISTORY ═══ */}
        {customerHistory.length > 0 && (
          <Section title={`Customer History (${customerHistory.length} other orders)`} icon={Clock}>
            <div className="space-y-2">
              {customerHistory.map(h => (
                <div key={h.orderId} className="glass-card-sm p-3 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="font-mono font-bold text-xs text-white">{h.orderId}</span>
                    <div className="text-[9px] text-[rgba(245,245,245,0.3)] mt-0.5">
                      {new Date(h.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} • {h.itemCount} item{h.itemCount > 1 ? 's' : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[8px] uppercase font-bold px-2 py-0.5 rounded-full tracking-wider ${
                      h.payment === 'Prepaid' ? 'badge-prepaid' : 'badge-cod'
                    }`}>
                      {h.payment === 'Cash on Delivery' ? 'COD' : 'Prepaid'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ═══ CANCEL ORDER ═══ */}
        <div className="pt-4 border-t border-[rgba(245,245,245,0.05)]">
          <button
            onClick={() => onCancel(group.items[0])}
            className="w-full px-4 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 risk-high border-none cursor-pointer hover:brightness-125 transition-all"
          >
            <XOctagon size={14} /> Cancel Order
          </button>
        </div>
      </div>
    </div>
  );
}

export default CareOrderDetail;
