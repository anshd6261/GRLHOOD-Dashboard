import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Wallet, Truck, FileText, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '';
const API_URL = API_BASE ? `${API_BASE}/api` : '/api';

export default function ShipOrdersModal({ orders, onClose, onSuccess }) {
    const [step, setStep] = useState('ASSIGNING_COURIERS');
    const [error, setError] = useState(null);

    const totalOrders = orders.length;

    useEffect(() => {
        const orderIds = orders.map(o => o.orderId);
        executeShipping(orderIds);
    }, []);

    const executeShipping = async (orderIds) => {
        setStep('ASSIGNING_COURIERS');
        try {
            // 1. Bulk Assign
            const assignRes = await axios.post(`${API_URL}/rapidshyp/bulk-assign`, { orderIds });
            if (!assignRes.data.success) throw new Error(assignRes.data.error || 'Bulk assignment failed');

            // 2. Generate Labels & Upload to Dropbox
            setStep('GENERATING_LABELS');
            const labelRes = await axios.post(`${API_URL}/rapidshyp/bulk-labels-dropbox`, { orderIds, orders });
            if (!labelRes.data.success) throw new Error(labelRes.data.error || 'Label generation failed');

            setStep('SUCCESS');
            setTimeout(() => {
                if (onSuccess) onSuccess(labelRes.data.dropboxPaths);
                onClose();
            }, 3000);

        } catch (e) {
            setError(e.response?.data?.error || e.message);
            setStep('ERROR');
        }
    };

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/80 backdrop-blur-2xl"
                onClick={step === 'SUCCESS' || step === 'ERROR' ? onClose : undefined}
            ></motion.div>

            <motion.div
                initial={{ scale: 0.9, y: 20, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.9, y: 20, opacity: 0 }}
                className="glass-card relative w-full max-w-md z-10 p-6 flex flex-col gap-6 shadow-[0_20px_60px_rgba(0,0,0,0.8)]"
            >
                {(step === 'ERROR' || step === 'SUCCESS') && (
                    <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white z-20">
                        <X size={20} />
                    </button>
                )}

                <div className="flex flex-col items-center justify-center text-center pt-4">
                    <h2 className="text-2xl font-black text-white tracking-widest uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] mb-2">
                        SHIP ORDERS
                    </h2>
                    <p className="text-sm text-gray-400 font-medium">Processing {totalOrders} orders via RapidShyp</p>
                </div>

                <div className="flex flex-col gap-4 mt-2">
                    
                    {step === 'ASSIGNING_COURIERS' && (
                        <div className="flex flex-col items-center justify-center p-8 gap-4 text-blue-400">
                            <Truck className="animate-pulse" size={48} />
                            <div className="font-bold tracking-widest uppercase text-sm">Assigning Couriers...</div>
                        </div>
                    )}

                    {step === 'GENERATING_LABELS' && (
                        <div className="flex flex-col items-center justify-center p-8 gap-4 text-purple-400">
                            <FileText className="animate-bounce" size={48} />
                            <div className="font-bold tracking-widest uppercase text-sm">Generating Labels & Dropbox...</div>
                        </div>
                    )}

                    {step === 'SUCCESS' && (
                        <div className="flex flex-col items-center justify-center p-8 gap-4 text-emerald-400">
                            <CheckCircle size={48} className="drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
                            <div className="font-bold tracking-widest uppercase text-sm text-center">
                                Successfully Shipped!
                                <div className="text-xs text-emerald-500/70 mt-2 normal-case">PDF Uploaded to Dropbox along with CSVs.</div>
                            </div>
                        </div>
                    )}

                    {step === 'ERROR' && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 flex flex-col items-center gap-4 text-center">
                            <AlertTriangle className="text-red-400" size={32} />
                            <div>
                                <h3 className="text-red-400 font-black tracking-widest uppercase mb-1">Failed</h3>
                                <p className="text-gray-300 text-xs break-all">{error}</p>
                            </div>
                            <button onClick={onClose} className="w-full mt-2 bg-white/10 text-white hover:bg-white/20 p-3 rounded-xl font-bold text-xs">CLOSE</button>
                        </div>
                    )}

                </div>
            </motion.div>
        </div>
    );
}
