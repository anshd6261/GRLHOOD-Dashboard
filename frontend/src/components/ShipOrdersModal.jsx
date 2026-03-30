import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, ClipboardCheck, ShieldCheck, UserCheck, Truck, FileText,
  UploadCloud, CheckCircle, AlertTriangle, RefreshCw, Package,
  MapPin, Phone, CreditCard, Sparkles, ArrowRight, Zap
} from 'lucide-react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '';
const API_URL = API_BASE ? `${API_BASE}/api` : '/api';

const STEPS = [
  { id: 'REVIEW', label: 'Review Orders', icon: ClipboardCheck, desc: 'Reviewing order details' },
  { id: 'AI_RISK', label: 'AI Risk Scan', icon: ShieldCheck, desc: 'Running Shiprocket Sense RTO analysis' },
  { id: 'VERIFY', label: 'Verify Info', icon: UserCheck, desc: 'Validating customer & shipping data' },
  { id: 'ASSIGN', label: 'Assign Courier', icon: Truck, desc: 'Allocating best courier partner' },
  { id: 'LABELS', label: 'Gen Labels', icon: FileText, desc: 'Creating shipping labels' },
  { id: 'UPLOAD', label: 'Backup', icon: UploadCloud, desc: 'Uploading to Dropbox' },
  { id: 'COMPLETE', label: 'Done', icon: CheckCircle, desc: 'All orders shipped!' },
];

function RiskBadge({ level }) {
  const config = {
    High: { bg: 'rgba(255,20,147,0.12)', border: 'rgba(255,20,147,0.3)', text: '#ff1493', glow: 'rgba(255,20,147,0.4)' },
    Medium: { bg: 'rgba(227,207,216,0.1)', border: 'rgba(227,207,216,0.2)', text: '#e3cfd8', glow: 'rgba(227,207,216,0.2)' },
    Low: { bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.25)', text: '#34d399', glow: 'rgba(52,211,153,0.2)' },
  };
  const c = config[level] || config.Medium;
  return (
    <span
      className="text-[9px] uppercase font-black px-2 py-0.5 rounded-full tracking-wider"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text, filter: `drop-shadow(0 0 6px ${c.glow})` }}
    >
      {level}
    </span>
  );
}

export default function ShipOrdersModal({ orders, onClose, onSuccess }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState(null);
  const [riskResults, setRiskResults] = useState([]);
  const [highRiskCount, setHighRiskCount] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(new Set());
  const [isPaused, setIsPaused] = useState(false);
  const hasStarted = useRef(false);

  const totalOrders = orders.length;
  const uniqueOrderIds = [...new Set(orders.map(o => o.orderId))];

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    runPipeline();
  }, []);

  const markComplete = (stepIdx) => {
    setCompletedSteps(prev => new Set([...prev, stepIdx]));
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const runPipeline = async () => {
    try {
      // Step 0: Review Orders (visual only)
      setCurrentStep(0);
      await sleep(1200);
      markComplete(0);

      // Step 1: AI Risk Scan
      setCurrentStep(1);
      const risks = orders.map(o => ({
        orderId: o.orderId,
        name: o.customerName,
        score: o.aiRiskScore || 'N/A',
        level: o.aiRiskLevel || 'Unknown',
        reasons: o.aiRiskReasons || [],
      }));
      setRiskResults(risks);
      const highCount = risks.filter(r => r.level === 'High').length;
      setHighRiskCount(highCount);
      await sleep(1800);

      if (highCount > 0) {
        setIsPaused(true);
        return; // Pause for user confirmation
      }
      markComplete(1);

      await continueAfterRisk();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      setCurrentStep(-1);
    }
  };

  const continueAfterRisk = async () => {
    try {
      setIsPaused(false);
      markComplete(1);

      // Step 2: Verify Info
      setCurrentStep(2);
      await sleep(1000);
      markComplete(2);

      // Step 3: Assign Courier
      setCurrentStep(3);
      const assignRes = await axios.post(`${API_URL}/rapidshyp/bulk-assign`, { orderNames: uniqueOrderIds });
      if (!assignRes.data.success) throw new Error(assignRes.data.error || 'Courier assignment failed');
      markComplete(3);

      // Step 4: Generate Labels
      setCurrentStep(4);
      const labelRes = await axios.post(`${API_URL}/rapidshyp/bulk-labels-dropbox`, { orderIds: uniqueOrderIds, orders });
      if (!labelRes.data.success) throw new Error(labelRes.data.error || 'Label generation failed');
      markComplete(4);

      // Step 5: Upload/Backup
      setCurrentStep(5);
      await sleep(800);
      markComplete(5);

      // Step 6: Complete
      setCurrentStep(6);
      markComplete(6);

      setTimeout(() => {
        if (onSuccess) onSuccess(labelRes.data?.dropboxPaths);
        onClose();
      }, 3500);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      setCurrentStep(-1);
    }
  };

  const handleForceShip = () => {
    continueAfterRisk();
  };

  const isError = currentStep === -1;
  const isComplete = currentStep === 6 && completedSteps.has(6);

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/85 backdrop-blur-2xl"
        onClick={isComplete || isError ? onClose : undefined}
      />

      <motion.div
        initial={{ scale: 0.88, y: 30, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.92, y: 20, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="glass-card relative w-full max-w-2xl z-10 p-0 overflow-hidden shadow-[0_25px_80px_rgba(0,0,0,0.9)]"
      >
        {/* Header */}
        <div className="relative px-6 pt-6 pb-4 border-b border-[rgba(227,207,216,0.08)]">
          <div className="absolute inset-0 bg-gradient-to-b from-[rgba(227,207,216,0.04)] to-transparent pointer-events-none" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.div
                animate={{ rotate: isComplete ? 0 : 360 }}
                transition={{ duration: 2, repeat: isComplete ? 0 : Infinity, ease: 'linear' }}
                className="p-2.5 rounded-2xl bg-[rgba(227,207,216,0.08)] border border-[rgba(227,207,216,0.12)]"
              >
                <Zap size={20} className="text-[#e3cfd8]" />
              </motion.div>
              <div>
                <h2 className="text-xl font-black text-white tracking-wider uppercase glow-text">Ship Orders</h2>
                <p className="text-[11px] text-[rgba(245,245,245,0.35)] font-medium mt-0.5">
                  {uniqueOrderIds.length} order{uniqueOrderIds.length !== 1 ? 's' : ''} &middot; {totalOrders} unit{totalOrders !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            {(isComplete || isError) && (
              <button onClick={onClose} className="p-2 rounded-xl bg-[rgba(245,245,245,0.05)] hover:bg-[rgba(245,245,245,0.1)] transition-colors text-white">
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Step Progress Bar */}
        <div className="px-6 py-4 border-b border-[rgba(227,207,216,0.06)]">
          <div className="flex items-center justify-between gap-1">
            {STEPS.map((step, idx) => {
              const Icon = step.icon;
              const isDone = completedSteps.has(idx);
              const isActive = currentStep === idx && !isError;
              const isFuture = idx > currentStep && !isDone;

              return (
                <React.Fragment key={step.id}>
                  <motion.div
                    className="flex flex-col items-center gap-1.5 relative"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.08 }}
                  >
                    <motion.div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-500 ${
                        isDone
                          ? 'bg-[rgba(52,211,153,0.15)] border border-[rgba(52,211,153,0.3)] text-emerald-400'
                          : isActive
                          ? 'bg-[rgba(227,207,216,0.15)] border border-[rgba(227,207,216,0.35)] text-[#e3cfd8]'
                          : 'bg-[rgba(245,245,245,0.03)] border border-[rgba(245,245,245,0.06)] text-[rgba(245,245,245,0.2)]'
                      }`}
                      animate={isActive ? { scale: [1, 1.1, 1], boxShadow: ['0 0 0px rgba(227,207,216,0)', '0 0 20px rgba(227,207,216,0.2)', '0 0 0px rgba(227,207,216,0)'] } : {}}
                      transition={isActive ? { duration: 1.5, repeat: Infinity } : {}}
                    >
                      {isDone ? (
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400 }}>
                          <CheckCircle size={16} />
                        </motion.div>
                      ) : isActive ? (
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
                          <Icon size={16} />
                        </motion.div>
                      ) : (
                        <Icon size={14} />
                      )}
                    </motion.div>
                    <span className={`text-[8px] font-bold uppercase tracking-wider text-center leading-tight ${
                      isDone ? 'text-emerald-400/70' : isActive ? 'text-[#e3cfd8]' : 'text-[rgba(245,245,245,0.2)]'
                    }`}>
                      {step.label}
                    </span>
                  </motion.div>
                  {idx < STEPS.length - 1 && (
                    <div className="flex-1 h-[2px] mx-0.5 mt-[-14px] relative overflow-hidden rounded-full">
                      <div className={`absolute inset-0 rounded-full transition-all duration-700 ${
                        isDone ? 'bg-emerald-400/40' : 'bg-[rgba(245,245,245,0.06)]'
                      }`} />
                      {isActive && (
                        <motion.div
                          className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#e3cfd8] to-transparent rounded-full"
                          animate={{ width: ['0%', '100%'] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        />
                      )}
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Main Content */}
        <div className="px-6 py-5 min-h-[260px] max-h-[50vh] overflow-y-auto no-scrollbar">
          <AnimatePresence mode="wait">

            {/* Active Step Display */}
            {!isError && !isComplete && !isPaused && (
              <motion.div
                key={`step-${currentStep}`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center justify-center py-8 gap-5"
              >
                <motion.div
                  animate={{
                    scale: [1, 1.08, 1],
                    filter: ['drop-shadow(0 0 15px rgba(227,207,216,0.2))', 'drop-shadow(0 0 30px rgba(227,207,216,0.4))', 'drop-shadow(0 0 15px rgba(227,207,216,0.2))']
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="p-5 rounded-3xl bg-[rgba(227,207,216,0.06)] border border-[rgba(227,207,216,0.12)]"
                >
                  {React.createElement(STEPS[currentStep]?.icon || Package, { size: 40, className: 'text-[#e3cfd8]' })}
                </motion.div>
                <div className="text-center">
                  <h3 className="text-lg font-black text-white tracking-widest uppercase mb-1">{STEPS[currentStep]?.label}</h3>
                  <p className="text-xs text-[rgba(245,245,245,0.4)] font-medium">{STEPS[currentStep]?.desc}</p>
                </div>
                <motion.div
                  className="flex items-center gap-2 text-[rgba(245,245,245,0.3)]"
                  animate={{ opacity: [0.3, 0.7, 0.3] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <RefreshCw size={14} className="animate-spin" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Processing...</span>
                </motion.div>
              </motion.div>
            )}

            {/* Risk Pause Screen */}
            {isPaused && (
              <motion.div
                key="risk-pause"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="py-4 space-y-4"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-xl bg-[rgba(255,20,147,0.1)] border border-[rgba(255,20,147,0.25)]">
                    <AlertTriangle size={18} className="text-[#ff1493]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">High Risk Detected</h3>
                    <p className="text-[11px] text-[rgba(245,245,245,0.4)]">
                      {highRiskCount} order{highRiskCount !== 1 ? 's' : ''} flagged by AI — review before shipping
                    </p>
                  </div>
                </div>

                <div className="space-y-2 max-h-[200px] overflow-y-auto no-scrollbar">
                  {riskResults.filter(r => r.level === 'High').map((r, i) => (
                    <motion.div
                      key={r.orderId + i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="glass-card-sm p-3 flex items-center justify-between gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono font-bold text-sm text-white">{r.orderId}</span>
                          <RiskBadge level={r.level} />
                        </div>
                        <div className="text-[10px] text-[rgba(245,245,245,0.4)] truncate">{r.name}</div>
                        {r.reasons.length > 0 && (
                          <div className="text-[10px] text-[rgba(255,20,147,0.7)] mt-1 truncate">
                            {r.reasons[0]}
                          </div>
                        )}
                      </div>
                      <div className="text-2xl font-black text-[#ff1493] glow-text shrink-0">{r.score}</div>
                    </motion.div>
                  ))}
                </div>

                <div className="flex gap-3 pt-3">
                  <button
                    onClick={onClose}
                    className="flex-1 glass-btn py-3 rounded-xl text-xs font-bold uppercase tracking-wider"
                  >
                    Cancel
                  </button>
                  <motion.button
                    onClick={handleForceShip}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex-1 py-3 rounded-xl glass-btn-accent font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 btn-shine-effect"
                  >
                    <Sparkles size={14} /> Ship Anyway
                    <ArrowRight size={14} />
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* Success */}
            {isComplete && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-10 gap-5"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, delay: 0.2 }}
                  className="relative"
                >
                  <motion.div
                    className="absolute inset-0 rounded-full bg-emerald-400/20"
                    animate={{ scale: [1, 1.8, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  <div className="relative p-5 rounded-full bg-[rgba(52,211,153,0.1)] border border-[rgba(52,211,153,0.25)]">
                    <CheckCircle size={44} className="text-emerald-400" />
                  </div>
                </motion.div>
                <div className="text-center">
                  <motion.h3
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="text-xl font-black text-white tracking-widest uppercase mb-2 glow-text"
                  >
                    Successfully Shipped!
                  </motion.h3>
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="text-xs text-[rgba(245,245,245,0.4)]"
                  >
                    {uniqueOrderIds.length} orders processed &middot; Labels & CSVs uploaded to Dropbox
                  </motion.p>
                </div>
              </motion.div>
            )}

            {/* Error */}
            {isError && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-8 gap-5"
              >
                <motion.div
                  animate={{ rotate: [0, 5, -5, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="p-4 rounded-2xl bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.25)]"
                >
                  <AlertTriangle size={36} className="text-red-400" />
                </motion.div>
                <div className="text-center max-w-sm">
                  <h3 className="text-lg font-black text-red-400 tracking-widest uppercase mb-2">Pipeline Failed</h3>
                  <p className="text-xs text-[rgba(245,245,245,0.5)] break-words">{error}</p>
                </div>
                <button
                  onClick={onClose}
                  className="glass-btn px-8 py-3 rounded-xl text-xs font-bold uppercase tracking-wider"
                >
                  Close
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer Stats */}
        {!isError && !isComplete && !isPaused && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="px-6 py-3 border-t border-[rgba(227,207,216,0.06)] bg-[rgba(0,0,0,0.2)]"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <Package size={12} className="text-[rgba(245,245,245,0.3)]" />
                  <span className="text-[10px] text-[rgba(245,245,245,0.4)] font-bold">{uniqueOrderIds.length} Orders</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <MapPin size={12} className="text-[rgba(245,245,245,0.3)]" />
                  <span className="text-[10px] text-[rgba(245,245,245,0.4)] font-bold">{totalOrders} Units</span>
                </div>
              </div>
              <div className="text-[9px] text-[rgba(245,245,245,0.25)] font-bold uppercase tracking-widest">
                Step {Math.min(currentStep + 1, 7)} / 7
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
