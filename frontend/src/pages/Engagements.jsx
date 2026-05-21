import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store';
import { engagementAPI } from '../api/client';
import { ArrowRight, Building2, Calendar, BookOpen } from 'lucide-react';
import toast from 'react-hot-toast';

// Region config — single source of truth
const REGION_CONFIG = {
  India: {
    flag: '🇮🇳', currency: 'INR', currSymbol: '₹',
    methods: ['AS', 'IND_AS'],
    methodLabels: { AS: 'AS — Companies Act 2013', IND_AS: 'Ind AS — IFRS Converged' },
    idLabel: 'CIN', taxLabel: 'PAN', gstLabel: 'GSTIN',
    fyFormat: '2024-25',
    fyOptions: ['2024-25','2023-24','2022-23','2021-22','2020-21'],
  },
  UAE: {
    flag: '🇦🇪', currency: 'AED', currSymbol: 'AED',
    methods: ['IFRS', 'IFRS_SME'],
    methodLabels: { IFRS: 'IFRS — Full Standards', IFRS_SME: 'IFRS SME — Simplified' },
    idLabel: 'Trade License No.', taxLabel: 'VAT Reg. No.', gstLabel: null,
    fyFormat: '2024',
    fyOptions: ['2024','2023','2022','2021','2020'],
  },
};

function getClientRegion(client) {
  if (!client) return 'India';
  if (client.region === 'UAE' || client.country === 'UAE') return 'UAE';
  return 'India';
}

export default function Engagements() {
  const { clientId } = useParams();
  const { setCurrentEngagement, currentClient, firm } = useStore();
  const navigate = useNavigate();

  const [engagements, setEngagements] = useState([]);
  const [showNew, setShowNew]         = useState(false);

  // Derive region from client
  const clientRegion = getClientRegion(currentClient);
  const regionCfg    = REGION_CONFIG[clientRegion];

  const [form, setForm] = useState({
    name:          '',
    method:        regionCfg.methods[0],
    financialYear: regionCfg.fyOptions[0],
    currency:      regionCfg.currency,
  });

  // Reset form when client changes
  useEffect(() => {
    const cfg = REGION_CONFIG[clientRegion];
    setForm({
      name:          '',
      method:        cfg.methods[0],
      financialYear: cfg.fyOptions[0],
      currency:      cfg.currency,
    });
  }, [clientRegion]);

  useEffect(() => {
    engagementAPI.list(clientId)
      .then(data => setEngagements(data))
      .catch(() => toast.error('Failed to load engagements'));
  }, [clientId]);

  async function create() {
    if (!form.name) { toast.error('Engagement name is required'); return; }
    try {
      const data = await engagementAPI.create(clientId, { ...form });
      setEngagements(e => [...e, data]);
      setShowNew(false);
      setForm({ name:'', method:regionCfg.methods[0], financialYear:regionCfg.fyOptions[0], currency:regionCfg.currency });
      toast.success('Engagement created');
    } catch { toast.error('Failed to create engagement'); }
  }

  function open(e) {
    setCurrentEngagement(e);
    navigate(`/engagements/${e.id}/tb`);
  }

  const methodBadgeColor = {
    AS: 'bg-blue-100 text-blue-700',
    IND_AS: 'bg-purple-100 text-purple-700',
    IFRS: 'bg-emerald-100 text-emerald-700',
    IFRS_SME: 'bg-amber-100 text-amber-700',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/20 p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">{regionCfg.flag}</span>
            <span className="text-sm font-medium text-slate-500">{currentClient?.name}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${clientRegion==='UAE'?'bg-emerald-100 text-emerald-700':'bg-blue-100 text-blue-700'}`}>
              {clientRegion} · {regionCfg.currency}
            </span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Engagements</h1>
          <p className="text-slate-500 text-sm mt-1">
            Available methods: {regionCfg.methods.join(', ')}
          </p>
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

          {/* Region info banner */}
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl mb-5 ${clientRegion==='UAE'?'bg-emerald-50 border border-emerald-200':'bg-blue-50 border border-blue-200'}`}>
            <span className="text-2xl">{regionCfg.flag}</span>
            <div>
              <p className="text-sm font-semibold text-slate-700">{clientRegion} Engagement</p>
              <p className="text-xs text-slate-500">Currency: {regionCfg.currency} · Available methods: {regionCfg.methods.join(', ')}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Name */}
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Engagement Name *</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={clientRegion === 'UAE' ? 'Statutory Audit 2024' : 'Statutory Audit FY 2024-25'}
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>

            {/* Method — only show methods for client's region */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Accounting Method</label>
              <div className="grid grid-cols-1 gap-2">
                {regionCfg.methods.map(m => (
                  <button key={m} type="button" onClick={() => setForm(f => ({ ...f, method: m }))}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${form.method===m?'border-indigo-500 bg-indigo-50':'border-slate-200 bg-white hover:border-slate-300'}`}>
                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${form.method===m?'border-indigo-500 bg-indigo-500':'border-slate-300'}`}>
                      {form.method===m && <div className="w-full h-full rounded-full bg-white scale-50 transform"/>}
                    </div>
                    <div>
                      <div className="font-bold text-slate-800 text-sm">{m}</div>
                      <div className="text-xs text-slate-500">{regionCfg.methodLabels[m]}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Financial Year */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Financial Year</label>
              <select value={form.financialYear}
                onChange={e => setForm(f => ({ ...f, financialYear: e.target.value }))}
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 mb-3">
                {regionCfg.fyOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>

              {/* Currency display */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-xs text-slate-500 mb-1">Currency (auto from region)</p>
                <div className="flex items-center gap-2">
                  <span className="text-xl">{regionCfg.flag}</span>
                  <span className="font-bold text-slate-800">{regionCfg.currency}</span>
                  <span className="text-slate-500 text-sm">{regionCfg.currSymbol}</span>
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
          <button key={e.id} onClick={() => open(e)}
            className="w-full bg-white border border-slate-200 rounded-2xl p-5 text-left hover:border-indigo-300 hover:shadow-md transition-all flex items-center justify-between group">
            <div className="flex items-center gap-4">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-sm ${methodBadgeColor[e.method]?.replace('text-','').replace('bg-','bg-') || 'bg-indigo-100'}`}>
                <BookOpen size={18} className={methodBadgeColor[e.method]?.split(' ')[1] || 'text-indigo-600'} />
              </div>
              <div>
                <div className="font-semibold text-slate-800 group-hover:text-indigo-700 transition-colors">{e.name}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${methodBadgeColor[e.method] || 'bg-slate-100 text-slate-700'}`}>{e.method}</span>
                  <span className="text-slate-400 text-xs flex items-center gap-1"><Calendar size={11}/> FY {e.financialYear}</span>
                  <span className="text-slate-400 text-xs">{regionCfg.flag} {regionCfg.currency}</span>
                </div>
              </div>
            </div>
            <ArrowRight size={16} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
          </button>
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
    </div>
  );
}
