import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Package, Smartphone, IndianRupee, Download, RefreshCw, Settings, CheckCircle, AlertCircle, ShoppingBag, Mail, UploadCloud, Calendar, ChevronDown, History, Edit, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';

const API_URL = 'http://localhost:3001/api';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'history'
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState({ connected: false });
  const [showSettings, setShowSettings] = useState(false);
  const [workflowStatus, setWorkflowStatus] = useState('idle'); // idle, processing, review, approved

  // Filters
  const [lookback, setLookback] = useState(3);

  useEffect(() => {
    checkStatus();
  }, []);

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab]);

  const checkStatus = async () => {
    try {
      const res = await axios.get(`${API_URL}/v2/status`);
      setStatus(res.data);
      if (res.data.lookback) setLookback(res.data.lookback);
    } catch (err) {
      console.error('API Error:', err);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await axios.get(`${API_URL}/history`);
      setHistoryData(res.data);
    } catch (err) {
      console.error('History Fetch Error:', err);
    }
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

  const handleEditBatch = (batch) => {
    // Load batch into main editor
    setData({
      orders: batch.rows,
      stats: {
        totalOrders: new Set(batch.rows.map(r => r.orderId)).size,
        totalItems: batch.rows.length,
        // Recalculate basic totals roughly or rely on backend to be robust if we synced
        subtotal: batch.rows.reduce((sum, r) => sum + (r.cogs || 0), 0),
        total: (batch.rows.reduce((sum, r) => sum + (r.cogs || 0), 0)) * 1.18
      }
    });
    setWorkflowStatus('review');
    setActiveTab('dashboard'); // Switch back to editor
  };

  const handleDownload = async (type = 'all') => {
    if (!data?.orders) return;

    let rowsToDownload = data.orders;
    let orderType = 'MIXED';

    if (type === 'prepaid') {
      rowsToDownload = data.orders.filter(r => r.payment === 'Prepaid');
      orderType = 'PREPAID';
    } else if (type === 'cod') {
      rowsToDownload = data.orders.filter(r => r.payment === 'Cash on Delivery');
      orderType = 'COD';
    }

    if (rowsToDownload.length === 0) {
      alert(`No ${orderType} orders found to download.`);
      return;
    }

    try {
      const res = await axios.post(`${API_URL}/download`, { rows: rowsToDownload }, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));

      const date = new Date().toISOString().split('T')[0];
      const batchId = Math.floor(100 + Math.random() * 900);
      const filename = `${date}_NLG_POD_${orderType}_BATCH-${batchId}.xlsx`;

      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      setTimeout(() => document.body.removeChild(link), 100);
    } catch (err) {
      setError('Download unable to start');
    }
  };

  // ... (Other handlers like email/upload kept same logic but omitted for brevity if not changed, but I will include them to match full file replacement which is safer)

  const handleSendEmail = async () => {
    if (!data?.orders) return;
    setLoading(true);
    try {
      await axios.post(`${API_URL}/email-approval`, { rows: data.orders });
      alert('Email sent info updated');
    } catch (err) {
      setError('Failed to send email: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadPortal = async () => {
    if (!data?.orders) return;
    if (!window.confirm("Upload to Portal?")) return;
    setLoading(true);
    try {
      await axios.post(`${API_URL}/upload-portal`, { rows: data.orders });
      alert('Uploaded!');
      setWorkflowStatus('approved');
    } catch (err) {
      setError('Upload Failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-dark-950 text-white font-sans p-8 selection:bg-accent-purple/30">

      {/* HEADER */}
      <header className="max-w-[1600px] mx-auto flex flex-col items-center justify-center py-8 mb-4">
        <div className="relative group">
          <img src="/logo.png" alt="Logo" className="h-40 object-contain filter drop-shadow-[0_0_20px_rgba(255,255,255,0.05)]" />
        </div>

        {/* TABS */}
        <div className="mt-8 flex gap-2 bg-[#1E1E1E] p-1 rounded-full border border-white/10">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-6 py-2 rounded-full font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'dashboard' ? 'bg-white text-black shadow-lg' : 'text-gray-400 hover:text-white'}`}
          >
            <Package size={16} />
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-6 py-2 rounded-full font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'history' ? 'bg-white text-black shadow-lg' : 'text-gray-400 hover:text-white'}`}
          >
            <History size={16} />
            Order History
          </button>
        </div>
      </header>

      {/* DASHBOARD VIEW */}
      {activeTab === 'dashboard' && (
        <main className="max-w-[1600px] mx-auto space-y-8 animate-fade-in">
          {/* WORKFLOW BAR */}
          <div className="glass-card flex justify-between items-center bg-[#1E1E1E]">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3 bg-black/40 px-5 py-3 rounded-2xl border border-white/5">
                <span className="text-sm text-gray-400 font-medium">Synced Range</span>
                <div className="h-4 w-[1px] bg-white/10"></div>
                <input
                  type="number"
                  value={lookback}
                  onChange={(e) => setLookback(e.target.value)}
                  className="w-8 bg-transparent text-center font-bold outline-none text-white"
                />
                <span className="text-sm text-gray-500">Days</span>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">
                  {workflowStatus === 'idle' ? 'Dashboard' :
                    workflowStatus === 'review' ? 'Review Orders' : 'Processing...'}
                </h2>
                <p className="text-sm text-gray-500">Manage and fulfill your pending orders</p>
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={handleSync}
                disabled={loading}
                className="px-8 py-4 bg-white text-black rounded-full font-bold hover:bg-gray-200 disabled:opacity-50 transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.1)]"
              >
                <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                {loading ? 'Syncing...' : 'Sync Orders'}
              </button>

              {workflowStatus === 'review' && (
                <>
                  {/* ACTIONS */}
                  <button onClick={handleSendEmail} disabled={loading} className="px-6 py-4 bg-accent-blue/10 text-accent-blue border border-accent-blue/20 rounded-full font-bold hover:bg-accent-blue/20 transition-all flex items-center gap-2"><Mail size={20} />Email</button>
                  <button onClick={handleUploadPortal} disabled={loading} className="px-8 py-4 bg-accent-purple text-black rounded-full font-bold hover:shadow-lg transition-all flex items-center gap-2"><UploadCloud size={20} />Upload</button>
                  <div className="w-[1px] h-12 bg-white/10 mx-2"></div>

                  {/* DOWNLOAD BUTTONS */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDownload('prepaid')}
                      className="px-4 py-4 bg-accent-green/10 text-accent-green border border-accent-green/20 rounded-full font-bold hover:bg-accent-green/20 transition-all flex items-center gap-2"
                      title="Download Prepaid Orders CSV"
                    >
                      <Download size={18} />
                      <span className="hidden xl:inline">Prepaid</span>
                    </button>

                    <button
                      onClick={() => handleDownload('cod')}
                      className="px-4 py-4 bg-accent-peach/10 text-accent-peach border border-accent-peach/20 rounded-full font-bold hover:bg-accent-peach/20 transition-all flex items-center gap-2"
                      title="Download COD Orders CSV"
                    >
                      <Download size={18} />
                      <span className="hidden xl:inline">COD</span>
                    </button>

                    <button
                      onClick={() => handleDownload('all')}
                      className="p-4 bg-dark-800 rounded-full text-gray-400 hover:text-white hover:bg-dark-700 transition-all"
                      title="Download All Orders"
                    >
                      <Download size={20} />
                    </button>
                  </div>
                </>
              )}

              <button onClick={() => setShowSettings(!showSettings)} className="p-4 bg-dark-800 rounded-full text-gray-400 hover:text-white hover:bg-dark-700 transition-all">
                <Settings size={20} />
              </button>
            </div>
          </div>

          {/* EDITOR / DATA TABLE */}
          <div className="glass-card min-h-[500px] flex flex-col p-0 overflow-hidden">
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
              <h3 className="font-bold text-xl flex items-center gap-3">
                <div className="w-2 h-8 rounded-full bg-accent-pink"></div>
                Order Details
              </h3>
              <span className="px-3 py-1 bg-white/5 rounded-full text-xs text-gray-400 font-mono">
                READ-WRITE
              </span>
            </div>

            {!data ? (
              <div className="h-full flex flex-col items-center justify-center p-20 text-dark-700">
                <Package size={64} className="mb-6 opacity-20" />
                <p className="text-xl font-medium">Sync orders to view data</p>
              </div>
            ) : (
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-[#151515] text-gray-500 text-xs font-bold uppercase tracking-widest sticky top-0 z-10">
                    <tr>
                      <th className="px-8 py-6">Order ID</th>
                      <th className="px-8 py-6">Customer</th>
                      <th className="px-8 py-6">Category</th>
                      <th className="px-8 py-6">Model / Item</th>
                      <th className="px-8 py-6 text-right">COGS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-sm">
                    {data.orders.map((row, i) => (
                      <tr key={i} className="hover:bg-white/5 transition-colors group">
                        <td className="px-8 py-5"><span className="font-mono text-accent-purple bg-accent-purple/10 px-2 py-1 rounded">#{row.orderId}</span></td>
                        <td className="px-8 py-5 text-gray-300 font-medium">{row.customerName}</td>
                        <td className="px-8 py-5">
                          <input type="text" value={row.category} onChange={(e) => {
                            const newOrders = [...data.orders];
                            newOrders[i].category = e.target.value;
                            setData({ ...data, orders: newOrders });
                          }} className="bg-transparent border-b border-transparent focus:border-accent-pink outline-none text-gray-300 w-full transition-colors pb-1" />
                        </td>
                        <td className="px-8 py-5">
                          <input type="text" value={row.model} onChange={(e) => {
                            const newOrders = [...data.orders];
                            newOrders[i].model = e.target.value;
                            setData({ ...data, orders: newOrders });
                          }} className="bg-transparent border-b border-transparent focus:border-accent-blue outline-none text-white font-medium w-full transition-colors pb-1" />
                        </td>
                        <td className="px-8 py-5 text-right font-mono text-gray-400">₹{row.cogs}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      )}

      {/* HISTORY VIEW */}
      {activeTab === 'history' && (
        <main className="max-w-[1600px] mx-auto space-y-8 animate-fade-in">
          <div className="glass-card flex flex-col p-8 bg-[#1E1E1E]">
            <h2 className="text-3xl font-bold mb-8">Creation History</h2>

            {historyData.length === 0 ? (
              <div className="text-center py-20 text-gray-600">No history available yet.</div>
            ) : (
              <div className="space-y-4">
                {historyData.map((batch) => (
                  <div key={batch.id} className="p-6 bg-white/5 rounded-2xl flex items-center justify-between hover:bg-white/10 transition-all border border-white/5">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${batch.type === 'DOWNLOAD' ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-blue/20 text-accent-blue'}`}>{batch.type}</span>
                        <span className="text-gray-400 text-sm font-mono">{new Date(batch.timestamp).toLocaleString()}</span>
                      </div>
                      <div className="text-xl font-bold">{batch.count} Orders</div>
                      <div className="text-sm text-gray-500">ID: {batch.id}</div>
                    </div>
                    <div className="flex gap-4">
                      <button
                        onClick={() => handleEditBatch(batch)}
                        className="px-6 py-3 bg-white text-black font-bold rounded-full hover:bg-gray-200 transition-all flex items-center gap-2"
                      >
                        <Edit size={16} />
                        Edit & Download
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      )}

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#1E1E1E] border border-white/10 rounded-[32px] p-8 max-w-md w-full shadow-2xl">
            <h2 className="text-2xl font-bold mb-8 text-white">Settings</h2>
            <div className="space-y-4">
              <div className="bg-black/20 p-4 rounded-2xl flex items-center justify-between border border-white/5">
                <div><div className="font-bold text-white">Auto-Automation</div><div className="text-xs text-gray-500">Run without manual approval</div></div>
                <div className={`w-3 h-3 rounded-full ${data?.settings?.automationEnabled ? 'bg-accent-pink shadow-[0_0_10px_#F4B8E4]' : 'bg-dark-700'}`}></div>
              </div>
              <div className="bg-black/20 p-4 rounded-2xl border border-white/5">
                <div className="text-xs text-gray-500 mb-1">Current Schedule</div>
                <div className="font-mono text-accent-blue">Every 3 Days @ 9:00 AM</div>
              </div>
            </div>
            <div className="mt-8 flex justify-end">
              <button onClick={() => setShowSettings(false)} className="px-6 py-3 bg-white text-black font-bold rounded-full hover:bg-gray-200 transition-colors">Done</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

const StatCard = ({ icon, label, value, subtext, color, bg }) => (
  <motion.div whileHover={{ y: -5 }} className="glass-card flex flex-col justify-between h-48 relative overflow-hidden group">
    <div className={`absolute -right-4 -top-4 w-24 h-24 rounded-full ${bg} blur-2xl opacity-50`}></div>
    <div className="flex justify-between items-start">
      <div className={`p-3 rounded-2xl ${bg} ${color}`}>{React.cloneElement(icon, { size: 24 })}</div>
      <div className="text-right"><div className={`text-4xl font-bold text-white mb-1`}>{value}</div></div>
    </div>
    <div><div className="text-lg font-bold text-white">{label}</div><div className={`text-sm font-medium opacity-60 ${color}`}>{subtext}</div></div>
  </motion.div>
);

const StatusBadge = ({ label, active }) => (
  <div className={`px-5 py-2 rounded-full border text-xs font-bold tracking-widest uppercase transition-all flex items-center gap-2 ${active ? 'border-white/40 text-white' : 'border-white/5 text-gray-600'}`}>
    <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-accent-pink shadow-[0_0_8px_#F4B8E4]' : 'bg-gray-700'}`} />
    {label}
  </div>
);

export default App;
