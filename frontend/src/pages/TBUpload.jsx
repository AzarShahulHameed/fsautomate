import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { tbAPI } from '../api/client';
import { useStore } from '../store';
import toast from 'react-hot-toast';

const fmt = n => {
  const num = Math.abs(Number(n || 0));
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// ── Drop Zone ─────────────────────────────────────────────────────────────────
function DropZone({ onUpload, uploading, isPriorYear }) {
  const [label, setLabel] = useState('');

  const onDrop = useCallback(async (files) => {
    if (!files[0]) return;
    await onUpload(files[0], isPriorYear, label || null);
  }, [onUpload, isPriorYear, label]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
    disabled: uploading,
  });

  return (
    <div>
      {isPriorYear && (
        <div className="mb-3">
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">
            Version Label <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="e.g. Prior Year — FY 2023-24"
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
      )}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
          uploading ? 'opacity-50 cursor-not-allowed border-slate-200' :
          isDragActive
            ? (isPriorYear ? 'border-amber-400 bg-amber-50' : 'border-indigo-400 bg-indigo-50')
            : (isPriorYear ? 'border-amber-200 hover:border-amber-300 hover:bg-amber-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50')
        }`}
      >
        <input {...getInputProps()} />
        <div className="text-4xl mb-3">{isPriorYear ? '📋' : '📊'}</div>
        {uploading ? (
          <div>
            <p className={`font-semibold ${isPriorYear ? 'text-amber-600' : 'text-indigo-600'}`}>
              Uploading and parsing...
            </p>
            <div className="mt-2 w-32 mx-auto h-1 bg-slate-200 rounded-full overflow-hidden">
              <div className={`h-full rounded-full animate-pulse ${isPriorYear ? 'bg-amber-400' : 'bg-indigo-500'}`} style={{width:'60%'}}/>
            </div>
          </div>
        ) : isDragActive ? (
          <p className="font-semibold text-slate-700">Drop file to upload</p>
        ) : (
          <>
            <p className="font-semibold text-slate-700">
              {isPriorYear ? 'Drop Prior Year TB here' : 'Drag & drop your TB file here'}
            </p>
            <p className="text-slate-400 text-sm mt-1">or click to browse — .xlsx, .xls or .csv</p>
          </>
        )}
      </div>
    </div>
  );
}

// ── TB Format Guide ────────────────────────────────────────────────────────────
function FormatGuide({ currency }) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <span className="text-blue-500 text-xl flex-shrink-0">ℹ️</span>
        <div>
          <p className="font-semibold text-blue-900 text-sm">Required TB Format</p>
          <p className="text-blue-800 text-xs mt-1">Your Excel/CSV must have these column headers (case-insensitive):</p>
          <div className="mt-2 overflow-x-auto">
            <table className="text-xs border-collapse">
              <thead>
                <tr className="bg-blue-100">
                  {['Account No.','Account Name','Sub-Grouping','Debit','Credit','Net','AJE','Final Net'].map(h => (
                    <th key={h} className="border border-blue-200 px-2 py-1 text-blue-800 whitespace-nowrap font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="bg-white">
                  {['1001','Cash in Hand','Cash in Bank',`${currency} 0`,`${currency} 0`,`${currency} 0`,`${currency} 0`,`${currency} 5,000`].map((v,i) => (
                    <td key={i} className="border border-blue-200 px-2 py-1 text-blue-700">{v}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-blue-700 text-xs mt-2">
            <strong>Final Net</strong> = Net + AJE (audit adjustments). This is the amount used for financial statements.
            All amounts in <strong>{currency}</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Version Card ──────────────────────────────────────────────────────────────
function VersionCard({ version, isLatest, onViewDiff, diffLoading }) {
  const isPY = version.isPriorYear;
  return (
    <div className={`bg-white border rounded-2xl p-4 transition-all hover:shadow-sm ${
      isLatest && !isPY ? 'border-indigo-200 bg-indigo-50/30' : isPY ? 'border-amber-200 bg-amber-50/30' : 'border-slate-200'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
            isPY ? 'bg-amber-100 text-amber-700' : isLatest ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
          }`}>
            {isPY ? 'PY' : `V${version.versionNumber}`}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-800 text-sm">
                {version.label || (isPY ? 'Prior Year TB' : `Version ${version.versionNumber}`)}
              </span>
              {isLatest && !isPY && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700">Latest</span>
              )}
              {isPY && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">Prior Year</span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-slate-500">{version.rowCount?.toLocaleString()} rows</span>
              <span className="text-xs text-slate-400">
                {new Date(version.uploadedAt || version.createdAt).toLocaleString('en-IN', {
                  day:'2-digit', month:'short', year:'numeric',
                  hour:'2-digit', minute:'2-digit'
                })}
              </span>
            </div>
          </div>
        </div>
        {!isPY && (
          <button
            onClick={() => onViewDiff(version.id)}
            disabled={diffLoading === version.id}
            className="px-3 py-1.5 border border-slate-300 text-slate-600 text-xs rounded-lg hover:bg-slate-50 hover:border-indigo-300 transition-all"
          >
            {diffLoading === version.id ? '⏳ Loading...' : '🔍 View Changes'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Diff Viewer ───────────────────────────────────────────────────────────────
function DiffViewer({ diff, onClose, currency }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  if (!diff) return null;

  const changes = diff.changes || diff || [];
  const filtered = changes.filter(c => {
    if (filter === 'added'   && c.action !== 'ADDED')   return false;
    if (filter === 'removed' && c.action !== 'REMOVED') return false;
    if (filter === 'changed' && c.action !== 'CHANGED') return false;
    if (search && !c.accountNumber?.toLowerCase().includes(search.toLowerCase()) &&
        !c.accountName?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = {
    added:   changes.filter(c => c.action === 'ADDED').length,
    removed: changes.filter(c => c.action === 'REMOVED').length,
    changed: changes.filter(c => c.action === 'CHANGED').length,
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xl">
      <div className="flex items-center justify-between px-5 py-4 bg-slate-800 text-white">
        <div>
          <h3 className="font-semibold">Version Comparison</h3>
          <p className="text-slate-400 text-xs mt-0.5">
            {changes.length} changes — {counts.added} added · {counts.removed} removed · {counts.changed} modified
          </p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-xl transition-colors">✕</button>
      </div>

      {/* Summary pills */}
      <div className="flex items-center gap-3 px-5 py-3 bg-slate-50 border-b border-slate-200">
        {[
          { key:'all',     label:`All (${changes.length})`,         bg:'bg-slate-700 text-white',    off:'bg-white text-slate-600 border border-slate-300' },
          { key:'added',   label:`Added (${counts.added})`,         bg:'bg-emerald-600 text-white',  off:'bg-emerald-50 text-emerald-700 border border-emerald-200' },
          { key:'removed', label:`Removed (${counts.removed})`,     bg:'bg-red-600 text-white',      off:'bg-red-50 text-red-700 border border-red-200' },
          { key:'changed', label:`Modified (${counts.changed})`,    bg:'bg-amber-500 text-white',    off:'bg-amber-50 text-amber-700 border border-amber-200' },
        ].map(b => (
          <button key={b.key} onClick={() => setFilter(b.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filter === b.key ? b.bg : b.off}`}>
            {b.label}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search account..."
          className="ml-auto border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 w-48"
        />
      </div>

      <div className="overflow-auto max-h-96">
        {filtered.length === 0 ? (
          <div className="py-10 text-center text-slate-400">No changes match your filter</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2 font-semibold text-slate-600">Change</th>
                <th className="text-left px-4 py-2 font-semibold text-slate-600">Account</th>
                <th className="text-left px-4 py-2 font-semibold text-slate-600">Name</th>
                <th className="text-right px-4 py-2 font-semibold text-slate-600">Old Amount ({currency})</th>
                <th className="text-right px-4 py-2 font-semibold text-slate-600">New Amount ({currency})</th>
                <th className="text-right px-4 py-2 font-semibold text-slate-600">Δ Difference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((c, i) => {
                const diff = Number(c.newFinalNet || 0) - Number(c.oldFinalNet || 0);
                const rowBg = c.action === 'ADDED' ? 'bg-emerald-50' : c.action === 'REMOVED' ? 'bg-red-50' : c.action === 'CHANGED' ? 'bg-amber-50' : '';
                const badge = c.action === 'ADDED' ? 'bg-emerald-100 text-emerald-700' : c.action === 'REMOVED' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700';
                return (
                  <tr key={i} className={`hover:brightness-95 ${rowBg}`}>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full font-bold ${badge}`}>{c.action}</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-slate-600">{c.accountNumber}</td>
                    <td className="px-4 py-2.5 text-slate-700">{c.accountName || c.fieldChanged || '—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-500">
                      {c.oldFinalNet !== undefined && c.oldFinalNet !== null ? fmt(c.oldFinalNet) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-800 font-medium">
                      {c.newFinalNet !== undefined && c.newFinalNet !== null ? fmt(c.newFinalNet) : '—'}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono font-semibold ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                      {c.action === 'CHANGED' ? (diff >= 0 ? '+' : '') + fmt(diff) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
        <p className="text-xs text-slate-500">Showing {filtered.length} of {changes.length} changes</p>
        <button onClick={onClose} className="px-3 py-1.5 bg-slate-700 text-white text-xs rounded-lg hover:bg-slate-800">Close</button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TBUpload() {
  const { engagementId } = useParams();
  const { currentEngagement, currentClient, firm } = useStore();

  const method   = currentEngagement?.method || 'AS';
  const region   = currentClient?.region || (currentClient?.country === 'UAE' ? 'UAE' : firm?.region || 'India');
  const currency = region === 'UAE' || method === 'IFRS' || method === 'IFRS_SME' ? 'AED' : 'INR';

  const [versions,     setVersions]     = useState([]);
  const [uploading,    setUploading]     = useState(false);
  const [uploadingPY,  setUploadingPY]  = useState(false);
  const [activeTab,    setActiveTab]    = useState('current');
  const [diff,         setDiff]         = useState(null);
  const [diffLoading,  setDiffLoading]  = useState(null);

  useEffect(() => { loadVersions(); }, [engagementId]);

  async function loadVersions() {
    try {
      const data = await tbAPI.versions(engagementId);
      setVersions(Array.isArray(data) ? data : []);
    } catch { setVersions([]); }
  }

  async function handleUpload(file, isPriorYear, label) {
    if (isPriorYear) setUploadingPY(true);
    else             setUploading(true);
    try {
      const data = await tbAPI.upload(engagementId, file, isPriorYear, label);
      toast.success(isPriorYear
        ? `Prior Year TB uploaded — ${data.version?.rowCount || 0} rows`
        : `TB uploaded — Version ${data.version?.versionNumber} · ${data.version?.rowCount || 0} rows`
      );
      await loadVersions();
      setActiveTab('history');
    } catch (err) {
      toast.error(err?.error || 'Upload failed — check file format');
    } finally {
      setUploading(false);
      setUploadingPY(false);
    }
  }

  async function viewDiff(versionId) {
    setDiffLoading(versionId);
    setDiff(null);
    try {
      const data = await tbAPI.diff(engagementId, versionId);
      setDiff(data);
    } catch { toast.error('Failed to load diff'); }
    finally { setDiffLoading(null); }
  }

  const cyVersions = versions.filter(v => !v.isPriorYear);
  const pyVersions = versions.filter(v => v.isPriorYear);
  const latestCY   = cyVersions[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/20 p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Trial Balance Upload</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          {currentClient?.name} · {method} · {currency} · Max 5 versions stored per year
        </p>
      </div>

      {/* Stats row */}
      {versions.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Current Year Versions', value: cyVersions.length, icon: '📊', color: 'text-indigo-600' },
            { label: 'Prior Year Uploaded',   value: pyVersions.length > 0 ? 'Yes' : 'No', icon: '📋', color: pyVersions.length ? 'text-emerald-600' : 'text-slate-400' },
            { label: 'Total TB Rows',          value: (latestCY?.rowCount || 0).toLocaleString(), icon: '🔢', color: 'text-slate-700' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{s.icon}</span>
                <div>
                  <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-slate-500">{s.label}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0 mb-5 border-b border-slate-200">
        {[
          { key: 'current',  label: '📊 Current Year TB', count: cyVersions.length },
          { key: 'prior',    label: '📋 Prior Year TB',   count: pyVersions.length },
          { key: 'history',  label: '🕐 Version History', count: versions.length },
          { key: 'format',   label: '📄 File Format Guide' },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors -mb-px ${
              activeTab === t.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}>
            {t.label}
            {t.count > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${activeTab === t.key ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Current Year Tab */}
      {activeTab === 'current' && (
        <div className="space-y-5 max-w-2xl">
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <h2 className="font-bold text-slate-800 mb-1">Upload Current Year TB</h2>
            <p className="text-slate-500 text-sm mb-5">
              Upload the Trial Balance for {currentEngagement?.financialYear || 'current financial year'}.
              This is used to generate the Financial Statements.
            </p>
            <DropZone onUpload={handleUpload} uploading={uploading} isPriorYear={false} />
          </div>
          {latestCY && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex items-center gap-3">
              <span className="text-2xl">✅</span>
              <div>
                <p className="font-semibold text-indigo-900 text-sm">Current TB Active</p>
                <p className="text-indigo-700 text-xs">
                  Version {latestCY.versionNumber} · {latestCY.rowCount?.toLocaleString()} rows ·
                  Uploaded {new Date(latestCY.uploadedAt || latestCY.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Prior Year Tab */}
      {activeTab === 'prior' && (
        <div className="space-y-5 max-w-2xl">
          <div className="bg-white border border-amber-200 rounded-2xl p-6">
            <h2 className="font-bold text-slate-800 mb-1">Upload Prior Year TB</h2>
            <p className="text-slate-500 text-sm mb-3">
              Prior year TB is used for <strong>comparative figures</strong> in Financial Statements,
              Cash Flow Statement (working capital changes), and SOCE opening balances.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5 text-xs text-amber-800">
              <strong>What this enables:</strong> Comparative columns in BS/PL · Accurate CFS indirect method ·
              Opening retained earnings in SOCE · Year-on-year variance analysis
            </div>
            <DropZone onUpload={handleUpload} uploading={uploadingPY} isPriorYear={true} />
          </div>
          {pyVersions.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
              <span className="text-2xl">✅</span>
              <div>
                <p className="font-semibold text-amber-900 text-sm">Prior Year TB Uploaded</p>
                <p className="text-amber-700 text-xs">
                  {pyVersions[0].label || 'Prior Year'} · {pyVersions[0].rowCount?.toLocaleString()} rows ·
                  Uploaded {new Date(pyVersions[0].uploadedAt || pyVersions[0].createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="space-y-4 max-w-2xl">
          {versions.length === 0 ? (
            <div className="text-center py-16 bg-white border border-dashed border-slate-300 rounded-2xl text-slate-400">
              <div className="text-5xl mb-3">📂</div>
              <p>No TB uploaded yet.</p>
            </div>
          ) : (
            <>
              {cyVersions.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Current Year Versions</h3>
                  <div className="space-y-2">
                    {cyVersions.map((v, i) => (
                      <VersionCard key={v.id} version={v} isLatest={i === 0} onViewDiff={viewDiff} diffLoading={diffLoading} />
                    ))}
                  </div>
                </div>
              )}
              {pyVersions.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Prior Year Versions</h3>
                  <div className="space-y-2">
                    {pyVersions.map((v) => (
                      <VersionCard key={v.id} version={v} isLatest={false} onViewDiff={viewDiff} diffLoading={diffLoading} />
                    ))}
                  </div>
                </div>
              )}

              {/* Diff viewer */}
              {diff && (
                <div className="mt-5">
                  <DiffViewer diff={diff} onClose={() => setDiff(null)} currency={currency} />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Format Guide Tab */}
      {activeTab === 'format' && (
        <div className="max-w-2xl space-y-4">
          <FormatGuide currency={currency} />
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h3 className="font-bold text-slate-800 mb-3">Column Mapping Details</h3>
            <div className="space-y-2 text-sm">
              {[
                { col: 'Account No. / Account Number', req: true,  desc: 'Unique identifier for each ledger account' },
                { col: 'Account Name',                  req: true,  desc: 'Name of the ledger account' },
                { col: 'Grouping',                      req: false, desc: 'Optional high-level group (Assets, Liabilities etc.)' },
                { col: 'Sub-Grouping',                  req: true,  desc: 'Main grouping used for FS mapping (e.g. "Cash in Bank")' },
                { col: 'Debit',                         req: false, desc: 'Total debit balance for the account' },
                { col: 'Credit',                        req: false, desc: 'Total credit balance for the account' },
                { col: 'Net',                           req: false, desc: 'Net balance (Debit − Credit)' },
                { col: 'AJE / Audit Adjustment',        req: false, desc: 'Audit adjusting entries' },
                { col: 'Final Net / Final-Net',         req: true,  desc: 'Final audited balance = Net + AJE. Used for all FS calculations.' },
              ].map(r => (
                <div key={r.col} className="flex items-start gap-3 py-2 border-b border-slate-100">
                  <div className="w-52 flex-shrink-0">
                    <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-700">{r.col}</span>
                    {r.req && <span className="ml-1 text-red-500 text-xs">*</span>}
                  </div>
                  <p className="text-slate-600 text-xs">{r.desc}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-3">* Required columns</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h3 className="font-bold text-slate-800 mb-3">Tips for {currency} Amounts</h3>
            <div className="space-y-2 text-sm text-slate-600">
              <p>✅ Numbers can be formatted: 1,00,000 or 100000 — both work</p>
              <p>✅ Negative numbers: -50000 or (50000) — both accepted</p>
              <p>✅ Decimals: up to 2 decimal places ({currency === 'AED' ? 'Fils' : 'Paise'})</p>
              <p>✅ Blank cells in Final Net column are treated as zero</p>
              <p>❌ Do not include currency symbols ({currency}) in cells</p>
              <p>❌ Do not merge cells in the header row</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
