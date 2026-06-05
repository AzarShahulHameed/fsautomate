import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { notesAPI } from '../api/client';
import { useStore } from '../store';
import toast from 'react-hot-toast';

// Toggle Switch component
function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
        checked ? 'bg-indigo-600' : 'bg-slate-200'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`} />
    </button>
  );
}

export default function Notes() {
  const { engagementId } = useParams();
  const { currentEngagement, currentClient, firm } = useStore();

  const method     = currentEngagement?.method || 'AS';
  const region     = currentClient?.region || (currentClient?.country === 'UAE' ? 'UAE' : firm?.region || 'India');
  const currency   = (method === 'IFRS' || method === 'IFRS_SME') ? 'AED'
    : (method === 'AS' || method === 'IND_AS') ? 'INR'
    : (currentClient?.region === 'UAE') ? 'AED' : 'INR';
  const currSymbol = currency === 'AED' ? 'AED' : '₹';

  const UNITS = [
    { label: `Actual (${currSymbol})`, value: 1        },
    { label: `${currSymbol} Thousands`,value: 1000     },
    { label: `${currSymbol} Lakhs`,    value: 100000   },
    { label: `${currSymbol} Crores`,   value: 10000000 },
  ];

  const [notes,        setNotes]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [unit,         setUnit]         = useState(UNITS[0]);
  const [breakupOn,    setBreakupOn]    = useState({});
  const [ledgerOpen,   setLedgerOpen]   = useState({});
  const [editingContent, setEditingContent] = useState(null); // noteGroupId being edited
  const [contentDraft,   setContentDraft]   = useState('');
  const [savingContent,  setSavingContent]  = useState(false);

  useEffect(() => { load(); }, [engagementId]);

  async function load() {
    setLoading(true);
    try {
      const data = await notesAPI.get(engagementId);
      const list = Array.isArray(data) ? data : [];
      setNotes(list.filter(n => !n.title?.startsWith('__') && !n.noteGroupId?.startsWith('__')));
    } catch { setNotes([]); }
    finally { setLoading(false); }
  }

  async function generate() {
    try {
      await notesAPI.generate(engagementId);
      toast.success('Notes generated');
      load();
    } catch (err) { toast.error(err?.error || 'Failed — generate FS first'); }
  }

  async function saveContent(noteGroupId) {
    setSavingContent(true);
    try {
      await notesAPI.saveContent(engagementId, noteGroupId, contentDraft);
      setNotes(prev => prev.map(n =>
        n.noteGroupId === noteGroupId ? { ...n, noteContent: contentDraft } : n
      ));
      setEditingContent(null);
      toast.success('Disclosure saved');
    } catch { toast.error('Failed to save'); }
    finally { setSavingContent(false); }
  }

  function startEditContent(note) {
    setEditingContent(note.noteGroupId);
    setContentDraft(note.noteContent || '');
  }

  function fmt(n) {
    const num = Number(n || 0) / unit.value;
    const abs = Math.abs(num);
    const s   = Math.round(abs).toLocaleString('en-IN');
    return num < 0 ? `(${s})` : s;
  }

  const toggleBreakup = id  => setBreakupOn(p  => ({ ...p, [id]: !p[id] }));
  const toggleLedger  = key => setLedgerOpen(p => ({ ...p, [key]: !p[key] }));

  if (loading) return <div className="p-8 text-slate-400">Loading notes...</div>;

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Notes to Financial Statements</h1>
          <p className="text-slate-500 text-sm mt-0.5">{notes.length} notes · {method} · {currency}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Amounts in:</span>
            <select value={unit.value}
              onChange={e => setUnit(UNITS.find(u => u.value === Number(e.target.value)))}
              className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400">
              {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </div>
          <button onClick={generate}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700">
            ⚡ Generate Notes
          </button>
        </div>
      </div>

      <p className="mb-5 text-xs text-slate-400 italic">
        All amounts in {unit.label} unless stated otherwise
      </p>

      {notes.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-xl text-slate-400">
          <div className="text-5xl mb-4">📝</div>
          <p className="font-medium text-slate-600">No notes generated yet.</p>
          <p className="text-sm mt-1">Generate Financial Statements first, then click Generate Notes.</p>
          <button onClick={generate} className="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg">
            Generate Notes
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {notes.map(note => {
            const subGroups   = note.subGroups || [];
            const isBreakupOn = breakupOn[note.noteGroupId];
            const hasBreakup  = subGroups.length > 0;

            return (
              <div key={note.noteGroupId}
                className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">

                {/* ── Note header row ── */}
                <div className="flex items-center gap-4 px-5 py-4">
                  {/* Note number badge */}
                  <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0 shadow-sm">
                    {note.noteNumber}
                  </div>

                  {/* Title */}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900">{note.title}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {hasBreakup
                        ? `${subGroups.length} sub-grouping${subGroups.length > 1 ? 's' : ''}`
                        : 'No breakup data'}
                    </div>
                  </div>

                  {/* Total amount */}
                  <div className="text-right mr-4 flex-shrink-0">
                    <div className="font-mono font-bold text-slate-900 text-lg">{fmt(note.total)}</div>
                    <div className="text-xs text-slate-400">{currSymbol}</div>
                  </div>

                  {/* Toggle switch */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-slate-500 font-medium">Show Breakup</span>
                    <Toggle
                      checked={isBreakupOn}
                      onChange={() => toggleBreakup(note.noteGroupId)}
                      disabled={!hasBreakup}
                    />
                  </div>
                </div>

                {/* ── Breakup table — shows when toggle is ON ── */}
                {isBreakupOn && hasBreakup && (
                  <div className="border-t border-slate-100">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-left px-5 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider w-10">#</th>
                          <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
                            Particulars
                          </th>
                          <th className="text-right px-5 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider w-44">
                            {`Amount (${currSymbol})`}
                          </th>
                          <th className="w-28 text-center px-3 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
                            Detail
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {subGroups.map((sg, i) => {
                          const ledgerKey     = `${note.noteGroupId}__${sg.subGroupName}`;
                          const isLedgerOpen  = ledgerOpen[ledgerKey];
                          const hasLedger     = sg.rows?.length > 0;
                          const isNilBalance  = Math.abs(Number(sg.subtotal)) < 0.01;

                          return (
                            <React.Fragment key={i}>
                              {/* Sub-grouping row */}
                              <tr className={`border-b border-slate-100 transition-colors ${
                                isNilBalance ? 'bg-slate-50/50' :
                                isLedgerOpen ? 'bg-indigo-50/40' : 'hover:bg-slate-50'
                              }`}>
                                <td className="px-5 py-3 text-xs text-slate-400 font-mono">{i + 1}</td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <span className={`font-medium ${isNilBalance ? 'text-slate-400' : 'text-slate-800'}`}>
                                      {sg.subGroupName}
                                    </span>
                                    {isNilBalance && (
                                      <span className="text-xs text-slate-400 italic">(nil balance)</span>
                                    )}
                                  </div>
                                </td>
                                <td className={`px-5 py-3 text-right font-mono font-semibold ${
                                  isNilBalance ? 'text-slate-400' : 'text-slate-900'
                                }`}>
                                  {fmt(sg.subtotal)}
                                </td>
                                <td className="px-3 py-3 text-center">
                                  {hasLedger && (
                                    <button
                                      onClick={() => toggleLedger(ledgerKey)}
                                      className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-all ${
                                        isLedgerOpen
                                          ? 'bg-indigo-600 text-white border-indigo-600'
                                          : 'bg-white text-slate-500 border-slate-300 hover:border-indigo-400 hover:text-indigo-600'
                                      }`}>
                                      {isLedgerOpen ? '▲ Hide' : `▼ ${sg.rows.length} a/c`}
                                    </button>
                                  )}
                                </td>
                              </tr>

                              {/* Individual ledger accounts — second level detail */}
                              {isLedgerOpen && sg.rows.map((row, ri) => (
                                <tr key={ri} className="bg-indigo-50/20 border-b border-indigo-100/40 hover:bg-indigo-50/40">
                                  <td className="px-5 py-2 text-xs text-slate-300"></td>
                                  <td className="py-2 pl-10 pr-4 text-slate-600 text-xs">
                                    <span className="font-mono text-slate-400 mr-2 text-xs">{row.accountNumber}</span>
                                    {row.accountName}
                                  </td>
                                  <td className={`px-5 py-2 text-right font-mono text-xs ${
                                    Math.abs(Number(row.finalNet)) < 0.01 ? 'text-slate-400' : 'text-slate-700'
                                  }`}>
                                    {fmt(row.finalNet)}
                                  </td>
                                  <td></td>
                                </tr>
                              ))}
                            </React.Fragment>
                          );
                        })}
                      </tbody>

                      {/* Total row */}
                      <tfoot className="border-t-2 border-slate-300 bg-slate-50">
                        <tr>
                          <td colSpan={2} className="px-5 py-3">
                            <span className="font-bold text-slate-800">Total — {note.title}</span>
                          </td>
                          <td className="px-5 py-3 text-right font-mono font-bold text-slate-900 text-base">
                            {fmt(note.total)}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                {/* ── Disclosure text content ── */}
                {editingContent === note.noteGroupId ? (
                  <div className="px-5 py-3 border-t border-slate-100">
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                      Disclosure Text <span className="font-normal text-slate-400">(shown above the note table in Word export)</span>
                    </label>
                    <textarea
                      value={contentDraft}
                      onChange={e => setContentDraft(e.target.value)}
                      rows={4}
                      placeholder="e.g. Trade receivables are unsecured and considered good unless stated otherwise..."
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                    />
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => saveContent(note.noteGroupId)} disabled={savingContent}
                        className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                        {savingContent ? 'Saving...' : '💾 Save'}
                      </button>
                      <button onClick={() => setEditingContent(null)}
                        className="px-3 py-1.5 border border-slate-300 text-xs rounded-lg text-slate-600 hover:bg-slate-50">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="px-5 pb-3 border-t border-slate-100 pt-2 flex items-start justify-between gap-2">
                    {note.noteContent ? (
                      <p className="text-xs text-slate-600 italic flex-1">{note.noteContent}</p>
                    ) : (
                      <p className="text-xs text-slate-400 italic flex-1">No disclosure text — click Edit to add</p>
                    )}
                    <button onClick={() => startEditContent(note)}
                      className="text-xs text-indigo-500 hover:text-indigo-700 flex-shrink-0 underline">
                      {note.noteContent ? 'Edit' : '+ Add disclosure'}
                    </button>
                  </div>
                )}

                {/* Hint when breakup is OFF and has data */}
                {!isBreakupOn && hasBreakup && (
                  <div className="px-5 pb-3 -mt-1">
                    <p className="text-xs text-slate-400">
                      {subGroups.length} sub-grouping{subGroups.length > 1 ? 's' : ''} ·
                      toggle to see breakup
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
