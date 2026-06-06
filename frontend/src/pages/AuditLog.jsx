// src/pages/AuditLog.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store';
import api from '../api/client';
import toast from 'react-hot-toast';

function timeAgo(date) {
  const diff = (Date.now() - new Date(date).getTime()) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(date).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

const ACTION_COLOR = {
  POST:   'bg-emerald-100 text-emerald-700',
  PUT:    'bg-blue-100 text-blue-700',
  PATCH:  'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  GET:    'bg-slate-100 text-slate-600',
};

export default function AuditLog() {
  const { user } = useStore();
  const [logs,      setLogs]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [page,      setPage]      = useState(1);
  const [total,     setTotal]     = useState(0);
  const [pages,     setPages]     = useState(1);
  const [filter,    setFilter]    = useState({ entityType: '', userId: '' });
  const limit = 50;

  const load = useCallback(async (pg = 1, f = filter) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: pg, limit });
      if (f.entityType) params.set('entityType', f.entityType);
      if (f.userId)     params.set('userId', f.userId);

      const data = await api.get(`/audit?${params}`);
      setLogs(data.logs || []);
      setTotal(data.pagination?.total || 0);
      setPages(data.pagination?.pages || 1);
      setPage(pg);
    } catch { toast.error('Failed to load audit log'); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(1); }, []);

  const ENTITY_TYPES = ['Engagement', 'Client', 'TBVersion', 'Mapping', 'FSLine', 'NoteGroup', 'User'];

  if (!['FIRM_ADMIN', 'MANAGER'].includes(user?.role)) {
    return (
      <div className="p-8 text-center">
        <p className="text-slate-500">Access restricted to Firm Admin and Manager roles.</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Audit Log</h1>
        <p className="text-slate-500 text-sm mt-1">
          Complete record of all actions in your firm · {total.toLocaleString()} total entries
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-5 flex gap-3 flex-wrap items-end">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Entity Type</label>
          <select
            value={filter.entityType}
            onChange={e => setFilter(f => ({ ...f, entityType: e.target.value }))}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value="">All types</option>
            {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <button
          onClick={() => { const f = filter; load(1, f); }}
          className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 font-medium"
        >
          Apply Filter
        </button>
        <button
          onClick={() => { setFilter({ entityType: '', userId: '' }); load(1, { entityType: '', userId: '' }); }}
          className="px-4 py-2 border border-slate-200 text-slate-600 text-sm rounded-lg hover:bg-slate-50"
        >
          Clear
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">When</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">User</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Action</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Entity</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Entity ID</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8 text-slate-400">Loading...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-slate-400">No audit entries found</td></tr>
              ) : logs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{timeAgo(log.createdAt)}</td>
                  <td className="px-4 py-3">
                    {log.user ? (
                      <div>
                        <p className="font-medium text-slate-800 text-xs">{log.user.name}</p>
                        <p className="text-slate-400 text-xs">{log.user.role?.replace(/_/g,' ')}</p>
                      </div>
                    ) : <span className="text-slate-400 text-xs">System</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${ACTION_COLOR[log.action] || 'bg-slate-100 text-slate-600'}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{log.entityType || '—'}</td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-400 max-w-32 truncate">{log.entityId ? log.entityId.slice(0, 8) + '...' : '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{log.ipAddress || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
            <p className="text-xs text-slate-500">
              Page {page} of {pages} · {total.toLocaleString()} entries
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => load(page - 1)}
                disabled={page <= 1}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs disabled:opacity-40 hover:bg-slate-50"
              >
                ← Prev
              </button>
              <button
                onClick={() => load(page + 1)}
                disabled={page >= pages}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs disabled:opacity-40 hover:bg-slate-50"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
