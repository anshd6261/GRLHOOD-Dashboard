import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, AlertTriangle, CheckCircle, XOctagon, RefreshCw, Globe, FileText, ExternalLink, TrendingUp, BarChart2 } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, PieChart, Pie } from 'recharts';

const API_BASE = import.meta.env.VITE_API_URL || '';
const API_URL = API_BASE ? `${API_BASE}/api` : '/api';

const COLORS = {
  critical: '#EF4444',
  warning: '#F59E0B',
  pass: '#10B981',
  info: '#3B82F6',
};

const ScoreRing = ({ score, size = 120, label }) => {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? COLORS.pass : score >= 40 ? COLORS.warning : COLORS.critical;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          className="transition-all duration-1000" />
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ width: size, height: size }}>
        <span className="text-3xl font-bold" style={{ color }}>{score}</span>
        <span className="text-[10px] text-[rgba(245,245,245,0.4)] uppercase tracking-wider">/100</span>
      </div>
      {label && <span className="text-xs text-[rgba(245,245,245,0.5)] mt-1">{label}</span>}
    </div>
  );
};

const SeverityBadge = ({ severity }) => {
  const config = {
    critical: { bg: 'bg-red-500/10', text: 'text-red-400', icon: XOctagon, label: 'Critical' },
    warning: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', icon: AlertTriangle, label: 'Warning' },
    pass: { bg: 'bg-green-500/10', text: 'text-green-400', icon: CheckCircle, label: 'Pass' },
  };
  const c = config[severity] || config.warning;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${c.bg} ${c.text}`}>
      <Icon size={10} /> {c.label}
    </span>
  );
};

export default function SEODashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [bingStatus, setBingStatus] = useState(null);
  const [submittingBing, setSubmittingBing] = useState(false);
  const [fixingAll, setFixingAll] = useState(false);
  const [fixResult, setFixResult] = useState(null);
  const [activeSection, setActiveSection] = useState('overview');

  useEffect(() => { fetchDashboard(); }, []);

  const fetchDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API_URL}/seo/dashboard`);
      setData(res.data.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  const fixAllSEO = async () => {
    if (!window.confirm('This will auto-fix all missing SEO titles, descriptions, and submit sitemap to Bing. Continue?')) return;
    setFixingAll(true);
    setFixResult(null);
    try {
      const res = await axios.post(`${API_URL}/seo/fix-all`);
      setFixResult(res.data.data);
      fetchDashboard(); // Refresh scores after fix
    } catch (e) {
      setFixResult({ error: e.response?.data?.error || e.message });
    } finally {
      setFixingAll(false);
    }
  };

  const submitBingSitemap = async () => {
    setSubmittingBing(true);
    try {
      const res = await axios.post(`${API_URL}/seo/bing/sitemap`);
      setBingStatus({ success: true, message: 'Sitemap submitted to Bing' });
    } catch (e) {
      setBingStatus({ success: false, message: e.response?.data?.error || e.message });
    } finally {
      setSubmittingBing(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-32">
        <RefreshCw size={24} className="animate-spin text-[#e3cfd8]" />
        <span className="ml-3 text-[rgba(245,245,245,0.5)]">Auditing SEO...</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="glass-card p-8 text-center">
        <XOctagon size={32} className="mx-auto mb-3 text-red-400" />
        <p className="text-red-400 mb-2">Failed to load SEO data</p>
        <p className="text-sm text-[rgba(245,245,245,0.4)] mb-4">{error}</p>
        <button onClick={fetchDashboard} className="glass-btn px-4 py-2 text-sm">Retry</button>
      </div>
    );
  }

  if (!data) return null;

  const { overview, issues, products, collections } = data;

  const scoreDistribution = [
    { name: 'Critical (0-29)', value: products.filter(p => p.score < 30).length, color: COLORS.critical },
    { name: 'Poor (30-49)', value: products.filter(p => p.score >= 30 && p.score < 50).length, color: COLORS.warning },
    { name: 'Good (50-69)', value: products.filter(p => p.score >= 50 && p.score < 70).length, color: COLORS.info },
    { name: 'Excellent (70+)', value: products.filter(p => p.score >= 70).length, color: COLORS.pass },
  ].filter(d => d.value > 0);

  const sections = [
    { id: 'overview', label: 'Overview', icon: BarChart2 },
    { id: 'products', label: 'Products', icon: FileText },
    { id: 'collections', label: 'Collections', icon: Globe },
    { id: 'actions', label: 'Actions', icon: TrendingUp },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f5f5f5]">SEO Dashboard</h1>
          <p className="text-sm text-[rgba(245,245,245,0.4)] mt-1">GRL® Store SEO Health Monitor</p>
        </div>
        <button onClick={fetchDashboard} disabled={loading}
          className="glass-btn flex items-center gap-2 px-4 py-2 text-sm">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Auditing...' : 'Refresh'}
        </button>
      </div>

      {/* Section Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {sections.map(s => {
          const Icon = s.icon;
          return (
            <button key={s.id} onClick={() => setActiveSection(s.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap
                ${activeSection === s.id
                  ? 'bg-[rgba(227,207,216,0.12)] text-[#e3cfd8] border border-[rgba(227,207,216,0.2)]'
                  : 'text-[rgba(245,245,245,0.4)] hover:text-[rgba(245,245,245,0.6)]'}`}>
              <Icon size={12} /> {s.label}
            </button>
          );
        })}
      </div>

      {/* ═══ OVERVIEW ═══ */}
      {activeSection === 'overview' && (
        <div className="space-y-6">
          {/* Score Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="glass-card p-5 flex flex-col items-center relative">
              <ScoreRing score={overview.overallScore} label="Overall" />
            </div>
            <div className="glass-card p-5 flex flex-col items-center relative">
              <ScoreRing score={overview.avgProductScore} size={100} label="Products" />
            </div>
            <div className="glass-card p-5 flex flex-col items-center relative">
              <ScoreRing score={overview.avgCollectionScore} size={100} label="Collections" />
            </div>
            <div className="glass-card p-5 space-y-3">
              <div className="text-xs text-[rgba(245,245,245,0.4)] uppercase tracking-wider">Stats</div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-[rgba(245,245,245,0.5)]">Products</span>
                  <span className="text-[#f5f5f5] font-medium">{overview.totalProducts}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[rgba(245,245,245,0.5)]">Collections</span>
                  <span className="text-[#f5f5f5] font-medium">{overview.totalCollections}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[rgba(245,245,245,0.5)]">Critical Issues</span>
                  <span className="text-red-400 font-medium">{overview.criticalIssueCount}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Issue Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="glass-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <XOctagon size={14} className="text-red-400" />
                <span className="text-xs text-[rgba(245,245,245,0.5)] uppercase">Missing Meta Descriptions</span>
              </div>
              <span className="text-2xl font-bold text-red-400">{issues.missingMetaProducts}</span>
              <span className="text-xs text-[rgba(245,245,245,0.3)] ml-1">products</span>
            </div>
            <div className="glass-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={14} className="text-yellow-400" />
                <span className="text-xs text-[rgba(245,245,245,0.5)] uppercase">Missing SEO Titles</span>
              </div>
              <span className="text-2xl font-bold text-yellow-400">{issues.missingTitleProducts}</span>
              <span className="text-xs text-[rgba(245,245,245,0.3)] ml-1">products</span>
            </div>
            <div className="glass-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={14} className="text-orange-400" />
                <span className="text-xs text-[rgba(245,245,245,0.5)] uppercase">Broken URLs (-copy)</span>
              </div>
              <span className="text-2xl font-bold text-orange-400">{issues.copyUrlProducts}</span>
              <span className="text-xs text-[rgba(245,245,245,0.3)] ml-1">products</span>
            </div>
          </div>

          {/* Score Distribution */}
          {scoreDistribution.length > 0 && (
            <div className="glass-card p-5">
              <h3 className="text-sm font-medium text-[rgba(245,245,245,0.6)] mb-4">Product SEO Score Distribution</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={scoreDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%"
                      outerRadius={70} innerRadius={40} paddingAngle={3}>
                      {scoreDistribution.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'rgba(20,20,30,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }} />
                    <Legend wrapperStyle={{ fontSize: '11px', color: 'rgba(245,245,245,0.5)' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Top Critical Issues */}
          {issues.topCritical.length > 0 && (
            <div className="glass-card p-5">
              <h3 className="text-sm font-medium text-red-400 mb-3 flex items-center gap-2">
                <XOctagon size={14} /> Top Critical Issues
              </h3>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {issues.topCritical.map((issue, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-[rgba(239,68,68,0.04)] border border-[rgba(239,68,68,0.08)]">
                    <XOctagon size={12} className="text-red-400 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-[#f5f5f5] truncate">{issue.source}</div>
                      <div className="text-[11px] text-[rgba(245,245,245,0.5)]">{issue.issue}</div>
                      <div className="text-[10px] text-[rgba(245,245,245,0.3)] mt-0.5">Fix: {issue.fix}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ PRODUCTS ═══ */}
      {activeSection === 'products' && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-medium text-[rgba(245,245,245,0.6)] mb-4">Product SEO Audit (Lowest Scores First)</h3>
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {products.map((p, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)] hover:border-[rgba(227,207,216,0.12)] transition-all">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold"
                  style={{ background: `rgba(${p.score < 30 ? '239,68,68' : p.score < 50 ? '245,158,11' : p.score < 70 ? '59,130,246' : '16,185,129'}, 0.1)`,
                    color: p.score < 30 ? COLORS.critical : p.score < 50 ? COLORS.warning : p.score < 70 ? COLORS.info : COLORS.pass }}>
                  {p.score}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[#f5f5f5] truncate">{p.title}</div>
                  <div className="text-[11px] text-[rgba(245,245,245,0.3)] truncate">/products/{p.handle}</div>
                </div>
                <div className="flex gap-1 flex-wrap justify-end">
                  {p.issues.map((issue, j) => (
                    <SeverityBadge key={j} severity={issue.severity} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ COLLECTIONS ═══ */}
      {activeSection === 'collections' && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-medium text-[rgba(245,245,245,0.6)] mb-4">Collection SEO Audit</h3>
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {collections.map((c, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)] hover:border-[rgba(227,207,216,0.12)] transition-all">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold"
                  style={{ background: `rgba(${c.score < 30 ? '239,68,68' : c.score < 50 ? '245,158,11' : c.score < 70 ? '59,130,246' : '16,185,129'}, 0.1)`,
                    color: c.score < 30 ? COLORS.critical : c.score < 50 ? COLORS.warning : c.score < 70 ? COLORS.info : COLORS.pass }}>
                  {c.score}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[#f5f5f5] truncate">{c.title}</div>
                  <div className="text-[11px] text-[rgba(245,245,245,0.3)] truncate">/collections/{c.handle}</div>
                </div>
                <div className="flex gap-1 flex-wrap justify-end">
                  {c.issues.map((issue, j) => (
                    <SeverityBadge key={j} severity={issue.severity} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ ACTIONS ═══ */}
      {activeSection === 'actions' && (
        <div className="space-y-4">
          {/* ONE-CLICK FIX ALL */}
          <div className="glass-card p-5 border border-[rgba(227,207,216,0.15)]">
            <h3 className="text-sm font-medium text-[#e3cfd8] mb-2 flex items-center gap-2">
              <TrendingUp size={14} /> ONE-CLICK: Fix All SEO
            </h3>
            <p className="text-xs text-[rgba(245,245,245,0.4)] mb-4">
              Automatically fixes ALL missing SEO titles + meta descriptions on every product and collection using GRL® voice templates. Also submits sitemap to Bing.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={fixAllSEO} disabled={fixingAll}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-[rgba(227,207,216,0.15)] text-[#e3cfd8] border border-[rgba(227,207,216,0.25)] hover:bg-[rgba(227,207,216,0.25)] transition-all disabled:opacity-50">
                {fixingAll ? <RefreshCw size={14} className="animate-spin" /> : <TrendingUp size={14} />}
                {fixingAll ? 'Fixing All SEO... (this takes a few minutes)' : 'FIX ALL SEO NOW'}
              </button>
            </div>
            {fixResult && !fixResult.error && (
              <div className="mt-4 p-3 rounded-lg bg-[rgba(16,185,129,0.06)] border border-[rgba(16,185,129,0.15)]">
                <div className="text-xs font-medium text-green-400 mb-2">FIX COMPLETE</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div><span className="text-[rgba(245,245,245,0.4)]">Products Fixed:</span> <span className="text-green-400 font-medium">{fixResult.productsFixed}</span></div>
                  <div><span className="text-[rgba(245,245,245,0.4)]">Skipped:</span> <span className="text-[rgba(245,245,245,0.5)]">{fixResult.productsSkipped}</span></div>
                  <div><span className="text-[rgba(245,245,245,0.4)]">Collections Fixed:</span> <span className="text-green-400 font-medium">{fixResult.collectionsFixed}</span></div>
                  <div><span className="text-[rgba(245,245,245,0.4)]">Bing:</span> <span className="text-green-400 font-medium">{fixResult.bingResult}</span></div>
                </div>
                {fixResult.brokenUrls?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-[rgba(255,255,255,0.05)]">
                    <div className="text-[10px] text-orange-400 font-medium mb-1">BROKEN URLs (fix manually in Shopify Admin):</div>
                    {fixResult.brokenUrls.map((u, i) => (
                      <div key={i} className="text-[10px] text-[rgba(245,245,245,0.3)]">/{u.type === 'product' ? 'products' : 'collections'}/{u.handle}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {fixResult?.error && (
              <div className="mt-4 p-3 rounded-lg bg-[rgba(239,68,68,0.06)] border border-[rgba(239,68,68,0.15)]">
                <div className="text-xs text-red-400">{fixResult.error}</div>
              </div>
            )}
          </div>

          {/* Bing Submit */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-medium text-[rgba(245,245,245,0.6)] mb-3 flex items-center gap-2">
              <Globe size={14} /> Bing Webmaster Tools
            </h3>
            <p className="text-xs text-[rgba(245,245,245,0.4)] mb-4">Submit sitemap to Bing for indexing. This tells Bing to crawl all your products and collections.</p>
            <div className="flex items-center gap-3">
              <button onClick={submitBingSitemap} disabled={submittingBing}
                className="glass-btn flex items-center gap-2 px-4 py-2 text-sm bg-[rgba(227,207,216,0.08)] hover:bg-[rgba(227,207,216,0.15)]">
                {submittingBing ? <RefreshCw size={14} className="animate-spin" /> : <Globe size={14} />}
                {submittingBing ? 'Submitting...' : 'Submit Sitemap to Bing'}
              </button>
              {bingStatus && (
                <span className={`text-xs ${bingStatus.success ? 'text-green-400' : 'text-red-400'}`}>
                  {bingStatus.message}
                </span>
              )}
            </div>
          </div>

          {/* Quick Links */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-medium text-[rgba(245,245,245,0.6)] mb-3 flex items-center gap-2">
              <ExternalLink size={14} /> SEO Tools
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { label: 'Google Search Console', url: 'https://search.google.com/search-console?resource_id=sc-domain:grlhood.in', desc: 'Monitor indexing & rankings' },
                { label: 'Google Rich Results Test', url: 'https://search.google.com/test/rich-results?url=https://www.grlhood.in', desc: 'Validate structured data' },
                { label: 'PageSpeed Insights', url: 'https://pagespeed.web.dev/analysis?url=https://www.grlhood.in', desc: 'Core Web Vitals' },
                { label: 'Bing Webmaster Tools', url: 'https://www.bing.com/webmasters/home', desc: 'Bing indexing & analytics' },
              ].map((link, i) => (
                <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)] hover:border-[rgba(227,207,216,0.15)] transition-all group">
                  <ExternalLink size={14} className="text-[rgba(245,245,245,0.3)] group-hover:text-[#e3cfd8] transition-colors" />
                  <div>
                    <div className="text-sm text-[#f5f5f5] group-hover:text-[#e3cfd8] transition-colors">{link.label}</div>
                    <div className="text-[10px] text-[rgba(245,245,245,0.3)]">{link.desc}</div>
                  </div>
                </a>
              ))}
            </div>
          </div>

          {/* SEO Checklist */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-medium text-[rgba(245,245,245,0.6)] mb-3 flex items-center gap-2">
              <CheckCircle size={14} /> SEO Checklist
            </h3>
            <div className="space-y-2">
              {[
                { done: true, label: 'Install Agentic-SEO-Skill' },
                { done: true, label: 'Run full SEO audit' },
                { done: overview.avgProductScore > 0, label: 'Audit product SEO scores' },
                { done: overview.avgCollectionScore > 0, label: 'Audit collection SEO scores' },
                { done: false, label: 'Submit sitemap to Google Search Console' },
                { done: false, label: 'Submit sitemap to Bing' },
                { done: false, label: 'Add JSON-LD schema to Shopify theme' },
                { done: false, label: 'Fix product meta descriptions' },
                { done: false, label: 'Fix product SEO titles' },
                { done: false, label: 'Clean up -copy URLs' },
                { done: false, label: 'Create keyword-targeted collections' },
                { done: false, label: 'Launch blog with foundation posts' },
                { done: false, label: 'Add image alt text to all products' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  {item.done
                    ? <CheckCircle size={12} className="text-green-400" />
                    : <div className="w-3 h-3 rounded-full border border-[rgba(245,245,245,0.2)]" />}
                  <span className={item.done ? 'text-[rgba(245,245,245,0.5)] line-through' : 'text-[rgba(245,245,245,0.6)]'}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
