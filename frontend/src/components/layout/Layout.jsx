import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useStore } from '../../store';
import {
  LayoutDashboard, Users, Upload, Link2,
  FileSpreadsheet, BookOpen, LayoutGrid,
  ShieldCheck, Edit3, LogOut, Settings,
  FileCheck, ChevronRight
} from 'lucide-react';

function SidebarAvatar({ user }) {
  if (user?.avatar) return (
    <img src={user.avatar} alt={user.name}
      className="w-8 h-8 rounded-xl object-cover ring-2 ring-white/20 flex-shrink-0" />
  );
  return (
    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
      {user?.name?.charAt(0)?.toUpperCase() || 'U'}
    </div>
  );
}

export default function Layout() {
  const { user, firm, clearAuth, currentEngagement, currentClient } = useStore();
  const navigate  = useNavigate();
  const [expanded, setExpanded] = useState(false);

  const eid      = currentEngagement?.id;
  const method   = currentEngagement?.method;
  const currency = (method === 'IFRS' || method === 'IFRS_SME') ? 'AED'
    : (method === 'AS' || method === 'IND_AS') ? 'INR'
    : (currentClient?.region === 'UAE') ? 'AED' : 'INR';
  const region = currency === 'AED' ? 'UAE' : (currentClient?.region || firm?.region || 'India');
  const navItems = [
    { to: '/',        icon: LayoutDashboard, label: 'Dashboard', exact: true },
    { to: '/clients', icon: Users,           label: 'Clients' },
    ...(eid ? [
      { divider: currentClient?.name || 'Engagement' },
      { to: `/engagements/${eid}/tb`,         icon: Upload,         label: 'Trial Balance' },
      { to: `/engagements/${eid}/mapping`,    icon: Link2,          label: 'Mapping' },
      { to: `/engagements/${eid}/fs`,         icon: FileSpreadsheet,label: 'Financials' },
      { to: `/engagements/${eid}/notes`,      icon: BookOpen,       label: 'Notes' },
      { to: `/engagements/${eid}/schedules`,  icon: LayoutGrid,     label: 'Schedules' },
      { to: `/engagements/${eid}/validation`, icon: ShieldCheck,    label: 'Validation' },
      { divider: 'Report' },
      { to: `/engagements/${eid}/report`,     icon: Edit3,          label: 'Report Builder' },
    ] : []),
  ];

  const W_COLLAPSED = 64;
  const W_EXPANDED  = 240;

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        style={{
          width: expanded ? W_EXPANDED : W_COLLAPSED,
          background: 'linear-gradient(180deg,#0f172a 0%,#1e1b4b 100%)',
          transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
          overflow: 'hidden',
          flexShrink: 0,
        }}
        className="flex flex-col h-full relative z-30 shadow-2xl"
      >
        {/* Brand */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-white/[0.07]"
          style={{ minWidth: W_EXPANDED }}>
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-lg">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M3 3h18v4H3V3zm0 7h12v4H3v-4zm0 7h18v4H3v-4z" fill="white" fillOpacity="0.95"/>
            </svg>
          </div>
          <div className="overflow-hidden" style={{ opacity: expanded ? 1 : 0, transition: 'opacity 0.15s', whiteSpace: 'nowrap' }}>
            <div className="text-sm font-bold text-white tracking-tight">FinStatement</div>
            <div className="text-slate-400 text-xs truncate max-w-[140px]">{firm?.name}</div>
          </div>
        </div>

        {/* Active engagement badge */}
        {currentEngagement && expanded && (
          <div className="mx-3 mt-3 px-3 py-2.5 rounded-xl flex-shrink-0"
            style={{ background:'rgba(99,102,241,0.15)', border:'1px solid rgba(99,102,241,0.25)', minWidth: W_EXPANDED - 24 }}>
            <div className="text-xs text-indigo-300 font-medium mb-0.5 truncate">Active Engagement</div>
            <div className="text-sm text-white font-semibold truncate">{currentEngagement.name}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="px-2 py-0.5 rounded text-xs font-bold"
                style={{ background:'rgba(99,102,241,0.4)', color:'#c7d2fe' }}>
                {currentEngagement.method}
              </span>
              <span className="text-xs text-slate-400">FY {currentEngagement.financialYear}</span>
            </div>
          </div>
        )}

        {/* Collapsed engagement dot */}
        {currentEngagement && !expanded && (
          <div className="flex justify-center mt-3">
            <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
          </div>
        )}

        {/* Nav items */}
        <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden px-2 space-y-0.5"
          style={{ minWidth: W_EXPANDED }}>
          {navItems.map((item, i) => {
            if (item.divider) {
              return expanded ? (
                <div key={`d-${i}`} className="px-3 pt-4 pb-1.5 whitespace-nowrap">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">{item.divider}</div>
                </div>
              ) : (
                <div key={`d-${i}`} className="border-t border-white/[0.05] my-2 mx-2" />
              );
            }
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} end={item.exact}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-indigo-600 text-white font-medium shadow-lg shadow-indigo-900/30'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.07]'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={16} className={`flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                    <span style={{ opacity: expanded ? 1 : 0, transition: 'opacity 0.1s' }}>
                      {item.label}
                    </span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Settings */}
        <div className="px-2 pb-1" style={{ minWidth: W_EXPANDED }}>
          <NavLink to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all whitespace-nowrap ${
                isActive ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`
            }>
            <Settings size={16} className="flex-shrink-0 text-slate-500" />
            <span style={{ opacity: expanded ? 1 : 0, transition: 'opacity 0.1s' }}>Settings</span>
          </NavLink>
        </div>

        {/* User footer */}
        <div className="px-3 py-3 border-t border-white/[0.07]" style={{ minWidth: W_EXPANDED }}>
          <div className="flex items-center gap-2.5">
            <SidebarAvatar user={user} />
            <div className="flex-1 min-w-0 overflow-hidden"
              style={{ opacity: expanded ? 1 : 0, transition: 'opacity 0.1s' }}>
              <div className="text-xs font-semibold text-white truncate">{user?.name}</div>
              <div className="text-xs text-slate-500 truncate">{user?.role?.replace('_',' ')}</div>
            </div>
            <button
              onClick={() => clearAuth().then(() => navigate('/login'))}
              className="p-1.5 text-slate-500 hover:text-white hover:bg-white/10 rounded-lg transition-all flex-shrink-0"
              style={{ opacity: expanded ? 1 : 0, transition: 'opacity 0.1s' }}
              title="Sign out"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto bg-slate-50">
        <Outlet />
      </main>
    </div>
  );
}
