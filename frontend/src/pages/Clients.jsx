import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { clientAPI } from '../api/client';
import toast from 'react-hot-toast';
 
const REGION_FIELDS = {
  India: {
    flag: '🇮🇳', currency: 'INR',
    idLabel: 'CIN', idPlaceholder: 'U12345MH2020PTC123456',
    taxLabel: 'PAN', taxPlaceholder: 'AAAAA0000A',
    gstLabel: 'GSTIN', gstPlaceholder: '29AAAAA0000A1Z5',
  },
  UAE: {
    flag: '🇦🇪', currency: 'AED',
    idLabel: 'Trade License No.', idPlaceholder: 'CN-1234567',
    taxLabel: 'VAT Registration No.', taxPlaceholder: '100123456789003',
    gstLabel: 'Emirates ID (Owner)', gstPlaceholder: '784-XXXX-XXXXXXX-X',
  },
};
 
const EMPTY_FORM = {
  name: '', region: 'India',
  cin: '', pan: '', gstin: '',
  tradeLicense: '', vatNumber: '',
  email: '', phone: '', address: '',
};
 
// Validation helpers
function validatePAN(pan) { return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.toUpperCase()); }
function validateGSTIN(gstin) { return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin.toUpperCase()); }
function validateEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function validatePhone(phone) { return /^[+]?[\d\s\-()]{7,15}$/.test(phone); }
 
function ClientForm({ initial, clients, onSave, onCancel, firmRegion }) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState(initial || { ...EMPTY_FORM, region: firmRegion });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
 
  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(e => ({ ...e, [k]: null }));
  };
 
  const regionCfg = REGION_FIELDS[form.region];
 
  function validate() {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Company name is required';
 
    // Duplicate check (excluding self on edit)
    const duplicate = clients.find(c =>
      c.name.trim().toLowerCase() === form.name.trim().toLowerCase() &&
      c.id !== initial?.id
    );
    if (duplicate) errs.name = 'A client with this name already exists';
 
    if (form.region === 'India') {
      if (form.pan && !validatePAN(form.pan)) errs.pan = 'Invalid PAN format (e.g. AAAAA0000A)';
      if (form.gstin && !validateGSTIN(form.gstin)) errs.gstin = 'Invalid GSTIN format';
      // Duplicate PAN check
      const dupPAN = clients.find(c => c.pan && form.pan && c.pan === form.pan.toUpperCase() && c.id !== initial?.id);
      if (dupPAN) errs.pan = `PAN already used by "${dupPAN.name}"`;
    }
    if (form.region === 'UAE') {
      const dupLicense = clients.find(c => c.tradeLicense && form.tradeLicense && c.tradeLicense === form.tradeLicense && c.id !== initial?.id);
      if (dupLicense) errs.tradeLicense = `Trade License already used by "${dupLicense.name}"`;
    }
    if (form.email && !validateEmail(form.email)) errs.email = 'Invalid email address';
    if (form.phone && !validatePhone(form.phone)) errs.phone = 'Invalid phone number';
 
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }
 
  async function submit(e) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      region: form.region,
      address: form.address,
      email: form.email,
      phone: form.phone,
      ...(form.region === 'India'
        ? { cin: form.cin.toUpperCase(), pan: form.pan.toUpperCase(), gstin: form.gstin.toUpperCase() }
        : { tradeLicense: form.tradeLicense, vatNumber: form.vatNumber }),
    };
    try {
      if (isEdit) {
        await clientAPI.update(initial.id, payload);
        toast.success('Client updated');
      } else {
        await clientAPI.create(payload);
        toast.success('Client created');
      }
      onSave();
    } catch (err) {
      toast.error(err?.error || 'Failed to save client');
    } finally {
      setSaving(false);
    }
  }
 
  const Field = ({ label, error, children }) => (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</label>
      {children}
      {error && <p className="text-red-500 text-xs mt-1">⚠ {error}</p>}
    </div>
  );
 
  const Input = ({ field, type = 'text', placeholder, mono, className = '' }) => (
    <input
      type={type}
      value={form[field] || ''}
      onChange={e => set(field, e.target.value)}
      placeholder={placeholder}
      className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 transition-all
        ${errors[field] ? 'border-red-400 focus:ring-red-300' : 'border-slate-300 focus:ring-indigo-400 focus:border-transparent'}
        ${mono ? 'font-mono' : ''} ${className}`}
    />
  );
 
  return (
    <div className="mb-8 bg-white border border-slate-200 rounded-3xl p-6 shadow-xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-slate-900">{isEdit ? 'Edit Client' : 'New Client'}</h2>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
      </div>
 
      <form onSubmit={submit}>
        {/* Region */}
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
            <Field label="Company / Entity Name *" error={errors.name}>
              <Input field="name" placeholder={form.region === 'UAE' ? 'ABC Trading LLC' : 'Acme Private Limited'} />
            </Field>
          </div>
 
          <Field label={regionCfg.idLabel} error={errors[form.region === 'UAE' ? 'tradeLicense' : 'cin']}>
            <Input field={form.region === 'UAE' ? 'tradeLicense' : 'cin'} placeholder={regionCfg.idPlaceholder} mono />
          </Field>
 
          <Field label={regionCfg.taxLabel} error={errors[form.region === 'UAE' ? 'vatNumber' : 'pan']}>
            <Input field={form.region === 'UAE' ? 'vatNumber' : 'pan'} placeholder={regionCfg.taxPlaceholder} mono />
          </Field>
 
          {form.region === 'India' && (
            <Field label="GSTIN" error={errors.gstin}>
              <Input field="gstin" placeholder={regionCfg.gstPlaceholder} mono />
            </Field>
          )}
 
          <Field label="Email" error={errors.email}>
            <Input field="email" type="email" placeholder="accounts@company.com" />
          </Field>
 
          <Field label="Phone" error={errors.phone}>
            <Input field="phone" type="tel" placeholder={form.region === 'UAE' ? '+971 4 000 0000' : '+91 98765 43210'} />
          </Field>
 
          <div className="col-span-2">
            <Field label="Registered Address" error={errors.address}>
              <textarea
                value={form.address || ''}
                onChange={e => set('address', e.target.value)}
                rows={2}
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                placeholder={form.region === 'UAE' ? 'Office 401, Business Bay, Dubai' : '123 Main Street, Mumbai - 400001'}
              />
            </Field>
          </div>
        </div>
 
        <div className="flex gap-3 mt-6">
          <button type="submit" disabled={saving}
            className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-all shadow-md disabled:opacity-50">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Client'}
          </button>
          <button type="button" onClick={onCancel}
            className="px-6 py-2.5 border border-slate-300 text-slate-600 text-sm rounded-xl hover:bg-slate-50 transition-all">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
 
function ClientCard({ client, onEdit, onDelete, onClick }) {
  const regionCfg = REGION_FIELDS[client.region] || REGION_FIELDS.India;
  const [showMenu, setShowMenu] = useState(false);
 
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-indigo-300 hover:shadow-lg transition-all group hover:-translate-y-0.5 relative">
      {/* Three-dot menu */}
      <div className="absolute top-4 right-4 z-10">
        <button
          onClick={e => { e.stopPropagation(); setShowMenu(m => !m); }}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all opacity-0 group-hover:opacity-100"
        >⋯</button>
        {showMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
            <div className="absolute right-0 top-9 z-20 bg-white border border-slate-200 rounded-xl shadow-xl py-1 min-w-32">
              <button
                onClick={e => { e.stopPropagation(); setShowMenu(false); onEdit(client); }}
                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2">
                ✏️ Edit
              </button>
              <button
                onClick={e => { e.stopPropagation(); setShowMenu(false); onDelete(client); }}
                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                🗑️ Delete
              </button>
            </div>
          </>
        )}
      </div>
 
      {/* Card content — clickable */}
      <div onClick={onClick} className="cursor-pointer">
        <div className="flex items-start gap-3 pr-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-2xl flex-shrink-0 group-hover:from-indigo-200 group-hover:to-purple-200 transition-all">
            {regionCfg.flag}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-bold text-slate-900 group-hover:text-indigo-700 transition-colors truncate">{client.name}</h3>
              <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-bold ${client.region === 'UAE' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                {regionCfg.flag} {client.region}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 truncate">
              {client.region === 'UAE' ? client.tradeLicense || 'No Trade License' : client.cin || 'No CIN'}
              {client.email ? ` · ${client.email}` : ''}
            </p>
          </div>
        </div>
 
        {(client.pan || client.vatNumber || client.gstin || client.phone) && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            {client.pan && <span>PAN: <span className="font-mono text-slate-700">{client.pan}</span></span>}
            {client.gstin && <span>GSTIN: <span className="font-mono text-slate-700">{client.gstin}</span></span>}
            {client.vatNumber && <span>VAT: <span className="font-mono text-slate-700">{client.vatNumber}</span></span>}
            {client.phone && <span>📞 {client.phone}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
 
function DeleteConfirmModal({ client, onConfirm, onCancel, deleting }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full">
        <div className="text-4xl mb-3">🗑️</div>
        <h3 className="text-lg font-bold text-slate-900 mb-1">Delete Client?</h3>
        <p className="text-slate-500 text-sm mb-5">
          Are you sure you want to delete <span className="font-semibold text-slate-800">"{client.name}"</span>?
          This will hide the client and all associated data.
        </p>
        <div className="flex gap-3">
          <button onClick={onConfirm} disabled={deleting}
            className="flex-1 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50">
            {deleting ? 'Deleting…' : 'Yes, Delete'}
          </button>
          <button onClick={onCancel} disabled={deleting}
            className="flex-1 py-2.5 border border-slate-300 text-slate-600 text-sm rounded-xl hover:bg-slate-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
 
export default function Clients() {
  const navigate = useNavigate();
  const { setCurrentClient, firm } = useStore();
  const firmRegion = firm?.region || 'India';
 
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRegion, setFilterRegion] = useState('All');
 
  const [showForm, setShowForm] = useState(false);
  const [editClient, setEditClient] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
 
  async function loadClients() {
    try {
      const data = await clientAPI.list();
      setClients(data);
    } catch { toast.error('Failed to load clients'); }
    finally { setLoading(false); }
  }
 
  useEffect(() => { loadClients(); }, []);
 
  function handleEdit(client) {
    setEditClient({
      id: client.id,
      name: client.name,
      region: client.region,
      cin: client.cin || '',
      pan: client.pan || '',
      gstin: client.gstin || '',
      tradeLicense: client.tradeLicense || '',
      vatNumber: client.vatNumber || '',
      email: client.email || '',
      phone: client.phone || '',
      address: client.address || '',
    });
    setShowForm(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
 
  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await clientAPI.delete(deleteTarget.id);
      toast.success(`"${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
      loadClients();
    } catch { toast.error('Failed to delete client'); }
    finally { setDeleting(false); }
  }
 
  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = c.name.toLowerCase().includes(q) ||
      (c.cin || '').toLowerCase().includes(q) ||
      (c.tradeLicense || '').toLowerCase().includes(q) ||
      (c.pan || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q);
    const matchRegion = filterRegion === 'All' || c.region === filterRegion;
    return matchSearch && matchRegion;
  });
 
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/20 p-8">
      {/* Delete confirm modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          client={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          deleting={deleting}
        />
      )}
 
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Clients</h1>
          <p className="text-slate-500 mt-1">{clients.length} client{clients.length !== 1 ? 's' : ''} · {firmRegion}</p>
        </div>
        <button
          onClick={() => { setEditClient(null); setShowForm(true); }}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-semibold text-sm rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5">
          <span className="text-lg">+</span> New Client
        </button>
      </div>
 
      {/* Create / Edit form */}
      {(showForm || editClient) && (
        <ClientForm
          initial={editClient}
          clients={clients}
          firmRegion={firmRegion}
          onSave={() => { setShowForm(false); setEditClient(null); loadClients(); }}
          onCancel={() => { setShowForm(false); setEditClient(null); }}
        />
      )}
 
      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
            placeholder="Search by name, CIN, PAN, email..." />
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
            <button onClick={() => setShowForm(true)}
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
              onEdit={handleEdit}
              onDelete={setDeleteTarget}
              onClick={() => { setCurrentClient(c); navigate(`/clients/${c.id}/engagements`); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}