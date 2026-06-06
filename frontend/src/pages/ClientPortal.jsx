// src/pages/ClientPortal.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Public read-only view of financial statements via share link.
// No authentication. Accessed via /view/:token
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const METHOD_LABEL = {
  AS:       'Indian Accounting Standards (AS)',
  IND_AS:   'Indian Accounting Standards (Ind AS)',
  IFRS:     'International Financial Reporting Standards (IFRS)',
  IFRS_SME: 'IFRS for Small and Medium-sized Entities',
};

function fmtNum(n, locale = 'en-IN') {
  const v = Number(n || 0);
  const a = Math.abs(v);
  const s = a.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? `(${s})` : s;
}

export default function ClientPortal() {
  const { token }   = useParams();
  const [data,   setData]   = useState(null);
  const [error,  setError]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab,    setTab]    = useState('BS');

  useEffect(() => {
    fetch(`/api/public/${token}`)
      .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e)))
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e?.error || 'This link has expired or is no longer valid.'); setLoading(false); });
  }, [token]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"/>
        <p className="text-slate-500 text-sm">Loading financial statements…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-sm text-center bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
        <div className="text-5xl mb-4">🔗</div>
        <h2 className="text-lg font-semibold text-slate-800 mb-2">Link Unavailable</h2>
        <p className="text-slate-500 text-sm">{error}</p>
        <p className="text-xs text-slate-400 mt-4">Contact your CA firm for a new link.</p>
      </div>
    </div>
  );

  const { engagement, fsLines, noteGroups, shareLink } = data;
  const locale    = engagement.clientRegion === 'UAE' ? 'en-US' : 'en-IN';
  const currency  = engagement.clientRegion === 'UAE' ? 'AED' : '₹';
  const bsLines   = fsLines.filter(l => l.sheet === 'BS');
  const plLines   = fsLines.filter(l => l.sheet === 'PL');
  const ociLines  = fsLines.filter(l => l.sheet === 'OCI');
  const tabs      = ['BS','PL',...(ociLines.length?['OCI']:[]),'Notes'];

  const tabLabel  = { BS: 'Balance Sheet', PL: 'Profit & Loss', OCI: 'OCI', Notes: 'Notes' };

  const renderTable = (lines) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-2/3">Particulars</th>
            <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{currency} (Actuals)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {lines.filter(l => !l.groupName?.startsWith('__')).map((l, i) => (
            <tr key={i} className="hover:bg-slate-50 transition-colors">
              <td className="px-4 py-2.5 text-slate-700">{l.groupName}</td>
              <td className="px-4 py-2.5 text-right font-mono text-slate-800">{fmtNum(l.totalFinalNet, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const daysLeft = Math.ceil((new Date(shareLink.expiresAt) - new Date()) / 86400000);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-700 to-purple-700 px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <p className="text-indigo-200 text-xs mb-1">Financial Statements — Read Only</p>
          <h1 className="text-2xl font-bold text-white">{engagement.clientName}</h1>
          <p className="text-indigo-200 text-sm mt-1">
            {METHOD_LABEL[engagement.method] || engagement.method} · FY {engagement.financialYear}
          </p>
          {engagement.cin && <p className="text-indigo-300 text-xs mt-1">CIN: {engagement.cin}</p>}
          {engagement.tradeLicense && <p className="text-indigo-300 text-xs mt-1">Trade License: {engagement.tradeLicense}</p>}
        </div>
      </div>

      {/* Expiry notice */}
      <div className="max-w-4xl mx-auto px-6 mt-4">
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium ${daysLeft <= 1 ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-amber-50 border border-amber-200 text-amber-700'}`}>
          <span>🔗</span>
          <span>
            Shared by {engagement.firmName} ·
            {daysLeft > 0 ? ` Link expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}` : ' Link expires today'} ·
            Viewed {shareLink.viewCount} time{shareLink.viewCount !== 1 ? 's' : ''}
          </span>
          <span className="ml-auto text-xs opacity-70">Read-only · Not for distribution</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-4xl mx-auto px-6 mt-4">
        <div className="flex gap-0 border-b border-slate-200 bg-white rounded-t-2xl overflow-hidden">
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-700 bg-indigo-50' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
              {tabLabel[t]}
            </button>
          ))}
        </div>

        <div className="bg-white border border-t-0 border-slate-200 rounded-b-2xl overflow-hidden mb-8">
          {tab === 'BS' && renderTable(bsLines)}
          {tab === 'PL' && renderTable(plLines)}
          {tab === 'OCI' && renderTable(ociLines)}
          {tab === 'Notes' && (
            <div className="divide-y divide-slate-100">
              {noteGroups.map(ng => (
                <div key={ng.id} className="p-5">
                  <h3 className="font-semibold text-indigo-700 mb-2 text-sm">Note {ng.noteNumber} — {ng.title}</h3>
                  {ng.noteContent && <p className="text-xs text-slate-500 italic mb-3">{ng.noteContent}</p>}
                  {ng.noteDetails?.length > 0 && (
                    <table className="w-full text-xs">
                      <tbody className="divide-y divide-slate-100">
                        {ng.noteDetails.map((d, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="py-1.5 px-2 text-slate-600">{d.accountName || d.accountNumber}</td>
                            <td className="py-1.5 px-2 text-right font-mono text-slate-800">{fmtNum(d.finalNet, locale)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
              {noteGroups.length === 0 && (
                <p className="p-6 text-sm text-slate-400 text-center">Notes not yet generated by the CA firm.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="max-w-4xl mx-auto px-6 pb-8">
        <p className="text-xs text-center text-slate-400">
          These financial statements are prepared by {engagement.firmName} and shared for review purposes only.
          They do not constitute a certified or audited financial report unless otherwise stated.
        </p>
      </div>
    </div>
  );
}
