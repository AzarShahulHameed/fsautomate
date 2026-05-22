import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import { authAPI, uploadAPI } from '../api/client';
import toast from 'react-hot-toast';

function Avatar({ user, size = 'xl' }) {
  const s = size === 'xl' ? 'w-24 h-24 text-3xl' : 'w-10 h-10 text-base';
  if (user?.avatar) return (
    <img src={user.avatar} alt={user?.name || 'User'}
      className={`${s} rounded-2xl object-cover ring-4 ring-white shadow-lg`} />
  );
  return (
    <div className={`${s} rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-lg ring-4 ring-white`}>
      {user?.name?.charAt(0)?.toUpperCase() || 'U'}
    </div>
  );
}

function Section({ title, desc, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
        <h3 className="font-bold text-slate-800 text-sm">{title}</h3>
        {desc && <p className="text-xs text-slate-400 mt-0.5">{desc}</p>}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function Field({ label, required, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
        {label}{required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

const INPUT = "w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-white";

const TABS = [
  { key:'profile',  label:'👤 Profile'       },
  { key:'firm',     label:'🏢 Firm'           },
  { key:'security', label:'🔒 Security'       },
  { key:'billing',  label:'💳 Plan & Billing' },
];

export default function Settings() {
  const { user, firm, updateUser, updateFirm, currentEngagement } = useStore();
  const fileRef = useRef();

  const method     = currentEngagement?.method || 'AS';
  const currency   = (method === 'IFRS' || method === 'IFRS_SME') ? 'AED' : 'INR';
  const currSymbol = currency === 'AED' ? 'AED' : '₹';

  const [activeTab, setActiveTab] = useState('profile');
  const [uploading, setUploading] = useState(false);
  const [saving,    setSaving]    = useState(false);

  const [profile, setProfile] = useState({
    name:        user?.name        || '',
    email:       user?.email       || '',
    phone:       user?.phone       || '',
    designation: user?.designation || '',
    avatar:      user?.avatar      || '',
  });

  const [firmData, setFirmData] = useState({
    name:   firm?.name   || '',
    region: firm?.region || 'India',
  });

  const [password, setPassword] = useState({ current:'', newPass:'', confirm:'' });

  useEffect(() => {
    setProfile(prev => ({
      name:        user?.name        || '',
      email:       user?.email       || '',
      phone:       user?.phone       || '',
      designation: user?.designation || '',
      avatar:      prev.avatar || user?.avatar || '',
    }));
  }, [user?.id]);

  // Sync firmData whenever firm store changes
  useEffect(() => {
    setFirmData({
      name:   firm?.name   || '',
      region: firm?.region || 'India',
    });
  }, [firm?.id, firm?.name, firm?.region]);

  async function handleAvatarFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB'); return; }
    setUploading(true);
    try {
      // Upload via backend — backend handles Cloudinary/S3/local based on env vars
      const res = await uploadAPI.avatar(file);
      const url = res?.url || res?.data?.url;
      if (!url) throw new Error('No URL returned from server');

      // 1. Update global store first — sidebar and dashboard update immediately
      updateUser({ avatar: url });

      // 2. Save to DB — use functional update to get latest profile state
      setProfile(prev => {
        const updated = { ...prev, avatar: url };
        // Save to DB in background
        authAPI.updateProfile(updated).catch(() => {});
        return updated;
      });

      if (res?.warning) toast(res.warning, { icon: '⚠️' });
      else toast.success('Photo saved — showing everywhere now');
    } catch (err) {
      toast.error(err?.error || 'Upload failed');
    } finally { setUploading(false); }
  }

  async function saveProfile() {
    if (!profile.name.trim()) { toast.error('Name is required'); return; }
    if (!profile.email.trim()) { toast.error('Email is required'); return; }
    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) {
      toast.error('Please enter a valid email address'); return;
    }
    setSaving(true);
    try {
      const res = await authAPI.updateProfile(profile);
      // Update store — email, name, avatar, phone, designation all reflect everywhere
      const updatedUser = {
        name:        profile.name,
        email:       res?.email || profile.email,
        phone:       profile.phone,
        designation: profile.designation,
        avatar:      res?.avatar || profile.avatar,
      };
      updateUser(updatedUser);
      // Also update local profile state to match
      setProfile(prev => ({ ...prev, ...updatedUser }));
      const emailChanged = profile.email !== user?.email;
      toast.success(emailChanged
        ? 'Profile saved — email updated. Use new email to login next time.'
        : 'Profile saved — name, email, phone updated everywhere ✓'
      );
    } catch (err) { toast.error(err?.error || 'Failed to save'); }
    finally { setSaving(false); }
  }

  async function changePassword() {
    if (!password.current || !password.newPass) { toast.error('Fill all fields'); return; }
    if (password.newPass !== password.confirm)  { toast.error('Passwords do not match'); return; }
    if (password.newPass.length < 8)            { toast.error('Minimum 8 characters'); return; }
    setSaving(true);
    try {
      await authAPI.changePassword({ currentPassword: password.current, newPassword: password.newPass });
      setPassword({ current:'', newPass:'', confirm:'' });
      toast.success('Password changed');
    } catch (err) { toast.error(err?.error || 'Incorrect current password'); }
    finally { setSaving(false); }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 text-sm mt-0.5">Manage your account, firm, and preferences</p>
      </div>

      <div className="flex gap-6 flex-col lg:flex-row">
        {/* Sidebar */}
        <div className="lg:w-56 flex-shrink-0 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-2">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                  activeTab === t.key ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Profile preview */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 text-center">
            <div className="flex justify-center mb-3">
              <Avatar user={{ ...user, avatar: profile.avatar }} size="xl" />
            </div>
            <p className="font-bold text-slate-800 text-sm">{profile.name || user?.name}</p>
            <p className="text-xs text-slate-400 mt-0.5 truncate">{profile.email || user?.email}</p>
            <p className="text-xs text-slate-400">{profile.designation || user?.role?.replace(/_/g,' ')}</p>
            <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-400">{firm?.name}</div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-5">

          {/* ── PROFILE ── */}
          {activeTab === 'profile' && (<>
            <Section title="Profile Photo"
              desc="Uploaded via your server — storage provider configured in backend environment variables (Cloudinary, S3, or local).">
              <div className="flex items-center gap-5">
                <Avatar user={{ ...user, avatar: profile.avatar }} size="xl" />
                <div>
                  <div className="flex gap-2">
                    <button onClick={() => fileRef.current?.click()} disabled={uploading}
                      className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50">
                      {uploading ? '⏳ Uploading...' : '📷 Upload Photo'}
                    </button>
                    {profile.avatar && (
                      <button onClick={() => setProfile(p => ({ ...p, avatar: '' }))}
                        className="px-4 py-2 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50">
                        Remove
                      </button>
                    )}
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarFile} />
                  <p className="text-xs text-slate-400 mt-2">JPG, PNG, WebP — max 5MB</p>
                </div>
              </div>
            </Section>

            <Section title="Personal Information"
              desc="Name updates reflect immediately in the sidebar, dashboard, and report headers.">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Full Name" required>
                  <input className={INPUT} value={profile.name}
                    onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} />
                </Field>
                <Field label="Email Address" required>
                  <input className={INPUT} type="email" value={profile.email}
                    onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} />
                </Field>
                <Field label="Phone Number">
                  <input className={INPUT} value={profile.phone || ''}
                    onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))}
                    placeholder="+91 98765 43210" />
                </Field>
                <Field label="Designation" hint="Shown in reports as 'Prepared by'">
                  <input className={INPUT} value={profile.designation || ''}
                    onChange={e => setProfile(p => ({ ...p, designation: e.target.value }))}
                    placeholder="Chartered Accountant" />
                </Field>
              </div>
              <div className="flex justify-end mt-5">
                <button onClick={saveProfile} disabled={saving}
                  className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 shadow-sm">
                  {saving ? 'Saving…' : '💾 Save Profile'}
                </button>
              </div>
            </Section>
          </>)}

          {/* ── FIRM ── */}
          {activeTab === 'firm' && (
            <Section title="Firm Details">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Firm Name" required>
                  <input className={INPUT} value={firmData.name}
                    onChange={e => setFirmData(f => ({ ...f, name: e.target.value }))} />
                </Field>
                <Field label="Default Region">
                  <div className="flex gap-3">
                    {['India','UAE'].map(r => (
                      <button key={r} onClick={() => setFirmData(f => ({ ...f, region: r }))}
                        className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                          firmData.region === r ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}>
                        {r === 'UAE' ? '🇦🇪 UAE' : '🇮🇳 India'}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
              <div className="mt-5 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-xs font-semibold text-slate-500 mb-3 uppercase tracking-wider">Derived Settings</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label:'Currency',  value: firmData.region === 'UAE' ? 'AED' : 'INR ₹' },
                    { label:'Standards', value: firmData.region === 'UAE' ? 'IFRS · IFRS SME' : 'AS · Ind AS' },
                    { label:'Tax',       value: firmData.region === 'UAE' ? 'VAT 5%' : 'GST / Income Tax' },
                  ].map((r,i) => (
                    <div key={i} className="bg-white rounded-xl p-3 border border-slate-200">
                      <p className="text-xs text-slate-400">{r.label}</p>
                      <p className="text-sm font-bold text-slate-800 mt-0.5">{r.value}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end mt-5">
                <button onClick={async () => {
                  if (!firmData.name.trim()) { toast.error('Firm name is required'); return; }
                  setSaving(true);
                  try {
                    const res = await authAPI.updateFirm(firmData);
                    // Update store — reflects in sidebar, dashboard, reports everywhere
                    updateFirm(res?.firm || firmData);
                    toast.success('Firm details saved — reflecting everywhere now');
                  } catch (err) { toast.error(err?.error || 'Failed to save firm details'); }
                  finally { setSaving(false); }
                }} disabled={saving}
                  className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 shadow-sm">
                  {saving ? 'Saving…' : '💾 Save Firm Details'}
                </button>
              </div>
            </Section>
          )}

          {/* ── SECURITY ── */}
          {activeTab === 'security' && (<>
            <Section title="Change Password">
              <div className="space-y-4 max-w-sm">
                <Field label="Current Password" required>
                  <input className={INPUT} type="password" value={password.current}
                    onChange={e => setPassword(p => ({ ...p, current: e.target.value }))} />
                </Field>
                <Field label="New Password" required>
                  <input className={INPUT} type="password" value={password.newPass}
                    onChange={e => setPassword(p => ({ ...p, newPass: e.target.value }))}
                    placeholder="At least 8 characters" />
                </Field>
                <Field label="Confirm New Password" required>
                  <input className={INPUT} type="password" value={password.confirm}
                    onChange={e => setPassword(p => ({ ...p, confirm: e.target.value }))} />
                </Field>
                <button onClick={changePassword} disabled={saving}
                  className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50">
                  {saving ? 'Changing...' : '🔒 Change Password'}
                </button>
              </div>
            </Section>
            <Section title="Danger Zone">
              <div className="p-4 border border-red-200 rounded-xl bg-red-50">
                <p className="text-sm font-semibold text-red-800 mb-1">Delete Account</p>
                <p className="text-xs text-red-600 mb-3">All data will be permanently deleted.</p>
                <button onClick={() => toast.error('Contact support to delete your account')}
                  className="px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700">
                  Request Account Deletion
                </button>
              </div>
            </Section>
          </>)}

          {/* ── BILLING ── */}
          {activeTab === 'billing' && (<>
            <Section title="Current Plan">
              <div className="flex items-center justify-between p-5 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100 mb-5">
                <div>
                  <span className="px-3 py-1 bg-indigo-600 text-white text-xs font-bold rounded-full">STARTER</span>
                  <p className="text-2xl font-bold text-slate-900 mt-2">Free</p>
                  <p className="text-sm text-slate-500">Up to 5 clients · All 4 methods</p>
                </div>
                <button onClick={() => toast.success('Upgrade coming soon!')}
                  className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700">
                  Upgrade
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label:'Clients',    value:'5 max'    },
                  { label:'Engagements',value:'Unlimited'},
                  { label:'Storage',    value:'1 GB'     },
                ].map((u,i) => (
                  <div key={i} className="bg-white rounded-xl border border-slate-200 p-4">
                    <p className="text-xs text-slate-400">{u.label}</p>
                    <p className="text-lg font-bold text-slate-800">{u.value}</p>
                  </div>
                ))}
              </div>
            </Section>
            <Section title="Plans">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { name:'Starter',      price:'Free',                 clients:'5 clients',  features:['All 4 methods','BS · P&L · Notes','Word / Excel export','Schedules'], current:true,  color:'border-slate-200' },
                  { name:'Professional', price:`${currSymbol} 2,999/mo`, clients:'25 clients', features:['Everything in Starter','PDF export','Priority support','Multi-user'], current:false, color:'border-indigo-500', popular:true },
                  { name:'Enterprise',   price:'Custom',               clients:'Unlimited',   features:['Everything in Pro','White label','API access','Dedicated support'],   current:false, color:'border-purple-500' },
                ].map((p,i) => (
                  <div key={i} className={`rounded-2xl border-2 p-5 relative ${p.color} ${p.popular?'bg-indigo-50':'bg-white'}`}>
                    {p.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-indigo-600 text-white text-xs font-bold rounded-full">Popular</span>}
                    <p className="font-bold text-slate-800">{p.name}</p>
                    <p className="text-xl font-bold text-indigo-600 mt-1">{p.price}</p>
                    <p className="text-xs text-slate-400 mb-4">{p.clients}</p>
                    <ul className="space-y-1.5 mb-5">
                      {p.features.map((f,j) => (
                        <li key={j} className="flex items-center gap-2 text-xs text-slate-600">
                          <span className="text-emerald-500">✓</span>{f}
                        </li>
                      ))}
                    </ul>
                    <button onClick={() => toast.success(p.current ? 'Your current plan' : 'Coming soon!')}
                      className={`w-full py-2 text-sm font-semibold rounded-xl ${
                        p.current ? 'bg-slate-100 text-slate-400 cursor-default'
                          : p.popular ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                          : 'border border-slate-300 text-slate-700 hover:border-indigo-400'
                      }`}>
                      {p.current ? 'Current Plan' : 'Upgrade'}
                    </button>
                  </div>
                ))}
              </div>
            </Section>
          </>)}
        </div>
      </div>
    </div>
  );
}
