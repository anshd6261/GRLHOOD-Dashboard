import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Download, UploadCloud, AlertTriangle, CheckCircle, FileText, RefreshCw, Phone, MessageSquare, Edit3, Trash2 } from 'lucide-react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '';
const API_URL = API_BASE ? `${API_BASE}/api` : '/api';

export default function CsvEditorModal({ orders, onClose, onSaveOnly, onUploadPortal }) {
    const [downloading, setDownloading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [editedOrders, setEditedOrders] = useState([]);

    // Load Local Storage Overrides
    useEffect(() => {
        const enhanced = orders.map(o => {
            const storageKey = `model_override_${o.orderId}_${o.sku}`;
            const savedModel = localStorage.getItem(storageKey);
            return {
                ...o,
                model: savedModel || o.model || ''
            };
        });
        setEditedOrders(enhanced);
    }, [orders]);

    const handleModelUpdate = (index, newModel) => {
        const updated = [...editedOrders];
        updated[index].model = newModel;
        setEditedOrders(updated);

        // Persist to Local Storage
        const o = updated[index];
        const storageKey = `model_override_${o.orderId}_${o.sku}`;
        if (newModel && newModel.trim() !== '') {
            localStorage.setItem(storageKey, newModel);
        } else {
            localStorage.removeItem(storageKey);
        }
    };

    const missingModelsCount = editedOrders.filter(o => !o.model || o.model.trim() === '' || o.model.toLowerCase() === 'unknown model').length;
    const hasMissingModels = missingModelsCount > 0;

    // Financials
    const totalOrders = new Set(editedOrders.map(o => o.orderId)).size;
    const totalCogs = editedOrders.reduce((sum, o) => sum + (parseFloat(o.cogs) || 0), 0);
    const gstRate = 18; // Default
    const totalGst = totalCogs * (gstRate / 100);
    const supplierInvoice = totalCogs + totalGst;

    const handleSaveOnly = async () => {
        setDownloading(true);
        try {
            // 1. Download Standard Supplier CSV
            const resSup = await axios.post(`${API_URL}/download`, { rows: editedOrders, skipHistory: true, type: 'supplier' }, { responseType: 'blob' });
            if (resSup.status !== 200) throw new Error('Supplier CSV generation failed');
            
            const urlSup = window.URL.createObjectURL(new Blob([resSup.data], { type: 'text/csv' }));
            const aSup = document.createElement('a');
            aSup.href = urlSup;
            let fileSup = 'Order.csv';
            if (resSup.headers['x-filename']) fileSup = resSup.headers['x-filename'];
            aSup.download = fileSup;
            aSup.click();

            await new Promise(resolve => setTimeout(resolve, 1000));

            // 2. Download Financial Report CSV
            const resFin = await axios.post(`${API_URL}/download`, { rows: editedOrders, skipHistory: true, type: 'financial' }, { responseType: 'blob' });
            if (resFin.status !== 200) throw new Error('Financial CSV generation failed');

            const urlFin = window.URL.createObjectURL(new Blob([resFin.data], { type: 'text/csv' }));
            const aFin = document.createElement('a');
            aFin.href = urlFin;
            let fileFin = 'Order - Financial report.csv';
            if (resFin.headers['x-filename']) fileFin = resFin.headers['x-filename'];
            aFin.download = fileFin;
            aFin.click();

            // 3. Backup to Dropbox (Now blocking for visibility)
            try {
                await axios.post(`${API_URL}/dropbox/upload`, { orders: editedOrders });
            } catch (dropboxErr) {
                console.error("Dropbox sync failed:", dropboxErr);
                alert("Downloads started, but Dropbox backup failed. Please check your Dropbox credentials or quota.");
            }

            if (onSaveOnly) onSaveOnly();
            onClose();
        } catch (e) {
            console.error("Save Only Error:", e);
            alert(`Error: ${e.response?.data?.error || e.message}. If this persists, try syncing again.`);
        } finally {
            setDownloading(false);
        }
    };

    const handleUpload = async () => {
        setUploading(true);
        try {
            if (onUploadPortal) await onUploadPortal(editedOrders);
        } catch (e) {
            console.error(e);
        } finally {
            setUploading(false);
            onClose();
        }
    };

    const handleCall = (phone) => {
        if (!phone) return alert('No phone number available');
        window.location.href = `tel:${phone}`;
    };

    const handleWhatsApp = (phone, customerName) => {
        if (!phone) return alert('No phone number available');
        const cleanPhone = phone.replace(/\D/g, '');
        const message = `Hi ${customerName}, this is Girlhood. We're processing your order but forgot to ask for your Phone Model. Could you please let us know?`;
        window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-2 md:p-4 overflow-hidden">
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/90 backdrop-blur-2xl"
                onClick={onClose}
            ></motion.div>

            <motion.div
                initial={{ scale: 0.95, y: 30, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.95, y: 30, opacity: 0 }}
                className="glass-card relative w-full max-w-4xl h-[95vh] flex flex-col z-10 border border-white/10 shadow-[0_20px_80px_rgba(0,0,0,1)] overflow-hidden"
            >
                {/* Header Section */}
                <div className="p-6 border-b border-white/10 flex justify-between items-start bg-white/5">
                    <div>
                        <h2 className="text-2xl md:text-3xl font-black text-white tracking-tighter uppercase mb-1">CSV Editor & Fulfillment</h2>
                        <div className="flex items-center gap-3">
                            <span className="text-[10px] font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20 uppercase tracking-widest">{totalOrders} Orders</span>
                            <span className="text-[10px] font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20 uppercase tracking-widest">₹{supplierInvoice.toFixed(0)} Total COGS</span>
                            {hasMissingModels && (
                                <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20 uppercase tracking-widest animate-pulse">{missingModelsCount} MISSING MODELS</span>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white/5 hover:bg-rose-500/20 hover:text-rose-400 rounded-full transition-all text-gray-400">
                        <X size={20} />
                    </button>
                </div>

                {/* Main Content: Interactive Grid */}
                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 custom-scrollbar">
                    {editedOrders.map((order, idx) => {
                        const isMissing = !order.model || order.model.trim() === '' || order.model.toLowerCase() === 'unknown model';
                        return (
                            <div key={`${order.orderId}_${order.sku}_${idx}`} className={`relative p-4 rounded-3xl border transition-all duration-300 ${isMissing ? 'bg-rose-500/5 border-rose-500/20 shadow-[0_0_20px_rgba(244,63,94,0.05)]' : 'bg-white/5 border-white/10'}`}>
                                <div className="flex items-center gap-4">
                                    {/* Product Thumb */}
                                    <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-black/40 overflow-hidden border border-white/10 shrink-0 shadow-inner">
                                        {order.thumbnail ? (
                                            <img src={order.thumbnail} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-white/20"><FileText size={24} /></div>
                                        )}
                                    </div>

                                    {/* Order Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-black text-cyan-400 uppercase tracking-widest">Order {order.orderId}</span>
                                            <span className="text-xs font-bold text-gray-500 truncate max-w-[120px]">{order.customerName}</span>
                                        </div>
                                        
                                        {/* Model Input Area */}
                                        <div className="relative group">
                                            <div className={`absolute left-3 top-1/2 -translate-y-1/2 transition-colors ${isMissing ? 'text-rose-400' : 'text-gray-500'}`}>
                                                <Edit3 size={14} />
                                            </div>
                                            <input 
                                                type="text"
                                                value={order.model === 'Unknown Model' ? '' : order.model}
                                                onChange={(e) => handleModelUpdate(idx, e.target.value)}
                                                placeholder="Type Device Model (e.g. iPhone 15 Pro)"
                                                className={`w-full bg-black/40 border ${isMissing ? 'border-rose-500/30 focus:border-rose-500' : 'border-white/10 focus:border-cyan-500'} rounded-2xl py-3 pl-10 pr-4 text-sm font-bold text-white placeholder-white/20 transition-all outline-none shadow-inner`}
                                            />
                                            {isMissing && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-rose-500 animate-ping"></div>}
                                        </div>
                                    </div>

                                    {/* Instant Contact Actions */}
                                    <div className="flex flex-col gap-2 shrink-0">
                                        <button 
                                            onClick={() => handleCall(order.shippingDetails?.phone)}
                                            className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500 hover:text-white transition-all shadow-lg active:scale-95"
                                        >
                                            <Phone size={18} />
                                        </button>
                                        <button 
                                            onClick={() => handleWhatsApp(order.shippingDetails?.phone, order.customerName)}
                                            className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500 hover:text-white transition-all shadow-lg active:scale-95"
                                        >
                                            <MessageSquare size={18} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer Actions */}
                <div className="p-6 border-t border-white/10 bg-white/5 space-y-3">
                    <button
                        onClick={handleSaveOnly}
                        disabled={downloading || uploading}
                        className="w-full bg-black/40 hover:bg-white/5 border border-white/10 text-white py-4 rounded-2xl font-black text-xs tracking-widest uppercase flex items-center justify-center gap-3 transition-all shadow-xl group"
                    >
                        {downloading ? (
                            <RefreshCw className="animate-spin text-cyan-400" size={18} />
                        ) : (
                            <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 group-hover:scale-110 transition-transform">
                                <Download size={16} />
                            </div>
                        )}
                        SAVE TO COMPUTER & DROPBOX
                    </button>

                    <button
                        onClick={handleUpload}
                        disabled={downloading || uploading}
                        className={`w-full py-5 rounded-full font-black text-sm flex items-center justify-center gap-3 transition-all tracking-[0.2em] uppercase relative overflow-hidden group btn-shine-effect shadow-2xl ${hasMissingModels ? 'bg-amber-500 text-black hover:bg-amber-400' : 'bg-white text-black hover:bg-gray-200'}`}
                    >
                        {uploading ? (
                            <RefreshCw className="animate-spin text-black" size={18} />
                        ) : (
                            <UploadCloud className="text-black group-hover:-translate-y-1 transition-transform" size={20} />
                        )}
                        {uploading ? 'PROCESSING...' : (hasMissingModels ? 'PLACE ORDER ANYWAY' : 'SEND ORDER (PORTAL + DROPBOX)')}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
