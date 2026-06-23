import React, { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import {
  Package, Smartphone, IndianRupee, Download, RefreshCw, Search,
  UploadCloud, ChevronDown, ChevronUp, Box, MessageSquare,
  Trash2, ExternalLink, Calendar, CheckSquare,
  AlertTriangle, Edit3, X, Settings, LayoutDashboard, ClipboardCheck,
  TrendingUp, Phone, XOctagon, Truck, FileText, LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import DottedBackground from './components/DottedBackground';
import GlowBlobs from './components/GlowBlobs';
import CsvEditorModal from './components/CsvEditorModal';
import EditOrderModal from './components/EditOrderModal';
import AestheticDetailModal from './components/AestheticDetailModal';
import ShipOrdersModal from './components/ShipOrdersModal';
import FulfillOrdersWizard from './components/FulfillOrdersWizard';
import Login from './Login';
import SEODashboard from './pages/SEODashboard';
import { useAuth } from './AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || '';
const API_URL = API_BASE ? `${API_BASE}/api` : '/api';

/* ═══════════════════════════════════════════
   ERROR BOUNDARY
   ═══════════════════════════════════════════ */
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, errorInfo) { console.error("Uncaught Error:", error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0e0e11] text-white flex flex-col items-center justify-center p-8">
          <h1 className="text-3xl font-bold text-red-400 mb-4">Something went wrong.</h1>
          <pre className="text-xs bg-black/40 p-4 rounded-2xl text-red-300 max-w-2xl overflow-auto border border-red-500/20">
            {this.state.error?.toString()}
          </pre>
          <button onClick={() => window.location.reload()} className="mt-6 glass-btn-accent px-8 py-3 rounded-2xl font-bold">Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ═══════════════════════════════════════════
   SPOTLIGHT CARD
   ═══════════════════════════════════════════ */
function SpotlightCard({ children, className = '', onClick }) {
  const cardRef = useRef(null);
  const handleMouseMove = (e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    cardRef.current.style.setProperty('--spotlight-x', `${e.clientX - rect.left}px`);
    cardRef.current.style.setProperty('--spotlight-y', `${e.clientY - rect.top}px`);
  };
  return (
    <div ref={cardRef} onMouseMove={handleMouseMove} onClick={onClick} className={`spotlight-card glass-card ${className}`}>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════
   SETTINGS TAB
   ═══════════════════════════════════════════ */
const ACTION_LABELS = {
  approve: 'Approved Orders',
  download_csv: 'Downloaded CSVs',
  ship_orders: 'Shipped Orders',
  generate_labels: 'Generated Labels',
  fulfillment_complete: 'Fulfillment Complete',
  cancel_order: 'Cancelled Order',
  rto_check: 'RTO Check',
  sync_orders: 'Synced Orders',
};

function SettingsTab({ historyData, onHistorySelect }) {
  const [actionHistory, setActionHistory] = useState([]);
  const [showAllActions, setShowAllActions] = useState(false);

  useEffect(() => {
    try { setActionHistory(JSON.parse(localStorage.getItem('actionHistory') || '[]')); } catch { setActionHistory([]); }
  }, []);

  const connectedAPIs = [
    { name: 'Shopify Admin', status: 'connected', desc: 'Order sync & management' },
    { name: 'iThink Logistics', status: 'connected', desc: 'Shipping & AWB assignment' },
    { name: 'Dropbox', status: 'connected', desc: 'CSV backup storage' },
  ];

  const visibleActions = showAllActions ? actionHistory : actionHistory.slice(0, 10);

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Connected APIs */}
      <div>
        <h3 className="text-sm font-bold text-[rgba(245,245,245,0.4)] uppercase tracking-[0.15em] mb-4">Connected APIs</h3>
        <div className="space-y-3">
          {connectedAPIs.map(api => (
            <div key={api.name} className="glass-card-sm p-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-white">{api.name}</div>
                <div className="text-xs text-[rgba(245,245,245,0.3)] mt-0.5">{api.desc}</div>
              </div>
              <span className="text-[9px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-[rgba(227,207,216,0.1)] text-[#e3cfd8] border border-[rgba(227,207,216,0.15)]">
                {api.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Action History */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-[rgba(245,245,245,0.4)] uppercase tracking-[0.15em]">Action History</h3>
          {actionHistory.length > 0 && (
            <button onClick={() => { localStorage.removeItem('actionHistory'); setActionHistory([]); }}
              className="text-[9px] text-[rgba(245,245,245,0.2)] hover:text-[#ff1493] uppercase tracking-wider">Clear</button>
          )}
        </div>
        {actionHistory.length === 0 ? (
          <div className="glass-card-sm p-6 text-center text-[rgba(245,245,245,0.25)] text-sm">No actions recorded yet</div>
        ) : (
          <div className="space-y-2">
            {visibleActions.map((entry, i) => (
              <div key={i} className="glass-card-sm p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-white">{ACTION_LABELS[entry.action] || entry.action}</div>
                  <div className="text-[10px] text-[rgba(245,245,245,0.35)] mt-0.5">
                    {Object.entries(entry.details || {}).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                  </div>
                  <div className="text-[9px] text-[rgba(245,245,245,0.15)] mt-1">{entry.device}</div>
                </div>
                <div className="text-[9px] text-[rgba(245,245,245,0.2)] shrink-0 text-right">
                  {new Date(entry.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
            {actionHistory.length > 10 && (
              <button onClick={() => setShowAllActions(!showAllActions)} className="text-[10px] text-[#e3cfd8] hover:underline w-full text-center py-2">
                {showAllActions ? 'Show less' : `Show all ${actionHistory.length} actions`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Download History */}
      <div>
        <h3 className="text-sm font-bold text-[rgba(245,245,245,0.4)] uppercase tracking-[0.15em] mb-4">Download History</h3>
        {historyData.length === 0 ? (
          <div className="glass-card-sm p-6 text-center text-[rgba(245,245,245,0.25)] text-sm">No history yet</div>
        ) : (
          <div className="space-y-3">
            {historyData.map(batch => (
              <div key={batch.id} className="glass-card-sm p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold bg-[rgba(227,207,216,0.08)] text-[#e3cfd8]`}>
                    {batch.type === 'DOWNLOAD' ? 'DL' : 'EM'}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">{batch.count} Orders</div>
                    <div className="text-[10px] text-[rgba(245,245,245,0.25)]">{new Date(batch.timestamp).toLocaleString()} • {batch.id}</div>
                  </div>
                </div>
                <button onClick={() => onHistorySelect(batch)} className="glass-btn px-4 py-2 rounded-xl text-xs font-bold">View</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Version */}
      <div>
        <h3 className="text-sm font-bold text-[rgba(245,245,245,0.4)] uppercase tracking-[0.15em] mb-4">Dashboard</h3>
        <div className="glass-card-sm p-4">
          <div className="text-sm font-bold text-white">GRLHOOD Dashboard</div>
          <div className="text-xs text-[rgba(245,245,245,0.3)] mt-1">Version 3.1 — Glass Morphic</div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════ */
function App() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('fulfill');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef(null);
  const [searchOptionsOpen, setSearchOptionsOpen] = useState(false);
  const [searchedOrderOptions, setSearchedOrderOptions] = useState(null);
  const [detailModalOrder, setDetailModalOrder] = useState(null);
  const [cancellingOrder, setCancellingOrder] = useState(null); // State for cancellation modal/loading

  // Auto-sync on Fulfill mount
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (activeTab === 'fulfill' && !hasInitialized.current && user) {
      handleSync();
      hasInitialized.current = true;
    }
  }, [activeTab, user]);

  // Date Picker
  const [dateRange, setDateRange] = useState([
    new Date(new Date().setDate(new Date().getDate() - 3)),
    new Date()
  ]);
  const [startDate, endDate] = dateRange;

  // Selection
  const [selectedOrders, setSelectedOrders] = useState(new Set());
  const [showCsvEditor, setShowCsvEditor] = useState(false);
  const [csvPreviewData, setCsvPreviewData] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [shippingOrders, setShippingOrders] = useState(null);
  const [showFulfillWizard, setShowFulfillWizard] = useState(false);
  const [wizardOrders, setWizardOrders] = useState(null);
  const justSelectedRef = useRef(false);

  // Accordion
  const [expandedOrders, setExpandedOrders] = useState(new Set());
  const toggleOrderExpanded = (id) => {
    setExpandedOrders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Filters
  const [activeFilter, setActiveFilter] = useState('All');

  // Toast
  const [toast, setToast] = useState(null);
  useEffect(() => { if (toast) setTimeout(() => setToast(null), 3000); }, [toast]);
  useEffect(() => { if (selectedOrders.size === 0) setSelectionMode(false); }, [selectedOrders.size]);

  // History
  const [historyData, setHistoryData] = useState([]);
  useEffect(() => { if (activeTab === 'settings') fetchHistory(); }, [activeTab]);

  const fetchHistory = async () => {
    try { const res = await axios.get(`${API_URL}/history`); setHistoryData(res.data); } catch (e) { }
  };

  // Focus search on open
  useEffect(() => {
    if (searchOpen && searchInputRef.current) searchInputRef.current.focus();
  }, [searchOpen]);

  // Long-press selection
  const handlePressStart = (id) => {
    window.pressTimer = setTimeout(() => {
      justSelectedRef.current = true;
      setSelectionMode(true);
      toggleSelectRow(id);
      if ("vibrate" in navigator) navigator.vibrate(50);
    }, 600);
  };
  const handlePressEnd = () => { if (window.pressTimer) clearTimeout(window.pressTimer); };

  /* ─── API HANDLERS ─── */

  const handleGlobalSearch = async (e) => {
    if (e.key === 'Enter' && searchTerm.trim() !== '') {
      setLoading(true);
      try {
        const res = await axios.get(`${API_URL}/orders/search?q=${encodeURIComponent(searchTerm)}`);
        if (res.data.success && res.data.orders.length > 0) {
          const freshOrders = res.data.orders;
          setActiveTab('fulfill');
          setData({ ...data, orders: freshOrders });
          
          // Show options based on the first matched order
          setSearchedOrderOptions(freshOrders[0]);
          setSearchOptionsOpen(true);
        } else {
          setToast({ message: 'No orders found', type: 'error' });
          setSearchOptionsOpen(false);
        }
      } catch (err) {
         setToast({ message: 'Search error', type: 'error' });
      } finally { setLoading(false); }
    }
  };

  const handleSaveEdit = (updatedItemsArray) => {
    if (!data?.orders || !updatedItemsArray || !Array.isArray(updatedItemsArray)) return;
    const newOrders = [...data.orders];
    updatedItemsArray.forEach(editedItem => {
      const idx = newOrders.findIndex(o => o.id === editedItem.id);
      if (idx > -1) newOrders[idx] = { ...newOrders[idx], ...editedItem };
    });
    setData({ ...data, orders: newOrders });
    setToast({ message: "Order Updated!", type: "success" });
    setEditingOrder(null);
  };

  const handleDownloadLabel = async (orderIds, awbs, customerName, orderId) => {
    const hasAwbs = awbs && awbs.filter(Boolean).length > 0;
    if (!hasAwbs) return;
    setLoading(true);
    try {
      const payload = { awbs: awbs.filter(Boolean) };
      const res = await axios.post(`${API_URL}/rapidshyp/label`, payload);
      const url = res.data?.label_pdf_url || res.data?.label_url || res.data?.labelUrl || res.data?.pdf_url;
      if (url) {
        const fileName = customerName && orderId ? `${customerName} - ${orderId}.pdf` : `Label-${orderId || 'download'}.pdf`;
        try {
          const proxyUrl = `${API_URL}/proxy-pdf?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(fileName)}`;
          const pdfRes = await fetch(proxyUrl);
          if (!pdfRes.ok) throw new Error('Proxy failed');
          const blob = new Blob([await pdfRes.arrayBuffer()], { type: 'application/pdf' });
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        } catch {
          window.open(url, '_blank');
        }
        setToast({ message: "Label Generated!", type: "success" });
      } else {
         throw new Error("Label URL missing from response");
      }
    } catch (e) {
      setToast({ message: e.response?.data?.error || e.message || 'Label failed', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setLoading(true);
    setSelectedOrders(new Set());
    try {
      let startStr = '', endStr = '';
      if (startDate instanceof Date && !isNaN(startDate)) {
        const s = new Date(startDate); s.setHours(0, 0, 0, 0); startStr = s.toISOString();
      }
      if (endDate instanceof Date && !isNaN(endDate)) {
        const e = new Date(endDate); e.setHours(23, 59, 59, 999); endStr = e.toISOString();
      }
      // Step 0: Load localStorage RTO cache + checked IDs
      let rtoLocalCache = {};
      try { rtoLocalCache = JSON.parse(localStorage.getItem('rto_cache') || '{}'); } catch {}
      let rtoCheckedIds = [];
      try { rtoCheckedIds = JSON.parse(localStorage.getItem('rto_checked_ids') || '[]'); } catch {}
      const cacheSize = Object.keys(rtoLocalCache).length;
      console.log(`[RTO] localStorage cache: ${cacheSize} entries, ${rtoCheckedIds.length} checked IDs`);

      // Step 1: Fetch orders WITH inline cache (same Vercel instance handles both)
      const res = (cacheSize > 0 || rtoCheckedIds.length > 0)
        ? await axios.post(`${API_URL}/orders?status=unfulfilled&startDate=${startStr}&endDate=${endStr}`, { rtoCache: rtoLocalCache, rtoCheckedIds })
        : await axios.get(`${API_URL}/orders?status=unfulfilled&startDate=${startStr}&endDate=${endStr}`);
      if (res.headers['content-type']?.includes('text/html')) throw new Error('Server returned HTML. Check logs.');
      if (!res.data || !Array.isArray(res.data.orders)) {
        setData({ ...res.data, orders: res.data?.orders || [] });
      } else {
        setData(res.data);
      }

      // Enrich orders with RTO risk data
      const orders = res.data?.orders || [];

      // Step 2: Apply cached RTO data to orders that the server returned as Unknown
      const unknownCount = orders.filter(o => o.aiRiskLevel === 'Unknown').length;
      console.log(`[RTO] Server returned ${orders.length} orders, ${unknownCount} Unknown`);
      let ordersWithCache = orders.map(o => {
        const cached = rtoLocalCache[o.orderId];
        if (o.aiRiskLevel === 'Unknown' && cached && cached.aiRiskLevel !== 'Unknown') {
          return { ...o, ...cached };
        }
        // Also backfill cache from server-returned data (server may have had /tmp cache)
        if (o.aiRiskLevel && o.aiRiskLevel !== 'Unknown' && !rtoLocalCache[o.orderId]) {
          rtoLocalCache[o.orderId] = { aiRiskLevel: o.aiRiskLevel, aiRiskScore: o.aiRiskScore, aiRiskReasons: o.aiRiskReasons || [] };
        }
        return o;
      });
      // Persist any server-returned data we didn't have locally
      try { localStorage.setItem('rto_cache', JSON.stringify(rtoLocalCache)); } catch {}
      const enrichedCount = ordersWithCache.filter(o => o.aiRiskLevel !== 'Unknown').length;
      console.log(`[RTO] After localStorage enrichment: ${enrichedCount}/${ordersWithCache.length} have risk data`);

      // Step 3: Find truly unchecked orders (not in server cache AND not in localStorage AND not previously checked)
      const checkedSet = new Set(rtoCheckedIds);
      const uncheckedOrders = ordersWithCache.filter(o =>
        o.aiRiskLevel === 'Unknown' && o.payment === 'Cash on Delivery' &&
        (!o.fulfillmentStatus || o.fulfillmentStatus === 'UNFULFILLED') &&
        !checkedSet.has(o.orderId) // NEVER re-check a previously checked order
      );
      const uniqueUnchecked = [];
      const seenIds = new Set();
      for (const o of uncheckedOrders) {
        if (!seenIds.has(o.orderId)) {
          seenIds.add(o.orderId);
          uniqueUnchecked.push(o);
        }
      }

      // Step 4: Only call Sense API for genuinely new orders (saves credits)
      if (uniqueUnchecked.length > 0) {
        console.log(`[RTO] Checking ${uniqueUnchecked.length} genuinely new orders via Sense API`);
        try {
          const rtoRes = await axios.post(`${API_URL}/rto-check`, { orders: uniqueUnchecked });
          if (rtoRes.data?.success && rtoRes.data?.results) {
            const rtoResults = rtoRes.data.results;
            // Save new results to localStorage permanently
            const updatedCache = { ...rtoLocalCache };
            const updatedCheckedIds = [...checkedSet];
            for (const [orderId, rto] of Object.entries(rtoResults)) {
              updatedCache[orderId] = { aiRiskLevel: rto.aiRiskLevel, aiRiskScore: rto.aiRiskScore, aiRiskReasons: rto.aiRiskReasons };
              // Only mark as checked if we got a real result — allows retries for failed/unknown
              if (rto.aiRiskLevel && rto.aiRiskLevel !== 'Unknown' && !checkedSet.has(orderId)) {
                updatedCheckedIds.push(orderId);
                checkedSet.add(orderId);
              }
            }
            try { localStorage.setItem('rto_cache', JSON.stringify(updatedCache)); } catch {}
            try { localStorage.setItem('rto_checked_ids', JSON.stringify(updatedCheckedIds)); } catch {}

            ordersWithCache = ordersWithCache.map(o => {
              const rto = rtoResults[o.orderId];
              if (rto) return { ...o, ...rto };
              return o;
            });
          }
        } catch (rtoErr) {
          console.warn('RTO enrichment failed (non-blocking):', rtoErr.message);
          // Do NOT mark as checked on failure — allow retry on next sync
        }
      } else {
        console.log('[RTO] No new orders to check — all already checked or cached');
      }

      // Step 5: Update state with all enriched orders
      if (ordersWithCache !== orders) {
        setData(prev => ({ ...prev, orders: ordersWithCache }));
      }
    } catch (e) {
      console.error("Sync Error:", e);
      setToast({ message: `Sync Failed: ${e.message}`, type: 'error' });
    } finally { setLoading(false); }
  };

  const handleUploadPortal = async (ordersToUpload) => {
    const targetOrders = (ordersToUpload && ordersToUpload.length > 0) ? ordersToUpload : data?.orders;
    if (!targetOrders || targetOrders.length === 0) return;
    setLoading(true);
    try {
      await axios.post(`${API_URL}/upload-portal`, { rows: targetOrders });
      await axios.post(`${API_URL}/dropbox/upload`, { orders: targetOrders });
      setToast({ message: 'Order Placed & Saved!', type: 'success' });
      setShowCsvEditor(false);
      handleSync();
    } catch (e) {
      alert('Upload Failed: ' + (e.response?.data?.error || e.message));
    } finally { setLoading(false); }
  };

  const handleCancelOrder = async (row) => {
    if (!row?.id || !row?.orderId) return alert("Missing order details.");
    
    // Set cancelling state to show aesthetic loading/confirming screen
    setCancellingOrder(row);
    if (!confirm(`Are you absolutely sure you want to cancel and DELETE order ${row.orderId} from Shopify and iThink Logistics?`)) {
      setCancellingOrder(null);
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/orders/${row.id}/cancel`, { orderName: row.orderId, awb: row.awb });
      if (res.data.success) {
        setToast({ message: `Order ${row.orderId} Cancelled Successfully`, type: 'success' });
        const removedCount = data.orders.filter(o => o.orderId === row.orderId).length;
        const newOrders = data.orders.filter(o => o.orderId !== row.orderId);
        const uniqueNewIds = new Set(newOrders.map(o => o.orderId));
        setData({ ...data, orders: newOrders, stats: { ...data.stats, totalOrders: uniqueNewIds.size, totalItems: newOrders.length } });
        setSelectedOrders(prev => { const next = new Set(prev); next.delete(row.orderId); return next; });
      }
    } catch (e) { 
      setToast({ message: 'Cancel failed: ' + (e.response?.data?.error || e.message), type: 'error' });
    }
    finally { 
      setLoading(false); 
      setCancellingOrder(null);
    }
  };

  /* ─── SELECTION ─── */

  const lastSelectedRef = useRef(null);
  const toggleSelectRow = (id, shiftKey = false) => {
    if (!id) return;
    const newSet = new Set(selectedOrders);
    if (shiftKey && lastSelectedRef.current && lastSelectedRef.current !== id) {
      const ids = groupedFilteredOrders.map(g => g.orderId);
      const startIdx = ids.indexOf(lastSelectedRef.current);
      const endIdx = ids.indexOf(id);
      if (startIdx !== -1 && endIdx !== -1) {
        const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
        for (let i = from; i <= to; i++) newSet.add(ids[i]);
      }
    } else {
      if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
    }
    lastSelectedRef.current = id;
    setSelectedOrders(newSet);
  };

  const handleDownloadSelected = () => {
    if (selectedOrders.size === 0 || !data?.orders) return;
    const selectedRows = data.orders.filter(o => selectedOrders.has(o.orderId));
    setCsvPreviewData(selectedRows);
    setShowCsvEditor(true);
  };

  const handleDeleteSelected = () => {
    if (selectedOrders.size === 0 || !data?.orders) return;
    if (!confirm(`Remove ${selectedOrders.size} orders from this list?`)) return;
    setData({ ...data, orders: data.orders.filter(o => !selectedOrders.has(o.orderId)) });
    setSelectedOrders(new Set());
  };

  /* ─── FILTERING & GROUPING ─── */

  const filteredOrders = useMemo(() => {
    if (!data?.orders || !Array.isArray(data.orders)) return [];
    return data.orders.filter(r => {
      if (!r) return false;
      const s = searchTerm.toLowerCase();
      const oid = r.orderId ? r.orderId.toString().toLowerCase() : '';
      const name = r.customerName ? r.customerName.toLowerCase() : '';
      const phone = r.shippingDetails?.phone ? r.shippingDetails.phone.toLowerCase() : '';
      const matchesSearch = !searchTerm || oid.includes(s) || name.includes(s) || phone.includes(s);
      let matchesFilter = true;
      if (activeFilter === 'High Risk') matchesFilter = r.aiRiskLevel === 'High';
      if (activeFilter === 'Missing Device') matchesFilter = !r.model || r.model.trim() === '' || r.model.toLowerCase() === 'unknown model';
      if (activeFilter === 'Repeat Orders') matchesFilter = (r.customerOrdersCount || 1) > 1;
      return matchesSearch && matchesFilter;
    });
  }, [data, searchTerm, activeFilter]);

  const groupedFilteredOrders = useMemo(() => {
    const groups = {};
    filteredOrders.forEach(o => {
      if (!groups[o.orderId]) {
        groups[o.orderId] = {
          orderId: o.orderId, customerName: o.customerName, payment: o.payment,
          customerOrdersCount: o.customerOrdersCount, shippingDetails: o.shippingDetails,
          orderLink: o.orderLink, items: [],
          totalCogs: 0, orderTotal: o.orderTotal || 0, createdAt: o.createdAt
        };
      }
      groups[o.orderId].items.push(o);
      groups[o.orderId].totalCogs += (o.cogs || 0);
      if (o.orderTotal) groups[o.orderId].orderTotal = o.orderTotal;
    });
    return Object.values(groups).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [filteredOrders]);

  const filterCounts = useMemo(() => {
    if (!data?.orders) return {};
    const all = data.orders;
    return {
      'All': all.length,
      'High Risk': all.filter(r => r.aiRiskLevel === 'High').length,
      'Missing Device': all.filter(r => !r.model || r.model.trim() === '' || r.model.toLowerCase() === 'unknown model').length,
      'Repeat Orders': all.filter(r => (r.customerOrdersCount || 1) > 1).length,
    };
  }, [data]);

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'fulfill', label: 'Fulfill', icon: ClipboardCheck },
    { id: 'finance', label: 'Finance', icon: TrendingUp },
    { id: 'seo', label: 'SEO', icon: Search },
  ];

  /* ─── RENDER ─── */

  if (!user) return <Login />;

  const isSupplier = user?.role === 'supplier';
  
  // Filter tabs for supplier
  const visibleTabs = tabs.filter(t => {
    if (isSupplier) return t.id === 'fulfill';
    return true;
  });

  return (
    <div className="min-h-screen relative font-sans text-[#f5f5f5]">
      <DottedBackground />
      <GlowBlobs />

      <div className="relative z-10 flex flex-col min-h-screen">

        {/* ═══ TOP BAR ═══ */}
        <header className="sticky top-0 z-50 glass-topbar px-5 lg:px-8 py-3">
          <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4">

            {/* Left: Date Picker */}
            <div className="shrink-0 w-[220px]">
              <div className="relative flex items-center gap-2.5 glass-card-sm px-4 py-2">
                <Calendar size={14} className="text-[#e3cfd8] opacity-50 shrink-0" />
                <DatePicker
                  selectsRange={true}
                  startDate={startDate}
                  endDate={endDate}
                  onChange={(update) => setDateRange(update)}
                  dateFormat="do MMMM"
                  className="bg-transparent text-[13px] font-semibold text-white outline-none w-full placeholder-[rgba(245,245,245,0.25)] cursor-pointer"
                  placeholderText="Select dates"
                />
              </div>
            </div>

            {/* Center: Tabs */}
            <nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-4">
              {visibleTabs.map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-3 py-2 text-sm font-bold tracking-widest uppercase transition-all ${
                      isActive
                        ? 'text-[#e3cfd8] drop-shadow-[0_0_8px_rgba(227,207,216,0.3)]'
                        : 'text-[rgba(245,245,245,0.3)] hover:text-[rgba(245,245,245,0.7)]'
                    }`}
                  >
                    <Icon size={15} />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Right: Search + Refresh + Settings */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Expandable Search */}
              <div className="relative flex items-center">
                <AnimatePresence>
                  {searchOpen && (
                    <div className="relative">
                      <motion.div
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: 220, opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="overflow-hidden mr-1"
                      >
                        <input
                          ref={searchInputRef}
                          type="text"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          onKeyDown={handleGlobalSearch}
                          placeholder="Global search... (Enter)"
                          className="glass-input w-full py-1.5 px-3 text-xs rounded-xl"
                          onBlur={() => { 
                            // Give time for option clicks before closing
                            setTimeout(() => {
                               if (!searchTerm) setSearchOpen(false);
                               setSearchOptionsOpen(false);
                            }, 200);
                          }}
                        />
                      </motion.div>
                      
                      {/* Search Options Dropdown */}
                      <AnimatePresence>
                        {searchOptionsOpen && searchedOrderOptions && (
                           <motion.div
                             initial={{ opacity: 0, y: -10 }}
                             animate={{ opacity: 1, y: 0 }}
                             exit={{ opacity: 0, y: -10 }}
                             className="absolute top-[4.5rem] right-0 w-64 glass-card p-2 rounded-2xl flex flex-col gap-1 z-[100]"
                           >
                              <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-[rgba(245,245,245,0.4)] tracking-widest border-b border-[rgba(227,207,216,0.1)] mb-1">
                                Options for {searchedOrderOptions.orderId}
                              </div>
                              <button
                                onClick={() => {
                                  // Find all items for this order to show all units in detail modal
                                  const allSearchItems = (data?.orders || []).filter(o => o.orderId === searchedOrderOptions.orderId);
                                  setDetailModalOrder({ ...searchedOrderOptions, allItems: allSearchItems.length > 0 ? allSearchItems : [searchedOrderOptions] });
                                  setSearchOptionsOpen(false);
                                }}
                                className="w-full text-left px-3 py-2 text-xs font-bold text-white hover:bg-[rgba(227,207,216,0.08)] rounded-xl transition-colors"
                              >
                                1. Open Details
                              </button>
                              {!isSupplier && (
                                <a
                                  href={searchedOrderOptions.orderLink || '#'}
                                  target="_blank"
                                  className="w-full text-left px-3 py-2 text-xs font-bold text-white hover:bg-[rgba(227,207,216,0.08)] rounded-xl transition-colors block"
                                >
                                  2. Open in Shopify
                                </a>
                              )}
                                <a
                                  href={`https://my.ithinklogistics.com/shipments`}
                                  target="_blank"
                                  className="w-full text-left px-3 py-2 text-xs font-bold text-white hover:bg-[rgba(227,207,216,0.08)] rounded-xl transition-colors block"
                                >
                                  3. Open in iThink
                                </a>
                           </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </AnimatePresence>
                <button
                  onClick={() => { 
                    setSearchOpen(!searchOpen); 
                    if (searchOpen) { 
                      setSearchTerm(''); 
                      setSearchOptionsOpen(false);
                      handleSync(); 
                    } 
                  }}
                  className="glass-icon-btn"
                >
                  {searchOpen ? <X size={15} /> : <Search size={15} />}
                </button>
              </div>

              {/* Refresh */}
              <button onClick={handleSync} disabled={loading} className="glass-icon-btn" title="Refresh">
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              </button>

              {/* Settings (Hidden for Supplier) */}
              {!isSupplier && (
                <button
                  onClick={() => setActiveTab('settings')}
                  className={`glass-icon-btn ${activeTab === 'settings' ? 'text-[#e3cfd8] bg-[rgba(227,207,216,0.08)]' : ''}`}
                  title="Settings"
                >
                  <Settings size={15} />
                </button>
              )}

              {/* Logout */}
              <button
                onClick={logout}
                className="glass-icon-btn hover:text-[#ffb6c1] hover:bg-[rgba(255,182,193,0.1)] transition-colors ml-2"
                title="Logout"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-5 lg:px-8 py-6 max-w-[1400px] mx-auto w-full">

          <AnimatePresence mode="wait">

            {/* ═══ DASHBOARD TAB ═══ */}
            {activeTab === 'dashboard' && (
              <motion.div key="dashboard" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <div className="flex flex-col items-center justify-center pt-48 pb-20">
                  <img src="/logo.png" alt="GRLHOOD" className="w-[80vw] max-w-[500px] object-contain opacity-90 drop-shadow-[0_0_60px_rgba(227,207,216,0.08)] logo-tint" />
                  <p className="text-sm text-[rgba(245,245,245,0.2)] mt-12 tracking-widest uppercase">Coming Soon</p>
                </div>
              </motion.div>
            )}

            {/* ═══ FULFILL TAB ═══ */}
            {activeTab === 'fulfill' && (
              <motion.div key="fulfill" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>

                {/* Hero: Logo only (before data) */}
                {!data && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.6 }}
                    className="flex flex-col items-center justify-center pt-32 pb-20"
                  >
                    <img src="/logo.png" alt="GRLHOOD" className="w-[80vw] max-w-[400px] object-contain opacity-90 drop-shadow-[0_0_60px_rgba(227,207,216,0.08)] logo-tint" />
                  </motion.div>
                )}

                {data && (
                  <>
                    {/* BIG GRLHOOD LOGO INSIDE DASHBOARD */}
                    <div className="flex justify-center mb-16 mt-12 w-full pt-4">
                      <img src="/logo.png" alt="GRLHOOD" className="w-[80vw] max-w-[280px] object-contain drop-shadow-[0_0_25px_rgba(227,207,216,0.15)] opacity-90 logo-tint" />
                    </div>

                    {/* Stats Row */}
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-7">
                      <SpotlightCard className="p-5 relative overflow-hidden">
                        <div className="absolute -top-10 -right-10 w-24 h-24 bg-[rgba(227,207,216,0.04)] blur-3xl rounded-full" />
                        <div className="flex justify-between items-start relative z-10 mb-3">
                          <div className="text-[9px] font-bold text-[rgba(245,245,245,0.35)] tracking-[0.15em] uppercase">Orders</div>
                          <div className="p-1.5 rounded-lg bg-[rgba(227,207,216,0.06)]"><Package size={14} className="text-[#e3cfd8]" /></div>
                        </div>
                        <div className="text-3xl font-black text-white tracking-tight">{data?.stats?.totalOrders || 0}</div>
                      </SpotlightCard>

                      <SpotlightCard className="p-5 relative overflow-hidden">
                        <div className="absolute -bottom-10 -left-10 w-24 h-24 bg-[rgba(227,207,216,0.04)] blur-3xl rounded-full" />
                        <div className="flex justify-between items-start relative z-10 mb-3">
                          <div className="text-[9px] font-bold text-[rgba(245,245,245,0.35)] tracking-[0.15em] uppercase">Units</div>
                          <div className="p-1.5 rounded-lg bg-[rgba(227,207,216,0.06)]"><Smartphone size={14} className="text-[#e3cfd8]" /></div>
                        </div>
                        <div className="text-3xl font-black text-white tracking-tight">{data?.stats?.totalItems || 0}</div>
                      </SpotlightCard>

                      <SpotlightCard className="p-5 relative overflow-hidden cursor-pointer group" onClick={() => setShowFulfillWizard(true)}>
                        <div className="absolute -top-10 -left-10 w-24 h-24 bg-[rgba(52,211,153,0.04)] blur-3xl rounded-full group-hover:bg-[rgba(52,211,153,0.08)] transition-all" />
                        <div className="flex justify-between items-start relative z-10 mb-3">
                          <div className="text-[9px] font-bold text-[rgba(245,245,245,0.35)] tracking-[0.15em] uppercase">Fulfill Orders</div>
                          <div className="p-1.5 rounded-lg bg-[rgba(52,211,153,0.08)]"><CheckSquare size={14} className="text-emerald-400" /></div>
                        </div>
                        <div className="text-lg font-black text-white tracking-tight">Ready to Ship</div>
                        <div className="text-[10px] text-[rgba(245,245,245,0.3)] mt-1 group-hover:text-[rgba(245,245,245,0.5)] transition-colors">Click to start fulfillment →</div>
                      </SpotlightCard>

                      {(() => {
                        const source = selectedOrders.size > 0
                          ? groupedFilteredOrders.filter(g => selectedOrders.has(g.orderId))
                          : groupedFilteredOrders;
                        const totalValue = source.reduce((s, g) => s + (g.orderTotal || g.items.reduce((a, i) => a + (i.price || 0), 0)), 0);
                        const totalCogs = source.reduce((s, g) => s + g.totalCogs, 0);
                        return (
                          <SpotlightCard className="p-5 relative overflow-hidden">
                            <div className="absolute -top-10 -right-10 w-24 h-24 bg-[rgba(227,207,216,0.04)] blur-3xl rounded-full" />
                            <div className="flex justify-between items-start relative z-10 mb-3">
                              <div className="text-[9px] font-bold text-[rgba(245,245,245,0.35)] tracking-[0.15em] uppercase">
                                {selectedOrders.size > 0 ? `${selectedOrders.size} Selected` : 'Order Value'}
                              </div>
                              <div className="p-1.5 rounded-lg bg-[rgba(227,207,216,0.06)]"><IndianRupee size={14} className="text-[#e3cfd8]" /></div>
                            </div>
                            <div className="text-2xl font-black text-white tracking-tight">₹{totalValue.toLocaleString('en-IN')}</div>
                            <div className="text-[10px] text-[rgba(245,245,245,0.3)] mt-1">COGS: ₹{totalCogs.toLocaleString('en-IN')}</div>
                          </SpotlightCard>
                        );
                      })()}
                    </div>

                    {/* Filter Bar */}
                    <div className="flex items-center justify-between gap-4 mb-5">
                      <div className="flex items-center gap-2 flex-wrap">
                        {['All', 'High Risk', 'Missing Device', 'Repeat Orders'].map(f => (
                          <button
                            key={f}
                            onClick={() => setActiveFilter(f)}
                            className={`glass-pill text-[11px] font-bold tracking-wider cursor-pointer transition-all ${
                              activeFilter === f
                                ? 'glass-pill-active'
                                : 'text-[rgba(245,245,245,0.35)] hover:text-[rgba(245,245,245,0.6)] hover:border-[rgba(227,207,216,0.12)]'
                            }`}
                          >
                            {f} {filterCounts[f] !== undefined && filterCounts[f] > 0 ? `(${filterCounts[f]})` : ''}
                          </button>
                        ))}
                      </div>

                    </div>

                    {/* Order Count */}
                    <div className="flex items-center justify-between mb-4 px-1">
                      <div className="text-xs text-[rgba(245,245,245,0.25)] font-medium tracking-wider">
                        {groupedFilteredOrders.length} order{groupedFilteredOrders.length !== 1 ? 's' : ''}
                      </div>
                    </div>

                    {/* ═══ ORDER CARDS ═══ */}
                    <div className="grid grid-cols-1 gap-5 pb-24">
                      {groupedFilteredOrders.map((group) => {
                        const isExpanded = expandedOrders.has(group.orderId);
                        const isSelected = selectedOrders.has(group.orderId);
                        const isRepeat = (group.customerOrdersCount || 1) > 1;
                        const totalCogs = group.items.reduce((sum, item) => sum + (item.cogs || 0), 0);

                        return (
                          <motion.div
                            key={group.orderId}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-10px" }}
                            transition={{ duration: 0.5, ease: "easeOut" }}
                          >
                            <SpotlightCard
                              className={`overflow-hidden transition-all ${isSelected ? 'ring-1 ring-[rgba(227,207,216,0.25)] bg-[rgba(227,207,216,0.02)]' : ''}`}
                            >
                            {/* Card Header */}
                            <div
                              className="p-5 cursor-pointer"
                              onClick={(e) => { if (justSelectedRef.current) { justSelectedRef.current = false; return; } if (selectionMode) toggleSelectRow(group.orderId, e.shiftKey); else toggleOrderExpanded(group.orderId); }}
                              onPointerDown={() => !selectionMode && handlePressStart(group.orderId)}
                              onPointerUp={handlePressEnd}
                              onPointerLeave={handlePressEnd}
                            >
                              <div className="flex justify-between items-start gap-4">
                                <div className="min-w-0 flex-1">
                                  {/* Order ID + Expand */}
                                  <div className="flex items-center gap-2.5 mb-1.5">
                                    {selectionMode && (
                                      <div
                                        onClick={(e) => { e.stopPropagation(); toggleSelectRow(group.orderId, e.shiftKey); }}
                                        className={`w-4.5 h-4.5 rounded-md border-2 flex items-center justify-center shrink-0 cursor-pointer transition-all ${isSelected ? 'border-[#e3cfd8] bg-[rgba(227,207,216,0.15)]' : 'border-[rgba(245,245,245,0.12)]'}`}
                                      >
                                        {isSelected && <div className="w-2 h-2 rounded-sm bg-[#e3cfd8]" />}
                                      </div>
                                    )}
                                    <span className="font-mono font-black text-base text-white">{group.orderId}</span>
                                    <div className="p-0.5 rounded bg-[rgba(245,245,245,0.04)]">
                                      {isExpanded ? <ChevronUp size={12} className="text-[rgba(245,245,245,0.3)]" /> : <ChevronDown size={12} className="text-[rgba(245,245,245,0.3)]" />}
                                    </div>
                                  </div>

                                  {/* Customer Name */}
                                  <div className="text-sm text-[rgba(245,245,245,0.45)] font-medium truncate">{group.customerName}</div>

                                  {/* Tags: Payment + Repeat */}
                                  <div className="flex items-center gap-1.5 mt-2.5">
                                    <span className={`text-[9px] uppercase font-black px-2.5 py-0.5 rounded-full tracking-wider ${group.payment === 'Prepaid' ? 'badge-prepaid' : 'badge-cod'}`}>
                                      {group.payment || 'Prepaid'}
                                    </span>
                                    {group.items[0].aiRiskLevel && (
                                      <span
                                        onClick={(e) => { e.stopPropagation(); setDetailModalOrder({ ...group.items[0], allItems: group.items }); }}
                                        className={`cursor-pointer text-[9px] uppercase font-black px-2.5 py-0.5 rounded-full tracking-wider hover:brightness-125 transition-all ${
                                          group.items[0].aiRiskLevel === 'High' ? 'bg-[rgba(255,20,147,0.15)] border border-[rgba(255,20,147,0.3)] text-[#ff1493] drop-shadow-[0_0_8px_rgba(255,20,147,0.4)]' :
                                          group.items[0].aiRiskLevel === 'Medium' ? 'bg-[rgba(227,207,216,0.1)] border border-[rgba(227,207,216,0.2)] text-[#e3cfd8]' :
                                          'bg-[rgba(245,245,245,0.05)] border border-[rgba(245,245,245,0.1)] text-[rgba(245,245,245,0.5)]'
                                        }`}
                                      >
                                        RTO: {group.items[0].aiRiskLevel}
                                      </span>
                                    )}
                                    <span className="text-[9px] uppercase font-bold px-2.5 py-0.5 rounded-full tracking-wider bg-[rgba(245,245,245,0.04)] text-[rgba(245,245,245,0.35)] border border-[rgba(245,245,245,0.06)]">
                                      {group.items.length} unit{group.items.length > 1 ? 's' : ''}
                                    </span>
                                    {isRepeat && (
                                      <span className="text-[9px] uppercase font-black px-2.5 py-0.5 rounded-full tracking-wider bg-[rgba(99,102,241,0.08)] border border-[rgba(99,102,241,0.15)] text-indigo-400">
                                        Repeat ({group.customerOrdersCount})
                                      </span>
                                    )}
                                    {group.items[0].awb && (
                                      <a href={`https://www.delhivery.com/track/package/${group.items[0].awb}`} target="_blank" rel="noopener noreferrer"
                                        onClick={e => e.stopPropagation()}
                                        className="text-[9px] uppercase font-black px-2.5 py-0.5 rounded-full tracking-wider bg-[rgba(227,207,216,0.12)] border border-[rgba(227,207,216,0.25)] text-[#e3cfd8] glow-text hover:bg-[rgba(227,207,216,0.2)] transition-colors cursor-pointer">
                                        AWB {group.items[0].awb} ↗
                                      </a>
                                    )}
                                    {(group.items[0].tags || []).filter(t => !['unfulfilled','fulfilled','flexype'].includes(t.toLowerCase())).map(t => (
                                      <span key={t} className="text-[8px] uppercase font-bold px-2 py-0.5 rounded-full tracking-wider bg-[rgba(99,102,241,0.06)] border border-[rgba(99,102,241,0.12)] text-indigo-300">{t}</span>
                                    ))}
                                    {(() => { const age = (Date.now() - new Date(group.createdAt).getTime()) / (1000*60*60*24); return age > 15 ? (
                                      <span className="text-[9px] uppercase font-black px-2.5 py-0.5 rounded-full tracking-wider bg-[rgba(255,100,0,0.12)] border border-[rgba(255,100,0,0.25)] text-orange-400 animate-pulse">
                                        Late Delivery Risk
                                      </span>
                                    ) : null; })()}
                                  </div>
                                </div>

                                {/* Right side: COGS + age + status */}
                                {!isSupplier && (
                                <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                                  <div>
                                    <div className="text-[9px] text-[rgba(245,245,245,0.25)] uppercase font-bold tracking-[0.12em] mb-0.5">COGS</div>
                                    <div className="text-lg font-black text-[#e3cfd8] glow-text">₹{totalCogs}</div>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[9px] text-[rgba(245,245,245,0.3)] font-medium font-mono">
                                      {new Date(group.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                    </span>
                                    <div className={`w-2 h-2 rounded-full ${group.items[0].awb ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]' : 'bg-[rgba(245,245,245,0.15)]'}`} title={group.items[0].awb ? 'AWB Assigned' : 'Pending'} />
                                  </div>
                                </div>
                                )}
                              </div>
                            </div>

                            {/* Expanded */}
                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                  <div className="border-t border-[rgba(227,207,216,0.05)] bg-[rgba(0,0,0,0.12)] p-4 flex flex-col gap-2.5">

                                    {/* Order Details Grid */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[rgba(245,245,245,0.02)] p-3 rounded-xl border border-[rgba(227,207,216,0.05)] mb-2">
                                      <div>
                                        <div className="text-[9px] uppercase font-bold text-[rgba(245,245,245,0.3)] tracking-widest mb-1">Date</div>
                                        <div className="text-xs font-medium text-[rgba(245,245,245,0.8)]">{new Date(group.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                                      </div>
                                      <div>
                                        <div className="text-[9px] uppercase font-bold text-[rgba(245,245,245,0.3)] tracking-widest mb-1">Phone</div>
                                        <div className="text-xs font-mono text-[rgba(245,245,245,0.8)]">{group.shippingDetails?.phone || group.customer?.phone || 'N/A'}</div>
                                      </div>
                                      <div className="col-span-2">
                                        <div className="text-[9px] uppercase font-bold text-[rgba(245,245,245,0.3)] tracking-widest mb-1">Shipping Address</div>
                                        <div className="text-xs font-medium text-[rgba(245,245,245,0.6)] truncate">
                                          {group.shippingDetails?.address1}, {group.shippingDetails?.city}, {group.shippingDetails?.zip}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Line Items */}
                                    {group.items.map((item, idx) => (
                                      <div key={idx} className="glass-card-sm p-3 flex gap-3">
                                        {item.thumbnail ? (
                                          <img src={item.thumbnail} className="w-10 h-10 rounded-xl object-cover border border-[rgba(227,207,216,0.05)]" />
                                        ) : (
                                          <div className="w-10 h-10 rounded-xl bg-[rgba(227,207,216,0.03)] flex items-center justify-center shrink-0">
                                            <Package size={16} className="text-[rgba(245,245,245,0.12)]" />
                                          </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                          <div className="font-bold text-[#f5f5f5] text-sm truncate">{item.category || 'Unknown'}</div>
                                          <div className="text-xs text-[rgba(245,245,245,0.3)] mt-0.5 truncate">{item.model || 'Unknown Model'} {item.sku && `• ${item.sku}`}</div>
                                        </div>
                                        {!isSupplier && (
                                        <div className="text-right shrink-0">
                                          <div className="text-[8px] text-[rgba(245,245,245,0.2)] uppercase font-bold tracking-wider">COGS</div>
                                          <div className="font-bold text-[#e3cfd8] text-sm">₹{item.cogs || 0}</div>
                                        </div>
                                        )}
                                      </div>
                                    ))}

                                    {/* Actions */}
                                    <div className="pt-2 mt-1 border-t border-[rgba(227,207,216,0.05)] flex flex-wrap items-center justify-between gap-2">
                                      <div className="flex items-center gap-1.5">
                                        <a href={group.orderLink || '#'} target="_blank" className="glass-icon-btn-sm">
                                          <ExternalLink size={13} />
                                        </a>
                                        <a
                                          href={`https://my.ithinklogistics.com/shipments`}
                                          target="_blank"
                                          className="glass-icon-btn-sm"
                                          title="Open in iThink"
                                        >
                                          <ExternalLink size={13} />
                                        </a>
                                        <button
                                          onClick={() => {
                                            const phone = group.shippingDetails?.phone || group.customer?.phone;
                                            if (phone) window.location.href = `tel:${phone}`;
                                          }}
                                          className="glass-icon-btn-sm text-[#e3cfd8]"
                                        >
                                          <Phone size={13} />
                                        </button>
                                        {(() => {
                                          const phone = group.shippingDetails?.phone || group.customer?.phone;
                                          return phone ? (
                                            <a
                                              href={`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hi ${group.customerName}, this is GRLHOOD!\n\nWe noticed you forgot to mention your Phone Model in your recent order. Could you please share it so we can dispatch your order soon?`)}`}
                                              target="_blank"
                                              className="glass-icon-btn-sm text-[#25D366]"
                                            >
                                              <MessageSquare size={13} />
                                            </a>
                                          ) : null;
                                        })()}
                                      </div>
                                      <div className="flex gap-1.5">
                                        {(group.items[0].awb || group.items[0].rsOrderId) && (
                                          <button
                                            onClick={() => handleDownloadLabel(group.items[0].rsOrderId ? [group.items[0].rsOrderId] : [], group.items[0].awb ? [group.items[0].awb] : [], group.customerName, group.orderId)}
                                            className="glass-btn px-3.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 bg-[rgba(227,207,216,0.1)] text-[#e3cfd8] border-[rgba(227,207,216,0.3)] hover:brightness-125"
                                          >
                                            <FileText size={12} /> Label
                                          </button>
                                        )}
                                        <button onClick={() => setEditingOrder(group.items)} className="glass-btn px-3.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5">
                                          <Edit3 size={12} /> Edit
                                        </button>
                                        <button onClick={() => handleCancelOrder(group.items[0])} className="px-3.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 risk-high border-none cursor-pointer hover:brightness-125 transition-all">
                                          <XOctagon size={12} /> Cancel
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </SpotlightCard>
                        </motion.div>
                        );
                      })}
                    </div>

                    {groupedFilteredOrders.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-24 opacity-25">
                        <Box size={48} />
                        <div className="mt-4 font-medium tracking-wider text-sm">No matching orders</div>
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            )}

            {/* ═══ FINANCE TAB ═══ */}
            {activeTab === 'finance' && (
              <motion.div key="finance" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <div className="flex flex-col items-center justify-center py-28">
                  <img src="/logo.png" alt="GRLHOOD" className="w-56 h-56 object-contain opacity-80 drop-shadow-[0_0_60px_rgba(227,207,216,0.08)]" />
                  <p className="text-sm text-[rgba(245,245,245,0.2)] mt-8 tracking-widest uppercase">Coming Soon</p>
                </div>
              </motion.div>
            )}

            {/* ═══ SEO TAB ═══ */}
            {activeTab === 'seo' && (
              <motion.div key="seo" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <SEODashboard />
              </motion.div>
            )}

            {/* ═══ SETTINGS TAB ═══ */}
            {activeTab === 'settings' && (
              <motion.div key="settings" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <SettingsTab
                  historyData={historyData}
                  onHistorySelect={(batch) => {
                    setCsvPreviewData(batch.rows || []);
                    setShowCsvEditor(true);
                  }}
                />
              </motion.div>
            )}

          </AnimatePresence>
        </main>
      </div>

      {/* ═══ MODALS & OVERLAYS ═══ */}

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
                <span className="text-xs font-bold text-[rgba(245,245,245,0.4)] tracking-widest uppercase">Deleting from Shopify & iThink...</span>
             </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {detailModalOrder && (
          <AestheticDetailModal
            order={detailModalOrder}
            onClose={() => setDetailModalOrder(null)}
            isSupplier={isSupplier}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {shippingOrders && (
          <ShipOrdersModal
            orders={shippingOrders}
            onClose={() => setShippingOrders(null)}
            onSuccess={(dropboxPaths) => {
              setToast({ message: 'Orders shipped successfully!', type: 'success' });
              setSelectedOrders(new Set());
              setShippingOrders(null);
              handleSync();
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showFulfillWizard && data?.orders && (
          <FulfillOrdersWizard
            orders={wizardOrders || data.orders}
            onClose={() => { setShowFulfillWizard(false); setWizardOrders(null); }}
            onOrdersUpdate={(updatedOrders) => setData(prev => ({ ...prev, orders: updatedOrders }))}
            isSupplier={user?.role === 'supplier'}
          />
        )}
      </AnimatePresence>

      <EditOrderModal
        isOpen={!!editingOrder}
        onClose={() => setEditingOrder(null)}
        order={editingOrder}
        onSave={handleSaveEdit}
        isSupplier={user?.role === 'supplier'}
      />

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={`fixed bottom-8 right-8 z-[300] px-5 py-3 rounded-2xl shadow-2xl border flex items-center gap-3 backdrop-blur-xl bg-[rgba(26,26,30,0.9)] border-[rgba(227,207,216,0.2)] text-[#f5f5f5]`}
          >
            {toast.type === 'error' ? <X size={16} className="text-[#e3cfd8] opacity-60" /> : <CheckSquare size={16} className="text-[#e3cfd8]" />}
            <span className="font-bold text-sm">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CSV Editor Modal */}
      <AnimatePresence>
        {showCsvEditor && (
          <CsvEditorModal
            orders={csvPreviewData}
            isSelection={selectedOrders.size > 0 && selectedOrders.size === csvPreviewData.length}
            onClose={() => setShowCsvEditor(false)}
            onSaveOnly={() => setToast({ message: 'Files downloaded!', type: 'success' })}
            onUploadPortal={handleUploadPortal}
          />
        )}
      </AnimatePresence>

      {/* Selection FAB */}
      <AnimatePresence>
        {selectedOrders.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.9 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[150] glass-card px-5 py-3.5 flex items-center gap-5"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[rgba(227,207,216,0.1)] flex items-center justify-center text-[#e3cfd8] font-black text-sm border border-[rgba(227,207,216,0.15)]">
                {selectedOrders.size}
              </div>
              <span className="text-xs font-bold text-[rgba(245,245,245,0.4)] tracking-wider uppercase">Selected</span>
            </div>

            <div className="flex items-center gap-1.5 ml-auto">
              {/* Unselect All */}
              <button
                onClick={() => setSelectedOrders(new Set())}
                className="glass-icon-btn"
                title="Unselect all"
              >
                <X size={14} />
              </button>

              {/* Download Labels (Bulk) */}
              {Array.from(selectedOrders).some(id => data.orders.find(o => o.orderId === id && (o.awb || o.rsOrderId))) && (
                <button
                  onClick={() => {
                    const matchedOrders = Array.from(selectedOrders)
                      .map(id => data.orders.find(o => o.orderId === id))
                      .filter(o => o && (o.awb || o.rsOrderId));
                    const rsIds = matchedOrders.filter(o => o.rsOrderId).map(o => o.rsOrderId);
                    const awbs = matchedOrders.filter(o => o.awb).map(o => o.awb);
                    if (rsIds.length > 0 || awbs.length > 0) handleDownloadLabel(rsIds, awbs);
                  }}
                  className="glass-btn px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 tracking-wider uppercase text-[#e3cfd8] border-[rgba(227,207,216,0.2)] hover:bg-[rgba(227,207,216,0.05)]"
                >
                  <FileText size={13} /> Labels
                </button>
              )}

              {/* Ship Selected */}
              {!isSupplier && (
                <button
                  onClick={() => {
                    const ordersToShip = data.orders.filter(o => selectedOrders.has(o.orderId));
                    if (ordersToShip.length > 0) setShippingOrders(ordersToShip);
                  }}
                  className="glass-btn px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 tracking-wider uppercase text-emerald-400 border-[rgba(52,211,153,0.2)] bg-[rgba(52,211,153,0.06)] hover:bg-[rgba(52,211,153,0.12)] transition-colors"
                >
                  <Truck size={13} /> Ship
                </button>
              )}

              {/* Fulfill */}
              <button
                onClick={() => {
                  const selected = data.orders.filter(o => selectedOrders.has(o.orderId));
                  if (selected.length > 0) {
                    setWizardOrders(selected);
                    setShowFulfillWizard(true);
                    setSelectedOrders(new Set());
                    setSelectionMode(false);
                  }
                }}
                className="glass-btn-accent px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 tracking-wider uppercase btn-shine-effect"
              >
                <ClipboardCheck size={13} /> Fulfill
              </button>

              {/* Delete */}
              <button
                onClick={handleDeleteSelected}
                className="glass-icon-btn text-red-400 hover:bg-[rgba(239,68,68,0.1)]"
                title="Delete selected"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Root() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
