import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store';
import { engagementAPI, mappingAPI, authAPI } from '../api/client';
import { ArrowRight, BookOpen, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
 
function buildFYOptions() {
  const now = new Date();
  const indiaCurrentStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const uaeCurrentYear = now.getFullYear();
  const indiaOptions = Array.from({ length: 6 }, (_, i) => {
    const start = indiaCurrentStartYear - i;
    return start + '-' + String(start + 1).slice(-2);
  });
  const uaeOptions = Array.from({ length: 6 }, (_, i) => String(uaeCurrentYear - i));
  return { indiaOptions, uaeOptions };
}
const { indiaOptions, uaeOptions } = buildFYOptions();
 
const REGION_CONFIG = {
  India: {
    flag: '🇮🇳', currency: 'INR', currSymbol: '₹',
    methods: ['AS', 'IND_AS'],
    methodLabels: { AS: 'AS — Companies Act 2013', IND_AS: 'Ind AS — IFRS Converged' },
    fyOptions: indiaOptions,
  },
  UAE: {
    flag: '🇦🇪', currency: 'AED', currSymbol: 'AED',
    methods: ['IFRS', 'IFRS_SME'],
    methodLabels: { IFRS: 'IFRS — Full Standards', IFRS_SME: 'IFRS SME — Simplified' },
    fyOptions: uaeOptions,
  },
};
 
function getClientRegion(client) {
  if (!client) return 'India';
  if (client.region === 'UAE' || client.country === 'UAE') return 'UAE';
  return 'India';
}
 
const STATUS_CONFIG = {
  DRAFT:        { label: 'Draft',        color: 'bg-slate-100 text-slate-600',    next: 'IN_PROGRESS',  nextLabel: 'Start Work' },
  IN_PROGRESS:  { label: 'In Progress',  color: 'bg-blue-100 text-blue-700',      next: 'UNDER_REVIEW', nextLabel: 'Submit for Review' },
  UNDER_REVIEW: { label: 'Under Review', color: 'bg-amber-100 text-amber-700',    next: 'LOCKED',       nextLabel: 'Approve & Lock' },
  LOCKED:       { label: 'Locked',       color: 'bg-emerald-100 text-emerald-700',next: 'FILED',        nextLabel: 'Mark as Filed' },
  FILED:        { label: 'Filed',        color: 'bg-purple-100 text-purple-700',  next: null,           nextLabel: null },
};
 
const METHOD_COLOR = {
  AS: 'bg-blue-100 text-blue-700',
  IND_AS: 'bg-purple-100 text-purple-700',
  IFRS: 'bg-emerald-100 text-emerald-700',
  IFRS_SME: 'bg-amber-100 text-amber-700',
};
 
// ── Three-dot menu ────────────────────────────────────────────────────────────
function CardMenu({ onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
 
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);
 
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors text-lg font-bold leading-none"
        title="Options"
      >
        ···
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-30 bg-white border border-slate-200 rounded-xl shadow-xl w-40 py-1">
          <button
            onClick={e => { e.stopPropagation(); setOpen(false); onEdit(); }}
            className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
          >
            ✏️ Edit
          </button>
          <div className="border-t border-slate-100 my-1" />
          <button
            onClick={e => { e.stopPropagation(); setOpen(false); onDelete(); }}
            className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
          >
            🗑 Delete
          </button>
        </div>
      )}
    </div>
  );
}
 
// ── Edit Engagement Modal ─────────────────────────────────────────────────────
function EditEngagementModal({ engagement, regionCfg, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: engagement.name || '',
    method: engagement.method || regionCfg.methods[0],
    financialYear: engagement.financialYear || regionCfg.fyOptions[0],
  });
  const [saving, setSaving] = useState(false);
 
  async function submit(e) {
    e.preventDefault();
    if (!form.name?.trim()) { toast.error('Engagement name is required'); return; }
    setSaving(true);
    try {
      // engagementAPI doesn't have a generic update — use the lock/status patch pattern
      // We'll call a PATCH to /engagements/:id with the name and financialYear
      const res = await engagementAPI.update
        ? engagementAPI.update(engagement.id, { name: form.name.trim(), financialYear: form.financialYear })
        : Promise.reject(new Error('update not available'));
      toast.success('Engagement updated');
      onSaved({ ...engagement, ...form, name: form.name.trim() });
    } catch (err) {
      // If engagementAPI.update doesn't exist yet, show helpful message
      const msg = err?.response?.data?.error || err?.message || 'Update failed';
      if (msg.includes('update not available')) {
        toast.error('Engagement name update requires backend route — contact admin');
      } else {
        toast.error(msg);
      }
    } finally { setSaving(false); }
  }
 
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="font-bold text-slate-900">Edit Engagement</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100">✕</button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Engagement Name *</label>
            <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="Statutory Audit 2024" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Financial Year</label>
            <select value={form.financialYear} onChange={e => setForm(f => ({ ...f, financialYear: e.target.value }))}
              className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
              {regionCfg.fyOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-500">
            Method <span className="font-semibold text-slate-700">{engagement.method}</span> cannot be changed after creation.
          </div>
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving}
              className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button type="button" onClick={onClose}
              className="px-5 py-2.5 border border-slate-300 text-slate-600 text-sm rounded-xl hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
 
// ── Main Engagements Page ─────────────────────────────────────────────────────
export default function Engagements() {
  const { clientId } = useParams();
  const { setCurrentEngagement, currentClient, firm, user } = useStore();
  const navigate = useNavigate();
 
  const clientRegion = getClientRegion(currentClient);
  const regionCfg    = REGION_CONFIG[clientRegion];
 
  const [engagements, setEngagements] = useState([]);
  const [showNew, setShowNew]         = useState(false);
  const [editModal, setEditModal]     = useState(null); // engagement obj | null
 
  const [form, setForm] = useState({
    name: '', method: regionCfg.methods[0],
    financialYear: regionCfg.fyOptions[0], currency: regionCfg.currency,
  });
 
  useEffect(() => {
    const cfg = REGION_CONFIG[clientRegion];
    setForm({ name: '', method: cfg.methods[0], financialYear: cfg.fyOptions[0], currency: cfg.currency });
  }, [clientRegion]);
 
  // Team panel state
  const [teamPanel,     setTeamPanel]     = useState(null);
  const [firmUsers,     setFirmUsers]     = useState([]);
  const [assignedUsers, setAssignedUsers] = useState([]);
  const [teamLoading,   setTeamLoading]   = useState(false);
 
  function load() {
    engagementAPI.list(clientId)
      .then(data => setEngagements(Array.isArray(data) ? data : []))
      .catch(() => toast.error('Failed to load engagements'));
  }
 
  useEffect(() => { load(); }, [clientId]);
 
  async function openTeamPanel(eng, e) {
    e.stopPropagation();
    setTeamPanel(eng.id);
    setTeamLoading(true);
    try {
      const [all, assigned] = await Promise.all([
        authAPI.listUsers(),
        engagementAPI.listEngagementUsers(eng.id),
      ]);
      setFirmUsers(all);
      setAssignedUsers(assigned.map(u => u.id));
    } catch { toast.error('Failed to load team'); }
    finally { setTeamLoading(false); }
  }
 
  async function toggleAssignment(engId, userId, isAssigned) {
    try {
      if (isAssigned) {
        await engagementAPI.removeEngagementUser(engId, userId);
        setAssignedUsers(prev => prev.filter(id => id !== userId));
      } else {
        await engagementAPI.assignUser(engId, userId, 'STAFF');
        setAssignedUsers(prev => [...prev, userId]);
      }
    } catch (err) {
      toast.error(err?.error || err?.response?.data?.error || 'Failed');
    }
  }
 
  async function advanceStatus(engagement, e) {
    e.stopPropagation();
    const cfg = STATUS_CONFIG[engagement.status || 'DRAFT'];
    if (!cfg?.next) return;
    try {
      await engagementAPI.setStatus(engagement.id, cfg.next);
      toast.success(`Status updated to ${STATUS_CONFIG[cfg.next]?.label}`);
      load();
    } catch (err) {
      toast.error(err?.error || err?.response?.data?.error || 'Status update failed');
    }
  }
 
  async function handleDelete(eng) {
    if (!window.confirm(`Delete "${eng.name}"? This can be recovered by an admin.`)) return;
    try {
      await engagementAPI.delete(eng.id);
      toast.success('Engagement deleted');
      setEngagements(prev => prev.filter(e => e.id !== eng.id));
    } catch (err) {
      toast.error(err?.error || err?.response?.data?.error || 'Delete failed');
    }
  }
 
  function handleEditSaved(updated) {
    setEngagements(prev => prev.map(e => e.id === updated.id ? updated : e));
    setEditModal(null);
  }
 
  async function create() {
    if (!form.name?.trim()) { toast.error('Engagement name is required'); return; }
    try {
      const data = await engagementAPI.create(clientId, { ...form, name: form.name.trim() });
      setEngagements(e => [...e, data]);
      setShowNew(false);
      setForm({ name: '', method: regionCfg.methods[0], financialYear: regionCfg.fyOptions[0], currency: regionCfg.currency });
      toast.success('Engagement created');
    } catch (err) {
      if (err?.status === 409 || err?.response?.status === 409) {
        const existingId = err?.existingId || err?.response?.data?.existingId;
        toast.error(err?.error || err?.response?.data?.error || 'Engagement already exists', { duration: 6000 });
        if (existingId) navigate(`/engagements/${existingId}/tb`);
      } else {
        toast.error('Failed to create engagement');
      }
    }
  }
 
  function openEngagement(e) {
    setCurrentEngagement(e);
    navigate(`/engagements/${e.id}/tb`);
  }
 
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/20 p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">{regionCfg.flag}</span>
            <span className="text-sm font-medium text-slate-500">{currentClient?.name}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${clientRegion === 'UAE' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
              {clientRegion} · {regionCfg.currency}
            </span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Engagements</h1>
          <p className="text-slate-500 text-sm mt-1">Available methods: {regionCfg.methods.join(', ')}</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-semibold text-sm rounded-2xl hover:bg-indigo-700 shadow-lg shadow-indigo-500/25 transition-all hover:-translate-y-0.5">
          <span className="text-lg">+</span> New Engagement
        </button>
      </div>
 
      {/* New Engagement Form */}
      {showNew && (
        <div className="mb-8 bg-white border border-slate-200 rounded-3xl p-6 shadow-xl">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-bold text-slate-900 text-lg">New Engagement</h3>
            <button onClick={() => setShowNew(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
          </div>
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl mb-5 ${clientRegion === 'UAE' ? 'bg-emerald-50 border border-emerald-200' : 'bg-blue-50 border border-blue-200'}`}>
            <span className="text-2xl">{regionCfg.flag}</span>
            <div>
              <p className="text-sm font-semibold text-slate-700">{clientRegion} Engagement</p>
              <p className="text-xs text-slate-500">Currency: {regionCfg.currency} · Methods: {regionCfg.methods.join(', ')}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Engagement Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={clientRegion === 'UAE' ? 'Statutory Audit 2024' : 'Statutory Audit FY 2024-25'}
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Accounting Method</label>
              <div className="grid grid-cols-1 gap-2">
                {regionCfg.methods.map(m => (
                  <button key={m} type="button" onClick={() => setForm(f => ({ ...f, method: m }))}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${form.method === m ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${form.method === m ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300'}`} />
                    <div>
                      <div className="font-bold text-slate-800 text-sm">{m}</div>
                      <div className="text-xs text-slate-500">{regionCfg.methodLabels[m]}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Financial Year</label>
              <select value={form.financialYear} onChange={e => setForm(f => ({ ...f, financialYear: e.target.value }))}
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 mb-3">
                {regionCfg.fyOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-xs text-slate-500 mb-1">Currency (auto from region)</p>
                <div className="flex items-center gap-2">
                  <span className="text-xl">{regionCfg.flag}</span>
                  <span className="font-bold text-slate-800">{regionCfg.currency}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={create}
              className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 shadow-md">
              Create Engagement
            </button>
            <button onClick={() => setShowNew(false)}
              className="px-5 py-2.5 border border-slate-300 text-slate-600 text-sm rounded-xl hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </div>
      )}
 
      {/* Engagement list */}
      <div className="space-y-3">
        {engagements.map(e => (
          <div
            key={e.id}
            onClick={() => openEngagement(e)}
            className="w-full bg-white border border-slate-200 rounded-2xl p-5 text-left hover:border-indigo-300 hover:shadow-md transition-all flex items-center justify-between group cursor-pointer"
          >
            <div className="flex items-center gap-4 min-w-0">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${METHOD_COLOR[e.method]?.replace('text-', 'text-') || 'bg-indigo-100'}`}>
                <BookOpen size={18} />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-slate-800 group-hover:text-indigo-700 transition-colors truncate">{e.name}</div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${METHOD_COLOR[e.method] || 'bg-slate-100 text-slate-700'}`}>{e.method}</span>
                  <span className="text-slate-400 text-xs flex items-center gap-1"><Calendar size={11} /> FY {e.financialYear}</span>
                  <span className="text-slate-400 text-xs">{regionCfg.flag} {regionCfg.currency}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-2" onClick={ev => ev.stopPropagation()}>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_CONFIG[e.status || 'DRAFT']?.color || 'bg-slate-100 text-slate-600'}`}>
                {STATUS_CONFIG[e.status || 'DRAFT']?.label || 'Draft'}
              </span>
              {STATUS_CONFIG[e.status || 'DRAFT']?.next && !e.isLocked && (
                <button onClick={ev => advanceStatus(e, ev)}
                  className="text-xs px-2 py-1 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-colors font-medium">
                  {STATUS_CONFIG[e.status || 'DRAFT']?.nextLabel}
                </button>
              )}
              {['FIRM_ADMIN', 'MANAGER'].includes(user?.role) && (
                <button onClick={ev => openTeamPanel(e, ev)}
                  className="text-xs px-2 py-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                  title="Manage team access">
                  👥
                </button>
              )}
              <ArrowRight size={16} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
              <CardMenu
                onEdit={() => setEditModal(e)}
                onDelete={() => handleDelete(e)}
              />
            </div>
          </div>
        ))}
        {engagements.length === 0 && (
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
            <div className="text-5xl mb-3">{regionCfg.flag}</div>
            <p className="font-semibold text-slate-600">No engagements yet</p>
            <p className="text-slate-400 text-sm mt-1">Create an engagement to start generating financial statements</p>
            <button onClick={() => setShowNew(true)}
              className="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-700">
              + Create First Engagement
            </button>
          </div>
        )}
      </div>
 
      {/* Edit modal */}
      {editModal && (
        <EditEngagementModal
          engagement={editModal}
          regionCfg={regionCfg}
          onClose={() => setEditModal(null)}
          onSaved={handleEditSaved}
        />
      )}
 
      {/* Team panel */}
      {teamPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-slate-800">Manage Team Access</h3>
              <button onClick={() => setTeamPanel(null)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            {teamLoading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-slate-400 text-sm">
                <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                Loading...
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {firmUsers.filter(u => u.id !== user?.id && u.isActive).map(u => {
                  const isAssigned = assignedUsers.includes(u.id);
                  return (
                    <div key={u.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        {u.name?.charAt(0)?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">{u.name}</div>
                        <div className="text-xs text-slate-400 truncate">{u.role?.replace(/_/g, ' ')}</div>
                      </div>
                      <button onClick={() => toggleAssignment(teamPanel, u.id, isAssigned)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${isAssigned ? 'bg-emerald-100 text-emerald-700 hover:bg-red-50 hover:text-red-600' : 'bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'}`}>
                        {isAssigned ? '✓ Assigned' : '+ Assign'}
                      </button>
                    </div>
                  );
                })}
                {firmUsers.filter(u => u.id !== user?.id && u.isActive).length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-4">No other team members. Invite from Settings → Team.</p>
                )}
              </div>
            )}
            <p className="text-xs text-slate-400 mt-4">FIRM_ADMIN and MANAGER always have full access.</p>
            <button onClick={() => setTeamPanel(null)}
              className="w-full mt-4 py-2 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-700 font-medium">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
 