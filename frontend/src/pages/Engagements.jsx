import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store';
import { engagementAPI } from '../api/client';
import { ArrowRight, Calendar, BookOpen } from 'lucide-react';
import toast from 'react-hot-toast';
 
const REGION_CONFIG = {
  India: {
    flag: '', currency: 'INR', currSymbol: '₹',
    methods: ['AS', 'IND_AS'],
    methodLabels: { AS: 'AS — Companies Act 2013', IND_AS: 'Ind AS — IFRS Converged' },
    fyOptions: ['2024-25','2023-24','2022-23','2021-22','2020-21'],
  },
  UAE: {
    flag: '', currency: 'AED', currSymbol: 'AED',
    methods: ['IFRS', 'IFRS_SME'],
    methodLabels: { IFRS: 'IFRS — Full Standards', IFRS_SME: 'IFRS SME — Simplified' },
    fyOptions: ['2024','2023','2022','2021','2020'],
  },
};
 
function getClientRegion(client) {
  if (!client) return 'India';
  if (client.region === 'UAE' || client.country === 'UAE') return 'UAE';
  return 'India';
}
 
const METHOD_COLOR = {
  AS:       'bg-blue-100 text-blue-700',
  IND_AS:   'bg-purple-100 text-purple-700',
  IFRS:     'bg-emerald-100 text-emerald-700',
  IFRS_SME: 'bg-amber-100 text-amber-700',
};
 
const INPUT = "w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400";
 
export default function Engagements() {
  const { clientId }  = useParams();
  const { setCurrentEngagement, currentClient } = useStore();
  const navigate      = useNavigate();
 
  const [engagements, setEngagements] = useState([]);
  const [showForm,    setShowForm]    = useState(false);
  const [editEng,     setEditEng]     = useState(null);
  const [deleteEng,   setDeleteEng]   = useState(null);
  const [deleting,    setDeleting]    = useState(false);
  const [saving,      setSaving]      = useState(false);
 
  const clientRegion = getClientRegion(currentClient);
  const regionCfg    = REGION_CONFIG[clientRegion];
 
  const BLANK = {
    name: '', method: regionCfg.methods[0],
    financialYear: regionCfg.fyOptions[0], currency: regionCfg.currency,
  };
  const [form, setForm] = useState(BLANK);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
 
  useEffect(() => {
    setForm(BLANK);
  }, [clientRegion]);
 
  useEffect(() => {
    engagementAPI.list(clientId)
      .then(data => setEngagements(Array.isArray(data) ? data : []))
      .catch(() => toast.error('Failed to load engagements'));
  }, [clientId]);
 
  function openEdit(e) {
    setEditEng(e);
    setForm({ name: e.name, financialYear: e.financialYear, method: e.method, currency: e.currency || regionCfg.currency });
    setShowForm(true);
  }
 
  function closeForm() {
    setShowForm(false);
    setEditEng(null);
    setForm(BLANK);
  }
 
  async function save() {
    if (!form.name.trim()) { toast.error('Engagement name is required'); return; }
    setSaving(true);
    try {
      if (editEng) {
        await engagementAPI.update(editEng.id, form);
        setEngagements(es => es.map(e => e.id === editEng.id ? { ...e, ...form } : e));
        toast.success('Engagement updated');
      } else {
        const data = await engagementAPI.create({ clientId, ...form });
        setEngagements(es => [...es, data]);
        toast.success('Engagement created');
      }
      closeForm();
    } catch (err) {
      toast.error(err?.error || 'Failed to save engagement');
    } finally { setSaving(false); }
  }
 
  async function handleDelete() {
    if (!deleteEng) return;
    setDeleting(true);
    try {
      await engagementAPI.delete(deleteEng.id);
      setEngagements(es => es.filter(e => e.id !== deleteEng.id));
      setDeleteEng(null);
      toast.success(`"${deleteEng.name}" archived`);
    } catch (err) {
      toast.error(err?.error || 'Archive failed');
    } finally { setDeleting(false); }
  }
 
  function open(e) {
    setCurrentEngagement(e);
    navigate(`/engagements/${e.id}/tb`);
  }
 
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/20 p-8">
 
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-slate-500">{currentClient?.name}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${clientRegion==='UAE'?'bg-emerald-100 text-emerald-700':'bg-blue-100 text-blue-700'}`}>
              {clientRegion} · {regionCfg.currency}
            </span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Engagements</h1>
          <p className="text-slate-500 text-sm mt-1">Available methods: {regionCfg.methods.join(', ')}</p>
        </div>
        <button onClick={() => { closeForm(); setShowForm(true); }}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-semibold text-sm rounded-2xl hover:bg-indigo-700 shadow-lg shadow-indigo-500/25 transition-all hover:-translate-y-0.5">
          <span className="text-lg">+</span> New Engagement
        </button>
      </div>
 
      {/* Form */}
      {showForm && (
        <div className="mb-8 bg-white border border-slate-200 rounded-3xl p-6 shadow-xl">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-bold text-slate-900 text-lg">{editEng ? 'Edit Engagement' : 'New Engagement'}</h3>
            <button onClick={closeForm} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
          </div>
 
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl mb-5 ${clientRegion==='UAE'?'bg-emerald-50 border border-emerald-200':'bg-blue-50 border border-blue-200'}`}>
            <div>
              <p className="text-sm font-semibold text-slate-700">{clientRegion} Engagement</p>
              <p className="text-xs text-slate-500">Currency: {regionCfg.currency} · Methods: {regionCfg.methods.join(', ')}</p>
            </div>
          </div>
 
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Engagement Name *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)}
                placeholder={clientRegion === 'UAE' ? 'Statutory Audit 2024' : 'Statutory Audit FY 2024-25'}
                className={INPUT} />
            </div>
 
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Accounting Method</label>
              <div className="space-y-2">
                {regionCfg.methods.map(m => (
                  <button key={m} type="button" onClick={() => set('method', m)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${form.method===m?'border-indigo-500 bg-indigo-50':'border-slate-200 bg-white hover:border-slate-300'}`}>
                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${form.method===m?'border-indigo-500 bg-indigo-500':'border-slate-300'}`} />
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
              <select value={form.financialYear} onChange={e => set('financialYear', e.target.value)} className={INPUT + ' mb-3'}>
                {regionCfg.fyOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-xs text-slate-500 mb-1">Currency (auto)</p>
                <p className="font-bold text-slate-800">{regionCfg.currency} {regionCfg.currSymbol}</p>
              </div>
            </div>
          </div>
 
          <div className="flex gap-3 mt-5">
            <button onClick={save} disabled={saving}
              className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 shadow-md">
              {saving ? 'Saving...' : editEng ? 'Save Changes' : 'Create Engagement'}
            </button>
            <button onClick={closeForm}
              className="px-5 py-2.5 border border-slate-300 text-slate-600 text-sm rounded-xl hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </div>
      )}
 
      {/* Engagement list */}
      <div className="space-y-3">
        {engagements.map(e => (
          <div key={e.id} className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-indigo-300 hover:shadow-md transition-all group">
            {/* Main row — clickable */}
            <div className="flex items-center justify-between cursor-pointer" onClick={() => open(e)}>
              <div className="flex items-center gap-4">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${METHOD_COLOR[e.method] || 'bg-slate-100'}`}>
                  <BookOpen size={18} />
                </div>
                <div>
                  <div className="font-semibold text-slate-800 group-hover:text-indigo-700 transition-colors">{e.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${METHOD_COLOR[e.method] || 'bg-slate-100 text-slate-700'}`}>{e.method}</span>
                    <span className="text-slate-400 text-xs flex items-center gap-1"><Calendar size={11}/> FY {e.financialYear}</span>
                    <span className="text-slate-400 text-xs">{regionCfg.currency}</span>
                  </div>
                </div>
              </div>
              <ArrowRight size={16} className="text-slate-300 group-hover:text-indigo-400 transition-colors flex-shrink-0" />
            </div>
            {/* Edit / Archive buttons */}
            <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
              <button onClick={() => openEdit(e)}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-all">
                ✏️ Edit
              </button>
              <button onClick={() => setDeleteEng(e)}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-all">
                🗑 Archive
              </button>
            </div>
          </div>
        ))}
 
        {engagements.length === 0 && (
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
            <p className="font-semibold text-slate-600">No engagements yet</p>
            <p className="text-slate-400 text-sm mt-1">Create an engagement to start generating financial statements</p>
            <button onClick={() => setShowForm(true)}
              className="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-700">
              + Create First Engagement
            </button>
          </div>
        )}
      </div>
 
      {/* Archive confirmation modal */}
      {deleteEng && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm mx-4">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center text-3xl mx-auto mb-4">📁</div>
              <h2 className="text-lg font-bold text-slate-900">Archive Engagement?</h2>
              <p className="text-sm text-slate-500 mt-2">
                <strong>"{deleteEng.name}"</strong> will be archived and hidden from the list.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteEng(null)}
                className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50">
                {deleting ? 'Archiving...' : 'Yes, Archive'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}