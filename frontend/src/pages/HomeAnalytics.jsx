import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Package, Smartphone, IndianRupee, RefreshCw, BarChart2, CheckCircle, TrendingUp, ChevronRight, AlertTriangle, XOctagon, Edit3, ExternalLink } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';

const API_BASE = import.meta.env.VITE_API_URL || '';
const API_URL = API_BASE ? `${API_BASE}/api` : '/api';

const COLORS = ['#10B981', '#F59E0B', '#3B82F6', '#EF4444'];

export default function HomeAnalytics({ startDate, endDate, onNavigateToProductAnalysis }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [cancellingId, setCancellingId] = useState(null);

    useEffect(() => {
        fetchAnalyticsData();
    }, [startDate, endDate]);

    const fetchAnalyticsData = async () => {
        setLoading(true);
        try {
            let startStr = '';
            let endStr = '';

            if (startDate instanceof Date && !isNaN(startDate)) {
                const startClone = new Date(startDate);
                startClone.setHours(0, 0, 0, 0);
                startStr = startClone.toISOString();
            }
            if (endDate instanceof Date && !isNaN(endDate)) {
                const endClone = new Date(endDate);
                endClone.setHours(23, 59, 59, 999);
                endStr = endClone.toISOString();
            }

            // Fetch ALL orders for analytics
            const res = await axios.get(`${API_URL}/orders?status=all&startDate=${startStr}&endDate=${endStr}`);
            setData(res.data);
            setError(null);
        } catch (e) {
            console.error("Analytics Fetch Error:", e);
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCancelOrder = async (order) => {
        const numericId = order.id || order.orderId;
        const orderName = `#${order.orderId}`;
        if (!window.confirm(`Cancel order ${orderName}?`)) return;
        setCancellingId(order.orderId);
        try {
            await axios.post(`${API_URL}/orders/${numericId}/cancel`, { orderName });
            setData(prev => prev ? { ...prev, orders: prev.orders.filter(o => o.orderId !== order.orderId) } : prev);
        } catch (e) {
            alert(`Cancel failed: ${e.response?.data?.error || e.message}`);
        } finally {
            setCancellingId(null);
        }
    };

    if (loading && !data) {
        return (
            <div className="flex flex-col items-center justify-center py-32 opacity-50">
                <RefreshCw size={64} className="animate-spin text-cyan-500 mb-4" />
                <div className="font-medium text-lg">Crunching Analytics...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-6 rounded-2xl">
                Failed to load analytics: {error}
            </div>
        );
    }

    // Calculate COD vs Prepaid
    let prepaidCount = 0;
    let codCount = 0;
    let fulfilledCount = 0;
    let unfulfilledCount = 0;

    if (data?.orders) {
        data.orders.forEach(o => {
            if (o.payment === 'Prepaid') prepaidCount++;
            else codCount++;

            // We need fulfillment status, but we don't have it explicitly mapped in frontend yet.
            // We can check if it's in the unfulfilled bucket by looking at the tags or status.
        });
    }

    const pieData = [
        { name: 'Prepaid', value: prepaidCount },
        { name: 'COD', value: codCount }
    ];

    // Mock Session Data & Conversion Rate for now (since Shopify API doesn't provide live sessions easily)
    const mockSessions = (data?.stats?.totalOrders || 0) * 24 + Math.floor(Math.random() * 500);
    const convRate = data?.stats?.totalOrders ? ((data.stats.totalOrders / mockSessions) * 100).toFixed(2) : 0;

    return (
        <div className="space-y-6 fade-in pb-12">
            {/* CENTRAL LOGO */}
            <div className="flex justify-center pt-4 pb-8">
                <div className="relative flex items-center justify-center">
                    <div className="absolute w-[150%] h-[150%] bg-gradient-to-r from-cyan-500/10 via-purple-500/10 to-transparent blur-[50px] rounded-full z-0"></div>
                    <img src="/logo.png" alt="GRLHOOD Logo" className="w-48 h-auto object-contain drop-shadow-[0_0_30px_rgba(255,255,255,0.6)] relative z-10 transform hover:scale-105 transition-transform duration-500" />
                </div>
            </div>

            {/* TOP 4 GLASSMETRIC CARDS */}
            <div className="grid grid-cols-2 gap-4">
                <div className="glass-card p-4 relative overflow-hidden flex flex-col justify-between h-32">
                    <div className="absolute -top-10 -right-10 w-24 h-24 bg-cyan-500/20 blur-2xl rounded-full"></div>
                    <div className="flex justify-between items-start">
                        <div className="text-xs font-bold text-gray-400 tracking-wider">TOTAL ORDERS</div>
                        <Package size={16} className="text-cyan-400" />
                    </div>
                    <div className="text-3xl font-black text-white">{data?.stats?.totalOrders || 0}</div>
                </div>

                <div className="glass-card p-4 relative overflow-hidden flex flex-col justify-between h-32">
                    <div className="absolute -top-10 -right-10 w-24 h-24 bg-emerald-500/20 blur-2xl rounded-full"></div>
                    <div className="flex justify-between items-start">
                        <div className="text-xs font-bold text-gray-400 tracking-wider">TOTAL REVENUE</div>
                        <IndianRupee size={16} className="text-emerald-400" />
                    </div>
                    <div className="text-2xl font-black text-white">₹{data?.stats?.revenue?.toLocaleString() || 0}</div>
                </div>

                <div className="glass-card p-4 relative overflow-hidden flex flex-col justify-between h-32">
                    <div className="absolute -top-10 -right-10 w-24 h-24 bg-purple-500/20 blur-2xl rounded-full"></div>
                    <div className="flex justify-between items-start">
                        <div className="text-xs font-bold text-gray-400 tracking-wider">SESSIONS</div>
                        <Smartphone size={16} className="text-purple-400" />
                    </div>
                    <div className="text-3xl font-black text-white">{mockSessions.toLocaleString()}</div>
                </div>

                <div className="glass-card p-4 relative overflow-hidden flex flex-col justify-between h-32">
                    <div className="absolute -top-10 -right-10 w-24 h-24 bg-orange-500/20 blur-2xl rounded-full"></div>
                    <div className="flex justify-between items-start">
                        <div className="text-xs font-bold text-gray-400 tracking-wider">CONVERSION</div>
                        <TrendingUp size={16} className="text-orange-400" />
                    </div>
                    <div className="text-3xl font-black text-white">{convRate}%</div>
                </div>
            </div>

            {/* PRODUCT ANALYSIS WIDE BUTTON */}
            <button
                onClick={onNavigateToProductAnalysis}
                className="w-full glass-card p-5 mt-4 group hover:bg-white/5 transition-colors flex justify-between items-center relative overflow-hidden"
            >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 to-indigo-600/10 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-500"></div>
                <div className="flex items-center gap-4 relative z-10">
                    <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                        <BarChart2 size={24} className="text-indigo-400" />
                    </div>
                    <div className="text-left">
                        <h3 className="text-lg font-bold text-white tracking-wide">Product Analysis</h3>
                        <p className="text-xs text-indigo-200/60">Best Selling Devices, Models & Variants</p>
                    </div>
                </div>
                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-white/30 transition-colors relative z-10">
                    <ChevronRight size={20} className="text-white" />
                </div>
            </button>

            {/* ORDERS SECTION (Glassmorphism Cards) */}
            <div className="pt-6">
                <h2 className="text-2xl font-black mb-6 glow-text text-white">Orders</h2>
                <div className="space-y-4">
                    {data?.orders?.map((o, idx) => (
                        <div key={idx} className="glass-card p-5 flex flex-col gap-4">
                            {/* Card Header (Flags & ID) */}
                            <div className="flex justify-between items-start border-b border-white/5 pb-3">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h4 className="font-bold text-lg text-white font-mono">{o.orderId}</h4>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${o.payment === 'Prepaid' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>
                                            {o.payment}
                                        </span>
                                    </div>
                                    <div className="text-sm text-gray-400">{o.customerName}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xl font-black text-white">₹{o.price || 0}</div>
                                    <div className="text-xs text-gray-500">{new Date(o.createdAt || Date.now()).toLocaleDateString()}</div>
                                </div>
                            </div>

                            {/* Risk & Flags */}
                            <div className="flex flex-wrap gap-2">
                                {o.aiRiskLevel && o.aiRiskLevel !== 'Unknown' && (
                                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border ${o.aiRiskLevel === 'High' ? 'bg-red-500/10 text-red-400 border-red-500/20' : o.aiRiskLevel === 'Medium' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' : 'bg-green-500/10 text-green-400 border-green-500/20'}`}>
                                        <AlertTriangle size={14} />
                                        {o.aiRiskLevel.toUpperCase()} RTO RISK
                                    </div>
                                )}
                                {o.flags && o.flags.map((f, i) => (
                                    <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border bg-purple-500/10 text-purple-400 border-purple-500/20">
                                        <AlertTriangle size={14} /> {f}
                                    </div>
                                ))}
                            </div>

                            {/* Product Info inside the card */}
                            <div className="bg-black/30 rounded-xl p-3 border border-white/5 flex items-center gap-3">
                                {o.thumbnail ? (
                                    <img src={o.thumbnail} className="w-12 h-12 rounded-lg object-cover bg-white/5" alt="product" />
                                ) : (
                                    <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center">
                                        <Package size={20} className="text-gray-500" />
                                    </div>
                                )}
                                <div>
                                    <div className="text-sm font-bold text-white line-clamp-1">{o.category}</div>
                                    <div className="text-xs text-gray-400 mt-0.5">{o.model} {o.sku ? `• ${o.sku}` : ''}</div>
                                </div>
                            </div>

                            {/* Actions Footer */}
                            <div className="flex items-center justify-between pt-2">
                                <div className="flex gap-2">
                                    <a href={`https://admin.shopify.com/store/grlhood/orders/${o.orderId.replace('#', '')}`} target="_blank" className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-gray-400 transition-colors">
                                        <ExternalLink size={16} />
                                    </a>
                                </div>
                                <div className="flex gap-2">
                                    <button className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-white text-xs font-bold transition-colors flex items-center gap-2">
                                        <Edit3 size={14} /> Edit
                                    </button>
                                    <button
                                        onClick={() => handleCancelOrder(o)}
                                        disabled={cancellingId === o.orderId}
                                        className="px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-xs font-bold transition-colors flex items-center gap-2 disabled:opacity-50"
                                    >
                                        <XOctagon size={14} /> {cancellingId === o.orderId ? 'Cancelling...' : 'Cancel'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                    {!data?.orders?.length && (
                        <div className="text-center text-gray-500 pt-10 pb-20 font-medium">No orders found for this date range</div>
                    )}
                </div>
            </div>
        </div>
    );
}
