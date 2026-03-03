import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    DollarSign,
    TrendingUp,
    AlertCircle,
    CreditCard,
    BarChart2
} from 'lucide-react';

const FinancialDashboard = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeView, setActiveView] = useState('summary'); // summary, mtd

    useEffect(() => {
        const fetchFinancials = async () => {
            try {
                setLoading(true);
                const response = await axios.get('/api/financials/summary');
                setData(response.data);
            } catch (err) {
                setError('Failed to load financial data. ' + err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchFinancials();
    }, []);

    if (loading) return (
        <div className="flex h-full items-center justify-center p-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
    );

    if (error) return (
        <div className="p-8 text-center text-red-600">
            <AlertCircle className="mx-auto h-12 w-12 mb-4" />
            <p className="text-xl font-medium">{error}</p>
        </div>
    );

    if (!data) return null;

    const formatCurr = (val) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);

    // Quick metric cards renderer
    const MetricCard = ({ title, value, subtitle, icon: Icon, color = 'indigo' }) => (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex items-start space-x-4">
            <div className={`p-3 rounded-lg bg-${color}-50 text-${color}-600`}>
                <Icon className="h-6 w-6" />
            </div>
            <div>
                <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
                <h3 className="text-2xl font-bold text-gray-900">{value}</h3>
                {subtitle && <p className="text-sm text-gray-400 mt-1">{subtitle}</p>}
            </div>
        </div>
    );

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Financial Overview</h1>
                    <p className="mt-2 text-sm text-gray-500">Track real-time P&L, cash positions, and business health.</p>
                </div>

                <div className="flex space-x-2 bg-gray-100 p-1 rounded-lg">
                    <button
                        onClick={() => setActiveView('summary')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeView === 'summary' ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-900'}`}
                    >
                        Today
                    </button>
                    <button
                        onClick={() => setActiveView('mtd')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeView === 'mtd' ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-900'}`}
                    >
                        Month to Date
                    </button>
                </div>
            </div>

            {/* Alerts Section */}
            {data.alerts && data.alerts.length > 0 && (
                <div className="mb-8 space-y-3">
                    {data.alerts.map((alert, i) => (
                        <div key={i} className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-md flex items-start">
                            <AlertCircle className="h-5 w-5 text-amber-400 mt-0.5 mr-3 flex-shrink-0" />
                            <div>
                                <h3 className="text-sm font-medium text-amber-800">
                                    {alert.type === 'rto_risk' ? 'RTO Risk Detected' :
                                        alert.type === 'settlement_delay' ? 'Settlement Delay' : 'Performance Alert'}
                                </h3>
                                <p className="mt-1 text-sm text-amber-700">{alert.description}</p>
                                {alert.amount && <p className="mt-1 text-xs font-semibold text-amber-900">Value at risk: {formatCurr(alert.amount)}</p>}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Primary KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <MetricCard
                    title={activeView === 'summary' ? "Today's Net Profit" : "MTD Net Profit"}
                    value={formatCurr(activeView === 'summary' ? data.today.netProfit : data.mtd.netProfit)}
                    subtitle={`${(activeView === 'summary' ? data.today.blendedMargin : data.mtd.blendedMargin).toFixed(1)}% Blended Margin`}
                    icon={TrendingUp}
                    color="emerald"
                />
                <MetricCard
                    title={activeView === 'summary' ? "Today's Revenue" : "MTD Revenue"}
                    value={formatCurr(activeView === 'summary' ? data.today.revenue : data.mtd.revenue)}
                    subtitle={`${activeView === 'summary' ? data.today.orders : data.mtd.orders} Orders`}
                    icon={DollarSign}
                    color="indigo"
                />
                <MetricCard
                    title={activeView === 'summary' ? "Today's ROAS" : "MTD ROAS"}
                    value={(activeView === 'summary' ? data.today.roas : data.mtd.roas).toFixed(2) + 'x'}
                    subtitle={`${formatCurr(activeView === 'summary' ? data.today.adSpend : data.mtd.adSpend)} Ad Spend`}
                    icon={BarChart2}
                    color="blue"
                />
                <MetricCard
                    title="Actual Cash Position"
                    value={formatCurr(data.cashPosition.netCash)}
                    subtitle={`${formatCurr(data.cashPosition.totalPending)} Pending Settlements`}
                    icon={CreditCard}
                    color="violet"
                />
            </div>

            {/* Detailed P&L Breakdown */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                    <h3 className="text-lg font-medium text-gray-900">Profit & Loss Statement ({activeView === 'summary' ? 'Today' : 'Month to Date'})</h3>
                </div>

                <div className="px-6 py-6 border-b border-gray-100/50 flex justify-between items-center text-lg">
                    <span className="font-semibold text-gray-900">Gross Revenue</span>
                    <span className="font-bold text-gray-900">{formatCurr(activeView === 'summary' ? data.today.revenue : data.mtd.revenue)}</span>
                </div>

                <div className="px-6 py-4 space-y-3 border-b border-gray-100/50">
                    <div className="flex justify-between items-center text-gray-600">
                        <span>Cost of Goods Sold (COGS)</span>
                        <span className="text-red-600 font-medium">-{formatCurr(activeView === 'summary' ? data.today.cogs : data.mtd.cogs)}</span>
                    </div>
                    <div className="flex justify-between items-center text-gray-600">
                        <span>Shipping Cost (Forward)</span>
                        <span className="text-red-600 font-medium">-{formatCurr(activeView === 'summary' ? data.today.shipping : data.mtd.shipping)}</span>
                    </div>
                    <div className="flex justify-between items-center text-gray-600">
                        <span>Returns & RTO Costs</span>
                        <span className="text-red-600 font-medium">-{formatCurr(activeView === 'summary' ? data.today.rto : data.mtd.rto)}</span>
                    </div>
                    <div className="flex justify-between items-center text-gray-600">
                        <span>Payment Gateway Fees</span>
                        <span className="text-red-600 font-medium">-{formatCurr(activeView === 'summary' ? data.today.gatewayFees : data.mtd.gatewayFees)}</span>
                    </div>
                </div>

                <div className="px-6 py-4 bg-gray-50 flex justify-between items-center text-lg border-b border-gray-100/50">
                    <span className="font-semibold text-gray-900">Gross Profit</span>
                    <span className="font-bold text-gray-900">{formatCurr(activeView === 'summary' ? data.today.grossProfit : data.mtd.grossProfit)}</span>
                </div>

                <div className="px-6 py-4 space-y-3 border-b border-gray-100/50">
                    <div className="flex justify-between items-center text-gray-600">
                        <span>Marketing & Ad Spend</span>
                        <span className="text-red-600 font-medium">-{formatCurr(activeView === 'summary' ? data.today.adSpend : data.mtd.adSpend)}</span>
                    </div>
                    <div className="flex justify-between items-center text-gray-600">
                        <span>Operating / Other Expenses</span>
                        <span className="text-red-600 font-medium">-{formatCurr(activeView === 'summary' ? data.today.otherExpenses : data.mtd.otherExpenses)}</span>
                    </div>
                </div>

                <div className="px-6 py-6 bg-emerald-50 flex justify-between items-center">
                    <div>
                        <span className="text-xl font-bold text-emerald-900">Net Profit</span>
                        <p className="text-sm text-emerald-700 font-medium">Bottom Line Contribution</p>
                    </div>
                    <span className="text-2xl font-black text-emerald-600">
                        {formatCurr(activeView === 'summary' ? data.today.netProfit : data.mtd.netProfit)}
                    </span>
                </div>
            </div>

        </div>
    );
};

export default FinancialDashboard;
