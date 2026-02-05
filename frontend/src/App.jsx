import React, { useState, useEffect } from 'react';
import axios from 'axios';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { Package, Smartphone, IndianRupee, Download, RefreshCw, Settings, Search, Mail, UploadCloud, ChevronRight, Box, BarChart2, MessageSquare, Users, History, Plus, Trash2, Save, X, Grid, ExternalLink, Truck, Calendar, CheckSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = '/api';

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

      const res = await axios.get(`${API_URL}/orders?startDate=${startStr}&endDate=${endStr}`);

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

  const executeDownload = async ({ rows, type = 'all' }) => {
    if (!rows || !rows.length) return;
    let target = rows;
    if (type === 'prepaid') target = rows.filter(r => r.payment === 'Prepaid');
    if (type === 'cod') target = rows.filter(r => r.payment === 'Cash on Delivery');

    try {
      const res = await axios.post(`${API_URL}/download`, { rows: target }, { responseType: 'blob' });
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
    } catch (e) { alert('Download failed'); }
  };

  const handleDownloadDashboard = (t) => data?.orders && executeDownload({ rows: data.orders, type: t });
  const handleSendEmail = async () => { if (data?.orders) { setLoading(true); try { await axios.post(`${API_URL}/email-approval`, { rows: data.orders }); alert('Sent'); } catch (e) { } finally { setLoading(false) } } };
  const handleUploadPortal = async () => { if (data?.orders && confirm('Upload?')) { setLoading(true); try { await axios.post(`${API_URL}/upload-portal`, { rows: data.orders }); alert('Done'); } catch (e) { } finally { setLoading(false) } } };

  const saveHistory = async () => {
    if (!editingBatch) return;
    await axios.put(`${API_URL}/history/${editingBatch.id}`, { rows: editingBatch.rows });
    await executeDownload({ rows: editingBatch.rows });
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
    executeDownload({ rows: selectedRows, type: 'selected' });
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
      return !searchTerm || oid.includes(s) || name.includes(s);
    });
  }, [data, searchTerm]);

  return (
    <div className="min-h-screen bg-[#0F0F0F] font-sans text-white flex">
      <nav className="sidebar">
        <div className="mb-8"><img src="/logo.png" className="w-10 h-10 object-contain" /></div>
        <NavItem icon={<Grid size={22} />} active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
        <NavItem icon={<History size={22} />} active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
        <div className="flex-1"></div>
        <NavItem icon={<Settings size={22} />} />
        <div className="mb-4 text-xs text-gray-600">v7.1</div>
      </nav>

      <main className="flex-1 ml-[80px] p-8 max-w-[1920px]">
        <div className="flex justify-between items-center mb-10">
          <div className="flex items-center gap-4 bg-[#1A1A1A] px-4 py-3 rounded-2xl w-[400px] border border-white/5 focus-within:border-white/10 transition-colors">
            <Search size={18} className="text-gray-500" />
            <input
              type="text"
              placeholder="Search orders, customers..."
              className="bg-transparent outline-none text-sm w-full placeholder-gray-600"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-[#1A1A1A] px-4 py-2 rounded-xl border border-white/5 z-50">
              <Calendar size={16} className="text-gray-500" />
              <DatePicker
                selectsRange={true}
                startDate={startDate}
                endDate={endDate}
                onChange={(update) => {
                  setDateRange(update);
                }}
                className="bg-transparent text-sm font-bold text-white outline-none w-48 text-center cursor-pointer"
                placeholderText="Select Date Range"
              />
            </div>
            <button onClick={handleSync} disabled={loading} className="bg-white text-black px-6 py-3 rounded-xl font-bold text-sm hover:bg-gray-200 transition-colors flex items-center gap-2">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> {loading ? 'Syncing...' : 'Sync Data'}
            </button>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div key="dashboard" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                <div className="card-gradient grad-cyan h-40">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-sm text-cyan-200/80 font-medium mb-1">Total Orders</div>
                      <div className="text-4xl font-bold text-white tracking-tight">{data?.stats?.totalOrders || 0}</div>
                    </div>
                    <div className="icon-btn-filled bg-cyan-500/20 text-cyan-400"><Package size={20} /></div>
                  </div>
                  <div className="text-xs text-cyan-200/40">Pending Fulfillment</div>
                </div>

                <div className="card-gradient grad-lime h-40">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-sm text-lime-200/80 font-medium mb-1">Total Items</div>
                      <div className="text-4xl font-bold text-white tracking-tight">{data?.stats?.totalItems || 0}</div>
                    </div>
                    <div className="icon-btn-filled bg-lime-500/20 text-lime-400"><Smartphone size={20} /></div>
                  </div>
                  <div className="text-xs text-lime-200/40">Individual SKUs</div>
                </div>

                <div className="card-gradient grad-purple h-40">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-sm text-purple-200/80 font-medium mb-1">Total COGS</div>
                      <div className="text-4xl font-bold text-white tracking-tight">₹{data?.stats?.subtotal?.toFixed(0) || 0}</div>
                    </div>
                    <div className="icon-btn-filled bg-purple-500/20 text-purple-400"><IndianRupee size={20} /></div>
                  </div>
                  <div className="text-xs text-purple-200/40">Tax 18% GST INCLUDED</div>
                </div>

                <div className="panel-dark h-40 flex flex-col justify-center gap-3">
                  {workflowStatus === 'review' ? (
                    <>
                      <div className="grid grid-cols-3 gap-3">
                        <button onClick={() => handleDownloadDashboard('all')} className="bg-[#1A1A1A] hover:bg-[#252525] p-3 rounded-xl border border-white/5 text-xs font-bold text-white flex items-center justify-center gap-2 transition-colors">All CSV</button>
                        <button onClick={() => handleDownloadDashboard('prepaid')} className="bg-[#1A1A1A] hover:bg-[#252525] p-3 rounded-xl border border-white/5 text-xs font-bold text-green-400 flex items-center justify-center gap-2 transition-colors">Prepaid CSV</button>
                        <button onClick={() => handleDownloadDashboard('cod')} className="bg-[#1A1A1A] hover:bg-[#252525] p-3 rounded-xl border border-white/5 text-xs font-bold text-orange-400 flex items-center justify-center gap-2 transition-colors">COD CSV</button>
                      </div>
                      <div className="flex gap-3">
                        <button onClick={handleSendEmail} className="flex-1 bg-[#1A1A1A] hover:bg-[#252525] p-3 rounded-xl border border-white/5 text-xs font-bold text-blue-400 flex items-center justify-center gap-2 transition-colors"><Mail size={16} /> Email</button>
                        <button onClick={handleUploadPortal} className="flex-1 bg-white text-black p-3 rounded-xl font-bold text-xs hover:bg-gray-200 flex items-center justify-center gap-2 transition-colors"><UploadCloud size={16} /> Upload</button>
                      </div>
                      <button
                        onClick={handleGenerateLabels}
                        disabled={loading}
                        className={`w-full relative btn-shine-effect group overflow-hidden p-4 rounded-xl font-bold text-sm flex items-center justify-center gap-3 transition-all duration-300 shadow-lg ${loading ? 'bg-gray-800 cursor-not-allowed' : 'bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 bg-[length:200%_auto] hover:bg-right hover:scale-[1.02] shadow-indigo-500/25'}`}
                      >
                        {loading ? (
                          <>
                            <RefreshCw size={18} className="animate-spin text-indigo-300" />
                            <span className="text-indigo-200">{typeof loading === 'string' ? loading : 'Processing...'}</span>
                          </>
                        ) : (
                          <>
                            <Truck size={18} className="text-white group-hover:animate-bounce" />
                            <span className="text-white tracking-wide">GENERATE LABELS (INSTANT)</span>
                          </>
                        )}
                      </button>
                    </>
                  ) : (
                    <div className="text-center text-gray-500 text-sm">Sync to enable actions</div>
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

              <div className="panel-dark min-h-[500px]">
                <div className="flex justify-between items-end mb-6 border-b border-white/5 pb-4">
                  <div className="flex items-center gap-4">
                    <h3 className="text-xl font-bold">Review Orders</h3>
                    <div className="text-sm text-gray-500">{filteredOrders.length} records</div>
                  </div>
                  <button onClick={() => {
                    if (!data) setData({ orders: [] });
                    const newRow = { orderId: 'MANUAL', category: '', model: '', customerName: '', cogs: 0, sku: '', payment: 'Prepaid', productId: null, thumbnail: null };
                    const currentOrders = data?.orders || [];
                    setData({ ...data, orders: [newRow, ...currentOrders] });
                  }} className="px-3 py-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg hover:bg-blue-500/20 font-bold text-xs flex items-center gap-2 transition-colors">
                    <Plus size={14} /> Add Order
                  </button>
                </div>

                {!data ? (
                  <div className="flex flex-col items-center justify-center py-32 opacity-20">
                    <Box size={64} />
                    <div className="mt-4 font-medium">No Data Synced</div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr>
                          <th className="table-header w-10 pl-4">
                            <input type="checkbox" onChange={toggleSelectAll} checked={data?.orders?.length > 0 && selectedOrders.size === data.orders.length} className="rounded border-gray-600 bg-transparent" />
                          </th>
                          <th className="table-header pl-2">ID</th>
                          <th className="table-header">Product Info</th>
                          <th className="table-header">Customer</th>
                          <th className="table-header text-right pr-4">Cost (COGS)</th>
                          <th className="table-header w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredOrders.map((row, i) => (
                          <tr key={i} className={`table-row group border-b border-white/[0.02] ${selectedOrders.has(row?.orderId) ? 'bg-white/[0.03]' : ''}`}>
                            <td className="py-4 pl-4 align-top w-10">
                              <input type="checkbox" checked={selectedOrders.has(row?.orderId)} onChange={() => row?.orderId && toggleSelectRow(row.orderId)} className="rounded border-gray-600 bg-transparent" />
                            </td>
                            <td className="py-4 pl-2 align-top w-[140px]">
                              <input
                                className="bg-transparent outline-none font-mono text-sm text-white font-bold mb-1 w-full"
                                value={row?.orderId || ''}
                                onChange={(e) => { const n = [...data.orders]; n[i].orderId = e.target.value; setData({ ...data, orders: n }) }}
                              />
                              <select
                                value={row?.payment || 'Prepaid'}
                                onChange={(e) => { const n = [...data.orders]; n[i].payment = e.target.value; setData({ ...data, orders: n }) }}
                                className={`text-[10px] font-bold px-1 py-0.5 rounded w-fit outline-none border-none cursor-pointer ${row?.payment === 'Prepaid' ? 'bg-green-500/10 text-green-400' : 'bg-orange-500/10 text-orange-400'}`}
                              >
                                <option value="Prepaid" className="bg-black text-white">Prepaid</option>
                                <option value="Cash on Delivery" className="bg-black text-white">COD</option>
                              </select>
                            </td>

                            <td className="py-4 align-top">
                              <div className="flex gap-4">
                                {row?.thumbnail && <img src={row.thumbnail} className="w-12 h-12 rounded-lg object-cover bg-white/5" />}
                                <div>
                                  <div className="font-bold text-white mb-1 flex items-center gap-2">
                                    {row?.category || 'Unknown'}
                                    {row?.previewUrl && <a href={row.previewUrl} target="_blank" className="text-gray-600 hover:text-white"><ExternalLink size={12} /></a>}
                                  </div>
                                  <div className="text-sm text-gray-400 mb-1">{row?.model || 'Unknown Model'}</div>
                                  {row?.sku ? (
                                    <div className="text-[10px] font-mono text-gray-600 bg-white/5 px-1.5 py-0.5 rounded w-fit">{row.sku}</div>
                                  ) : (
                                    <button onClick={() => row?.productId && handleCreateSku(row.productId)} className="text-[10px] text-blue-400 bg-blue-500/10 px-2 py-1 rounded hover:bg-blue-500/20 transition-colors">
                                      Assign SKU
                                    </button>
                                  )}
                                </div>
                              </div>
                            </td>

                            <td className="py-4 align-top">
                              <input
                                value={row?.customerName || ''}
                                onChange={(e) => { const n = [...data.orders]; n[i].customerName = e.target.value; setData({ ...data, orders: n }) }}
                                className="bg-transparent outline-none font-bold text-gray-300 w-full mb-1"
                              />
                              <div className="text-xs text-gray-600">{row?.orderLink ? <a href={row.orderLink || '#'} target="_blank" className="hover:text-blue-400">View in Shopify</a> : 'Manual Entry'}</div>
                            </td>

                            <td className="py-4 pr-4 align-top text-right">
                              <div className="flex items-center justify-end gap-1 text-gray-400">
                                <span className="text-xs">₹</span>
                                <input
                                  type="number"
                                  value={row?.cogs || 0}
                                  onChange={(e) => { const n = [...data.orders]; n[i].cogs = parseFloat(e.target.value); setData({ ...data, orders: n }) }}
                                  className="bg-transparent outline-none w-16 text-right font-mono text-sm text-white"
                                />
                              </div>
                            </td>

                            <td className="py-4 align-top w-10">
                              <button onClick={() => {
                                if (!confirm('Delete this row?')) return;
                                const n = [...data.orders];
                                n.splice(i, 1);
                                setData({ ...data, orders: n });
                              }} className="p-2 hover:bg-red-500/10 text-gray-600 hover:text-red-400 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
        </AnimatePresence>
      </main>

      <AnimatePresence>
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
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-[#1A1A1A] w-full max-w-md rounded-3xl border border-white/10 p-8 flex flex-col items-center text-center shadow-2xl">
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 mb-6">
                <IndianRupee size={32} />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Insufficient Funds</h3>
              <p className="text-gray-400 text-sm mb-6">
                Your Shiprocket wallet balance is low.
                <br />We estimate you need <b>₹{walletPopup.estimatedCost}</b> to process these orders.
              </p>

              <div className="bg-black/40 rounded-xl p-4 w-full mb-6 border border-white/5">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-500">Current Balance</span>
                  <span className="text-white font-mono">₹{walletPopup.currentBalance}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Required (Est.)</span>
                  <span className="text-red-400 font-mono">₹{walletPopup.estimatedCost}</span>
                </div>
              </div>

              <div className="flex gap-3 w-full">
                <button onClick={() => setWalletPopup(null)} className="flex-1 bg-white text-black py-3 rounded-xl font-bold hover:bg-gray-200 transition-colors">I've Added Funds</button>
              </div>
              <div className="mt-4 text-xs text-gray-600">
                Add funds in Shiprocket panel and try again.
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
            className={`fixed bottom-8 right-8 z-[300] px-6 py-4 rounded-xl shadow-2xl border flex items-center gap-3 backdrop-blur-md ${toast.type === 'error' ? 'bg-red-500/10 border-red-500/50 text-red-200' : 'bg-green-500/10 border-green-500/50 text-green-200'}`}
          >
            {toast.type === 'error' ? <X size={20} className="text-red-500" /> : <CheckSquare size={20} className="text-green-500" />}
            <span className="font-bold">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
