import React, { useState, useRef } from 'react';
import { useStore } from '../store';
import { authAPI } from '../api/client';
import toast from 'react-hot-toast';

function Avatar({ user, size = 'xl' }) {
  const s = size === 'xl' ? 'w-24 h-24 text-3xl' : 'w-12 h-12 text-lg';
  if (user?.avatar) return <img src={user.avatar} alt={user.name} className={`${s} rounded-2xl object-cover ring-4 ring-white shadow-lg`} />;
  return (
    <div className={`${s} rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-lg ring-4 ring-white`}>
      {user?.name?.charAt(0)?.toUpperCase() || 'U'}
    </div>
  );
}

function Section({ title, desc, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
        <h3 className="font-bold text-slate-800">{title}</h3>
        {desc && <p className="text-xs text-slate-400 mt-0.5">{desc}</p>}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}

const INPUT = "w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all bg-white";

export default function Settings() {
  const { user, firm, updateUser, updateFirm } = useStore();

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

  const [password, setPassword] = useState({ current: '', newPass: '', confirm: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingFirm,    setSavingFirm]    = useState(false);
  const [activeTab,     setActiveTab]     = useState('profile');
  const fileRef = useRef();

  const currency   = firm?.currency || 'INR';
  const currSymbol = currency === 'AED' ? 'AED' : '₹';
  const flag       = (firm?.region || 'India') === 'UAE' ? '🇦🇪' : '🇮🇳';

  function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Image must be under 2MB'); return; }
    const reader = new FileReader();
    reader.onload = ev => setProfile(p => ({ ...p, avatar: ev.target.result }));
    reader.readAsDataURL(file);
  }

  async function saveProfile() {
    if (!profile.name.trim()) { toast.error('Name is required'); return; }
    setSavingProfile(true);
    try {
      await authAPI.updateProfile(profile);
      updateUser(profile);
      toast.success('Profile updated successfully');
    } catch (err) {
      toast.error(err?.error || 'Failed to update profile');
    } finally { setSavingProfile(false); }
  }

  async function savePassword() {
    if (!password.current || !password.newPass) { toast.error('Fill in all password fields'); return; }
    if (password.newPass !== password.confirm) { toast.error('Passwords do not match'); return; }
    if (password.newPass.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    try {
      await authAPI.changePassword({ currentPassword: password.current, newPassword: password.newPass });
      setPassword({ current: '', newPass: '', confirm: '' });
      toast.success('Password changed successfully');
    } catch (err) {
      toast.error(err?.error || 'Incorrect current password');
    }
  }

  const TABS = [
    { key: 'profile',   label: '👤 Profile',      },
    { key: 'firm',      label: '🏢 Firm',          },
    { key: 'security',  label: '🔒 Security',      },
    { key: 'billing',   label: '💳 Plan & Billing' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 text-sm mt-0.5">Manage your account, firm, and preferences</p>
      </div>

      <div className="flex gap-6 flex-col lg:flex-row">
        {/* Sidebar nav */}
        <div className="lg:w-52 flex-shrink-0">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-2">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                  activeTab === t.key
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Avatar preview */}
          <div className="mt-4 bg-white rounded-2xl border border-slate-100 shadow-sm p-5 text-center">
            <div className="flex justify-center mb-3">
              <Avatar user={{ ...user, avatar: profile.avatar }} size="xl" />
            </div>
            <p className="font-bold text-slate-800 text-sm">{profile.name || user?.name}</p>
            <p className="text-xs text-slate-400 mt-0.5">{profile.email || user?.email}</p>
            <p className="text-xs text-slate-400">{user?.role?.replace(/_/g,' ')}</p>
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-center gap-1 text-xs text-slate-500">
              {flag} {firm?.region || 'India'} · {currSymbol}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-6">

          {/* ── PROFILE TAB ── */}
          {activeTab === 'profile' && (
            <>
              <Section title="Profile Photo" desc="Upload a professional photo. Max 2MB, JPG or PNG.">
                <div className="flex items-center gap-5">
                  <Avatar user={{ ...user, avatar: profile.avatar }} size="xl" />
                  <div>
                    <button onClick={() => fileRef.current?.click()}
                      className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 shadow-sm">
                      Upload Photo
                    </button>
                    {profile.avatar && (
                      <button onClick={() => setProfile(p => ({ ...p, avatar: '' }))}
                        className="ml-2 px-4 py-2 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50">
                        Remove
                      </button>
                    )}
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                    <p className="text-xs text-slate-400 mt-2">JPG, PNG up to 2MB. Square image recommended.</p>
                  </div>
                </div>
              </Section>

              <Section title="Personal Information" desc="Your name and contact details shown across the platform.">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Full Name" required>
                    <input className={INPUT} value={profile.name}
                      onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
                      placeholder="John Smith" />
                  </Field>
                  <Field label="Email Address" required>
                    <input className={INPUT} value={profile.email} type="email"
                      onChange={e => setProfile(p => ({ ...p, email: e.target.value }))}
                      placeholder="john@firm.com" />
                  </Field>
                  <Field label="Phone Number">
                    <input className={INPUT} value={profile.phone || ''}
                      onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))}
                      placeholder="+971 50 000 0000" />
                  </Field>
                  <Field label="Designation / Role">
                    <input className={INPUT} value={profile.designation || ''}
                      onChange={e => setProfile(p => ({ ...p, designation: e.target.value }))}
                      placeholder="Chartered Accountant" />
                  </Field>
                </div>
                <div className="flex justify-end mt-5">
                  <button onClick={saveProfile} disabled={savingProfile}
                    className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 shadow-sm">
                    {savingProfile ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </Section>
            </>
          )}

          {/* ── FIRM TAB ── */}
          {activeTab === 'firm' && (
            <Section title="Firm Information" desc="Details about your accounting firm.">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Firm Name" required>
                  <input className={INPUT} value={firmData.name}
                    onChange={e => setFirmData(f => ({ ...f, name: e.target.value }))}
                    placeholder="My Accounting Firm" />
                </Field>
                <Field label="Region">
                  <div className="flex gap-3">
                    {['India','UAE'].map(r => (
                      <button key={r} onClick={() => setFirmData(f => ({ ...f, region: r }))}
                        className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                          firmData.region === r
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}>
                        {r === 'UAE' ? '🇦🇪 UAE' : '🇮🇳 India'}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>

              <div className="mt-5 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-xs font-semibold text-slate-600 mb-3">Firm Configuration (read-only)</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Currency',   value: `${currSymbol} ${currency}` },
                    { label: 'Standards',  value: (firmData.region === 'UAE' ? ['IFRS','IFRS SME'] : ['AS','Ind AS']).join(', ') },
                    { label: 'Plan',       value: firm?.plan || 'Starter' },
                  ].map((r, i) => (
                    <div key={i} className="bg-white rounded-lg p-3 border border-slate-200">
                      <p className="text-xs text-slate-400">{r.label}</p>
                      <p className="text-sm font-bold text-slate-800 mt-0.5">{r.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end mt-5">
                <button onClick={() => toast.success('Firm details updated')} disabled={savingFirm}
                  className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 shadow-sm">
                  {savingFirm ? 'Saving…' : 'Save Firm Details'}
                </button>
              </div>
            </Section>
          )}

          {/* ── SECURITY TAB ── */}
          {activeTab === 'security' && (
            <>
              <Section title="Change Password" desc="Use a strong password with at least 8 characters.">
                <div className="space-y-4 max-w-sm">
                  <Field label="Current Password" required>
                    <input className={INPUT} type="password" value={password.current}
                      onChange={e => setPassword(p => ({ ...p, current: e.target.value }))}
                      placeholder="Enter current password" />
                  </Field>
                  <Field label="New Password" required>
                    <input className={INPUT} type="password" value={password.newPass}
                      onChange={e => setPassword(p => ({ ...p, newPass: e.target.value }))}
                      placeholder="At least 8 characters" />
                  </Field>
                  <Field label="Confirm New Password" required>
                    <input className={INPUT} type="password" value={password.confirm}
                      onChange={e => setPassword(p => ({ ...p, confirm: e.target.value }))}
                      placeholder="Repeat new password" />
                  </Field>
                  <button onClick={savePassword}
                    className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 shadow-sm">
                    Change Password
                  </button>
                </div>
              </Section>

              <Section title="Active Sessions" desc="Devices where you are currently logged in.">
                <div className="space-y-3">
                  {[
                    { device: 'This device', location: 'Dubai, UAE', time: 'Active now', current: true },
                  ].map((s, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-lg">💻</div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{s.device}</p>
                          <p className="text-xs text-slate-400">{s.location} · {s.time}</p>
                        </div>
                      </div>
                      {s.current
                        ? <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">Current</span>
                        : <button className="text-xs text-red-500 hover:text-red-700 font-medium">Sign out</button>}
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="Danger Zone" desc="Irreversible actions — proceed with caution.">
                <div className="p-4 border border-red-200 rounded-xl bg-red-50">
                  <p className="text-sm font-semibold text-red-800 mb-1">Delete Account</p>
                  <p className="text-xs text-red-600 mb-3">This will permanently delete your account and all data. This cannot be undone.</p>
                  <button onClick={() => toast.error('Please contact support to delete your account')}
                    className="px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700">
                    Request Account Deletion
                  </button>
                </div>
              </Section>
            </>
          )}

          {/* ── BILLING TAB ── */}
          {activeTab === 'billing' && (
            <>
              <Section title="Current Plan" desc="Your subscription details and usage.">
                <div className="flex items-center justify-between p-5 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100 mb-5">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-3 py-1 bg-indigo-600 text-white text-xs font-bold rounded-full">STARTER</span>
                      <span className="text-xs text-slate-500">Current plan</span>
                    </div>
                    <p className="text-2xl font-bold text-slate-900">Free</p>
                    <p className="text-sm text-slate-500 mt-0.5">Up to 5 clients · All 4 methods</p>
                  </div>
                  <button onClick={() => toast.success('Upgrade coming soon!')}
                    className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 shadow-md shadow-indigo-200">
                    Upgrade Plan
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Clients Used',    value: `${totalClients || 0} / 5`,   pct: Math.min(((totalClients||0)/5)*100,100) },
                    { label: 'Engagements',      value: 'Unlimited',                   pct: 0 },
                    { label: 'Storage Used',     value: '< 1 MB',                      pct: 1 },
                  ].map((u, i) => (
                    <div key={i} className="bg-white rounded-xl border border-slate-200 p-4">
                      <p className="text-xs text-slate-400 mb-1">{u.label}</p>
                      <p className="text-lg font-bold text-slate-800">{u.value}</p>
                      {u.pct > 0 && (
                        <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full" style={{width:`${u.pct}%`}}/>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="Available Plans" desc="Upgrade to serve more clients and unlock features.">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { name: 'Starter', price: 'Free', clients: '5 clients', features: ['All 4 methods','Notes & Schedules','Word/Excel export'], current: true, color: 'border-slate-200' },
                    { name: 'Professional', price: `${currSym} 2,999/mo`, clients: '25 clients', features: ['Everything in Starter','Priority support','PDF export','Multi-user'], current: false, color: 'border-indigo-500', highlight: true },
                    { name: 'Enterprise', price: 'Custom', clients: 'Unlimited', features: ['Everything in Pro','White labelling','API access','Dedicated support'], current: false, color: 'border-purple-500' },
                  ].map((p, i) => (
                    <div key={i} className={`rounded-2xl border-2 p-5 ${p.color} ${p.highlight ? 'bg-indigo-50' : 'bg-white'} relative`}>
                      {p.highlight && <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-indigo-600 text-white text-xs font-bold rounded-full">Most Popular</span>}
                      <p className="font-bold text-slate-800">{p.name}</p>
                      <p className="text-xl font-bold text-indigo-600 mt-1">{p.price}</p>
                      <p className="text-xs text-slate-400 mb-4">{p.clients}</p>
                      <ul className="space-y-1.5 mb-5">
                        {p.features.map((f, j) => (
                          <li key={j} className="flex items-center gap-2 text-xs text-slate-600">
                            <span className="text-emerald-500 font-bold">✓</span> {f}
                          </li>
                        ))}
                      </ul>
                      <button
                        onClick={() => toast.success(p.current ? 'This is your current plan' : `${p.name} upgrade coming soon!`)}
                        className={`w-full py-2 text-sm font-semibold rounded-xl transition-all ${
                          p.current
                            ? 'bg-slate-100 text-slate-400 cursor-default'
                            : p.highlight
                            ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-200'
                            : 'border border-slate-300 text-slate-700 hover:border-indigo-400 hover:text-indigo-600'
                        }`}>
                        {p.current ? 'Current Plan' : 'Upgrade'}
                      </button>
                    </div>
                  ))}
                </div>
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
