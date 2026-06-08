import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { clientAPI } from '../api/client';
import toast from 'react-hot-toast';
 
const REGION_FIELDS = {
  India: {
    flag: '🇮🇳', currency: 'INR', currencySymbol: '₹',
    idLabel: 'CIN', idPlaceholder: 'U12345MH2020PTC123456',
    taxLabel: 'PAN', taxPlaceholder: 'AAAAA0000A',
    gstLabel: 'GSTIN', gstPlaceholder: '29AAAAA0000A1Z5',
    extraLabel: null,
  },
  UAE: {
    flag: '🇦🇪', currency: 'AED', currencySymbol: 'AED',
    idLabel: 'Trade License No.', idPlaceholder: 'CN-1234567',
    taxLabel: 'VAT Registration No.', taxPlaceholder: '100123456789003',
    gstLabel: 'Emirates ID (Owner)', gstPlaceholder: '784-XXXX-XXXXXXX-X',
    extraLabel: 'Dubai DED / Free Zone',
  },
};
 
// ── Three-dot menu ─────────────────────────────────────────────────────────────
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
        <div className="absolute right-0 top-9 z-30 bg-white border border-slate-200 rounded-xl shadow-xl w-40 py-1 animate-in">
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
 
// ── Client Card ───────────────────────────────────────────────────────────────
function ClientCard({ client, onClick, onEdit, onDelete }) {
  const regionCfg = REGION_FIELDS[client.region] || REGION_FIELDS.India;
  return (
    <div
      onClick={onClick}
      className="bg-white border border-slate-200 rounded-2xl p-5 cursor-pointer hover:border-indigo-300 hover:shadow-lg transition-all group hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-2xl flex-shrink-0 group-hover:from-indigo-200 group-hover:to-purple-200 transition-all">
            {regionCfg.flag}
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-slate-900 group-hover:text-indigo-700 transition-colors truncate">{client.name}</h3>
            <p className="text-xs text-slate-400 mt-0.5 truncate">
              {client.region === 'UAE' ? client.tradeLicense || 'No Trade License' : client.cin || 'No CIN'}
              {client.email ? ` · ${client.email}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          <div className="flex flex-col items-end gap-1.5 mr-1">
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${client.region === 'UAE' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
              {regionCfg.flag} {client.region}
            </span>
            <span className="text-xs text-slate-400">{regionCfg.currency}</span>
          </div>
          <CardMenu onEdit={onEdit} onDelete={onDelete} />
        </div>
      </div>
      {(client.pan || client.vatNumber) && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex gap-4 text-xs text-slate-500">
          {client.pan && <span>PAN: <span className="font-mono text-slate-700">{client.pan}</span></span>}
          {client.vatNumber && <span>VAT: <span className="font-mono text-slate-700">{client.vatNumber}</span></span>}
          {client.phone && <span>📞 {client.phone}</span>}
        </div>
      )}
    </div>
  );
}
 
// ── Client Form Modal ─────────────────────────────────────────────────────────
function ClientFormModal({ initial, firmRegion, onClose, onSaved }) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState(
    initial
      ? { ...initial }
      : { name: '', region: firmRegion, cin: '', pan: '', gstin: '', tradeLicense: '', vatNumber: '', email: '', phone: '', website: '', address: '' }
  );
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const regionCfg = REGION_FIELDS[form.region] || REGION_FIELDS.India;
 
  async function submit(e) {
    e.preventDefault();
    if (!form.name?.trim()) { toast.error('Company name is required'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(), region: form.region,
        address: form.address, email: form.email, phone: form.phone,
        ...(form.region === 'India' ? { cin: form.cin, pan: form.pan, gstin: form.gstin } : {}),
        ...(form.region === 'UAE'   ? { tradeLicense: form.tradeLicense, vatNumber: form.vatNumber } : {}),
      };
      let saved;
      if (isEdit) {
        saved = await clientAPI.update(initial.id, payload);
        toast.success('Client updated');
      } else {
        saved = await clientAPI.create(payload);
        toast.success('Client created');
      }
      onSaved(saved);
    } catch (err) {
      const msg = err?.response?.data?.error || err?.error || err?.message || (isEdit ? 'Update failed' : 'Create failed');
      if (err?.status === 409 || err?.response?.status === 409) {
        toast.error(msg || 'A client with this name already exists', { duration: 6000 });
      } else {
        toast.error(msg);
      }
    } finally { setSaving(false); }
  }
 
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">{isEdit ? 'Edit Client' : 'New Client'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100">✕</button>
        </div>
        <form onSubmit={submit} className="p-6">
          {/* Region — only for new client */}
          {!isEdit && (
            <div className="mb-5">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Client Region</label>
              <div className="grid grid-cols-2 gap-3 max-w-md">
                {['India', 'UAE'].map(r => (
                  <button key={r} type="button" onClick={() => set('region', r)}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${form.region === r ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                    <span className="text-2xl">{REGION_FIELDS[r].flag}</span>
                    <div className="text-left">
                      <div className="font-semibold text-slate-800 text-sm">{r}</div>
                      <div className="text-xs text-slate-400">{REGION_FIELDS[r].currency}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Company / Entity Name *</label>
              <input required value={form.name} onChange={e => set('name', e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                placeholder={form.region === 'UAE' ? 'ABC Trading LLC' : 'Acme Private Limited'} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">{regionCfg.idLabel}</label>
              <input
                value={form.region === 'UAE' ? (form.tradeLicense || '') : (form.cin || '')}
                onChange={e => set(form.region === 'UAE' ? 'tradeLicense' : 'cin', e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
                placeholder={regionCfg.idPlaceholder} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">{regionCfg.taxLabel}</label>
              <input
                value={form.region === 'UAE' ? (form.vatNumber || '') : (form.pan || '')}
                onChange={e => set(form.region === 'UAE' ? 'vatNumber' : 'pan', e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
                placeholder={regionCfg.taxPlaceholder} />
            </div>
            {form.region === 'India' && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">GSTIN</label>
                <input value={form.gstin || ''} onChange={e => set('gstin', e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
                  placeholder={regionCfg.gstPlaceholder} />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email</label>
              <input type="email" value={form.email || ''} onChange={e => set('email', e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder="accounts@company.com" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Phone</label>
              <input type="tel" value={form.phone || ''} onChange={e => set('phone', e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder={form.region === 'UAE' ? '+971 4 000 0000' : '+91 98765 43210'} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Registered Address</label>
              <textarea value={form.address || ''} onChange={e => set('address', e.target.value)} rows={2}
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                placeholder={form.region === 'UAE' ? 'Office 401, Business Bay, Dubai' : '123 Main Street, Mumbai - 400001'} />
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button type="submit" disabled={saving}
              className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-all shadow-md disabled:opacity-50">
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Client'}
            </button>
            <button type="button" onClick={onClose}
              className="px-6 py-2.5 border border-slate-300 text-slate-600 text-sm rounded-xl hover:bg-slate-50 transition-all">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
 
// ── Main Clients Page ─────────────────────────────────────────────────────────
export default function Clients() {
  const navigate = useNavigate();
  const { setCurrentClient, firm } = useStore();
  const [clients, setClients]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(null); // null | 'new' | clientObj
  const [search, setSearch]     = useState('');
  const [filterRegion, setFilterRegion] = useState('All');
 
  const firmRegion = firm?.region || 'India';
 
  async function load() {
    try {
      const data = await clientAPI.list();
      setClients(Array.isArray(data) ? data : []);
    } catch { toast.error('Failed to load clients'); }
    finally { setLoading(false); }
  }
 
  useEffect(() => { load(); }, []);
 
  async function handleDelete(client) {
    if (!window.confirm(`Delete "${client.name}"? This can be recovered by an admin.`)) return;
    try {
      await clientAPI.delete(client.id);
      toast.success('Client deleted');
      setClients(prev => prev.filter(c => c.id !== client.id));
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.error || 'Delete failed');
    }
  }
 
  function handleSaved(saved) {
    if (!saved) { load(); setModal(null); return; }
    setClients(prev => {
      const idx = prev.findIndex(c => c.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [...prev, saved];
    });
    setModal(null);
  }
 
  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = c.name.toLowerCase().includes(q) || (c.cin || c.tradeLicense || '').toLowerCase().includes(q);
    const matchRegion = filterRegion === 'All' || c.region === filterRegion;
    return matchSearch && matchRegion;
  });
 
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/20 p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Clients</h1>
          <p className="text-slate-500 mt-1">{clients.length} client{clients.length !== 1 ? 's' : ''} · {firmRegion}</p>
        </div>
        <button onClick={() => setModal('new')}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-semibold text-sm rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5">
          <span className="text-lg">+</span> New Client
        </button>
      </div>
 
      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
            placeholder="Search by name, CIN, trade license..." />
        </div>
        <div className="flex gap-2">
          {['All', 'India', 'UAE'].map(r => (
            <button key={r} onClick={() => setFilterRegion(r)}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${filterRegion === r ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
              {r === 'India' ? '🇮🇳 India' : r === 'UAE' ? '🇦🇪 UAE' : r}
            </button>
          ))}
        </div>
      </div>
 
      {/* Client list */}
      {loading ? (
        <div className="text-center py-16 text-slate-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-6xl mb-4">🏢</div>
          <p className="text-slate-600 font-semibold text-lg">{clients.length === 0 ? 'No clients yet' : 'No results found'}</p>
          <p className="text-slate-400 text-sm mt-1">{clients.length === 0 ? 'Create your first client to get started' : 'Try adjusting your search or filter'}</p>
          {clients.length === 0 && (
            <button onClick={() => setModal('new')}
              className="mt-5 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700">
              + Add First Client
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(c => (
            <ClientCard
              key={c.id}
              client={c}
              onClick={() => { setCurrentClient(c); navigate(`/clients/${c.id}/engagements`); }}
              onEdit={() => setModal(c)}
              onDelete={() => handleDelete(c)}
            />
          ))}
        </div>
      )}
 
      {/* Modal */}
      {modal && (
        <ClientFormModal
          initial={modal === 'new' ? null : modal}
          firmRegion={firmRegion}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}