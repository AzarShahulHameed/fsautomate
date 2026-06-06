
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { tbAPI } from '../api/client';
import { useStore } from '../store';
import toast from 'react-hot-toast';
 
const fmtN = n => Math.round(Math.abs(Number(n||0))).toLocaleString('en-IN');
const fmtDate = d => d ? new Date(d).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
 
// ── Drop Zone ─────────────────────────────────────────────────────────────────
function DropZone({ onUpload, uploading, isPriorYear, label, setLabel }) {
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
 
  const color = isPriorYear ? 'amber' : 'indigo';
 
  return (
    <div>
      {isPriorYear && (
        <div className="mb-3">
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Version Label <span className="text-slate-400 font-normal">(optional)</span></label>
          <input value={label} onChange={e => setLabel(e.target.value)}
            placeholder={`e.g. Prior Year — FY 2023-24`}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
        </div>
      )}
      <div {...getRootProps()} className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
        uploading ? 'opacity-50 cursor-not-allowed border-slate-200' :
        isDragActive ? `border-${color}-400 bg-${color}-50` :
        isPriorYear ? 'border-amber-200 hover:border-amber-300 hover:bg-amber-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
      }`}>
        <input {...getInputProps()} />
        <div className="text-4xl mb-3">{isPriorYear ? '📋' : '📊'}</div>
        {uploading ? (
          <div>
            <p className={`font-semibold text-${color}-600`}>Uploading and parsing...</p>
            <div className="mt-2 w-32 mx-auto h-1 bg-slate-200 rounded-full overflow-hidden">
              <div className={`h-full bg-${color}-400 rounded-full animate-pulse`} style={{width:'60%'}} />
            </div>
          </div>
        ) : isDragActive ? (
          <p className="font-semibold text-slate-700">Drop file to upload</p>
        ) : (
          <>
            <p className="font-semibold text-slate-700">{isPriorYear ? 'Drop Prior Year TB here' : 'Drag & drop TB file here'}</p>
            <p className="text-slate-400 text-sm mt-1">or click to browse — .xlsx, .xls or .csv</p>
          </>
        )}
      </div>
    </div>
  );
}
 
// ── Diff Viewer ───────────────────────────────────────────────────────────────
function DiffViewer({ version, currency, onClose }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
 
  const diffs = version?.diffs || [];
  const filtered = diffs.filter(d => {
    if (filter !== 'all' && d.action?.toUpperCase() !== filter.toUpperCase()) return false;
    if (search) {
      const s = search.toLowerCase();
      return d.accountNumber?.toLowerCase().includes(s) || d.accountName?.toLowerCase().includes(s);
    }
    return true;
  });
 
  const counts = {
    ADDED:   diffs.filter(d => d.action === 'ADDED').length,
    DELETED: diffs.filter(d => d.action === 'DELETED').length,
    CHANGED: diffs.filter(d => d.action === 'CHANGED').length,
  };
 
  if (!diffs.length) return (
    <div className="bg-slate-800 rounded-2xl p-6 text-center">
      <p className="text-slate-400">No changes recorded for this version — it was the first upload.</p>
      <button onClick={onClose} className="mt-4 px-4 py-2 bg-slate-600 text-white text-sm rounded-xl">Close</button>
    </div>
  );
 
  return (
    <div className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-700 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 bg-slate-800 border-b border-slate-700">
        <div>
          <h3 className="font-bold text-white">Version {version.versionNumber} — Changes</h3>
          <p className="text-slate-400 text-xs mt-0.5">
            {diffs.length} changes · {counts.ADDED} added · {counts.DELETED} deleted · {counts.CHANGED} modified
          </p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">✕</button>
      </div>
 
      {/* Filters */}
      <div className="flex items-center gap-3 px-5 py-3 bg-slate-800/50 border-b border-slate-700 flex-wrap">
        {[
          { key:'all',     label:`All (${diffs.length})`,         cls:'bg-slate-600 text-white',   off:'bg-slate-800 text-slate-400 border border-slate-600' },
          { key:'ADDED',   label:`Added (${counts.ADDED})`,       cls:'bg-emerald-700 text-white', off:'bg-emerald-900/30 text-emerald-400 border border-emerald-700' },
          { key:'DELETED', label:`Deleted (${counts.DELETED})`,   cls:'bg-red-700 text-white',     off:'bg-red-900/30 text-red-400 border border-red-700' },
          { key:'CHANGED', label:`Modified (${counts.CHANGED})`,  cls:'bg-amber-700 text-white',   off:'bg-amber-900/30 text-amber-400 border border-amber-700' },
        ].map(b => (
          <button key={b.key} onClick={() => setFilter(b.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${filter === b.key ? b.cls : b.off}`}>
            {b.label}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search account..."
          className="ml-auto bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500 w-44 placeholder-slate-500" />
      </div>
 
      {/* Table */}
      <div className="overflow-auto max-h-96">
        {filtered.length === 0 ? (
          <div className="py-10 text-center text-slate-500">No changes match your filter</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-800 border-b border-slate-700">
              <tr>
                <th className="text-left px-4 py-2.5 text-slate-400 font-semibold">Status</th>
                <th className="text-left px-4 py-2.5 text-slate-400 font-semibold">Account No.</th>
                <th className="text-left px-4 py-2.5 text-slate-400 font-semibold">Account Name</th>
                <th className="text-right px-4 py-2.5 text-slate-400 font-semibold">Old ({currency})</th>
                <th className="text-right px-4 py-2.5 text-slate-400 font-semibold">New ({currency})</th>
                <th className="text-right px-4 py-2.5 text-slate-400 font-semibold">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map((d, i) => {
                const action = (d.action || '').toUpperCase();
                const diff   = Number(d.newFinalNet || 0) - Number(d.oldFinalNet || 0);
                const rowBg  = action === 'ADDED' ? 'bg-emerald-900/20' : action === 'DELETED' ? 'bg-red-900/20' : action === 'CHANGED' ? 'bg-amber-900/20' : '';
                const badge  = action === 'ADDED' ? 'bg-emerald-800 text-emerald-300' : action === 'DELETED' ? 'bg-red-800 text-red-300' : 'bg-amber-800 text-amber-300';
                return (
                  <tr key={i} className={`${rowBg} hover:brightness-110`}>
                    <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded-full font-bold text-xs ${badge}`}>{action}</span></td>
                    <td className="px-4 py-2.5 font-mono text-slate-300">{d.accountNumber || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-300">{d.accountName || d.fieldChanged || '—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-400">{d.oldFinalNet != null ? fmtN(d.oldFinalNet) : '—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-200">{d.newFinalNet != null ? fmtN(d.newFinalNet) : '—'}</td>
                    <td className={`px-4 py-2.5 text-right font-mono font-semibold ${diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                      {action === 'CHANGED' ? (diff >= 0 ? '+' : '') + fmtN(diff) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
 
      <div className="px-5 py-3 bg-slate-800 border-t border-slate-700 flex justify-between items-center">
        <p className="text-xs text-slate-500">Showing {filtered.length} of {diffs.length} changes</p>
        <button onClick={onClose} className="px-4 py-1.5 bg-slate-600 text-white text-xs rounded-lg hover:bg-slate-500">Close</button>
      </div>
    </div>
  );
}
 
// ── Version Card ──────────────────────────────────────────────────────────────
function VersionCard({ version, isLatest, currency, onViewDiff, diffLoading, activeDiff }) {
  const isPY = version.isPriorYear;
  const isActive = activeDiff?.id === version.id;
 
  return (
    <div className={`bg-white border-2 rounded-2xl p-4 transition-all ${
      isActive ? 'border-indigo-500 shadow-lg shadow-indigo-100' :
      isPY ? 'border-amber-200' : isLatest ? 'border-indigo-200' : 'border-slate-200'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Badge */}
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 ${
            isPY ? 'bg-amber-100 text-amber-700' : isLatest ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
          }`}>
            {isPY ? 'PY' : `V${version.versionNumber}`}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-800 text-sm">{version.label || (isPY ? 'Prior Year TB' : `Version ${version.versionNumber}`)}</span>
              {isLatest && !isPY && <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700">Active</span>}
              {isPY && <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">Prior Year</span>}
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-slate-500">{(version._count?.rows || version.rowCount || 0).toLocaleString()} rows</span>
              <span className="text-xs text-slate-400">{fmtDate(version.uploadedAt || version.createdAt)}</span>
            </div>
          </div>
        </div>
 
        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {!isPY && (
            <button onClick={() => onViewDiff(version)}
              disabled={diffLoading === version.id}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                isActive
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'border-slate-300 text-slate-600 hover:border-indigo-400 hover:text-indigo-600'
              }`}>
              {diffLoading === version.id ? '⏳' : isActive ? '▲ Hide' : '🔍 View Changes'}
            </button>
          )}
        </div>
      </div>
 
      {/* Summary of changes if available */}
      {!isPY && version.diffs?.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-3 flex-wrap">
          {['ADDED','DELETED','CHANGED'].map(action => {
            const count = version.diffs.filter(d => (d.action||'').toUpperCase() === action).length;
            if (!count) return null;
            const colors = { ADDED:'text-emerald-600 bg-emerald-50', DELETED:'text-red-600 bg-red-50', CHANGED:'text-amber-600 bg-amber-50' };
            return (
              <span key={action} className={`px-2 py-0.5 rounded text-xs font-semibold ${colors[action]}`}>
                {count} {action.toLowerCase()}
              </span>
            );
          })}
          <span className="text-xs text-slate-400 ml-auto">{version.diffs.length} total changes from previous</span>
        </div>
      )}
      {!isPY && version.versionNumber === 1 && !version.diffs?.length && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <span className="text-xs text-slate-400 italic">First upload — no comparison available</span>
        </div>
      )}
    </div>
  );
}
 
// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TBUpload() {
  const { engagementId } = useParams();
  const { currentEngagement, currentClient, firm } = useStore();
 
  const method   = currentEngagement?.method || 'AS';
  const region   = currentClient?.region || (currentClient?.country === 'UAE' ? 'UAE' : firm?.region || 'India');
  const currency = (method === 'IFRS' || method === 'IFRS_SME') ? 'AED' : region === 'UAE' ? 'AED' : 'INR';
 
  const [versions,     setVersions]     = useState([]);
  const [uploading,    setUploading]     = useState(false);
  const [uploadingPY,  setUploadingPY]  = useState(false);
  const [activeTab,    setActiveTab]    = useState('current');
  const [activeDiff,   setActiveDiff]   = useState(null);
  const [diffLoading,  setDiffLoading]  = useState(null);
  const [pyLabel,      setPyLabel]      = useState('');
  const [prevYearInfo, setPrevYearInfo] = useState(null);
  const [loadingPrev,  setLoadingPrev]  = useState(false);
  const [copying,      setCopying]      = useState(false);
 
  useEffect(() => {
    loadVersions();
    loadPrevYearInfo();
  }, [engagementId]);
 
  async function loadVersions() {
    try {
      const data = await tbAPI.versions(engagementId);
      setVersions(Array.isArray(data) ? data : []);
    } catch { setVersions([]); }
  }
 
  async function loadPrevYearInfo() {
    setLoadingPrev(true);
    try {
      const data = await tbAPI.previousYear(engagementId);
      setPrevYearInfo(data);
    } catch { setPrevYearInfo(null); }
    finally { setLoadingPrev(false); }
  }
 
  async function handleUpload(file, isPriorYear, label) {
    if (isPriorYear) setUploadingPY(true);
    else setUploading(true);
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
    } finally { setUploading(false); setUploadingPY(false); }
  }
 
  async function copyPrevYearTB() {
    if (!prevYearInfo?.found) return;
    setCopying(true);
    try {
      await tbAPI.copyPriorYear(engagementId, prevYearInfo?.prevEngagementId, prevYearInfo?.label);
      toast.success(`Prior Year TB copied — ${prevYearInfo?.rowCount} rows`);
      await loadVersions();
      setActiveTab('history');
    } catch (err) {
      toast.error(err?.error || 'Failed to copy prior year TB');
    } finally { setCopying(false); }
  }
 
  function viewDiff(version) {
    if (activeDiff?.id === version.id) { setActiveDiff(null); return; }
    setDiffLoading(version.id);
    setActiveDiff(version);
    setDiffLoading(null);
  }
 
  const cyVersions = versions.filter(v => !v.isPriorYear);
  const pyVersions = versions.filter(v => v.isPriorYear);
  const latestCY   = cyVersions[0];
  const hasPY      = pyVersions.length > 0;
 
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/20 p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Trial Balance Upload</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          {currentClient?.name} · {method} · {currency} · Max 5 versions per engagement
        </p>
      </div>
 
      {/* Stats */}
      {versions.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label:'Current Year Versions', value:cyVersions.length, icon:'📊', color:'text-indigo-600' },
            { label:'Prior Year Uploaded',   value:hasPY ? 'Yes ✓' : 'No', icon:'📋', color:hasPY?'text-emerald-600':'text-slate-400' },
            { label:'Total TB Rows (Latest)',  value:(latestCY?.rowCount||0).toLocaleString('en-IN'), icon:'🔢', color:'text-slate-700' },
          ].map((s,i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-2xl p-4">
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
          { key:'current', label:'📊 Current Year TB', count:cyVersions.length },
          { key:'prior',   label:'📋 Prior Year TB',   count:pyVersions.length },
          { key:'history', label:'🕐 Version History', count:versions.length },
          { key:'format',  label:'📄 File Format' },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors -mb-px ${
              activeTab === t.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}>
            {t.label}
            {t.count > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${activeTab===t.key?'bg-indigo-100 text-indigo-700':'bg-slate-100 text-slate-500'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>
 
      {/* ── CURRENT YEAR ── */}
      {activeTab === 'current' && (
        <div className="space-y-5 max-w-2xl">
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <h2 className="font-bold text-slate-800 mb-1">Upload Current Year TB</h2>
            <p className="text-slate-500 text-sm mb-5">
              Upload the Trial Balance for {currentEngagement?.financialYear || 'current financial year'}.
            </p>
            <DropZone onUpload={handleUpload} uploading={uploading} isPriorYear={false} label="" setLabel={() => {}} />
          </div>
          {latestCY && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex items-center gap-3">
              <span className="text-2xl">✅</span>
              <div>
                <p className="font-semibold text-indigo-900 text-sm">Current TB Active</p>
                <p className="text-indigo-700 text-xs">
                  {latestCY.label} · {(latestCY.rowCount||0).toLocaleString('en-IN')} rows ·
                  Uploaded {fmtDate(latestCY.uploadedAt || latestCY.createdAt)}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
 
      {/* ── PRIOR YEAR ── */}
      {activeTab === 'prior' && (
        <div className="space-y-5 max-w-2xl">
          {/* Auto-detect banner */}
          {!loadingPrev && prevYearInfo && (
            <div className={`rounded-2xl border p-5 ${prevYearInfo?.found ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={`font-bold text-sm mb-1 ${prevYearInfo?.found ? 'text-emerald-800' : 'text-slate-600'}`}>
                    {prevYearInfo?.found ? '✅ Previous Year TB Found Automatically' : '🔍 Auto-Detection Result'}
                  </p>
                  {prevYearInfo?.found ? (
                    <>
                      <p className="text-emerald-700 text-xs">
                        Engagement: <strong>{prevYearInfo?.prevEngagementName}</strong> · FY {prevYearInfo?.prevFY}
                      </p>
                      <p className="text-emerald-700 text-xs mt-0.5">
                        {(prevYearInfo?.rowCount||0).toLocaleString('en-IN')} rows · Uploaded {fmtDate(prevYearInfo?.uploadedAt)}
                      </p>
                      <p className="text-emerald-600 text-xs mt-1 italic">
                        The TB from the previous engagement for this client was found. Click "Use as Prior Year" to copy it.
                      </p>
                    </>
                  ) : (
                    <p className="text-slate-500 text-xs">{prevYearInfo?.message || 'No prior year engagement found for this client.'}</p>
                  )}
                </div>
                {prevYearInfo?.found && !hasPY && (
                  <button onClick={copyPrevYearTB} disabled={copying}
                    className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap flex-shrink-0">
                    {copying ? '⏳ Copying...' : '✅ Use as Prior Year'}
                  </button>
                )}
                {hasPY && <span className="px-3 py-1.5 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg flex-shrink-0">Already set ✓</span>}
              </div>
            </div>
          )}
          {loadingPrev && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center text-slate-400 text-sm">
              🔍 Checking for previous year engagement...
            </div>
          )}
 
          <div className="bg-white border border-amber-200 rounded-2xl p-6">
            <h2 className="font-bold text-slate-800 mb-1">Manual Upload — Prior Year TB</h2>
            <p className="text-slate-500 text-sm mb-3">
              Upload a separate TB file if you want to override the auto-detected prior year.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5 text-xs text-amber-800">
              <strong>Used for:</strong> Comparative columns in BS/P&L · Cash Flow Statement working capital changes · SOCE opening balances
            </div>
            <DropZone onUpload={handleUpload} uploading={uploadingPY} isPriorYear={true} label={pyLabel} setLabel={setPyLabel} />
          </div>
 
          {hasPY && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
              <span className="text-2xl">✅</span>
              <div>
                <p className="font-semibold text-amber-900 text-sm">Prior Year TB Set</p>
                <p className="text-amber-700 text-xs">
                  {pyVersions[0].label} · {(pyVersions[0].rowCount||0).toLocaleString('en-IN')} rows
                </p>
              </div>
            </div>
          )}
        </div>
      )}
 
      {/* ── VERSION HISTORY ── */}
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
                  <div className="space-y-3">
                    {cyVersions.map((v, i) => (
                      <div key={v.id}>
                        <VersionCard
                          version={v}
                          isLatest={i === 0}
                          currency={currency}
                          onViewDiff={viewDiff}
                          diffLoading={diffLoading}
                          activeDiff={activeDiff}
                        />
                        {/* Inline diff viewer */}
                        {activeDiff?.id === v.id && (
                          <div className="mt-2">
                            <DiffViewer version={v} currency={currency} onClose={() => setActiveDiff(null)} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
 
              {pyVersions.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Prior Year</h3>
                  <div className="space-y-2">
                    {pyVersions.map(v => (
                      <VersionCard key={v.id} version={v} isLatest={false} currency={currency} onViewDiff={viewDiff} diffLoading={diffLoading} activeDiff={activeDiff} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
 
      {/* ── FORMAT GUIDE ── */}
      {activeTab === 'format' && (
        <div className="max-w-2xl space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
            <p className="font-semibold text-blue-900 text-sm mb-2">📋 Required Column Headers</p>
            <div className="overflow-x-auto">
              <table className="text-xs border-collapse w-full">
                <thead>
                  <tr className="bg-blue-100">
                    {['Account No','Account Name','Sub-Grouping','Debit','Credit','Net','AJE','Final Net'].map(h => (
                      <th key={h} className="border border-blue-200 px-2 py-1.5 text-blue-800 font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-white">
                    {['1001','Cash in Bank','Cash in Bank',`0`,`0`,`0`,`0`,`25,677`].map((v,i) => (
                      <td key={i} className="border border-blue-200 px-2 py-1.5 text-blue-700">{v}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <p className="font-bold text-slate-800 mb-3 text-sm">Sign Convention</p>
            <div className="space-y-2 text-sm">
              {[
                { type:'Assets / Expenses',               sign:'Positive (+)', eg:'+18,44,555', color:'text-slate-700' },
                { type:'Liabilities / Equity / Income',   sign:'Negative (−)', eg:'−27,942',    color:'text-slate-700' },
              ].map((r,i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-600">{r.type}</span>
                  <span className="font-semibold text-slate-800">{r.sign} <span className="font-mono text-xs text-slate-500">e.g. {r.eg}</span></span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-3">The TB must balance — sum of all Final Net values must equal zero.</p>
          </div>
        </div>
      )}
    </div>
  );
}