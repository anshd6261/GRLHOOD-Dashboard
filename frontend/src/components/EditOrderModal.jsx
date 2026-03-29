import React, { useState, useEffect } from 'react';
import { X, Save, Edit3, User, Smartphone, MessageSquare, PhoneCall, Hash, Tag, Package } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function EditOrderModal({ isOpen, onClose, order, onSave, isSupplier }) {
    if (!isOpen || !order || !Array.isArray(order) || order.length === 0) return null;

    const parentOrder = order[0];

    const [customerData, setCustomerData] = useState({ customerName: '', phone: '' });
    const [unitsData, setUnitsData] = useState([]);

    useEffect(() => {
        if (order && order.length > 0) {
            setCustomerData({
                customerName: order[0].customerName || '',
                phone: order[0].shippingDetails?.phone || ''
            });
            setUnitsData(order.map(item => ({
                id: item.id, category: item.category || '',
                model: item.model || '', sku: item.sku || '', cogs: item.cogs || 0
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
        const updatedItems = order.map((item, index) => {
            const unitChanges = unitsData[index];
            return {
                ...item,
                customerName: customerData.customerName,
                shippingDetails: { ...item.shippingDetails, phone: customerData.phone },
                category: unitChanges.category,
                model: unitChanges.model,
                sku: unitChanges.sku,
                cogs: Number(unitChanges.cogs)
            };
        });
        onSave(updatedItems);
        onClose();
    };

    const cleanPhone = customerData.phone.replace(/[^0-9]/g, '');

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-xl p-4"
            >
                <motion.div
                    initial={{ y: 40, scale: 0.92, opacity: 0 }}
                    animate={{ y: 0, scale: 1, opacity: 1 }}
                    exit={{ y: 20, scale: 0.95, opacity: 0 }}
                    transition={{ type: 'spring', damping: 28, stiffness: 280 }}
                    className="w-full max-w-lg glass-card p-0 overflow-hidden flex flex-col max-h-[90vh] shadow-[0_25px_80px_rgba(0,0,0,0.8)]"
                >
                    {/* Header */}
                    <div className="relative px-6 pt-5 pb-4 border-b border-[rgba(227,207,216,0.08)]">
                        <div className="absolute inset-0 bg-gradient-to-b from-[rgba(227,207,216,0.03)] to-transparent pointer-events-none" />
                        <div className="relative flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <motion.div
                                    animate={{ rotate: [0, 5, -5, 0] }}
                                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                                    className="p-2.5 rounded-xl bg-[rgba(227,207,216,0.08)] text-[#e3cfd8] border border-[rgba(227,207,216,0.12)]"
                                >
                                    <Edit3 size={18} />
                                </motion.div>
                                <div>
                                    <h2 className="text-lg font-black text-white glow-text tracking-wider uppercase">Edit Order</h2>
                                    <div className="text-[11px] text-[rgba(245,245,245,0.3)] font-mono mt-0.5">
                                        {parentOrder.orderId} &middot; {order.length} Unit{order.length !== 1 ? 's' : ''}
                                    </div>
                                </div>
                            </div>
                            <motion.button
                                whileHover={{ scale: 1.1, rotate: 90 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={onClose}
                                className="p-2 rounded-xl bg-[rgba(245,245,245,0.05)] hover:bg-[rgba(245,245,245,0.1)] text-[rgba(245,245,245,0.4)] hover:text-white transition-colors"
                            >
                                <X size={18} />
                            </motion.button>
                        </div>
                    </div>

                    <div className="overflow-y-auto no-scrollbar flex-1 px-6 py-5 space-y-5">
                        {/* Customer Details */}
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="space-y-3"
                        >
                            <div className="text-[10px] font-bold text-[rgba(245,245,245,0.3)] uppercase tracking-[0.15em] flex justify-between items-center">
                                <span className="flex items-center gap-1.5"><User size={11} /> Customer Info</span>
                                {cleanPhone && (
                                    <div className="flex gap-1.5">
                                        <a
                                            title="Call"
                                            href={`tel:${customerData.phone}`}
                                            className="p-1.5 bg-[rgba(52,211,153,0.06)] text-emerald-400 rounded-lg hover:bg-[rgba(52,211,153,0.15)] transition-colors border border-[rgba(52,211,153,0.12)]"
                                        >
                                            <PhoneCall size={12} />
                                        </a>
                                        <a
                                            title="WhatsApp"
                                            target="_blank"
                                            href={`https://wa.me/${cleanPhone}?text=${encodeURIComponent(`Hi ${customerData.customerName}, this is GRLHOOD!\n\nWe noticed you forgot to mention your Phone Model in your recent order. Could you please share it so we can dispatch your order soon?`)}`}
                                            className="p-1.5 bg-[rgba(37,211,102,0.06)] text-[#25D366] rounded-lg hover:bg-[rgba(37,211,102,0.15)] transition-colors border border-[rgba(37,211,102,0.12)]"
                                        >
                                            <MessageSquare size={12} />
                                        </a>
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] text-[rgba(245,245,245,0.35)] font-bold uppercase tracking-wider">Name</label>
                                    <input
                                        type="text" name="customerName"
                                        value={customerData.customerName}
                                        onChange={handleCustomerChange}
                                        className="w-full glass-input text-sm py-2.5"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-[rgba(245,245,245,0.35)] font-bold uppercase tracking-wider">Phone</label>
                                    <input
                                        type="text" name="phone"
                                        value={customerData.phone}
                                        onChange={handleCustomerChange}
                                        className="w-full glass-input text-sm font-mono py-2.5"
                                        placeholder="Add phone for Call/WA"
                                    />
                                </div>
                            </div>
                        </motion.div>

                        {/* Units */}
                        {unitsData.map((unit, index) => (
                            <motion.div
                                key={unit.id || index}
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.15 + index * 0.08 }}
                                className="glass-card-sm p-4 space-y-3 relative"
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <div className="p-1.5 rounded-lg bg-[rgba(227,207,216,0.06)] border border-[rgba(227,207,216,0.1)]">
                                        <Package size={12} className="text-[#e3cfd8]" />
                                    </div>
                                    <span className="text-[10px] font-black text-[#e3cfd8] uppercase tracking-[0.15em]">
                                        Unit {index + 1}
                                    </span>
                                    {order[index]?.thumbnail && (
                                        <img src={order[index].thumbnail} className="w-7 h-7 rounded-lg object-cover border border-[rgba(227,207,216,0.1)] ml-auto" alt="" />
                                    )}
                                </div>

                                <div className="space-y-2.5">
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-[rgba(245,245,245,0.35)] font-bold uppercase tracking-wider">Category</label>
                                        <input
                                            type="text" value={unit.category}
                                            onChange={(e) => handleUnitChange(index, 'category', e.target.value)}
                                            className="w-full glass-input text-sm py-2.5"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-[rgba(245,245,245,0.35)] font-bold uppercase tracking-wider">Device Model</label>
                                            <input
                                                type="text" value={unit.model}
                                                onChange={(e) => handleUnitChange(index, 'model', e.target.value)}
                                                className="w-full glass-input text-sm py-2.5"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-[rgba(245,245,245,0.35)] font-bold uppercase tracking-wider">SKU</label>
                                            <input
                                                type="text" value={unit.sku}
                                                onChange={(e) => handleUnitChange(index, 'sku', e.target.value)}
                                                className="w-full glass-input text-sm font-mono py-2.5"
                                            />
                                        </div>
                                    </div>
                                    {!isSupplier && (
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-[#e3cfd8] font-bold uppercase tracking-wider opacity-70">Unit COGS (₹)</label>
                                            <input
                                                type="number" value={unit.cogs}
                                                onChange={(e) => handleUnitChange(index, 'cogs', e.target.value)}
                                                className="w-full glass-input text-sm font-mono py-2.5 text-[#e3cfd8] border-[rgba(227,207,216,0.15)] focus:border-[rgba(227,207,216,0.3)]"
                                            />
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 border-t border-[rgba(227,207,216,0.06)] flex gap-3 bg-[rgba(0,0,0,0.15)]">
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={onClose}
                            className="flex-1 glass-btn py-3 rounded-xl font-bold text-sm"
                        >
                            Cancel
                        </motion.button>
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleSave}
                            className="flex-1 py-3 rounded-xl glass-btn-accent font-black text-sm flex justify-center items-center gap-2 btn-shine-effect"
                        >
                            <Save size={14} /> Save Changes
                        </motion.button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
