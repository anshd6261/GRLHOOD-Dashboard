import React, { useState } from 'react';
import { IndianRupee, TrendingDown, Users, Calendar, AlertCircle, CheckCircle2, Factory } from 'lucide-react';
import { motion } from 'framer-motion';

// Mocking the Data Extracted from Zoho Books subagent
const MOCK_ZOHO_DATA = {
    total_outstanding_payables: { currency: "INR", amount: 29845.00 },
    accounts_payable_aging: {
        current: 0.00,
        overdue_1_30_days: 29845.00,
        overdue_31_60_days: 0.00,
        overdue_61_plus_days: 0.00,
        details: [
            { invoice_number: "NLG-25-26-12354", date: "17/02/2026", balance_due: 13873.00, status: "Overdue by 9 days" },
            { invoice_number: "NLG-25-26-12358", date: "17/02/2026", balance_due: 11647.00, status: "Overdue by 9 days" },
            { invoice_number: "NLG-25-26-12398", date: "19/02/2026", balance_due: 4325.00, status: "Overdue by 7 days" }
        ]
    },
    vendor_balances: [
        { vendor_name: "NextBigE", outstanding_balance: 29845.00, currency: "INR" }
    ],
    recent_cash_outflow: [
        { date: "25/02/2026", amount: 100000.00, payment_mode: "ICICI Bank", reference: "S61573653" },
        { date: "24/02/2026", amount: 50000.00, payment_mode: "ICICI Bank", reference: "S46197754" },
        { date: "17/02/2026", amount: 70000.00, payment_mode: "ICICI Bank", reference: "S94295736" }
    ]
};

export default function SupplierDashboard() {
    const [data, setData] = useState(MOCK_ZOHO_DATA);

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">

            {/* HEADER */}
            <div className="flex justify-between items-end mb-6 border-b border-white/5 pb-4">
                <div>
                    <h2 className="text-3xl font-bold mb-2">Supplier Finance Manager</h2>
                    <p className="text-gray-500 text-sm">Real-time Accounts Payable and Cash Outflow synced from Zoho Books.</p>
                </div>
            </div>

            {/* KPI CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                <div className="card-gradient grad-purple h-40">
                    <div className="flex justify-between items-start">
                        <div>
                            <div className="text-sm text-purple-200/80 font-medium mb-1">Total AP Balance</div>
                            <div className="text-4xl font-bold text-white tracking-tight">₹{data.total_outstanding_payables.amount.toLocaleString('en-IN')}</div>
                        </div>
                        <div className="icon-btn-filled bg-purple-500/20 text-purple-400"><IndianRupee size={20} /></div>
                    </div>
                    <div className="text-xs text-purple-200/40 mt-6 flex items-center gap-2">
                        <AlertCircle size={14} className="text-orange-400" /> All Owed to {data.vendor_balances[0].vendor_name}
                    </div>
                </div>

                <div className="card-gradient grad-cyan h-40 flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                        <div>
                            <div className="text-sm text-cyan-200/80 font-medium mb-1">Recent Cash Outflow</div>
                            <div className="text-3xl font-bold text-white tracking-tight">
                                ₹{data.recent_cash_outflow.reduce((acc, curr) => acc + curr.amount, 0).toLocaleString('en-IN')}
                            </div>
                        </div>
                        <div className="icon-btn-filled bg-cyan-500/20 text-cyan-400"><TrendingDown size={20} /></div>
                    </div>
                    <div className="text-xs text-cyan-200/60 font-medium bg-black/20 rounded px-2 py-1.5 inline-block w-max mt-2">
                        Last 3 Payments Recorded
                    </div>
                </div>

                <div className="card-gradient grad-lime h-40">
                    <div className="flex justify-between items-start">
                        <div>
                            <div className="text-sm text-lime-200/80 font-medium mb-1">Overdue Invoices</div>
                            <div className="text-4xl font-bold text-white tracking-tight text-red-400">
                                {data.accounts_payable_aging.details.length}
                            </div>
                        </div>
                        <div className="icon-btn-filled bg-lime-500/20 text-lime-400"><Calendar size={20} /></div>
                    </div>
                    <div className="text-xs text-lime-200/40 mt-6">
                        Ranging from 7-9 days overdue
                    </div>
                </div>

                <div className="panel-dark h-40 flex flex-col justify-center gap-3 relative overflow-hidden">
                    <div className="absolute -right-4 -bottom-4 opacity-5"><Factory size={120} /></div>
                    <h3 className="text-lg font-bold z-10">Active Suppliers</h3>
                    <div className="text-3xl font-bold text-white z-10">{data.vendor_balances.length}</div>
                    <div className="text-xs text-gray-400 z-10">Suppliers with outstanding balances</div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* AP AGING TABLE */}
                <div className="panel-dark">
                    <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                        <AlertCircle className="text-orange-400" size={20} />
                        Accounts Payable Aging (1-30 Days)
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-white/5 text-gray-500 text-sm">
                                    <th className="pb-3 font-medium">Invoice #</th>
                                    <th className="pb-3 font-medium">Date</th>
                                    <th className="pb-3 font-medium text-right">Balance Due</th>
                                    <th className="pb-3 font-medium text-right">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {data.accounts_payable_aging.details.map((inv, i) => (
                                    <tr key={i} className="hover:bg-white/5 transition-colors group">
                                        <td className="py-4 font-mono text-cyan-400 text-sm">{inv.invoice_number}</td>
                                        <td className="py-4 text-gray-300 text-sm">{inv.date}</td>
                                        <td className="py-4 text-right font-mono font-bold text-white">₹{inv.balance_due.toLocaleString('en-IN')}</td>
                                        <td className="py-4 text-right">
                                            <span className="bg-red-500/10 text-red-400 text-xs px-2 py-1 rounded border border-red-500/20">
                                                {inv.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* CASH OUTFLOW TABLE */}
                <div className="panel-dark">
                    <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                        <CheckCircle2 className="text-green-400" size={20} />
                        Recent Cash Outflow
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-white/5 text-gray-500 text-sm">
                                    <th className="pb-3 font-medium">Date</th>
                                    <th className="pb-3 font-medium">Reference</th>
                                    <th className="pb-3 font-medium text-right">Amount Paid</th>
                                    <th className="pb-3 font-medium text-right">Mode</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {data.recent_cash_outflow.map((payment, i) => (
                                    <tr key={i} className="hover:bg-white/5 transition-colors group">
                                        <td className="py-4 text-gray-300 text-sm">{payment.date}</td>
                                        <td className="py-4 font-mono text-gray-400 text-xs">{payment.reference}</td>
                                        <td className="py-4 text-right font-mono font-bold text-green-400">₹{payment.amount.toLocaleString('en-IN')}</td>
                                        <td className="py-4 text-right text-gray-400 text-sm">{payment.payment_mode}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
