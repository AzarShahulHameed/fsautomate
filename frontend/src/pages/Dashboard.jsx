// src/pages/Dashboard.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { clientAPI } from '../api/client';
import api from '../api/client';

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

const STATUS_COLOR = {
  DRAFT:        'bg-slate-100 text-slate-600',
  IN_PROGRESS:  'bg-blue-100 text-blue-700',
  UNDER_REVIEW: 'bg-amber-100 text-amber-700',
  LOCKED:       'bg-emerald-100 text-emerald-700',
  FILED:        'bg-purple-100 text-purple-700',
};

function timeAgo(date) {
  const diff = (Date.now() - new Date(date).getTime()) / 1000;
  if (diff < 60)   return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function Avatar({ user, size = 9 }) {
  if (user?.avatar) {
    return <img src={user.avatar} alt={user.name} className={`w-${size} h-${size} rounded-full object-cover ring-2 ring-white/30 shadow-md`} />;
  }
  return (
    <div className={`w-${size} h-${size} rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-white font-bold text-sm ring-2 ring-white/30 flex-shrink-0`}>
      {user?.name?.charAt(0)?.toUpperCase() || 'U'}
    </div>
  );
}

export default function Dashboard() {
  const { user, firm, currentEngagement, currentClient } = useStore();
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  const region     = currentClient?.region || firm?.region || null;
  const currency   = firm?.currency || (region === 'UAE' ? 'AED' : null);
  const currSymbol = currency === 'AED' ? 'AED' : currency === 'INR' ? '₹' : null;
  const flag       = region === 'UAE' ? '🇦🇪' : region === 'India' ? '🇮🇳' : null;
  const method     = currentEngagement?.method || null;

  useEffect(() => {
    Promise.all([
      fetch('/api/dashboard/summary', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || sessionStorage.getItem('token') || ''}` },
      }).then(r => r.ok ? r.json() : null).catch(() => null),
      clientAPI.list().catch(() => []),
    ]).then(([sum, cls]) => {
      setSummary(sum);
      setClients(Array.isArray(cls) ? cls : []);
      setLoading(false);
    });
  }, []);

  // Quick action cards
  const QUICK = [
    { icon: '🏢', label: 'New Client',      sub: 'Register a client',      action: () => navigate('/clients'),  color: 'from-indigo-500 to-indigo-700' },
    { icon: '📤', label: 'Upload TB',        sub: 'Upload trial balance',   action: () => currentEngagement ? navigate(`/engagements/${currentEngagement.id}/tb`)         : navigate('/clients'), color: 'from-purple-500 to-purple-700' },
    { icon: '📊', label: 'View Statements',  sub: 'Financial statements',   action: () => currentEngagement ? navigate(`/engagements/${currentEngagement.id}/fs`)         : navigate('/clients'), color: 'from-blue-500 to-blue-700' },
    { icon: '✅', label: 'Run Validation',   sub: 'Check casting & errors', action: () => currentEngagement ? navigate(`/engagements/${currentEngagement.id}/validation`) : navigate('/clients'), color: 'from-emerald-500 to-emerald-700' },
    { icon: '⬇️', label: 'Export Report',    sub: 'Word / Excel / PDF',     action: () => currentEngagement ? navigate(`/engagements/${currentEngagement.id}/export`)     : navigate('/clients'), color: 'from-amber-500 to-amber-700' },
    { icon: '👥', label: 'Manage Team',      sub: 'Invite & assign users',  action: () => navigate('/settings?tab=team'),                                                  color: 'from-pink-500 to-pink-700' },
  ];

  const engByStatus  = summary?.engagements?.byStatus || {};
  const recentEngs   = summary?.engagements?.recent   || [];
  const activity     = summary?.activity               || [];
  const totalClients = summary?.clients?.total ?? clients.length;
  const totalEngs    = summary?.engagements?.total ?? 0;
  const valFailures  = summary?.validation?.failures ?? 0;
  const underReview  = engByStatus['UNDER_REVIEW'] || 0;

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
              {firm?.name}{region && ` · ${flag} ${region}`}{currSymbol && ` · ${currSymbol}`}
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

      {/* Stat cards */}
      <div className="px-8 -mt-12">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label:'Total Clients',     value: loading ? '…' : String(totalClients), sub:'Active in your firm',             icon:'🏢', accent:'text-indigo-600' },
            { label:'Total Engagements', value: loading ? '…' : String(totalEngs),    sub: `${underReview} under review`,   icon:'📂', accent:'text-purple-600' },
            { label:'Validation Alerts', value: loading ? '…' : String(valFailures),  sub:'Failures in last 30 days',        icon: valFailures > 0 ? '⚠️' : '✅', accent: valFailures > 0 ? 'text-red-600' : 'text-emerald-600' },
            { label:'Active Engagement', value: method || 'None selected',             sub: currentEngagement ? `FY ${currentEngagement.financialYear} · ${currentClient?.name||''}` : 'Select a client', icon:'📋', accent: method ? 'text-emerald-600' : 'text-slate-400' },
          ].map((s, i) => (
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
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {QUICK.map((q, i) => (
                <button key={i} onClick={q.action}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-100 hover:border-indigo-200 hover:shadow-md transition-all group bg-slate-50/50 hover:bg-white">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${q.color} flex items-center justify-center text-lg shadow-sm group-hover:-translate-y-0.5 transition-transform`}>
                    {q.icon}
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-bold text-slate-800 leading-tight">{q.label}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Recent engagements */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Recent Engagements</h2>
              <button onClick={() => navigate('/clients')} className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold">All clients →</button>
            </div>
            {loading ? (
              <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
                <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"/>
                Loading...
              </div>
            ) : recentEngs.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-400 text-sm">No engagements yet — add a client and create an engagement to get started.</p>
                <button onClick={() => navigate('/clients')} className="mt-3 px-4 py-2 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700">+ Add Client</button>
              </div>
            ) : (
              <div className="space-y-2">
                {recentEngs.map(e => (
                  <button key={e.id}
                    onClick={() => navigate(`/engagements/${e.id}/fs`)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-all text-left group">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center font-bold text-indigo-600 text-sm flex-shrink-0">
                      {e.method?.slice(0,2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800 text-sm truncate">{e.clientName}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${METHOD_COLOR[e.method] || 'bg-slate-100 text-slate-600'}`}>{e.method}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[e.status||'DRAFT'] || 'bg-slate-100 text-slate-600'}`}>
                          {(e.status||'DRAFT').replace(/_/g,' ')}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{e.name} · FY {e.financialYear}</p>
                    </div>
                    <span className="text-xs text-slate-400">{timeAgo(e.updatedAt)}</span>
                    <span className="text-slate-200 group-hover:text-indigo-400 transition-colors ml-1">→</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Engagement status breakdown */}
          {!loading && totalEngs > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">Engagement Pipeline</h2>
              <div className="grid grid-cols-5 gap-3">
                {[
                  { key:'DRAFT',        label:'Draft',        color:'bg-slate-400' },
                  { key:'IN_PROGRESS',  label:'In Progress',  color:'bg-blue-500' },
                  { key:'UNDER_REVIEW', label:'Under Review', color:'bg-amber-500' },
                  { key:'LOCKED',       label:'Locked',       color:'bg-emerald-500' },
                  { key:'FILED',        label:'Filed',        color:'bg-purple-500' },
                ].map(s => {
                  const count = engByStatus[s.key] || 0;
                  const pct   = totalEngs > 0 ? Math.round((count / totalEngs) * 100) : 0;
                  return (
                    <div key={s.key} className="text-center">
                      <div className="text-2xl font-bold text-slate-800">{count}</div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5 my-1.5">
                        <div className={`h-1.5 rounded-full ${s.color} transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-xs text-slate-500">{s.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Validation alert */}
          {!loading && valFailures > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-center gap-4">
              <span className="text-2xl">⚠️</span>
              <div className="flex-1">
                <p className="font-semibold text-red-800 text-sm">{valFailures} Validation Failure{valFailures !== 1 ? 's' : ''} in the last 30 days</p>
                <p className="text-xs text-red-600 mt-0.5">Open the relevant engagement → Run Validation to see details</p>
              </div>
              {currentEngagement && (
                <button onClick={() => navigate(`/engagements/${currentEngagement.id}/validation`)}
                  className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 font-medium flex-shrink-0">
                  View →
                </button>
              )}
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
                { label:'Email',    value: user?.email },
                { label:'Region',   value: region ? `${flag} ${region}` : 'Not configured' },
                { label:'Currency', value: currency ? `${currSymbol} ${currency}` : 'Not configured' },
                { label:'Role',     value: user?.role?.replace(/_/g,' ') },
                { label:'Plan',     value: firm?.plan || 'Starter' },
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

          {/* Activity feed */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">Recent Activity</h2>
            {loading ? (
              <div className="text-slate-400 text-xs text-center py-4">Loading activity...</div>
            ) : activity.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">No activity yet</p>
            ) : (
              <div className="space-y-3">
                {activity.map((a, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                      {a.userName?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-700 leading-relaxed">
                        <strong>{a.userName}</strong> {a.action}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">{timeAgo(a.at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
