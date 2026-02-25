import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { TrendingUp, DollarSign, Package, AlertTriangle, Plus, Calendar, Search, ArrowUpRight, ArrowDownRight, Filter } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'https://grlhood-backend.loca.lt';

// Colors for Charts
const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042'];

// Helper for currency formatting
const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(amount);
};

export default function ProfitDashboard() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [adSpendInput, setAdSpendInput] = useState({ date: new Date().toISOString().split('T')[0], amount: '' });
    const [dateRange, setDateRange] = useState([new Date(new Date().setDate(new Date().getDate() - 30)), new Date()]);
    const [startDate, endDate] = dateRange;
    const [days, setDays] = useState(30);

    // Table State
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });

    const fetchData = async () => {
        setLoading(true);
        try {
            // Calculate days difference
            const diffTime = Math.abs(endDate - startDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            const res = await axios.get(`${API_BASE}/api/analytics/dashboard?days=${diffDays || 30}`);
            if (res.data.success) {
                setData(res.data.data);
            }
        } catch (err) {
            console.error("Failed to fetch analytics", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (startDate && endDate) {
            fetchData();
        }
    }, [startDate, endDate]);

    const handleAdSpendSubmit = async () => {
        if (!adSpendInput.amount) return;
        try {
            await axios.post(`${API_BASE}/api/analytics/ad-spend`, adSpendInput);
            setAdSpendInput({ ...adSpendInput, amount: '' });
            fetchData(); // Refresh data
            alert('Ad Spend Added');
        } catch (error) {
            alert('Failed to save');
        }
    };

    // Sort Logic for Table
    const sortedOrders = React.useMemo(() => {
        if (!data?.orders) return [];
        let sortableItems = [...data.orders];
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            sortableItems = sortableItems.filter(item =>
                (item.orderId && item.orderId.toString().toLowerCase().includes(lower)) ||
                (item.customer && item.customer.toLowerCase().includes(lower))
            );
        }
        if (sortConfig.key) {
            sortableItems.sort((a, b) => {
                if (a[sortConfig.key] < b[sortConfig.key]) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (a[sortConfig.key] > b[sortConfig.key]) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [data, searchTerm, sortConfig]);

    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    if (loading && !data) return <div className="p-8 text-white">Loading Analytics...</div>;

    return (
        <div className="space-y-8 pb-20">
            {/* Header & Controls */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-500">Profit Analytics</h1>
                    <p className="text-gray-500 text-sm mt-1">Real-time financial tracking per order</p>
                </div>

                <div className="flex items-center gap-4 bg-[#1A1A1A] px-4 py-2 rounded-xl border border-white/5">
                    <Calendar size={16} className="text-gray-500" />
                    <DatePicker
                        selectsRange={true}
                        startDate={startDate}
                        endDate={endDate}
                        onChange={(update) => setDateRange(update)}
                        className="bg-transparent text-sm font-bold text-white outline-none w-48 text-center cursor-pointer"
                        placeholderText="Select Date Range"
                    />
                </div>
            </div>

            {/* Top Cards - Row 1 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="card-gradient grad-cyan h-40">
                    <div className="flex justify-between items-start">
                        <div>
                            <div className="text-sm text-cyan-200/80 font-medium mb-1">Net Profit</div>
                            <div className="text-3xl font-bold text-white tracking-tight">{formatCurrency(data?.overview?.netProfit || 0)}</div>
                        </div>
                        <div className="icon-btn-filled bg-cyan-500/20 text-cyan-400"><DollarSign size={20} /></div>
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                        <span className={`text-xs font-bold px-2 py-1 rounded ${data?.overview?.netProfit >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                            {data?.overview?.netMargin}% Margin
                        </span>
                    </div>
                </div>

                <div className="card-gradient grad-lime h-40">
                    <div className="flex justify-between items-start">
                        <div>
                            <div className="text-sm text-lime-200/80 font-medium mb-1">Total Revenue</div>
                            <div className="text-3xl font-bold text-white tracking-tight">{formatCurrency(data?.overview?.revenue || 0)}</div>
                        </div>
                        <div className="icon-btn-filled bg-lime-500/20 text-lime-400"><TrendingUp size={20} /></div>
                    </div>
                    <div className="text-xs text-lime-200/40 mt-auto">{data?.overview?.orders} Orders Processed</div>
                </div>

                <div className="card-gradient grad-purple h-40">
                    <div className="flex justify-between items-start">
                        <div>
                            <div className="text-sm text-purple-200/80 font-medium mb-1">Marketing Spend</div>
                            <div className="text-3xl font-bold text-white tracking-tight">{formatCurrency(data?.overview?.totalAdSpend || 0)}</div>
                        </div>
                        <div className="icon-btn-filled bg-purple-500/20 text-purple-400"><TrendingUp size={20} /></div>
                    </div>
                    <div className="text-xs text-purple-200/40 mt-auto">ROAS: {data?.overview?.roas || 0}x</div>
                </div>

                <div className="panel-dark h-40 flex flex-col justify-center gap-2 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10"><AlertTriangle size={64} className="text-orange-500" /></div>
                    <div className="text-sm text-orange-200/80 font-medium">RTO Losses</div>
                    <div className="text-3xl font-bold text-white tracking-tight">{formatCurrency(data?.costs?.rtoLoss || 0)}</div>
                    <div className="text-xs text-orange-400 font-bold mt-2">Rate: {data?.overview?.rtoRate}%</div>
                </div>
            </div>

            {/* Metric Cards - Row 2 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="panel-dark p-6 flex flex-col justify-between relative overflow-hidden group">
                    <div className="flex justify-between items-start z-10">
                        <div>
                            <div className="text-xs text-gray-400 uppercase tracking-widest font-bold mb-1">AOV</div>
                            <div className="text-2xl font-bold text-white">{formatCurrency(data?.overview?.aov || 0)}</div>
                        </div>
                        <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400 group-hover:bg-indigo-500/20 transition-colors">
                            <Package size={20} />
                        </div>
                    </div>
                    <div className="text-xs text-gray-500 mt-2">Average Order Value</div>
                    <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl group-hover:bg-indigo-500/20 transition-all"></div>
                </div>

                <div className="panel-dark p-6 flex flex-col justify-between relative overflow-hidden group">
                    <div className="flex justify-between items-start z-10">
                        <div>
                            <div className="text-xs text-gray-400 uppercase tracking-widest font-bold mb-1">CAC</div>
                            <div className="text-2xl font-bold text-white">{formatCurrency(data?.overview?.cac || 0)}</div>
                        </div>
                        <div className="p-2 bg-pink-500/10 rounded-lg text-pink-400 group-hover:bg-pink-500/20 transition-colors">
                            <DollarSign size={20} />
                        </div>
                    </div>
                    <div className="text-xs text-gray-500 mt-2">Cost Per Acquisition</div>
                    <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-pink-500/10 rounded-full blur-3xl group-hover:bg-pink-500/20 transition-all"></div>
                </div>

                <div className="panel-dark p-6 flex flex-col justify-between relative overflow-hidden group">
                    <div className="flex justify-between items-start z-10">
                        <div>
                            <div className="text-xs text-gray-400 uppercase tracking-widest font-bold mb-1">ROAS</div>
                            <div className="text-2xl font-bold text-yellow-400">{data?.overview?.roas || 0}x</div>
                        </div>
                        <div className="p-2 bg-yellow-500/10 rounded-lg text-yellow-400 group-hover:bg-yellow-500/20 transition-colors">
                            <TrendingUp size={20} />
                        </div>
                    </div>
                    <div className="text-xs text-gray-500 mt-2">Return on Ad Spend</div>
                    <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-yellow-500/10 rounded-full blur-3xl group-hover:bg-yellow-500/20 transition-all"></div>
                </div>
            </div>

            {/* Charts & Input Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Ad Spend Input */}
                <div className="panel-dark flex flex-col gap-4">
                    <h3 className="font-bold text-lg mb-2">Daily Ad Spend</h3>
                    <p className="text-xs text-gray-500 mb-4">Input daily spend to automatically distribute costs across orders for that day.</p>

                    <div className="space-y-4">
                        <div>
                            <label className="text-xs text-gray-400 block mb-1">Date</label>
                            <input
                                type="date"
                                value={adSpendInput.date}
                                onChange={(e) => setAdSpendInput({ ...adSpendInput, date: e.target.value })}
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-400 block mb-1">Amount (₹)</label>
                            <input
                                type="number"
                                placeholder="e.g. 1500"
                                value={adSpendInput.amount}
                                onChange={(e) => setAdSpendInput({ ...adSpendInput, amount: e.target.value })}
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-indigo-500"
                            />
                        </div>
                        <button
                            onClick={handleAdSpendSubmit}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/20"
                        >
                            Add Entry
                        </button>
                    </div>
                </div>

                {/* Cost Breakdown */}
                <div className="panel-dark lg:col-span-2">
                    <h3 className="font-bold text-lg mb-6">Cost Breakdown</h3>
                    <div className="h-[250px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                layout="vertical"
                                data={data?.breakdown_charts?.costDistribution}
                                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                                <XAxis type="number" stroke="#666" fontSize={12} />
                                <YAxis dataKey="name" type="category" stroke="#fff" fontSize={12} width={80} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid #333', borderRadius: '10px' }}
                                    formatter={(value) => formatCurrency(value)}
                                />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                    {data?.breakdown_charts?.costDistribution.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Per Order Table */}
            <div className="panel-dark min-h-[500px]">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-xl">Per-Order Profitability</h3>
                    <div className="flex items-center gap-4 bg-black/40 px-4 py-2 rounded-xl border border-white/5 w-64">
                        <Search size={16} className="text-gray-500" />
                        <input
                            type="text"
                            placeholder="Search Order ID..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-transparent outline-none text-sm w-full"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-white/5 text-gray-500 text-xs uppercase">
                                <th className="p-4 cursor-pointer hover:text-white" onClick={() => requestSort('orderId')}>Order ID</th>
                                <th className="p-4 cursor-pointer hover:text-white" onClick={() => requestSort('date')}>Date</th>
                                <th className="p-4">Status</th>
                                <th className="p-4 text-right cursor-pointer hover:text-white" onClick={() => requestSort('revenue')}>Revenue</th>
                                <th className="p-4 text-right cursor-pointer hover:text-white" onClick={() => requestSort('cogs')}>COGS</th>
                                <th className="p-4 text-right cursor-pointer hover:text-white" onClick={() => requestSort('shipping')}>Shipping</th>
                                <th className="p-4 text-right cursor-pointer hover:text-white" onClick={() => requestSort('adSpend')}>Ad Spend</th>
                                <th className="p-4 text-right cursor-pointer hover:text-white" onClick={() => requestSort('netProfit')}>Net Profit</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-sm">
                            {sortedOrders.map((order, i) => (
                                <tr key={i} className={`hover:bg-white/5 transition-colors ${order.isRto ? 'bg-red-500/5' : ''}`}>
                                    <td className="p-4 font-bold font-mono text-cyan-400">{order.orderId}</td>
                                    <td className="p-4 text-gray-400">{order.date}</td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase border ${order.isRto ? 'border-red-500/20 text-red-400 bg-red-500/10' :
                                            order.status.includes('delivered') ? 'border-green-500/20 text-green-400 bg-green-500/10' :
                                                'border-gray-500/20 text-gray-400 bg-gray-500/10'
                                            }`}>
                                            {order.status || 'UNKNOWN'}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right font-mono">{formatCurrency(order.revenue)}</td>
                                    <td className="p-4 text-right font-mono text-gray-500">{formatCurrency(order.cogs)}</td>
                                    <td className="p-4 text-right font-mono text-gray-500">{formatCurrency(order.shipping)}</td>
                                    <td className="p-4 text-right font-mono text-orange-300">{formatCurrency(order.adSpend)}</td>
                                    <td className={`p-4 text-right font-mono font-bold ${order.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {formatCurrency(order.netProfit)}
                                    </td>
                                </tr>
                            ))}
                            {sortedOrders.length === 0 && (
                                <tr>
                                    <td colSpan="8" className="p-8 text-center text-gray-500">No orders found for this period.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
