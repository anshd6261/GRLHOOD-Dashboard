import React, { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import {
  Download, RefreshCw, Truck, FileText, CheckCircle, AlertTriangle,
  PlayCircle, Trash2, ChevronDown, ChevronUp, Calendar, Package, ExternalLink
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';
const API_URL = API_BASE ? `${API_BASE}/api` : '/api';

const STEP_LABELS = ['Repeats', 'RTO Sort', 'Devices', 'CSV', 'Download', 'Ship', 'Labels', 'Done'];

const loadRuns = () => {
  try { return JSON.parse(localStorage.getItem('fulfillment_runs') || '[]'); } catch { return []; }
};

export default function FulfillmentHistory({ onResume }) {
  const [runs, setRuns] = useState(loadRuns);
  const [expanded, setExpanded] = useState(new Set());
  const [eddMap, setEddMap] = useState({}); // runId -> { awb: { edd, status, orderId } }
  const [eddLoading, setEddLoading] = useState(null);
  const [csvLoading, setCsvLoading] = useState(null);
  const [toast, setToast] = useState(null);

  const refresh = () => setRuns(loadRuns());

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  const toggleExpand = (id) => setExpanded(prev => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });

  const deleteRun = (id) => {
    if (!confirm('Remove this run from history?')) return;
    const next = runs.filter(r => r.id !== id);
    localStorage.setItem('fulfillment_runs', JSON.stringify(next));
    setRuns(next);
  };

  // Fetch expected delivery dates for a run's AWBs via iThink tracking (max 10 AWB/request)
  const fetchEdd = useCallback(async (run) => {
    const awbToOrder = {};
    (run.shipResults?.results || []).forEach(r => { if (r.success && r.awb) awbToOrder[r.awb] = r.orderId; });
    const awbs = Object.keys(awbToOrder);
    if (!awbs.length) { setToast({ msg: 'No AWBs in this run', err: true }); return; }
    setEddLoading(run.id);
    const collected = {};
    try {
      for (let i = 0; i < awbs.length; i += 10) {
        const chunk = awbs.slice(i, i + 10);
        const r = await axios.post(`${API_URL}/rapidshyp/track`, { awbs: chunk });
        const data = r.data?.data || {};
        Object.entries(data).forEach(([awb, info]) => {
          collected[awb] = {
            orderId: awbToOrder[awb],
            edd: info?.expected_delivery_date || info?.promise_delivery_date || '',
            status: info?.current_status || '',
            courier: info?.logistic || '',
          };
        });
      }
      setEddMap(prev => ({ ...prev, [run.id]: collected }));
      setToast({ msg: `Tracked ${Object.keys(collected).length}/${awbs.length} shipments` });
    } catch (e) {
      setToast({ msg: `Tracking failed: ${e.response?.data?.error || e.message}`, err: true });
    } finally { setEddLoading(null); }
  }, []);

  // Re-download the run's CSVs from its saved rows
  const downloadCsv = async (run, type) => {
    if (!run.workingOrders?.length) { setToast({ msg: 'No CSV rows saved for this run', err: true }); return; }
    setCsvLoading(`${run.id}_${type}`);
    try {
      const res = await axios.post(`${API_URL}/download`, { rows: run.workingOrders, skipHistory: true, type }, { responseType: 'blob' });
      const u = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = u;
      a.download = res.headers['x-filename'] || `${run.batchName || 'Order'} ${type}.csv`;
      a.click();
      setTimeout(() => window.URL.revokeObjectURL(u), 1000);
    } catch (e) {
      setToast({ msg: `CSV failed: ${e.message}`, err: true });
    } finally { setCsvLoading(null); }
  };

  const downloadLabels = async (run) => {
    const url = run.labelResult?.label_pdf_url;
    if (!url) return;
    const fileName = `${run.batchName || 'Order'} - Labels.pdf`;
    try {
      const proxyUrl = `${API_URL}/proxy-pdf?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(fileName)}`;
      const pr = await fetch(proxyUrl);
      if (!pr.ok) throw new Error('proxy failed');
      const bl = new Blob([await pr.arrayBuffer()], { type: 'application/pdf' });
      const bu = URL.createObjectURL(bl);
      const a = document.createElement('a'); a.href = bu; a.download = fileName; a.click();
      setTimeout(() => URL.revokeObjectURL(bu), 1000);
    } catch { window.open(url, '_blank'); }
  };

  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 opacity-30">
        <Package size={48} />
        <div className="mt-4 font-medium tracking-wider text-sm">No fulfillment runs yet</div>
        <div className="mt-1 text-xs">Runs appear here when you start the Fulfill Orders wizard</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-24">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-bold text-[rgba(245,245,245,0.4)] uppercase tracking-[0.15em]">Fulfillment History</h2>
        <button onClick={refresh} className="glass-icon-btn" title="Refresh"><RefreshCw size={13} /></button>
      </div>

      {runs.map(run => {
        const isOpen = expanded.has(run.id);
        const shipped = (run.shipResults?.results || []).filter(r => r.success);
        const failed = (run.shipResults?.results || []).filter(r => !r.success);
        const isDone = !!run.completed;
        const stepLabel = STEP_LABELS[run.step] || '—';
        const edd = eddMap[run.id];

        return (
          <div key={run.id} className="glass-card overflow-hidden">
            {/* Header */}
            <div className="p-4 cursor-pointer" onClick={() => toggleExpand(run.id)}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isDone ? 'bg-[rgba(52,211,153,0.1)]' : 'bg-[rgba(251,191,36,0.1)]'}`}>
                    {isDone ? <CheckCircle size={16} className="text-emerald-400" /> : <PlayCircle size={16} className="text-amber-400" />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate">{run.batchName || run.id}</div>
                    <div className="text-[10px] text-[rgba(245,245,245,0.3)] flex items-center gap-1.5 flex-wrap">
                      <Calendar size={9} />
                      {new Date(run.startedAt || run.updatedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      <span>·</span>
                      {isDone
                        ? <span className="text-emerald-400 font-bold">Completed</span>
                        : <span className="text-amber-400 font-bold">In progress — {stepLabel} step</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-right shrink-0">
                  <div><div className="text-sm font-black text-white">{run.orderCount || 0}</div><div className="text-[8px] uppercase text-[rgba(245,245,245,0.25)]">orders</div></div>
                  <div><div className="text-sm font-black text-white">{run.unitCount || 0}</div><div className="text-[8px] uppercase text-[rgba(245,245,245,0.25)]">units</div></div>
                  <div><div className="text-sm font-black text-[#e3cfd8]">₹{(run.prepaidValue || 0).toLocaleString('en-IN')}</div><div className="text-[8px] uppercase text-[rgba(245,245,245,0.25)]">prepaid</div></div>
                  <div><div className="text-sm font-black text-amber-400">₹{(run.codValue || 0).toLocaleString('en-IN')}</div><div className="text-[8px] uppercase text-[rgba(245,245,245,0.25)]">cod</div></div>
                  <div><div className="text-sm font-black text-emerald-400">{shipped.length}</div><div className="text-[8px] uppercase text-[rgba(245,245,245,0.25)]">awbs</div></div>
                  {isOpen ? <ChevronUp size={14} className="text-[rgba(245,245,245,0.3)]" /> : <ChevronDown size={14} className="text-[rgba(245,245,245,0.3)]" />}
                </div>
              </div>

              {/* Errors banner (collapsed view) */}
              {failed.length > 0 && (
                <div className="mt-2 text-[10px] text-[#ff1493] flex items-center gap-1.5">
                  <AlertTriangle size={10} /> {failed.length} iThink error{failed.length > 1 ? 's' : ''} — expand for details
                </div>
              )}
            </div>

            {/* Expanded */}
            {isOpen && (
              <div className="border-t border-[rgba(227,207,216,0.06)] bg-[rgba(0,0,0,0.12)] p-4 space-y-4">
                {/* Actions */}
                <div className="flex items-center gap-2 flex-wrap">
                  {!isDone && (
                    <button onClick={() => onResume(run)} className="glass-btn-accent px-4 py-2 rounded-xl text-[11px] font-bold flex items-center gap-1.5">
                      <PlayCircle size={12} /> Resume from {stepLabel}
                    </button>
                  )}
                  <button onClick={() => downloadCsv(run, 'supplier')} disabled={csvLoading === `${run.id}_supplier`}
                    className="glass-btn px-3.5 py-2 rounded-xl text-[11px] font-bold flex items-center gap-1.5">
                    {csvLoading === `${run.id}_supplier` ? <RefreshCw size={11} className="animate-spin" /> : <Download size={11} />} Supplier CSV
                  </button>
                  <button onClick={() => downloadCsv(run, 'financial')} disabled={csvLoading === `${run.id}_financial`}
                    className="glass-btn px-3.5 py-2 rounded-xl text-[11px] font-bold flex items-center gap-1.5">
                    {csvLoading === `${run.id}_financial` ? <RefreshCw size={11} className="animate-spin" /> : <Download size={11} />} Financial CSV
                  </button>
                  {run.labelResult?.label_pdf_url && (
                    <button onClick={() => downloadLabels(run)} className="glass-btn px-3.5 py-2 rounded-xl text-[11px] font-bold flex items-center gap-1.5 text-[#e3cfd8] border-[rgba(227,207,216,0.25)]">
                      <FileText size={11} /> Labels PDF
                    </button>
                  )}
                  {shipped.length > 0 && (
                    <button onClick={() => fetchEdd(run)} disabled={eddLoading === run.id}
                      className="glass-btn px-3.5 py-2 rounded-xl text-[11px] font-bold flex items-center gap-1.5 text-emerald-400 border-emerald-400/20">
                      {eddLoading === run.id ? <RefreshCw size={11} className="animate-spin" /> : <Truck size={11} />} Fetch Delivery Dates
                    </button>
                  )}
                  <button onClick={() => deleteRun(run.id)} className="glass-icon-btn text-red-400 hover:bg-[rgba(239,68,68,0.1)] ml-auto" title="Remove from history">
                    <Trash2 size={12} />
                  </button>
                </div>

                {/* Meta */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[10px]">
                  <div>
                    <div className="uppercase font-bold text-[rgba(245,245,245,0.25)] tracking-wider mb-0.5">NBE Portal</div>
                    <div className={run.nbeUploaded ? 'text-emerald-400 font-bold' : 'text-[rgba(245,245,245,0.4)]'}>{run.nbeUploaded ? 'Order placed' : 'Not uploaded'}</div>
                  </div>
                  <div>
                    <div className="uppercase font-bold text-[rgba(245,245,245,0.25)] tracking-wider mb-0.5">Dropbox</div>
                    <div className="text-[rgba(245,245,245,0.5)] truncate">{run.labelResult?.dropboxPath || (run.dlStatus === 'done' ? 'CSVs backed up' : '—')}</div>
                  </div>
                  <div>
                    <div className="uppercase font-bold text-[rgba(245,245,245,0.25)] tracking-wider mb-0.5">Shipped</div>
                    <div className="text-[rgba(245,245,245,0.5)]">{shipped.length}/{(run.shipResults?.results || []).length || run.orderCount || 0}</div>
                  </div>
                  <div>
                    <div className="uppercase font-bold text-[rgba(245,245,245,0.25)] tracking-wider mb-0.5">Last updated</div>
                    <div className="text-[rgba(245,245,245,0.5)]">{new Date(run.updatedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>

                {/* iThink errors */}
                {failed.length > 0 && (
                  <div>
                    <div className="text-[9px] uppercase font-bold text-[#ff1493] tracking-wider mb-1.5 flex items-center gap-1"><AlertTriangle size={9} /> iThink Errors</div>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {failed.map((f, i) => (
                        <div key={i} className="text-[10px] px-2.5 py-1.5 rounded-lg bg-[rgba(255,20,147,0.05)] border border-[rgba(255,20,147,0.1)]">
                          <span className="font-bold text-white">#{f.orderId}</span>
                          <span className="text-[#ff1493] ml-2">{f.message}</span>
                          {f.diagnosis?.issue && <div className="text-amber-400 text-[9px] mt-0.5">{f.diagnosis.issue}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Shipped orders with AWB + EDD */}
                {shipped.length > 0 && (
                  <div>
                    <div className="text-[9px] uppercase font-bold text-[rgba(245,245,245,0.25)] tracking-wider mb-1.5">Shipments</div>
                    <div className="space-y-1 max-h-56 overflow-y-auto">
                      {shipped.map((s, i) => {
                        const t = edd?.[s.awb];
                        return (
                          <div key={i} className="flex items-center justify-between text-[10px] px-2.5 py-1.5 rounded-lg bg-[rgba(52,211,153,0.04)]">
                            <span className="font-bold text-white">#{s.orderId}</span>
                            <span className="flex items-center gap-3">
                              {s.courier && <span className="uppercase text-[9px] font-bold text-[rgba(245,245,245,0.35)]">{s.courier}</span>}
                              {t?.status && <span className="text-[9px] text-[#e3cfd8]">{t.status}</span>}
                              {t?.edd && <span className="text-[9px] text-emerald-400 font-bold">EDD {t.edd}</span>}
                              <a href={s.trackingUrl || `https://my.ithinklogistics.com/shipments`} target="_blank" rel="noopener noreferrer"
                                className="font-mono text-emerald-400 hover:underline flex items-center gap-1">
                                {s.awb} <ExternalLink size={8} className="opacity-50" />
                              </a>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Units */}
                {run.workingOrders?.length > 0 && (
                  <details>
                    <summary className="text-[9px] uppercase font-bold text-[rgba(245,245,245,0.25)] tracking-wider cursor-pointer select-none">
                      All units ({run.workingOrders.length})
                    </summary>
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-left">
                        <thead><tr className="border-b border-[rgba(255,255,255,0.06)]">
                          {['Order', 'Customer', 'Category', 'Model', 'SKU', 'Payment', 'Price'].map(h => (
                            <th key={h} className="text-[8px] font-bold text-[rgba(245,245,245,0.3)] uppercase tracking-wider px-2 py-1.5 whitespace-nowrap">{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {run.workingOrders.map((r, i) => (
                            <tr key={i} className="border-b border-[rgba(255,255,255,0.03)]">
                              <td className="text-[9px] text-white font-bold px-2 py-1">{r.orderId}</td>
                              <td className="text-[9px] text-[rgba(245,245,245,0.5)] px-2 py-1">{r.customerName}</td>
                              <td className="text-[9px] text-[rgba(245,245,245,0.45)] px-2 py-1">{r.category}</td>
                              <td className="text-[9px] text-[rgba(245,245,245,0.45)] px-2 py-1">{r.model}</td>
                              <td className="text-[9px] text-[rgba(245,245,245,0.3)] font-mono px-2 py-1">{r.sku}</td>
                              <td className="text-[9px] text-[rgba(245,245,245,0.45)] px-2 py-1">{r.payment}</td>
                              <td className="text-[9px] text-[rgba(245,245,245,0.45)] px-2 py-1">₹{r.price || 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>
        );
      })}

      {toast && (
        <div className={`fixed bottom-8 right-8 z-[300] px-5 py-3 rounded-2xl shadow-2xl border backdrop-blur-xl bg-[rgba(26,26,30,0.9)] border-[rgba(227,207,216,0.2)] text-sm font-bold ${toast.err ? 'text-[#ff1493]' : 'text-white'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
