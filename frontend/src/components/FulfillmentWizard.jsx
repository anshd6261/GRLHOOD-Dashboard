import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, ChevronDown, ChevronUp, ChevronRight, AlertTriangle, Phone, MessageSquare,
    Download, RefreshCw, Truck, FileText, CheckCircle, XOctagon, Edit3, Trash2,
    Package, Shield, Smartphone, Sparkles, Wallet, ArrowRight, ExternalLink
} from 'lucide-react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '';
const API_URL = API_BASE ? `${API_BASE}/api` : '/api';

const STEP_LABELS = [
    { num: 1, label: 'RTO Sort', icon: Shield },
    { num: 2, label: 'Devices', icon: Smartphone },
    { num: 3, label: 'Final Check', icon: FileText },
    { num: 4, label: 'Download', icon: Download },
    { num: 5, label: 'Ship', icon: Truck },
    { num: 6, label: 'Labels', icon: FileText },
    { num: 7, label: 'Done', icon: Sparkles }
];

const SHIPPING_COST_PER_ORDER = 85;
const OWNER_PHONE = '919876543210'; // Replace with actual owner phone

export default function FulfillmentWizard({ orders, onClose, onComplete, isSupplierView = false }) {
    const [step, setStep] = useState(1);
    const [workingOrders, setWorkingOrders] = useState([]);
    const [removedOrders, setRemovedOrders] = useState([]);
    const [expandedIds, setExpandedIds] = useState(new Set());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Step 5 state
    const [walletBalance, setWalletBalance] = useState(null);
    const [walletLoading, setWalletLoading] = useState(false);
    const [shipResult, setShipResult] = useState(null);

    // Step 6 state
    const [labelResult, setLabelResult] = useState(null);

    // Initialize working orders from props
    useEffect(() => {
        if (orders && orders.length > 0) {
            const enhanced = orders.map(o => {
                const storageKey = `model_override_${o.orderId}_${o.sku}`;
                const savedModel = localStorage.getItem(storageKey);
                return { ...o, model: savedModel || o.model || '' };
            });
            setWorkingOrders(enhanced);
        }
    }, [orders]);

    // Helpers
    const toggleExpand = (id) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const removeOrder = (orderId) => {
        const removed = workingOrders.filter(o => o.orderId === orderId);
        setRemovedOrders(prev => [...prev, ...removed]);
        setWorkingOrders(prev => prev.filter(o => o.orderId !== orderId));
    };

    const cancelOrder = async (order) => {
        if (!order?.id || !order?.orderId) return;
        setLoading(`Cancelling ${order.orderId}...`);
        try {
            await axios.post(`${API_URL}/orders/${order.id}/cancel`, { orderName: order.orderId });
            removeOrder(order.orderId);
        } catch (e) {
            setError(`Cancel failed: ${e.response?.data?.error || e.message}`);
        } finally {
            setLoading(false);
        }
    };

    const updateModel = (index, newModel) => {
        const updated = [...workingOrders];
        updated[index].model = newModel;
        setWorkingOrders(updated);
        const o = updated[index];
        const key = `model_override_${o.orderId}_${o.sku}`;
        newModel?.trim() ? localStorage.setItem(key, newModel) : localStorage.removeItem(key);
    };

    const deleteRow = (index) => {
        const updated = [...workingOrders];
        updated.splice(index, 1);
        setWorkingOrders(updated);
    };

    // Computed data
    const highRiskOrders = useMemo(() => {
        const groups = {};
        workingOrders.filter(o => o.rtoRisk === 'High').forEach(o => {
            if (!groups[o.orderId]) {
                groups[o.orderId] = { ...o, items: [] };
            }
            groups[o.orderId].items.push(o);
        });
        return Object.values(groups);
    }, [workingOrders]);

    const missingDeviceUnits = useMemo(() => {
        return workingOrders.filter(o =>
            !o.model || o.model.trim() === '' || o.model.toLowerCase() === 'unknown model'
        );
    }, [workingOrders]);

    const uniqueOrderCount = useMemo(() => {
        return new Set(workingOrders.map(o => o.orderId)).size;
    }, [workingOrders]);

    const totalCogs = useMemo(() => {
        return workingOrders.reduce((s, o) => s + (parseFloat(o.cogs) || 0), 0);
    }, [workingOrders]);

    const estimatedShipping = uniqueOrderCount * SHIPPING_COST_PER_ORDER;

    // Step actions
    const handleDownloadCSVs = async () => {
        setLoading('Downloading CSVs...');
        setError(null);
        try {
            // 1. Download Supplier CSV
            const resSup = await axios.post(`${API_URL}/download`,
                { rows: workingOrders, skipHistory: true, type: 'supplier' },
                { responseType: 'blob' }
            );
            const urlSup = window.URL.createObjectURL(new Blob([resSup.data], { type: 'text/csv' }));
            const aSup = document.createElement('a');
            aSup.href = urlSup;
            aSup.download = resSup.headers['x-filename'] || 'Order.csv';
            aSup.click();

            // 2. Download Financial CSV (always, even for supplier view - both go to Dropbox)
            if (!isSupplierView) {
                await new Promise(r => setTimeout(r, 800));
                const resFin = await axios.post(`${API_URL}/download`,
                    { rows: workingOrders, skipHistory: true, type: 'financial' },
                    { responseType: 'blob' }
                );
                const urlFin = window.URL.createObjectURL(new Blob([resFin.data], { type: 'text/csv' }));
                const aFin = document.createElement('a');
                aFin.href = urlFin;
                aFin.download = resFin.headers['x-filename'] || 'Order - Financial report.csv';
                aFin.click();
            }

            // 3. Upload BOTH CSVs to Dropbox (always both, even for supplier)
            setLoading('Saving to Dropbox...');
            await axios.post(`${API_URL}/dropbox/upload`, { orders: workingOrders });

            setLoading(false);
            setStep(5);
        } catch (e) {
            setError(`Download failed: ${e.response?.data?.error || e.message}`);
            setLoading(false);
        }
    };

    const fetchWallet = async () => {
        setWalletLoading(true);
        try {
            const res = await axios.get(`${API_URL}/wallet/balance`);
            setWalletBalance(res.data.balance || 0);
        } catch (e) {
            setWalletBalance(0);
        } finally {
            setWalletLoading(false);
        }
    };

    useEffect(() => {
        if (step === 5 && walletBalance === null) fetchWallet();
    }, [step]);

    const handleBulkShip = async () => {
        setLoading('Shipping orders via RapidShyp...');
        setError(null);
        try {
            const res = await axios.post(`${API_URL}/fulfillment/bulk-ship`, { orders: workingOrders });
            setShipResult(res.data);
            setLoading(false);
        } catch (e) {
            setError(`Shipping failed: ${e.response?.data?.error || e.message}`);
            setLoading(false);
        }
    };

    const handleBulkLabels = async () => {
        setLoading('Generating labels...');
        setError(null);
        try {
            const shipmentIds = (shipResult?.results || []).map(r => r.shipmentId).filter(Boolean);
            if (shipmentIds.length === 0) {
                // Try using label URLs from ship result directly
                const labelUrls = (shipResult?.results || []).map(r => r.labelURL).filter(Boolean);
                if (labelUrls.length > 0) {
                    setLabelResult({ labelUrls, dropboxPath: 'Already saved during shipping' });
                    setLoading(false);
                    return;
                }
                setError('No shipment IDs available for label generation');
                setLoading(false);
                return;
            }

            const res = await axios.post(`${API_URL}/fulfillment/bulk-labels`, {
                shipmentIds,
                orders: workingOrders
            });

            setLabelResult(res.data);
            setLoading(false);
        } catch (e) {
            setError(`Labels failed: ${e.response?.data?.error || e.message}`);
            setLoading(false);
        }
    };

    useEffect(() => {
        if (step === 6 && !labelResult && shipResult) handleBulkLabels();
    }, [step]);

    const handleFinish = () => {
        if (onComplete) onComplete({ orders: workingOrders, shipResult, labelResult });
        onClose();
    };

    const openWhatsApp = (phone, name, message) => {
        if (!phone) return;
        const clean = phone.replace(/\D/g, '');
        window.open(`https://wa.me/${clean}?text=${encodeURIComponent(message)}`, '_blank');
    };

    const rechargeMessage = `Hey! Need a wallet recharge for today's order batch.\n\nCSV: Today's Order (${uniqueOrderCount} orders)\nEstimated shipping: ₹${estimatedShipping}\nCurrent balance: ₹${walletBalance || 0}\nPlease recharge: ₹${Math.max(0, estimatedShipping - (walletBalance || 0)) + 500}\n\nThanks!`;

    // Render step content
    const renderStep = () => {
        switch (step) {
            case 1: return renderRTOSort();
            case 2: return renderMissingDevices();
            case 3: return renderFinalCheck();
            case 4: return renderDownload();
            case 5: return renderBulkShip();
            case 6: return renderLabels();
            case 7: return renderFinished();
            default: return null;
        }
    };

    // ─── STEP 1: RTO Sort ───
    const renderRTOSort = () => (
        <div className="wiz-step-content">
            <div className="wiz-step-header">
                <h3 className="wiz-step-title">let's check for sus orders</h3>
                <p className="wiz-step-desc">
                    {highRiskOrders.length > 0
                        ? `found ${highRiskOrders.length} suspicious order${highRiskOrders.length > 1 ? 's' : ''} flagged by our AI model`
                        : "all clear! no suspicious orders detected"}
                </p>
            </div>

            {highRiskOrders.length === 0 ? (
                <div className="wiz-empty-state">
                    <CheckCircle size={48} className="text-emerald-400" />
                    <p>every order looks good to go</p>
                </div>
            ) : (
                <div className="wiz-list">
                    {highRiskOrders.map(group => {
                        const isOpen = expandedIds.has(group.orderId);
                        return (
                            <div key={group.orderId} className="wiz-order-card">
                                <div className="wiz-order-header" onClick={() => toggleExpand(group.orderId)}>
                                    <div className="wiz-order-left">
                                        <span className="wiz-order-id">{group.orderId}</span>
                                        <span className="wiz-order-name">{group.customerName}</span>
                                        <span className="wiz-badge wiz-badge-danger">HIGH RISK</span>
                                        {group.rtoModelScore && (
                                            <span className="wiz-badge wiz-badge-score">
                                                AI: {(group.rtoModelScore * 100).toFixed(0)}%
                                            </span>
                                        )}
                                    </div>
                                    <div className="wiz-order-right">
                                        {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                    </div>
                                </div>

                                {/* Risk Reasons */}
                                <div className="wiz-risk-reasons">
                                    {(group.rtoModelReasons || group.rtoReason?.split('; ') || ['High risk detected']).map((reason, i) => (
                                        <span key={i} className="wiz-reason-tag">
                                            <AlertTriangle size={10} /> {reason}
                                        </span>
                                    ))}
                                </div>

                                <AnimatePresence>
                                    {isOpen && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="wiz-order-details"
                                        >
                                            {/* Address & Contact */}
                                            <div className="wiz-detail-grid">
                                                <div className="wiz-detail-item">
                                                    <span className="wiz-detail-label">Address</span>
                                                    <span className="wiz-detail-value">
                                                        {group.shippingDetails?.address1 || 'N/A'}
                                                        {group.shippingDetails?.address2 ? `, ${group.shippingDetails.address2}` : ''}
                                                        <br />{group.shippingDetails?.city}, {group.shippingDetails?.province} - {group.shippingDetails?.zip}
                                                    </span>
                                                </div>
                                                <div className="wiz-detail-item">
                                                    <span className="wiz-detail-label">Phone</span>
                                                    <span className="wiz-detail-value">{group.shippingDetails?.phone || 'N/A'}</span>
                                                </div>
                                                <div className="wiz-detail-item">
                                                    <span className="wiz-detail-label">Email</span>
                                                    <span className="wiz-detail-value">{group.email || 'N/A'}</span>
                                                </div>
                                                <div className="wiz-detail-item">
                                                    <span className="wiz-detail-label">Payment</span>
                                                    <span className="wiz-detail-value">{group.payment || 'Prepaid'}</span>
                                                </div>
                                            </div>

                                            {/* Line Items */}
                                            <div className="wiz-items-list">
                                                {group.items.map((item, idx) => (
                                                    <div key={idx} className="wiz-item-row">
                                                        {item.thumbnail && <img src={item.thumbnail} className="wiz-item-thumb" />}
                                                        <div className="wiz-item-info">
                                                            <span className="wiz-item-cat">{item.category}</span>
                                                            <span className="wiz-item-model">{item.model || 'No model'} • {item.sku}</span>
                                                        </div>
                                                        <span className="wiz-item-price">₹{item.cogs || 0}</span>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Actions */}
                                            <div className="wiz-detail-actions">
                                                {group.shippingDetails?.phone && (
                                                    <>
                                                        <a href={`tel:${group.shippingDetails.phone}`} className="wiz-action-btn wiz-action-call">
                                                            <Phone size={14} /> Call
                                                        </a>
                                                        <button onClick={() => openWhatsApp(group.shippingDetails.phone, group.customerName, `Hi ${group.customerName}, this is GRLHOOD! We're verifying your order details. Could you please confirm your delivery address? Thanks!`)} className="wiz-action-btn wiz-action-wa">
                                                            <MessageSquare size={14} /> WhatsApp
                                                        </button>
                                                    </>
                                                )}
                                                <button onClick={() => cancelOrder(group.items[0])} className="wiz-action-btn wiz-action-cancel">
                                                    <XOctagon size={14} /> Cancel Order
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="wiz-step-footer">
                <button onClick={() => setStep(2)} className="wiz-btn-next">
                    {highRiskOrders.length > 0 ? 'looks fine, continue' : 'nice, next step'}
                    <ArrowRight size={16} />
                </button>
            </div>
        </div>
    );

    // ─── STEP 2: Missing Devices ───
    const renderMissingDevices = () => (
        <div className="wiz-step-content">
            <div className="wiz-step-header">
                <h3 className="wiz-step-title">any missing phone models?</h3>
                <p className="wiz-step-desc">
                    {missingDeviceUnits.length > 0
                        ? `${missingDeviceUnits.length} unit${missingDeviceUnits.length > 1 ? 's' : ''} missing device model`
                        : "all models are filled in, nice!"}
                </p>
            </div>

            {missingDeviceUnits.length === 0 ? (
                <div className="wiz-empty-state">
                    <Smartphone size={48} className="text-emerald-400" />
                    <p>every unit has a device model</p>
                </div>
            ) : (
                <div className="wiz-list">
                    {missingDeviceUnits.map((unit, idx) => {
                        const globalIdx = workingOrders.findIndex(o => o === unit);
                        return (
                            <div key={`${unit.orderId}_${unit.sku}_${idx}`} className="wiz-unit-card">
                                <div className="wiz-unit-top">
                                    <div className="wiz-unit-info">
                                        <span className="wiz-order-id">{unit.orderId}</span>
                                        <span className="wiz-order-name">{unit.customerName}</span>
                                    </div>
                                    <span className="wiz-badge wiz-badge-warn">MISSING MODEL</span>
                                </div>

                                <div className="wiz-unit-category">{unit.category}</div>

                                <div className="wiz-unit-model-input">
                                    <Edit3 size={14} className="wiz-input-icon" />
                                    <input
                                        type="text"
                                        value={unit.model === 'Unknown Model' ? '' : unit.model}
                                        onChange={(e) => updateModel(globalIdx, e.target.value)}
                                        placeholder="Enter phone model..."
                                        className="wiz-model-input"
                                    />
                                    <div className="wiz-input-ping" />
                                </div>

                                <div className="wiz-unit-actions">
                                    {unit.shippingDetails?.phone && (
                                        <>
                                            <a href={`tel:${unit.shippingDetails.phone}`} className="wiz-action-btn wiz-action-call">
                                                <Phone size={14} />
                                            </a>
                                            <button onClick={() => openWhatsApp(
                                                unit.shippingDetails.phone,
                                                unit.customerName,
                                                `Hi ${unit.customerName}, this is GRLHOOD! 🌸\n\nWe noticed you forgot to mention your Phone Model in your recent order. Could you please share it so we can dispatch your order soon? 📱✨`
                                            )} className="wiz-action-btn wiz-action-wa">
                                                <MessageSquare size={14} />
                                            </button>
                                        </>
                                    )}
                                    <button onClick={() => cancelOrder(unit)} className="wiz-action-btn wiz-action-cancel">
                                        <XOctagon size={14} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="wiz-step-footer">
                <button onClick={() => setStep(1)} className="wiz-btn-back">Back</button>
                <button onClick={() => setStep(3)} className="wiz-btn-next">
                    next step <ArrowRight size={16} />
                </button>
            </div>
        </div>
    );

    // ─── STEP 3: Final Check ───
    const renderFinalCheck = () => (
        <div className="wiz-step-content">
            <div className="wiz-step-header">
                <h3 className="wiz-step-title">final look before we send it</h3>
                <p className="wiz-step-desc">{workingOrders.length} units across {uniqueOrderCount} orders • ₹{totalCogs.toFixed(0)} total COGS</p>
            </div>

            <div className="wiz-csv-table-wrap">
                <table className="wiz-csv-table">
                    <thead>
                        <tr>
                            <th></th>
                            <th>Order</th>
                            <th>Customer</th>
                            <th>Category</th>
                            <th>Model</th>
                            <th>SKU</th>
                        </tr>
                    </thead>
                    <tbody>
                        {workingOrders.map((row, idx) => (
                            <tr key={`${row.orderId}_${idx}`}>
                                <td>
                                    <button onClick={() => deleteRow(idx)} className="wiz-delete-btn">
                                        <Trash2 size={14} />
                                    </button>
                                </td>
                                <td className="wiz-cell-id">{row.orderId}</td>
                                <td className="wiz-cell-name">{row.customerName}</td>
                                <td>{row.category}</td>
                                <td>
                                    <input
                                        type="text"
                                        value={row.model === 'Unknown Model' ? '' : row.model}
                                        onChange={(e) => updateModel(idx, e.target.value)}
                                        className="wiz-inline-input"
                                        placeholder="model..."
                                    />
                                </td>
                                <td className="wiz-cell-sku">{row.sku}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="wiz-step-footer">
                <button onClick={() => setStep(2)} className="wiz-btn-back">Back</button>
                <button onClick={() => { setStep(4); handleDownloadCSVs(); }} className="wiz-btn-next wiz-btn-confirm">
                    looks good, let's go <ArrowRight size={16} />
                </button>
            </div>
        </div>
    );

    // ─── STEP 4: Download CSV ───
    const renderDownload = () => (
        <div className="wiz-step-content wiz-step-centered">
            <div className="wiz-step-header">
                <h3 className="wiz-step-title">downloading your files</h3>
            </div>

            {loading ? (
                <div className="wiz-loading-state">
                    <RefreshCw size={40} className="wiz-spin" />
                    <p>{typeof loading === 'string' ? loading : 'Processing...'}</p>
                </div>
            ) : error ? (
                <div className="wiz-error-state">
                    <AlertTriangle size={40} />
                    <p>{error}</p>
                    <button onClick={handleDownloadCSVs} className="wiz-btn-retry">Try Again</button>
                </div>
            ) : (
                <div className="wiz-success-mini">
                    <CheckCircle size={40} className="text-emerald-400" />
                    <p>CSVs downloaded & saved to Dropbox</p>
                </div>
            )}

            <div className="wiz-step-footer">
                {!loading && (
                    <button onClick={() => setStep(5)} className="wiz-btn-next">
                        next: ship orders <ArrowRight size={16} />
                    </button>
                )}
            </div>
        </div>
    );

    // ─── STEP 5: Bulk Ship ───
    const renderBulkShip = () => (
        <div className="wiz-step-content">
            <div className="wiz-step-header">
                <h3 className="wiz-step-title">time to ship these babies</h3>
                <p className="wiz-step-desc">shipping via RapidShyp</p>
            </div>

            {/* Cost Estimate */}
            <div className="wiz-ship-stats">
                <div className="wiz-stat-card">
                    <span className="wiz-stat-label">Orders</span>
                    <span className="wiz-stat-value">{uniqueOrderCount}</span>
                </div>
                <div className="wiz-stat-card">
                    <span className="wiz-stat-label">× ₹{SHIPPING_COST_PER_ORDER}</span>
                    <span className="wiz-stat-value">=</span>
                </div>
                <div className="wiz-stat-card wiz-stat-highlight">
                    <span className="wiz-stat-label">Est. Cost</span>
                    <span className="wiz-stat-value">₹{estimatedShipping}</span>
                </div>
            </div>

            {/* Wallet */}
            <div className="wiz-wallet-card">
                <div className="wiz-wallet-row">
                    <span className="wiz-wallet-label"><Wallet size={16} /> Wallet Balance</span>
                    <span className="wiz-wallet-value">
                        {walletLoading ? <RefreshCw size={14} className="wiz-spin" /> : `₹${walletBalance ?? '...'}`}
                    </span>
                </div>
                {walletBalance !== null && walletBalance < estimatedShipping && (
                    <div className="wiz-wallet-shortage">
                        Need ₹{Math.ceil(estimatedShipping - walletBalance)} more
                    </div>
                )}
                <div className="wiz-wallet-actions">
                    <button onClick={fetchWallet} className="wiz-action-btn wiz-action-refresh" disabled={walletLoading}>
                        <RefreshCw size={14} /> Refresh
                    </button>
                    <button onClick={() => openWhatsApp(OWNER_PHONE, 'Admin', rechargeMessage)} className="wiz-action-btn wiz-action-wa">
                        <MessageSquare size={14} /> Ask to Recharge
                    </button>
                </div>
            </div>

            {/* Ship Result */}
            {shipResult && (
                <div className="wiz-ship-result">
                    <div className="wiz-result-row wiz-result-success">
                        <CheckCircle size={16} /> {shipResult.assigned} shipped successfully
                    </div>
                    {shipResult.failed > 0 && (
                        <div className="wiz-result-row wiz-result-fail">
                            <AlertTriangle size={16} /> {shipResult.failed} failed
                        </div>
                    )}
                </div>
            )}

            {error && (
                <div className="wiz-error-inline">
                    <AlertTriangle size={14} /> {error}
                </div>
            )}

            <div className="wiz-step-footer">
                <button onClick={() => setStep(4)} className="wiz-btn-back">Back</button>
                {!shipResult ? (
                    <button onClick={handleBulkShip} disabled={!!loading} className="wiz-btn-next wiz-btn-confirm">
                        {loading ? <><RefreshCw size={16} className="wiz-spin" /> Shipping...</> : <>Confirm & Ship <Truck size={16} /></>}
                    </button>
                ) : (
                    <button onClick={() => setStep(6)} className="wiz-btn-next">
                        get labels <ArrowRight size={16} />
                    </button>
                )}
            </div>
        </div>
    );

    // ─── STEP 6: Download Labels ───
    const renderLabels = () => (
        <div className="wiz-step-content wiz-step-centered">
            <div className="wiz-step-header">
                <h3 className="wiz-step-title">grabbing your labels</h3>
            </div>

            {loading ? (
                <div className="wiz-loading-state">
                    <FileText size={40} className="wiz-bounce" />
                    <p>{typeof loading === 'string' ? loading : 'Generating labels...'}</p>
                </div>
            ) : error ? (
                <div className="wiz-error-state">
                    <AlertTriangle size={40} />
                    <p>{error}</p>
                    <button onClick={handleBulkLabels} className="wiz-btn-retry">Try Again</button>
                </div>
            ) : labelResult ? (
                <div className="wiz-labels-done">
                    <CheckCircle size={48} className="text-emerald-400" />
                    <p className="wiz-labels-count">{labelResult.labelCount || labelResult.labelUrls?.length || 0} labels generated</p>

                    {labelResult.labelUrls?.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noreferrer" className="wiz-label-download">
                            <Download size={16} /> Download Label PDF {labelResult.labelUrls.length > 1 ? `#${i + 1}` : ''}
                        </a>
                    ))}

                    {/* Individual label URLs from ship result */}
                    {!labelResult.labelUrls?.length && shipResult?.results?.map((r, i) => (
                        r.labelURL && (
                            <a key={i} href={r.labelURL} target="_blank" rel="noreferrer" className="wiz-label-download">
                                <Download size={16} /> {r.orderId} Label
                            </a>
                        )
                    ))}

                    {labelResult.dropboxPath && (
                        <p className="wiz-dropbox-path">Saved to Dropbox: {labelResult.dropboxPath}</p>
                    )}
                </div>
            ) : null}

            <div className="wiz-step-footer">
                {!loading && (
                    <button onClick={() => setStep(7)} className="wiz-btn-next wiz-btn-finish">
                        finish up <Sparkles size={16} />
                    </button>
                )}
            </div>
        </div>
    );

    // ─── STEP 7: Finished ───
    const renderFinished = () => (
        <div className="wiz-step-content wiz-step-centered">
            <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', damping: 12, stiffness: 200 }}
                className="wiz-done-icon"
            >
                <Sparkles size={56} />
            </motion.div>

            <motion.h3
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="wiz-done-title"
            >
                you're all done!
            </motion.h3>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="wiz-done-summary"
            >
                <div className="wiz-done-stat">
                    <Package size={20} />
                    <span>{uniqueOrderCount} orders processed</span>
                </div>
                {shipResult && (
                    <div className="wiz-done-stat">
                        <Truck size={20} />
                        <span>{shipResult.assigned} shipped</span>
                    </div>
                )}
                {labelResult && (
                    <div className="wiz-done-stat">
                        <FileText size={20} />
                        <span>Labels downloaded & saved</span>
                    </div>
                )}
                <div className="wiz-done-stat">
                    <CheckCircle size={20} />
                    <span>Dropbox backup complete</span>
                </div>
            </motion.div>

            <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                onClick={handleFinish}
                className="wiz-btn-close"
            >
                Close
            </motion.button>
        </div>
    );

    // ─── Main Render ───
    return (
        <div className="wiz-overlay">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="wiz-backdrop"
                onClick={onClose}
            />

            <motion.div
                initial={{ scale: 0.92, y: 40, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.92, y: 40, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="wiz-container"
            >
                {/* Close button */}
                <button onClick={onClose} className="wiz-close-btn">
                    <X size={20} />
                </button>

                {/* Step Indicator */}
                <div className="wiz-stepper">
                    {STEP_LABELS.map(({ num, label, icon: Icon }) => (
                        <div
                            key={num}
                            className={`wiz-step-dot ${num === step ? 'wiz-step-active' : ''} ${num < step ? 'wiz-step-done' : ''}`}
                            onClick={() => num < step && setStep(num)}
                        >
                            <div className="wiz-dot-circle">
                                {num < step ? <CheckCircle size={14} /> : <Icon size={14} />}
                            </div>
                            <span className="wiz-dot-label">{label}</span>
                        </div>
                    ))}
                </div>

                {/* Loading overlay */}
                {typeof loading === 'string' && loading && step !== 4 && step !== 5 && step !== 6 && (
                    <div className="wiz-loading-overlay">
                        <RefreshCw size={24} className="wiz-spin" />
                        <span>{loading}</span>
                    </div>
                )}

                {/* Step Content */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={step}
                        initial={{ opacity: 0, x: 30 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -30 }}
                        transition={{ duration: 0.25 }}
                        className="wiz-step-body"
                    >
                        {renderStep()}
                    </motion.div>
                </AnimatePresence>
            </motion.div>
        </div>
    );
}
