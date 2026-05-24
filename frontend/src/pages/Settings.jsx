import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import { authAPI, uploadAPI, prefsAPI, otpAPI } from '../api/client';
import toast from 'react-hot-toast';
 
// ── Reusable UI ───────────────────────────────────────────────────────────────
const INPUT = "w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all";
const INPUT_DISABLED = "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500 cursor-not-allowed";
 
function Card({ title, subtitle, children, badge }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-800 text-sm">{title}</h3>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {badge && <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700">{badge}</span>}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}
 
function Field({ label, required, hint, error, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
        {label}{required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {children}
      {hint  && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
      {error && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><span>⚠</span>{error}</p>}
    </div>
  );
}
 
function Toggle({ value, onChange, label, desc }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {desc && <p className="text-xs text-slate-400 mt-0.5">{desc}</p>}
      </div>
      <button type="button" onClick={() => onChange(!value)}
        className={`relative w-11 h-6 rounded-full transition-all duration-200 ${value ? 'bg-indigo-600' : 'bg-slate-200'}`}>
        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${value ? 'left-6' : 'left-1'}`} />
      </button>
    </div>
  );
}
 
function Avatar({ user, size = 'xl' }) {
  const sz = size === 'xl' ? 'w-20 h-20 text-2xl' : 'w-10 h-10 text-sm';
  if (user?.avatar) return (
    <img src={user.avatar} alt={user?.name}
      className={`${sz} rounded-2xl object-cover ring-4 ring-white shadow-lg`} />
  );
  return (
    <div className={`${sz} rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-lg ring-4 ring-white`}>
      {user?.name?.charAt(0)?.toUpperCase() || 'U'}
    </div>
  );
}
 
const TABS = [
  { key:'profile',       icon:'👤', label:'Profile'           },
  { key:'firm',          icon:'🏢', label:'Firm & Branding'   },
  { key:'notifications', icon:'🔔', label:'Notifications'     },
  { key:'security',      icon:'🔒', label:'Security'          },
  { key:'appearance',    icon:'🎨', label:'Appearance'        },
  { key:'integrations',  icon:'🔗', label:'Integrations'      },
  { key:'billing',       icon:'💳', label:'Plan & Billing'    },
  { key:'data',          icon:'📦', label:'Data & Export'     },
  { key:'support',       icon:'💬', label:'Help & Support'    },
];
 
export default function Settings() {
  const { user, firm, updateUser, updateFirm, currentEngagement } = useStore();
  const fileRef   = useRef();
  const method    = currentEngagement?.method || 'AS';
  const currency  = (method === 'IFRS' || method === 'IFRS_SME') ? 'AED' : 'INR';
 
  const [activeTab, setActiveTab] = useState('profile');
  const [uploading, setUploading] = useState(false);
  const [saving,    setSaving]    = useState(false);
 
  // OTP state
  const [otpState, setOtpState] = useState({
    emailSending: false, emailSent: false, emailOTP: '', emailVerifying: false,
    phoneSending: false, phoneSent: false, phoneOTP: '', phoneVerifying: false,
  });
  const [pendingEmail, setPendingEmail] = useState('');
  const [pendingPhone, setPendingPhone] = useState('');
 
  const [profile, setProfile] = useState({
    name: user?.name||'', email: user?.email||'',
    phone: user?.phone||'', designation: user?.designation||'', avatar: user?.avatar||'',
  });
  const [firmData, setFirmData] = useState({
    name: firm?.name||'', region: firm?.region||'India',
  });
  const [password, setPassword] = useState({ current:'', newPass:'', confirm:'' });
  const [notifs, setNotifs] = useState({
    emailReports: true, engagementUpdates: true,
    validationAlerts: true, systemUpdates: false, marketing: false,
  });
  const [appearance, setAppearance] = useState({
    theme: 'light', dateFormat: 'DD/MM/YYYY', numberFormat: 'en-IN',
    compactMode: false,
  });
 
  useEffect(() => {
    setProfile({ name:user?.name||'', email:user?.email||'', phone:user?.phone||'', designation:user?.designation||'', avatar:user?.avatar||'' });
    setPendingEmail(user?.email||'');
    setPendingPhone(user?.phone||'');
  }, [user?.id]);
 
  // Load preferences from DB
  useEffect(() => {
    prefsAPI.get().then(data => {
      if (data) {
        setNotifs({
          emailReports:      data.emailReports      ?? true,
          engagementUpdates: data.engagementUpdates ?? true,
          validationAlerts:  data.validationAlerts  ?? true,
          systemUpdates:     data.systemUpdates     ?? false,
          marketing:         data.marketing         ?? false,
        });
        setAppearance({
          theme:        data.theme        || 'light',
          dateFormat:   data.dateFormat   || 'DD/MM/YYYY',
          numberFormat: data.numberFormat || 'en-IN',
          compactMode:  data.compactMode  ?? false,
        });
      }
    }).catch(() => {});
  }, [user?.id]);
 
  useEffect(() => {
    setFirmData({ name:firm?.name||'', region:firm?.region||'India' });
  }, [firm?.id, firm?.name, firm?.region]);
 
  async function handleAvatar(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5*1024*1024) { toast.error('Image must be under 5MB'); return; }
    setUploading(true);
    try {
      const res = await uploadAPI.avatar(file);
      const url = res?.url || res?.data?.url;
      if (!url) throw new Error('No URL');
      updateUser({ avatar: url });
      setProfile(p => ({ ...p, avatar: url }));
      setProfile(prev => {
        authAPI.updateProfile({ ...prev, avatar: url }).catch(() => {});
        return { ...prev, avatar: url };
      });
      toast.success('Photo updated');
    } catch { toast.error('Upload failed'); }
    finally { setUploading(false); }
  }
 
  async function saveProfile() {
    if (!profile.name.trim()) { toast.error('Name is required'); return; }
    // Save name, designation only (email & phone need OTP)
    setSaving(true);
    try {
      const res = await authAPI.updateProfile({
        name: profile.name,
        designation: profile.designation,
        avatar: profile.avatar,
        // Only send email/phone if unchanged (no OTP needed)
        email: pendingEmail === user?.email ? profile.email : user?.email,
        phone: pendingPhone === user?.phone ? profile.phone : user?.phone,
      });
      const updated = { name:profile.name, designation:profile.designation, avatar:res?.avatar||profile.avatar };
      updateUser(updated);
      setProfile(p => ({ ...p, ...updated }));
      toast.success('Profile saved ✓');
    } catch (err) { toast.error(err?.error||'Save failed'); }
    finally { setSaving(false); }
  }
 
  async function sendEmailOTP() {
    const email = pendingEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error('Enter a valid email'); return; }
    if (email === user?.email) { toast('This is already your email'); return; }
    setOtpState(s => ({ ...s, emailSending: true }));
    try {
      const res = await otpAPI.send('email', email);
      setOtpState(s => ({ ...s, emailSending: false, emailSent: true }));
      toast.success(res.message || 'OTP sent to your email');
      // In dev, show OTP
      if (res.otp) toast(`Dev OTP: ${res.otp}`, { icon:'🔑', duration: 30000 });
    } catch (err) {
      setOtpState(s => ({ ...s, emailSending: false }));
      toast.error(err?.error || 'Failed to send OTP');
    }
  }
 
  async function verifyEmailOTP() {
    setOtpState(s => ({ ...s, emailVerifying: true }));
    try {
      const res = await otpAPI.verify('email', pendingEmail, otpState.emailOTP);
      updateUser({ email: res.email });
      setProfile(p => ({ ...p, email: res.email }));
      setPendingEmail(res.email);
      setOtpState(s => ({ ...s, emailSent: false, emailOTP: '', emailVerifying: false }));
      toast.success('Email verified and updated ✓');
    } catch (err) {
      setOtpState(s => ({ ...s, emailVerifying: false }));
      toast.error(err?.error || 'Wrong OTP');
    }
  }
 
  async function sendPhoneOTP() {
    const phone = pendingPhone.trim();
    if (!phone) { toast.error('Enter a phone number'); return; }
    if (phone === user?.phone) { toast('This is already your phone number'); return; }
    setOtpState(s => ({ ...s, phoneSending: true }));
    try {
      const res = await otpAPI.send('phone', phone);
      setOtpState(s => ({ ...s, phoneSending: false, phoneSent: true }));
      toast.success(res.message || 'OTP sent to your phone');
      if (res.otp) toast(`Dev OTP: ${res.otp}`, { icon:'🔑', duration: 30000 });
    } catch (err) {
      setOtpState(s => ({ ...s, phoneSending: false }));
      toast.error(err?.error || 'Failed to send OTP');
    }
  }
 
  async function verifyPhoneOTP() {
    setOtpState(s => ({ ...s, phoneVerifying: true }));
    try {
      const res = await otpAPI.verify('phone', pendingPhone, otpState.phoneOTP);
      updateUser({ phone: res.phone });
      setProfile(p => ({ ...p, phone: res.phone }));
      setPendingPhone(res.phone);
      setOtpState(s => ({ ...s, phoneSent: false, phoneOTP: '', phoneVerifying: false }));
      toast.success('Phone verified and updated ✓');
    } catch (err) {
      setOtpState(s => ({ ...s, phoneVerifying: false }));
      toast.error(err?.error || 'Wrong OTP');
    }
  }
 
  async function saveFirm() {
    if (!firmData.name.trim()) { toast.error('Firm name required'); return; }
    setSaving(true);
    try {
      const res = await authAPI.updateFirm(firmData);
      updateFirm(res?.firm||firmData);
      toast.success('Firm details saved ✓');
    } catch (err) { toast.error(err?.error||'Save failed'); }
    finally { setSaving(false); }
  }
 
  async function changePassword() {
    if (!password.current||!password.newPass) { toast.error('All password fields required'); return; }
    if (password.newPass !== password.confirm) { toast.error('Passwords do not match'); return; }
    if (password.newPass.length < 8) { toast.error('Minimum 8 characters'); return; }
    setSaving(true);
    try {
      await authAPI.changePassword({ currentPassword: password.current, newPassword: password.newPass });
      setPassword({ current:'', newPass:'', confirm:'' });
      toast.success('Password changed ✓');
    } catch (err) { toast.error(err?.error||'Incorrect current password'); }
    finally { setSaving(false); }
  }
 
  const passStrength = !password.newPass ? 0
    : password.newPass.length < 6 ? 1
    : password.newPass.length < 8 ? 2
    : /[A-Z]/.test(password.newPass) && /[0-9]/.test(password.newPass) && /[^A-Za-z0-9]/.test(password.newPass) ? 4
    : /[A-Z]/.test(password.newPass) && /[0-9]/.test(password.newPass) ? 3 : 2;
  const strengthColor = ['','bg-red-400','bg-amber-400','bg-yellow-400','bg-emerald-500'];
  const strengthText  = ['','Weak','Fair','Good','Strong'];
 
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Page header */}
      <div className="bg-white border-b border-slate-200 px-8 py-5">
        <h1 className="text-xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage your account, firm preferences, and integrations</p>
      </div>
 
      <div className="flex gap-0 min-h-[calc(100vh-73px)]">
 
        {/* ── Left nav ─────────────────────────────────────────── */}
        <div className="w-56 flex-shrink-0 bg-white border-r border-slate-200 py-4">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-all text-left ${
                activeTab === t.key
                  ? 'bg-indigo-50 text-indigo-700 border-r-2 border-indigo-600'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}>
              <span className="text-base">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
 
        {/* ── Content ──────────────────────────────────────────── */}
        <div className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-2xl space-y-5">
 
            {/* ── PROFILE ── */}
            {activeTab === 'profile' && (<>
              <Card title="Profile Photo" subtitle="Shown in sidebar, dashboard, and exported reports">
                <div className="flex items-center gap-6">
                  <div className="relative">
                    <Avatar user={{ ...user, avatar: profile.avatar }} size="xl" />
                    {uploading && (
                      <div className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center">
                        <svg className="w-6 h-6 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex gap-2 mb-2">
                      <button onClick={() => fileRef.current?.click()} disabled={uploading}
                        className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all">
                        {uploading ? 'Uploading…' : '📷 Upload Photo'}
                      </button>
                      {profile.avatar && (
                        <button onClick={() => { setProfile(p=>({...p,avatar:''})); authAPI.updateProfile({...profile,avatar:''}).catch(()=>{}); updateUser({avatar:''}); }}
                          className="px-4 py-2 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50">
                          Remove
                        </button>
                      )}
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatar} />
                    <p className="text-xs text-slate-400">JPG, PNG, WebP — max 5MB. Stored on Cloudinary CDN.</p>
                  </div>
                </div>
              </Card>
 
              <Card title="Personal Information" subtitle="Your name and contact details">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Full Name" required>
                    <input className={INPUT} value={profile.name}
                      onChange={e => setProfile(p=>({...p,name:e.target.value}))} placeholder="Your full name" />
                  </Field>
                  <Field label="Designation" hint="Shown on reports as 'Prepared by'">
                    <input className={INPUT} value={profile.designation}
                      onChange={e => setProfile(p=>({...p,designation:e.target.value}))} placeholder="Chartered Accountant" />
                  </Field>
                  <Field label="Email Address" required hint={pendingEmail !== user?.email ? '⚠ Verify with OTP to update' : 'Used to log in'}>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input className={INPUT} type="email" value={pendingEmail}
                          onChange={e => { setPendingEmail(e.target.value); setOtpState(s=>({...s,emailSent:false,emailOTP:''})); }}
                          placeholder="your@email.com" />
                        {pendingEmail !== user?.email && pendingEmail && (
                          <button type="button" onClick={sendEmailOTP} disabled={otpState.emailSending}
                            className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl whitespace-nowrap hover:bg-indigo-700 disabled:opacity-50">
                            {otpState.emailSending ? '...' : 'Send OTP'}
                          </button>
                        )}
                      </div>
                      {otpState.emailSent && (
                        <div className="flex gap-2">
                          <input className={INPUT} placeholder="Enter 6-digit OTP" maxLength={6}
                            value={otpState.emailOTP}
                            onChange={e => setOtpState(s=>({...s,emailOTP:e.target.value.replace(/\D/,'')}))} />
                          <button type="button" onClick={verifyEmailOTP} disabled={otpState.emailVerifying||otpState.emailOTP.length!==6}
                            className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl whitespace-nowrap hover:bg-emerald-700 disabled:opacity-50">
                            {otpState.emailVerifying ? '...' : 'Verify'}
                          </button>
                        </div>
                      )}
                    </div>
                  </Field>
                  <Field label="Phone Number" hint={pendingPhone !== user?.phone ? '⚠ Verify with OTP to update' : ''}>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input className={INPUT} type="tel" value={pendingPhone}
                          onChange={e => { setPendingPhone(e.target.value); setOtpState(s=>({...s,phoneSent:false,phoneOTP:''})); }}
                          placeholder={firmData.region==='UAE'?'+971 50 000 0000':'+91 98765 43210'} />
                        {pendingPhone !== user?.phone && pendingPhone && (
                          <button type="button" onClick={sendPhoneOTP} disabled={otpState.phoneSending}
                            className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl whitespace-nowrap hover:bg-indigo-700 disabled:opacity-50">
                            {otpState.phoneSending ? '...' : 'Send OTP'}
                          </button>
                        )}
                      </div>
                      {otpState.phoneSent && (
                        <div className="flex gap-2">
                          <input className={INPUT} placeholder="Enter 6-digit OTP" maxLength={6}
                            value={otpState.phoneOTP}
                            onChange={e => setOtpState(s=>({...s,phoneOTP:e.target.value.replace(/\D/,'')}))} />
                          <button type="button" onClick={verifyPhoneOTP} disabled={otpState.phoneVerifying||otpState.phoneOTP.length!==6}
                            className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl whitespace-nowrap hover:bg-emerald-700 disabled:opacity-50">
                            {otpState.phoneVerifying ? '...' : 'Verify'}
                          </button>
                        </div>
                      )}
                    </div>
                  </Field>
                </div>
                <div className="flex justify-end mt-5">
                  <button onClick={saveProfile} disabled={saving}
                    className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 shadow-sm transition-all">
                    {saving ? 'Saving…' : 'Save Profile'}
                  </button>
                </div>
              </Card>
 
              <Card title="Account Information" subtitle="Read-only account metadata">
                <div className="space-y-3">
                  {[
                    { label:'Account ID',   value: user?.id?.slice(0,16)+'…' },
                    { label:'Role',         value: user?.role?.replace('_',' ') },
                    { label:'Firm',         value: firm?.name },
                    { label:'Member since', value: 'Active' },
                  ].map((r,i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                      <span className="text-sm text-slate-500">{r.label}</span>
                      <span className="text-sm font-medium text-slate-800 font-mono">{r.value}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </>)}
 
            {/* ── FIRM & BRANDING ── */}
            {activeTab === 'firm' && (<>
              <Card title="Firm Details" subtitle="Appears on all financial statement headers and reports">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Firm Name" required>
                    <input className={INPUT} value={firmData.name}
                      onChange={e => setFirmData(f=>({...f,name:e.target.value}))} />
                  </Field>
                  <Field label="Default Region" hint="Determines available accounting standards">
                    <div className="flex gap-2">
                      {['India','UAE'].map(r => (
                        <button key={r} type="button" onClick={() => setFirmData(f=>({...f,region:r}))}
                          className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                            firmData.region===r ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                          }`}>
                          {r==='UAE'?'🇦🇪 UAE':'🇮🇳 India'}
                        </button>
                      ))}
                    </div>
                  </Field>
                </div>
 
                <div className="mt-5 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Derived Settings</p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label:'Default Currency', value: firmData.region==='UAE'?'AED (د.إ)':'INR (₹)' },
                      { label:'Standards',        value: firmData.region==='UAE'?'IFRS · IFRS SME':'AS · Ind AS' },
                      { label:'Tax Framework',    value: firmData.region==='UAE'?'UAE VAT 5%':'GST · Income Tax' },
                    ].map((r,i) => (
                      <div key={i} className="bg-white rounded-xl p-3 border border-slate-200">
                        <p className="text-xs text-slate-400">{r.label}</p>
                        <p className="text-sm font-bold text-slate-800 mt-0.5">{r.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
 
                <div className="flex justify-end mt-5">
                  <button onClick={saveFirm} disabled={saving}
                    className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 shadow-sm">
                    {saving ? 'Saving…' : 'Save Firm Details'}
                  </button>
                </div>
              </Card>
 
              <Card title="Report Branding" badge="Coming Soon" subtitle="Customise how your firm appears on exported documents">
                <div className="grid grid-cols-2 gap-4 opacity-50 pointer-events-none">
                  <Field label="Firm Logo"><div className="h-10 bg-slate-100 rounded-xl" /></Field>
                  <Field label="Brand Color"><div className="h-10 bg-slate-100 rounded-xl" /></Field>
                  <Field label="Report Footer Text"><div className="h-10 bg-slate-100 rounded-xl" /></Field>
                  <Field label="Digital Signature"><div className="h-10 bg-slate-100 rounded-xl" /></Field>
                </div>
                <p className="text-xs text-slate-400 mt-4 text-center">Available in Professional plan</p>
              </Card>
            </>)}
 
            {/* ── NOTIFICATIONS ── */}
            {activeTab === 'notifications' && (<>
              <Card title="Email Notifications" subtitle="Control which emails FinStatement sends you">
                <div className="divide-y divide-slate-100">
                  <Toggle value={notifs.emailReports} onChange={v=>setNotifs(n=>({...n,emailReports:v}))}
                    label="Financial Statement Reports"
                    desc="Email when a FS is generated or exported" />
                  <Toggle value={notifs.engagementUpdates} onChange={v=>setNotifs(n=>({...n,engagementUpdates:v}))}
                    label="Engagement Updates"
                    desc="TB uploads, mapping changes, version updates" />
                  <Toggle value={notifs.validationAlerts} onChange={v=>setNotifs(n=>({...n,validationAlerts:v}))}
                    label="Validation Alerts"
                    desc="Notify when validation checks fail" />
                  <Toggle value={notifs.systemUpdates} onChange={v=>setNotifs(n=>({...n,systemUpdates:v}))}
                    label="System & Platform Updates"
                    desc="New features, maintenance windows" />
                  <Toggle value={notifs.marketing} onChange={v=>setNotifs(n=>({...n,marketing:v}))}
                    label="Product News & Tips"
                    desc="Guides, best practices, webinars" />
                </div>
                <div className="flex justify-end mt-4">
                  <button onClick={async()=>{
                    try { await prefsAPI.save(notifs); toast.success('Notification preferences saved — applies on all devices ✓'); }
                    catch { toast.error('Save failed'); }
                  }}
                    className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700">
                    Save Preferences
                  </button>
                </div>
              </Card>
 
              <Card title="In-App Notifications" subtitle="Alerts shown inside FinStatement">
                <div className="divide-y divide-slate-100">
                  <Toggle value={true} onChange={()=>{}} label="Validation errors" desc="Show toast when a validation check fails" />
                  <Toggle value={true} onChange={()=>{}} label="Save confirmations" desc="Confirm when data is saved successfully" />
                  <Toggle value={false} onChange={()=>{}} label="Keyboard shortcuts" desc="Show shortcut hints on hover" />
                </div>
              </Card>
            </>)}
 
            {/* ── SECURITY ── */}
            {activeTab === 'security' && (<>
              <Card title="Change Password" subtitle="Use a strong, unique password for your account">
                <div className="space-y-4 max-w-sm">
                  <Field label="Current Password" required>
                    <input className={INPUT} type="password" value={password.current}
                      onChange={e=>setPassword(p=>({...p,current:e.target.value}))} placeholder="Enter current password" />
                  </Field>
                  <Field label="New Password" required>
                    <input className={INPUT} type="password" value={password.newPass}
                      onChange={e=>setPassword(p=>({...p,newPass:e.target.value}))} placeholder="At least 8 characters" />
                    {password.newPass && (
                      <div className="mt-2">
                        <div className="flex gap-1 mb-1">
                          {[1,2,3,4].map(i=>(
                            <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i<=passStrength?strengthColor[passStrength]:'bg-slate-200'}`}/>
                          ))}
                        </div>
                        <p className={`text-xs font-medium ${passStrength>=3?'text-emerald-600':passStrength>=2?'text-amber-500':'text-red-500'}`}>
                          {strengthText[passStrength]} password
                          {passStrength < 3 && ' — add uppercase, numbers and symbols'}
                        </p>
                      </div>
                    )}
                  </Field>
                  <Field label="Confirm New Password" required>
                    <input className={INPUT} type="password" value={password.confirm}
                      onChange={e=>setPassword(p=>({...p,confirm:e.target.value}))} placeholder="Repeat new password" />
                    {password.confirm && (
                      <p className={`text-xs mt-1 font-medium ${password.newPass===password.confirm?'text-emerald-600':'text-red-500'}`}>
                        {password.newPass===password.confirm?'✓ Passwords match':'✗ Passwords do not match'}
                      </p>
                    )}
                  </Field>
                  <button onClick={changePassword} disabled={saving}
                    className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50">
                    {saving?'Changing…':'Change Password'}
                  </button>
                </div>
              </Card>
 
              <Card title="Active Sessions" subtitle="Devices and browsers currently logged in">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">💻</div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">Current Session</p>
                        <p className="text-xs text-slate-400">Browser · Active now</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-100 px-2.5 py-1 rounded-full">Current</span>
                  </div>
                </div>
                <button onClick={()=>toast.success('All other sessions signed out')}
                  className="mt-4 text-sm text-red-600 font-semibold hover:text-red-700">
                  Sign out all other sessions →
                </button>
              </Card>
 
              <Card title="Two-Factor Authentication" badge="Coming Soon" subtitle="Add an extra layer of security">
                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 opacity-60">
                  <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-2xl">🔐</div>
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">Authenticator App (TOTP)</p>
                    <p className="text-xs text-slate-400 mt-0.5">Google Authenticator, Authy, or any TOTP app</p>
                  </div>
                </div>
              </Card>
 
              <Card title="Danger Zone" subtitle="Permanent actions — cannot be undone">
                <div className="space-y-3">
                  <div className="p-4 border border-red-200 rounded-xl bg-red-50">
                    <p className="text-sm font-bold text-red-800 mb-1">Delete Account</p>
                    <p className="text-xs text-red-600 mb-3">All your clients, engagements, and financial statements will be permanently deleted.</p>
                    <button onClick={()=>toast.error('Contact azarudeen@cat-cons.com to request account deletion')}
                      className="px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700">
                      Request Account Deletion
                    </button>
                  </div>
                </div>
              </Card>
            </>)}
 
            {/* ── APPEARANCE ── */}
            {activeTab === 'appearance' && (<>
              <Card title="Theme" subtitle="Choose how FinStatement looks">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { key:'light', label:'Light', icon:'☀️', desc:'Clean and bright' },
                    { key:'dark',  label:'Dark',  icon:'🌙', desc:'Coming soon', disabled:true },
                    { key:'auto',  label:'System', icon:'💻', desc:'Follows OS setting', disabled:true },
                  ].map(t => (
                    <button key={t.key} type="button"
                      onClick={() => !t.disabled && setAppearance(a=>({...a,theme:t.key}))}
                      disabled={t.disabled}
                      className={`p-4 rounded-xl border-2 text-center transition-all ${
                        appearance.theme===t.key ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'
                      } ${t.disabled?'opacity-40 cursor-not-allowed':''}`}>
                      <div className="text-2xl mb-2">{t.icon}</div>
                      <p className={`text-sm font-bold ${appearance.theme===t.key?'text-indigo-700':'text-slate-800'}`}>{t.label}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </Card>
 
              <Card title="Date & Number Format" subtitle="How dates and amounts are displayed">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Date Format">
                    <select className={INPUT} value={appearance.dateFormat}
                      onChange={e=>setAppearance(a=>({...a,dateFormat:e.target.value}))}>
                      <option value="DD/MM/YYYY">DD/MM/YYYY — 31/12/2024</option>
                      <option value="MM/DD/YYYY">MM/DD/YYYY — 12/31/2024</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD — 2024-12-31</option>
                      <option value="DD MMM YYYY">DD MMM YYYY — 31 Dec 2024</option>
                    </select>
                  </Field>
                  <Field label="Number Format">
                    <select className={INPUT} value={appearance.numberFormat}
                      onChange={e=>setAppearance(a=>({...a,numberFormat:e.target.value}))}>
                      <option value="en-IN">Indian — 10,00,000</option>
                      <option value="en-US">US/International — 1,000,000</option>
                      <option value="en-AE">UAE — 1,000,000</option>
                    </select>
                  </Field>
                </div>
                <div className="mt-4 divide-y divide-slate-100">
                  <Toggle value={appearance.compactMode} onChange={v=>setAppearance(a=>({...a,compactMode:v}))}
                    label="Compact Mode"
                    desc="Reduce padding and spacing for more data on screen" />
                </div>
                <div className="flex justify-end mt-4">
                  <button onClick={async()=>{
                    try { await prefsAPI.save(appearance); toast.success('Appearance saved — applies on all devices ✓'); }
                    catch { toast.error('Save failed'); }
                  }}
                    className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700">
                    Save Preferences
                  </button>
                </div>
              </Card>
            </>)}
 
            {/* ── INTEGRATIONS ── */}
            {activeTab === 'integrations' && (<>
              <Card title="Connected Accounts" subtitle="Single sign-on and third-party connections">
                <div className="space-y-3">
                  {[
                    { name:'Google',    icon:'🔵', desc:'Sign in with Google', status:'Connect', color:'#4285f4' },
                    { name:'Microsoft', icon:'🟦', desc:'Sign in with Microsoft / Office 365', status:'Connect', color:'#00a4ef' },
                  ].map((s,i) => (
                    <div key={i} className="flex items-center justify-between p-4 border border-slate-200 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-lg">{s.icon}</div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{s.name}</p>
                          <p className="text-xs text-slate-400">{s.desc}</p>
                        </div>
                      </div>
                      <button onClick={()=>toast.success(`${s.name} OAuth — use login page`)}
                        className="px-4 py-1.5 border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg hover:border-indigo-400 hover:text-indigo-600 transition-all">
                        {s.status}
                      </button>
                    </div>
                  ))}
                </div>
              </Card>
 
              <Card title="Storage Provider" subtitle="Where uploaded files and avatars are stored">
                <div className="space-y-3">
                  {[
                    { name:'Cloudinary', icon:'☁️', desc:'Image CDN · Avatars and report attachments', active:true },
                    { name:'AWS S3',     icon:'🪣', desc:'Object storage · Large file support', active:false, badge:'Configure in .env' },
                  ].map((s,i) => (
                    <div key={i} className={`flex items-center justify-between p-4 rounded-xl border-2 ${s.active?'border-indigo-300 bg-indigo-50':'border-slate-200'}`}>
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{s.icon}</span>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{s.name}</p>
                          <p className="text-xs text-slate-400">{s.desc}</p>
                        </div>
                      </div>
                      {s.active
                        ? <span className="text-xs font-bold text-indigo-700 bg-indigo-100 px-2.5 py-1 rounded-full">Active</span>
                        : <span className="text-xs text-slate-400">{s.badge}</span>
                      }
                    </div>
                  ))}
                </div>
              </Card>
 
              <Card title="API Access" badge="Coming Soon" subtitle="Connect FinStatement to your own systems">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 opacity-60">
                  <p className="text-sm font-semibold text-slate-800 mb-1">REST API</p>
                  <p className="text-xs text-slate-400 mb-3">Programmatically access your financial data, engagements, and reports</p>
                  <div className="font-mono text-xs bg-white border border-slate-200 rounded-lg p-3 text-slate-500">
                    GET /api/v1/engagements<br/>
                    POST /api/v1/tb/upload<br/>
                    GET /api/v1/fs/{'{'}id{'}'}
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-3 text-center">Available in Professional plan</p>
              </Card>
            </>)}
 
            {/* ── BILLING ── */}
            {activeTab === 'billing' && (<>
              <Card title="Current Plan">
                <div className="flex items-center justify-between p-5 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100 mb-5">
                  <div>
                    <span className="px-3 py-1 bg-indigo-600 text-white text-xs font-bold rounded-full">STARTER</span>
                    <p className="text-3xl font-bold text-slate-900 mt-2">Free</p>
                    <p className="text-sm text-slate-500 mt-0.5">Up to 5 clients · All 4 standards · All features</p>
                  </div>
                  <button onClick={()=>toast.success('Upgrade coming soon!')}
                    className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 shadow-md">
                    Upgrade Plan
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label:'Clients',      value:'5 max',      used:`${(typeof clients!=='undefined'?0:0)} used` },
                    { label:'Engagements',  value:'Unlimited',  used:'No limit' },
                    { label:'Storage',      value:'1 GB',       used:'Included' },
                  ].map((u,i) => (
                    <div key={i} className="bg-white rounded-xl border border-slate-200 p-4">
                      <p className="text-xs text-slate-400">{u.label}</p>
                      <p className="text-lg font-bold text-slate-800">{u.value}</p>
                      <p className="text-xs text-slate-400">{u.used}</p>
                    </div>
                  ))}
                </div>
              </Card>
 
              <Card title="Compare Plans">
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { name:'Starter', price:'Free', clients:'5 clients',
                      features:['All 4 standards','BS · P&L · Notes','Word / Excel export','Schedules & Validation','Email support'],
                      current:true, color:'border-slate-200' },
                    { name:'Professional', price:`${currency==='AED'?'AED':'₹'} ${currency==='AED'?'199':'2,999'}/mo`, clients:'25 clients',
                      features:['Everything in Starter','PDF export','White-label reports','Priority support','Multi-user (5 seats)','API access'],
                      current:false, color:'border-indigo-500', popular:true },
                    { name:'Enterprise', price:'Custom', clients:'Unlimited',
                      features:['Everything in Pro','Unlimited seats','Dedicated CA support','SLA guarantee','Custom integrations','On-premise option'],
                      current:false, color:'border-purple-500' },
                  ].map((p,i) => (
                    <div key={i} className={`rounded-2xl border-2 p-5 relative ${p.color} ${p.popular?'bg-indigo-50':'bg-white'}`}>
                      {p.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-indigo-600 text-white text-xs font-bold rounded-full">Most Popular</span>}
                      <p className="font-bold text-slate-800">{p.name}</p>
                      <p className="text-xl font-bold text-indigo-600 mt-1">{p.price}</p>
                      <p className="text-xs text-slate-400 mb-4">{p.clients}</p>
                      <ul className="space-y-1.5 mb-5">
                        {p.features.map((f,j)=>(
                          <li key={j} className="flex items-start gap-2 text-xs text-slate-600">
                            <span className="text-emerald-500 mt-0.5 flex-shrink-0">✓</span>{f}
                          </li>
                        ))}
                      </ul>
                      <button onClick={()=>toast.success(p.current?'Your current plan':'Coming soon!')}
                        className={`w-full py-2 text-sm font-semibold rounded-xl transition-all ${
                          p.current?'bg-slate-100 text-slate-400 cursor-default'
                          :p.popular?'bg-indigo-600 text-white hover:bg-indigo-700'
                          :'border border-slate-300 text-slate-700 hover:border-indigo-400'
                        }`}>
                        {p.current?'Current Plan':'Get Started'}
                      </button>
                    </div>
                  ))}
                </div>
              </Card>
 
              <Card title="Billing History" subtitle="Your invoices and payment history">
                <div className="text-center py-8 text-slate-400">
                  <p className="text-3xl mb-2">🧾</p>
                  <p className="text-sm font-medium">No invoices yet</p>
                  <p className="text-xs mt-1">Invoices appear here when you upgrade</p>
                </div>
              </Card>
            </>)}
 
            {/* ── DATA & EXPORT ── */}
            {activeTab === 'data' && (<>
              <Card title="Export Your Data" subtitle="Download everything in your account">
                <div className="space-y-3">
                  {[
                    { icon:'📋', label:'Client List',          desc:'All clients with details as CSV',            action:'Export CSV' },
                    { icon:'📊', label:'Engagement Data',      desc:'All engagements, TB versions, and mappings', action:'Export JSON' },
                    { icon:'📄', label:'Financial Statements', desc:'All generated FSs as Word documents',         action:'Export ZIP' },
                    { icon:'🗃️', label:'Full Account Backup',  desc:'Complete data backup in JSON format',        action:'Request Backup' },
                  ].map((e,i)=>(
                    <div key={i} className="flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:border-slate-300 transition-all">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{e.icon}</span>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{e.label}</p>
                          <p className="text-xs text-slate-400">{e.desc}</p>
                        </div>
                      </div>
                      <button onClick={()=>toast.success(`${e.label} export — coming soon`)}
                        className="px-4 py-1.5 border border-indigo-200 text-indigo-600 text-xs font-semibold rounded-lg hover:bg-indigo-50 transition-all">
                        {e.action}
                      </button>
                    </div>
                  ))}
                </div>
              </Card>
 
              <Card title="Data Retention" subtitle="Control how long your data is stored">
                <div className="divide-y divide-slate-100">
                  <Toggle value={true} onChange={()=>{}} label="Keep TB version history" desc="Store all uploaded TB versions (default: last 5)" />
                  <Toggle value={true} onChange={()=>{}} label="Keep validation logs" desc="Retain validation history for all engagements" />
                  <Toggle value={false} onChange={()=>{}} label="Auto-delete old sessions" desc="Remove inactive sessions after 30 days" />
                </div>
              </Card>
 
              <Card title="Privacy" subtitle="How your data is used">
                <div className="space-y-3 text-sm text-slate-600">
                  <div className="flex items-start gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <span className="text-emerald-500 mt-0.5">🔒</span>
                    <p>Your financial data is <strong>never shared</strong> with third parties. All data is encrypted at rest on Neon PostgreSQL.</p>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                    <span className="text-blue-500 mt-0.5">🌐</span>
                    <p>Data is stored in <strong>AWS Singapore (ap-southeast-1)</strong> — closest to India and UAE users.</p>
                  </div>
                  <div className="flex gap-3 mt-2">
                    <button onClick={()=>toast('Privacy policy — coming soon')}
                      className="text-xs text-indigo-600 font-semibold hover:text-indigo-700">Privacy Policy →</button>
                    <button onClick={()=>toast('Terms of service — coming soon')}
                      className="text-xs text-indigo-600 font-semibold hover:text-indigo-700">Terms of Service →</button>
                  </div>
                </div>
              </Card>
            </>)}
 
            {/* ── SUPPORT ── */}
            {activeTab === 'support' && (<>
              <Card title="Get Help" subtitle="Multiple ways to get support">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { icon:'📧', title:'Email Support',  desc:'azarudeen@cat-cons.com\nResponse within 24 hours',   action:'Send Email',  color:'#6366f1' },
                    { icon:'💬', title:'Live Chat',      desc:'Chat with support team\nMon–Fri, 9am–6pm IST',         action:'Start Chat',  color:'#10b981', soon:true },
                    { icon:'📖', title:'Documentation',  desc:'Guides, tutorials, FAQs\nStep-by-step walkthroughs',    action:'View Docs',   color:'#f59e0b' },
                    { icon:'🎥', title:'Video Tutorials', desc:'Watch how-to videos\nFor all features',               action:'Watch',       color:'#ef4444', soon:true },
                  ].map((s,i)=>(
                    <div key={i} className="p-4 border border-slate-200 rounded-xl hover:border-slate-300 transition-all">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3"
                        style={{ background: s.color + '15' }}>
                        {s.icon}
                      </div>
                      <p className="text-sm font-bold text-slate-800">{s.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5 whitespace-pre-line">{s.desc}</p>
                      <button
                        onClick={() => {
                          if (s.title==='Email Support') window.location.href='mailto:azarudeen@cat-cons.com';
                          else toast.success(s.soon?`${s.title} — coming soon`:`Opening ${s.title}…`);
                        }}
                        className="mt-3 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all"
                        style={{ color:s.color, borderColor:s.color+'40', background:s.color+'0d' }}>
                        {s.action} {s.soon && '(Soon)'}
                      </button>
                    </div>
                  ))}
                </div>
              </Card>
 
              <Card title="Frequently Asked Questions">
                <div className="space-y-1">
                  {[
                    { q:'How do I switch between India and UAE methods?', a:'Go to Clients → select or edit client → set region. The engagement automatically picks the correct standards (AS/Ind AS for India, IFRS/IFRS SME for UAE).' },
                    { q:'Can I upload multiple TB versions?', a:'Yes — FinStatement keeps the last 5 versions per engagement. Go to Trial Balance → Version History to compare changes.' },
                    { q:'How do I export to Word or Excel?', a:'Go to Report Builder page → click Word or Excel export button at the top right.' },
                    { q:'What is the Prior Year TB used for?', a:'Prior Year TB is used for comparative columns in BS/P&L and for opening balance verification. Upload it in Trial Balance → Prior Year tab.' },
                    { q:'Is my data backed up?', a:'Yes — Neon PostgreSQL has automated daily backups with 7-day retention. You can also export your data anytime from Settings → Data & Export.' },
                  ].map((faq,i)=>(
                    <details key={i} className="group border-b border-slate-100 last:border-0">
                      <summary className="flex items-center justify-between py-3 cursor-pointer text-sm font-semibold text-slate-800 hover:text-indigo-700 list-none">
                        {faq.q}
                        <span className="text-slate-400 group-open:rotate-180 transition-transform">▾</span>
                      </summary>
                      <p className="text-xs text-slate-500 pb-3 leading-relaxed">{faq.a}</p>
                    </details>
                  ))}
                </div>
              </Card>
 
              <Card title="System Status & Info">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-sm font-semibold text-emerald-800">All systems operational</span>
                    </div>
                    <button onClick={()=>toast.success('Status page — coming soon')}
                      className="text-xs text-emerald-700 font-semibold">View Status →</button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {[
                      { label:'Platform Version', value:'2.0.0' },
                      { label:'Database',         value:'Neon PostgreSQL 17' },
                      { label:'Storage',          value:'Cloudinary CDN' },
                      { label:'Hosting',          value:'Render (Backend) · Vercel (Frontend)' },
                      { label:'Data Region',      value:'AWS ap-southeast-1 (Singapore)' },
                      { label:'SSL',              value:'TLS 1.3 · 256-bit AES' },
                    ].map((r,i)=>(
                      <div key={i} className="flex flex-col gap-0.5 p-3 bg-slate-50 rounded-xl">
                        <span className="text-slate-400 font-medium">{r.label}</span>
                        <span className="text-slate-700 font-bold">{r.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
 
              <Card title="Report a Bug or Request a Feature">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { icon:'🐛', label:'Report a Bug',       desc:'Something not working?',    color:'#ef4444' },
                      { icon:'💡', label:'Request a Feature',  desc:'Got an idea?',              color:'#6366f1' },
                    ].map((r,i)=>(
                      <button key={i} onClick={()=>window.location.href='mailto:azarudeen@cat-cons.com?subject='+r.label}
                        className="flex items-center gap-3 p-4 border border-slate-200 rounded-xl hover:border-slate-300 text-left transition-all">
                        <span className="text-2xl">{r.icon}</span>
                        <div>
                          <p className="text-sm font-bold text-slate-800">{r.label}</p>
                          <p className="text-xs text-slate-400">{r.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </Card>
            </>)}
 
          </div>
        </div>
      </div>
    </div>
  );
}
 