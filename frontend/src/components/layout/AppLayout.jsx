import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate, useParams } from 'react-router-dom';
import { useAppStore } from '../../store';
import { authAPI } from '../../api';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: '⊞' },
  { to: '/clients', label: 'Clients', icon: '🏢' },
  { to: '/master-grouping', label: 'Master Grouping', icon: '📋' },
  { to: '/audit-log', label: 'Audit Log', icon: '📜' },
];

export default function AppLayout() {
  const { user, tenant, clearAuth, currentEngagement, currentClient } = useAppStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const logout = async () => {
    await authAPI.logout().catch(() => {});
    clearAuth();
    navigate('/login');
  };

  const engId = currentEngagement?.id;
  const engNav = engId ? [
    { to: `/engagements/${engId}`, label: 'Overview', icon: '📊' },
    { to: `/engagements/${engId}/tb`, label: 'TB Upload', icon: '⬆' },
    { to: `/engagements/${engId}/mapping`, label: 'Mapping', icon: '🔗' },
    { to: `/engagements/${engId}/statements`, label: 'Statements', icon: '📈' },
    { to: `/engagements/${engId}/notes`, label: 'Notes', icon: '📝' },
    { to: `/engagements/${engId}/report`, label: 'Report', icon: '📄' },
    { to: `/engagements/${engId}/export`, label: 'Export', icon: '⬇' },
  ] : [];

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-60' : 'w-16'} bg-gray-900 text-white flex flex-col transition-all duration-200 flex-shrink-0`}>
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          {sidebarOpen && <span className="font-bold text-blue-400 text-sm">FinStatement SaaS</span>}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-400 hover:text-white">
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>

        {sidebarOpen && tenant && (
          <div className="px-4 py-2 text-xs text-gray-400 border-b border-gray-700">
            <div className="font-semibold text-gray-300">{tenant.name}</div>
            <div>{tenant.plan?.toUpperCase()}</div>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto py-3">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2 text-sm transition-colors ${isActive ? 'bg-blue-700 text-white' : 'text-gray-300 hover:bg-gray-700'}`
              }>
              <span>{item.icon}</span>
              {sidebarOpen && <span>{item.label}</span>}
            </NavLink>
          ))}

          {engNav.length > 0 && (
            <>
              {sidebarOpen && <div className="px-4 py-2 text-xs text-gray-500 uppercase mt-3">Engagement</div>}
              {engNav.map((item) => (
                <NavLink key={item.to} to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2 text-sm transition-colors ${isActive ? 'bg-blue-700 text-white' : 'text-gray-300 hover:bg-gray-700'}`
                  }>
                  <span>{item.icon}</span>
                  {sidebarOpen && <span>{item.label}</span>}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div className="p-4 border-t border-gray-700">
          {sidebarOpen && <div className="text-xs text-gray-400 mb-2">{user?.email}</div>}
          <button onClick={logout} className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300">
            <span>⏻</span>
            {sidebarOpen && 'Logout'}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-screen-2xl mx-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
