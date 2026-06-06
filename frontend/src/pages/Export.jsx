// src/pages/Export.jsx
// ─────────────────────────────────────────────────────────────────────────────
// MNC-level export page with three formats:
//   1. Word (.docx)  — full report via backend, all statements + schedules
//   2. Excel (.xlsx) — 10 sheets, all data, via backend
//   3. PDF           — browser-native print: opens a print-optimised view
//                      of the FinancialStatements page in a new window,
//                      triggers window.print(). No server dependency, no
//                      puppeteer, works on Render free tier.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { exportAPI, engagementAPI, shareAPI } from '../api/client';
import { useStore } from '../store';
import toast from 'react-hot-toast';

const FORMATS = [
  {
    type:  'word',
    ext:   'DOCX',
    label: 'Word Document',
    desc:  'Complete annual report — all statements, notes, schedules, disclosures. Ready for client delivery.',
    icon:  '📄',
    color: 'border-blue-200 hover:border-blue-400',
    accent:'text-blue-600',
    badge: 'bg-blue-50 text-blue-700',
  },
  {
    type:  'excel',
    ext:   'XLSX',
    label: 'Excel Workbook',
    desc:  'Balance Sheet, P&L, OCI, Cash Flow, Notes, PPE, Intangibles, Deferred Tax, Related Party, Contingencies.',
    icon:  '📊',
    color: 'border-emerald-200 hover:border-emerald-400',
    accent:'text-emerald-600',
    badge: 'bg-emerald-50 text-emerald-700',
  },
  {
    type:  'pdf',
    ext:   'PDF',
    label: 'PDF (Print)',
    desc:  'Opens a print-ready view of the financial statements. Use browser Print → Save as PDF.',
    icon:  '🖨️',
    color: 'border-red-200 hover:border-red-400',
    accent:'text-red-600',
    badge: 'bg-red-50 text-red-700',
  },
];

export default function Export() {
  const { engagementId } = useParams();
  const { currentEngagement, currentClient, getCurrency, getCurrencySymbol } = useStore();
  const [loading,     setLoading]     = useState('');
  const [engagement,  setEngagement]  = useState(null);
  const [checklist,   setChecklist]   = useState({ fs: false, notes: false, schedules: false });
  const [shareLinks,  setShareLinks]  = useState([]);
  const [shareLoading, setShareLoading] = useState(false);
  const [showShare,   setShowShare]   = useState(false);
  const [shareDays,   setShareDays]   = useState(7);
  const [shareLabel,  setShareLabel]  = useState('');

  async function generateShareLink() {
    setShareLoading(true);
    try {
      const link = await shareAPI.create(engagementId, shareDays, shareLabel);
      setShareLinks(prev => [link, ...prev]);
      setShareLabel('');
      toast.success('Share link created!');
      await navigator.clipboard.writeText(link.url).catch(() => {});
    } catch (err) {
      toast.error(err?.error || err?.response?.data?.error || 'Failed to create link');
    } finally { setShareLoading(false); }
  }

  async function revokeLink(token) {
    try {
      await shareAPI.revoke(token);
      setShareLinks(prev => prev.filter(l => l.token !== token));
      toast.success('Link revoked');
    } catch { toast.error('Failed to revoke'); }
  }

  useEffect(() => {
    if (engagementId && showShare) {
      shareAPI.list(engagementId).then(links => setShareLinks(links || [])).catch(() => {});
    }
  }, [showShare, engagementId]);

  const currency   = getCurrency();
  const currSymbol = getCurrencySymbol();
  const method     = currentEngagement?.method || engagement?.method || 'AS';
  const isIFRS     = ['IFRS','IFRS_SME'].includes(method);

  useEffect(() => {
    if (engagementId) {
      engagementAPI.get(engagementId)
        .then(e => {
          setEngagement(e);
          // Simple checklist: check if FSLines, NoteGroups exist
          const hasTB    = (e._count?.tbVersions || 0) > 0;
          const hasFS    = (e._count?.fsLines     || 0) > 0;
          const hasNotes = (e._count?.noteGroups  || 0) > 0;
          setChecklist({ tb: hasTB, fs: hasFS, notes: hasNotes });
        })
        .catch(() => {});
    }
  }, [engagementId]);

  const download = async (type) => {
    if (type === 'pdf') {
      openPDF();
      return;
    }
    setLoading(type);
    try {
      const blob = type === 'word'
        ? await exportAPI.word(engagementId)
        : await exportAPI.excel(engagementId);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      const client = currentClient?.name || 'report';
      const fy     = currentEngagement?.financialYear || engagement?.financialYear || '';
      const safe   = client.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 30);
      a.download   = `${safe}-FY${fy}.${type === 'word' ? 'docx' : 'xlsx'}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Downloaded successfully');
    } catch (err) {
      toast.error(err?.error || err?.response?.data?.error || 'Export failed — generate Financial Statements first');
    } finally { setLoading(''); }
  };

  const openPDF = () => {
    // Open the FinancialStatements page in a new window sized for A4
    // The page has @media print styles that hide navigation and format for paper
    const url = `${window.location.origin}/engagements/${engagementId}/fs?print=1`;
    const win = window.open(url, '_blank', 'width=900,height=1100');
    if (win) {
      // Give the page time to render, then trigger print
      win.addEventListener('load', () => {
        setTimeout(() => {
          win.print();
        }, 2500); // wait for fonts + data to load
      });
      toast.success('Print window opened — use "Save as PDF" in the print dialog');
    } else {
      toast.error('Popup blocked — please allow popups for this site');
    }
  };

  const readyToExport = checklist.fs && checklist.notes;

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Export Report</h1>
        <p className="text-slate-500 text-sm mt-1">
          Download the complete financial report for{' '}
          <strong>{currentClient?.name || 'this client'}</strong>
          {currentEngagement?.financialYear && ` · FY ${currentEngagement.financialYear}`}
          {method && ` · ${method}`}
        </p>
      </div>

      {/* Pre-export checklist */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-8">
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">Pre-Export Checklist</h2>
        <div className="grid grid-cols-3 gap-4">
          {[
            { key: 'tb',    label: 'Trial Balance uploaded',          hint: 'Upload TB first' },
            { key: 'fs',    label: 'Financial Statements generated',  hint: 'Go to Statements → Generate' },
            { key: 'notes', label: 'Notes generated',                  hint: 'Go to Notes → Generate Notes' },
          ].map(item => (
            <div key={item.key} className={`flex items-center gap-2.5 p-3 rounded-xl border ${checklist[item.key] ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
              <span className={`text-lg flex-shrink-0 ${checklist[item.key] ? 'text-emerald-500' : 'text-slate-300'}`}>
                {checklist[item.key] ? '✓' : '○'}
              </span>
              <div>
                <p className={`text-xs font-semibold ${checklist[item.key] ? 'text-emerald-800' : 'text-slate-500'}`}>
                  {item.label}
                </p>
                {!checklist[item.key] && (
                  <p className="text-xs text-slate-400 mt-0.5">{item.hint}</p>
                )}
              </div>
            </div>
          ))}
        </div>
        {!readyToExport && (
          <p className="text-xs text-amber-600 mt-3 flex items-center gap-1">
            ⚠ Complete the checklist above before exporting — otherwise the document will be incomplete.
          </p>
        )}
      </div>

      {/* Export format cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        {FORMATS.map(({ type, ext, label, desc, icon, color, accent, badge }) => (
          <button
            key={type}
            onClick={() => download(type)}
            disabled={loading === type}
            className={`bg-white border-2 rounded-2xl p-6 text-left transition-all hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed ${color}`}
          >
            {/* Extension badge */}
            <div className="flex items-center justify-between mb-4">
              <span className={`text-xs font-bold px-2 py-1 rounded-lg ${badge}`}>{ext}</span>
              <span className="text-2xl">{icon}</span>
            </div>

            <div className={`text-3xl font-black mb-1 ${accent}`}>{ext}</div>
            <div className="font-semibold text-slate-800 text-sm">{label}</div>
            <div className="text-slate-500 text-xs mt-2 leading-relaxed">{desc}</div>

            <div className={`mt-5 text-xs font-semibold ${loading === type ? 'text-slate-400' : accent}`}>
              {loading === type
                ? '⏳ Generating...'
                : type === 'pdf'
                ? '🖨️ Open print view →'
                : '⬇ Download →'}
            </div>
          </button>
        ))}
      </div>

      {/* What's included */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">What's Included</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2">
          {[
            'Cover Page',
            'Table of Contents',
            "Director's Report",
            "Auditor's Report",
            'Balance Sheet',
            'Profit & Loss Statement',
            ...(isIFRS || method === 'IND_AS' ? ['Other Comprehensive Income'] : []),
            'Cash Flow Statement',
            ...(isIFRS || method === 'IND_AS' ? ['Statement of Changes in Equity'] : []),
            'Notes to Financial Statements',
            'Accounting Policies',
            'PPE Schedule',
            'Intangibles Schedule',
            'Deferred Tax Working',
            'Related Party Disclosures',
            'Contingent Liabilities',
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2 py-1">
              <span className="text-emerald-500 text-xs">✓</span>
              <span className="text-xs text-slate-600">{item}</span>
            </div>
          ))}
        </div>

        {/* PDF instructions */}
        <div className="mt-5 p-4 bg-slate-50 border border-slate-200 rounded-xl">
          <p className="text-xs font-semibold text-slate-700 mb-2">🖨️ How to save as PDF</p>
          <ol className="text-xs text-slate-500 space-y-1 list-decimal list-inside">
            <li>Click "PDF (Print)" — a new window opens with the financial statements</li>
            <li>Wait 2–3 seconds for all data to load</li>
            <li>In the print dialog, set Destination to "Save as PDF"</li>
            <li>Set Paper size to A4 and Margins to Minimum or None</li>
            <li>Click Save</li>
          </ol>
        </div>
      </div>

      {/* Client Share Portal */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Client Share Portal</h2>
            <p className="text-xs text-slate-400 mt-1">Generate a secure link to share financial statements with your client — no login required.</p>
          </div>
          <button onClick={() => setShowShare(v => !v)}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-700 font-medium">
            {showShare ? 'Hide' : '🔗 Manage Share Links'}
          </button>
        </div>

        {showShare && (
          <div className="mt-4 space-y-4">
            {/* Create new link */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <p className="text-xs font-semibold text-slate-600 mb-3">Create New Share Link</p>
              <div className="flex gap-3 flex-wrap items-end">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Label (optional)</label>
                  <input value={shareLabel} onChange={e => setShareLabel(e.target.value)}
                    placeholder="e.g. For Director Review"
                    className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 w-56"/>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Expires in</label>
                  <select value={shareDays} onChange={e => setShareDays(Number(e.target.value))}
                    className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    {[3,7,14,30].map(d => <option key={d} value={d}>{d} days</option>)}
                  </select>
                </div>
                <button onClick={generateShareLink} disabled={shareLoading}
                  className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-medium">
                  {shareLoading ? 'Creating…' : '+ Generate Link'}
                </button>
              </div>
            </div>

            {/* Active links */}
            {shareLinks.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-600">Active Links</p>
                {shareLinks.map(link => (
                  <div key={link.token} className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 truncate">{link.url}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {link.label && `${link.label} · `}
                        Expires {new Date(link.expiresAt).toLocaleDateString('en-GB')} ·
                        {link.viewCount || 0} views
                      </p>
                    </div>
                    <button onClick={() => navigator.clipboard.writeText(link.url).then(() => toast.success('Copied!'))}
                      className="text-xs px-2 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">
                      Copy
                    </button>
                    <button onClick={() => revokeLink(link.token)}
                      className="text-xs px-2 py-1.5 border border-red-200 rounded-lg hover:bg-red-50 text-red-600">
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}
            {shareLinks.length === 0 && <p className="text-xs text-slate-400 text-center py-3">No active share links. Create one above.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
