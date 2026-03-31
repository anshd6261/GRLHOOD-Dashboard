import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, ShieldCheck, Smartphone, ClipboardCheck, Download, Truck,
  FileText, CheckCircle, AlertTriangle, ChevronDown, ChevronUp,
  Phone, MessageSquare, Trash2, RefreshCw, ArrowRight, ArrowLeft,
  Package, Users, ExternalLink, Calendar
} from 'lucide-react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '';
const API_URL = API_BASE ? `${API_BASE}/api` : '/api';
const SHOPIFY_DOMAIN = 'grlhood-3.myshopify.com';

const STEPS = [
  { id: 'REPEAT', label: 'Repeats', icon: Users },
  { id: 'RTO_SORT', label: 'RTO Sort', icon: ShieldCheck },
  { id: 'MISSING', label: 'Devices', icon: Smartphone },
  { id: 'CSV', label: 'CSV', icon: ClipboardCheck },
  { id: 'DOWNLOAD', label: 'Download', icon: Download },
  { id: 'SHIP', label: 'Ship', icon: Truck },
  { id: 'LABELS', label: 'Labels', icon: FileText },
  { id: 'DONE', label: 'Done', icon: CheckCircle },
];

const RiskBadge = React.memo(function RiskBadge({ level }) {
  const config = {
    High: { bg: 'rgba(255,20,147,0.12)', border: 'rgba(255,20,147,0.3)', text: '#ff1493' },
    Medium: { bg: 'rgba(227,207,216,0.1)', border: 'rgba(227,207,216,0.2)', text: '#e3cfd8' },
    Low: { bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.25)', text: '#34d399' },
  };
  const c = config[level] || config.Medium;
  return (
    <span className="text-[9px] uppercase font-black px-2 py-0.5 rounded-full tracking-wider"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
      {level}
    </span>
  );
});

const RiskReasonPills = React.memo(function RiskReasonPills({ reasons }) {
  if (!reasons?.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {reasons.slice(0, 5).map((r, i) => (
        <span key={i} className="text-[9px] px-2 py-0.5 rounded-md bg-[rgba(255,20,147,0.06)] border border-[rgba(255,20,147,0.12)] text-[rgba(245,245,245,0.5)] leading-tight">
          {r}
        </span>
      ))}
    </div>
  );
});

const OrderDetailCard = React.memo(function OrderDetailCard({ group, onCancel, cancellingId, hideActions, hidePrice, showDate, showRiskDetail }) {
  const [open, setOpen] = useState(false);
  const phone = group.shippingDetails?.phone || '';
  const cleanPhone = phone.replace(/\D/g, '').slice(-10);
  const shopifyLink = group.items[0]?.id ? `https://${SHOPIFY_DOMAIN}/admin/orders/${group.items[0].id}` : group.orderLink || null;
  const riskColor = group.aiRiskLevel === 'High' ? '#ff1493' : group.aiRiskLevel === 'Low' ? '#34d399' : '#e3cfd8';
  return (
    <div className="glass-card-sm overflow-hidden" style={showRiskDetail ? { borderLeft: `2px solid ${riskColor}30` } : {}}>
      <div className="p-3 flex items-center justify-between cursor-pointer select-none" onClick={() => setOpen(!open)}>
        <div className="flex items-center gap-3 min-w-0">
          {group.items[0]?.thumbnail && <img src={group.items[0].thumbnail} alt="" className="w-9 h-9 rounded-lg object-cover border border-[rgba(255,255,255,0.06)]" />}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-white">#{group.orderId}</span>
              <span className="text-[10px] text-[rgba(245,245,245,0.3)]">{group.items.length} unit{group.items.length > 1 ? 's' : ''}</span>
              {group.aiRiskLevel && <RiskBadge level={group.aiRiskLevel} />}
              {shopifyLink && <a href={shopifyLink} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-[rgba(245,245,245,0.2)] hover:text-[#e3cfd8]"><ExternalLink size={10} /></a>}
            </div>
            <div className="text-[11px] text-[rgba(245,245,245,0.35)] truncate">
              {group.customerName} · {group.payment || 'Unknown'}
              {showDate && group.createdAt && <span className="ml-1.5 text-[rgba(245,245,245,0.2)]">{new Date(group.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} {new Date(group.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {!hideActions && cleanPhone && (
            <>
              <a href={`tel:+91${cleanPhone}`} onClick={e => e.stopPropagation()} className="glass-btn p-1.5 rounded-lg"><Phone size={12} className="text-[#e3cfd8]" /></a>
              <a href={`https://wa.me/91${cleanPhone}?text=${encodeURIComponent(`Hi ${group.customerName}, this is GRLHOOD! We have an update regarding your order #${group.orderId}.`)}`}
                target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="glass-btn p-1.5 rounded-lg"><MessageSquare size={12} className="text-emerald-400" /></a>
            </>
          )}
          <button onClick={e => { e.stopPropagation(); onCancel(group.orderId, group.shopifyId); }} disabled={cancellingId === group.orderId}
            className="glass-btn p-1.5 rounded-lg text-[#ff1493] hover:bg-[rgba(255,20,147,0.1)]">
            {cancellingId === group.orderId ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
          </button>
          {open ? <ChevronUp size={14} className="text-[rgba(245,245,245,0.3)]" /> : <ChevronDown size={14} className="text-[rgba(245,245,245,0.3)]" />}
        </div>
      </div>
      {open && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-[rgba(255,255,255,0.04)]">
          {/* Risk reasons as pills (shown in RTO step) */}
          {showRiskDetail && group.aiRiskReasons?.length > 0 && (
            <div className="pt-2">
              <div className="text-[9px] uppercase font-bold text-[rgba(245,245,245,0.25)] tracking-wider mb-1.5">Risk Factors</div>
              <div className="flex flex-wrap gap-1">
                {group.aiRiskReasons.map((r, i) => (
                  <span key={i} className="text-[9px] px-2 py-0.5 rounded-md border leading-tight"
                    style={{ background: `${riskColor}08`, borderColor: `${riskColor}20`, color: `${riskColor}cc` }}>
                    {r}
                  </span>
                ))}
              </div>
            </div>
          )}
          {/* Customer & address info */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <div className="text-[9px] uppercase font-bold text-[rgba(245,245,245,0.25)] tracking-wider mb-0.5">Address</div>
              <div className="text-[11px] text-[rgba(245,245,245,0.55)] leading-relaxed">
                {group.shippingDetails?.address1}<br />
                {group.shippingDetails?.city} {group.shippingDetails?.zip}
              </div>
            </div>
            <div>
              <div className="text-[9px] uppercase font-bold text-[rgba(245,245,245,0.25)] tracking-wider mb-0.5">Phone</div>
              <div className="text-[11px] text-[rgba(245,245,245,0.55)] font-mono">{phone || 'N/A'}</div>
            </div>
          </div>
          {/* Items */}
          <div className="space-y-1.5 pt-1">
            {group.items.map((item, i) => (
              <div key={i} className="flex items-center gap-2.5 bg-[rgba(255,255,255,0.02)] rounded-lg p-2">
                {item.thumbnail && <img src={item.thumbnail} alt="" className="w-9 h-9 rounded-md object-cover" />}
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-bold text-[#e3cfd8] truncate">{item.model || 'Unknown Model'}</div>
                  <div className="text-[10px] text-[rgba(245,245,245,0.3)]">{item.category} · {item.sku}</div>
                </div>
                {!hidePrice && <div className="text-[11px] text-white font-bold shrink-0">Rs{item.price || 0}</div>}
              </div>
            ))}
          </div>
          {group.awb && (
            <div className="text-[11px] flex items-center gap-1.5">
              <span className="text-[rgba(245,245,245,0.3)]">AWB:</span>
              <a href={group.awb.startsWith('http') ? group.awb : `https://www.google.com/search?q=${group.awb}+tracking`} target="_blank"
                className="text-[#e3cfd8] font-mono hover:underline">{group.awb.startsWith('http') ? group.awb.match(/\d{10,}/)?.[0] || 'Label' : group.awb}</a>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// Memoized CSV table row to prevent full-table re-render on single cell edit
const CsvRow = React.memo(function CsvRow({ r, i, isSupplier, onCategory, onModel, onDelete }) {
  return (
    <tr className="border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(227,207,216,0.03)]">
      <td className="text-[10px] text-[rgba(245,245,245,0.25)] px-2 py-1.5">{i+1}</td>
      <td className="px-2 py-1.5"><input type="text" value={r.category||''} onChange={e => onCategory(i, e.target.value)} className="glass-input text-[10px] px-2 py-1 rounded w-full min-w-[80px]" /></td>
      <td className="px-2 py-1.5"><input type="text" value={r.model||''} onChange={e => onModel(i, e.target.value)} className="glass-input text-[10px] px-2 py-1 rounded w-full min-w-[120px]" /></td>
      <td className="text-[10px] text-[rgba(245,245,245,0.35)] px-2 py-1.5 font-mono">{r.sku}</td>
      <td className="text-[10px] text-[rgba(245,245,245,0.5)] px-2 py-1.5">{r.customerName}</td>
      <td className="text-[10px] text-white font-bold px-2 py-1.5">{r.orderId}</td>
      <td className="text-[10px] text-[rgba(245,245,245,0.45)] px-2 py-1.5">{r.payment||'—'}</td>
      {!isSupplier && <td className="text-[10px] text-[rgba(245,245,245,0.45)] px-2 py-1.5">₹{r.price||0}</td>}
      {!isSupplier && <td className="text-[10px] text-[#e3cfd8] px-2 py-1.5">₹{r.cogs||0}</td>}
      <td className="px-2 py-1.5"><button onClick={() => onDelete(i)} className="text-[rgba(245,245,245,0.15)] hover:text-[#ff1493]"><Trash2 size={11} /></button></td>
    </tr>
  );
});

export default function FulfillOrdersWizard({ orders, onClose, onOrdersUpdate, isSupplier }) {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(new Set());
  const [workingOrders, setWorkingOrders] = useState([]);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [cancellingId, setCancellingId] = useState(null);
  const [walletBalance, setWalletBalance] = useState(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [shipResults, setShipResults] = useState(null);
  const [shipLoading, setShipLoading] = useState(false);
  const [labelResult, setLabelResult] = useState(null);
  const [labelLoading, setLabelLoading] = useState(false);
  const [dlStatus, setDlStatus] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    setWorkingOrders(orders.map(o => {
      const saved = localStorage.getItem(`model_override_${o.orderId}_${o.sku}`);
      return { ...o, model: saved || o.model || '' };
    }));
  }, [orders]);

  const markDone = (s) => setDone(prev => new Set([...prev, s]));
  const goNext = () => { markDone(step); setStep(s => Math.min(s + 1, STEPS.length - 1)); };
  const goBack = () => setStep(s => Math.max(s - 1, 0));

  const handleModelUpdate = useCallback((i, val) => {
    setWorkingOrders(prev => {
      const u = [...prev]; u[i] = { ...u[i], model: val };
      const o = u[i]; const k = `model_override_${o.orderId}_${o.sku}`;
      val?.trim() ? localStorage.setItem(k, val) : localStorage.removeItem(k);
      return u;
    });
  }, []);
  const handleCategoryUpdate = useCallback((i, val) => {
    setWorkingOrders(prev => {
      const u = [...prev]; u[i] = { ...u[i], category: val }; return u;
    });
  }, []);
  const handleDeleteRow = useCallback((i) => {
    setWorkingOrders(prev => { const u = [...prev]; u.splice(i, 1); return u; });
  }, []);
  const handleCancel = useCallback(async (orderId, shopifyId) => {
    setCancellingId(orderId);
    try {
      const numericId = shopifyId || orderId;
      await axios.post(`${API_URL}/orders/${numericId}/cancel`, { orderName: `#${orderId}` });
      setWorkingOrders(p => p.filter(o => o.orderId !== orderId));
      setToast({ msg: `#${orderId} cancelled` });
    }
    catch (e) { setToast({ msg: `Cancel failed: ${e.response?.data?.error || e.message}`, err: true }); }
    finally { setCancellingId(null); }
  }, []);

  const grouped = useMemo(() => {
    const m = {};
    workingOrders.forEach(o => {
      if (!m[o.orderId]) m[o.orderId] = { orderId: o.orderId, shopifyId: o.id, customerName: o.customerName, shippingDetails: o.shippingDetails, aiRiskScore: o.aiRiskScore, aiRiskLevel: o.aiRiskLevel, aiRiskReasons: o.aiRiskReasons || [], items: [], createdAt: o.createdAt, awb: o.awb, rsOrderId: o.rsOrderId, customerOrdersCount: o.customerOrdersCount, payment: o.payment };
      m[o.orderId].items.push(o);
    });
    return Object.values(m);
  }, [workingOrders]);

  const uniqueIds = useMemo(() => [...new Set(workingOrders.map(o => o.orderId))], [workingOrders]);
  const highRisk = useMemo(() => grouped.filter(g => g.aiRiskLevel === 'High'), [grouped]);
  const missingUnits = useMemo(() => workingOrders.map((o, i) => ({ ...o, _idx: i })).filter(o => !o.model?.trim() || o.model.toLowerCase() === 'unknown model'), [workingOrders]);

  // Repeat customers: group by customer name, show those with >1 orders (exclude if first order delivered)
  const repeatCustomers = useMemo(() => {
    const byCustomer = {};
    grouped.forEach(g => {
      const name = g.customerName || 'Unknown';
      if (!byCustomer[name]) byCustomer[name] = [];
      byCustomer[name].push(g);
    });
    return Object.entries(byCustomer)
      .filter(([, ords]) => ords.length > 1 || (ords[0]?.customerOrdersCount || 1) > 1)
      .map(([name, ords]) => ({ name, orders: ords, totalOrders: ords[0]?.customerOrdersCount || ords.length }));
  }, [grouped]);

  // ═══ STEP 0: Repeat Orders ═══
  const renderRepeatOrders = () => (
    <div className="space-y-4">
      {repeatCustomers.length === 0 ? (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-12">
          <CheckCircle size={36} className="mx-auto text-emerald-400 mb-3" />
          <h3 className="text-base font-bold text-white mb-1">No Repeat Orders</h3>
          <p className="text-xs text-[rgba(245,245,245,0.3)]">All unique customers in this batch</p>
        </motion.div>
      ) : (
        repeatCustomers.map(({ name, orders: custOrders, totalOrders }) => (
          <div key={name} className="glass-card-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-white">{name}</span>
                <span className="text-[10px] text-[rgba(245,245,245,0.3)] ml-2">{totalOrders} total orders</span>
              </div>
              <span className="text-[10px] font-bold text-amber-400 bg-[rgba(251,191,36,0.1)] px-2.5 py-0.5 rounded-full border border-amber-400/20">REPEAT</span>
            </div>
            {custOrders.map(g => <OrderDetailCard key={g.orderId} group={g} onCancel={handleCancel} cancellingId={cancellingId} hideActions showDate hidePrice={isSupplier} />)}
          </div>
        ))
      )}
    </div>
  );

  // ═══ STEP 1: RTO Sort ═══
  const codOrders = useMemo(() => grouped.filter(g => g.payment === 'COD' || g.payment === 'Cash on Delivery'), [grouped]);
  const sortedCodOrders = useMemo(() => [...codOrders].sort((a, b) => (b.aiRiskScore || 0) - (a.aiRiskScore || 0)), [codOrders]);
  const renderRTOSort = () => (
    <div className="space-y-3">
      {codOrders.length === 0 ? (
        <div className="text-center py-12">
          <CheckCircle size={36} className="mx-auto text-emerald-400 mb-3" />
          <h3 className="text-base font-bold text-white mb-1">No COD Orders</h3>
          <p className="text-xs text-[rgba(245,245,245,0.3)]">All orders are prepaid</p>
        </div>
      ) : (
        <div className="space-y-2">
          {highRisk.length > 0 && (
            <div className="glass-card-sm p-2.5 flex items-center gap-2 border-l-2 border-[#ff1493]">
              <AlertTriangle size={14} className="text-[#ff1493]" />
              <span className="text-xs font-bold text-[rgba(245,245,245,0.6)]">{highRisk.length} high-risk out of {codOrders.length} COD orders</span>
            </div>
          )}
          {sortedCodOrders.map(g => (
            <div key={g.orderId} className="flex items-start gap-2">
              <div className={`text-lg font-black pt-2.5 w-12 text-center shrink-0 ${g.aiRiskLevel === 'High' ? 'text-[#ff1493]' : g.aiRiskLevel === 'Low' ? 'text-emerald-400' : 'text-[#e3cfd8]'}`}>{g.aiRiskScore || 0}%</div>
              <div className="flex-1"><OrderDetailCard group={g} onCancel={handleCancel} cancellingId={cancellingId} hidePrice={isSupplier} showRiskDetail /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ═══ STEP 2: Missing Devices ═══
  // Group missing units by orderId so we show call/msg once per order
  const missingByOrder = useMemo(() => {
    const map = {};
    missingUnits.forEach(u => {
      if (!map[u.orderId]) map[u.orderId] = { orderId: u.orderId, shopifyId: u.id, customerName: u.customerName, shippingDetails: u.shippingDetails, units: [] };
      map[u.orderId].units.push(u);
    });
    return Object.values(map);
  }, [missingUnits]);

  const renderMissing = () => (
    <div className="space-y-3">
      {missingUnits.length === 0 ? (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-12">
          <CheckCircle size={36} className="mx-auto text-emerald-400 mb-3" />
          <h3 className="text-base font-bold text-white mb-1">All Models Present</h3>
        </motion.div>
      ) : (
        <div className="space-y-3">
          <div className="glass-card-sm p-2.5 flex items-center gap-2 border-l-2 border-amber-400">
            <Smartphone size={14} className="text-amber-400" />
            <span className="text-xs font-bold text-[rgba(245,245,245,0.6)]">{missingUnits.length} unit{missingUnits.length > 1 ? 's' : ''} missing across {missingByOrder.length} order{missingByOrder.length > 1 ? 's' : ''}</span>
          </div>
          {missingByOrder.map(orderGroup => {
            const ph = (orderGroup.shippingDetails?.phone || '').replace(/\D/g, '').slice(-10);
            return (
              <div key={orderGroup.orderId} className="glass-card-sm p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-bold text-white">#{orderGroup.orderId}</span>
                    <span className="text-[11px] text-[rgba(245,245,245,0.3)] ml-2">{orderGroup.customerName}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {ph && <>
                      <a href={`tel:+91${ph}`} className="glass-btn p-1.5 rounded-lg"><Phone size={12} className="text-[#e3cfd8]" /></a>
                      <a href={`https://wa.me/91${ph}?text=${encodeURIComponent(`Hi ${orderGroup.customerName}, this is GRLHOOD. We're processing your order #${orderGroup.orderId} but need your phone model to proceed. Could you please share your device name? Thanks!`)}`}
                        target="_blank" rel="noopener noreferrer" className="glass-btn p-1.5 rounded-lg"><MessageSquare size={12} className="text-emerald-400" /></a>
                    </>}
                    <button onClick={() => handleCancel(orderGroup.orderId, orderGroup.shopifyId)} disabled={cancellingId === orderGroup.orderId}
                      className="glass-btn p-1.5 rounded-lg text-[#ff1493]">{cancellingId === orderGroup.orderId ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}</button>
                  </div>
                </div>
                {orderGroup.units.map(unit => (
                  <div key={`${unit.orderId}-${unit.sku}-${unit._idx}`} className="flex items-center gap-2.5">
                    {unit.thumbnail && <img src={unit.thumbnail} alt="" className="w-9 h-9 rounded-lg object-cover border border-[rgba(255,255,255,0.06)] shrink-0" />}
                    <div className="flex-1">
                      <div className="text-[11px] text-[rgba(245,245,245,0.4)] mb-1">{unit.category}</div>
                      <input type="text" placeholder="Enter device model" value={workingOrders[unit._idx]?.model || ''}
                        onChange={e => handleModelUpdate(unit._idx, e.target.value)} className="glass-input w-full text-xs px-3 py-2 rounded-lg" />
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ═══ STEP 3: CSV Check ═══
  const csvHeaders = isSupplier
    ? ['#','Category','Model','SKU','Customer','Order ID','Payment','']
    : ['#','Category','Model','SKU','Customer','Order ID','Payment','Price','COGS',''];
  const renderCSV = () => (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead><tr className="border-b border-[rgba(255,255,255,0.06)]">
            {csvHeaders.map(h => (
              <th key={h} className="text-[9px] font-bold text-[rgba(245,245,245,0.3)] uppercase tracking-wider px-2 py-2 whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {workingOrders.map((r, i) => (
              <CsvRow key={`${r.orderId}-${r.sku}-${i}`} r={r} i={i} isSupplier={isSupplier}
                onCategory={handleCategoryUpdate} onModel={handleModelUpdate} onDelete={handleDeleteRow} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between pt-1 text-[11px] text-[rgba(245,245,245,0.3)]">
        <span>{workingOrders.length} units · {uniqueIds.length} orders</span>
        <span>missing models: {missingUnits.length}</span>
      </div>
    </div>
  );

  // ═══ STEP 4: Download ═══
  const handleDownload = async () => {
    setDlStatus('dl');
    try {
      // Download supplier CSV
      const resSup = await axios.post(`${API_URL}/download`, { rows: workingOrders, skipHistory: true, type: 'supplier' }, { responseType: 'blob' });
      const u1 = window.URL.createObjectURL(new Blob([resSup.data], { type: 'text/csv' }));
      const a1 = document.createElement('a'); a1.href = u1; a1.download = resSup.headers['x-filename'] || 'Order.csv'; a1.click();
      // Download financial CSV for admin
      if (!isSupplier) {
        await new Promise(r => setTimeout(r, 800));
        const resF = await axios.post(`${API_URL}/download`, { rows: workingOrders, skipHistory: true, type: 'financial' }, { responseType: 'blob' });
        const u2 = window.URL.createObjectURL(new Blob([resF.data], { type: 'text/csv' }));
        const a2 = document.createElement('a'); a2.href = u2; a2.download = resF.headers['x-filename'] || 'Financial.csv'; a2.click();
      }
      // Upload BOTH CSVs to Dropbox (ORDERS/Month/DateFolder/) regardless of role
      setDlStatus('dbx');
      try { await axios.post(`${API_URL}/dropbox/upload`, { orders: workingOrders }); } catch (dbxErr) { console.warn('Dropbox upload failed:', dbxErr.message); }
      setDlStatus('done'); setToast({ msg: 'CSVs downloaded & backed up to Dropbox' });
    } catch (e) { setDlStatus('err'); setToast({ msg: `Download failed: ${e.message}`, err: true }); }
  };

  const renderDownload = () => (
    <div className="space-y-4">
      <div className="glass-card-sm p-6 text-center space-y-5">
        <div className="flex justify-center gap-10">
          <div><div className="text-3xl font-black text-white">{uniqueIds.length}</div><div className="text-[10px] text-[rgba(245,245,245,0.3)] uppercase tracking-wider mt-1">orders</div></div>
          <div><div className="text-3xl font-black text-white">{workingOrders.length}</div><div className="text-[10px] text-[rgba(245,245,245,0.3)] uppercase tracking-wider mt-1">units</div></div>
        </div>
        {dlStatus === 'done' ? (
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }}><CheckCircle size={32} className="mx-auto text-emerald-400" /><p className="text-sm font-bold text-emerald-400 mt-2">Downloaded & Backed Up</p></motion.div>
        ) : (
          <button onClick={handleDownload} disabled={dlStatus === 'dl' || dlStatus === 'dbx'}
            className="glass-btn-accent px-8 py-3 rounded-xl text-sm font-bold flex items-center gap-2.5 mx-auto">
            {dlStatus === 'dl' ? <><RefreshCw size={14} className="animate-spin" /> Downloading...</> :
             dlStatus === 'dbx' ? <><RefreshCw size={14} className="animate-spin" /> Uploading to Dropbox...</> :
             <><Download size={14} /> Download CSV{!isSupplier ? 's' : ''}</>}
          </button>
        )}
      </div>
    </div>
  );

  // ═══ STEP 5: Bulk Ship ═══
  const fetchWallet = async () => {
    setWalletLoading(true);
    try { const r = await axios.get(`${API_URL}/rapidshyp/wallet`); setWalletBalance(r.data?.balance); }
    catch { setWalletBalance(null); }
    finally { setWalletLoading(false); }
  };
  useEffect(() => { if (step === 5 && walletBalance === null) fetchWallet(); }, [step]);

  const handleShip = async () => {
    setShipLoading(true);
    try {
      const r = await axios.post(`${API_URL}/rapidshyp/bulk-assign`, { orderNames: uniqueIds });
      setShipResults(r.data);
      setToast({ msg: `${r.data?.results?.filter(x=>x.success).length}/${uniqueIds.length} shipped` });
    } catch (e) { setToast({ msg: `Ship failed: ${e.response?.data?.error||e.message}`, err: true }); }
    finally { setShipLoading(false); }
  };

  const estCost = uniqueIds.length * 85;
  const rechargeNeeded = walletBalance !== null ? Math.max(0, estCost - walletBalance + 500) : estCost;
  const rechargeMsg = encodeURIComponent(`Hey, we need a wallet recharge for RapidShyp.\n\nToday's Order: ${uniqueIds.length} orders\nEstimated Shipping: Rs${estCost}\nCurrent Balance: Rs${walletBalance !== null ? walletBalance : 'N/A'}\nPlease recharge: Rs${rechargeNeeded}\n\nThanks`);

  const renderShip = () => (
    <div className="space-y-3">
      <div className="glass-card-sm p-4 space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-xs text-[rgba(245,245,245,0.4)]">Estimated cost</span>
          <span className="text-base font-black text-white">{uniqueIds.length} x Rs85 = <span className="text-[#e3cfd8]">Rs{estCost}</span></span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-[rgba(245,245,245,0.4)] flex items-center gap-2">
            Wallet <button onClick={fetchWallet} disabled={walletLoading} className="glass-btn p-1 rounded-md"><RefreshCw size={9} className={walletLoading?'animate-spin':''} /></button>
          </span>
          <span className={`text-base font-black ${walletBalance !== null && walletBalance < 0 ? 'text-[#ff1493]' : 'text-white'}`}>
            {walletBalance !== null ? `Rs${walletBalance}` : '...'}
          </span>
        </div>
        {walletBalance !== null && walletBalance < estCost && (
          <a href={`https://wa.me/?text=${rechargeMsg}`} target="_blank" rel="noopener noreferrer"
            className="glass-btn w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 text-amber-400 border-amber-400/20">
            <MessageSquare size={12} /> Ask to Recharge (Rs{rechargeNeeded} needed)
          </a>
        )}
      </div>
      {shipResults ? (
        <div className="glass-card-sm p-3 space-y-2">
          <div className="flex items-center gap-2"><CheckCircle size={13} className="text-emerald-400" /><span className="text-xs font-bold text-emerald-400">{shipResults.results?.filter(r=>r.success).length}/{shipResults.results?.length} assigned</span></div>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {shipResults.results?.map((r,i) => (
              <div key={i} className={`flex items-center justify-between text-[10px] px-2 py-1 rounded-lg ${r.success?'bg-[rgba(52,211,153,0.05)]':'bg-[rgba(255,20,147,0.05)]'}`}>
                <span className="font-bold text-white">#{r.orderId}</span>
                {r.success ? <span className="text-emerald-400 font-mono">{r.awb||'OK'}</span> : <span className="text-[#ff1493]">{r.message}</span>}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <button onClick={handleShip} disabled={shipLoading} className="glass-btn-accent w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2">
          {shipLoading ? <><RefreshCw size={13} className="animate-spin" /> Assigning...</> : <><Truck size={13} /> Confirm & Ship All</>}
        </button>
      )}
    </div>
  );

  // ═══ STEP 6: Labels ═══
  const handleLabels = async () => {
    setLabelLoading(true);
    try {
      const successResults = shipResults?.results?.filter(r => r.success) || [];
      const shipmentIds = successResults.map(r => r.shipmentId).filter(Boolean);
      const awbs = successResults.map(r => r.awb).filter(Boolean);

      // Fallback: if no AWBs/shipmentIds from ship step, use order IDs from the CSV
      // The server will resolve Shopify order IDs → RapidShyp shipment IDs via AWB lookup
      if (!shipmentIds.length && !awbs.length && uniqueIds.length > 0) {
        // Use the existing working orders to find any AWBs assigned earlier
        const orderAwbs = workingOrders.map(o => o.awb).filter(Boolean);
        if (orderAwbs.length > 0) {
          awbs.push(...orderAwbs);
        } else {
          // Last resort: send order IDs to server, it will search RapidShyp by Shopify order ID
          const r = await axios.post(`${API_URL}/rapidshyp/bulk-labels-by-orders`, { orderIds: uniqueIds });
          setLabelResult(r.data);
          const url = r.data?.label_pdf_url || r.data?.labelUrl;
          if (url) window.open(url, '_blank');
          setToast({ msg: 'Labels generated' });
          setLabelLoading(false);
          return;
        }
      }

      if (!shipmentIds.length && !awbs.length) { setToast({ msg: 'No shipped orders for labels', err: true }); setLabelLoading(false); return; }
      const r = await axios.post(`${API_URL}/rapidshyp/bulk-labels-dropbox`, { orderIds: shipmentIds, awbs, orders: workingOrders });
      setLabelResult(r.data);
      const url = r.data?.label_pdf_url || r.data?.labelUrl;
      if (url) window.open(url, '_blank');
      setToast({ msg: 'Labels generated' });
    } catch (e) { setToast({ msg: `Labels failed: ${e.response?.data?.error||e.message}`, err: true }); }
    finally { setLabelLoading(false); }
  };
  useEffect(() => { if (step === 6 && !labelResult && !labelLoading) handleLabels(); }, [step]);

  const renderLabels = () => {
    const labelUrl = labelResult?.label_pdf_url || labelResult?.labelUrl;
    return (
    <div className="space-y-3">
      <div className="glass-card-sm p-6 text-center space-y-3">
        {labelLoading ? (
          <div><RefreshCw size={28} className="mx-auto text-[#e3cfd8] animate-spin" /><p className="text-xs text-[rgba(245,245,245,0.4)] mt-2">generating...</p></div>
        ) : labelResult ? (
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="space-y-2">
            <CheckCircle size={40} className="mx-auto text-emerald-400" />
            <p className="text-sm font-bold text-white">labels ready</p>
            {labelUrl && <a href={labelUrl} target="_blank" rel="noopener noreferrer" className="glass-btn-accent px-5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2"><Download size={12} /> Download PDF</a>}
            {labelResult.dropboxPath && <p className="text-[9px] text-[rgba(245,245,245,0.2)]">Dropbox: {labelResult.dropboxPath}</p>}
          </motion.div>
        ) : (
          <div><AlertTriangle size={28} className="mx-auto text-amber-400" /><p className="text-xs text-[rgba(245,245,245,0.4)] mt-2">click to generate labels</p>
            <button onClick={handleLabels} className="glass-btn-accent px-5 py-2 rounded-xl text-xs font-bold mt-2"><FileText size={12} /> Generate Labels</button>
          </div>
        )}
      </div>
    </div>
    );
  };

  // ═══ STEP 7: Done ═══
  const renderDone = () => (
    <div className="flex flex-col items-center justify-center py-12 space-y-5">
      <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', damping: 12, stiffness: 200 }}>
        <div className="w-20 h-20 rounded-full bg-[rgba(52,211,153,0.1)] border border-[rgba(52,211,153,0.2)] flex items-center justify-center">
          <CheckCircle size={40} className="text-emerald-400" />
        </div>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="text-center space-y-1">
        <h2 className="text-xl font-black text-white">all done</h2>
        <p className="text-xs text-[rgba(245,245,245,0.3)]">orders fulfilled, backed up</p>
      </motion.div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="glass-card-sm p-4 flex gap-6 text-center">
        <div><div className="text-xl font-black text-white">{uniqueIds.length}</div><div className="text-[9px] text-[rgba(245,245,245,0.25)] uppercase">orders</div></div>
        <div><div className="text-xl font-black text-white">{workingOrders.length}</div><div className="text-[9px] text-[rgba(245,245,245,0.25)] uppercase">units</div></div>
        <div><div className="text-xl font-black text-emerald-400">{shipResults?.results?.filter(r=>r.success).length||'—'}</div><div className="text-[9px] text-[rgba(245,245,245,0.25)] uppercase">AWBs</div></div>
      </motion.div>
      <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} onClick={onClose} className="glass-btn-accent px-8 py-2.5 rounded-xl text-sm font-bold">Close</motion.button>
    </div>
  );

  const stepContent = [renderRepeatOrders, renderRTOSort, renderMissing, renderCSV, renderDownload, renderShip, renderLabels, renderDone];

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0" onClick={onClose} />
      <motion.div initial={{ scale: 0.9, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="relative w-full max-w-4xl max-h-[85vh] glass-panel rounded-3xl border border-[rgba(227,207,216,0.15)] shadow-[0_25px_80px_rgba(0,0,0,0.7)] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(255,255,255,0.05)] shrink-0">
          <div>
            <h1 className="text-base font-black text-white tracking-wide">Fulfill Orders</h1>
            <p className="text-[11px] text-[rgba(245,245,245,0.3)]">{uniqueIds.length} orders · {workingOrders.length} units</p>
          </div>
          <button onClick={onClose} className="glass-btn p-2 rounded-xl hover:bg-[rgba(255,255,255,0.05)]"><X size={18} className="text-[rgba(245,245,245,0.4)]" /></button>
        </div>

        {/* Step Bar */}
        <div className="flex items-center gap-0.5 px-4 py-2.5 overflow-x-auto shrink-0 border-b border-[rgba(255,255,255,0.04)]">
          {STEPS.map((s, i) => {
            const Icon = s.icon; const active = i === step; const completed = done.has(i);
            return (
              <button key={s.id} onClick={() => (completed || i <= step) && setStep(i)} disabled={!completed && i > step}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold tracking-wider uppercase whitespace-nowrap transition-all ${active ? 'bg-[rgba(227,207,216,0.12)] text-[#e3cfd8] border border-[rgba(227,207,216,0.2)]' : completed ? 'text-emerald-400/70' : 'text-[rgba(245,245,245,0.18)]'}`}>
                {completed ? <CheckCircle size={11} className="text-emerald-400" /> : <Icon size={11} />}
                <span className="hidden md:inline">{s.label}</span>
              </button>
            );
          })}
        </div>

        {/* Step Title */}
        <div className="px-6 pt-4 pb-1 shrink-0">
          <h2 className="text-lg font-black text-white">{STEPS[step]?.label}</h2>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.12, ease: 'easeOut' }}>
              {stepContent[step]?.()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        {step < STEPS.length - 1 && (
          <div className="flex items-center justify-between px-6 py-3.5 border-t border-[rgba(255,255,255,0.05)] shrink-0">
            <button onClick={goBack} disabled={step === 0} className={`glass-btn px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${step === 0 ? 'opacity-30' : ''}`}>
              <ArrowLeft size={13} /> Back
            </button>
            <span className="text-[10px] text-[rgba(245,245,245,0.2)] font-bold">{step + 1} / {STEPS.length}</span>
            <button onClick={goNext} className="glass-btn-accent px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5">
              Next <ArrowRight size={13} />
            </button>
          </div>
        )}

        {/* Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              onAnimationComplete={() => setTimeout(() => setToast(null), 2500)}
              className={`absolute bottom-16 left-1/2 -translate-x-1/2 z-10 glass-card px-4 py-2 text-xs font-bold ${toast.err ? 'text-[#ff1493]' : 'text-white'}`}>
              {toast.msg}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
