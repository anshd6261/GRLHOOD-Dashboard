import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Package, Smartphone, IndianRupee, Download, RefreshCw, Settings, CheckCircle, AlertCircle, ShoppingBag, Mail, UploadCloud, Calendar, ChevronDown, History, Edit, ArrowLeft, Search, X, Plus, Trash2, Save, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = 'http://localhost:3001/api';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState({ connected: false });
  const [showSettings, setShowSettings] = useState(false);
  const [workflowStatus, setWorkflowStatus] = useState('idle');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingBatch, setEditingBatch] = useState(null);
  const [lookback, setLookback] = useState(3);

  useEffect(() => { checkStatus(); }, []);
  useEffect(() => { if (activeTab === 'history') fetchHistory(); }, [activeTab]);

  const checkStatus = async () => {
    try {
      const res = await axios.get(`${API_URL}/v2/status`);
      setStatus(res.data);
      if (res.data.lookback) setLookback(res.data.lookback);
    } catch (err) { console.error(err); }
  };

  const fetchHistory = async () => {
    try {
      const res = await axios.get(`${API_URL}/history`);
      setHistoryData(res.data);
    } catch (err) { console.error(err); }
  };

  const handleSync = async () => {
    setLoading(true);
    setError(null);
    setWorkflowStatus('processing');
    try {
      const res = await axios.get(`${API_URL}/orders?days=${lookback}`);
      setData(res.data);
      setWorkflowStatus('review');
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setWorkflowStatus('idle');
    } finally {
      setLoading(false);
    }
  };

  const executeDownload = async ({ rows, type = 'all', saveHistory = true }) => {
    if (!rows || rows.length === 0) return alert('No orders to download.');
    let rowsToDownload = rows;
    let orderType = 'MIXED';
    if (type === 'prepaid') { rowsToDownload = rows.filter(r => r.payment === 'Prepaid'); orderType = 'PREPAID'; }
    else if (type === 'cod') { rowsToDownload = rows.filter(r => r.payment === 'Cash on Delivery'); orderType = 'COD'; }
    if (rowsToDownload.length === 0) return alert(`No ${orderType} orders found.`);

    try {
      const res = await axios.post(`${API_URL}/download`, { rows: rowsToDownload }, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const date = new Date().toISOString().split('T')[0];
      const batchId = Math.floor(100 + Math.random() * 900);
      const filename = `${date}_NLG_POD_${orderType}_BATCH-${batchId}.csv`;
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      setTimeout(() => document.body.removeChild(link), 100);
    } catch (err) { setError('Download unable to start'); }
  };

  const handleDownloadDashboard = (type) => { if (data?.orders) executeDownload({ rows: data.orders, type }); };
  const handleSendEmail = async () => { if (data?.orders) { setLoading(true); try { await axios.post(`${API_URL}/email-approval`, { rows: data.orders }); alert('Email Sent'); } catch (e) { setError(e.message); } finally { setLoading(false); } } };
  const handleUploadPortal = async () => { if (data?.orders && window.confirm("Upload?")) { setLoading(true); try { await axios.post(`${API_URL}/upload-portal`, { rows: data.orders }); alert('Uploaded'); setWorkflowStatus('approved'); } catch (e) { setError(e.message); } finally { setLoading(false); } } };

  // History Actions
  const openHistoryEditor = (batch) => setEditingBatch(JSON.parse(JSON.stringify(batch)));
  const closeHistoryEditor = () => { if (window.confirm("Close without saving?")) setEditingBatch(null); };
  const saveAndDownloadHistory = async () => {
    if (!editingBatch) return;
    try {
      setLoading(true);
      await axios.put(`${API_URL}/history/${editingBatch.id}`, { rows: editingBatch.rows });
      await executeDownload({ rows: editingBatch.rows, type: 'all' });
      await fetchHistory();
      setEditingBatch(null);
    } catch (err) { alert(err.message); } finally { setLoading(false); }
  };
  const removeHistoryRow = (i) => { const n = [...editingBatch.rows]; n.splice(i, 1); setEditingBatch({ ...editingBatch, rows: n }); };
  const addHistoryRow = () => { setEditingBatch({ ...editingBatch, rows: [{ orderId: 'NEW', customerName: '', category: '', model: '', sku: '', payment: 'Prepaid', cogs: 0 }, ...editingBatch.rows] }); };

  const getFilteredOrders = () => {
    if (!data?.orders) return [];
    if (!searchTerm) return data.orders;
    const lower = searchTerm.toLowerCase();
    return data.orders.filter(r => r.orderId.toString().includes(lower) || r.customerName.toLowerCase().includes(lower));
  };

  return (
    <div className="min-h-screen bg-dark-950 text-white font-sans p-6 overflow-x-hidden selection:bg-accent-purple/30">

      {/* HEADER SECTION */}
      <header className="flex flex-col items-center justify-center py-10 relative z-10">
        <div className="relative group mb-8">
          <div className="absolute inset-0 bg-white/10 blur-3xl rounded-full opacity-20 group-hover:opacity-40 transition-opacity duration-700"></div>
          <img src="/logo.png" alt="Logo" className="h-28 relative z-10 drop-shadow-2xl" />
        </div>

        {/* PILL NAVIGATION */}
        <div className="pill-nav shadow-2xl shadow-black/50">
          <button onClick={() => setActiveTab('dashboard')} className={`pill-tab ${activeTab === 'dashboard' ? 'pill-tab-active' : 'pill-tab-inactive'}`}>
            <Package size={16} /> Dashboard
          </button>
          <div className="w-[1px] h-4 bg-white/10 my-auto"></div>
          <button onClick={() => setActiveTab('history')} className={`pill-tab ${activeTab === 'history' ? 'pill-tab-active' : 'pill-tab-inactive'}`}>
            <History size={16} /> Order History
          </button>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {/* DASHBOARD TAB */}
        {activeTab === 'dashboard' && (
          <motion.main key="dashboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="max-w-[1400px] mx-auto space-y-8 pb-32">

            {/* STATS ROW */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard icon={<ShoppingBag />} label="Total Orders" value={data?.stats?.totalOrders} sub="Pending Fulfillment" color="text-accent-pink" />
              <StatCard icon={<Smartphone />} label="Total Items" value={data?.stats?.totalItems} sub="Individual SKUs" color="text-accent-blue" />
              <StatCard icon={<IndianRupee />} label="Revenue (COGS)" value={data?.stats?.subtotal} sub="Cost of Goods" color="text-accent-peach" isCurrency />
              <StatCard icon={<IndianRupee />} label="Grand Total" value={data?.stats?.total} sub="Incl. GST (18%)" color="text-accent-purple" isCurrency />
            </div>

            {/* ACTION BAR (CONTROL CENTER) */}
            <div className="action-bar sticky top-4 z-40">
              {/* Left: Input */}
              <div className="flex items-center gap-4 border-r border-white/10 pr-6">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Synced Range</span>
                  <div className="flex items-center gap-2">
                    <input type="number" value={lookback} onChange={(e) => setLookback(e.target.value)} className="w-12 bg-transparent text-xl font-bold outline-none text-white placeholder-gray-700" />
                    <span className="text-xs text-gray-500 font-medium">DAYS</span>
                  </div>
                </div>
              </div>

              {/* Middle: Search */}
              <div className="flex-1 px-4 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" size={18} />
                <input
                  type="text"
                  placeholder="Search Order ID or Customer..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-dark-900/50 border border-white/5 rounded-xl py-3 pl-12 pr-4 text-sm focus:bg-dark-900 focus:border-white/10 outline-none transition-all placeholder:text-gray-700"
                />
              </div>

              {/* Right: Actions */}
              <div className="flex items-center gap-3 pl-6 border-l border-white/10">
                {/* Main Sync Button */}
                <button onClick={handleSync} disabled={loading} className="h-10 px-6 bg-white text-black rounded-lg font-bold text-sm hover:bg-gray-200 transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(255,255,255,0.1)]">
                  <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> {loading ? 'Syncing' : 'Sync Orders'}
                </button>

                {/* Workflow Actions */}
                {workflowStatus === 'review' && (
                  <>
                    <div className="flex bg-dark-900 rounded-lg p-1 border border-white/5">
                      <ActionBtn onClick={() => handleDownloadDashboard('prepaid')} icon={<Download size={16} />} label="Prepaid" color="text-accent-green" />
                      <div className="w-[1px] bg-white/5 my-1"></div>
                      <ActionBtn onClick={() => handleDownloadDashboard('cod')} icon={<Download size={16} />} label="COD" color="text-accent-peach" />
                      <div className="w-[1px] bg-white/5 my-1"></div>
                      <ActionBtn onClick={() => handleDownloadDashboard('all')} icon={<Download size={16} />} />
                    </div>

                    <div className="flex gap-2">
                      <button onClick={handleSendEmail} className="h-10 w-10 flex items-center justify-center rounded-lg border border-white/10 hover:bg-white/5 text-accent-blue transition-all"><Mail size={18} /></button>
                      <button onClick={handleUploadPortal} className="h-10 px-4 flex items-center gap-2 rounded-lg bg-accent-purple/10 text-accent-purple border border-accent-purple/20 hover:bg-accent-purple/20 transition-all font-bold text-sm"><UploadCloud size={18} /> Upload</button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* TABLE SECTION */}
            <div className="card-surface overflow-hidden min-h-[500px] flex flex-col">
              {!data ? (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-600">
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4"><Package size={32} className="opacity-50" /></div>
                  <p className="text-lg">Ready to Sync</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-[#151515] border-b border-white/5 text-gray-500 text-[11px] font-bold uppercase tracking-[0.15em]">
                      <tr>
                        <th className="px-8 py-5">Order ID</th>
                        <th className="px-8 py-5">Customer</th>
                        <th className="px-8 py-5">Category</th>
                        <th className="px-8 py-5">Model / Item</th>
                        <th className="px-8 py-5 text-right">COGS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.03] text-sm">
                      {getFilteredOrders().map((row, i) => (
                        <tr key={i} className="hover:bg-white/[0.02] transition-colors group">
                          <td className="px-8 py-4"><span className="font-mono text-xs text-accent-purple bg-accent-purple/10 px-2 py-1 rounded border border-accent-purple/10">#{row.orderId}</span></td>
                          <td className="px-8 py-4 font-medium text-gray-300">{row.customerName}</td>
                          <td className="px-8 py-4"><input className="bg-transparent border-b border-transparent focus:border-accent-pink/50 outline-none w-full py-1 text-gray-400 focus:text-white transition-colors" value={row.category} onChange={(e) => { const n = [...data.orders]; n[i].category = e.target.value; setData({ ...data, orders: n }) }} /></td>
                          <td className="px-8 py-4"><input className="bg-transparent border-b border-transparent focus:border-accent-blue/50 outline-none w-full py-1 text-gray-400 focus:text-white transition-colors" value={row.model} onChange={(e) => { const n = [...data.orders]; n[i].model = e.target.value; setData({ ...data, orders: n }) }} /></td>
                          <td className="px-8 py-4 text-right font-mono text-gray-500">₹{row.cogs}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </motion.main>
        )}

        {/* HISTORY TAB */}
        {activeTab === 'history' && (
          <motion.main key="history" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="max-w-[1400px] mx-auto pb-32">
            <div className="card-surface p-8">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-3"><History className="text-gray-500" /> Creation History</h2>
              {historyData.length === 0 ? <div className="text-center py-20 text-gray-700">No history found</div> : (
                <div className="grid gap-4">
                  {historyData.map(batch => (
                    <div key={batch.id} className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-between hover:bg-white/[0.04] transition-colors group">
                      <div className="flex items-center gap-6">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${batch.type === 'DOWNLOAD' ? 'bg-accent-green/10 text-accent-green' : 'bg-accent-blue/10 text-accent-blue'}`}>
                          {batch.type === 'DOWNLOAD' ? <Download size={20} /> : <Mail size={20} />}
                        </div>
                        <div>
                          <div className="font-bold text-lg mb-1">{batch.count} Orders</div>
                          <div className="flex items-center gap-3 text-xs text-gray-500 font-mono uppercase tracking-wide">
                            <span>{new Date(batch.timestamp).toLocaleString()}</span>
                            <span className="w-1 h-1 rounded-full bg-gray-700"></span>
                            <span>ID: {batch.id}</span>
                          </div>
                        </div>
                      </div>
                      <button onClick={() => openHistoryEditor(batch)} className="px-5 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm font-bold border border-white/5 transition-all">Edit Batch</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.main>
        )}
      </AnimatePresence>

      {/* EDIT MODAL */}
      <AnimatePresence>
        {editingBatch && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/90 backdrop-blur-md z-[100] flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-[#0A0A0A] border border-white/10 w-full max-w-7xl h-[85vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden">
              {/* Modal Header */}
              <div className="px-8 py-6 border-b border-white/5 flex justify-between items-center bg-[#111111]">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-3">
                    <span className="text-accent-pink">Editing Batch</span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-white/5 text-gray-400 font-mono tracking-widest">{editingBatch.id}</span>
                  </h2>
                </div>
                <div className="flex gap-3">
                  <button onClick={addHistoryRow} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"><Plus size={16} /> Row</button>
                  <div className="w-[1px] h-8 bg-white/10 mx-2"></div>
                  <button onClick={closeHistoryEditor} className="px-6 py-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white text-sm font-medium transition-colors">Cancel</button>
                  <button onClick={saveAndDownloadHistory} className="px-6 py-2 bg-white text-black hover:bg-gray-200 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"><Save size={16} /> Save & Download</button>
                </div>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-auto bg-[#050505]">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-[#0A0A0A] text-gray-600 text-[10px] font-bold uppercase tracking-widest sticky top-0 z-10 shadow-lg">
                    <tr>
                      <th className="px-6 py-4 w-16"></th>
                      <th className="px-6 py-4">Order ID</th>
                      <th className="px-6 py-4">Category</th>
                      <th className="px-6 py-4">Model</th>
                      <th className="px-6 py-4">Customer</th>
                      <th className="px-6 py-4 text-right">COGS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.02]">
                    {editingBatch.rows.map((row, i) => (
                      <tr key={i} className="group hover:bg-white/[0.02]">
                        <td className="px-6 py-2 text-center"><button onClick={() => removeHistoryRow(i)} className="text-red-900 group-hover:text-red-500 transition-colors"><Trash2 size={14} /></button></td>
                        <td className="px-6 py-2"><input value={row.orderId} onChange={(e) => { const n = [...editingBatch.rows]; n[i].orderId = e.target.value; setEditingBatch({ ...editingBatch, rows: n }) }} className="bg-transparent text-accent-purple font-mono w-full outline-none py-1 border-b border-transparent focus:border-accent-purple/50" /></td>
                        <td className="px-6 py-2"><input value={row.category} onChange={(e) => { const n = [...editingBatch.rows]; n[i].category = e.target.value; setEditingBatch({ ...editingBatch, rows: n }) }} className="bg-transparent text-gray-400 w-full outline-none py-1 border-b border-transparent focus:border-accent-pink/50 focus:text-white" /></td>
                        <td className="px-6 py-2"><input value={row.model} onChange={(e) => { const n = [...editingBatch.rows]; n[i].model = e.target.value; setEditingBatch({ ...editingBatch, rows: n }) }} className="bg-transparent text-gray-400 w-full outline-none py-1 border-b border-transparent focus:border-accent-blue/50 focus:text-white" /></td>
                        <td className="px-6 py-2"><input value={row.customerName} onChange={(e) => { const n = [...editingBatch.rows]; n[i].customerName = e.target.value; setEditingBatch({ ...editingBatch, rows: n }) }} className="bg-transparent text-gray-500 w-full outline-none py-1 border-b border-transparent focus:border-white/20 focus:text-white" /></td>
                        <td className="px-6 py-2 text-right"><input type="number" value={row.cogs} onChange={(e) => { const n = [...editingBatch.rows]; n[i].cogs = e.target.value; setEditingBatch({ ...editingBatch, rows: n }) }} className="bg-transparent text-gray-500 w-24 text-right outline-none py-1 border-b border-transparent focus:border-white/20 focus:text-white font-mono" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Components
const StatCard = ({ icon, label, value, sub, color, isCurrency }) => (
  <div className="card-surface p-6 flex flex-col justify-between h-40 relative group overflow-hidden">
    <div className={`absolute -right-6 -top-6 w-32 h-32 rounded-full ${color.replace('text-', 'bg-')}/10 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>
    <div className="flex justify-between items-start z-10">
      <div className={`p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] ${color}`}>{React.cloneElement(icon, { size: 20 })}</div>
      <div className="text-right">
        <div className="text-3xl font-bold text-white tracking-tight">{value !== undefined ? (isCurrency ? `₹${Number(value).toFixed(0)}` : value) : '-'}</div>
      </div>
    </div>
    <div className="z-10 mt-4">
      <div className="font-bold text-white text-sm">{label}</div>
      <div className={`text-xs font-medium opacity-60 mt-1 ${color}`}>{sub}</div>
    </div>
  </div>
);

const ActionBtn = ({ onClick, icon, label, color = "text-white" }) => (
  <button onClick={onClick} className={`px-3 py-2 rounded-md hover:bg-white/10 transition-all flex items-center gap-2 text-xs font-bold ${color}`}>
    {icon} {label && <span>{label}</span>}
  </button>
);

export default App;
