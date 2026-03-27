import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Download, UploadCloud, AlertTriangle, FileText, RefreshCw, Phone, MessageSquare, Edit3, Trash2 } from 'lucide-react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';

export default function CsvEditorModal({ orders, onClose, onSaveOnly, onUploadPortal, isSelection }) {
    const [downloading, setDownloading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [editedOrders, setEditedOrders] = useState([]);

    useEffect(() => {
        const enhanced = orders.map(o => {
            const storageKey = `model_override_${o.orderId}_${o.sku}`;
            const savedModel = localStorage.getItem(storageKey);
            return { ...o, model: savedModel || o.model || '' };
        });
        setEditedOrders(enhanced);
    }, [orders]);

    const handleModelUpdate = (index, newModel) => {
        const updated = [...editedOrders];
        updated[index].model = newModel;
        setEditedOrders(updated);
        const o = updated[index];
        const storageKey = `model_override_${o.orderId}_${o.sku}`;
        if (newModel && newModel.trim() !== '') localStorage.setItem(storageKey, newModel);
        else localStorage.removeItem(storageKey);
    };

    const handleDeleteRow = (index) => {
        const updated = [...editedOrders];
        updated.splice(index, 1);
        setEditedOrders(updated);
    };

    const missingModelsCount = editedOrders.filter(o => !o.model || o.model.trim() === '' || o.model.toLowerCase() === 'unknown model').length;
    const hasMissingModels = missingModelsCount > 0;
    const totalOrders = new Set(editedOrders.map(o => o.orderId)).size;
    const totalCogs = editedOrders.reduce((sum, o) => sum + (parseFloat(o.cogs) || 0), 0);
    const gstRate = 18;
    const totalGst = totalCogs * (gstRate / 100);
    const supplierInvoice = totalCogs + totalGst;

    const handleSaveOnly = async () => {
        setDownloading(true);
        try {
            const resSup = await axios.post(`${API_URL}/download`, { rows: editedOrders, skipHistory: true, type: 'supplier', isSelected: !!isSelection }, { responseType: 'blob' });
            if (resSup.status !== 200) throw new Error('Supplier CSV failed');
            const urlSup = window.URL.createObjectURL(new Blob([resSup.data], { type: 'text/csv' }));
            const aSup = document.createElement('a');
            aSup.href = urlSup;
            aSup.download = resSup.headers['x-filename'] || 'Order.csv';
            aSup.click();

            await new Promise(resolve => setTimeout(resolve, 1000));

            const resFin = await axios.post(`${API_URL}/download`, { rows: editedOrders, skipHistory: true, type: 'financial', isSelected: !!isSelection }, { responseType: 'blob' });
            if (resFin.status !== 200) throw new Error('Financial CSV failed');
            const urlFin = window.URL.createObjectURL(new Blob([resFin.data], { type: 'text/csv' }));
            const aFin = document.createElement('a');
            aFin.href = urlFin;
            aFin.download = resFin.headers['x-filename'] || 'Financial Report.csv';
            aFin.click();

            try { await axios.post(`${API_URL}/dropbox/upload`, { orders: editedOrders }); }
            catch (e) { console.error("Dropbox sync failed:", e); alert("Downloads started, but Dropbox backup failed."); }

            if (onSaveOnly) onSaveOnly();
            onClose();
        } catch (e) {
            console.error("Save Error:", e);
            alert(`Error: ${e.response?.data?.error || e.message}`);
        } finally { setDownloading(false); }
    };

    const handleUpload = async () => {
        setUploading(true);
        try { if (onUploadPortal) await onUploadPortal(editedOrders); }
        catch (e) { console.error(e); }
        finally { setUploading(false); onClose(); }
    };

    const handleCall = (phone) => {
        if (!phone) return alert('No phone number');
        window.location.href = `tel:${phone}`;
    };

    const handleWhatsApp = (phone, customerName, orderId) => {
        if (!phone) return alert('No phone number');
        const cleanPhone = phone.replace(/\D/g, '');
        const firstName = customerName.split(' ')[0];
        const message = `Hi ${firstName}, this is GRLHOOD. We're processing your order ${orderId} but need your Phone Model. Please let us know.`;
        window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 lg:p-8 overflow-hidden">
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/80 backdrop-blur-2xl"
                onClick={onClose}
            />

            <motion.div
                initial={{ scale: 0.95, y: 30, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.95, y: 30, opacity: 0 }}
                className="glass-card relative w-full max-w-5xl h-[92vh] flex flex-col z-10 overflow-hidden"
            >
                {/* Header */}
                <div className="p-6 border-b border-[rgba(227,207,216,0.06)] flex justify-between items-start bg-[rgba(227,207,216,0.02)]">
                    <div>
                        <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight mb-2">CSV Editor & Fulfillment</h2>
                        <div className="flex items-center gap-3 flex-wrap">
                            <span className="glass-pill text-[10px] text-[#e3cfd8] bg-[rgba(227,207,216,0.08)] border-[rgba(227,207,216,0.15)]">{totalOrders} Orders</span>
                            <span className="glass-pill text-[10px] text-[#e3cfd8] bg-[rgba(227,207,216,0.08)] border-[rgba(227,207,216,0.15)]">₹{supplierInvoice.toFixed(0)} Total</span>
                            {hasMissingModels && (
                                <span className="glass-pill text-[10px] text-red-400 bg-[rgba(239,68,68,0.08)] border-[rgba(239,68,68,0.15)] animate-pulse-soft">{missingModelsCount} Missing Models</span>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2.5 rounded-xl bg-[rgba(245,245,245,0.03)] hover:bg-[rgba(239,68,68,0.1)] hover:text-red-400 transition-all text-[rgba(245,245,245,0.4)]">
                        <X size={18} />
                    </button>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-auto p-0">
                    <table className="w-full text-left border-collapse min-w-[800px]">
                        <thead className="sticky top-0 z-20 bg-[rgba(20,20,24,0.95)] backdrop-blur-xl border-b border-[rgba(227,207,216,0.06)] text-[10px] uppercase tracking-[0.15em] text-[rgba(245,245,245,0.3)] font-bold">
                            <tr>
                                <th className="p-4 w-12 text-center">×</th>
                                <th className="p-4">Item</th>
                                <th className="p-4">Order ID</th>
                                <th className="p-4">Customer</th>
                                <th className="p-4 w-[280px]">Device Model</th>
                                <th className="p-4 text-center">Contact</th>
                                <th className="p-4 text-right">COGS</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[rgba(227,207,216,0.04)] text-sm">
                            {editedOrders.map((order, idx) => {
                                const isMissing = !order.model || order.model.trim() === '' || order.model.toLowerCase() === 'unknown model';
                                return (
                                    <tr key={`${order.orderId}_${order.sku}_${idx}`} className={`hover:bg-[rgba(227,207,216,0.02)] transition-colors ${isMissing ? 'bg-[rgba(239,68,68,0.02)]' : ''}`}>
                                        <td className="p-4 text-center">
                                            <button onClick={() => handleDeleteRow(idx)} className="text-[rgba(245,245,245,0.2)] hover:text-red-400 transition-colors p-1">
                                                <Trash2 size={15} />
                                            </button>
                                        </td>
                                        <td className="p-4">
                                            <div className="w-10 h-10 rounded-xl bg-[rgba(227,207,216,0.04)] overflow-hidden border border-[rgba(227,207,216,0.06)] shrink-0">
                                                {order.thumbnail ? (
                                                    <img src={order.thumbnail} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-[rgba(245,245,245,0.1)]"><FileText size={15} /></div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-4 font-mono font-bold text-[#e3cfd8]">{order.orderId}</td>
                                        <td className="p-4 text-[rgba(245,245,245,0.6)] font-medium truncate max-w-[150px]">{order.customerName}</td>
                                        <td className="p-4 relative">
                                            <div className="relative">
                                                <div className={`absolute left-3 top-1/2 -translate-y-1/2 transition-colors ${isMissing ? 'text-red-400' : 'text-[rgba(245,245,245,0.2)]'}`}>
                                                    <Edit3 size={13} />
                                                </div>
                                                <input
                                                    type="text"
                                                    value={order.model === 'Unknown Model' ? '' : order.model}
                                                    onChange={(e) => handleModelUpdate(idx, e.target.value)}
                                                    placeholder="Device Model..."
                                                    className={`w-full glass-input pl-9 pr-3 py-2 text-sm font-medium ${isMissing ? 'border-[rgba(239,68,68,0.3)] focus:border-red-400' : ''}`}
                                                />
                                                {isMissing && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-red-500 animate-ping" />}
                                            </div>
                                            <div className="text-[9px] text-[rgba(245,245,245,0.25)] mt-1 uppercase truncate max-w-[200px] tracking-wider">{order.category}</div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center justify-center gap-2">
                                                <button onClick={() => handleCall(order.shippingDetails?.phone)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-[rgba(34,197,94,0.06)] text-emerald-400 border border-[rgba(34,197,94,0.12)] hover:bg-[rgba(34,197,94,0.15)] transition-all">
                                                    <Phone size={13} />
                                                </button>
                                                <button onClick={() => handleWhatsApp(order.shippingDetails?.phone, order.customerName, order.orderId)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-[rgba(37,211,102,0.06)] text-[#25D366] border border-[rgba(37,211,102,0.12)] hover:bg-[rgba(37,211,102,0.15)] transition-all">
                                                    <MessageSquare size={13} />
                                                </button>
                                            </div>
                                        </td>
                                        <td className="p-4 text-right font-bold text-[#e3cfd8] font-mono">₹{order.cogs || 0}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-[rgba(227,207,216,0.06)] bg-[rgba(227,207,216,0.02)] space-y-3">
                    <button
                        onClick={handleSaveOnly}
                        disabled={downloading || uploading}
                        className="w-full glass-btn py-4 rounded-2xl text-xs font-bold tracking-[0.15em] uppercase flex items-center justify-center gap-3"
                    >
                        {downloading ? (
                            <RefreshCw className="animate-spin text-[#e3cfd8]" size={16} />
                        ) : (
                            <Download size={16} className="text-[#e3cfd8]" />
                        )}
                        SAVE TO COMPUTER
                    </button>

                    <button
                        onClick={handleUpload}
                        disabled={downloading || uploading}
                        className={`w-full py-5 rounded-2xl font-black text-sm flex items-center justify-center gap-3 tracking-[0.15em] uppercase btn-shine-effect transition-all ${hasMissingModels ? 'bg-amber-500/80 text-black hover:bg-amber-400' : 'glass-btn-accent hover:brightness-110'}`}
                    >
                        {uploading ? (
                            <RefreshCw className="animate-spin" size={16} />
                        ) : (
                            <UploadCloud size={18} />
                        )}
                        {uploading ? 'Processing...' : (hasMissingModels ? 'PLACE ORDER' : 'SEND ORDER TO PORTAL')}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
