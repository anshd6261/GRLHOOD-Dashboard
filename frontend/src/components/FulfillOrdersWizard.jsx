import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, ShieldCheck, Smartphone, ClipboardCheck, Download, Truck,
  FileText, CheckCircle, AlertTriangle, ChevronDown, ChevronUp,
  Phone, MessageSquare, Trash2, RefreshCw, ArrowRight, ArrowLeft,
  Wallet, Zap, Package, Edit3, ExternalLink
} from 'lucide-react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '';
const API_URL = API_BASE ? `${API_BASE}/api` : '/api';

const STEPS = [
  { id: 'RTO_SORT', label: 'RTO Sort', icon: ShieldCheck, desc: 'Review high-risk orders' },
  { id: 'MISSING_DEVICES', label: 'Missing Devices', icon: Smartphone, desc: 'Fix missing device models' },
  { id: 'FINAL_CHECK', label: 'Final Check', icon: ClipboardCheck, desc: 'Review & edit CSV' },
  { id: 'DOWNLOAD', label: 'Download', icon: Download, desc: 'Save CSV files' },
  { id: 'BULK_SHIP', label: 'Bulk Ship', icon: Truck, desc: 'Ship via RapidShyp' },
  { id: 'LABELS', label: 'Labels', icon: FileText, desc: 'Download shipping labels' },
  { id: 'DONE', label: 'Done!', icon: CheckCircle, desc: 'All done!' },
];

function RiskBadge({ level }) {
  const config = {
    High: { bg: 'rgba(255,20,147,0.12)', border: 'rgba(255,20,147,0.3)', text: '#ff1493', glow: 'rgba(255,20,147,0.4)' },
    Medium: { bg: 'rgba(227,207,216,0.1)', border: 'rgba(227,207,216,0.2)', text: '#e3cfd8', glow: 'rgba(227,207,216,0.2)' },
    Low: { bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.25)', text: '#34d399', glow: 'rgba(52,211,153,0.2)' },
  };
  const c = config[level] || config.Medium;
  return (
    <span className="text-[9px] uppercase font-black px-2 py-0.5 rounded-full tracking-wider"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text, filter: `drop-shadow(0 0 6px ${c.glow})` }}>
      {level}
    </span>
  );
}

function StepProgressBar({ currentStep, completedSteps, onStepClick }) {
  return (
    <div className="flex items-center gap-1 px-4 py-3 overflow-x-auto">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const isActive = i === currentStep;
        const isCompleted = completedSteps.has(i);
        const isClickable = isCompleted || i <= currentStep;
        return (
          <React.Fragment key={step.id}>
            {i > 0 && (
              <div className={`h-[1px] flex-1 min-w-[12px] transition-all duration-500 ${isCompleted || i <= currentStep ? 'bg-[rgba(227,207,216,0.3)]' : 'bg-[rgba(255,255,255,0.05)]'}`} />
            )}
            <button
              onClick={() => isClickable && onStepClick(i)}
              disabled={!isClickable}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-bold tracking-wider uppercase transition-all whitespace-nowrap ${
                isActive ? 'bg-[rgba(227,207,216,0.12)] text-[#e3cfd8] border border-[rgba(227,207,216,0.2)] shadow-[0_0_15px_rgba(227,207,216,0.1)]'
                : isCompleted ? 'text-emerald-400/70 hover:bg-[rgba(52,211,153,0.05)]'
                : 'text-[rgba(245,245,245,0.2)]'
              } ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
            >
              {isCompleted ? <CheckCircle size={12} className="text-emerald-400" /> : <Icon size={12} />}
              <span className="hidden sm:inline">{step.label}</span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// PLACEHOLDER — steps will be added below via Edit
export default function FulfillOrdersWizard({ orders, onClose, onOrdersUpdate, isSupplier }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(new Set());
  const [workingOrders, setWorkingOrders] = useState([]);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [cancellingId, setCancellingId] = useState(null);
  const [walletBalance, setWalletBalance] = useState(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [shipResults, setShipResults] = useState(null);
  const [shipLoading, setShipLoading] = useState(false);
  const [labelResult, setLabelResult] = useState(null);
  const [labelLoading, setLabelLoading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const enhanced = orders.map(o => {
      const storageKey = `model_override_${o.orderId}_${o.sku}`;
      const savedModel = localStorage.getItem(storageKey);
      return { ...o, model: savedModel || o.model || '' };
    });
    setWorkingOrders(enhanced);
  }, [orders]);

  const markComplete = (step) => setCompletedSteps(prev => new Set([...prev, step]));
  const goNext = () => { markComplete(currentStep); setCurrentStep(s => Math.min(s + 1, STEPS.length - 1)); };
  const goBack = () => setCurrentStep(s => Math.max(s - 1, 0));

  const toggleExpand = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleModelUpdate = (index, newModel) => {
    const updated = [...workingOrders];
    updated[index] = { ...updated[index], model: newModel };
    setWorkingOrders(updated);
    const o = updated[index];
    const storageKey = `model_override_${o.orderId}_${o.sku}`;
    if (newModel?.trim()) localStorage.setItem(storageKey, newModel);
    else localStorage.removeItem(storageKey);
  };

  const handleDeleteRow = (index) => {
    const updated = [...workingOrders];
    updated.splice(index, 1);
    setWorkingOrders(updated);
  };

  const handleCancelOrder = async (orderId) => {
    setCancellingId(orderId);
    try {
      await axios.post(`${API_URL}/orders/${orderId}/cancel`);
      setWorkingOrders(prev => prev.filter(o => o.orderId !== orderId));
      setToast({ message: `Order ${orderId} cancelled`, type: 'success' });
    } catch (e) {
      setToast({ message: `Cancel failed: ${e.response?.data?.error || e.message}`, type: 'error' });
    } finally {
      setCancellingId(null);
    }
  };

  // Group orders by orderId for steps that need order-level view
  const groupedOrders = useMemo(() => {
    const map = {};
    workingOrders.forEach(o => {
      if (!map[o.orderId]) map[o.orderId] = { orderId: o.orderId, customerName: o.customerName, shippingDetails: o.shippingDetails, aiRiskScore: o.aiRiskScore, aiRiskLevel: o.aiRiskLevel, aiRiskReasons: o.aiRiskReasons || [], items: [], createdAt: o.createdAt, awb: o.awb, shiprocketId: o.shiprocketId, customerOrdersCount: o.customerOrdersCount };
      map[o.orderId].items.push(o);
    });
    return Object.values(map);
  }, [workingOrders]);

  const highRiskOrders = useMemo(() => groupedOrders.filter(g => g.aiRiskLevel === 'High'), [groupedOrders]);
  const missingDeviceUnits = useMemo(() => workingOrders.map((o, i) => ({ ...o, _idx: i })).filter(o => !o.model || o.model.trim() === '' || o.model.toLowerCase() === 'unknown model'), [workingOrders]);
  const uniqueOrderIds = useMemo(() => [...new Set(workingOrders.map(o => o.orderId))], [workingOrders]);

  // ═══ STEP RENDERERS ═══

  const renderStep0_RTOSort = () => (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-xl font-black text-white tracking-tight mb-1">high risk orders</h2>
        <p className="text-xs text-[rgba(245,245,245,0.3)]">our AI flagged these — review before proceeding</p>
      </div>
      {highRiskOrders.length === 0 ? (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-12">
          <CheckCircle size={48} className="mx-auto text-emerald-400 mb-4" />
          <h3 className="text-lg font-bold text-white mb-1">all clear!</h3>
          <p className="text-xs text-[rgba(245,245,245,0.3)]">no high-risk orders found. you're good to go.</p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          <div className="glass-card-sm p-3 flex items-center gap-2 border-l-2 border-[#ff1493]">
            <AlertTriangle size={14} className="text-[#ff1493]" />
            <span className="text-xs font-bold text-[rgba(245,245,245,0.5)]">{highRiskOrders.length} order{highRiskOrders.length > 1 ? 's' : ''} flagged as HIGH risk</span>
          </div>
          {highRiskOrders.map(group => {
            const isExpanded = expandedIds.has(group.orderId);
            return (
              <motion.div key={group.orderId} layout className="glass-card-sm overflow-hidden">
                <div className="p-4 flex items-center justify-between cursor-pointer" onClick={() => toggleExpand(group.orderId)}>
                  <div className="flex items-center gap-3">
                    <div className="text-2xl font-black text-[#ff1493]">{group.aiRiskScore}</div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">#{group.orderId}</span>
                        <RiskBadge level="High" />
                      </div>
                      <div className="text-[10px] text-[rgba(245,245,245,0.3)]">{group.customerName} • {group.items.length} item{group.items.length > 1 ? 's' : ''}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); handleCancelOrder(group.orderId); }}
                      disabled={cancellingId === group.orderId}
                      className="glass-btn px-3 py-1.5 rounded-lg text-[10px] font-bold text-[#ff1493] hover:bg-[rgba(255,20,147,0.1)] flex items-center gap-1">
                      {cancellingId === group.orderId ? <RefreshCw size={10} className="animate-spin" /> : <Trash2 size={10} />} Cancel
                    </button>
                    {isExpanded ? <ChevronUp size={14} className="text-[rgba(245,245,245,0.3)]" /> : <ChevronDown size={14} className="text-[rgba(245,245,245,0.3)]" />}
                  </div>
                </div>
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="px-4 pb-4 space-y-2 border-t border-[rgba(255,255,255,0.04)]">
                        <div className="grid grid-cols-2 gap-2 pt-3 text-[10px]">
                          <div><span className="text-[rgba(245,245,245,0.25)]">Address:</span> <span className="text-[rgba(245,245,245,0.5)]">{group.shippingDetails?.address1}, {group.shippingDetails?.city} {group.shippingDetails?.zip}</span></div>
                          <div><span className="text-[rgba(245,245,245,0.25)]">Phone:</span> <span className="text-[rgba(245,245,245,0.5)]">{group.shippingDetails?.phone}</span></div>
                        </div>
                        <div className="text-[10px] text-[rgba(245,245,245,0.25)]">
                          <span className="font-bold text-[rgba(245,245,245,0.4)]">Risk reasons:</span>{' '}
                          {group.aiRiskReasons.join(' • ') || 'Multiple risk signals'}
                        </div>
                        <div className="flex flex-wrap gap-1 pt-1">
                          {group.items.map((item, i) => (
                            <span key={i} className="glass-pill text-[9px] px-2 py-0.5">{item.category} — {item.model || 'No model'}</span>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderStep1_MissingDevices = () => (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-xl font-black text-white tracking-tight mb-1">missing devices</h2>
        <p className="text-xs text-[rgba(245,245,245,0.3)]">these units don't have a device model — fix or call the customer</p>
      </div>
      {missingDeviceUnits.length === 0 ? (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-12">
          <CheckCircle size={48} className="mx-auto text-emerald-400 mb-4" />
          <h3 className="text-lg font-bold text-white mb-1">all devices present!</h3>
          <p className="text-xs text-[rgba(245,245,245,0.3)]">every unit has a model. nice.</p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          <div className="glass-card-sm p-3 flex items-center gap-2 border-l-2 border-amber-400">
            <Smartphone size={14} className="text-amber-400" />
            <span className="text-xs font-bold text-[rgba(245,245,245,0.5)]">{missingDeviceUnits.length} unit{missingDeviceUnits.length > 1 ? 's' : ''} missing device model</span>
          </div>
          {missingDeviceUnits.map(unit => {
            const phone = unit.shippingDetails?.phone || '';
            const cleanPhone = phone.replace(/\D/g, '').slice(-10);
            return (
              <motion.div key={`${unit.orderId}-${unit.sku}-${unit._idx}`} layout className="glass-card-sm p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {unit.thumbnail && <img src={unit.thumbnail} alt="" className="w-10 h-10 rounded-lg object-cover border border-[rgba(255,255,255,0.06)]" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-white">#{unit.orderId}</span>
                        <span className="text-[9px] text-[rgba(245,245,245,0.25)]">{unit.category}</span>
                      </div>
                      <div className="text-[10px] text-[rgba(245,245,245,0.3)]">{unit.customerName}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {cleanPhone && (
                      <>
                        <a href={`tel:+91${cleanPhone}`} className="glass-btn p-1.5 rounded-lg" title="Call customer">
                          <Phone size={12} className="text-[#e3cfd8]" />
                        </a>
                        <a href={`https://wa.me/91${cleanPhone}?text=${encodeURIComponent(`Hi ${unit.customerName}! 👋 We're processing your order #${unit.orderId} but need your phone model to proceed. Could you please share your device name? (e.g., iPhone 15 Pro Max, Samsung S24 Ultra) Thanks! 🙏`)}`}
                          target="_blank" rel="noopener noreferrer" className="glass-btn p-1.5 rounded-lg" title="WhatsApp">
                          <MessageSquare size={12} className="text-emerald-400" />
                        </a>
                      </>
                    )}
                    <button onClick={() => handleCancelOrder(unit.orderId)}
                      disabled={cancellingId === unit.orderId}
                      className="glass-btn p-1.5 rounded-lg text-[#ff1493] hover:bg-[rgba(255,20,147,0.1)]" title="Cancel order">
                      {cancellingId === unit.orderId ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    </button>
                  </div>
                </div>
                <div className="mt-3">
                  <input
                    type="text"
                    placeholder="Enter device model (e.g., iPhone 15 Pro Max)"
                    value={workingOrders[unit._idx]?.model || ''}
                    onChange={(e) => handleModelUpdate(unit._idx, e.target.value)}
                    className="glass-input w-full text-xs px-3 py-2 rounded-lg"
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderStep2_FinalCheck = () => (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-xl font-black text-white tracking-tight mb-1">final check</h2>
        <p className="text-xs text-[rgba(245,245,245,0.3)]">review the CSV before downloading — edit models or remove rows</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[rgba(255,255,255,0.06)]">
              {['#', 'Category', 'Model', 'SKU', 'Customer', 'Order ID', ''].map(h => (
                <th key={h} className="text-[9px] font-bold text-[rgba(245,245,245,0.25)] uppercase tracking-wider px-3 py-2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {workingOrders.map((row, i) => (
              <tr key={i} className="border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(227,207,216,0.03)] transition-colors">
                <td className="text-[10px] text-[rgba(245,245,245,0.2)] px-3 py-2">{i + 1}</td>
                <td className="text-[10px] text-[rgba(245,245,245,0.5)] px-3 py-2 font-medium">{row.category}</td>
                <td className="px-3 py-1.5">
                  <input type="text" value={row.model || ''} onChange={(e) => handleModelUpdate(i, e.target.value)}
                    className="glass-input text-[10px] px-2 py-1 rounded-md w-full min-w-[140px]"
                    placeholder="Enter model" />
                </td>
                <td className="text-[10px] text-[rgba(245,245,245,0.3)] px-3 py-2">{row.sku}</td>
                <td className="text-[10px] text-[rgba(245,245,245,0.5)] px-3 py-2">{row.customerName}</td>
                <td className="text-[10px] text-white font-bold px-3 py-2">{row.orderId}</td>
                <td className="px-3 py-2">
                  <button onClick={() => handleDeleteRow(i)} className="text-[rgba(245,245,245,0.15)] hover:text-[#ff1493] transition-colors">
                    <Trash2 size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between pt-4 text-[10px] text-[rgba(245,245,245,0.3)]">
        <span>{workingOrders.length} units across {uniqueOrderIds.length} orders</span>
        <span>missing models: {workingOrders.filter(o => !o.model?.trim() || o.model.toLowerCase() === 'unknown model').length}</span>
      </div>
    </div>
  );

  const handleDownloadCSV = async () => {
    setDownloadStatus('downloading');
    try {
      // Download supplier CSV
      const resSup = await axios.post(`${API_URL}/download`, { rows: workingOrders, skipHistory: true, type: 'supplier' }, { responseType: 'blob' });
      const urlSup = window.URL.createObjectURL(new Blob([resSup.data], { type: 'text/csv' }));
      const aSup = document.createElement('a'); aSup.href = urlSup;
      aSup.download = resSup.headers['x-filename'] || 'Order.csv'; aSup.click();

      // Download financial CSV (admin only)
      if (!isSupplier) {
        await new Promise(r => setTimeout(r, 800));
        const resFin = await axios.post(`${API_URL}/download`, { rows: workingOrders, skipHistory: true, type: 'financial' }, { responseType: 'blob' });
        const urlFin = window.URL.createObjectURL(new Blob([resFin.data], { type: 'text/csv' }));
        const aFin = document.createElement('a'); aFin.href = urlFin;
        aFin.download = resFin.headers['x-filename'] || 'Financial Order.csv'; aFin.click();
      }

      // Upload both CSVs to Dropbox
      setDownloadStatus('uploading');
      try {
        await axios.post(`${API_URL}/upload-portal`, { rows: workingOrders });
      } catch (dbxErr) {
        console.warn('Dropbox upload failed (non-blocking):', dbxErr.message);
      }

      setDownloadStatus('done');
      setToast({ message: 'CSVs downloaded & uploaded to Dropbox!', type: 'success' });
    } catch (e) {
      setDownloadStatus('error');
      setToast({ message: `Download failed: ${e.message}`, type: 'error' });
    }
  };

  const renderStep3_Download = () => (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-xl font-black text-white tracking-tight mb-1">download order</h2>
        <p className="text-xs text-[rgba(245,245,245,0.3)]">grab your CSVs and we'll back them up to Dropbox too</p>
      </div>
      <div className="glass-card-sm p-6 text-center space-y-4">
        <div className="flex justify-center gap-8 text-center">
          <div>
            <div className="text-3xl font-black text-white">{uniqueOrderIds.length}</div>
            <div className="text-[10px] text-[rgba(245,245,245,0.25)] uppercase tracking-wider">orders</div>
          </div>
          <div>
            <div className="text-3xl font-black text-white">{workingOrders.length}</div>
            <div className="text-[10px] text-[rgba(245,245,245,0.25)] uppercase tracking-wider">units</div>
          </div>
        </div>
        {downloadStatus === 'done' ? (
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="space-y-2">
            <CheckCircle size={32} className="mx-auto text-emerald-400" />
            <p className="text-xs font-bold text-emerald-400">downloaded & backed up!</p>
          </motion.div>
        ) : (
          <button onClick={handleDownloadCSV} disabled={downloadStatus === 'downloading' || downloadStatus === 'uploading'}
            className="glass-btn-accent px-8 py-3 rounded-xl text-sm font-bold flex items-center gap-2 mx-auto">
            {downloadStatus === 'downloading' ? <><RefreshCw size={14} className="animate-spin" /> Downloading...</> :
             downloadStatus === 'uploading' ? <><RefreshCw size={14} className="animate-spin" /> Uploading to Dropbox...</> :
             <><Download size={14} /> Download CSV{!isSupplier ? 's' : ''}</>}
          </button>
        )}
        <div className="text-[9px] text-[rgba(245,245,245,0.2)]">
          {isSupplier ? 'supplier CSV' : 'supplier + financial CSV'} • auto-upload to Dropbox
        </div>
      </div>
    </div>
  );

  const fetchWalletBalance = async () => {
    setWalletLoading(true);
    try {
      const res = await axios.get(`${API_URL}/rapidshyp/wallet`);
      setWalletBalance(res.data?.balance ?? 0);
    } catch { setWalletBalance(0); }
    finally { setWalletLoading(false); }
  };

  useEffect(() => { if (currentStep === 4 && walletBalance === null) fetchWalletBalance(); }, [currentStep]);

  const handleBulkShip = async () => {
    setShipLoading(true);
    try {
      const res = await axios.post(`${API_URL}/rapidshyp/bulk-assign`, { orderNames: uniqueOrderIds });
      setShipResults(res.data);
      const successCount = res.data?.results?.filter(r => r.success).length || 0;
      setToast({ message: `${successCount}/${uniqueOrderIds.length} orders shipped!`, type: 'success' });
    } catch (e) {
      setToast({ message: `Shipping failed: ${e.response?.data?.error || e.message}`, type: 'error' });
    } finally { setShipLoading(false); }
  };

  const estimatedCost = uniqueOrderIds.length * 85;
  const rechargeNeeded = Math.max(0, estimatedCost - (walletBalance || 0) + 500);
  const whatsappRechargeMsg = encodeURIComponent(`Hey! 👋 We need a wallet recharge for RapidShyp.\n\n📦 Today's Order (${uniqueOrderIds.length} orders)\n💰 Estimated Shipping: ₹${estimatedCost}\n🔄 Current Balance: ₹${walletBalance || 0}\n💳 Please recharge: ₹${rechargeNeeded}\n\nThanks! 🙏`);

  const renderStep4_BulkShip = () => (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-xl font-black text-white tracking-tight mb-1">bulk ship</h2>
        <p className="text-xs text-[rgba(245,245,245,0.3)]">assign AWBs via RapidShyp for all orders</p>
      </div>
      <div className="glass-card-sm p-6 space-y-5">
        <div className="flex justify-between items-center">
          <div className="text-xs text-[rgba(245,245,245,0.4)]">Estimated cost</div>
          <div className="text-lg font-black text-white">{uniqueOrderIds.length} × ₹85 = <span className="text-[#e3cfd8]">₹{estimatedCost}</span></div>
        </div>
        <div className="flex justify-between items-center">
          <div className="text-xs text-[rgba(245,245,245,0.4)] flex items-center gap-2">
            Wallet balance
            <button onClick={fetchWalletBalance} disabled={walletLoading} className="glass-btn p-1 rounded-md">
              <RefreshCw size={10} className={walletLoading ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="text-lg font-black text-white">₹{walletBalance ?? '...'}</div>
        </div>
        {walletBalance !== null && walletBalance < estimatedCost && (
          <a href={`https://wa.me/?text=${whatsappRechargeMsg}`} target="_blank" rel="noopener noreferrer"
            className="glass-btn w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 text-amber-400 border-amber-400/20">
            <MessageSquare size={13} /> Ask to Recharge (₹{rechargeNeeded} needed)
          </a>
        )}
      </div>
      {shipResults ? (
        <div className="glass-card-sm p-4 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle size={14} className="text-emerald-400" />
            <span className="text-xs font-bold text-emerald-400">{shipResults.results?.filter(r => r.success).length}/{shipResults.results?.length} assigned</span>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {shipResults.results?.map((r, i) => (
              <div key={i} className={`flex items-center justify-between text-[10px] px-2 py-1.5 rounded-lg ${r.success ? 'bg-[rgba(52,211,153,0.05)]' : 'bg-[rgba(255,20,147,0.05)]'}`}>
                <span className="font-bold text-white">#{r.orderId}</span>
                {r.success ? <span className="text-emerald-400 font-mono">{r.awb || 'Assigned'}</span> : <span className="text-[#ff1493]">{r.message}</span>}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <button onClick={handleBulkShip} disabled={shipLoading}
          className="glass-btn-accent w-full py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2">
          {shipLoading ? <><RefreshCw size={14} className="animate-spin" /> Assigning AWBs...</> : <><Truck size={14} /> Confirm & Ship All</>}
        </button>
      )}
    </div>
  );

  const handleGenerateLabels = async () => {
    setLabelLoading(true);
    try {
      const rsOrderIds = shipResults?.results?.filter(r => r.success).map(r => r.rsOrderId).filter(Boolean) || [];
      if (rsOrderIds.length === 0) { setToast({ message: 'No shipped orders to generate labels for', type: 'error' }); setLabelLoading(false); return; }
      const res = await axios.post(`${API_URL}/rapidshyp/bulk-labels-dropbox`, { orderIds: rsOrderIds, orders: workingOrders });
      setLabelResult(res.data);
      if (res.data?.labelUrl) {
        window.open(res.data.labelUrl, '_blank');
      }
      setToast({ message: 'Labels generated & saved to Dropbox!', type: 'success' });
    } catch (e) {
      setToast({ message: `Label generation failed: ${e.response?.data?.error || e.message}`, type: 'error' });
    } finally { setLabelLoading(false); }
  };

  useEffect(() => { if (currentStep === 5 && !labelResult && !labelLoading && shipResults) handleGenerateLabels(); }, [currentStep]);

  const renderStep5_Labels = () => (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-xl font-black text-white tracking-tight mb-1">shipping labels</h2>
        <p className="text-xs text-[rgba(245,245,245,0.3)]">downloading labels and saving to Dropbox</p>
      </div>
      <div className="glass-card-sm p-8 text-center space-y-4">
        {labelLoading ? (
          <div className="space-y-3">
            <RefreshCw size={32} className="mx-auto text-[#e3cfd8] animate-spin" />
            <p className="text-xs text-[rgba(245,245,245,0.4)]">generating labels...</p>
          </div>
        ) : labelResult ? (
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="space-y-3">
            <CheckCircle size={48} className="mx-auto text-emerald-400" />
            <p className="text-sm font-bold text-white">labels ready!</p>
            {labelResult.labelUrl && (
              <a href={labelResult.labelUrl} target="_blank" rel="noopener noreferrer"
                className="glass-btn-accent px-6 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-2">
                <Download size={13} /> Download PDF
              </a>
            )}
            {labelResult.dropboxPath && <p className="text-[9px] text-[rgba(245,245,245,0.2)]">Saved to Dropbox: {labelResult.dropboxPath}</p>}
          </motion.div>
        ) : (
          <div className="space-y-3">
            <AlertTriangle size={32} className="mx-auto text-amber-400" />
            <p className="text-xs text-[rgba(245,245,245,0.4)]">{shipResults ? 'click to generate labels' : 'ship orders first (Step 5)'}</p>
            <button onClick={handleGenerateLabels} disabled={!shipResults}
              className="glass-btn-accent px-6 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-2 disabled:opacity-30">
              <FileText size={13} /> Generate Labels
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const renderStep6_Done = () => (
    <div className="flex flex-col items-center justify-center py-16 space-y-6">
      <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', damping: 12, stiffness: 200 }}>
        <div className="w-24 h-24 rounded-full bg-[rgba(52,211,153,0.1)] border border-[rgba(52,211,153,0.2)] flex items-center justify-center">
          <CheckCircle size={48} className="text-emerald-400" />
        </div>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="text-center space-y-2">
        <h2 className="text-2xl font-black text-white">all done!</h2>
        <p className="text-xs text-[rgba(245,245,245,0.3)]">orders fulfilled, labels generated, everything backed up</p>
      </motion.div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
        className="glass-card-sm p-5 flex gap-8 text-center">
        <div>
          <div className="text-2xl font-black text-white">{uniqueOrderIds.length}</div>
          <div className="text-[9px] text-[rgba(245,245,245,0.25)] uppercase tracking-wider">orders shipped</div>
        </div>
        <div>
          <div className="text-2xl font-black text-white">{workingOrders.length}</div>
          <div className="text-[9px] text-[rgba(245,245,245,0.25)] uppercase tracking-wider">units</div>
        </div>
        <div>
          <div className="text-2xl font-black text-emerald-400">{shipResults?.results?.filter(r => r.success).length || '—'}</div>
          <div className="text-[9px] text-[rgba(245,245,245,0.25)] uppercase tracking-wider">AWBs assigned</div>
        </div>
      </motion.div>
      <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
        onClick={onClose}
        className="glass-btn-accent px-10 py-3 rounded-xl text-sm font-bold">
        Close
      </motion.button>
    </div>
  );

  const stepContent = () => {
    switch (currentStep) {
      case 0: return renderStep0_RTOSort();
      case 1: return renderStep1_MissingDevices();
      case 2: return renderStep2_FinalCheck();
      case 3: return renderStep3_Download();
      case 4: return renderStep4_BulkShip();
      case 5: return renderStep5_Labels();
      case 6: return renderStep6_Done();
      default: return null;
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-2xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(255,255,255,0.04)]">
        <div>
          <h1 className="text-sm font-black text-white tracking-wider uppercase">Fulfill Orders</h1>
          <p className="text-[10px] text-[rgba(245,245,245,0.25)]">{uniqueOrderIds.length} orders • {workingOrders.length} units</p>
        </div>
        <button onClick={onClose} className="glass-btn p-2 rounded-xl hover:bg-[rgba(255,255,255,0.05)]">
          <X size={16} className="text-[rgba(245,245,245,0.4)]" />
        </button>
      </div>

      {/* Step Progress */}
      <StepProgressBar currentStep={currentStep} completedSteps={completedSteps} onStepClick={setCurrentStep} />

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <AnimatePresence mode="wait">
          <motion.div key={currentStep} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
            {stepContent()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer Nav */}
      {currentStep < STEPS.length - 1 && (
        <div className="flex items-center justify-between px-6 py-4 border-t border-[rgba(255,255,255,0.04)]">
          <button onClick={goBack} disabled={currentStep === 0}
            className={`glass-btn px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 ${currentStep === 0 ? 'opacity-30' : ''}`}>
            <ArrowLeft size={13} /> Back
          </button>
          <div className="text-[10px] text-[rgba(245,245,245,0.2)] font-bold tracking-wider uppercase">
            {STEPS[currentStep].label}
          </div>
          <button onClick={goNext}
            className="glass-btn-accent px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2">
            {currentStep === STEPS.length - 2 ? 'Finish' : 'Next'} <ArrowRight size={13} />
          </button>
        </div>
      )}

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            onAnimationComplete={() => setTimeout(() => setToast(null), 2500)}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[400] glass-card px-5 py-3 text-xs font-bold text-white">
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
