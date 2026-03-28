import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Package, Truck, User, MapPin, Calendar, Smartphone, FileText, Link as LinkIcon, ExternalLink, AlertTriangle } from 'lucide-react';

export default function AestheticDetailModal({ order, onClose }) {
  if (!order) return null;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xl">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0"
        onClick={onClose}
      />
      
      <motion.div
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 10, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto glass-panel rounded-3xl border border-[rgba(227,207,216,0.15)] shadow-2xl p-6 sm:p-8 flex flex-col"
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-8 pb-6 border-b border-[rgba(227,207,216,0.1)]">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-3xl font-black text-white tracking-tight">{order.orderId}</h2>
              <span className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-xl border bg-[rgba(227,207,216,0.1)] text-[#e3cfd8] border-[rgba(227,207,216,0.2)]`}>
                {order.fulfillmentStatus || 'UNFULFILLED'}
              </span>
            </div>
            <p className="text-sm text-[rgba(245,245,245,0.4)] font-medium">
              <Calendar size={14} className="inline mr-1.5 -translate-y-0.5" />
              {order.createdAt ? new Date(order.createdAt).toLocaleString() : 'Date unavailable'}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-xl bg-[rgba(245,245,245,0.05)] hover:bg-[rgba(245,245,245,0.1)] transition-colors text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Item Details */}
          <div className="glass-card-sm p-5 space-y-4">
            <h3 className="text-[10px] uppercase tracking-widest text-[rgba(245,245,245,0.4)] font-bold flex items-center gap-2 mb-2">
              <Package size={14} /> Product Specs
            </h3>
            
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-[rgba(227,207,216,0.05)] border border-[rgba(227,207,216,0.1)] overflow-hidden shrink-0">
                {order.thumbnail ? (
                  <img src={order.thumbnail} className="w-full h-full object-cover" alt="" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[rgba(245,245,245,0.2)]"><FileText size={20} /></div>
                )}
              </div>
              <div>
                <div className="text-lg font-bold text-[#e3cfd8] mb-0.5">{order.model || 'Unknown Model'}</div>
                <div className="text-xs text-[rgba(245,245,245,0.5)] uppercase tracking-wider">{order.category || 'GripPad'}</div>
              </div>
            </div>
            
            <div className="space-y-2 pt-2 border-t border-[rgba(227,207,216,0.06)]">
              <div className="flex justify-between items-center text-sm">
                <span className="text-[rgba(245,245,245,0.4)]">SKU</span>
                <span className="font-mono text-white">{order.sku || 'N/A'}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-[rgba(245,245,245,0.4)]">Price</span>
                <span className="font-bold text-white">₹{order.price || 0}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-[rgba(245,245,245,0.4)]">COGS</span>
                <span className="font-bold text-[#e3cfd8]">₹{order.cogs || 0}</span>
              </div>
            </div>
          </div>

          {/* Customer Details */}
          <div className="glass-card-sm p-5 space-y-4">
            <h3 className="text-[10px] uppercase tracking-widest text-[rgba(245,245,245,0.4)] font-bold flex items-center gap-2 mb-2">
              <User size={14} /> Customer Profile
            </h3>
            
            <div className="space-y-3">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase text-[rgba(245,245,245,0.3)] font-bold mb-0.5">Name</span>
                <div className="text-white font-medium">{order.customerName || 'Unknown'}</div>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase text-[rgba(245,245,245,0.3)] font-bold mb-0.5">Contact</span>
                <div className="text-white font-mono">{order.shippingDetails?.phone || 'No phone'}</div>
                {order.shippingDetails?.email && (
                  <div className="text-white text-sm opacity-80 mt-0.5">{order.shippingDetails.email}</div>
                )}
              </div>
              {order.customerOrdersCount > 1 && (
                <div className="mt-2 text-xs font-bold text-[#e3cfd8] bg-[rgba(227,207,216,0.1)] px-3 py-1.5 rounded-lg inline-block">
                  Loyalty: Repeat Customer ({order.customerOrdersCount} Orders)
                </div>
              )}
            </div>
          </div>

          {/* AI Risk Analysis */}
          <div className="glass-card-sm p-5 space-y-4">
            <h3 className="text-[10px] uppercase tracking-widest text-[rgba(245,245,245,0.4)] font-bold flex items-center gap-2 mb-2">
              <AlertTriangle size={14} /> AI Risk Analysis
            </h3>
            
            <div className="flex items-center gap-4 border-b border-[rgba(227,207,216,0.1)] pb-4 mb-4">
              <div className="text-4xl font-black text-white">{order.aiRiskScore || 'N/A'}</div>
              <div>
                <div className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-xl inline-block ${
                  order.aiRiskLevel === 'High' ? 'bg-[rgba(255,20,147,0.15)] border border-[rgba(255,20,147,0.3)] text-[#ff1493]' :
                  order.aiRiskLevel === 'Medium' ? 'bg-[rgba(227,207,216,0.1)] border border-[rgba(227,207,216,0.2)] text-[#e3cfd8]' :
                  'bg-[rgba(245,245,245,0.05)] border border-[rgba(245,245,245,0.1)] text-[rgba(245,245,245,0.5)]'
                }`}>
                  {order.aiRiskLevel || 'Unknown'} Risk
                </div>
                <div className="text-[10px] text-[rgba(245,245,245,0.4)] uppercase font-bold tracking-widest mt-1">XGBoost Model</div>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] uppercase text-[rgba(245,245,245,0.3)] font-bold mb-1 block">Detected Risk Factors</span>
              {order.aiRiskReasons && order.aiRiskReasons.length > 0 ? (
                <ul className="text-sm text-[rgba(245,245,245,0.8)] space-y-1.5 list-disc pl-4 marker:text-[rgba(227,207,216,0.5)]">
                  {order.aiRiskReasons.map((reason, idx) => (
                    <li key={idx}>{reason}</li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-[rgba(245,245,245,0.4)] italic">No specific risk factors detected.</div>
              )}
            </div>
          </div>

          {/* Shipping & Fulfillment */}
          <div className="glass-card-sm p-5 space-y-4 md:col-span-2">
            <h3 className="text-[10px] uppercase tracking-widest text-[rgba(245,245,245,0.4)] font-bold flex items-center gap-2 mb-2">
              <Truck size={14} /> Shipping & Fulfillment
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3 relative">
                <MapPin className="absolute right-0 top-0 text-[rgba(245,245,245,0.05)] h-24 w-24 -mr-4 -mt-4 animate-pulse-soft" />
                <div className="flex flex-col relative z-10">
                  <span className="text-[10px] uppercase text-[rgba(245,245,245,0.3)] font-bold mb-0.5">Delivery Address</span>
                  <div className="text-sm text-white space-y-0.5 mt-1">
                    <div>{order.shippingDetails?.address1}</div>
                    {order.shippingDetails?.address2 && <div>{order.shippingDetails.address2}</div>}
                    <div>{order.shippingDetails?.city}, {order.shippingDetails?.province} {order.shippingDetails?.zip}</div>
                  </div>
                </div>
              </div>

              <div className="space-y-3 border-l border-[rgba(227,207,216,0.06)] pl-0 md:pl-6 pt-4 md:pt-0">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase text-[rgba(245,245,245,0.3)] font-bold mb-0.5">RapidShyp AWB</span>
                  {order.awb ? (
                    <a href={order.awb} target="_blank" className="text-[#e3cfd8] font-bold font-mono text-sm flex items-center gap-1.5 hover:underline decoration-white/30 underline-offset-4 w-max">
                       <ExternalLink size={14} /> View Shipping Label PDF
                    </a>
                  ) : <span className="text-[rgba(245,245,245,0.4)] text-sm">Not generated</span>}
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase text-[rgba(245,245,245,0.3)] font-bold mb-0.5">Tracking Status</span>
                  <span className={`text-sm font-bold ${order.rsStatus ? 'text-[#e3cfd8]' : 'text-[rgba(245,245,245,0.4)]'}`}>
                    {order.rsStatus || 'Awaiting Shipment'}
                  </span>
                </div>
                <div className="flex flex-col mt-2">
                   <div className="flex gap-2">
                     {order.orderLink && (
                        <a href={order.orderLink} target="_blank" className="glass-pill text-[10px] hover:bg-[rgba(245,245,245,0.1)] transition-colors inline-block">
                           Shopify Admin
                        </a>
                     )}
                     {order.shiprocketId && (
                        <a href={`https://seller.rapidshyp.com/orders/forward-orders`} target="_blank" className="glass-pill text-[10px] hover:bg-[rgba(245,245,245,0.1)] transition-colors inline-block">
                           RapidShyp Admin
                        </a>
                     )}
                   </div>
                </div>
              </div>
            </div>
          </div>
          
        </div>
      </motion.div>
    </div>
  );
}
