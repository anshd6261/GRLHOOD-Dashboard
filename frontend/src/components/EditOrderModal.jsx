import React, { useState, useEffect } from 'react';
import { X, Save, Edit3, User, MapPin, Smartphone, Box, MessageSquare, PhoneCall } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function EditOrderModal({ isOpen, onClose, order, onSave }) {
    if (!isOpen || !order || !Array.isArray(order) || order.length === 0) return null;

    // We take the first item's customer details as the parent info.
    const parentOrder = order[0];

    const [customerData, setCustomerData] = useState({
        customerName: '',
        phone: ''
    });

    const [unitsData, setUnitsData] = useState([]);

    useEffect(() => {
        if (order && order.length > 0) {
            setCustomerData({
                customerName: order[0].customerName || '',
                phone: order[0].shippingDetails?.phone || ''
            });

            setUnitsData(order.map(item => ({
                id: item.id,
                category: item.category || '',
                model: item.model || '',
                sku: item.sku || '',
                cogs: item.cogs || 0
            })));
        }
    }, [order]);

    const handleCustomerChange = (e) => {
        const { name, value } = e.target;
        setCustomerData(prev => ({ ...prev, [name]: value }));
    };

    const handleUnitChange = (index, field, value) => {
        const newUnits = [...unitsData];
        newUnits[index][field] = value;
        setUnitsData(newUnits);
    };

    const handleSave = () => {
        // Reconstruct the array to send back to App.jsx
        const updatedItems = order.map((item, index) => {
            const unitChanges = unitsData[index];
            return {
                ...item,
                customerName: customerData.customerName,
                shippingDetails: {
                    ...item.shippingDetails,
                    phone: customerData.phone
                },
                category: unitChanges.category,
                model: unitChanges.model,
                sku: unitChanges.sku,
                cogs: Number(unitChanges.cogs)
            };
        });

        onSave(updatedItems);
        onClose();
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            >
                <motion.div
                    initial={{ y: 50, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.95 }}
                    className="w-full max-w-lg glass-card p-6 overflow-hidden flex flex-col max-h-[90vh]"
                >
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                                <Edit3 size={20} />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-white glow-text tracking-wider">EDIT ORDER</h2>
                                <div className="text-xs text-gray-400 font-mono mt-1">ID: {parentOrder.orderId} • {order.length} Units</div>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="overflow-y-auto no-scrollbar flex-1 space-y-5 px-1 pb-4">
                        {/* Customer Details */}
                        <div className="space-y-3">
                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex justify-between items-center pr-1">
                                <span className="flex items-center gap-1"><User size={12} /> Customer Info</span>
                                {customerData.phone && (
                                    <div className="flex gap-2">
                                        <a title="Call Customer" href={`tel:${customerData.phone}`} className="p-1.5 bg-green-500/10 text-green-400 rounded-md hover:bg-green-500/20 transition-colors border border-green-500/20">
                                            <PhoneCall size={14} />
                                        </a>
                                        <a title="WhatsApp Customer" target="_blank" href={`https://wa.me/${customerData.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hi ${customerData.customerName}, this is GRLHOOD! 🌸\n\nWe noticed you forgot to mention your Phone Model in your recent order. Could you please share it so we can dispatch your order soon? 📱✨`)}`} className="p-1.5 bg-[#25D366]/20 text-[#25D366] rounded-md hover:bg-[#25D366]/30 transition-colors border border-[#25D366]/30">
                                            <MessageSquare size={14} />
                                        </a>
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-xs text-gray-400">Name</label>
                                    <input
                                        type="text" name="customerName" value={customerData.customerName} onChange={handleCustomerChange}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all text-sm"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-gray-400">Phone</label>
                                    <input
                                        type="text" name="phone" value={customerData.phone} onChange={handleCustomerChange}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all text-sm font-mono"
                                        placeholder="Add phone to enable Call/WA"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Product Details Loop */}
                        {unitsData.map((unit, index) => (
                            <div key={unit.id || index} className="space-y-3 pt-4 border-t border-white/5 relative">
                                <div className="absolute -top-3 left-4 bg-[#111] px-2 text-[10px] font-bold text-cyan-500 uppercase tracking-widest flex items-center gap-1 border border-white/5 rounded-full shadow-sm">
                                    <Smartphone size={10} /> Unit {index + 1}
                                </div>

                                <div className="space-y-3 mt-2">
                                    <div className="space-y-1">
                                        <label className="text-xs text-gray-400">Category / Product Name</label>
                                        <input
                                            type="text" value={unit.category} onChange={(e) => handleUnitChange(index, 'category', e.target.value)}
                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all text-sm"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-xs text-gray-400">Device Model</label>
                                            <input
                                                type="text" value={unit.model} onChange={(e) => handleUnitChange(index, 'model', e.target.value)}
                                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all text-sm"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs text-gray-400">SKU</label>
                                            <input
                                                type="text" value={unit.sku} onChange={(e) => handleUnitChange(index, 'sku', e.target.value)}
                                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all text-sm font-mono"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-xs text-cyan-400/70 font-bold">Unit COGS (₹)</label>
                                            <input
                                                type="number" value={unit.cogs} onChange={(e) => handleUnitChange(index, 'cogs', e.target.value)}
                                                className="w-full bg-cyan-900/10 border border-cyan-500/30 rounded-xl px-4 py-2 text-cyan-300 font-bold outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all text-sm font-mono"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}

                    </div>

                    <div className="pt-4 mt-2 border-t border-white/10 flex gap-3">
                        <button onClick={onClose} className="flex-1 py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-sm transition-colors border border-white/10">
                            Cancel
                        </button>
                        <button onClick={handleSave} className="flex-1 py-3 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-black text-sm transition-colors shadow-[0_0_20px_rgba(6,182,212,0.4)] flex justify-center items-center gap-2">
                            <Save size={16} /> Save Changes
                        </button>
                    </div>

                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
