import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { clientAPI } from '../api/client';

const GREET = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

const METHOD_COLOR = {
  AS:       'bg-blue-100 text-blue-700 border-blue-200',
  IND_AS:   'bg-purple-100 text-purple-700 border-purple-200',
  IFRS:     'bg-emerald-100 text-emerald-700 border-emerald-200',
  IFRS_SME: 'bg-amber-100 text-amber-700 border-amber-200',
};

function Avatar({ user }) {
  if (user?.avatar) return <img src={user.avatar} alt={user.name} className="w-14 h-14 rounded-2xl object-cover ring-2 ring-white/30 shadow-md" />;
  return (
    <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-white font-bold text-base ring-2 ring-white/30">
      {user?.name?.charAt(0)?.toUpperCase() || 'U'}
    </div>
  );
}

export default function Dashboard() {
  const { user, firm, currentEngagement, currentClient } = useStore();
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  // Derive everything from actual store data — no hardcoding
  const region     = currentClient?.region || firm?.region || null;
  const currency   = firm?.currency || (region === 'UAE' ? 'AED' : null);
  const currSymbol = currency === 'AED' ? 'AED' : currency === 'INR' ? '₹' : null;
  const flag       = region === 'UAE' ? '🇦🇪' : region === 'India' ? '🇮🇳' : null;
  const method     = currentEngagement?.method || null;
  const methods    = region === 'UAE' ? ['IFRS','IFRS_SME'] : region === 'India' ? ['AS','IND_AS'] : null;

  useEffect(() => {
    clientAPI.list().then(c => {
      setClients(Array.isArray(c) ? c : []);
    }).catch(() => setClients([])).finally(() => setLoading(false));
  }, []);

  const totalClients  = clients.length;
  const activeClients = clients.filter(c => c.isActive !== false).length;

  // Dynamic stat cards — only show data that actually exists
  const statCards = [
    {
      label: 'Total Clients',
      value: loading ? '…' : String(totalClients),
      sub:   loading ? '' : activeClients === totalClients ? 'All active' : `${activeClients} active · ${totalClients - activeClients} inactive`,
      icon:  '🏢',
      accent: 'text-indigo-600',
      show:  true,
    },
    {
      label: 'Region',
      value: region ? `${flag} ${region}` : 'Not set',
      sub:   currency ? `${currSymbol} ${currency}` : 'Set region in client profile',
      icon:  flag || '🌍',
      accent: region === 'UAE' ? 'text-emerald-600' : region === 'India' ? 'text-blue-600' : 'text-slate-400',
      show:  true,
    },
    {
      label: 'Standards',
      value: methods ? methods.join(' · ') : '—',
      sub:   methods
        ? region === 'UAE' ? 'IFRS applicable' : 'Schedule III applicable'
        : 'Select a client to see standards',
      icon:  '📋',
      accent: methods ? 'text-purple-600' : 'text-slate-400',
      show:  true,
    },
    {
      label: 'Active Engagement',
      value: method || 'None selected',
      sub:   currentEngagement
        ? `${currentEngagement.financialYear} · ${currentClient?.name || ''}`
        : 'Go to Clients → select engagement',
      icon:  '📂',
      accent: method ? (METHOD_COLOR[method]?.split(' ')[1] || 'text-emerald-600') : 'text-slate-400',
      show:  true,
    },
  ];

  const QUICK = [
    { icon: '🏢', label: 'New Client',     sub: 'Register a client',     action: () => navigate('/clients'),   color: 'from-indigo-500 to-indigo-700' },
    { icon: '📤', label: 'Upload TB',       sub: 'Upload trial balance',  action: () => currentEngagement ? navigate(`/engagements/${currentEngagement.id}/tb`) : navigate('/clients'), color: 'from-purple-500 to-purple-700' },
    { icon: '📊', label: 'View Statements', sub: 'Financial statements',  action: () => currentEngagement ? navigate(`/engagements/${currentEngagement.id}/fs`) : navigate('/clients'), color: 'from-blue-500 to-blue-700' },
    { icon: '⬇️', label: 'Export Report',   sub: 'Word / Excel download', action: () => currentEngagement ? navigate(`/engagements/${currentEngagement.id}/export`) : navigate('/clients'), color: 'from-emerald-500 to-emerald-700' },
  ];

  const WORKFLOW = [
    { step:1, label:'Add Client',          desc:'Register with CIN / Trade License',  path:'/clients',                                                               done: totalClients > 0 },
    { step:2, label:'Create Engagement',   desc:'Choose method and financial year',    path:'/clients',                                                               done: !!currentEngagement },
    { step:3, label:'Upload Trial Balance',desc:'Excel or CSV, any column format',     path: currentEngagement ? `/engagements/${currentEngagement.id}/tb` : '/clients',        done: false },
    { step:4, label:'Map to FS Heads',     desc:'Auto-map or classify manually',       path: currentEngagement ? `/engagements/${currentEngagement.id}/mapping` : '/clients',   done: false },
    { step:5, label:'Generate Statements', desc:'BS, P&L, Notes auto-generated',       path: currentEngagement ? `/engagements/${currentEngagement.id}/fs` : '/clients',        done: false },
    { step:6, label:'Run Validation',      desc:'Casting, cross-casting, reconciliation', path: currentEngagement ? `/engagements/${currentEngagement.id}/validation` : '/clients', done: false },
    { step:7, label:'Export Report',       desc:'Word, Excel ready to deliver',         path: currentEngagement ? `/engagements/${currentEngagement.id}/export` : '/clients',   done: false },
  ];

  // Dynamic tips based on what user has actually done
  const tips = [];
  if (totalClients === 0) tips.push('Start by adding your first client — click "New Client" above.');
  if (totalClients > 0 && !currentEngagement) tips.push('Select a client and create an engagement to begin generating financial statements.');
  if (currentEngagement) tips.push(`Active engagement: ${method} · ${currentEngagement.financialYear}. Upload a TB to continue.`);
  if (region === 'UAE') tips.push('For UAE clients: map "Cash in Bank" sub-groupings to "Cash and Cash Equivalents" for IFRS.');
  if (region === 'India') tips.push('For Indian clients: CIN, PAN, and GSTIN are captured per client and appear in report headers.');
  if (method === 'IND_AS' || method === 'IFRS') tips.push('OCI items need separate mapping — use the OCI sheet in the Mapping page.');

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Gradient header */}
      <div className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-purple-700 px-8 pt-8 pb-20">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-indigo-200 text-sm">
              {new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
            </p>
            <h1 className="text-3xl font-bold text-white mt-1">
              {GREET()}, {user?.name?.split(' ')[0]} 👋
            </h1>
            <p className="text-indigo-200 text-sm mt-1">
              {firm?.name}
              {region && ` · ${flag} ${region}`}
              {currSymbol && ` · ${currSymbol}`}
            </p>
          </div>
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/settings')}>
            <div className="text-right hidden sm:block">
              <p className="text-white font-semibold text-sm">{user?.name}</p>
              <p className="text-indigo-200 text-xs">{user?.role?.replace(/_/g,' ')}</p>
            </div>
            <Avatar user={user} />
          </div>
        </div>
      </div>

      {/* Floating stat cards */}
      <div className="px-8 -mt-12">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((s, i) => (
            <div key={i} className="bg-white rounded-2xl p-5 shadow-lg shadow-slate-200/50 border border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{s.label}</p>
                <span className="text-xl">{s.icon}</span>
              </div>
              <p className={`text-xl font-bold truncate ${s.accent}`}>{s.value}</p>
              <p className="text-xs text-slate-400 mt-1 truncate">{s.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="px-8 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left col */}
        <div className="lg:col-span-2 space-y-6">

          {/* Quick actions */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {QUICK.map((q, i) => (
                <button key={i} onClick={q.action}
                  className="flex flex-col items-center gap-2.5 p-4 rounded-xl border border-slate-100 hover:border-indigo-200 hover:shadow-md hover:shadow-indigo-100/50 transition-all group bg-slate-50/50 hover:bg-white">
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${q.color} flex items-center justify-center text-xl shadow-md group-hover:-translate-y-0.5 transition-transform`}>
                    {q.icon}
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-bold text-slate-800">{q.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5 leading-tight">{q.sub}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Workflow */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Workflow</h2>
              {currentEngagement && (
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${METHOD_COLOR[method] || 'bg-slate-100 text-slate-600'}`}>
                    {method}
                  </span>
                  <span className="text-xs text-slate-400">{currentEngagement.financialYear}</span>
                </div>
              )}
            </div>
            <div className="relative">
              <div className="absolute left-5 top-5 bottom-5 w-0.5 bg-slate-100"/>
              <div className="space-y-1">
                {WORKFLOW.map((w, i) => (
                  <button key={i} onClick={() => navigate(w.path)}
                    className="relative w-full flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 transition-all group text-left">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 z-10 transition-all border-2 ${
                      w.done
                        ? 'bg-emerald-500 text-white border-emerald-500 shadow-md shadow-emerald-200'
                        : i === 0 || WORKFLOW[i-1]?.done
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200'
                        : 'bg-white text-slate-400 border-slate-200 group-hover:border-indigo-300 group-hover:text-indigo-500'
                    }`}>
                      {w.done ? '✓' : w.step}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${w.done ? 'text-emerald-700' : 'text-slate-800'}`}>{w.label}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{w.desc}</p>
                    </div>
                    <span className="text-slate-200 group-hover:text-indigo-400 transition-colors">→</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Recent clients — only shown if any exist */}
          {clients.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Recent Clients</h2>
                <button onClick={() => navigate('/clients')} className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold">View all →</button>
              </div>
              <div className="space-y-1.5">
                {clients.slice(0, 5).map((c, i) => (
                  <button key={i} onClick={() => navigate('/clients')}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-all text-left group">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm flex-shrink-0 group-hover:from-indigo-100 group-hover:to-indigo-200 group-hover:text-indigo-700 transition-all">
                      {c.name?.charAt(0)?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{c.name}</p>
                      <p className="text-xs text-slate-400">
                        {c.region === 'UAE' ? '🇦🇪' : c.region === 'India' ? '🇮🇳' : ''}
                        {c.region && ` ${c.region}`}
                        {c.cin && ` · ${c.cin}`}
                        {c.tradeLicense && ` · ${c.tradeLicense}`}
                      </p>
                    </div>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${c.isActive !== false ? 'bg-emerald-400' : 'bg-slate-300'}`}/>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right col */}
        <div className="space-y-5">

          {/* Firm card */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <div className="flex items-center gap-3 mb-5 pb-4 border-b border-slate-100">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-md">
                {firm?.name?.charAt(0) || 'F'}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-slate-900 truncate">{firm?.name}</p>
                <p className="text-xs text-slate-400">{user?.designation || user?.role?.replace(/_/g,' ')}</p>
              </div>
            </div>
            <div className="space-y-2.5">
              {[
                { label: 'Email',    value: user?.email },
                { label: 'Region',  value: region ? `${flag} ${region}` : 'Not configured' },
                { label: 'Currency',value: currency ? `${currSymbol} ${currency}` : 'Not configured' },
                { label: 'Role',    value: user?.role?.replace(/_/g,' ') },
              ].map((r, i) => r.value && (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                  <span className="text-xs text-slate-400">{r.label}</span>
                  <span className="text-xs text-slate-700 font-semibold">{r.value}</span>
                </div>
              ))}
            </div>
            <button onClick={() => navigate('/settings')}
              className="w-full mt-4 py-2 text-xs font-semibold text-indigo-600 border border-indigo-200 rounded-xl hover:bg-indigo-50 transition-colors">
              ⚙️ Account Settings
            </button>
          </div>

          {/* Standards — only shown if region is known */}
          {methods && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">
                {flag} {region} Standards
              </h3>
              <div className="space-y-2">
                {(region === 'UAE'
                  ? [
                      { method:'IFRS',     name:'IFRS Full',    desc:'IAS 1 — Statement of Financial Position', color:'bg-emerald-50 border-emerald-200' },
                      { method:'IFRS_SME', name:'IFRS for SMEs',desc:'Section 3 — Simplified standards',        color:'bg-amber-50 border-amber-200' },
                    ]
                  : [
                      { method:'AS',     name:'Indian AS',  desc:'Companies Act 2013 — Schedule III',     color:'bg-blue-50 border-blue-200' },
                      { method:'IND_AS', name:'Ind AS',     desc:'IFRS-converged — Schedule III Div II',  color:'bg-purple-50 border-purple-200' },
                    ]
                ).map((s, i) => (
                  <div key={i} className={`p-3 rounded-xl border ${s.color}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${METHOD_COLOR[s.method]}`}>{s.method}</span>
                    </div>
                    <p className="text-xs text-slate-500">{s.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dynamic tips */}
          {tips.length > 0 && (
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100 p-5">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">💡 What to do next</h3>
              <div className="space-y-2.5">
                {tips.map((tip, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-indigo-400 flex-shrink-0 mt-0.5 text-xs">▸</span>
                    <p className="text-xs text-slate-600 leading-relaxed">{tip}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state if no client selected */}
          {!region && !loading && (
            <div className="bg-slate-100 rounded-2xl border border-dashed border-slate-300 p-5 text-center">
              <p className="text-3xl mb-2">🌍</p>
              <p className="text-sm font-semibold text-slate-600">No region detected</p>
              <p className="text-xs text-slate-400 mt-1">Add a client with India or UAE region to see region-specific standards and settings.</p>
              <button onClick={() => navigate('/clients')} className="mt-3 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg">Add Client</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
