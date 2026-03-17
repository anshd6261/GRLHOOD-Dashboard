import React, { useState, useEffect } from 'react';
import axios from 'axios';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { Package, Smartphone, IndianRupee, Download, RefreshCw, Settings, Search, Mail, UploadCloud, ChevronRight, ChevronDown, ChevronUp, Box, BarChart2, MessageSquare, Users, History, Plus, Trash2, Save, X, Grid, ExternalLink, Truck, Calendar, CheckSquare, XOctagon, AlertTriangle, Edit3 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import SupplierDashboard from './pages/SupplierDashboard';
import FinancialDashboard from './pages/FinancialDashboard';
import HomeAnalytics from './pages/HomeAnalytics';
import ProductAnalysis from './pages/ProductAnalysis';
import CsvEditorModal from './components/CsvEditorModal';
import EditOrderModal from './components/EditOrderModal';

const API_BASE = import.meta.env.VITE_API_URL || '';
const API_URL = API_BASE ? `${API_BASE}/api` : '/api';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8">
          <h1 className="text-3xl font-bold text-red-500 mb-4">Something went wrong.</h1>
          <pre className="text-xs bg-gray-900 p-4 rounded text-red-300 max-w-2xl overflow-auto">
            {this.state.error?.toString()}
          </pre>
          <button onClick={() => window.location.reload()} className="mt-6 bg-white text-black px-6 py-3 rounded-xl font-bold">Reload Page</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingBatch, setEditingBatch] = useState(null);

  // Date Picker State
  const [dateRange, setDateRange] = useState([new Date(new Date().setDate(new Date().getDate() - 3)), new Date()]);
  const [startDate, endDate] = dateRange;

  const [workflowStatus, setWorkflowStatus] = useState('idle');
  const [walletPopup, setWalletPopup] = useState(null);

  // Selection State
  const [selectedOrders, setSelectedOrders] = useState(new Set());
  const [showCsvEditor, setShowCsvEditor] = useState(false);
  const [csvPreviewData, setCsvPreviewData] = useState([]);

  // Accordion State
  const [expandedOrders, setExpandedOrders] = useState(new Set());
  const toggleOrderExpanded = (id) => {
    setExpandedOrders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Long-Press Selection Logic
  const [selectionMode, setSelectionMode] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);

  useEffect(() => {
    if (selectedOrders.size === 0) setSelectionMode(false);
  }, [selectedOrders.size]);

  const handlePressStart = (id) => {
    window.pressTimer = setTimeout(() => {
      setSelectionMode(true);
      toggleSelectRow(id);
      if ("vibrate" in navigator) navigator.vibrate(50);
    }, 600); // 600ms hold
  };
  const handlePressEnd = () => {
    if (window.pressTimer) clearTimeout(window.pressTimer);
  };

  const handleSaveEdit = (updatedItemsArray) => {
    if (!data?.orders) return;
    if (!updatedItemsArray || !Array.isArray(updatedItemsArray)) return;

    const newOrders = [...data.orders];

    // For each item edited in the modal, find it in the master list and overwrite it
    updatedItemsArray.forEach(editedItem => {
      const idx = newOrders.findIndex(o => o.id === editedItem.id);
      if (idx > -1) {
        newOrders[idx] = { ...newOrders[idx], ...editedItem };
      }
    });

    setData({ ...data, orders: newOrders });
    setToast({ message: "Order Updated Successfully!", type: "success" });
    setEditingOrder(null);
  };

  // RTO Click Modal State (kept for Place Order tab)
  const [openRtoRiskId, setOpenRtoRiskId] = useState(null);

  // Fulfillment Filters & Calling State
  const [activeFilter, setActiveFilter] = useState('All'); // 'All', 'High Risk', 'Missing Device', 'Multiple Orders'

  useEffect(() => { if (activeTab === 'history') fetchHistory(); }, [activeTab]);

  /* --- NEW TOAST & UI STATE --- */
  const [toast, setToast] = useState(null); // { message, type: 'success'|'error'|'info' }
  useEffect(() => { if (toast) setTimeout(() => setToast(null), 3000); }, [toast]);

  const handleGenerateLabels = async () => {
    // QUICK ACTION: Instant feedback, no native confirm
    setLoading('Starting...');

    try {
      const res = await axios.post(`${API_URL}/shiprocket/generate-labels`);

      if (res.data.jobId) {
        const jobId = res.data.jobId;
        const poll = setInterval(async () => {
          try {
            const statusRes = await axios.get(`${API_URL}/shiprocket/job/${jobId}`);
            const job = statusRes.data;

            if (['STARTING', 'FETCHING_DETAILS', 'CHECKING_WALLET', 'PROCESSING_SHIPROCKET', 'GENERATING_LABELS'].includes(job.status)) {
              setLoading(job.progress ? `Processing: ${job.progress}` : `Status: ${job.status.replace('_', ' ')}`);
            }
            else if (job.status === 'REQUIRES_MONEY') {
              clearInterval(poll);
              setLoading(false);
              setWalletPopup(job);
            }
            else if (job.status === 'COMPLETED') {
              clearInterval(poll);
              if (job.labelUrl) {
                // Auto-open if possible, but popups might block.
                // Better to show the Success Modal.
              }
              setData(prev => ({ ...prev, labelUrl: job.labelUrl, highRiskUrl: job.highRiskUrl, failedUrl: job.failedUrl }));
              setLoading('success_label');
              setToast({ message: "Labels Generated Successfully!", type: 'success' });
            }
            else if (job.status === 'FAILED') {
              clearInterval(poll);
              setLoading(false);
              setToast({ message: 'Job Failed: ' + job.error, type: 'error' });
            }
          } catch (e) {
            // Ignore poll error
          }
        }, 1500); // Faster polling (1.5s)
      } else {
        setToast({ message: 'Failed to start job: ' + (res.data.error || 'Unknown'), type: 'error' });
        setLoading(false);
      }
    } catch (e) {
      setToast({ message: 'Network Error: ' + e.message, type: 'error' });
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try { const res = await axios.get(`${API_URL}/history`); setHistoryData(res.data); } catch (e) { }
  };

  const handleSync = async () => {
    setLoading(true); setWorkflowStatus('processing');
    setSelectedOrders(new Set()); // Clear selection on sync

    try {
      let startStr = '';
      let endStr = '';

      if (startDate instanceof Date && !isNaN(startDate)) {
        startStr = startDate.toISOString();
      }
      if (endDate instanceof Date && !isNaN(endDate)) {
        endStr = endDate.toISOString();
      }

      console.log('Syncing with:', { startStr, endStr });

      const res = await axios.get(`${API_URL}/orders?status=unfulfilled&startDate=${startStr}&endDate=${endStr}`);

      if (res.headers['content-type']?.includes('text/html')) {
        throw new Error('Server returned HTML (500/404). Check Server Logs.');
      }

      if (!res.data || !Array.isArray(res.data.orders)) {
        console.warn('Invalid API Response:', res.data);
        setData({ ...res.data, orders: res.data?.orders || [] });
      } else {
        setData(res.data);
      }

      setWorkflowStatus('review');
    }
    catch (e) {
      console.error("Sync Error:", e);
      setError(e.message);
      alert(`Sync Failed: ${e.message}`);
      setWorkflowStatus('idle');
    }
    finally { setLoading(false); }
  };

  const executeDownload = async ({ rows, type = 'all', skipHistory = false }) => {
    if (!rows || !rows.length) return;
    let target = rows;
    if (type === 'prepaid') target = rows.filter(r => r.payment === 'Prepaid');
    if (type === 'cod') target = rows.filter(r => r.payment === 'Cash on Delivery');

    try {
      const res = await axios.post(`${API_URL}/download`, { rows: target, skipHistory }, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;

      const contentDisposition = res.headers['content-disposition'];
      let filename = `Orders_${type}_${Date.now()}.csv`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) filename = match[1];
      }
      if (res.headers['x-filename']) filename = res.headers['x-filename'];

      a.download = filename;
      a.click();
    } catch (e) {
      console.error('Download execution failed:', e);
      alert('Download failed: ' + (e.message || 'Unknown error'));
    }
  };

  const handleDownloadDashboard = (t) => data?.orders && executeDownload({ rows: data.orders, type: t });
  const handleSendEmail = async () => { if (data?.orders) { setLoading(true); try { await axios.post(`${API_URL}/email-approval`, { rows: data.orders }); alert('Sent'); } catch (e) { } finally { setLoading(false) } } };
  const handleUploadPortal = async (ordersToUpload) => {
    const targetOrders = (ordersToUpload && ordersToUpload.length > 0) ? ordersToUpload : data?.orders;
    if (!targetOrders || targetOrders.length === 0) return;

    setLoading('Uploading to Portal...');
    try {
      await axios.post(`${API_URL}/upload-portal`, { rows: targetOrders });
      setToast({ message: 'Orders Successfully Sent to Portal', type: 'success' });
    } catch (e) {
      alert('Upload Failed: ' + (e.response?.data?.error || e.message));
    } finally {
      setLoading(false);
    }
  };

  const saveHistory = async () => {
    if (!editingBatch) return;
    await axios.put(`${API_URL}/history/${editingBatch.id}`, { rows: editingBatch.rows });
    await executeDownload({ rows: editingBatch.rows, skipHistory: true });
    await fetchHistory(); setEditingBatch(null);
  };

  const handleCreateSku = async (productId) => {
    if (!confirm('Generate and assign new SKU to this product?')) return;
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/products/${productId}/assign-sku`);
      if (res.data.success) {
        alert(`Assigned SKU: ${res.data.sku}`);
        handleSync();
      }
    } catch (e) { alert('Failed: ' + (e.response?.data?.error || e.message)); }
    finally { setLoading(false); }
  };

  const handleCancelOrder = async (row) => {
    if (!row?.id || !row?.orderId) {
      alert("Missing order details for cancellation.");
      return;
    }
    const confirmed = window.confirm(`Are you sure you want to PERMANENTLY cancel order ${row.orderId} on both Shopify and Shiprocket?`);
    if (!confirmed) return;

    setLoading(`Cancelling ${row.orderId}...`);
    try {
      const res = await axios.post(`${API_URL}/orders/${row.id}/cancel`, { orderName: row.orderId });
      if (res.data.success) {
        alert(res.data.message);
        // Remove the order from local state
        const newOrders = data.orders.filter(o => o.orderId !== row.orderId);
        setData({ ...data, orders: newOrders });
        setSelectedOrders(prev => {
          const next = new Set(prev);
          next.delete(row.orderId);
          return next;
        });
      }
    } catch (e) {
      alert('Cancellation failed: ' + (e.response?.data?.error || e.message));
    } finally {
      setLoading(false);
    }
  };

  // Selection Logic
  const toggleSelectAll = () => {
    if (!data?.orders) return;
    if (selectedOrders.size === data.orders.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(data.orders.map(o => o.orderId)));
    }
  };

  const toggleSelectRow = (id) => {
    if (!id) return;
    const newSet = new Set(selectedOrders);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
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
    if (!confirm(`Remove ${selectedOrders.size} orders from this list? (Does not delete from Shopify)`)) return;

    const remaining = data.orders.filter(o => !selectedOrders.has(o.orderId));
    setData({ ...data, orders: remaining });
    setSelectedOrders(new Set());
  };

  // Re-use Logic
  const filteredOrders = React.useMemo(() => {
    if (!data?.orders || !Array.isArray(data.orders)) return [];
    return data.orders.filter(r => {
      if (!r) return false;
      const s = searchTerm.toLowerCase();
      const oid = r.orderId ? r.orderId.toString().toLowerCase() : '';
      const name = r.customerName ? r.customerName.toLowerCase() : '';
      const matchesSearch = !searchTerm || oid.includes(s) || name.includes(s);

      let matchesFilter = true;
      if (activeFilter === 'High Risk') matchesFilter = r.rtoRisk === 'High';
      if (activeFilter === 'Missing Device') matchesFilter = !r.model || r.model.trim() === '' || r.model.toLowerCase() === 'unknown model';
      if (activeFilter === 'Multiple Orders') matchesFilter = (r.customerOrdersCount || 1) > 1;

      return matchesSearch && matchesFilter;
    });
  }, [data, searchTerm, activeFilter]);

  // Group line items into parent Orders
  const groupedFilteredOrders = React.useMemo(() => {
    const groups = {};
    filteredOrders.forEach(o => {
      if (!groups[o.orderId]) {
        groups[o.orderId] = {
          orderId: o.orderId,
          customerName: o.customerName,
          payment: o.payment,
          rtoRisk: o.rtoRisk,
          hasCopiedNumberDifferentName: o.hasCopiedNumberDifferentName,
          customerOrdersCount: o.customerOrdersCount,
          shippingDetails: o.shippingDetails,
          orderLink: o.orderLink,
          shiprocketId: o.shiprocketId,
          items: [],
          totalCogs: 0,
          totalItemsPrice: 0,
          createdAt: o.createdAt
        };
      }
      groups[o.orderId].items.push(o);
      groups[o.orderId].totalCogs += (o.cogs || 0);
      groups[o.orderId].totalItemsPrice += (o.price || 0);
    });
    return Object.values(groups);
  }, [filteredOrders]);

  return (
    <div className="mobile-container pb-24 text-white font-sans flex flex-col">
      {/* STICKY TOP APP BAR (Global Controls) */}
      <div className="sticky top-0 z-50 bg-[#0A0A0A]/85 backdrop-blur-2xl border-b border-white/5 px-4 py-3 flex justify-between items-center shadow-[0_4px_30px_rgba(0,0,0,0.6)]">

        {/* Global Nav Controls */}
        <div className="flex items-center gap-3 w-full max-w-[400px]">
          {/* Glowing Date Picker Pill */}
          <div className="relative group w-full flex-1">
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/50 to-purple-500/50 rounded-2xl blur-lg opacity-40 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative flex items-center justify-center gap-2 bg-[#0A0A0A]/80 hover:bg-[#0A0A0A] transition-colors px-4 py-2.5 rounded-2xl border border-white/20 backdrop-blur-3xl shadow-[0_4px_20px_rgba(0,0,0,0.5)] w-full text-center">
              <Calendar size={16} className="text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.8)] absolute left-4" />
              <DatePicker
                selectsRange={true}
                startDate={startDate}
                endDate={endDate}
                onChange={(update) => setDateRange(update)}
                className="bg-transparent text-sm font-black text-white outline-none w-full text-center placeholder-white/50 cursor-pointer ml-4"
                placeholderText="Select Date"
              />
            </div>
          </div>

          {/* Sync Button */}
          <button onClick={handleSync} disabled={loading} className="relative group flex items-center justify-center focus:outline-none shrink-0">
            <div className="absolute inset-0 bg-cyan-500/50 rounded-2xl blur-lg opacity-40 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative p-3 rounded-2xl bg-[#0A0A0A]/80 border border-white/20 hover:bg-[#0A0A0A] transition-colors shadow-[0_4px_20px_rgba(0,0,0,0.5)] backdrop-blur-3xl">
              <RefreshCw size={18} className={loading ? 'animate-spin text-cyan-400' : 'text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]'} />
            </div>
          </button>
        </div>
      </div>

      <main className="flex-1 p-4 w-full relative">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div key="dashboard" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <HomeAnalytics startDate={startDate} endDate={endDate} onNavigateToProductAnalysis={() => setActiveTab('product_analysis')} />
            </motion.div>
          )}

          {activeTab === 'product_analysis' && (
            <motion.div key="product_analysis" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <ProductAnalysis startDate={startDate} endDate={endDate} />
            </motion.div>
          )}

          {activeTab === 'place_order' && (
            <motion.div key="place_order" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
              {/* FULFILL METRICS 2x2 GRID */}
              <div className="grid grid-cols-2 gap-4">
                <div className="glass-card p-4 relative overflow-hidden flex flex-col justify-between h-32">
                  <div className="absolute -top-10 -right-10 w-24 h-24 bg-cyan-500/10 blur-2xl rounded-full z-0"></div>
                  <div className="flex justify-between items-start relative z-10">
                    <div className="text-[10px] font-bold text-gray-400 tracking-wider">TOTAL ORDERS</div>
                    <Package size={16} className="text-cyan-400" />
                  </div>
                  <div className="relative z-10">
                    <div className="text-3xl font-bold text-white tracking-tight">{data?.stats?.totalOrders || 0}</div>
                    <div className="text-[10px] text-gray-400 uppercase mt-1">Pending Sync</div>
                  </div>
                </div>

                <div className="glass-card p-4 relative overflow-hidden flex flex-col justify-between h-32">
                  <div className="absolute -bottom-10 -left-10 w-24 h-24 bg-cyan-500/10 blur-2xl rounded-full z-0"></div>
                  <div className="flex justify-between items-start relative z-10">
                    <div className="text-[10px] font-bold text-gray-400 tracking-wider">TOTAL UNITS</div>
                    <Smartphone size={16} className="text-cyan-400" />
                  </div>
                  <div className="relative z-10">
                    <div className="text-3xl font-bold text-white tracking-tight">{data?.stats?.totalItems || 0}</div>
                    <div className="text-[10px] text-gray-400 uppercase mt-1">SKUs</div>
                  </div>
                </div>

                <div className="glass-card p-4 relative overflow-hidden flex flex-col justify-between h-32">
                  <div className="absolute -top-10 -left-10 w-24 h-24 bg-cyan-500/10 blur-2xl rounded-full z-0"></div>
                  <div className="flex justify-between items-start relative z-10">
                    <div className="text-[10px] font-bold text-gray-400 tracking-wider">SUPPLIER INVOICE</div>
                    <IndianRupee size={16} className="text-cyan-400" />
                  </div>
                  <div className="relative z-10">
                    <div className="text-2xl font-bold text-white tracking-tight">₹{data?.stats?.total?.toFixed(0) || 0}</div>
                    <div className="text-[10px] text-gray-400 font-medium mt-1">
                      Includes 18% GST
                    </div>
                  </div>
                </div>

                <div className="glass-card p-3 relative overflow-hidden flex flex-col justify-center gap-2 h-32">
                  <div className="absolute inset-0 bg-white/5 z-0"></div>
                  <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-cyan-500/10 blur-3xl rounded-full z-0"></div>
                  {workflowStatus === 'review' ? (
                    <div className="relative z-10 flex flex-col gap-2 h-full justify-center">
                      <button onClick={() => { setCsvPreviewData(data?.orders || []); setShowCsvEditor(true); }} disabled={loading} className="flex-1 bg-white hover:bg-gray-200 text-black rounded-[14px] font-black text-[11px] flex items-center justify-center gap-1.5 transition-all shadow-[0_0_15px_rgba(255,255,255,0.2)] tracking-widest uppercase">
                        <UploadCloud size={14} /> SEND ORDER
                      </button>
                      <button onClick={handleGenerateLabels} disabled={loading} className="flex-1 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-[14px] font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all tracking-widest uppercase">
                        <Truck size={14} /> LABELS
                      </button>
                    </div>
                  ) : (
                    <div className="relative z-10 text-center text-gray-500 text-[10px] font-black uppercase tracking-widest drop-shadow-md opacity-60">
                      Sync to enable actions
                    </div>
                  )}
                </div>
              </div>




              <AnimatePresence>
                {selectedOrders.size > 0 && (
                  <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }} className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 bg-[#1A1A1A] border border-white/10 rounded-2xl p-4 shadow-2xl flex items-center gap-4">
                    <div className="font-bold text-white px-2">{selectedOrders.size} Selected</div>
                    <div className="h-8 w-px bg-white/10"></div>
                    <button onClick={handleDownloadSelected} className="flex items-center gap-2 text-sm font-bold text-cyan-400 hover:bg-cyan-500/10 px-4 py-2 rounded-xl transition-colors"><Download size={16} /> Download CSV</button>
                    <button onClick={handleDeleteSelected} className="flex items-center gap-2 text-sm font-bold text-red-400 hover:bg-red-500/10 px-4 py-2 rounded-xl transition-colors"><Trash2 size={16} /> Remove</button>
                    <button onClick={() => setSelectedOrders(new Set())} className="p-2 hover:bg-white/10 rounded-full text-gray-400"><X size={16} /></button>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="glass-card min-h-[500px] p-4 md:p-6 mb-24">
                <div className="flex flex-col gap-4 mb-6 pt-2">
                  <div className="flex justify-between items-center px-1">
                    <h3 className="text-2xl font-black text-white glow-text tracking-wider uppercase">Review Orders</h3>
                  </div>

                  {/* Quick Filter Pills */}
                  <div className="flex justify-between items-center mt-2 px-1">
                    <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar flex-1">
                      {['All', 'High Risk', 'Missing Device', 'Multiple Orders'].map(f => (
                        <button
                          key={f}
                          onClick={() => setActiveFilter(f)}
                          className={`px-5 py-2.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border shadow-sm tracking-wide ${activeFilter === f ? 'bg-white text-black border-white glow-text' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white'} `}
                        >
                          {f} {activeFilter === f && `(${filteredOrders.length})`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {!data ? (
                  <div className="flex flex-col items-center justify-center py-32 opacity-20">
                    <Box size={64} />
                    <div className="mt-4 font-medium">No Data Synced</div>
                  </div>
                ) : (
                  <div className="space-y-6 pb-20">
                    {groupedFilteredOrders.map((group, i) => {
                      const isExpanded = expandedOrders.has(group.orderId);
                      return (
                        <div key={group.orderId} className={`glass-card overflow-hidden transition-all ${selectedOrders.has(group.orderId) ? 'ring-2 ring-cyan-500/50 bg-cyan-900/10' : ''}`}>

                          {/* Parent Order Header (Always Visible) */}
                          <div
                            className="p-5 md:p-6 flex flex-col gap-4"
                            onPointerDown={() => !selectionMode && handlePressStart(group.orderId)}
                            onPointerUp={handlePressEnd}
                            onPointerLeave={handlePressEnd}
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex items-start gap-4 w-full max-w-[75%]">
                                {selectionMode && (
                                  <div
                                    onClick={(e) => { e.stopPropagation(); toggleSelectRow(group.orderId); }}
                                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-1 cursor-pointer transition-colors ${selectedOrders.has(group.orderId) ? 'border-cyan-400 bg-cyan-500/20' : 'border-white/20 bg-black/20'}`}
                                  >
                                    {selectedOrders.has(group.orderId) && <div className="w-2.5 h-2.5 rounded-sm bg-cyan-400"></div>}
                                  </div>
                                )}
                                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => { if (selectionMode) { toggleSelectRow(group.orderId); } else { toggleOrderExpanded(group.orderId); } }}>
                                  <div className="font-mono font-bold text-white text-lg lg:text-xl flex items-center gap-2">
                                    {group.orderId}
                                    <div className="p-1 rounded bg-white/5 text-gray-400">
                                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </div>
                                  </div>
                                  <div className="text-sm text-gray-400 font-medium truncate mt-1">{group.customerName}</div>

                                  {/* Order-level Tags (Aligned under text) */}
                                  <div className="flex flex-wrap gap-2 mt-3">
                                    <span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded shadow-sm border whitespace-nowrap ${group.payment === 'Prepaid' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                                      {group.payment || 'Prepaid'}
                                    </span>
                                    <span className={`flex items-center gap-1 text-[10px] uppercase font-black px-2 py-0.5 rounded shadow-sm border whitespace-nowrap ${group.rtoRisk === 'High' ? 'bg-red-500/10 text-red-400 border-red-500/20' : group.rtoRisk === 'Medium' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' : group.rtoRisk === 'Low' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
                                      <AlertTriangle size={10} /> {group.rtoRisk || 'Unknown'} Risk
                                    </span>
                                    <span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded shadow-sm border whitespace-nowrap ${group.customerOrdersCount > 1 ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
                                      {group.customerOrdersCount > 1 ? `Repeat (${group.customerOrdersCount})` : 'New Customer'}
                                    </span>
                                    {group.hasCopiedNumberDifferentName && (
                                      <span className="flex items-center gap-1 text-[10px] uppercase font-black px-2 py-0.5 rounded shadow-sm border whitespace-nowrap bg-purple-500/10 text-purple-400 border-purple-500/20">
                                        <AlertTriangle size={10} /> Copied #
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <div className="text-xl font-black text-white glow-text">₹{group.totalItemsPrice}</div>
                                <div className="text-xs text-gray-500 mt-1">{group.items.length} Unit{group.items.length > 1 ? 's' : ''}</div>
                              </div>
                            </div>
                          </div>

                          {/* Expanded Area: Line Items & Footer Actions */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                <div className="border-t border-white/5 bg-black/20 p-4 md:p-5 flex flex-col gap-4">

                                  {/* Line Items List */}
                                  <div className="space-y-3">
                                    {group.items.map((item, idx) => (
                                      <div key={idx} className="bg-black/30 rounded-xl p-3 border border-white/5 flex gap-3">
                                        {item.thumbnail ? (
                                          <img src={item.thumbnail} className="w-12 h-12 rounded-lg object-cover bg-white/5" />
                                        ) : (
                                          <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                                            <Package size={20} className="text-gray-500" />
                                          </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                          <div className="font-bold text-white text-sm line-clamp-1">{item.category || 'Unknown Product'}</div>
                                          <div className="text-xs text-gray-400 mt-1 truncate">{item.model || 'Unknown Model'} {item.sku && `• ${item.sku}`}</div>
                                        </div>
                                        <div className="text-right flex flex-col justify-end shrink-0 pl-2">
                                          <div className="text-[10px] text-gray-500 uppercase font-black tracking-widest">COGS</div>
                                          <div className="font-bold text-cyan-400 text-sm">₹{item.cogs || 0}</div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>

                                  {/* Action Footer */}
                                  <div className="pt-2 mt-1 border-t border-white/5 flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                      {group.shiprocketId && (
                                        <a href={`https://app.shiprocket.in/seller/orders/details/${group.shiprocketId}`} target="_blank" className="p-2 rounded-xl bg-white/5 text-indigo-400 hover:bg-white/10 transition-colors border border-white/5 shrink-0">
                                          <Truck size={16} />
                                        </a>
                                      )}
                                      <a href={group.orderLink || '#'} target="_blank" className="p-2 rounded-xl bg-white/5 text-gray-400 hover:text-white transition-colors border border-white/5 shrink-0">
                                        <ExternalLink size={16} />
                                      </a>
                                      <button
                                        onClick={() => {
                                          if (group.shippingDetails?.phone) {
                                            window.location.href = `tel:${group.shippingDetails.phone}`;
                                          }
                                          setEditingOrder(group.items);
                                        }}
                                        className="p-2 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-colors flex items-center gap-2 font-bold text-xs shrink-0"
                                      >
                                        <Smartphone size={16} /> Call {group.shippingDetails?.phone ? '' : '(Add)'}
                                      </button>
                                    </div>

                                    <div className="flex gap-2">
                                      <button onClick={() => setEditingOrder(group.items)} className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-white text-xs font-bold transition-colors flex items-center gap-2">
                                        <Edit3 size={14} /> Edit
                                      </button>
                                      <button onClick={() => handleCancelOrder(group.items[0])} className="px-4 py-2 rounded-xl bg-red-500/10 text-red-400 text-xs font-bold border border-red-500/20 hover:bg-red-500/20 flex items-center gap-2 transition-colors">
                                        <XOctagon size={14} /> Cancel
                                      </button>
                                    </div>
                                  </div>

                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>

                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div key="history" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
              <div className="panel-dark">
                <h2 className="text-2xl font-bold mb-8">History</h2>
                <div className="space-y-4">
                  {historyData.map(batch => (
                    <div key={batch.id} className="flex items-center justify-between p-4 bg-[#1A1A1A] rounded-2xl border border-white/5 hover:border-white/10 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold ${batch.type === 'DOWNLOAD' ? 'bg-cyan-500/10 text-cyan-400' : 'bg-purple-500/10 text-purple-400'}`}>
                          {batch.type === 'DOWNLOAD' ? 'DL' : 'EM'}
                        </div>
                        <div>
                          <div className="font-bold">{batch.count} Orders</div>
                          <div className="text-xs text-gray-500">{new Date(batch.timestamp).toLocaleString()} • ID: {batch.id}</div>
                        </div>
                      </div>
                      <button onClick={() => setEditingBatch(JSON.parse(JSON.stringify(batch)))} className="px-5 py-2 rounded-lg bg-black/40 border border-white/10 hover:bg-white/10 transition-colors font-bold text-sm">Edit</button>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'supplier' && (
            <motion.div key="supplier" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <SupplierDashboard />
            </motion.div>
          )}

          {activeTab === 'financials' && (
            <motion.div key="financials" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <FinancialDashboard />
            </motion.div>
          )}

        </AnimatePresence>

        {/* Edit Order Modal */}
        <EditOrderModal
          isOpen={!!editingOrder}
          onClose={() => setEditingOrder(null)}
          order={editingOrder}
          onSave={handleSaveEdit}
        />        <AnimatePresence>
          {editingBatch && (
            <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-8">
              <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-[#111111] w-full max-w-6xl h-[90vh] rounded-3xl border border-white/10 flex flex-col overflow-hidden shadow-2xl">
                <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#151515]">
                  <h3 className="font-bold text-lg">Editing Batch {editingBatch.id}</h3>
                  <div className="flex gap-3">
                    <button onClick={() => {
                      const newRow = { orderId: 'NEW', category: '', model: '', customerName: '', cogs: 0, sku: '', payment: 'Prepaid' };
                      setEditingBatch({ ...editingBatch, rows: [newRow, ...editingBatch.rows] });
                    }} className="px-4 py-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg hover:bg-blue-500/20 font-bold text-sm flex items-center gap-2"><Plus size={16} /> Add Row</button>
                    <button onClick={() => setEditingBatch(null)} className="px-4 py-2 hover:bg-white/5 rounded-lg text-gray-400">Cancel</button>
                    <button onClick={saveHistory} className="px-6 py-2 bg-white text-black font-bold rounded-lg flex items-center gap-2 hover:bg-gray-200"><Save size={16} /> Save & Download</button>
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-0">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-[#0F0F0F] z-10 text-xs text-gray-500 uppercase font-bold">
                      <tr>
                        <th className="p-4">Action</th>
                        <th className="p-4">ID</th>
                        <th className="p-4">Category</th>
                        <th className="p-4">Model</th>
                        <th className="p-4">SKU</th>
                        <th className="p-4">Customer</th>
                        <th className="p-4 text-right">COGS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {editingBatch.rows.map((r, i) => (
                        <tr key={i} className="hover:bg-white/5">
                          <td className="p-4"><button onClick={() => { const n = [...editingBatch.rows]; n.splice(i, 1); setEditingBatch({ ...editingBatch, rows: n }) }} className="text-red-500 opacity-50 hover:opacity-100"><Trash2 size={16} /></button></td>
                          <td className="p-4"><input value={r.orderId} onChange={(e) => { const n = [...editingBatch.rows]; n[i].orderId = e.target.value; setEditingBatch({ ...editingBatch, rows: n }) }} className="bg-transparent outline-none w-20 text-cyan-400 font-mono" /></td>
                          <td className="p-4"><input value={r.category} onChange={(e) => { const n = [...editingBatch.rows]; n[i].category = e.target.value; setEditingBatch({ ...editingBatch, rows: n }) }} className="bg-transparent outline-none w-full text-white" /></td>
                          <td className="p-4"><input value={r.model} onChange={(e) => { const n = [...editingBatch.rows]; n[i].model = e.target.value; setEditingBatch({ ...editingBatch, rows: n }) }} className="bg-transparent outline-none w-full text-gray-400 focus:text-lime-400" /></td>
                          <td className="p-4"><input value={r.sku || ''} onChange={(e) => { const n = [...editingBatch.rows]; n[i].sku = e.target.value; setEditingBatch({ ...editingBatch, rows: n }) }} className="bg-transparent outline-none w-24 text-gray-500 font-mono text-xs" placeholder="SKU" /></td>
                          <td className="p-4"><input value={r.customerName || ''} onChange={(e) => { const n = [...editingBatch.rows]; n[i].customerName = e.target.value; setEditingBatch({ ...editingBatch, rows: n }) }} className="bg-transparent outline-none w-full text-gray-300" placeholder="Customer" /></td>
                          <td className="p-4 text-right"><input value={r.cogs} type="number" onChange={(e) => { const n = [...editingBatch.rows]; n[i].cogs = e.target.value; setEditingBatch({ ...editingBatch, rows: n }) }} className="bg-transparent outline-none w-20 text-right text-gray-300" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {walletPopup && (
            <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-xl flex items-center justify-center p-8">
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-[#1A1A1A] w-full max-w-md rounded-3xl border border-white/10 p-8 flex flex-col items-center text-center shadow-2xl relative">
                {/* Close Button */}
                <button
                  onClick={() => setWalletPopup(null)}
                  className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-gray-400 hover:text-white transition-all"
                >
                  <X size={16} />
                </button>

                <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 mb-6">
                  <IndianRupee size={32} />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Insufficient Funds</h3>
                <p className="text-gray-400 text-sm mb-6">
                  Your Shiprocket wallet doesn't have enough balance to process{' '}
                  <b className="text-white">{walletPopup.orderCount || 0} orders</b>.
                </p>

                {/* Balance Breakdown */}
                <div className="bg-black/40 rounded-xl p-4 w-full mb-4 border border-white/5">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-500">Current Balance</span>
                    <span className="text-white font-mono">₹{walletPopup.currentBalance}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-500">Required (Est.)</span>
                    <span className="text-orange-400 font-mono">₹{walletPopup.estimatedCost}</span>
                  </div>
                  <div className="h-px bg-white/10 my-2"></div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400 font-semibold">You Need to Add</span>
                    <span className="text-red-400 font-mono font-bold">₹{walletPopup.shortfall || (walletPopup.estimatedCost - walletPopup.currentBalance)}</span>
                  </div>
                </div>

                {/* Cost Breakdown */}
                {walletPopup.avgCostPerOrder && (
                  <div className="bg-blue-500/10 rounded-lg p-3 w-full mb-6 border border-blue-500/20">
                    <div className="text-xs text-blue-300 mb-1">Estimate Breakdown</div>
                    <div className="text-sm text-white">
                      {walletPopup.orderCount} orders × ₹{walletPopup.avgCostPerOrder} avg. = ₹{walletPopup.estimatedCost}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      Based on your historical shipping costs + 10% safety margin
                    </div>
                  </div>
                )}

                <div className="flex gap-3 w-full">
                  <button
                    onClick={() => setWalletPopup(null)}
                    className="flex-1 bg-gray-800 text-white py-3 rounded-xl font-bold hover:bg-gray-700 transition-colors border border-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setWalletPopup(null)}
                    className="flex-1 bg-white text-black py-3 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                  >
                    I've Added Funds
                  </button>
                </div>
                <div className="mt-4 text-xs text-gray-600">
                  Add ₹{walletPopup.shortfall || 0}+ to your Shiprocket wallet and try again.
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {loading === 'success_label' && (
            <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-xl flex items-center justify-center p-8">
              <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-[#1A1A1A] w-full max-w-md rounded-3xl border border-white/10 p-8 flex flex-col items-center text-center shadow-2xl">
                <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center text-green-500 mb-6">
                  <Truck size={32} />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Labels Generated!</h3>
                <div className="space-y-4 w-full mt-4">
                  {data?.labelUrl && (
                    <a href={data.labelUrl} target="_blank" className="block w-full bg-indigo-600 text-white p-4 rounded-xl font-bold hover:bg-indigo-500 transition-colors">
                      Download Labels (PDF)
                    </a>
                  )}
                  {data?.highRiskUrl && (
                    <a href={data.highRiskUrl} download="HIGH_RISK.csv" className="block w-full bg-red-900/40 text-red-200 border border-red-500/40 p-4 rounded-xl font-bold hover:bg-red-900/60 transition-colors">
                      Download High Risk Report
                    </a>
                  )}
                  <button onClick={() => { setLoading(false); setData(d => ({ ...d, labelUrl: null, highRiskUrl: null })); }} className="text-sm text-gray-500 hover:text-white mt-4">Close</button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className={`fixed bottom-24 right-4 z-[300] px-6 py-4 rounded-xl shadow-2xl border flex items-center gap-3 backdrop-blur-md ${toast.type === 'error' ? 'bg-red-500/10 border-red-500/50 text-red-200' : 'bg-green-500/10 border-green-500/50 text-green-200'}`}
            >
              {toast.type === 'error' ? <X size={20} className="text-red-500" /> : <CheckSquare size={20} className="text-green-500" />}
              <span className="font-bold">{toast.message}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showCsvEditor && (
            <CsvEditorModal
              orders={csvPreviewData}
              onClose={() => setShowCsvEditor(false)}
              onSaveOnly={() => setToast({ message: 'Files downloaded successfully', type: 'success' })}
              onUploadPortal={handleUploadPortal}
            />
          )}
        </AnimatePresence>
      </main>

      {/* BOTTOM TAB BAR (Sexy Glassmorphism Style) */}
      <nav className="fixed bottom-0 w-full max-w-[500px] z-[100] flex justify-around items-center p-3 pb-[env(safe-area-inset-bottom,20px)] border-t border-white/10 bg-[#0A0A0A]/70 backdrop-blur-3xl rounded-t-[32px] shadow-[0_-20px_40px_rgba(0,0,0,0.8)] before:absolute before:inset-0 before:bg-gradient-to-t before:from-white/5 before:to-transparent before:rounded-t-[32px] before:pointer-events-none">
        <button onClick={() => setActiveTab('dashboard')} className={`relative flex flex-col items-center gap-1.5 p-2 transition-all duration-300 ${activeTab === 'dashboard' ? 'text-cyan-400 translate-y-[-4px] drop-shadow-[0_0_15px_rgba(6,182,212,0.8)]' : 'text-gray-500 hover:text-gray-300 hover:-translate-y-1'}`}>
          <div className={`p-2.5 rounded-2xl transition-all duration-300 ${activeTab === 'dashboard' ? 'bg-cyan-500/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)] border border-cyan-500/20' : 'bg-transparent border border-transparent'}`}><Grid size={22} /></div>
          <span className="text-[10px] font-black tracking-widest uppercase">Home</span>
        </button>
        <button onClick={() => setActiveTab('place_order')} className={`relative flex flex-col items-center gap-1.5 p-2 transition-all duration-300 ${activeTab === 'place_order' ? 'text-purple-400 translate-y-[-4px] drop-shadow-[0_0_15px_rgba(168,85,247,0.8)]' : 'text-gray-500 hover:text-gray-300 hover:-translate-y-1'}`}>
          <div className={`p-2.5 rounded-2xl transition-all duration-300 ${activeTab === 'place_order' ? 'bg-purple-500/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)] border border-purple-500/20' : 'bg-transparent border border-transparent'}`}><CheckSquare size={22} /></div>
          <span className="text-[10px] font-black tracking-widest uppercase">Fulfill</span>
        </button>
        <button onClick={() => setActiveTab('settings')} className={`relative flex flex-col items-center gap-1.5 p-2 transition-all duration-300 ${activeTab === 'settings' ? 'text-emerald-400 translate-y-[-4px] drop-shadow-[0_0_15px_rgba(16,185,129,0.8)]' : 'text-gray-500 hover:text-gray-300 hover:-translate-y-1'}`}>
          <div className={`p-2.5 rounded-2xl transition-all duration-300 ${activeTab === 'settings' ? 'bg-emerald-500/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)] border border-emerald-500/20' : 'bg-transparent border border-transparent'}`}><Settings size={22} /></div>
          <span className="text-[10px] font-black tracking-widest uppercase">Settings</span>
        </button>
      </nav>
    </div >
  );
}

const NavItem = ({ icon, active, onClick }) => (
  <div onClick={onClick} className={`nav-item ${active ? 'nav-item-active' : ''}`}>
    {icon}
  </div>
);

export default function Root() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
