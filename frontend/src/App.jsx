import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Package, Smartphone, IndianRupee, Download, RefreshCw, Settings, Search, Mail, UploadCloud, ChevronRight, Box, BarChart2, MessageSquare, Users, History, Plus, Trash2, Save, X, Grid, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = 'http://localhost:3001/api';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingBatch, setEditingBatch] = useState(null);
  const [lookback, setLookback] = useState(3);
  const [workflowStatus, setWorkflowStatus] = useState('idle');

  useEffect(() => { if (activeTab === 'history') fetchHistory(); }, [activeTab]);

  const fetchHistory = async () => {
    try { const res = await axios.get(`${API_URL}/history`); setHistoryData(res.data); } catch (e) { }
  };

  const handleSync = async () => {
    setLoading(true); setWorkflowStatus('processing');
    try { const res = await axios.get(`${API_URL}/orders?days=${lookback}`); setData(res.data); setWorkflowStatus('review'); }
    catch (e) { setError(e.message); setWorkflowStatus('idle'); }
    finally { setLoading(false); }
  };

  const executeDownload = async ({ rows, type = 'all' }) => {
    // ... (logic remains same, abbreviated for style focus)
    // Assuming CSV download logic from V4
    if (!rows || !rows.length) return;
    let target = rows;
    if (type === 'prepaid') target = rows.filter(r => r.payment === 'Prepaid');
    if (type === 'cod') target = rows.filter(r => r.payment === 'Cash on Delivery');

    try {
      const res = await axios.post(`${API_URL}/download`, { rows: target }, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `Orders_${type}_${Date.now()}.csv`;
      a.click();
    } catch (e) { alert('Download failed'); }
  };

  // Re-use Logic
  const handleDownloadDashboard = (t) => data?.orders && executeDownload({ rows: data.orders, type: t });
  const handleSendEmail = async () => { if (data?.orders) { setLoading(true); try { await axios.post(`${API_URL}/email-approval`, { rows: data.orders }); alert('Sent'); } catch (e) { } finally { setLoading(false) } } };
  const handleUploadPortal = async () => { if (data?.orders && confirm('Upload?')) { setLoading(true); try { await axios.post(`${API_URL}/upload-portal`, { rows: data.orders }); alert('Done'); } catch (e) { } finally { setLoading(false) } } };

  // History
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
        handleSync(); // Refresh to see changes
      }
    } catch (e) { alert('Failed: ' + (e.response?.data?.error || e.message)); }
    finally { setLoading(false); }
  };

  // Re-use Logic
  const filteredOrders = data?.orders?.filter(r => !searchTerm || r.orderId.toString().includes(searchTerm) || r.customerName.toLowerCase().includes(searchTerm.toLowerCase())) || [];

  return (
    <div className="min-h-screen bg-[#0F0F0F] font-sans text-white flex">

      {/* SIDEBAR */}
      <nav className="sidebar">
        <div className="mb-8"><img src="/logo.png" className="w-10 h-10 object-contain" /></div>
        <NavItem icon={<Grid size={22} />} active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
        <NavItem icon={<History size={22} />} active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
        <div className="flex-1"></div>
        <NavItem icon={<Settings size={22} />} />
        <div className="mb-4 text-xs text-gray-600">v4.1</div>
      </nav>

      {/* MAIN CONTENT Area */}
      <main className="flex-1 ml-[80px] p-8 max-w-[1920px]">

        {/* TOP BAR */}
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
            <div className="flex items-center gap-2 bg-[#1A1A1A] px-4 py-2 rounded-xl border border-white/5">
              <span className="text-xs text-gray-500 font-bold uppercase">Sync Days</span>
              <input type="number" value={lookback} onChange={e => setLookback(e.target.value)} className="w-8 bg-transparent text-center font-bold text-white outline-none" />
            </div>
            <button onClick={handleSync} disabled={loading} className="bg-white text-black px-6 py-3 rounded-xl font-bold text-sm hover:bg-gray-200 transition-colors flex items-center gap-2">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> {loading ? 'Syncing...' : 'Sync Data'}
            </button>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div key="dashboard" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">

              {/* STATS CARDS GRID */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                {/* Cyan Card - Orders */}
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

                {/* Lime Card - Items */}
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

                {/* Purple Card - Revenue */}
                <div className="card-gradient grad-purple h-40">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-sm text-purple-200/80 font-medium mb-1">Revenue</div>
                      <div className="text-4xl font-bold text-white tracking-tight">₹{data?.stats?.subtotal?.toFixed(0) || 0}</div>
                    </div>
                    <div className="icon-btn-filled bg-purple-500/20 text-purple-400"><IndianRupee size={20} /></div>
                  </div>
                  <div className="text-xs text-purple-200/40">Subtotal COGS</div>
                </div>

                {/* Action Panel */}
                <div className="panel-dark h-40 flex flex-col justify-center gap-3">
                  {workflowStatus === 'review' ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => handleDownloadDashboard('prepaid')} className="bg-[#1A1A1A] hover:bg-[#252525] p-3 rounded-xl border border-white/5 text-xs font-bold text-green-400 flex items-center justify-center gap-2 transition-colors">Prepaid CSV</button>
                        <button onClick={() => handleDownloadDashboard('cod')} className="bg-[#1A1A1A] hover:bg-[#252525] p-3 rounded-xl border border-white/5 text-xs font-bold text-orange-400 flex items-center justify-center gap-2 transition-colors">COD CSV</button>
                      </div>
                      <div className="flex gap-3">
                        <button onClick={handleSendEmail} className="flex-1 bg-[#1A1A1A] hover:bg-[#252525] p-3 rounded-xl border border-white/5 text-xs font-bold text-blue-400 flex items-center justify-center gap-2 transition-colors"><Mail size={16} /> Email</button>
                        <button onClick={handleUploadPortal} className="flex-1 bg-white text-black p-3 rounded-xl font-bold text-xs hover:bg-gray-200 flex items-center justify-center gap-2 transition-colors"><UploadCloud size={16} /> Upload</button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center text-gray-500 text-sm">Sync to enable actions</div>
                  )}
                </div>
              </div>

              {/* TABLE SECTION */}
              <div className="panel-dark min-h-[500px]">
                <div className="flex justify-between items-end mb-6 border-b border-white/5 pb-4">
                  <h3 className="text-xl font-bold">Review Orders</h3>
                  <div className="text-sm text-gray-500">{filteredOrders.length} records</div>
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
                          <th className="table-header pl-4">Order ID</th>
                          <th className="table-header">Product Info</th>
                          <th className="table-header">Details</th>
                          <th className="table-header text-right pr-4">Link</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredOrders.map((row, i) => (
                          <tr key={i} className="table-row group border-b border-white/[0.02]">
                            {/* Order ID & Payment */}
                            <td className="py-4 pl-4 align-top w-[140px]">
                              <div className="font-mono text-sm text-white font-bold mb-1">#{row.orderId}</div>
                              <div className={`text-[10px] font-bold px-2 py-0.5 rounded w-fit ${row.payment === 'Prepaid' ? 'bg-green-500/10 text-green-400' : 'bg-orange-500/10 text-orange-400'}`}>{row.payment}</div>
                            </td>

                            {/* Produc Info: Thumbnail + Inputs */}
                            <td className="py-4 align-top">
                              <div className="flex gap-4">
                                {/* Thumbnail */}
                                <div className="w-12 h-12 rounded-lg bg-white/5 border border-white/10 overflow-hidden flex-shrink-0">
                                  {row.thumbnail ? (
                                    <img src={row.thumbnail} className="w-full h-full object-cover" alt="Product" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-700 bg-black"><Box size={14} /></div>
                                  )}
                                </div>

                                {/* Inputs */}
                                <div className="flex flex-col gap-1 w-full max-w-sm">
                                  <input className="bg-transparent outline-none text-gray-300 font-medium hover:text-white focus:text-cyan-400 transition-colors w-full" value={row.category} onChange={(e) => { const n = [...data.orders]; n[i].category = e.target.value; setData({ ...data, orders: n }) }} />
                                  <input className="bg-transparent outline-none text-xs text-gray-500 hover:text-gray-300 focus:text-lime-400 transition-colors w-full" value={row.model} onChange={(e) => { const n = [...data.orders]; n[i].model = e.target.value; setData({ ...data, orders: n }) }} placeholder="Model Name" />

                                  {/* SKU Display / Missing Warning */}
                                  <div className="flex items-center gap-2 mt-1">
                                    {row.sku ? (
                                      <span className="text-[10px] font-mono bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-gray-400">
                                        SKU: {row.sku}
                                      </span>
                                    ) : (
                                      row.productId && (
                                        <button onClick={() => handleCreateSku(row.productId)} className="text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20 hover:bg-red-500/20 flex items-center gap-1 w-fit transition-colors">
                                          <Plus size={10} /> Create SKU
                                        </button>
                                      )
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Customer & COGS */}
                            <td className="py-4 align-top">
                              <div className="font-medium text-gray-300 text-sm">{row.customerName}</div>
                              <div className="text-xs text-gray-500 mt-1">COGS: ₹{row.cogs}</div>
                            </td>

                            {/* External Link */}
                            <td className="py-4 pr-4 text-right align-top">
                              {row.orderLink && (
                                <a href={row.orderLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors" title="Open Order in Shopify">
                                  <ExternalLink size={14} />
                                </a>
                              )}
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

      {/* MODAL */}
      <AnimatePresence>
        {editingBatch && (
          <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-8">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-[#111111] w-full max-w-6xl h-[90vh] rounded-3xl border border-white/10 flex flex-col overflow-hidden shadow-2xl">
              <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#151515]">
                <h3 className="font-bold text-lg">Editing Batch {editingBatch.id}</h3>
                <div className="flex gap-3">
                  <button onClick={() => setEditingBatch(null)} className="px-4 py-2 hover:bg-white/5 rounded-lg text-gray-400">Cancel</button>
                  <button onClick={saveHistory} className="px-6 py-2 bg-white text-black font-bold rounded-lg flex items-center gap-2 hover:bg-gray-200"><Save size={16} /> Save & Download</button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-0">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-[#0F0F0F] z-10 text-xs text-gray-500 uppercase font-bold">
                    <tr><th className="p-4">Action</th><th className="p-4">ID</th><th className="p-4">Category</th><th className="p-4">Model</th><th className="p-4 text-right">COGS</th></tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {editingBatch.rows.map((r, i) => (
                      <tr key={i} className="hover:bg-white/5">
                        <td className="p-4"><button onClick={() => { const n = [...editingBatch.rows]; n.splice(i, 1); setEditingBatch({ ...editingBatch, rows: n }) }} className="text-red-500 opacity-50 hover:opacity-100"><Trash2 size={16} /></button></td>
                        <td className="p-4"><input value={r.orderId} onChange={(e) => { const n = [...editingBatch.rows]; n[i].orderId = e.target.value; setEditingBatch({ ...editingBatch, rows: n }) }} className="bg-transparent outline-none w-20 text-cyan-400 font-mono" /></td>
                        <td className="p-4"><input value={r.category} onChange={(e) => { const n = [...editingBatch.rows]; n[i].category = e.target.value; setEditingBatch({ ...editingBatch, rows: n }) }} className="bg-transparent outline-none w-full text-white" /></td>
                        <td className="p-4"><input value={r.model} onChange={(e) => { const n = [...editingBatch.rows]; n[i].model = e.target.value; setEditingBatch({ ...editingBatch, rows: n }) }} className="bg-transparent outline-none w-full text-gray-400 focus:text-lime-400" /></td>
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

    </div>
  );
}

const NavItem = ({ icon, active, onClick }) => (
  <div onClick={onClick} className={`nav-item ${active ? 'nav-item-active' : ''}`}>
    {icon}
  </div>
);

export default App;
