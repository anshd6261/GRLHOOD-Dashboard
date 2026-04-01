import React, { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import {
  Search, RefreshCw, Package, Phone, MessageSquare, ExternalLink,
  X, User, MapPin, Truck, AlertTriangle, Clock, XOctagon, LogOut,
  Calendar, Mail, ChevronRight, Smartphone, Shield
} from 'lucide-react';
import { useAuth } from '../AuthContext';
import DottedBackground from '../components/DottedBackground';
import GlowBlobs from '../components/GlowBlobs';
import CareOrderDetail from '../components/CareOrderDetail';

const API_BASE = import.meta.env.VITE_API_URL || '';
const API_URL = API_BASE ? `${API_BASE}/api` : '/api';

const FILTERS = [
  { id: 'all', label: 'All', icon: Package },
  { id: 'cod', label: 'COD' },
  { id: 'prepaid', label: 'Prepaid' },
  { id: 'high_rto', label: 'High RTO', icon: AlertTriangle },
  { id: 'unfulfilled', label: 'Unfulfilled' },
  { id: 'fulfilled', label: 'Shipped' },
  { id: 'delivered', label: 'Delivered', icon: Truck },
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

  // Date range — default last 7 days
  const [dateRange, setDateRange] = useState([
    new Date(new Date().setDate(new Date().getDate() - 7)),
    new Date()
  ]);
  const [startDate, endDate] = dateRange;

  useEffect(() => { if (toast) setTimeout(() => setToast(null), 4000); }, [toast]);

  // Load on mount
  useEffect(() => { loadOrders(); }, []);

  // Reload when date range changes (both dates selected)
  useEffect(() => {
    if (startDate && endDate && initialLoaded) loadOrders();
  }, [startDate, endDate]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const start = new Date(startDate || new Date(new Date().setDate(new Date().getDate() - 7)));
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate || new Date());
      end.setHours(23, 59, 59, 999);

      // Load RTO cache
      let rtoLocalCache = {};
      try { rtoLocalCache = JSON.parse(localStorage.getItem('rto_cache') || '{}'); } catch {}
      const cacheSize = Object.keys(rtoLocalCache).length;

      // Fetch ALL orders (not just unfulfilled) so care can see delivered too
      const url = `${API_URL}/orders?status=all&startDate=${start.toISOString()}&endDate=${end.toISOString()}`;
      const res = cacheSize > 0
        ? await axios.post(url, { rtoCache: rtoLocalCache })
        : await axios.get(url);

      let fetchedOrders = res.data?.orders || [];

      // Apply cached RTO instantly
      fetchedOrders = fetchedOrders.map(o => {
        const cached = rtoLocalCache[o.orderId];
        if (o.aiRiskLevel === 'Unknown' && cached && cached.aiRiskLevel !== 'Unknown') {
          return { ...o, ...cached };
        }
        return o;
      });

      // Show orders NOW
      setOrders(fetchedOrders);
      setInitialLoaded(true);
      setLoading(false);

      // Background RTO fetch for unchecked COD
      const seenIds = new Set();
      const uniqueUnchecked = fetchedOrders.filter(o => {
        if (o.aiRiskLevel !== 'Unknown' || o.payment !== 'Cash on Delivery' || seenIds.has(o.orderId)) return false;
        seenIds.add(o.orderId);
        return true;
      });

      if (uniqueUnchecked.length > 0) {
        axios.post(`${API_URL}/rto-check`, { orders: uniqueUnchecked }).then(rtoRes => {
          if (!rtoRes.data?.success || !rtoRes.data?.results) return;
          const rtoResults = rtoRes.data.results;
          const updatedCache = { ...rtoLocalCache };
          for (const [orderId, rto] of Object.entries(rtoResults)) {
            if (rto.aiRiskLevel && rto.aiRiskLevel !== 'Unknown') {
              updatedCache[orderId] = { aiRiskLevel: rto.aiRiskLevel, aiRiskScore: rto.aiRiskScore, aiRiskReasons: rto.aiRiskReasons };
            }
          }
          try { localStorage.setItem('rto_cache', JSON.stringify(updatedCache)); } catch {}
          setOrders(prev => prev.map(o => {
            const rto = rtoResults[o.orderId];
            return rto ? { ...o, ...rto } : o;
          }));
        }).catch(() => {});
      }
      return;
    } catch (e) {
      setToast({ message: `Load failed: ${e.message}`, type: 'error' });
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) { loadOrders(); return; }
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/orders/search?q=${encodeURIComponent(searchTerm.trim())}`);
      if (res.data.success && res.data.orders?.length > 0) {
        let rtoLocalCache = {};
        try { rtoLocalCache = JSON.parse(localStorage.getItem('rto_cache') || '{}'); } catch {}
        const enriched = res.data.orders.map(o => {
          const cached = rtoLocalCache[o.orderId];
          if (o.aiRiskLevel === 'Unknown' && cached && cached.aiRiskLevel !== 'Unknown') return { ...o, ...cached };
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
    if (!confirm(`Cancel and DELETE order ${order.orderId} from Shopify & RapidShyp?`)) return;
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

  // Group line items by orderId
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
          email: o.email,
        };
      }
      groups[o.orderId].items.push(o);
    });
    return Object.values(groups).sort((a, b) => (parseInt(b.orderId) || 0) - (parseInt(a.orderId) || 0));
  }, [orders]);

  // Filter
  const filteredGroups = useMemo(() => {
    return groupedOrders.filter(g => {
      switch (activeFilter) {
        case 'cod': return g.payment === 'Cash on Delivery';
        case 'prepaid': return g.payment !== 'Cash on Delivery';
        case 'high_rto': return g.aiRiskLevel === 'High';
        case 'unfulfilled': return !g.fulfillmentStatus || g.fulfillmentStatus === 'UNFULFILLED';
        case 'fulfilled': return g.fulfillmentStatus === 'FULFILLED';
        case 'delivered': return g.fulfillmentStatus === 'DELIVERED';
        default: return true;
      }
    });
  }, [groupedOrders, activeFilter]);

  const filterCounts = useMemo(() => {
    const c = {};
    FILTERS.forEach(f => {
      switch (f.id) {
        case 'all': c[f.id] = groupedOrders.length; break;
        case 'cod': c[f.id] = groupedOrders.filter(g => g.payment === 'Cash on Delivery').length; break;
        case 'prepaid': c[f.id] = groupedOrders.filter(g => g.payment !== 'Cash on Delivery').length; break;
        case 'high_rto': c[f.id] = groupedOrders.filter(g => g.aiRiskLevel === 'High').length; break;
        case 'unfulfilled': c[f.id] = groupedOrders.filter(g => !g.fulfillmentStatus || g.fulfillmentStatus === 'UNFULFILLED').length; break;
        case 'fulfilled': c[f.id] = groupedOrders.filter(g => g.fulfillmentStatus === 'FULFILLED').length; break;
        case 'delivered': c[f.id] = groupedOrders.filter(g => g.fulfillmentStatus === 'DELIVERED').length; break;
        default: c[f.id] = 0;
      }
    });
    return c;
  }, [groupedOrders]);

  const getAge = (d) => {
    const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
    return days === 0 ? 'Today' : days === 1 ? '1d ago' : `${days}d ago`;
  };

  const getEDD = (createdAt, fulfillmentStatus) => {
    if (fulfillmentStatus === 'DELIVERED') return 'Delivered';
    const created = new Date(createdAt);
    const edd = new Date(created);
    edd.setDate(edd.getDate() + (fulfillmentStatus === 'FULFILLED' ? 5 : 7));
    if (edd < new Date()) return 'Overdue';
    return edd.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const getStatusColor = (fs) => {
    if (fs === 'FULFILLED') return { bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.2)', text: '#34d399', label: 'Shipped' };
    if (fs === 'DELIVERED') return { bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.2)', text: '#818cf8', label: 'Delivered' };
    return { bg: 'rgba(245,245,245,0.04)', border: 'rgba(245,245,245,0.08)', text: 'rgba(245,245,245,0.4)', label: 'Unfulfilled' };
  };

  return (
    <div className="min-h-screen relative font-sans text-[#f5f5f5]">
      <DottedBackground />
      <GlowBlobs />

      <div className="relative z-10 flex flex-col min-h-screen">

        {/* ═══ TOP BAR ═══ */}
        <div className="pt-3 px-5 lg:px-8">
          <header className="sticky top-0 z-50 glass-card px-6 py-4 mx-auto max-w-[1400px]" style={{ borderRadius: '20px' }}>
            <div className="flex items-center justify-between gap-5">

              {/* Left: Logo + Badge */}
              <div className="flex items-center gap-4 shrink-0">
                <img src="/logo.png" alt="GRLHOOD" className="h-8 object-contain opacity-90 logo-tint" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#e3cfd8] border border-[rgba(227,207,216,0.2)] px-3 py-1 rounded-full bg-[rgba(227,207,216,0.06)]">
                  Customer Care
                </span>
              </div>

              {/* Center: Search */}
              <div className="flex-1 max-w-2xl">
                <div className="relative flex items-center glass-card-sm px-5 py-3">
                  <Search size={16} className="text-[#e3cfd8] opacity-60 shrink-0 mr-3" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Search by Order ID, Name, Phone, Email, AWB..."
                    className="bg-transparent text-sm font-semibold text-white outline-none w-full placeholder-[rgba(245,245,245,0.25)]"
                  />
                  {searchTerm && (
                    <button onClick={() => { setSearchTerm(''); loadOrders(); }} className="ml-2 text-[rgba(245,245,245,0.3)] hover:text-white transition-colors">
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>

              {/* Right: Date + Refresh + Logout */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="relative flex items-center gap-2 glass-card-sm px-4 py-2.5">
                  <Calendar size={14} className="text-[#e3cfd8] opacity-50 shrink-0" />
                  <DatePicker
                    selectsRange={true}
                    startDate={startDate}
                    endDate={endDate}
                    onChange={(update) => setDateRange(update)}
                    dateFormat="do MMM"
                    className="bg-transparent text-[12px] font-semibold text-white outline-none w-[140px] placeholder-[rgba(245,245,245,0.25)] cursor-pointer"
                    placeholderText="Select dates"
                  />
                </div>
                <button onClick={loadOrders} disabled={loading} className="glass-icon-btn" style={{ width: 42, height: 42 }} title="Refresh">
                  <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                </button>
                <button onClick={logout} className="glass-icon-btn hover:text-[#ffb6c1] hover:bg-[rgba(255,182,193,0.1)] transition-colors" style={{ width: 42, height: 42 }} title="Logout">
                  <LogOut size={16} />
                </button>
              </div>
            </div>
          </header>
        </div>

        {/* ═══ CONTENT ═══ */}
        <main className="flex-1 px-5 lg:px-8 py-6 max-w-[1400px] mx-auto w-full">

          {/* Filter Row */}
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-2.5 flex-wrap">
              {FILTERS.map(f => (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f.id)}
                  className={`glass-pill text-[11px] font-bold tracking-wider cursor-pointer transition-all whitespace-nowrap ${
                    activeFilter === f.id
                      ? 'glass-pill-active'
                      : 'text-[rgba(245,245,245,0.35)] hover:text-[rgba(245,245,245,0.6)] hover:border-[rgba(227,207,216,0.12)]'
                  }`}
                >
                  {f.label} {filterCounts[f.id] > 0 ? `(${filterCounts[f.id]})` : ''}
                </button>
              ))}
            </div>
            <div className="text-[11px] text-[rgba(245,245,245,0.25)] font-medium tracking-wider shrink-0">
              {filteredGroups.length} order{filteredGroups.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Loading */}
          {loading && !initialLoaded && (
            <div className="flex flex-col items-center justify-center py-32">
              <RefreshCw size={36} className="animate-spin text-[#e3cfd8] opacity-30 mb-5" />
              <div className="text-sm text-[rgba(245,245,245,0.25)] tracking-widest uppercase font-bold">Loading orders...</div>
            </div>
          )}

          {/* Order Grid */}
          {initialLoaded && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-12">
              {filteredGroups.map((group) => {
                const phone = group.shippingDetails?.phone || group.customer?.phone;
                const status = getStatusColor(group.fulfillmentStatus);
                const edd = getEDD(group.createdAt, group.fulfillmentStatus);
                const riskLevel = group.aiRiskLevel;

                return (
                  <motion.div
                    key={group.orderId}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    whileHover={{ y: -2 }}
                  >
                    <div
                      onClick={() => setSelectedOrder(group)}
                      className="glass-card p-5 cursor-pointer transition-all hover:border-[rgba(227,207,216,0.18)] group"
                    >
                      {/* Header: ID + Status Badge */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono font-black text-base text-white">#{group.orderId}</span>
                          <span className={`text-[8px] uppercase font-black px-2.5 py-0.5 rounded-full tracking-wider ${
                            group.payment === 'Cash on Delivery' ? 'badge-cod' : 'badge-prepaid'
                          }`}>
                            {group.payment === 'Cash on Delivery' ? 'COD' : 'Prepaid'}
                          </span>
                        </div>
                        <span className="text-[8px] uppercase font-black px-2.5 py-0.5 rounded-full tracking-wider"
                          style={{ background: status.bg, border: `1px solid ${status.border}`, color: status.text }}>
                          {status.label}
                        </span>
                      </div>

                      {/* Customer */}
                      <div className="flex items-center gap-2 mb-2">
                        <User size={13} className="text-[rgba(245,245,245,0.2)] shrink-0" />
                        <span className="text-[13px] text-[rgba(245,245,245,0.6)] font-semibold truncate">{group.customerName}</span>
                        {(group.customerOrdersCount || 1) > 1 && (
                          <span className="text-[8px] font-bold text-indigo-400 bg-[rgba(99,102,241,0.1)] px-1.5 py-0.5 rounded-md shrink-0">
                            x{group.customerOrdersCount}
                          </span>
                        )}
                      </div>

                      {/* Info Grid */}
                      <div className="grid grid-cols-3 gap-3 mb-3 mt-3">
                        <div>
                          <div className="text-[8px] uppercase font-bold text-[rgba(245,245,245,0.2)] tracking-widest mb-0.5">Items</div>
                          <div className="text-[12px] font-bold text-[rgba(245,245,245,0.6)]">{group.items.length}</div>
                        </div>
                        <div>
                          <div className="text-[8px] uppercase font-bold text-[rgba(245,245,245,0.2)] tracking-widest mb-0.5">Age</div>
                          <div className="text-[12px] font-bold text-[rgba(245,245,245,0.6)]">{getAge(group.createdAt)}</div>
                        </div>
                        <div>
                          <div className="text-[8px] uppercase font-bold text-[rgba(245,245,245,0.2)] tracking-widest mb-0.5">EDD</div>
                          <div className={`text-[12px] font-bold ${edd === 'Overdue' ? 'text-orange-400' : edd === 'Delivered' ? 'text-indigo-400' : 'text-[rgba(245,245,245,0.6)]'}`}>
                            {edd}
                          </div>
                        </div>
                      </div>

                      {/* AWB Row */}
                      {group.awb ? (
                        <div className="flex items-center gap-2 mb-3">
                          <Truck size={11} className="text-[rgba(227,207,216,0.4)] shrink-0" />
                          <a
                            href={group.trackingUrl || `https://www.google.com/search?q=${encodeURIComponent(group.awb + ' tracking')}`}
                            target="_blank"
                            onClick={e => e.stopPropagation()}
                            className="text-[11px] font-mono text-[#e3cfd8] hover:text-white hover:underline transition-colors truncate"
                          >
                            {group.courier ? `${group.courier}: ` : ''}{group.awb}
                          </a>
                          <ExternalLink size={10} className="text-[rgba(227,207,216,0.3)] shrink-0" />
                        </div>
                      ) : (
                        <div className="text-[10px] text-[rgba(245,245,245,0.15)] italic mb-3">No tracking yet</div>
                      )}

                      {/* RTO Risk + Bottom Row */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {riskLevel && riskLevel !== 'Unknown' && (
                            <span className={`text-[8px] uppercase font-black px-2 py-0.5 rounded-full tracking-wider ${
                              riskLevel === 'High' ? 'bg-[rgba(255,20,147,0.15)] border border-[rgba(255,20,147,0.3)] text-[#ff1493] drop-shadow-[0_0_6px_rgba(255,20,147,0.3)]' :
                              riskLevel === 'Medium' ? 'bg-[rgba(227,207,216,0.1)] border border-[rgba(227,207,216,0.2)] text-[#e3cfd8]' :
                              'bg-[rgba(52,211,153,0.08)] border border-[rgba(52,211,153,0.15)] text-emerald-400'
                            }`}>
                              RTO: {riskLevel}
                            </span>
                          )}
                          {(() => {
                            const ageDays = (Date.now() - new Date(group.createdAt).getTime()) / 86400000;
                            return ageDays > 15 && group.fulfillmentStatus !== 'DELIVERED' ? (
                              <span className="text-[8px] uppercase font-black px-2 py-0.5 rounded-full tracking-wider bg-[rgba(255,100,0,0.12)] border border-[rgba(255,100,0,0.25)] text-orange-400 animate-pulse">
                                Late
                              </span>
                            ) : null;
                          })()}
                        </div>

                        {/* Quick Contact */}
                        <div className="flex items-center gap-1.5">
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
                          <div className="glass-icon-btn-sm text-[rgba(245,245,245,0.2)] group-hover:text-[rgba(245,245,245,0.5)] transition-colors">
                            <ChevronRight size={12} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}

          {filteredGroups.length === 0 && initialLoaded && !loading && (
            <div className="flex flex-col items-center justify-center py-32 opacity-20">
              <Package size={48} />
              <div className="mt-4 font-bold tracking-wider text-sm">No orders match this filter</div>
            </div>
          )}
        </main>
      </div>

      {/* ═══ ORDER DETAIL MODAL ═══ */}
      <AnimatePresence>
        {selectedOrder && (
          <CareOrderDetail
            group={selectedOrder}
            onClose={() => setSelectedOrder(null)}
            onCancel={handleCancelOrder}
            allOrders={orders}
          />
        )}
      </AnimatePresence>

      {/* Cancel overlay */}
      <AnimatePresence>
        {cancellingOrder && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[500] bg-black/90 flex flex-col items-center justify-center p-8 backdrop-blur-xl"
          >
            <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity }} className="mb-8">
              <XOctagon size={72} className="text-[#e3cfd8] drop-shadow-[0_0_30px_rgba(227,207,216,0.4)]" />
            </motion.div>
            <h2 className="text-xl font-black text-white tracking-widest uppercase mb-4">Cancelling {cancellingOrder.orderId}</h2>
            <div className="flex items-center gap-3">
              <RefreshCw size={16} className="animate-spin text-[#e3cfd8]" />
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
            {toast.type === 'error' ? <X size={16} className="text-red-400 opacity-60" /> : <Package size={16} className="text-[#e3cfd8]" />}
            <span className="font-bold text-sm">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default CareDashboard;
