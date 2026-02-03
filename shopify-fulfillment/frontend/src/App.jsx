import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Package, Smartphone, IndianRupee, Download, RefreshCw, Settings, CheckCircle, AlertCircle, ShoppingBag } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = 'http://localhost:3001/api';

function App() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState({ connected: false });
  const [showSettings, setShowSettings] = useState(false);

  // Initial Status Check
  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      const res = await axios.get(`${API_URL}/status`);
      setStatus(res.data);
    } catch (err) {
      console.error('API Error:', err);
    }
  };

  const handleSync = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API_URL}/orders`);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!data?.orders) return;
    try {
      const res = await axios.post(`${API_URL}/download`, { rows: data.orders }, { responseType: 'blob' });

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `ORDERS-${new Date().toLocaleDateString()}.csv`);
      document.body.appendChild(link);
      link.click();
    } catch (err) {
      setError('Download unable to start');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-dark-900 via-dark-800 to-indigo-950 text-white font-sans p-8">

      {/* HEADER */}
      <header className="max-w-7xl mx-auto flex justify-between items-center mb-12">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-tr from-primary-600 to-indigo-500 rounded-2xl flex items-center justify-center shadow-lg shadow-primary-500/20">
            <Package className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Fulfillment Hub</h1>
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <span className={`w-2 h-2 rounded-full ${status.connected ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
              {status.store || 'Not Connected'}
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          {error && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2 rounded-xl flex items-center gap-2 text-sm">
              <AlertCircle size={16} />
              {error}
            </motion.div>
          )}

          <button onClick={() => setShowSettings(!showSettings)} className="p-3 glass rounded-xl hover:bg-white/10 transition-colors">
            <Settings size={20} className="text-slate-300" />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto space-y-8">

        {/* STATS ROW */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <StatCard
            icon={<ShoppingBag />}
            label="Total Orders"
            value={data?.stats?.totalOrders ?? '-'}
            color="bg-blue-500"
          />
          <StatCard
            icon={<Smartphone />}
            label="Total Items"
            value={data?.stats?.totalItems ?? '-'}
            color="bg-violet-500"
          />
          <StatCard
            icon={<IndianRupee />}
            label="Revenue (COGS)"
            value={data?.stats?.subtotal ? `₹${data.stats.subtotal.toFixed(0)}` : '-'}
            color="bg-emerald-500"
          />
          <StatCard
            icon={<IndianRupee />}
            label="Grand Total (+GST)"
            value={data?.stats?.total ? `₹${data.stats.total.toFixed(0)}` : '-'}
            color="bg-amber-500"
          />
        </div>

        {/* ACTION BAR */}
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold text-slate-200">
            {data ? 'Fulfillment Orders' : 'Ready to Sync'}
          </h2>
          <div className="flex gap-4">
            <button
              onClick={handleSync}
              disabled={loading}
              className="px-6 py-3 glass rounded-xl font-medium text-white hover:bg-white/10 disabled:opacity-50 flex items-center gap-2"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Syncing...' : 'Sync Orders'}
            </button>

            <button
              onClick={handleDownload}
              disabled={!data}
              className="px-6 py-3 bg-gradient-to-r from-primary-600 to-indigo-600 rounded-xl font-bold text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Download size={18} />
              Download CSV
            </button>
          </div>
        </div>

        {/* DATA TABLE */}
        <div className="glass rounded-3xl overflow-hidden min-h-[400px]">
          {!data ? (
            <div className="h-full flex flex-col items-center justify-center p-20 text-slate-500">
              <Package size={48} className="mb-4 opacity-20" />
              <p>Click "Sync Orders" to fetch data</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-white/5 text-slate-400 text-sm uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4 font-medium">Order</th>
                    <th className="px-6 py-4 font-medium">Customer</th>
                    <th className="px-6 py-4 font-medium">Details</th>
                    <th className="px-6 py-4 font-medium">Payment</th>
                    <th className="px-6 py-4 font-medium text-right">COGS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.orders.map((row, i) => (
                    <tr key={i} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-mono text-indigo-300">#{row.orderId}</span>
                      </td>
                      <td className="px-6 py-4 text-slate-300">
                        {row.customerName}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-white">{row.model}</span>
                          <span className="text-xs text-slate-500">{row.sku}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${row.payment === 'Prepaid' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                          }`}>
                          {row.payment}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-slate-300">
                        ₹{row.cogs}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </main>
    </div>
  );
}

const StatCard = ({ icon, label, value, color }) => (
  <div className="glass p-6 rounded-3xl border border-white/5 relative overflow-hidden group">
    <div className={`absolute top-0 right-0 w-24 h-24 ${color} blur-[60px] opacity-20 group-hover:opacity-30 transition-opacity`}></div>
    <div className="relative z-10">
      <div className={`w-10 h-10 rounded-xl ${color} bg-opacity-20 flex items-center justify-center mb-4 text-white`}>
        {React.cloneElement(icon, { size: 20 })}
      </div>
      <div className="text-slate-400 text-sm font-medium mb-1">{label}</div>
      <div className="text-3xl font-bold text-white">{value}</div>
    </div>
  </div>
);

export default App;
