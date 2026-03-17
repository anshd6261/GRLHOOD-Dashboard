import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Download, UploadCloud, AlertTriangle, CheckCircle, FileText, RefreshCw } from 'lucide-react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '';
const API_URL = API_BASE ? `${API_BASE}/api` : '/api';

export default function CsvEditorModal({ orders, onClose, onSaveOnly, onUploadPortal }) {
    const [downloading, setDownloading] = useState(false);
    const [uploading, setUploading] = useState(false);

    const missingModelsCount = orders.filter(o => !o.model || o.model.trim() === '' || o.model.toLowerCase() === 'unknown model').length;
    const hasMissingModels = missingModelsCount > 0;

    // Calculate Financials for Preview
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    const totalCogs = orders.reduce((sum, o) => sum + (o.cogs || 0), 0);
    const totalGst = orders.reduce((sum, o) => sum + (o.gst || 0), 0);
    const supplierInvoice = totalCogs + totalGst;

    const handleSaveOnly = async () => {
        setDownloading(true);
        try {
            // Download Standard Supplier CSV (Backend)
            const resSup = await axios.post(`${API_URL}/download`, { rows: orders, skipHistory: true, type: 'supplier' }, { responseType: 'blob' });
            const urlSup = window.URL.createObjectURL(new Blob([resSup.data], { type: 'text/csv' }));
            const aSup = document.createElement('a');
            aSup.href = urlSup;
            let fileSup = 'Order.csv';
            if (resSup.headers['x-filename']) fileSup = resSup.headers['x-filename'];
            aSup.download = fileSup;
            aSup.click();

            // Download Financial Report CSV (Backend)
            const resFin = await axios.post(`${API_URL}/download`, { rows: orders, skipHistory: true, type: 'financial' }, { responseType: 'blob' });
            const urlFin = window.URL.createObjectURL(new Blob([resFin.data], { type: 'text/csv' }));
            const aFin = document.createElement('a');
            aFin.href = urlFin;
            let fileFin = 'Order - Financial report.csv';
            if (resFin.headers['x-filename']) fileFin = resFin.headers['x-filename'];
            aFin.download = fileFin;
            aFin.click();

            // Backup to Dropbox
            await axios.post(`${API_URL}/dropbox/upload`, { orders });

            if (onSaveOnly) onSaveOnly();
        } catch (e) {
            console.error(e);
            alert("Failed to download CSV: " + (e.message));
        } finally {
            setDownloading(false);
            onClose();
        }
    };

    const handleUpload = async () => {
        setUploading(true);
        try {
            if (onUploadPortal) await onUploadPortal(orders);
        } catch (e) {
            console.error(e);
        } finally {
            setUploading(false);
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            {/* Ambient Blurred Background */}
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/80 backdrop-blur-2xl"
                onClick={onClose}
            ></motion.div>

            <motion.div
                initial={{ scale: 0.9, y: 20, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.9, y: 20, opacity: 0 }}
                className="glass-card relative w-full max-w-2xl max-h-[90vh] overflow-y-auto z-10 p-6 flex flex-col gap-6 border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.8)]"
            >
                <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white z-20">
                    <X size={20} />
                </button>

                {/* Header */}
                <div className="flex flex-col items-center justify-center text-center pt-4">
                    <h2 className="text-3xl md:text-4xl font-black text-white tracking-widest uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] mb-2">
                        FULFILL ORDERS
                    </h2>
                </div>

                {/* Warning Banner Pill */}
                {hasMissingModels && (
                    <div className="flex justify-center">
                        <div className="bg-rose-500/10 border border-rose-500/30 rounded-full px-6 py-2.5 flex items-center gap-2 text-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.15)]">
                            <AlertTriangle size={16} />
                            <span className="font-bold text-sm tracking-widest uppercase">{missingModelsCount} Missing Device Models</span>
                        </div>
                    </div>
                )}

                {/* Financial Summary */}
                <div className="grid grid-cols-2 gap-4 mt-2">
                    <div className="bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col items-center justify-center relative overflow-hidden group">
                        <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <span className="text-[11px] text-gray-400 font-black tracking-widest uppercase mb-2">Total Orders</span>
                        <span className="text-4xl font-black text-white glow-text">{totalOrders}</span>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col items-center justify-center relative overflow-hidden group">
                        <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <span className="text-[11px] text-gray-400 font-black tracking-widest uppercase mb-2">Supplier Invoice</span>
                        <span className="text-4xl font-black text-white glow-text">₹{supplierInvoice.toFixed(0)}</span>
                    </div>
                </div>

                <div className="border-t border-white/10 my-2"></div>

                <div className="flex flex-col gap-3">
                    <button
                        onClick={handleSaveOnly}
                        disabled={downloading || uploading}
                        className="w-full bg-[#1A1A1A] hover:bg-[#252525] border border-white/10 text-white p-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-md group"
                    >
                        {downloading ? <RefreshCw className="animate-spin text-cyan-400" size={18} /> : <Download className="text-cyan-400 group-hover:scale-110 transition-transform" size={18} />}
                        SAVE ONLY (CSV + Financials)
                    </button>

                    <button
                        onClick={handleUpload}
                        disabled={downloading || uploading || hasMissingModels}
                        className={`w-full p-4 rounded-full font-black text-sm flex items-center justify-center gap-2 transition-all tracking-widest uppercase relative overflow-hidden group btn-shine-effect ${hasMissingModels ? 'bg-white/5 text-gray-500 cursor-not-allowed border border-white/10' : 'bg-white text-black hover:bg-gray-200 shadow-[0_0_20px_rgba(255,255,255,0.2)]'}`}
                    >
                        {uploading ? <RefreshCw className="animate-spin text-black" size={18} /> : <UploadCloud className="text-black group-hover:-translate-y-1 transition-transform" size={18} />}
                        {uploading ? 'PROCESSING...' : 'SEND ORDER (PORTAL & DROPBOX)'}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
