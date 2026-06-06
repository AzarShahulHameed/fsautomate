
// TaxonomyManager.jsx
// Drop into: frontend/src/pages/TaxonomyManager.jsx
// Add as a tab in Settings.jsx (see bottom of this file for integration notes)
 
import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../api/client';
 
const taxonomyAPI = {
  list:   (params = {}) => api.get('/taxonomy', { params }),
  gaps:   ()            => api.get('/taxonomy/gaps'),
  create: (data)        => api.post('/taxonomy', data),
  update: (id, data)    => api.put(`/taxonomy/${id}`, data),
  remove: (id)          => api.delete(`/taxonomy/${id}`),
  import: (rows)        => api.post('/taxonomy/import', { rows }),
};
 
// ── Constants ────────────────────────────────────────────────────────────────
const AL_OPTIONS    = ['Assets','Liabilities','Equity','Income','Expenses'];
const SHEET_OPTIONS = ['BS','PL'];
const METHOD_OPTIONS= ['ALL','IND_AS','IFRS','IFRS_SME'];
const PL_CATS       = ['revenue','otherIncome','cos','selling','admin','depreciation','financeCost','tax','oci'];
const CNC_OPTIONS   = ['','current','noncurrent'];
 
const AL_COLORS = {
  Assets:      'bg-emerald-100 text-emerald-800',
  Liabilities: 'bg-red-100 text-red-800',
  Equity:      'bg-blue-100 text-blue-800',
  Income:      'bg-teal-100 text-teal-800',
  Expenses:    'bg-orange-100 text-orange-800',
};
const PL_COLORS = {
  revenue:'bg-teal-100 text-teal-800', otherIncome:'bg-cyan-100 text-cyan-800',
  cos:'bg-red-100 text-red-800', selling:'bg-orange-100 text-orange-800',
  admin:'bg-slate-100 text-slate-700', depreciation:'bg-purple-100 text-purple-800',
  financeCost:'bg-rose-100 text-rose-800', tax:'bg-amber-100 text-amber-800',
  oci:'bg-indigo-100 text-indigo-800',
};
 
// ── Badge component ───────────────────────────────────────────────────────────
const Badge = ({ label, colorClass }) =>
  label ? <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>{label}</span>
        : <span className="text-slate-300 text-xs">—</span>;
 
// ── Row Modal ─────────────────────────────────────────────────────────────────
function RowModal({ row, onSave, onClose }) {
  const isEdit = !!row?.id;
  const [form, setForm] = useState({
    groupName:          row?.groupName          || '',
    sheet:              row?.sheet              || 'BS',
    assetLiability:     row?.assetLiability     || 'Assets',
    subGroupNo:         row?.subGroupNo         || '',
    subGroupName:       row?.subGroupName        || '',
    noteGroupId:        row?.noteGroupId         || '',
    methodApplicability:row?.methodApplicability|| 'ALL',
    currentNonCurrent:  row?.currentNonCurrent   || '',
    plCategory:         row?.plCategory          || '',
    isCashItem:         row?.isCashItem          || false,
  });
  const [saving, setSaving] = useState(false);
 
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
 
  // Auto-set sheet when AL changes
  const handleAL = (v) => {
    set('assetLiability', v);
    if (['Assets','Liabilities','Equity'].includes(v)) set('sheet','BS');
    else set('sheet','PL');
    if (['Income','Expenses'].includes(v)) { set('currentNonCurrent',''); }
    if (['Assets','Liabilities'].includes(v)) { set('plCategory',''); }
    if (v === 'Equity') { set('currentNonCurrent',''); set('plCategory',''); }
  };
 
  const handleSave = async () => {
    if (!form.groupName.trim()) return toast.error('Group name is required');
    if (!form.subGroupNo.trim()) return toast.error('Sub-group No is required');
    setSaving(true);
    try {
      if (isEdit) { await taxonomyAPI.update(row.id, form); toast.success('Row updated'); }
      else        { await taxonomyAPI.create(form);          toast.success('Row added to taxonomy'); }
      onSave();
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.message || 'Save failed');
    } finally { setSaving(false); }
  };
 
  const isBSRow = ['Assets','Liabilities','Equity'].includes(form.assetLiability);
 
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-[520px] max-w-[95vw] max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">{isEdit ? 'Edit taxonomy row' : 'Add taxonomy row'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
 
        <div className="p-6 space-y-4">
          {/* Group Name */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Group Name <span className="text-red-400">*</span>
              <span className="font-normal text-slate-400 ml-1">— this is the FS line item label shown in statements</span>
            </label>
            <input
              value={form.groupName}
              onChange={e => set('groupName', e.target.value)}
              placeholder="e.g. Property, Plant and Equipment"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
 
          {/* Row identity */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Sub-group No <span className="text-red-400">*</span>
                <span className="font-normal text-slate-400 ml-1">(unique ID)</span>
              </label>
              <input
                value={form.subGroupNo}
                onChange={e => set('subGroupNo', e.target.value)}
                placeholder="e.g. FIRM-BS-PPE1"
                disabled={isEdit}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Sub-group Name</label>
              <input
                value={form.subGroupName}
                onChange={e => set('subGroupName', e.target.value)}
                placeholder="Detailed label (optional)"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
 
          {/* Classification */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
              <select value={form.assetLiability} onChange={e => handleAL(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                {AL_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Sheet</label>
              <select value={form.sheet} onChange={e => set('sheet', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                {SHEET_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Method</label>
              <select value={form.methodApplicability} onChange={e => set('methodApplicability', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                {METHOD_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
 
          {/* Metadata — conditional */}
          <div className="grid grid-cols-2 gap-3">
            {isBSRow && (
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Current / Non-current
                  <span className="font-normal text-slate-400 ml-1">(BS sub-section)</span>
                </label>
                <select value={form.currentNonCurrent} onChange={e => set('currentNonCurrent', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">Not applicable (Equity)</option>
                  <option value="current">Current</option>
                  <option value="noncurrent">Non-current</option>
                </select>
              </div>
            )}
            {!isBSRow && (
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  P&L Category
                  <span className="font-normal text-slate-400 ml-1">(which section in P&L)</span>
                </label>
                <select value={form.plCategory} onChange={e => set('plCategory', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">Select category</option>
                  {PL_CATS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            )}
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isCashItem}
                  onChange={e => set('isCashItem', e.target.checked)}
                  className="w-4 h-4 rounded accent-indigo-600" />
                <span className="text-sm text-slate-700">Cash equivalent</span>
                <span className="text-xs text-slate-400">(for CFS closing cash)</span>
              </label>
            </div>
          </div>
 
          {/* Note Group */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Note Group ID <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              value={form.noteGroupId}
              onChange={e => set('noteGroupId', e.target.value)}
              placeholder="e.g. NG-PPE"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
 
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Add row')}
          </button>
        </div>
      </div>
    </div>
  );
}
 
// ── Main TaxonomyManager Component ───────────────────────────────────────────
export default function TaxonomyManager() {
  const [rows,    setRows]    = useState([]);
  const [gaps,    setGaps]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [total,   setTotal]   = useState(0);
  const [tab,     setTab]     = useState('browse'); // browse | gaps | import
  const [modal,   setModal]   = useState(null);     // null | 'add' | rowObj
  const [deleting,setDeleting]= useState(null);
 
  // Filters
  const [search, setSearch]   = useState('');
  const [fMethod, setFMethod] = useState('');
  const [fAL,     setFAL]     = useState('');
  const [fSheet,  setFSheet]  = useState('');
 
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rowsRes, gapsRes] = await Promise.all([
        taxonomyAPI.list({ method: fMethod, sheet: fSheet, search }),
        taxonomyAPI.gaps(),
      ]);
      setRows(rowsRes.data.rows);
      setTotal(rowsRes.data.total);
      setGaps(gapsRes.data.gaps);
    } catch (err) {
      toast.error('Failed to load taxonomy');
    } finally { setLoading(false); }
  }, [fMethod, fSheet, search]);
 
  useEffect(() => { load(); }, [load]);
 
  const handleDelete = async (row) => {
    if (!window.confirm(`Deactivate "${row.groupName}"? Existing mappings will not be affected.`)) return;
    setDeleting(row.id);
    try {
      await taxonomyAPI.remove(row.id);
      toast.success('Row deactivated');
      load();
    } catch { toast.error('Failed to deactivate'); }
    finally { setDeleting(null); }
  };
 
  const handlePromoteGap = (gap) => {
    setModal({
      groupName: gap.groupName,
      sheet: 'BS',
      assetLiability: 'Assets',
      subGroupNo: `FIRM-${Date.now()}`,
      subGroupName: gap.groupName,
      methodApplicability: 'ALL',
    });
    setTab('browse');
  };
 
  // Apply client-side AL filter
  const displayed = fAL ? rows.filter(r => r.assetLiability === fAL) : rows;
 
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Taxonomy Manager</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure how trial balance accounts map to FS line items.
            Changes take effect on next "Generate FS".
          </p>
        </div>
        <button onClick={() => setModal('add')}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 flex items-center gap-2">
          + Add row
        </button>
      </div>
 
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total rows',       value: total },
          { label: 'Methods covered',  value: 4 },
          { label: 'Unmapped items',   value: gaps.length },
          { label: 'Custom rows',      value: rows.filter(r => r.subGroupNo?.startsWith('FIRM-')).length },
        ].map(s => (
          <div key={s.label} className="bg-slate-50 rounded-xl border border-slate-100 px-4 py-3">
            <div className="text-xl font-bold text-slate-900">{s.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>
 
      {/* Gap warning */}
      {gaps.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
          <span className="text-amber-500 mt-0.5">⚠</span>
          <span>
            <strong>{gaps.length} account name{gaps.length > 1 ? 's' : ''}</strong> from recent engagements
            have no master row — they were mapped manually. Add them in the{' '}
            <button onClick={() => setTab('gaps')} className="underline font-medium">Unmapped items</button> tab
            so future engagements auto-map correctly.
          </span>
        </div>
      )}
 
      {/* Tabs */}
      <div className="border-b border-slate-200 flex gap-6 text-sm">
        {[
          { key:'browse', label:`Browse taxonomy (${total})` },
          { key:'gaps',   label:`Unmapped items (${gaps.length})` },
          { key:'import', label:'Import / Export' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`pb-2.5 font-medium transition-colors ${
              tab===t.key
                ? 'border-b-2 border-indigo-600 text-indigo-600'
                : 'text-slate-500 hover:text-slate-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>
 
      {/* ── BROWSE TAB ── */}
      {tab === 'browse' && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search group name…"
              className="flex-1 min-w-[180px] border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <select value={fMethod} onChange={e => setFMethod(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">All methods</option>
              {METHOD_OPTIONS.map(o => <option key={o}>{o}</option>)}
            </select>
            <select value={fAL} onChange={e => setFAL(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">All types</option>
              {AL_OPTIONS.map(o => <option key={o}>{o}</option>)}
            </select>
            <select value={fSheet} onChange={e => setFSheet(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">BS + PL</option>
              <option value="BS">BS only</option>
              <option value="PL">PL only</option>
            </select>
          </div>
 
          {/* Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500 font-medium">
                  <th className="text-left px-4 py-2.5">Group Name</th>
                  <th className="text-left px-3 py-2.5">Type</th>
                  <th className="text-left px-3 py-2.5">Current/NC</th>
                  <th className="text-left px-3 py-2.5">PL Category</th>
                  <th className="text-left px-3 py-2.5">Cash</th>
                  <th className="text-left px-3 py-2.5">Method</th>
                  <th className="text-left px-3 py-2.5 text-right">Used</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400 text-sm">Loading…</td></tr>
                )}
                {!loading && displayed.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400 text-sm">No rows found</td></tr>
                )}
                {!loading && displayed.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50 group">
                    <td className="px-4 py-2.5 font-medium text-slate-800 max-w-[220px]">
                      <div className="truncate">{row.groupName}</div>
                      <div className="text-xs text-slate-400 font-normal truncate">{row.subGroupNo}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge label={row.assetLiability} colorClass={AL_COLORS[row.assetLiability] || ''} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge label={row.currentNonCurrent}
                        colorClass={row.currentNonCurrent==='current'?'bg-amber-100 text-amber-800':'bg-blue-100 text-blue-800'} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge label={row.plCategory} colorClass={PL_COLORS[row.plCategory] || 'bg-slate-100 text-slate-600'} />
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {row.isCashItem ? <span className="text-emerald-600 font-medium">✓</span> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">{row.methodApplicability}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-500 text-right">
                      {row.usageCount > 0
                        ? <span className="bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">{row.usageCount}</span>
                        : <span className="text-slate-300">0</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                        <button onClick={() => setModal(row)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors text-xs">
                          Edit
                        </button>
                        <button onClick={() => handleDelete(row)}
                          disabled={deleting === row.id}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors text-xs disabled:opacity-50">
                          {deleting === row.id ? '…' : 'Deactivate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400">
            Showing {displayed.length} of {total} active rows
          </p>
        </div>
      )}
 
      {/* ── GAPS TAB ── */}
      {tab === 'gaps' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            These account names appeared in client TBs but matched no master row.
            Add them here so the auto-mapper handles them in future engagements.
          </p>
          {gaps.length === 0 && (
            <div className="border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm">
              ✓ All mapped group names exist in the taxonomy
            </div>
          )}
          {gaps.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs text-slate-500 font-medium">
                    <th className="text-left px-4 py-2.5">Account name (from TB)</th>
                    <th className="text-left px-4 py-2.5">Seen in engagement</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {gaps.map((gap, i) => (
                    <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">{gap.groupName}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{gap.engagementName}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => handlePromoteGap(gap)}
                          className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700">
                          Add to taxonomy →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
 
      {/* ── IMPORT TAB ── */}
      {tab === 'import' && (
        <div className="space-y-5">
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
            <div className="text-3xl mb-3">📥</div>
            <p className="font-medium text-slate-700 mb-1">Import from Excel / CSV</p>
            <p className="text-sm text-slate-500 mb-4">
              Upload your firm's standard chart of accounts.
            </p>
            <p className="text-xs text-slate-400 font-mono bg-slate-50 rounded-lg px-4 py-2 inline-block">
              Group Name · Sheet · Type · Current/NC · PL Category · Is Cash · Method · Sub Group No
            </p>
            <p className="text-xs text-slate-400 mt-3">
              Coming in next sprint — use the SQL import for now.
            </p>
          </div>
 
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Export current taxonomy</p>
            <button
              onClick={async () => {
                try {
                  const res = await taxonomyAPI.list({});
                  const rows = res.data.rows;
                  const headers = ['id','groupName','sheet','assetLiability','subGroupNo','subGroupName','methodApplicability','currentNonCurrent','plCategory','isCashItem','displayOrder'];
                  const csv = [
                    headers.join(','),
                    ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))
                  ].join('\n');
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = 'taxonomy.csv'; a.click();
                  URL.revokeObjectURL(url);
                  toast.success('Taxonomy exported');
                } catch { toast.error('Export failed'); }
              }}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
              ↓ Download taxonomy CSV
            </button>
          </div>
 
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Import rules</p>
            <ul className="text-xs text-slate-500 space-y-1 list-disc list-inside">
              <li>Rows with matching <code className="bg-slate-100 px-1 rounded">Sub Group No</code> are updated — never duplicated</li>
              <li>New rows are added — existing rows never deleted</li>
              <li><code className="bg-slate-100 px-1 rounded">Sheet</code>: BS or PL</li>
              <li><code className="bg-slate-100 px-1 rounded">Type</code>: Assets / Liabilities / Equity / Income / Expenses</li>
              <li><code className="bg-slate-100 px-1 rounded">Current/NC</code>: current or noncurrent (blank for Equity / PL items)</li>
              <li><code className="bg-slate-100 px-1 rounded">PL Category</code>: revenue / otherIncome / cos / selling / admin / depreciation / financeCost / tax / oci</li>
              <li><code className="bg-slate-100 px-1 rounded">Is Cash</code>: true for Cash and Cash Equivalents only</li>
              <li><code className="bg-slate-100 px-1 rounded">Method</code>: ALL / IND_AS / IFRS / IFRS_SME</li>
            </ul>
          </div>
        </div>
      )}
 
      {/* Modal */}
      {modal && (
        <RowModal
          row={modal === 'add' ? null : modal}
          onSave={() => { setModal(null); load(); }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
 
/*
── INTEGRATION INTO Settings.jsx ─────────────────────────────────────────────
 
1. Import at top of Settings.jsx:
   import TaxonomyManager from './TaxonomyManager';
 
2. Add to TABS array (only show for FIRM_ADMIN):
   { key:'taxonomy', label:'🗂 Taxonomy', adminOnly: true },
 
3. Add tab rendering (after billing tab block):
   {activeTab === 'taxonomy' && (
     <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
       <TaxonomyManager />
     </div>
   )}
 
4. Filter tabs by role in the sidebar (TABS.filter):
   {TABS.filter(t => !t.adminOnly || user?.role === 'FIRM_ADMIN').map(...)}
 
5. Add to server.js:
   const taxonomyRoutes = require('./src/routes/taxonomy.routes');
   app.use('/api/taxonomy', taxonomyRoutes);
 
─────────────────────────────────────────────────────────────────────────────*/