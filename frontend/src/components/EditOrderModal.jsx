import React, { useState, useEffect } from 'react';
import { X, Save, Edit3, User, Smartphone, MessageSquare, PhoneCall } from 'lucide-react';
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

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl p-4"
            >
                <motion.div
                    initial={{ y: 50, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.95 }}
                    className="w-full max-w-lg glass-card p-6 overflow-hidden flex flex-col max-h-[90vh]"
                >
                    {/* Header */}
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-[rgba(227,207,216,0.08)] text-[#e3cfd8] border border-[rgba(227,207,216,0.12)]">
                                <Edit3 size={18} />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-white glow-text tracking-wider">EDIT ORDER</h2>
                                <div className="text-xs text-[rgba(245,245,245,0.3)] font-mono mt-1">ID: {parentOrder.orderId} • {order.length} Units</div>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-[rgba(245,245,245,0.05)] text-[rgba(245,245,245,0.4)] hover:text-white transition-colors">
                            <X size={18} />
                        </button>
                    </div>

                    <div className="overflow-y-auto no-scrollbar flex-1 space-y-5 px-1 pb-4">
                        {/* Customer Details */}
                        <div className="space-y-3">
                            <div className="text-[10px] font-bold text-[rgba(245,245,245,0.3)] uppercase tracking-[0.15em] flex justify-between items-center pr-1">
                                <span className="flex items-center gap-1"><User size={11} /> Customer Info</span>
                                {customerData.phone && (
                                    <div className="flex gap-2">
                                        <a title="Call" href={`tel:${customerData.phone}`} className="p-1.5 bg-[rgba(34,197,94,0.06)] text-emerald-400 rounded-lg hover:bg-[rgba(34,197,94,0.15)] transition-colors border border-[rgba(34,197,94,0.12)]">
                                            <PhoneCall size={12} />
                                        </a>
                                        <a title="WhatsApp" target="_blank" href={`https://wa.me/${customerData.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hi ${customerData.customerName}, this is GRLHOOD! 🌸\n\nWe noticed you forgot to mention your Phone Model in your recent order. Could you please share it so we can dispatch your order soon? 📱✨`)}`} className="p-1.5 bg-[rgba(37,211,102,0.08)] text-[#25D366] rounded-lg hover:bg-[rgba(37,211,102,0.2)] transition-colors border border-[rgba(37,211,102,0.15)]">
                                            <MessageSquare size={12} />
                                        </a>
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-xs text-[rgba(245,245,245,0.3)]">Name</label>
                                    <input type="text" name="customerName" value={customerData.customerName} onChange={handleCustomerChange}
                                        className="w-full glass-input text-sm" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-[rgba(245,245,245,0.3)]">Phone</label>
                                    <input type="text" name="phone" value={customerData.phone} onChange={handleCustomerChange}
                                        className="w-full glass-input text-sm font-mono" placeholder="Add phone to enable Call/WA" />
                                </div>
                            </div>
                        </div>

                        {/* Units */}
                        {unitsData.map((unit, index) => (
                            <div key={unit.id || index} className="space-y-3 pt-4 border-t border-[rgba(227,207,216,0.06)] relative">
                                <div className="absolute -top-3 left-4 bg-[#1a1a1e] px-2.5 text-[9px] font-bold text-[#e3cfd8] uppercase tracking-[0.15em] flex items-center gap-1 border border-[rgba(227,207,216,0.1)] rounded-full">
                                    <Smartphone size={9} /> Unit {index + 1}
                                </div>
                                <div className="space-y-3 mt-2">
                                    <div className="space-y-1">
                                        <label className="text-xs text-[rgba(245,245,245,0.3)]">Category</label>
                                        <input type="text" value={unit.category} onChange={(e) => handleUnitChange(index, 'category', e.target.value)}
                                            className="w-full glass-input text-sm" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-xs text-[rgba(245,245,245,0.3)]">Device Model</label>
                                            <input type="text" value={unit.model} onChange={(e) => handleUnitChange(index, 'model', e.target.value)}
                                                className="w-full glass-input text-sm" />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs text-[rgba(245,245,245,0.3)]">SKU</label>
                                            <input type="text" value={unit.sku} onChange={(e) => handleUnitChange(index, 'sku', e.target.value)}
                                                className="w-full glass-input text-sm font-mono" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        {!isSupplier && (
                                            <div className="space-y-1">
                                                <label className="text-xs text-[#e3cfd8] font-bold opacity-70">Unit COGS (₹)</label>
                                                <input type="number" value={unit.cogs} onChange={(e) => handleUnitChange(index, 'cogs', e.target.value)}
                                                    className="w-full glass-input text-sm font-mono text-[#e3cfd8] border-[rgba(227,207,216,0.15)] focus:border-[rgba(227,207,216,0.3)]" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Footer */}
                    <div className="pt-4 mt-2 border-t border-[rgba(227,207,216,0.06)] flex gap-3">
                        <button onClick={onClose} className="flex-1 glass-btn py-3 rounded-xl font-bold text-sm">Cancel</button>
                        <button onClick={handleSave} className="flex-1 py-3 rounded-xl glass-btn-accent font-black text-sm flex justify-center items-center gap-2 btn-shine-effect">
                            <Save size={14} /> Save Changes
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
