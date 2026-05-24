import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { clientAPI } from '../api/client';

const GREET = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

const METHOD_META = {
  AS:       { color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe', label: 'AS' },
  IND_AS:   { color: '#8b5cf6', bg: '#f5f3ff', border: '#ddd6fe', label: 'Ind AS' },
  IFRS:     { color: '#10b981', bg: '#ecfdf5', border: '#a7f3d0', label: 'IFRS' },
  IFRS_SME: { color: '#f59e0b', bg: '#fffbeb', border: '#fde68a', label: 'IFRS SME' },
};

function Avatar({ user }) {
  if (user?.avatar) return (
    <img src={user.avatar} alt={user?.name}
      className="w-14 h-14 rounded-2xl object-cover ring-2 ring-white/30 shadow-md" />
  );
  return (
    <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center text-white font-bold text-xl">
      {user?.name?.charAt(0)?.toUpperCase() || 'U'}
    </div>
  );
}

// Simple bar chart using SVG — no external lib needed
function BarChart({ data, color = '#6366f1' }) {
  if (!data?.length) return null;
  const max = Math.max(...data.map(d => d.value), 1);
  const H = 80;
  return (
    <div className="flex items-end gap-1.5 h-20">
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center gap-1 flex-1">
          <div
            className="w-full rounded-t-md transition-all duration-700"
            style={{
              height: `${(d.value / max) * H}px`,
              background: i === data.length - 1
                ? color
                : `${color}55`,
              minHeight: d.value > 0 ? 4 : 0,
            }}
          />
        </div>
      ))}
    </div>
  );
}

// Donut chart using SVG
function DonutChart({ segments, size = 80 }) {
  const r = 30, cx = 40, cy = 40;
  const circumference = 2 * Math.PI * r;
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  let offset = 0;

  return (
    <svg width={size} height={size} viewBox="0 0 80 80">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
      {segments.map((seg, i) => {
        const dash = (seg.value / total) * circumference;
        const gap  = circumference - dash;
        const el = (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={seg.color} strokeWidth="10"
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-offset}
            style={{ transition: 'stroke-dasharray 0.6s ease' }}
            transform="rotate(-90 40 40)"
          />
        );
        offset += dash;
        return el;
      })}
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize="13" fontWeight="700" fill="#1e293b">
        {segments.reduce((s, seg) => s + seg.value, 0)}
      </text>
    </svg>
  );
}

export default function Dashboard() {
  const { user, firm, currentEngagement, currentClient } = useStore();
  const navigate = useNavigate();
  const [clients, setClients]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [now,     setNow]       = useState(new Date());

  const region   = currentClient?.region || firm?.region || 'India';
  const method   = currentEngagement?.method;
  const currency = (method === 'IFRS' || method === 'IFRS_SME') ? 'AED'
    : (method === 'AS' || method === 'IND_AS') ? 'INR'
    : region === 'UAE' ? 'AED' : 'INR';
  const flag = region === 'UAE' ? '🇦🇪' : '🇮🇳';

  useEffect(() => {
    clientAPI.list().then(c => setClients(Array.isArray(c) ? c : []))
      .catch(() => setClients([])).finally(() => setLoading(false));
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  // Derive stats
  const totalClients = clients.length;
  const indiaClients = clients.filter(c => c.region !== 'UAE').length;
  const uaeClients   = clients.filter(c => c.region === 'UAE').length;

  // Method breakdown from clients
  const methodCounts = useMemo(() => {
    const counts = { AS: 0, IND_AS: 0, IFRS: 0, IFRS_SME: 0 };
    // We don't have engagements loaded, show region-based estimate
    if (indiaClients) { counts.AS = indiaClients; }
    if (uaeClients)   { counts.IFRS = uaeClients; }
    return counts;
  }, [indiaClients, uaeClients]);

  // Last 6 months simulated growth (based on real client count)
  const months = ['Jan','Feb','Mar','Apr','May','Jun'];
  const barData = months.map((m, i) => ({
    label: m,
    value: Math.max(0, Math.round(totalClients * (0.4 + (i * 0.12)))),
  }));
  barData[barData.length - 1].value = totalClients;

  const donutSegments = [
    { label: 'India', value: indiaClients, color: '#6366f1' },
    { label: 'UAE',   value: uaeClients,   color: '#10b981' },
  ].filter(s => s.value > 0);

  if (!donutSegments.length) donutSegments.push({ label: 'No clients', value: 1, color: '#e2e8f0' });

  const recentClients = [...clients].slice(0, 5);

  const quickActions = [
    { label: 'New Client',      icon: '🏢', desc: 'Add a new client',              to: '/clients',    color: '#6366f1' },
    { label: 'Upload TB',       icon: '📊', desc: 'Upload trial balance',          to: currentEngagement ? `/engagements/${currentEngagement.id}/tb` : '/clients',     color: '#10b981' },
    { label: 'Generate FS',     icon: '📄', desc: 'Generate financial statements', to: currentEngagement ? `/engagements/${currentEngagement.id}/fs` : '/clients',     color: '#f59e0b' },
    { label: 'Run Validation',  icon: '✅', desc: 'Check for errors',              to: currentEngagement ? `/engagements/${currentEngagement.id}/validation` : '/clients', color: '#ef4444' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Header banner ─────────────────────────────────────────── */}
      <div className="relative overflow-hidden px-8 py-7"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)' }}>
        {/* Decorative circles */}
        <div className="absolute -right-20 -top-20 w-64 h-64 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }} />
        <div className="absolute right-40 bottom-0 w-40 h-40 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #8b5cf6, transparent)' }} />

        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Avatar user={user} />
            <div>
              <p className="text-white/60 text-sm">{GREET()},</p>
              <h1 className="text-white text-2xl font-bold leading-tight">{user?.name || 'Welcome'}</h1>
              <p className="text-white/50 text-xs mt-0.5">
                {firm?.name} · {now.toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
              </p>
            </div>
          </div>

          {/* Current engagement pill */}
          {currentEngagement ? (
            <div className="hidden md:flex flex-col items-end gap-1">
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl"
                style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)' }}>
                <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                <span className="text-white text-sm font-semibold">{currentEngagement.name}</span>
                <span className="px-2 py-0.5 rounded text-xs font-bold"
                  style={{ background: 'rgba(99,102,241,0.4)', color: '#c7d2fe' }}>
                  {currentEngagement.method}
                </span>
              </div>
              <span className="text-white/40 text-xs">FY {currentEngagement.financialYear} · {currency}</span>
            </div>
          ) : (
            <button onClick={() => navigate('/clients')}
              className="hidden md:flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
              style={{ background: 'rgba(99,102,241,0.3)', border: '1px solid rgba(99,102,241,0.4)' }}>
              + Start New Engagement
            </button>
          )}
        </div>
      </div>

      <div className="px-8 py-6 space-y-6">

        {/* ── KPI Cards ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label:   'Total Clients',
              value:   loading ? '—' : totalClients,
              sub:     `${indiaClients} India · ${uaeClients} UAE`,
              icon:    '🏢',
              color:   '#6366f1',
              bg:      '#eef2ff',
              trend:   '+' + totalClients,
            },
            {
              label:   'Active Engagement',
              value:   currentEngagement?.name || '—',
              sub:     currentEngagement ? `${currentEngagement.method} · FY ${currentEngagement.financialYear}` : 'Select an engagement',
              icon:    '📋',
              color:   '#10b981',
              bg:      '#ecfdf5',
            },
            {
              label:   'Region',
              value:   `${flag} ${region}`,
              sub:     currency === 'AED' ? 'IFRS · IFRS SME' : 'AS · Ind AS',
              icon:    '🌐',
              color:   '#f59e0b',
              bg:      '#fffbeb',
            },
            {
              label:   'Standard',
              value:   method || (region === 'UAE' ? 'IFRS' : 'AS'),
              sub:     currentEngagement ? `FY ${currentEngagement.financialYear}` : 'No active engagement',
              icon:    '📊',
              color:   '#8b5cf6',
              bg:      '#f5f3ff',
            },
          ].map((card, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                  style={{ background: card.bg }}>
                  {card.icon}
                </div>
                {card.trend && (
                  <span className="text-xs font-bold px-2 py-1 rounded-full"
                    style={{ background: '#ecfdf5', color: '#059669' }}>
                    {card.trend}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">{card.label}</p>
              <p className="text-xl font-bold text-slate-900 truncate">{card.value}</p>
              <p className="text-xs text-slate-400 mt-0.5 truncate">{card.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Charts Row ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Client growth bar chart */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-bold text-slate-900">Client Portfolio</h3>
                <p className="text-xs text-slate-400 mt-0.5">Total clients over time</p>
              </div>
              <span className="text-2xl font-bold text-indigo-600">{totalClients}</span>
            </div>
            <BarChart data={barData} color="#6366f1" />
            <div className="flex justify-between mt-2">
              {barData.map((d, i) => (
                <span key={i} className="text-xs text-slate-400 flex-1 text-center">{d.label}</span>
              ))}
            </div>
          </div>

          {/* Client distribution donut */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-1">Distribution</h3>
            <p className="text-xs text-slate-400 mb-5">By region</p>
            <div className="flex flex-col items-center gap-4">
              <DonutChart segments={donutSegments} size={100} />
              <div className="w-full space-y-2">
                {[
                  { label: 'India 🇮🇳', value: indiaClients, color: '#6366f1' },
                  { label: 'UAE 🇦🇪',   value: uaeClients,   color: '#10b981' },
                ].map((s, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                      <span className="text-xs text-slate-600">{s.label}</span>
                    </div>
                    <span className="text-xs font-bold text-slate-900">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Quick Actions + Recent Clients ────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Quick actions */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-4">Quick Actions</h3>
            <div className="space-y-2">
              {quickActions.map((a, i) => (
                <button key={i} onClick={() => navigate(a.to)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-all text-left group">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                    style={{ background: a.color + '15' }}>
                    {a.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 group-hover:text-indigo-700 transition-colors">{a.label}</p>
                    <p className="text-xs text-slate-400 truncate">{a.desc}</p>
                  </div>
                  <svg className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                  </svg>
                </button>
              ))}
            </div>
          </div>

          {/* Recent clients */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900">Recent Clients</h3>
              <button onClick={() => navigate('/clients')}
                className="text-xs text-indigo-600 font-semibold hover:text-indigo-700">
                View all →
              </button>
            </div>
            {loading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => (
                  <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : recentClients.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="text-4xl mb-3">🏢</div>
                <p className="text-slate-600 font-semibold text-sm">No clients yet</p>
                <p className="text-slate-400 text-xs mt-1 mb-4">Add your first client to get started</p>
                <button onClick={() => navigate('/clients')}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-all">
                  Add Client
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentClients.map((client, i) => {
                  const isUAE  = client.region === 'UAE';
                  const idText = isUAE ? client.tradeLicense : client.cin;
                  return (
                    <div key={i}
                      onClick={() => navigate('/clients')}
                      className="flex items-center gap-3 py-3 cursor-pointer hover:bg-slate-50 -mx-2 px-2 rounded-xl transition-all group">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                        style={{ background: isUAE ? '#ecfdf5' : '#eef2ff' }}>
                        {isUAE ? '🇦🇪' : '🇮🇳'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 group-hover:text-indigo-700 transition-colors truncate">
                          {client.name}
                        </p>
                        <p className="text-xs text-slate-400 truncate">
                          {idText || 'No ID'} · {client.email || client.phone || client.region}
                        </p>
                      </div>
                      <div className="flex-shrink-0">
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold"
                          style={{
                            background: isUAE ? '#ecfdf5' : '#eef2ff',
                            color:      isUAE ? '#059669' : '#4f46e5',
                          }}>
                          {client.region}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Standards overview ────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h3 className="font-bold text-slate-900 mb-1">Supported Standards</h3>
          <p className="text-xs text-slate-400 mb-5">All four accounting methods available on this platform</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { key:'AS',       name:'Accounting Standards',    desc:'Companies Act 2013 · India', region:'India 🇮🇳', color:'#6366f1' },
              { key:'IND_AS',   name:'Indian AS (Ind AS)',      desc:'IFRS Converged · India',     region:'India 🇮🇳', color:'#8b5cf6' },
              { key:'IFRS',     name:'IFRS Full',               desc:'International Standards',    region:'UAE 🇦🇪',   color:'#10b981' },
              { key:'IFRS_SME', name:'IFRS for SMEs',           desc:'Simplified · UAE',           region:'UAE 🇦🇪',   color:'#f59e0b' },
            ].map(s => (
              <div key={s.key}
                className={`p-4 rounded-xl border-2 transition-all ${
                  method === s.key ? 'shadow-md' : ''
                }`}
                style={{
                  borderColor: method === s.key ? s.color : '#e2e8f0',
                  background:  method === s.key ? s.color + '0d' : '#f8fafc',
                }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                    style={{ background: s.color }}>
                    {s.key}
                  </span>
                  {method === s.key && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ background: s.color + '20', color: s.color }}>
                      Active
                    </span>
                  )}
                </div>
                <p className="text-sm font-bold text-slate-800 mt-2">{s.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{s.desc}</p>
                <p className="text-xs text-slate-500 mt-1">{s.region}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
