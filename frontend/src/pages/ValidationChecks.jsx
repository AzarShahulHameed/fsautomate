import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { engagementAPI, fsAPI } from '../api/client';
import { useStore } from '../store';
import toast from 'react-hot-toast';

const CHECK_META = {
  TB_BALANCE:              { label: 'Trial Balance Check',                   icon: '⚖️',  desc: 'Sum of all TB finalNet must equal zero' },
  UNMAPPED_ITEMS:          { label: 'Unmapped Items',                        icon: '🗺️',  desc: 'All TB sub-groupings must be mapped to FS heads' },
  CROSS_CASTING_BS:        { label: 'Balance Sheet Cross Cast',              icon: '📊',  desc: 'Assets = Equity + Liabilities' },
  CROSS_CASTING_PL:        { label: 'P&L Summary',                          icon: '📈',  desc: 'Revenue − Expenses = Net Profit' },
  CASTING:                 { label: 'Note Casting Check',                   icon: '🔢',  desc: 'Note detail totals must match FS line amounts' },
  RECONCILIATION_RE:       { label: 'Retained Earnings Reconciliation',     icon: '🔄',  desc: 'Opening RE + Profit = Closing RE' },
  RECONCILIATION_CASH:     { label: 'Cash Reconciliation',                  icon: '💰',  desc: 'BS Cash = CFS Closing Cash' },
  COMPLETENESS:            { label: 'Completeness Check',                   icon: '✅',  desc: 'All BS lines have note references' },
  SIGN_CHECK:              { label: 'Sign Convention Check',                icon: '±',   desc: 'Assets and Equity should be positive' },
  UNMAPPED:                { label: 'Unmapped Warning',                     icon: '⚠️',  desc: 'Items excluded from FS' },
  OCI_CHECK:               { label: 'OCI Compliance Check',                 icon: '📋',  desc: 'Other Comprehensive Income items per method' },
  SCHEDULE_III:            { label: 'Schedule III Structure',                icon: '🏛️',  desc: 'Non-current / Current classification per Companies Act' },
  IAS1_STRUCTURE:          { label: 'IAS 1 Structure Check',                icon: '🌐',  desc: 'Non-current / Current split per IAS 1' },
  REVENUE_CHECK:           { label: 'Revenue Check',                        icon: '💵',  desc: 'Revenue must be present in P&L' },
  // Schedule casting checks
  SCHEDULE_PPE:            { label: 'PPE Schedule Reconciliation',          icon: '🏗️',  desc: 'PPE schedule closing net block must equal Balance Sheet PPE amount' },
  SCHEDULE_INTANGIBLES:    { label: 'Intangibles Schedule Reconciliation',  icon: '💡',  desc: 'Intangibles schedule closing net block must equal Balance Sheet amount' },
  SCHEDULE_DEPRECIATION:   { label: 'Depreciation Cross-Check',            icon: '📉',  desc: 'Depreciation in PPE/Intangibles schedule must equal P&L depreciation expense' },
  SCHEDULE_DEFERRED_TAX:   { label: 'Deferred Tax Reconciliation',         icon: '🔄',  desc: 'Deferred tax working net balance must equal Balance Sheet DTA/DTL' },
  SCHEDULE_EPS_PAT:        { label: 'EPS PAT Verification',                icon: '📈',  desc: 'EPS working PAT must match P&L computed profit after tax' },
};

const STATUS_CONFIG = {
  PASS:    { bg: 'bg-emerald-950/50 border-emerald-800', badge: 'bg-emerald-900 text-emerald-300', icon: '✓', dot: 'bg-emerald-500' },
  FAIL:    { bg: 'bg-red-950/50 border-red-800',         badge: 'bg-red-900 text-red-300',         icon: '✗', dot: 'bg-red-500' },
  WARNING: { bg: 'bg-amber-950/50 border-amber-800',     badge: 'bg-amber-900 text-amber-300',     icon: '⚠', dot: 'bg-amber-500' },
  INFO:    { bg: 'bg-slate-900 border-slate-700',        badge: 'bg-slate-700 text-slate-300',     icon: 'ℹ', dot: 'bg-blue-500' },
};

function fmtNum(n) {
  const num = Number(n || 0);
  const abs = Math.abs(num);
  const s = Math.round(abs).toLocaleString('en-IN');
  return num < 0 ? `(${s})` : s;
}

function CheckCard({ check }) {
  const [expanded, setExpanded] = useState(check.status === 'FAIL' || check.status === 'WARNING');
  const meta   = CHECK_META[check.checkType] || { label: check.checkType, icon: '📋', desc: '' };
  const cfg    = STATUS_CONFIG[check.status] || STATUS_CONFIG.INFO;
  const detail = typeof check.detail === 'string' ? JSON.parse(check.detail || '{}') : (check.detail || {});

  return (
    <div className={`border rounded-2xl overflow-hidden transition-all ${cfg.bg}`}>
      <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center gap-3 p-4 text-left">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${cfg.badge}`}>
          {cfg.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white">{meta.icon} {meta.label}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${cfg.badge}`}>{check.status}</span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{check.message}</p>
        </div>
        <span className="text-slate-500 text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-white/5 pt-3">
          <p className="text-sm text-slate-300 mb-3">{check.message}</p>

          {/* Render detail based on check type */}
          {check.checkType === 'CROSS_CASTING_BS' && detail.totalAssets !== undefined && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Total Assets', value: detail.totalAssets, color: 'text-blue-400' },
                { label: 'Total Equity', value: detail.totalEquity, color: 'text-purple-400' },
                { label: 'Total Liabilities', value: detail.totalLiab, color: 'text-amber-400' },
              ].map(s => (
                <div key={s.label} className="bg-black/30 rounded-xl p-3 text-center">
                  <div className="text-xs text-slate-500">{s.label}</div>
                  <div className={`font-mono font-bold text-sm mt-1 ${s.color}`}>{fmtNum(s.value)}</div>
                </div>
              ))}
              {detail.difference > 0.01 && (
                <div className="col-span-3 bg-red-900/30 rounded-xl p-3 text-center">
                  <div className="text-xs text-red-400">Difference</div>
                  <div className="font-mono font-bold text-red-300 text-sm mt-1">{fmtNum(detail.difference)}</div>
                </div>
              )}
            </div>
          )}

          {check.checkType === 'CROSS_CASTING_PL' && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Total Revenue', value: detail.totalIncome, color: 'text-emerald-400' },
                { label: 'Total Expenses', value: detail.totalExpenses, color: 'text-red-400' },
                { label: 'Net Profit', value: detail.netProfit, color: detail.netProfit >= 0 ? 'text-indigo-400' : 'text-red-400' },
              ].map(s => (
                <div key={s.label} className="bg-black/30 rounded-xl p-3 text-center">
                  <div className="text-xs text-slate-500">{s.label}</div>
                  <div className={`font-mono font-bold text-sm mt-1 ${s.color}`}>{fmtNum(s.value)}</div>
                </div>
              ))}
            </div>
          )}

          {/* CASTING ERRORS — detailed */}
          {check.checkType === 'CASTING' && detail.errors?.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-bold text-red-400 uppercase tracking-wider">Casting Errors — {detail.errors.length} note{detail.errors.length>1?'s':''} affected:</p>
              {detail.errors.map((e, i) => (
                <div key={i} className="bg-red-900/30 border border-red-800/50 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-red-200">{e.groupName}</span>
                    <span className="text-xs font-bold text-red-300 bg-red-900/50 px-2 py-0.5 rounded-full">Diff: {fmtNum(e.diff)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div className="bg-black/20 rounded-lg p-2 text-center">
                      <p className="text-xs text-slate-500">FS Line Amount</p>
                      <p className="font-mono text-sm text-white mt-0.5">{fmtNum(e.fsAmt)}</p>
                    </div>
                    <div className="bg-black/20 rounded-lg p-2 text-center">
                      <p className="text-xs text-slate-500">Notes Total</p>
                      <p className="font-mono text-sm text-red-300 mt-0.5">{fmtNum(e.noteAmt)}</p>
                    </div>
                  </div>
                  {e.subGroupings?.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-slate-500 mb-1">TB Sub-groupings mapped to this head:</p>
                      <div className="flex flex-wrap gap-1">
                        {e.subGroupings.map((sg, j) => (
                          <span key={j} className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded">{sg}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-red-400/70 mt-2 italic">{e.fix}</p>
                </div>
              ))}
            </div>
          )}

          {/* UNMAPPED ITEMS — detailed */}
          {check.checkType === 'UNMAPPED_ITEMS' && detail.unmapped?.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2">Unmapped TB Sub-groupings:</p>
              <div className="grid grid-cols-1 gap-1">
                {detail.unmapped.map((sg, i) => (
                  <div key={i} className="bg-amber-900/20 border border-amber-800/30 rounded-lg px-3 py-2 flex items-center gap-2 text-xs">
                    <span className="text-amber-400">⚠</span>
                    <span className="text-amber-200 font-medium">{sg}</span>
                    <span className="text-amber-600 ml-auto">Go to Mapping page</span>
                  </div>
                ))}
              </div>
              {detail.unmappedAmount > 0 && (
                <p className="text-xs text-amber-500 mt-2">Total excluded amount: {fmtNum(detail.unmappedAmount)}</p>
              )}
            </div>
          )}

          {/* COMPLETENESS — exact lines */}
          {check.checkType === 'COMPLETENESS' && detail.lines?.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2">BS Lines Missing Note Reference:</p>
              {detail.lines.map((l, i) => (
                <div key={i} className="bg-amber-900/20 border border-amber-800/30 rounded-xl p-3 mb-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-amber-200">{l.fsHead}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded">{l.assetLiability}</span>
                      <span className="font-mono text-xs text-white">{fmtNum(l.amount)}</span>
                    </div>
                  </div>
                  {l.subGroupings?.length > 0 && (
                    <div className="mt-1.5">
                      <p className="text-xs text-slate-500 mb-1">TB Sub-groupings under this head:</p>
                      <div className="flex flex-wrap gap-1">
                        {l.subGroupings.map((sg, j) => (
                          <span key={j} className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded">{sg}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="mt-2 p-2 bg-black/20 rounded-lg">
                    <p className="text-xs text-amber-300">🔧 Fix: {l.fix}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* SIGN CHECK — detailed */}
          {check.checkType === 'SCHEDULE_PPE' && detail.difference !== undefined && Math.abs(detail.difference) >= 1 && (
            <div className="mt-3 grid grid-cols-3 gap-3">
              {[
                { label: 'Schedule Net Block', value: detail.scheduleClosingNet?.toFixed(2) },
                { label: 'Balance Sheet PPE',  value: detail.fsAmount?.toFixed(2) },
                { label: 'Difference',         value: detail.difference?.toFixed(2), highlight: true },
              ].map(s => (
                <div key={s.label} className={`rounded-lg p-3 ${s.highlight ? 'bg-red-900/30 border border-red-700' : 'bg-slate-800 border border-slate-700'}`}>
                  <div className="text-xs text-slate-400">{s.label}</div>
                  <div className="font-mono font-bold text-white mt-1">{s.value}</div>
                </div>
              ))}
            </div>
          )}
          {check.checkType === 'SCHEDULE_DEFERRED_TAX' && detail.difference !== undefined && Math.abs(detail.difference) >= 1 && (
            <div className="mt-3 grid grid-cols-4 gap-3">
              {[
                { label: 'Schedule Net DT',    value: detail.scheduleNetDT?.toFixed(2) },
                { label: 'FS DTA',             value: detail.fsDTA?.toFixed(2) },
                { label: 'FS DTL',             value: detail.fsDTL?.toFixed(2) },
                { label: 'Difference',         value: detail.difference?.toFixed(2), highlight: true },
              ].map(s => (
                <div key={s.label} className={`rounded-lg p-3 ${s.highlight ? 'bg-red-900/30 border border-red-700' : 'bg-slate-800 border border-slate-700'}`}>
                  <div className="text-xs text-slate-400">{s.label}</div>
                  <div className="font-mono font-bold text-white mt-1">{s.value}</div>
                </div>
              ))}
            </div>
          )}
          {check.checkType === 'SCHEDULE_EPS_PAT' && detail.difference !== undefined && (
            <div className="mt-3 grid grid-cols-3 gap-3">
              {[
                { label: 'EPS Working PAT',    value: detail.epsPAT?.toFixed(2) },
                { label: 'P&L Computed PAT',   value: detail.fsPAT?.toFixed(2) },
                { label: 'Difference',         value: detail.difference?.toFixed(2), highlight: Math.abs(detail.difference) >= 1 },
              ].map(s => (
                <div key={s.label} className={`rounded-lg p-3 ${s.highlight ? 'bg-amber-900/30 border border-amber-700' : 'bg-slate-800 border border-slate-700'}`}>
                  <div className="text-xs text-slate-400">{s.label}</div>
                  <div className="font-mono font-bold text-white mt-1">{s.value}</div>
                </div>
              ))}
            </div>
          )}
          {check.checkType === 'SCHEDULE_DEPRECIATION' && detail.difference !== undefined && (
            <div className="mt-3 grid grid-cols-4 gap-3">
              {[
                { label: 'PPE Depreciation',   value: detail.ppeDepr?.toFixed(2) },
                { label: 'Intangible Amort.',  value: detail.intangDepr?.toFixed(2) },
                { label: 'Total Schedule Depr',value: detail.totalScheduleDepr?.toFixed(2) },
                { label: 'P&L Depr Expense',   value: detail.fsDepr?.toFixed(2) },
              ].map(s => (
                <div key={s.label} className="rounded-lg p-3 bg-slate-800 border border-slate-700">
                  <div className="text-xs text-slate-400">{s.label}</div>
                  <div className="font-mono font-bold text-white mt-1">{s.value}</div>
                </div>
              ))}
            </div>
          )}
          {check.checkType === 'SIGN_CHECK' && detail.items?.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2">Sign Issues Found:</p>
              {detail.items.map((item, i) => (
                <div key={i} className="bg-amber-900/20 border border-amber-800/30 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-amber-200">{item.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded">{item.type}</span>
                      <span className="font-mono text-xs text-red-300">{fmtNum(item.amount)}</span>
                    </div>
                  </div>
                  <p className="text-xs text-amber-400/80 mt-1">{item.fix}</p>
                </div>
              ))}
            </div>
          )}

          {check.checkType === 'TB_BALANCE' && (
            <div className="flex gap-3 mt-2">
              <div className="bg-black/30 rounded-xl p-3 flex-1 text-center">
                <div className="text-xs text-slate-500">TB Row Count</div>
                <div className="font-bold text-white text-sm mt-1">{detail.rowCount?.toLocaleString()}</div>
              </div>
              <div className="bg-black/30 rounded-xl p-3 flex-1 text-center">
                <div className="text-xs text-slate-500">Sum of finalNet</div>
                <div className={`font-mono font-bold text-sm mt-1 ${Math.abs(detail.tbSum || 0) < 1 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {fmtNum(detail.tbSum)}
                </div>
              </div>
            </div>
          )}

          {/* How to fix for FAIL */}
          {check.status === 'FAIL' && (
            <div className="mt-3 p-3 bg-red-900/40 rounded-xl border border-red-800">
              <p className="text-xs font-semibold text-red-400 mb-1">How to fix:</p>
              <p className="text-xs text-red-300">
                {check.checkType === 'CASTING' && 'Go to Mapping page → ensure all TB rows for each sub-grouping are mapped correctly → re-generate FS.'}
                {check.checkType === 'CROSS_CASTING_BS' && 'Check Mapping page — some liability/equity items may be mapped as Assets. Fix the classification and re-generate FS.'}
                {check.checkType === 'TB_BALANCE' && 'Your Trial Balance does not balance. Check the source TB file — debits must equal credits.'}
                {check.checkType === 'COMPLETENESS' && 'In the Mapping page, add Note Group IDs to all mapped items.'}
                {check.checkType === 'SCHEDULE_PPE' && 'Go to Schedules → PPE → adjust opening balance, additions, disposals or depreciation until closing net block matches the Balance Sheet.'}
                {check.checkType === 'SCHEDULE_INTANGIBLES' && 'Go to Schedules → Intangible Assets → adjust movements until closing net block matches the Balance Sheet.'}
                {check.checkType === 'SCHEDULE_DEPRECIATION' && 'Go to Schedules → PPE/Intangibles → ensure "Depreciation for Year" totals match the P&L depreciation expense line.'}
                {check.checkType === 'SCHEDULE_DEFERRED_TAX' && 'Go to Schedules → Deferred Tax → adjust timing differences until net DTA/DTL matches the Balance Sheet.'}
                {check.checkType === 'SCHEDULE_EPS_PAT' && 'Go to Schedules → EPS → click Save to refresh PAT from the latest generated Financial Statements.'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ValidationChecks() {
  const { engagementId } = useParams();
  const { currentEngagement } = useStore();
  const [checks, setChecks]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  useEffect(() => { load(); }, [engagementId]);

  async function load() {
    setLoading(true);
    try {
      const data = await engagementAPI.validation(engagementId);
      setChecks(Array.isArray(data) ? data : []);
    } catch { setChecks([]); }
    finally { setLoading(false); }
  }

  async function runChecks() {
    setRunning(true);
    try {
      // POST to run checks directly (no FS re-generation needed)
      const results = await engagementAPI.runValidation(engagementId);
      setChecks(Array.isArray(results) ? results : []);
      toast.success(`Validation completed — ${results.filter(c=>c.status==='PASS').length} passed, ${results.filter(c=>c.status==='FAIL').length} failed`);
    } catch (err) {
      toast.error(err?.error || 'Failed to run checks — make sure FS is generated first');
    } finally { setRunning(false); }
  }

  const counts = {
    PASS:    checks.filter(c => c.status === 'PASS').length,
    FAIL:    checks.filter(c => c.status === 'FAIL').length,
    WARNING: checks.filter(c => c.status === 'WARNING').length,
    INFO:    checks.filter(c => c.status === 'INFO').length,
  };

  const sections = [
    { status: 'FAIL',    label: 'Failed — Action Required', dotColor: 'bg-red-500' },
    { status: 'WARNING', label: 'Warnings',                 dotColor: 'bg-amber-500' },
    { status: 'PASS',    label: 'Passed',                   dotColor: 'bg-emerald-500' },
    { status: 'INFO',    label: 'Information',              dotColor: 'bg-blue-500' },
  ];

  if (loading) return <div className="p-8 text-slate-400">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Validation Checks</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {currentEngagement?.method} · {currentEngagement?.financialYear} ·
            TB Balance · Casting · Cross Casting · Reconciliation · Completeness · Sign Check
          </p>
        </div>
        <button onClick={runChecks} disabled={running}
          className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-indigo-900/50">
          {running ? (
            <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4"/><path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Running checks...</>
          ) : '▶ Run All Checks'}
        </button>
      </div>

      {/* Summary */}
      {checks.length > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Passed',   count: counts.PASS,    bg: 'bg-emerald-900/50 border-emerald-700', text: 'text-emerald-400' },
            { label: 'Failed',   count: counts.FAIL,    bg: 'bg-red-900/50 border-red-700',         text: 'text-red-400' },
            { label: 'Warnings', count: counts.WARNING, bg: 'bg-amber-900/50 border-amber-700',     text: 'text-amber-400' },
            { label: 'Info',     count: counts.INFO,    bg: 'bg-slate-800 border-slate-600',        text: 'text-blue-400' },
          ].map(s => (
            <div key={s.label} className={`border rounded-2xl p-4 text-center ${s.bg}`}>
              <div className={`text-3xl font-bold ${s.text}`}>{s.count}</div>
              <div className="text-xs text-slate-400 mt-1 font-medium">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {checks.length === 0 ? (
        <div className="text-center py-24 border border-dashed border-slate-700 rounded-2xl">
          <div className="text-6xl mb-4">🔍</div>
          <p className="font-semibold text-slate-300 text-lg">No checks run yet</p>
          <p className="text-slate-500 text-sm mt-1">Generate Financial Statements first, then click Run All Checks</p>
          <button onClick={runChecks} disabled={running}
            className="mt-5 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700">
            ▶ Run Checks Now
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {sections.map(section => {
            const sectionChecks = checks.filter(c => c.status === section.status);
            if (sectionChecks.length === 0) return null;
            return (
              <div key={section.status}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-2 h-2 rounded-full ${section.dotColor}`}/>
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    {section.label} ({sectionChecks.length})
                  </h2>
                </div>
                <div className="space-y-2">
                  {sectionChecks.map((c, i) => <CheckCard key={i} check={c} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
