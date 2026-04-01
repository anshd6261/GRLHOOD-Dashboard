import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, RefreshCw, Package, Phone, MessageSquare, ExternalLink,
  ChevronDown, ChevronUp, X, Filter, User, MapPin, Truck,
  AlertTriangle, Clock, CreditCard, XOctagon, LogOut, Hash
} from 'lucide-react';
import { useAuth } from '../AuthContext';
import DottedBackground from '../components/DottedBackground';
import GlowBlobs from '../components/GlowBlobs';
import CareOrderDetail from '../components/CareOrderDetail';

const API_BASE = import.meta.env.VITE_API_URL || '';
const API_URL = API_BASE ? `${API_BASE}/api` : '/api';

/* ═══════════════════════════════════════════
   CARE DASHBOARD — Customer Care Executive
   Search-first layout with split panel
   ═══════════════════════════════════════════ */

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'cod', label: 'COD' },
  { id: 'prepaid', label: 'Prepaid' },
  { id: 'high_rto', label: 'High RTO' },
  { id: 'unfulfilled', label: 'Unfulfilled' },
  { id: 'in_transit', label: 'In Transit' },
  { id: 'delivered', label: 'Delivered' },
];

function CareDashboard() {
  const { logout } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [toast, setToast] = useState(null);
  const [cancellingOrder, setCancellingOrder] = useState(null);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const searchInputRef = useRef(null);

  useEffect(() => { if (toast) setTimeout(() => setToast(null), 3000); }, [toast]);

  // Load orders on mount (last 7 days for care team)
  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      weekAgo.setHours(0, 0, 0, 0);
      const endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);

      // Load RTO cache from localStorage
      let rtoLocalCache = {};
      try { rtoLocalCache = JSON.parse(localStorage.getItem('rto_cache') || '{}'); } catch {}
      const cacheSize = Object.keys(rtoLocalCache).length;

      // Fetch orders with inline RTO cache (same pattern as main dashboard)
      const res = cacheSize > 0
        ? await axios.post(`${API_URL}/orders?startDate=${weekAgo.toISOString()}&endDate=${endDate.toISOString()}`, { rtoCache: rtoLocalCache })
        : await axios.get(`${API_URL}/orders?startDate=${weekAgo.toISOString()}&endDate=${endDate.toISOString()}`);

      let fetchedOrders = res.data?.orders || [];

      // Apply cached RTO data for Unknown orders
      fetchedOrders = fetchedOrders.map(o => {
        const cached = rtoLocalCache[o.orderId];
        if (o.aiRiskLevel === 'Unknown' && cached && cached.aiRiskLevel !== 'Unknown') {
          return { ...o, ...cached };
        }
        return o;
      });

      // Fetch fresh RTO for unchecked COD orders
      const unchecked = fetchedOrders.filter(o =>
        o.aiRiskLevel === 'Unknown' && o.payment === 'Cash on Delivery'
      );
      const uniqueUnchecked = [];
      const seenIds = new Set();
      for (const o of unchecked) {
        if (!seenIds.has(o.orderId)) { seenIds.add(o.orderId); uniqueUnchecked.push(o); }
      }

      if (uniqueUnchecked.length > 0) {
        try {
          const rtoRes = await axios.post(`${API_URL}/rto-check`, { orders: uniqueUnchecked });
          if (rtoRes.data?.success && rtoRes.data?.results) {
            const rtoResults = rtoRes.data.results;
            const updatedCache = { ...rtoLocalCache };
            for (const [orderId, rto] of Object.entries(rtoResults)) {
              if (rto.aiRiskLevel && rto.aiRiskLevel !== 'Unknown') {
                updatedCache[orderId] = { aiRiskLevel: rto.aiRiskLevel, aiRiskScore: rto.aiRiskScore, aiRiskReasons: rto.aiRiskReasons };
              }
            }
            try { localStorage.setItem('rto_cache', JSON.stringify(updatedCache)); } catch {}
            fetchedOrders = fetchedOrders.map(o => {
              const rto = rtoResults[o.orderId];
              return rto ? { ...o, ...rto } : o;
            });
          }
        } catch {}
      }

      setOrders(fetchedOrders);
      setInitialLoaded(true);
    } catch (e) {
      setToast({ message: `Failed to load orders: ${e.message}`, type: 'error' });
    } finally { setLoading(false); }
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) { loadOrders(); return; }
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/orders/search?q=${encodeURIComponent(searchTerm.trim())}`);
      if (res.data.success && res.data.orders?.length > 0) {
        // Apply RTO cache to search results too
        let rtoLocalCache = {};
        try { rtoLocalCache = JSON.parse(localStorage.getItem('rto_cache') || '{}'); } catch {}
        const enriched = res.data.orders.map(o => {
          const cached = rtoLocalCache[o.orderId];
          if (o.aiRiskLevel === 'Unknown' && cached && cached.aiRiskLevel !== 'Unknown') {
            return { ...o, ...cached };
          }
          return o;
        });
        setOrders(enriched);
        setActiveFilter('all');
      } else {
        setOrders([]);
        setToast({ message: 'No orders found', type: 'error' });
      }
    } catch (e) {
      setToast({ message: `Search failed: ${e.message}`, type: 'error' });
    } finally { setLoading(false); }
  };

  const handleCancelOrder = async (order) => {
    if (!order?.id || !order?.orderId) return;
    if (!confirm(`Cancel and DELETE order ${order.orderId}?`)) return;
    setCancellingOrder(order);
    try {
      const res = await axios.post(`${API_URL}/orders/${order.id}/cancel`, { orderName: order.orderId });
      if (res.data.success) {
        setToast({ message: `Order ${order.orderId} cancelled`, type: 'success' });
        setOrders(prev => prev.filter(o => o.orderId !== order.orderId));
        if (selectedOrder?.orderId === order.orderId) setSelectedOrder(null);
      }
    } catch (e) {
      setToast({ message: `Cancel failed: ${e.response?.data?.error || e.message}`, type: 'error' });
    } finally { setCancellingOrder(null); }
  };

  // Group orders by orderId (multiple line items per order)
  const groupedOrders = useMemo(() => {
    const groups = {};
    orders.forEach(o => {
      if (!groups[o.orderId]) {
        groups[o.orderId] = {
          orderId: o.orderId, customerName: o.customerName, payment: o.payment,
          customerOrdersCount: o.customerOrdersCount, shippingDetails: o.shippingDetails,
          customer: o.customer, orderLink: o.orderLink, items: [],
          createdAt: o.createdAt, fulfillmentStatus: o.fulfillmentStatus,
          aiRiskLevel: o.aiRiskLevel, aiRiskScore: o.aiRiskScore, aiRiskReasons: o.aiRiskReasons,
          awb: o.awb, courier: o.courier, id: o.id,
          trackingUrl: o.trackingUrl, rsOrderId: o.rsOrderId,
        };
      }
      groups[o.orderId].items.push(o);
    });
    return Object.values(groups).sort((a, b) => (parseInt(b.orderId) || 0) - (parseInt(a.orderId) || 0));
  }, [orders]);

  // Apply filters
  const filteredGroups = useMemo(() => {
    return groupedOrders.filter(g => {
      switch (activeFilter) {
        case 'cod': return g.payment === 'Cash on Delivery';
        case 'prepaid': return g.payment === 'Prepaid';
        case 'high_rto': return g.aiRiskLevel === 'High';
        case 'unfulfilled': return !g.fulfillmentStatus || g.fulfillmentStatus === 'UNFULFILLED';
        case 'in_transit': return g.fulfillmentStatus === 'FULFILLED' && !g.items[0]?.deliveredAt;
        case 'delivered': return g.items[0]?.deliveredAt || g.fulfillmentStatus === 'DELIVERED';
        default: return true;
      }
    });
  }, [groupedOrders, activeFilter]);

  const filterCounts = useMemo(() => {
    const counts = {};
    FILTERS.forEach(f => {
      switch (f.id) {
        case 'all': counts[f.id] = groupedOrders.length; break;
        case 'cod': counts[f.id] = groupedOrders.filter(g => g.payment === 'Cash on Delivery').length; break;
        case 'prepaid': counts[f.id] = groupedOrders.filter(g => g.payment === 'Prepaid').length; break;
        case 'high_rto': counts[f.id] = groupedOrders.filter(g => g.aiRiskLevel === 'High').length; break;
        case 'unfulfilled': counts[f.id] = groupedOrders.filter(g => !g.fulfillmentStatus || g.fulfillmentStatus === 'UNFULFILLED').length; break;
        case 'in_transit': counts[f.id] = groupedOrders.filter(g => g.fulfillmentStatus === 'FULFILLED' && !g.items[0]?.deliveredAt).length; break;
        case 'delivered': counts[f.id] = groupedOrders.filter(g => g.items[0]?.deliveredAt || g.fulfillmentStatus === 'DELIVERED').length; break;
        default: counts[f.id] = 0;
      }
    });
    return counts;
  }, [groupedOrders]);

  const getOrderAge = (createdAt) => {
    const d = Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
    return d === 0 ? 'Today' : d === 1 ? '1d ago' : `${d}d ago`;
  };

  return (
    <div className="min-h-screen relative font-sans text-[#f5f5f5]">
      <DottedBackground />
      <GlowBlobs />

      <div className="relative z-10 flex flex-col min-h-screen">

        {/* ═══ TOP BAR ═══ */}
        <header className="sticky top-0 z-50 glass-topbar px-5 lg:px-8 py-3">
          <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4">

            {/* Left: Logo */}
            <div className="flex items-center gap-3 shrink-0">
              <img src="/logo.png" alt="GRLHOOD" className="h-6 object-contain opacity-80 logo-tint" />
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[rgba(245,245,245,0.3)] border border-[rgba(227,207,216,0.15)] px-2 py-0.5 rounded-full bg-[rgba(227,207,216,0.05)]">
                Care
              </span>
            </div>

            {/* Center: Search */}
            <div className="flex-1 max-w-xl mx-4">
              <div className="relative flex items-center glass-card-sm px-4 py-2">
                <Search size={14} className="text-[#e3cfd8] opacity-50 shrink-0 mr-3" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Search by Order ID, Name, Phone, Email, AWB..."
                  className="bg-transparent text-[13px] font-semibold text-white outline-none w-full placeholder-[rgba(245,245,245,0.25)]"
                />
                {searchTerm && (
                  <button onClick={() => { setSearchTerm(''); loadOrders(); }} className="ml-2 text-[rgba(245,245,245,0.3)] hover:text-white">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Right: Refresh + Logout */}
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={loadOrders} disabled={loading} className="glass-icon-btn" title="Refresh">
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              </button>
              <button onClick={logout} className="glass-icon-btn hover:text-[#ffb6c1] hover:bg-[rgba(255,182,193,0.1)] transition-colors" title="Logout">
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </header>

        {/* ═══ MAIN CONTENT ═══ */}
        <div className="flex-1 flex flex-col lg:flex-row max-w-[1400px] mx-auto w-full px-5 lg:px-8 py-4 gap-4">

          {/* LEFT: Order List */}
          <div className={`flex-1 flex flex-col min-w-0 transition-all ${selectedOrder ? 'lg:max-w-[55%]' : ''}`}>

            {/* Filter Pills */}
            <div className="flex items-center gap-2 flex-wrap mb-4 overflow-x-auto pb-1">
              {FILTERS.map(f => (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f.id)}
                  className={`glass-pill text-[10px] font-bold tracking-wider cursor-pointer transition-all whitespace-nowrap ${
                    activeFilter === f.id
                      ? 'glass-pill-active'
                      : 'text-[rgba(245,245,245,0.35)] hover:text-[rgba(245,245,245,0.6)] hover:border-[rgba(227,207,216,0.12)]'
                  }`}
                >
                  {f.label} {filterCounts[f.id] > 0 ? `(${filterCounts[f.id]})` : ''}
                </button>
              ))}
            </div>

            {/* Order Count */}
            <div className="text-[10px] text-[rgba(245,245,245,0.25)] font-medium tracking-wider mb-3 px-1">
              {filteredGroups.length} order{filteredGroups.length !== 1 ? 's' : ''}
            </div>

            {/* Loading */}
            {loading && !initialLoaded && (
              <div className="flex flex-col items-center justify-center py-24">
                <RefreshCw size={32} className="animate-spin text-[#e3cfd8] opacity-40 mb-4" />
                <div className="text-xs text-[rgba(245,245,245,0.3)] tracking-widest uppercase">Loading orders...</div>
              </div>
            )}

            {/* Order Cards */}
            <div className="flex flex-col gap-3 pb-8 overflow-y-auto">
              {filteredGroups.map((group) => {
                const isActive = selectedOrder?.orderId === group.orderId;
                const riskLevel = group.aiRiskLevel;
                const age = getOrderAge(group.createdAt);
                const phone = group.shippingDetails?.phone || group.customer?.phone;

                return (
                  <motion.div
                    key={group.orderId}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div
                      onClick={() => setSelectedOrder(isActive ? null : group)}
                      className={`glass-card p-4 cursor-pointer transition-all hover:border-[rgba(227,207,216,0.15)] ${
                        isActive ? 'ring-1 ring-[rgba(227,207,216,0.25)] bg-[rgba(227,207,216,0.03)]' : ''
                      }`}
                    >
                      {/* Row 1: Order ID + Status + Age */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-sm text-white">{group.orderId}</span>
                          <span className={`text-[8px] uppercase font-black px-2 py-0.5 rounded-full tracking-wider ${
                            group.payment === 'Prepaid' ? 'badge-prepaid' : 'badge-cod'
                          }`}>
                            {group.payment === 'Cash on Delivery' ? 'COD' : 'Prepaid'}
                          </span>
                          {riskLevel && riskLevel !== 'Unknown' && (
                            <span className={`text-[8px] uppercase font-black px-2 py-0.5 rounded-full tracking-wider ${
                              riskLevel === 'High' ? 'bg-[rgba(255,20,147,0.15)] border border-[rgba(255,20,147,0.3)] text-[#ff1493]' :
                              riskLevel === 'Medium' ? 'bg-[rgba(227,207,216,0.1)] border border-[rgba(227,207,216,0.2)] text-[#e3cfd8]' :
                              'bg-[rgba(245,245,245,0.05)] border border-[rgba(245,245,245,0.1)] text-[rgba(245,245,245,0.5)]'
                            }`}>
                              RTO: {riskLevel}
                            </span>
                          )}
                        </div>
                        <span className="text-[9px] text-[rgba(245,245,245,0.3)] font-medium">{age}</span>
                      </div>

                      {/* Row 2: Customer + Items count */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <User size={12} className="text-[rgba(245,245,245,0.2)] shrink-0" />
                          <span className="text-xs text-[rgba(245,245,245,0.5)] font-medium truncate">{group.customerName}</span>
                        </div>
                        <span className="text-[9px] text-[rgba(245,245,245,0.25)] font-bold shrink-0">
                          {group.items.length} item{group.items.length > 1 ? 's' : ''}
                        </span>
                      </div>

                      {/* Row 3: Courier/AWB + Quick Actions */}
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-2">
                          {group.awb ? (
                            <span className="text-[9px] font-mono text-[rgba(227,207,216,0.6)] bg-[rgba(227,207,216,0.06)] px-2 py-0.5 rounded-md">
                              <Truck size={10} className="inline mr-1 opacity-50" />
                              {group.courier || 'Courier'}: {group.awb}
                            </span>
                          ) : (
                            <span className="text-[9px] text-[rgba(245,245,245,0.2)] italic">No AWB yet</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {phone && (
                            <>
                              <a href={`tel:${phone}`} className="glass-icon-btn-sm" title="Call" onClick={e => e.stopPropagation()}>
                                <Phone size={11} />
                              </a>
                              <a
                                href={`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hi ${group.customerName}, this is GRLHOOD Customer Support!`)}`}
                                target="_blank"
                                className="glass-icon-btn-sm text-[#25D366]"
                                title="WhatsApp"
                                onClick={e => e.stopPropagation()}
                              >
                                <MessageSquare size={11} />
                              </a>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Row 4: Status indicators */}
                      <div className="flex items-center gap-1.5 mt-2">
                        {group.fulfillmentStatus === 'FULFILLED' && (
                          <span className="text-[8px] uppercase font-bold px-2 py-0.5 rounded-full tracking-wider bg-[rgba(52,211,153,0.08)] border border-[rgba(52,211,153,0.15)] text-emerald-400">
                            Fulfilled
                          </span>
                        )}
                        {(!group.fulfillmentStatus || group.fulfillmentStatus === 'UNFULFILLED') && (
                          <span className="text-[8px] uppercase font-bold px-2 py-0.5 rounded-full tracking-wider bg-[rgba(245,245,245,0.04)] border border-[rgba(245,245,245,0.08)] text-[rgba(245,245,245,0.35)]">
                            Unfulfilled
                          </span>
                        )}
                        {(group.customerOrdersCount || 1) > 1 && (
                          <span className="text-[8px] uppercase font-bold px-2 py-0.5 rounded-full tracking-wider bg-[rgba(99,102,241,0.08)] border border-[rgba(99,102,241,0.15)] text-indigo-400">
                            Repeat ({group.customerOrdersCount})
                          </span>
                        )}
                        {(() => {
                          const ageDays = (Date.now() - new Date(group.createdAt).getTime()) / (1000 * 60 * 60 * 24);
                          return ageDays > 15 ? (
                            <span className="text-[8px] uppercase font-bold px-2 py-0.5 rounded-full tracking-wider bg-[rgba(255,100,0,0.12)] border border-[rgba(255,100,0,0.25)] text-orange-400 animate-pulse">
                              Late
                            </span>
                          ) : null;
                        })()}
                      </div>
                    </div>
                  </motion.div>
                );
              })}

              {filteredGroups.length === 0 && initialLoaded && !loading && (
                <div className="flex flex-col items-center justify-center py-20 opacity-25">
                  <Package size={40} />
                  <div className="mt-3 font-medium tracking-wider text-sm">No orders found</div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Detail Panel (slide-in) */}
          <AnimatePresence>
            {selectedOrder && (
              <motion.div
                initial={{ opacity: 0, x: 40, width: 0 }}
                animate={{ opacity: 1, x: 0, width: 'auto' }}
                exit={{ opacity: 0, x: 40, width: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="lg:w-[45%] shrink-0 overflow-hidden"
              >
                <CareOrderDetail
                  group={selectedOrder}
                  onClose={() => setSelectedOrder(null)}
                  onCancel={handleCancelOrder}
                  allOrders={orders}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Cancel overlay */}
      <AnimatePresence>
        {cancellingOrder && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[400] bg-black/90 flex flex-col items-center justify-center p-8 backdrop-blur-xl"
          >
            <motion.div
              animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="mb-8"
            >
              <XOctagon size={80} className="text-[#e3cfd8] drop-shadow-[0_0_30px_rgba(227,207,216,0.4)]" />
            </motion.div>
            <h2 className="text-2xl font-black text-white tracking-widest uppercase mb-4">Cancelling Order {cancellingOrder.orderId}</h2>
            <div className="flex items-center gap-3">
              <RefreshCw size={18} className="animate-spin text-[#e3cfd8]" />
              <span className="text-xs font-bold text-[rgba(245,245,245,0.4)] tracking-widest uppercase">Processing...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed bottom-8 right-8 z-[300] px-5 py-3 rounded-2xl shadow-2xl border flex items-center gap-3 backdrop-blur-xl bg-[rgba(26,26,30,0.9)] border-[rgba(227,207,216,0.2)] text-[#f5f5f5]"
          >
            {toast.type === 'error' ? <X size={16} className="text-[#e3cfd8] opacity-60" /> : <Package size={16} className="text-[#e3cfd8]" />}
            <span className="font-bold text-sm">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default CareDashboard;
