import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useStore } from '../../store';
import {
  LayoutDashboard, Users, Upload, Link2,
  FileSpreadsheet, FileText, Edit3, Download, LogOut,
  ShieldCheck, BookOpen, Grid3X3, FileCheck
} from 'lucide-react';

function SidebarAvatar({ user }) {
  if (user?.avatar) {
    return <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-xl object-cover ring-2 ring-white/20 flex-shrink-0" />;
  }
  return (
    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
      {user?.name?.charAt(0)?.toUpperCase() || 'U'}
    </div>
  );
}

export default function Layout() {
  const { user, firm, clearAuth, currentEngagement, currentClient } = useStore();
  const navigate = useNavigate();
  const eid = currentEngagement?.id;
  // Use client region if available, else firm region
  const region   = currentClient?.region || currentClient?.country === 'UAE' ? 'UAE' : (firm?.region || 'India');
  const currency = region === 'UAE' ? 'AED' : 'INR';
  const flag     = region === 'UAE' ? '🇦🇪' : '🇮🇳';

  const navItems = [
    { to: '/',        icon: LayoutDashboard, label: 'Dashboard', exact: true },
    { to: '/clients', icon: Users,           label: 'Clients' },
    ...(eid ? [
      { divider: `${flag} ${currentClient?.name || 'Engagement'}` },
      { to: `/engagements/${eid}/tb`,         icon: Upload,         label: 'Trial Balance' },
      { to: `/engagements/${eid}/mapping`,    icon: Link2,          label: 'Mapping' },
      { to: `/engagements/${eid}/fs`,         icon: FileSpreadsheet,label: 'Financial Statements' },
      { to: `/engagements/${eid}/notes`,      icon: BookOpen,       label: 'Notes' },
      { to: `/engagements/${eid}/schedules`,  icon: Grid3X3,        label: 'Schedules' },
      { to: `/engagements/${eid}/validation`, icon: ShieldCheck,    label: 'Validation' },
      { divider: 'Report' },
      { to: `/engagements/${eid}/report`,     icon: Edit3,          label: 'Report Builder' },
      { to: `/engagements/${eid}/export`,     icon: Download,       label: 'Export' },
    ] : []),
  ];

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 flex flex-col" style={{background:'linear-gradient(180deg,#0f172a 0%,#1e1b4b 100%)'}}>
        {/* Brand */}
        <div className="px-5 py-5 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-lg">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M3 3h18v4H3V3zm0 7h12v4H3v-4zm0 7h18v4H3v-4z" fill="white" fillOpacity="0.95"/>
              </svg>
            </div>
            <div>
              <div className="text-sm font-bold text-white tracking-tight">FinStatement</div>
              <div className="text-slate-400 text-xs truncate max-w-28">{firm?.name}</div>
            </div>
          </div>
        </div>

        {/* Active engagement */}
        {currentEngagement && (
          <div className="mx-3 mt-3 px-3 py-2.5 rounded-xl" style={{background:'rgba(99,102,241,0.15)',border:'1px solid rgba(99,102,241,0.25)'}}>
            <div className="text-xs text-indigo-300 font-medium mb-0.5">Active Engagement</div>
            <div className="text-sm text-white font-semibold truncate">{currentEngagement.name}</div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="px-2 py-0.5 rounded-md text-xs font-bold" style={{background:'rgba(99,102,241,0.4)',color:'#c7d2fe'}}>
                {currentEngagement.method}
              </span>
              <span className="text-xs text-slate-400">FY {currentEngagement.financialYear}</span>
              <span className="text-xs text-slate-500">· {currency}</span>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 py-3 overflow-y-auto px-2 space-y-0.5">
          {navItems.map((item, i) => {
            if (item.divider) {
              return (
                <div key={`div-${i}`} className="px-3 pt-4 pb-1.5">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{item.divider}</div>
                </div>
              );
            }
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} end={item.exact}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all ${
                    isActive
                      ? 'bg-indigo-600 text-white font-medium shadow-lg shadow-indigo-900/30'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.07]'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={15} className={isActive ? 'text-indigo-200' : 'text-slate-500'} />
                    <span>{item.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="px-3 py-3 border-t border-white/[0.07]">
          <div className="flex items-center gap-2.5 px-1">
            <SidebarAvatar user={user} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-white truncate">{user?.name}</div>
              <div className="text-xs text-slate-500 truncate">{user?.role?.replace('_',' ')}</div>
            </div>
            <button
              onClick={() => clearAuth().then(() => navigate('/login'))}
              className="p-1.5 text-slate-500 hover:text-white hover:bg-white/10 rounded-lg transition-all"
              title="Sign out"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto bg-slate-50">
        <Outlet />
      </main>
    </div>
  );
}
