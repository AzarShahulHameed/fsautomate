import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { mappingAPI, fsAPI, notesAPI, tbAPI } from '../api/client';
import { useStore } from '../store';
 
const UNITS = [
  { label: 'Actual',     value: 1,        display: '' },
  { label: 'Hundreds',   value: 100,      display: '00s' },
  { label: 'Thousands',  value: 1000,     display: '000s' },
  { label: 'Lakhs',      value: 100000,   display: 'Lakhs' },
  { label: 'Crores',     value: 10000000, display: 'Crores' },
];
 
function fmtAmt(n, divisor = 1) {
  const num = Number(n || 0) / divisor;
  const abs = Math.abs(num);
  return (num < 0 ? '-' : '') + Math.round(abs).toLocaleString('en-IN');
}
 
// ── Normalize text: remove special chars, fix casing, trim spaces ─────────────
function normalizeText(raw) {
  return raw
    // Remove special characters except hyphen and parentheses
    .replace(/[^a-zA-Z0-9\s\-()&/]/g, '')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}
 
function titleCase(str) {
  return str
    .toLowerCase()
    .replace(/(?:^|\s|\(|-)\w/g, c => c.toUpperCase());
}
 
// Smart fuzzy score — ranks results by relevance like AI autocomplete
function smartScore(option, query) {
  const o = option.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return 1;
  if (o === q) return 100;                          // exact match
  if (o.startsWith(q)) return 90;                   // starts with
  if (o.includes(' ' + q)) return 80;               // word boundary match
  if (o.includes(q)) return 70;                     // contains
  // fuzzy: all query chars appear in order
  let qi = 0;
  for (let i = 0; i < o.length && qi < q.length; i++) {
    if (o[i] === q[qi]) qi++;
  }
  if (qi === q.length) return 40 + (q.length / o.length) * 20; // fuzzy match
  return 0;
}
 
// Deduplicate options — normalize and compare case-insensitively
function deduplicateOptions(opts) {
  const seen = new Map();
  for (const opt of opts) {
    const key = opt.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!seen.has(key)) seen.set(key, opt);
  }
  return Array.from(seen.values());
}
 
// ── Smart AI-like FS Head Dropdown ────────────────────────────────────────────
function FSHeadInput({ value, onChange, options, currency, usageMap = {} }) {
  const [query,     setQuery]     = useState(value || '');
  const [open,      setOpen]      = useState(false);
  const [highlight, setHighlight] = useState(0);
  const ref     = useRef(null);
  const inputRef = useRef(null);
  const listRef  = useRef(null);
 
  // Sync external value without losing cursor position
  useEffect(() => {
    setQuery(value || '');
  }, [value]);
 
  // Deduplicated, cleaned options
  const cleanOptions = useMemo(() => deduplicateOptions(options), [options]);
 
  // Smart ranked results — AI-style: most used + best match first
  const ranked = useMemo(() => {
    const q = query.trim();
    return cleanOptions
      .map(opt => ({
        opt,
        score: smartScore(opt, q) + (usageMap[opt] || 0) * 0.5, // boost frequently used
      }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(r => r.opt);
  }, [query, cleanOptions, usageMap]);
 
  // Show all options sorted by usage when no query
  const displayed = useMemo(() => {
    if (!query.trim()) {
      return [...cleanOptions].sort((a, b) => (usageMap[b] || 0) - (usageMap[a] || 0));
    }
    return ranked;
  }, [query, ranked, cleanOptions, usageMap]);
 
  // Check if typed value already exists (case-insensitive)
  const exactExists = cleanOptions.some(
    o => o.toLowerCase() === query.toLowerCase().trim()
  );
 
  // Normalize and title-case the query for "Add new" suggestion
  const normalizedNew = titleCase(normalizeText(query));
  const canAddNew = query.trim() && !exactExists && normalizedNew.length >= 2;
 
  // Close on outside click
  useEffect(() => {
    const handler = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
 
  // Scroll highlighted item into view
  useEffect(() => {
    if (listRef.current) {
      const item = listRef.current.children[highlight];
      if (item) item.scrollIntoView({ block: 'nearest' });
    }
  }, [highlight]);
 
  function select(opt) {
    // Always normalize before saving
    const clean = titleCase(normalizeText(opt));
    setQuery(clean);
    onChange(clean);
    setOpen(false);
    setHighlight(0);
  }
 
  function handleInput(e) {
    const raw = e.target.value;
    // Strip special characters as user types — instant cleanup
    const cleaned = raw.replace(/[^a-zA-Z0-9\s\-()&/]/g, '');
    setQuery(cleaned);
    // Don't call onChange yet — only on select/Enter
    // This prevents the "b then a" flicker from double re-render
    setOpen(true);
    setHighlight(0);
  }
 
  function handleBlur() {
    // On blur, normalize what's typed and save it
    setTimeout(() => {
      if (!open) {
        const clean = titleCase(normalizeText(query));
        if (clean !== value) {
          setQuery(clean);
          onChange(clean);
        }
      }
    }, 150);
  }
 
  function handleKeyDown(e) {
    if (!open) { if (e.key === 'ArrowDown' || e.key === 'Enter') setOpen(true); return; }
    const total = displayed.length + (canAddNew ? 1 : 0);
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => (h + 1) % total); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlight(h => (h - 1 + total) % total); }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (canAddNew && highlight === 0) { select(normalizedNew); }
      else {
        const idx = canAddNew ? highlight - 1 : highlight;
        if (displayed[idx]) select(displayed[idx]);
        else if (query.trim()) select(normalizedNew);
      }
    }
    if (e.key === 'Escape') { setOpen(false); setHighlight(0); }
    if (e.key === 'Tab')    { setOpen(false); }
  }
 
  return (
    <div ref={ref} className="relative w-full">
      <input
        ref={inputRef}
        value={query}
        onChange={handleInput}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        spellCheck={false}
        placeholder="Type or search FS head..."
        className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
      />
      {open && (
        <div
          className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto"
          onMouseDown={e => e.preventDefault()}
          ref={listRef}
        >
          {/* Add new option — normalized and title-cased */}
          {canAddNew && (
            <div
              onClick={() => select(normalizedNew)}
              className={`flex items-center gap-2 px-3 py-2.5 text-sm cursor-pointer border-b border-slate-100 ${highlight === 0 ? 'bg-indigo-50' : 'hover:bg-indigo-50'}`}
            >
              <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold flex-shrink-0">+</span>
              <span className="text-indigo-600 font-semibold">Add</span>
              <span className="text-indigo-800 font-bold">"{normalizedNew}"</span>
              {normalizedNew !== query && (
                <span className="text-xs text-slate-400 ml-1">(auto-formatted)</span>
              )}
            </div>
          )}
          {/* No results */}
          {displayed.length === 0 && !canAddNew && (
            <div className="px-3 py-4 text-sm text-slate-400 text-center">
              No matching FS heads — type to add new
            </div>
          )}
          {/* Ranked results */}
          {displayed.map((opt, i) => {
            const idx    = canAddNew ? i + 1 : i;
            const isActive = opt.toLowerCase() === (value || '').toLowerCase();
            const usage   = usageMap[opt] || 0;
            return (
              <div
                key={opt}
                onClick={() => select(opt)}
                className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer transition-colors ${
                  highlight === idx ? 'bg-indigo-50' :
                  isActive ? 'bg-indigo-50' : 'hover:bg-slate-50'
                }`}
              >
                <span className={isActive ? 'text-indigo-700 font-semibold' : 'text-slate-700'}>{opt}</span>
                {usage > 0 && (
                  <span className="text-xs text-slate-300 flex-shrink-0 ml-2">
                    used {usage}×
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
 
export default function Mapping() {
  const { engagementId } = useParams();
  const { currentEngagement, currentClient, firm } = useStore();
  const navigate = useNavigate();
 
  const method   = currentEngagement?.method || 'AS';
  // Currency: method is most authoritative (IFRS=AED, AS/IND_AS=INR)
  const currency = (method === 'IFRS' || method === 'IFRS_SME')
    ? 'AED'
    : (method === 'AS' || method === 'IND_AS')
    ? 'INR'
    : (currentClient?.region === 'UAE' || currentClient?.country === 'UAE')
    ? 'AED'
    : 'INR';
  const currSymbol = currency === 'AED' ? 'AED' : '₹';
 
  const [tbRows,    setTbRows]    = useState([]);
  const [mappings,  setMappings]  = useState({});
  const [master,    setMaster]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [generating,setGenerating]= useState(false);
  const [editingRow,setEditingRow]= useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [search,    setSearch]    = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [unit,        setUnit]        = useState(UNITS[0]);
  const [customFSHeads, setCustomFSHeads] = useState([]);
 
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [latestTB, status, masterData] = await Promise.all([
        tbAPI.latest(engagementId),
        mappingAPI.status(engagementId),
        mappingAPI.master(method),
      ]);
      setTbRows(latestTB?.rows || []);
      const idx = {};
      (status.mappings || []).forEach(m => { idx[m.subGrouping] = m; });
      setMappings(idx);
      setMaster(Array.isArray(masterData) ? masterData : []);
    } catch { toast.error('Failed to load — make sure TB is uploaded first'); }
    finally { setLoading(false); }
  }, [engagementId, method]);
 
  useEffect(() => { load(); }, [load]);
 
  async function autoMap() {
    try {
      const res = await mappingAPI.autoMap(engagementId);
      toast.success(`Auto-mapped ${res.mapped || 0} items`);
      load();
    } catch (err) { toast.error(err?.error || 'Auto-map failed'); }
  }
 
  async function saveMapping(subGrouping, data) {
    try {
      const payload = { subGrouping, ...data };
      await mappingAPI.save(engagementId, payload);
      setMappings(prev => ({ ...prev, [subGrouping]: { ...prev[subGrouping], ...payload, isSaved: true } }));
      setEditingRow(null);
      toast.success('Saved ✓');
    } catch (err) {
      console.error('Save failed:', err);
      toast.error('Save failed');
    }
  }
 
  function generateNoteGroupId(groupName) {
    // Auto-generate a noteGroupId from the group name
    return 'NG-' + groupName.toUpperCase().replace(/[^A-Z0-9]/g, '-').replace(/-+/g, '-').slice(0, 20);
  }
 
  async function quickChangeGroup(subGrouping, groupName) {
    if (!groupName || groupName === '-- Select FS Head --') return;
    const masterRow = master.find(m => m.groupName === groupName);
    const data = {
      subGrouping,
      groupName,
      subGroupName:     masterRow?.subGroupName || subGrouping,
      noteGroupId:      masterRow?.noteGroupId  || generateNoteGroupId(groupName),
      masterGroupingId: masterRow?.id           || null,
    };
    await saveMapping(subGrouping, data);
  }
 
  async function generateFS() {
    setGenerating(true);
    try {
      await fsAPI.generate(engagementId);
      await notesAPI.generate(engagementId);
      toast.success('Financial statements and notes generated!');
      navigate(`/engagements/${engagementId}/fs`);
    } catch (err) { toast.error(err?.error || 'Generation failed'); }
    finally { setGenerating(false); }
  }
 
  // Aggregate TB rows by subGrouping
  const subGroupTotals = {};
  tbRows.forEach(r => {
    const sg = r.subGrouping || 'UNASSIGNED';
    if (!subGroupTotals[sg]) subGroupTotals[sg] = { subGrouping: sg, rows: [], total: 0 };
    subGroupTotals[sg].rows.push(r);
    subGroupTotals[sg].total += Number(r.finalNet || 0);
  });
 
  const allSubGroups = Object.values(subGroupTotals);
 
  // Combine master grouping names + any custom FS heads already used in this engagement
  const masterGroupNames = master.map(m => m.groupName);
  const savedGroupNames  = Object.values(mappings)
    .filter(m => m.groupName)
    .map(m => m.groupName);
  // Include custom FS heads added this session
  const rawGroups = [...new Set([...masterGroupNames, ...savedGroupNames, ...customFSHeads])];
  // Deduplicate — normalize case and spacing
  const seenGroups = new Map();
  for (const g of rawGroups) {
    if (!g) continue;
    const key = g.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!seenGroups.has(key)) seenGroups.set(key, g);
  }
  const uniqueGroups = Array.from(seenGroups.values()).sort();
 
  // Usage map — count how many TB rows use each FS head (AI learning)
  const usageMap = useMemo(() => {
    const map = {};
    Object.values(mappings).forEach(m => {
      if (m.groupName) map[m.groupName] = (map[m.groupName] || 0) + 1;
    });
    return map;
  }, [mappings]);
 
  const filtered = allSubGroups.filter(sg => {
    const isMapped = !!mappings[sg.subGrouping]?.groupName;
    if (filterStatus === 'mapped'   && !isMapped) return false;
    if (filterStatus === 'unmapped' && isMapped)  return false;
    if (search) {
      const q = search.toLowerCase();
      if (!sg.subGrouping.toLowerCase().includes(q) &&
          !(mappings[sg.subGrouping]?.groupName || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });
 
  const totalMapped   = allSubGroups.filter(sg => !!mappings[sg.subGrouping]?.groupName).length;
  const totalUnmapped = allSubGroups.length - totalMapped;
 
  if (loading) return <div className="p-8 text-slate-400">Loading TB data...</div>;
 
  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">TB → FS Mapping</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {tbRows.length} TB rows · {allSubGroups.length} sub-groupings ·
            <span className="text-green-600 font-medium ml-1">{totalMapped} mapped</span>
            {totalUnmapped > 0 && <span className="text-red-500 font-medium ml-1">· {totalUnmapped} unmapped</span>}
            <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700">{method}</span>
            <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600">{currency}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={autoMap} className="px-3 py-2 border border-slate-300 text-slate-700 text-sm rounded-lg hover:bg-slate-50">
            ↻ Auto-Map
          </button>
          <button onClick={generateFS} disabled={generating}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {generating ? 'Generating...' : `⚡ Generate FS${totalUnmapped > 0 ? ` (${totalUnmapped} unmapped)` : ''}`}
          </button>
        </div>
      </div>
 
      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap items-center bg-slate-50 border border-slate-200 rounded-xl p-3">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search sub-grouping or FS head..."
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 w-64" />
 
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
          {[['all','All'],['mapped','Mapped'],['unmapped','Unmapped']].map(([val,label]) => (
            <button key={val} onClick={() => setFilterStatus(val)}
              className={`px-3 py-1.5 ${filterStatus===val?'bg-indigo-600 text-white':'bg-white text-slate-600 hover:bg-slate-50'}`}>
              {label}
            </button>
          ))}
        </div>
 
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-slate-500">Amounts in:</span>
          <select value={unit.value} onChange={e => setUnit(UNITS.find(u => u.value === Number(e.target.value)))}
            className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400">
            {UNITS.map(u => (
              <option key={u.value} value={u.value}>
                {currSymbol} {u.label}
              </option>
            ))}
          </select>
        </div>
      </div>
 
      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          {tbRows.length === 0
            ? <><div className="text-5xl mb-3">📂</div><p>No TB uploaded yet.</p></>
            : <><div className="text-5xl mb-3">🔍</div><p>No results match your filter.</p></>}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-800 text-white sticky top-0 z-10">
              <tr>
                <th className="text-left px-4 py-3 font-medium w-8">#</th>
                <th className="text-left px-4 py-3 font-medium">TB Sub-Grouping</th>
                <th className="text-left px-4 py-3 font-medium w-72">FS Head (Group Name)</th>
                <th className="text-left px-4 py-3 font-medium w-44">Sub Group Name</th>
                <th className="text-left px-4 py-3 font-medium w-36">Note Group</th>
                <th className="text-right px-4 py-3 font-medium w-36">
                  Amount ({currSymbol}{unit.display ? ' ' + unit.display : ''})
                </th>
                <th className="text-center px-4 py-3 font-medium w-20">Source</th>
                <th className="text-center px-4 py-3 font-medium w-28">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((sg, idx) => {
                const mapping   = mappings[sg.subGrouping];
                const isMapped  = !!mapping?.groupName;
                const isEditing = editingRow === sg.subGrouping;
 
                return (
                  <React.Fragment key={sg.subGrouping}>
                    <tr className={`hover:bg-slate-50 ${!isMapped ? 'bg-red-50' : ''}`}>
                      <td className="px-4 py-2.5 text-slate-400 text-xs">{idx+1}</td>
 
                      <td className="px-4 py-2.5">
                        <div className={`font-medium ${isMapped ? 'text-slate-800' : 'text-red-700'}`}>{sg.subGrouping}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{sg.rows.length} ledger row{sg.rows.length > 1 ? 's' : ''}</div>
                        {!isMapped && <div className="text-xs text-red-500 mt-0.5">⚠ Not mapped</div>}
                      </td>
 
                      {/* FS Head — always searchable typeahead */}
                      <td className="px-4 py-2.5">
                        {isEditing ? (
                          <FSHeadInput
                            value={editDraft.groupName}
                            onChange={v => setEditDraft(d => ({ ...d, groupName: v }))}
                            options={uniqueGroups}
                            currency={currency}
                          />
                        ) : (
                          <FSHeadInput
                            value={mapping?.groupName || ''}
                            onChange={v => quickChangeGroup(sg.subGrouping, v)}
                            options={uniqueGroups}
                            currency={currency}
                          />
                        )}
                      </td>
 
                      {/* Sub Group Name */}
                      <td className="px-4 py-2.5">
                        {isEditing ? (
                          <input value={editDraft.subGroupName || ''} onChange={e => setEditDraft(d => ({ ...d, subGroupName: e.target.value }))}
                            className="w-full border border-indigo-400 rounded px-2 py-1 text-sm focus:outline-none"
                            placeholder="Sub group name..." />
                        ) : (
                          <span className="text-slate-500 text-xs">{mapping?.subGroupName || '—'}</span>
                        )}
                      </td>
 
                      {/* Note Group */}
                      <td className="px-4 py-2.5">
                        {isEditing ? (
                          <input value={editDraft.noteGroupId || ''} onChange={e => setEditDraft(d => ({ ...d, noteGroupId: e.target.value }))}
                            className="w-full border border-indigo-400 rounded px-2 py-1 text-sm focus:outline-none"
                            placeholder="NG-..." />
                        ) : (
                          <span className="text-slate-500 text-xs">{mapping?.noteGroupId || '—'}</span>
                        )}
                      </td>
 
                      {/* Amount */}
                      <td className="px-4 py-2.5 text-right font-mono text-slate-800">
                        {fmtAmt(sg.total, unit.value)}
                      </td>
 
                      {/* Source */}
                      <td className="px-4 py-2.5 text-center">
                        {isMapped && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${mapping?.isManual ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                            {mapping?.isManual ? 'Manual' : 'Auto'}
                          </span>
                        )}
                      </td>
 
                      {/* Actions */}
                      <td className="px-4 py-2.5 text-center">
                        {isEditing ? (
                          <div className="flex gap-1 justify-center">
                            <button onClick={() => saveMapping(sg.subGrouping, editDraft)}
                              className="px-2 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700">Save</button>
                            <button onClick={() => setEditingRow(null)}
                              className="px-2 py-1 border border-slate-300 text-slate-600 text-xs rounded hover:bg-slate-50">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => { setEditDraft({ groupName: mapping?.groupName||'', subGroupName: mapping?.subGroupName||'', noteGroupId: mapping?.noteGroupId||'' }); setEditingRow(sg.subGrouping); }}
                            className="px-2 py-1 border border-slate-300 text-slate-600 text-xs rounded hover:bg-slate-100 hover:border-indigo-400">
                            ✏ Edit
                          </button>
                        )}
                      </td>
                    </tr>
 
                    {/* Expanded ledger rows when editing */}
                    {isEditing && sg.rows.map((row, ri) => (
                      <tr key={ri} className="bg-indigo-50 border-b border-indigo-100">
                        <td className="px-4 py-1.5 text-slate-400 text-xs">{ri+1}</td>
                        <td className="px-8 py-1.5 text-slate-600 text-xs" colSpan={4}>
                          {row.accountNumber} — {row.accountName}
                        </td>
                        <td className="px-4 py-1.5 text-right font-mono text-xs text-slate-700">
                          {fmtAmt(row.finalNet, unit.value)}
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-100 border-t-2 border-slate-300">
              <tr>
                <td colSpan={5} className="px-4 py-2.5 font-bold text-slate-800">
                  Total ({filtered.length} sub-groupings)
                </td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-800">
                  {fmtAmt(filtered.reduce((s, sg) => s + sg.total, 0), unit.value)}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}