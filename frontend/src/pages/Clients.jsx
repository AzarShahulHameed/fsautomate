import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { clientAPI } from '../api/client';
import toast from 'react-hot-toast';
 
const REGION_FIELDS = {
  India: {
    flag: '', currency: 'INR', currencySymbol: '₹',
    idLabel: 'CIN', idPlaceholder: 'U12345MH2020PTC123456',
    taxLabel: 'PAN', taxPlaceholder: 'AAAAA0000A',
    gstLabel: 'GSTIN', gstPlaceholder: '29AAAAA0000A1Z5',
  },
  UAE: {
    flag: '', currency: 'AED', currencySymbol: 'AED',
    idLabel: 'Trade License No.', idPlaceholder: 'CN-1234567',
    taxLabel: 'VAT Registration No.', taxPlaceholder: '100123456789003',
    gstLabel: 'Emirates ID (Owner)', gstPlaceholder: '784-XXXX-XXXXXXX-X',
  },
};
 
const BLANK = { name:'', region:'India', cin:'', pan:'', gstin:'', tradeLicense:'', vatNumber:'', email:'', phone:'', address:'' };
 
function ClientCard({ client, onSelect, onEdit, onDelete }) {
  const regionCfg = REGION_FIELDS[client.region] || REGION_FIELDS.India;
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-indigo-300 hover:shadow-lg transition-all group">
      <div className="flex items-start justify-between cursor-pointer" onClick={onSelect}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-lg font-bold text-indigo-600 flex-shrink-0">
            {client.name?.charAt(0)?.toUpperCase()}
          </div>
          <div>
            <h3 className="font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">{client.name}</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {client.region === 'UAE' ? client.tradeLicense || 'No Trade License' : client.cin || 'No CIN'}
              {client.email ? ` · ${client.email}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${client.region==='UAE'?'bg-emerald-100 text-emerald-700':'bg-blue-100 text-blue-700'}`}>
            {client.region}
          </span>
          <span className="text-xs text-slate-400">{regionCfg.currency}</span>
        </div>
      </div>
 
      {(client.pan || client.vatNumber || client.phone) && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex gap-4 text-xs text-slate-500">
          {client.pan && <span>PAN: <span className="font-mono text-slate-700">{client.pan}</span></span>}
          {client.vatNumber && <span>VAT: <span className="font-mono text-slate-700">{client.vatNumber}</span></span>}
          {client.phone && <span>📞 {client.phone}</span>}
        </div>
      )}
 
      <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
        <button onClick={e => { e.stopPropagation(); onEdit(client); }}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-all">
          ✏️ Edit
        </button>
        <button onClick={e => { e.stopPropagation(); onDelete(client); }}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-all">
          🗑 Delete
        </button>
      </div>
    </div>
  );
}
 
const INPUT = "w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent";
 
export default function Clients() {
  const navigate  = useNavigate();
  const { setCurrentClient, firm } = useStore();
 
  const [clients,      setClients]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [showForm,     setShowForm]     = useState(false);
  const [editClient,   setEditClient]   = useState(null);
  const [deleteClient, setDeleteClient] = useState(null);
  const [deleting,     setDeleting]     = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [search,       setSearch]       = useState('');
  const [filterRegion, setFilterRegion] = useState('All');
 
  const firmRegion = firm?.region || 'India';
  const [form, setForm] = useState({ ...BLANK, region: firmRegion });
 
  useEffect(() => {
    clientAPI.list()
      .then(data => setClients(Array.isArray(data) ? data : []))
      .catch(() => toast.error('Failed to load clients'))
      .finally(() => setLoading(false));
  }, []);
 
  const set = useCallback((k, v) => setForm(f => ({ ...f, [k]: v })), []);
  const regionCfg = useMemo(() => REGION_FIELDS[form.region] || REGION_FIELDS.India, [form.region]);
 
  function openCreate() {
    setEditClient(null);
    setForm({ ...BLANK, region: firmRegion });
    setShowForm(true);
  }
 
  function openEdit(client) {
    setEditClient(client);
    setForm({
      name: client.name || '', region: client.region || 'India',
      cin: client.cin || '', pan: client.pan || '', gstin: client.gstin || '',
      tradeLicense: client.tradeLicense || '', vatNumber: client.vatNumber || '',
      email: client.email || '', phone: client.phone || '', address: client.address || '',
    });
    setShowForm(true);
  }
 
  function closeForm() {
    setShowForm(false);
    setEditClient(null);
    setForm({ ...BLANK, region: firmRegion });
  }
 
  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Company name is required'); return; }
 
    if (form.region === 'India') {
      if (!form.pan.trim())  { toast.error('PAN is required for Indian clients'); return; }
      if (!form.cin.trim())  { toast.error('CIN is required for Indian clients'); return; }
    }
    if (form.region === 'UAE') {
      if (!form.tradeLicense.trim()) { toast.error('Trade License No. is required for UAE clients'); return; }
      if (!form.vatNumber.trim())    { toast.error('VAT Registration No. is required for UAE clients'); return; }
    }
 
    const payload = {
      name: form.name.trim(), region: form.region,
      address: form.address || '', email: form.email.trim(), phone: form.phone.trim(),
      cin: form.cin?.trim().toUpperCase() || '',
      pan: form.pan?.trim().toUpperCase() || '',
      gstin: form.gstin?.trim().toUpperCase() || '',
      tradeLicense: form.tradeLicense?.trim().toUpperCase() || '',
      vatNumber: form.vatNumber?.trim() || '',
    };
 
    setSaving(true);
    try {
      if (editClient) {
        const updated = await clientAPI.update(editClient.id, payload);
        setClients(cs => cs.map(c => c.id === editClient.id ? (updated?.id ? updated : { ...c, ...payload }) : c));
        toast.success(`"${form.name.trim()}" updated`);
      } else {
        await clientAPI.create(payload);
        toast.success(`Client "${form.name.trim()}" created`);
        clientAPI.list().then(data => setClients(Array.isArray(data) ? data : []));
      }
      closeForm();
    } catch (err) {
      toast.error(err?.error || err?.message || 'Failed to save client');
    } finally { setSaving(false); }
  }
 
  async function handleDelete() {
    if (!deleteClient) return;
    setDeleting(true);
    try {
      await clientAPI.delete(deleteClient.id);
      setClients(cs => cs.filter(c => c.id !== deleteClient.id));
      setDeleteClient(null);
      toast.success(`"${deleteClient.name}" deleted`);
    } catch (err) {
      toast.error(err?.error || 'Cannot delete — client may have active engagements');
    } finally { setDeleting(false); }
  }
 
  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || c.name?.toLowerCase().includes(q) ||
      (c.cin || c.tradeLicense || '').toLowerCase().includes(q);
    const matchRegion = filterRegion === 'All' || c.region === filterRegion;
    return matchSearch && matchRegion;
  });
 
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/20 p-8">
 
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Clients</h1>
          <p className="text-slate-500 mt-1">{clients.length} client{clients.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-semibold text-sm rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/25 hover:-translate-y-0.5">
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
          {['All','India','UAE'].map(r => (
            <button key={r} onClick={() => setFilterRegion(r)}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${filterRegion===r?'bg-indigo-600 text-white border-indigo-600 shadow-md':'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
              {r}
            </button>
          ))}
        </div>
      </div>
 
      {/* Form */}
      {showForm && (
        <div className="mb-8 bg-white border border-slate-200 rounded-3xl p-6 shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-900">{editClient ? 'Edit Client' : 'New Client'}</h2>
            <button onClick={closeForm} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
          </div>
 
          <form onSubmit={handleSubmit}>
            <div className="mb-5">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Client Region</label>
              <div className="grid grid-cols-2 gap-3 max-w-md">
                {['India','UAE'].map(r => (
                  <button key={r} type="button" onClick={() => set('region', r)}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${form.region===r?'border-indigo-500 bg-indigo-50':'border-slate-200 bg-white hover:border-slate-300'}`}>
                    <div className="text-left">
                      <div className="font-semibold text-slate-800 text-sm">{r}</div>
                      <div className="text-xs text-slate-400">{REGION_FIELDS[r].currency}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
 
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Company / Entity Name *</label>
                <input required name="name" autoComplete="off" value={form.name}
                  onChange={e => set('name', e.target.value)} className={INPUT}
                  placeholder={form.region==='UAE'?'ABC Trading LLC':'Acme Private Limited'} />
              </div>
 
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">{regionCfg.idLabel} *</label>
                <input value={form.region==='UAE'?form.tradeLicense:form.cin}
                  onChange={e => set(form.region==='UAE'?'tradeLicense':'cin', e.target.value.toUpperCase())}
                  className={INPUT + ' font-mono'} placeholder={regionCfg.idPlaceholder}
                  maxLength={form.region==='UAE'?20:21} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">{regionCfg.taxLabel} *</label>
                <input value={form.region==='UAE'?form.vatNumber:form.pan}
                  onChange={e => set(form.region==='UAE'?'vatNumber':'pan', e.target.value.toUpperCase())}
                  className={INPUT + ' font-mono'} placeholder={regionCfg.taxPlaceholder}
                  maxLength={form.region==='UAE'?15:10} />
              </div>
              {form.region === 'India' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">GSTIN</label>
                  <input value={form.gstin} onChange={e => set('gstin', e.target.value.toUpperCase())}
                    className={INPUT + ' font-mono'} placeholder={regionCfg.gstPlaceholder} maxLength={15} />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email</label>
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                  className={INPUT} placeholder="accounts@company.com" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Phone</label>
                <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
                  className={INPUT} placeholder={form.region==='UAE'?'+971 4 000 0000':'+91 98765 43210'} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Registered Address</label>
                <textarea value={form.address} onChange={e => set('address', e.target.value)} rows={2}
                  className={INPUT + ' resize-none'}
                  placeholder={form.region==='UAE'?'Office 401, Business Bay, Dubai':'123 Main Street, Mumbai - 400001'} />
              </div>
            </div>
 
            <div className="flex gap-3 mt-6">
              <button type="submit" disabled={saving}
                className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-md">
                {saving ? 'Saving...' : editClient ? 'Save Changes' : 'Create Client'}
              </button>
              <button type="button" onClick={closeForm}
                className="px-6 py-2.5 border border-slate-300 text-slate-600 text-sm rounded-xl hover:bg-slate-50 transition-all">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
 
      {/* Client list */}
      {loading ? (
        <div className="text-center py-16 text-slate-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-6xl mb-4">🏢</div>
          <p className="text-slate-600 font-semibold text-lg">{clients.length === 0 ? 'No clients yet' : 'No results found'}</p>
          <p className="text-slate-400 text-sm mt-1">{clients.length === 0 ? 'Create your first client to get started' : 'Try adjusting your search or filter'}</p>
          {clients.length === 0 && (
            <button onClick={openCreate}
              className="mt-5 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700">
              + Add First Client
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(c => (
            <ClientCard key={c.id} client={c}
              onSelect={() => { setCurrentClient(c); navigate(`/clients/${c.id}/engagements`); }}
              onEdit={openEdit}
              onDelete={setDeleteClient} />
          ))}
        </div>
      )}
 
      {/* Delete confirmation modal */}
      {deleteClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm mx-4">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center text-3xl mx-auto mb-4">🗑</div>
              <h2 className="text-lg font-bold text-slate-900">Delete Client?</h2>
              <p className="text-sm text-slate-500 mt-2">
                Are you sure you want to delete <strong>"{deleteClient.name}"</strong>? This cannot be undone.
              </p>
              <p className="text-xs text-red-500 mt-2">Clients with active engagements cannot be deleted.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteClient(null)}
                className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50">
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}