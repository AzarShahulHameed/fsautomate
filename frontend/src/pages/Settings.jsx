import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import { authAPI, uploadAPI, prefsAPI } from '../api/client';
import api from '../api/client';
import toast from 'react-hot-toast';
import TaxonomyManager from './TaxonomyManager';

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
  { key:'profile',     label:'👤 Profile'       },
  { key:'firm',        label:'🏢 Firm'           },
  { key:'team',        label:'👥 Team'           },
  { key:'preferences', label:'⚙️ Preferences'   },
  { key:'security',    label:'🔒 Security'       },
  { key:'billing',     label:'💳 Plan & Billing' },
  { key:'taxonomy',    label:'🗂 Taxonomy',   adminOnly: true },
];

// ── SessionManager Component ──────────────────────────────────────────────────
function SessionManager() {
  const [sessions, setSessions] = React.useState([]);
  const [loading,  setLoading]  = React.useState(true);

  React.useEffect(() => {
    // Cookie is sent automatically by the browser — no manual token header needed.
    api.get('/auth/sessions')
      .then(d => { setSessions(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function revoke(id) {
    await api.delete(`/auth/sessions/${id}`);
    setSessions(prev => prev.filter(s => s.id !== id));
    toast.success('Session revoked');
  }

  async function revokeAll() {
    if (!window.confirm('Log out all other sessions?')) return;
    await api.delete('/auth/sessions');
    setSessions(prev => prev.filter(s => s.isCurrent));
    toast.success('All other sessions logged out');
  }

  function timeAgo(d) {
    const diff = (Date.now() - new Date(d).getTime()) / 1000;
    if (diff < 60)    return 'just now';
    if (diff < 3600)  return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    return `${Math.floor(diff/86400)}d ago`;
  }

  if (loading) return <div className="text-sm text-slate-400 py-2">Loading sessions…</div>;

  return (
    <div className="space-y-2">
      {sessions.map(s => (
        <div key={s.id} className={`flex items-center gap-3 p-3 rounded-xl border ${s.isCurrent ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200'}`}>
          <span className="text-lg">{s.userAgent?.includes('Mobile') ? '📱' : '💻'}</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-700 truncate">{s.userAgent?.slice(0,60) || 'Unknown device'}</p>
            <p className="text-xs text-slate-400">{s.ipAddress || 'Unknown IP'} · {timeAgo(s.createdAt)}</p>
          </div>
          {s.isCurrent
            ? <span className="text-xs text-indigo-600 font-medium px-2 py-1 bg-indigo-100 rounded-lg">This device</span>
            : <button onClick={() => revoke(s.id)} className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded-lg hover:bg-red-50">Revoke</button>
          }
        </div>
      ))}
      {sessions.filter(s => !s.isCurrent).length > 0 && (
        <button onClick={revokeAll} className="text-xs text-red-600 hover:text-red-800 font-medium underline mt-2">
          Log out all other sessions
        </button>
      )}
      {sessions.length === 0 && <p className="text-xs text-slate-400 py-2">No active sessions found.</p>}
    </div>
  );
}

// ── BillingTab Component ──────────────────────────────────────────────────────
function BillingTab({ firmId, currency }) {
  const [planInfo,    setPlanInfo]    = React.useState(null);
  const [loading,     setLoading]     = React.useState(true);
  const [upgrading,   setUpgrading]   = React.useState(false);

  React.useEffect(() => {
    api.get('/billing/plan').then(d => { setPlanInfo(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const currSymbol = currency === 'AED' ? 'AED ' : '₹';

  async function initiateUpgrade(targetPlan) {
    setUpgrading(true);
    try {
      const order = await api.post('/billing/create-order', { targetPlan });

      if (order.devMode) {
        toast('Razorpay not configured — set RAZORPAY_KEY_ID env var', { icon: 'ℹ️' });
        setUpgrading(false);
        return;
      }

      // Load Razorpay checkout
      const script = document.createElement('script');
      script.src   = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => {
        const rzp = new window.Razorpay({
          key:         planInfo.razorpayKeyId,
          amount:      order.amount,
          currency:    order.currency,
          name:        'FinStatement',
          description: `Upgrade to ${targetPlan} plan`,
          order_id:    order.orderId,
          prefill:     { name: order.userName, email: order.userEmail },
          theme:       { color: '#4f46e5' },
          handler: async (response) => {
            try {
              const result = await api.post('/billing/verify-payment', { ...response, targetPlan });
              if (result.success) {
                toast.success(`Upgraded to ${targetPlan} plan! 🎉`);
                window.location.reload();
              } else {
                toast.error('Payment verification failed. Contact support.');
              }
            } catch {
              toast.error('Payment verification failed. Contact support.');
            }
          },
          modal: { ondismiss: () => setUpgrading(false) },
        });
        rzp.open();
      };
      document.head.appendChild(script);
    } catch { toast.error('Failed to initiate upgrade'); setUpgrading(false); }
  }

  if (loading) return <div className="py-8 text-slate-400 text-sm">Loading plan info…</div>;

  const plan   = planInfo?.plan || 'starter';
  const limits = planInfo?.limits || {};
  const usage  = planInfo?.usage  || {};

  const PLANS = [
    {
      key:      'starter',
      name:     'Starter',
      price:    'Free',
      clients:  5,
      users:    3,
      engs:     10,
      features: ['All 4 accounting methods', 'BS · P&L · Notes', 'Word / Excel export', 'Schedules & Validation'],
      color:    'border-slate-200',
      badge:    'bg-slate-100 text-slate-600',
    },
    {
      key:      'professional',
      name:     'Professional',
      price:    `${currSymbol}2,999/mo`,
      clients:  25,
      users:    10,
      engs:     100,
      features: ['Everything in Starter', 'PDF export', 'Priority support', 'Client share portal', 'Audit log'],
      color:    'border-indigo-500',
      badge:    'bg-indigo-100 text-indigo-700',
      popular:  true,
    },
    {
      key:      'enterprise',
      name:     'Enterprise',
      price:    `${currSymbol}9,999/mo`,
      clients:  null,
      users:    null,
      engs:     null,
      features: ['Everything in Professional', 'Unlimited clients & users', 'Dedicated support', 'Custom onboarding', 'SLA guarantee'],
      color:    'border-purple-500',
      badge:    'bg-purple-100 text-purple-700',
    },
  ];

  const currentPlan = PLANS.find(p => p.key === plan) || PLANS[0];

  return (
    <>
      {/* Current usage */}
      <Section title="Current Plan & Usage" desc={`You are on the ${currentPlan.name} plan.${planInfo?.planExpiresAt ? ` Renews ${new Date(planInfo.planExpiresAt).toLocaleDateString('en-GB')}` : ''}`}>
        <div className="grid grid-cols-3 gap-4 mb-4">
          {[
            { label: 'Clients',      used: usage.clients || 0,     limit: currentPlan.clients },
            { label: 'Engagements',  used: usage.engagements || 0, limit: currentPlan.engs },
            { label: 'Team Members', used: usage.users || 0,       limit: currentPlan.users },
          ].map(u => {
            const pct = u.limit ? Math.min(100, Math.round((u.used / u.limit) * 100)) : 0;
            const warn = u.limit && u.used >= u.limit * 0.8;
            return (
              <div key={u.label} className={`p-4 rounded-xl border ${warn ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-600">{u.label}</span>
                  <span className={`text-sm font-bold ${warn ? 'text-amber-700' : 'text-slate-800'}`}>
                    {u.used}{u.limit ? ` / ${u.limit}` : ' / ∞'}
                  </span>
                </div>
                {u.limit && (
                  <div className="w-full bg-slate-200 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full transition-all ${warn ? 'bg-amber-500' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {planInfo?.trialEndsAt && plan === 'starter' && new Date(planInfo.trialEndsAt) > new Date() && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 font-medium">
            🎉 Trial active — Professional features available until {new Date(planInfo.trialEndsAt).toLocaleDateString('en-GB')}
          </div>
        )}
      </Section>

      {/* Plan cards */}
      <Section title="Plans" desc="Upgrade or change your plan at any time.">
        <div className="grid grid-cols-3 gap-4">
          {PLANS.map(p => (
            <div key={p.key} className={`border-2 rounded-2xl p-5 relative flex flex-col ${p.color} ${p.key === plan ? 'bg-indigo-50' : 'bg-white'}`}>
              {p.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-indigo-600 text-white text-xs font-bold rounded-full">
                  Most Popular
                </div>
              )}
              <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-slate-800">{p.name}</span>
                {p.key === plan && <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${p.badge}`}>Current</span>}
              </div>
              <div className="text-2xl font-black text-slate-800 mb-4">{p.price}</div>
              <div className="space-y-1.5 flex-1 mb-5">
                {p.features.map(f => (
                  <div key={f} className="flex items-center gap-2 text-xs text-slate-600">
                    <span className="text-emerald-500">✓</span> {f}
                  </div>
                ))}
              </div>
              {p.key !== plan ? (
                <button
                  onClick={() => initiateUpgrade(p.key)}
                  disabled={upgrading}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all hover:-translate-y-0.5"
                  style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
                >
                  {upgrading ? 'Processing…' : `Upgrade to ${p.name}`}
                </button>
              ) : (
                <div className="w-full py-2.5 rounded-xl text-sm font-semibold text-center text-indigo-700 bg-indigo-50 border border-indigo-200">
                  ✓ Active Plan
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-4 text-center">
          Payments are processed securely via Razorpay · Cancel anytime · No refunds on monthly plans
        </p>
      </Section>
    </>
  );
}

export default function Settings() {
  const { user, firm, updateUser, updateFirm, currentEngagement } = useStore();
  const fileRef = useRef();

  const method     = currentEngagement?.method || 'AS';
  const currency   = (method === 'IFRS' || method === 'IFRS_SME') ? 'AED' : 'INR';
  const currSymbol = currency === 'AED' ? 'AED' : '₹';

  const [activeTab, setActiveTab] = useState('profile');

  // ── Preferences state ──────────────────────────────────────────────────────
  const [prefs, setPrefs] = useState({
    theme: 'light', dateFormat: 'DD/MM/YYYY', numberFormat: 'en-IN',
    emailReports: true, engagementUpdates: true, validationAlerts: true,
    systemUpdates: false, marketing: false,
  });
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  async function loadPrefs() {
    if (prefsLoaded) return;
    try {
      const data = await prefsAPI.get();
      setPrefs(p => ({ ...p, ...data }));
      setPrefsLoaded(true);
    } catch { /* use defaults */ }
  }

  async function savePrefs() {
    setPrefsSaving(true);
    try {
      await prefsAPI.save(prefs);
      toast.success('Preferences saved');
    } catch { toast.error('Failed to save preferences'); }
    finally { setPrefsSaving(false); }
  }

  // ── Team management state ──────────────────────────────────────────────────
  const [teamUsers,    setTeamUsers]    = useState([]);
  const [teamLoading,  setTeamLoading]  = useState(false);
  const [inviteEmail,  setInviteEmail]  = useState('');
  const [inviteRole,   setInviteRole]   = useState('STAFF');
  const [inviteSending, setInviteSending] = useState(false);

  async function loadTeam() {
    setTeamLoading(true);
    try { setTeamUsers(await authAPI.listUsers()); }
    catch { toast.error('Failed to load team'); }
    finally { setTeamLoading(false); }
  }

  async function sendInvite(e) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteSending(true);
    try {
      await authAPI.invite(inviteEmail.trim().toLowerCase(), inviteRole);
      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
    } catch (err) {
      toast.error(err?.error || err?.response?.data?.error || 'Failed to send invite');
    } finally { setInviteSending(false); }
  }

  async function changeRole(userId, newRole) {
    try {
      await authAPI.changeRole(userId, newRole);
      setTeamUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
      toast.success('Role updated');
    } catch (err) {
      toast.error(err?.error || err?.response?.data?.error || 'Failed to update role');
    }
  }

  async function toggleUser(userId, isActive) {
    if (!window.confirm(isActive ? 'Deactivate this user? They will be logged out immediately.' : 'Reactivate this user?')) return;
    try {
      await authAPI.deactivateUser(userId);
      setTeamUsers(prev => prev.map(u => u.id === userId ? { ...u, isActive: !u.isActive } : u));
      toast.success(isActive ? 'User deactivated' : 'User reactivated');
    } catch (err) {
      toast.error(err?.error || err?.response?.data?.error || 'Failed');
    }
  }

  // Lazy-load tab data
  const prevTab = React.useRef(activeTab);
  React.useEffect(() => {
    if (activeTab === 'team'        && prevTab.current !== 'team')        loadTeam();
    if (activeTab === 'preferences' && prevTab.current !== 'preferences') loadPrefs();
    prevTab.current = activeTab;
  }, [activeTab]);
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
            {TABS.filter(t => !t.adminOnly || user?.role === 'FIRM_ADMIN').map(t => (
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
          {activeTab === 'preferences' && (
            <Section title="Display Preferences" desc="Customize how numbers and dates appear throughout the application.">
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Number Format</label>
                    <select value={prefs.numberFormat} onChange={e => setPrefs(p => ({...p, numberFormat: e.target.value}))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                      <option value="en-IN">Indian (1,00,000)</option>
                      <option value="en-US">International (100,000)</option>
                    </select>
                    <p className="text-xs text-slate-400 mt-1">India → en-IN · UAE → en-US</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Date Format</label>
                    <select value={prefs.dateFormat} onChange={e => setPrefs(p => ({...p, dateFormat: e.target.value}))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                      <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                      <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-3">Email Notifications</label>
                  <div className="space-y-3">
                    {[
                      { key:'emailReports',       label:'Monthly report summaries',       desc:'Summary of completed engagements' },
                      { key:'engagementUpdates',  label:'Engagement status changes',      desc:'When status moves to Under Review or Filed' },
                      { key:'validationAlerts',   label:'Validation failure alerts',      desc:'When a casting check fails after generation' },
                      { key:'systemUpdates',      label:'System & feature updates',       desc:'New features and important changes' },
                    ].map(n => (
                      <div key={n.key} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                        <div>
                          <p className="text-sm font-medium text-slate-700">{n.label}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{n.desc}</p>
                        </div>
                        <button
                          onClick={() => setPrefs(p => ({...p, [n.key]: !p[n.key]}))}
                          className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${prefs[n.key] ? 'bg-indigo-600' : 'bg-slate-200'}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${prefs[n.key] ? 'translate-x-5' : ''}`}/>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end">
                  <button onClick={savePrefs} disabled={prefsSaving}
                    className="px-5 py-2.5 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-700 disabled:opacity-50 font-medium">
                    {prefsSaving ? 'Saving...' : 'Save Preferences'}
                  </button>
                </div>
              </div>
            </Section>
          )}

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
            <Section title="Active Sessions" desc="Manage where you are currently logged in.">
              <SessionManager userId={user?.id} />
            </Section>

            <Section title="Data Export" desc="Download all your firm's data for backup or migration. Required by PDPB Act (India) and PDPA (UAE).">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <p className="text-sm font-semibold text-slate-700">Export All Firm Data</p>
                  <p className="text-xs text-slate-400 mt-0.5">Clients, engagements, mappings, notes, and audit log as JSON files in a ZIP archive.</p>
                </div>
                <button onClick={async () => {
                  try {
                    const blob = await api.get('/data-export', { responseType: 'blob' });
                    const url   = URL.createObjectURL(blob);
                    const a     = document.createElement('a');
                    a.href = url; a.download = 'firm-data-export.zip'; a.click();
                    URL.revokeObjectURL(url);
                    toast.success('Data exported successfully');
                  } catch { toast.error('Export failed'); }
                }}
                  className="px-4 py-2 bg-slate-700 text-white text-sm rounded-xl hover:bg-slate-800 font-medium flex-shrink-0">
                  ⬇ Download ZIP
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
          {activeTab === 'team' && (<>
            <Section title="Invite Team Member" desc="Send an email invitation to add someone to your firm.">
              <form onSubmit={sendInvite} className="flex gap-3 flex-wrap">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="colleague@firm.com"
                  required
                  className="flex-1 min-w-48 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <select
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value)}
                  className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value="MANAGER">Manager</option>
                  <option value="STAFF">Staff</option>
                  <option value="VIEWER">Viewer</option>
                </select>
                <button type="submit" disabled={inviteSending || !inviteEmail.trim()}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-700 disabled:opacity-50 font-medium">
                  {inviteSending ? 'Sending...' : '✉ Send Invite'}
                </button>
              </form>
              <div className="mt-3 text-xs text-slate-400">
                <strong>Manager</strong> — access all engagements, approve status transitions · 
                <strong> Staff</strong> — assigned engagements only · 
                <strong> Viewer</strong> — read-only access to assigned engagements
              </div>
            </Section>

            <Section title="Team Members" desc="All users in your firm.">
              {teamLoading ? (
                <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
                  <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"/>
                  Loading team...
                </div>
              ) : (
                <div className="space-y-2">
                  {teamUsers.map(u => (
                    <div key={u.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${u.isActive ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                      {/* Avatar */}
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        {u.avatar ? <img src={u.avatar} alt={u.name} className="w-9 h-9 rounded-full object-cover"/> : u.name?.charAt(0)?.toUpperCase()}
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-800 text-sm truncate">{u.name}</span>
                          {u.id === user?.id && <span className="text-xs text-indigo-500 font-medium">(you)</span>}
                          {!u.isActive && <span className="text-xs text-red-500 font-medium">Deactivated</span>}
                        </div>
                        <div className="text-xs text-slate-400 truncate">{u.email}</div>
                      </div>
                      {/* Role selector */}
                      {u.id !== user?.id && user?.role === 'FIRM_ADMIN' ? (
                        <select
                          value={u.role}
                          onChange={e => changeRole(u.id, e.target.value)}
                          className="border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                        >
                          <option value="FIRM_ADMIN">Firm Admin</option>
                          <option value="MANAGER">Manager</option>
                          <option value="STAFF">Staff</option>
                          <option value="VIEWER">Viewer</option>
                        </select>
                      ) : (
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          u.role === 'FIRM_ADMIN' ? 'bg-purple-100 text-purple-700' :
                          u.role === 'MANAGER'    ? 'bg-blue-100 text-blue-700' :
                          u.role === 'STAFF'      ? 'bg-slate-100 text-slate-600' :
                                                    'bg-slate-100 text-slate-500'
                        }`}>{u.role.replace(/_/g, ' ')}</span>
                      )}
                      {/* Deactivate button */}
                      {u.id !== user?.id && user?.role === 'FIRM_ADMIN' && (
                        <button
                          onClick={() => toggleUser(u.id, u.isActive)}
                          className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
                            u.isActive
                              ? 'border-red-200 text-red-500 hover:bg-red-50'
                              : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                          }`}
                        >
                          {u.isActive ? 'Deactivate' : 'Reactivate'}
                        </button>
                      )}
                    </div>
                  ))}
                  {teamUsers.length === 0 && (
                    <p className="text-sm text-slate-400 text-center py-4">No team members yet. Invite someone above.</p>
                  )}
                </div>
              )}
            </Section>
          </>)}

          {activeTab === 'billing' && (<>
            <BillingTab firmId={firm?.id} currency={firm?.currency || 'INR'} />
          </>)}

          {activeTab === 'taxonomy' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <TaxonomyManager />
            </div>
          )}

          {activeTab === '__placeholder__' && (<>
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
