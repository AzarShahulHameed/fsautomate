import React, { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../api/client';
import { useStore } from '../store';
import toast from 'react-hot-toast';
 
const BG_IMAGES = [
  'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1920&q=85&fit=crop',
  'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1920&q=85&fit=crop',
  'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=1920&q=85&fit=crop',
];
 
const REGION_CONFIG = {
  India: {
    flag: '🇮🇳', methods: ['AS', 'IND_AS'], currency: 'INR',
    methodLabels: { AS: 'AS — Companies Act 2013', IND_AS: 'Ind AS — IFRS Converged' },
    phonePlaceholder: '+91 98765 43210',
  },
  UAE: {
    flag: '🇦🇪', methods: ['IFRS', 'IFRS_SME'], currency: 'AED',
    methodLabels: { IFRS: 'IFRS — Full Standards', IFRS_SME: 'IFRS SME — Simplified' },
    phonePlaceholder: '+971 50 000 0000',
  },
};
 
const INPUT = "w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all";
 
export default function Register() {
  const navigate    = useNavigate();
  const { setAuth } = useStore();
  const fileRef     = useRef();
 
  const [step,    setStep]    = useState(0);
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [bgIdx,   setBgIdx]   = useState(0);
  const [fading,  setFading]  = useState(false);
  const [preview, setPreview] = useState(null);
 
  const [form, setForm] = useState({
    firmName: '', region: 'India', method: 'AS',
    name: '', email: '', password: '', confirmPass: '',
    phone: '', designation: '', avatar: '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const cfg = REGION_CONFIG[form.region];
 
  // Rotate background
  React.useEffect(() => {
    const t = setInterval(() => {
      setFading(true);
      setTimeout(() => { setBgIdx(p => (p + 1) % BG_IMAGES.length); setFading(false); }, 700);
    }, 4000);
    return () => clearInterval(t);
  }, []);
 
  function handleAvatar(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Image must be under 2MB'); return; }
    const reader = new FileReader();
    reader.onload = ev => { setPreview(ev.target.result); set('avatar', ev.target.result); };
    reader.readAsDataURL(file);
  }
 
  function handleRegion(r) {
    set('region', r);
    set('method', REGION_CONFIG[r].methods[0]);
  }
 
  async function nextStep(e) {
    e.preventDefault();
    if (step === 0) {
      if (!form.firmName.trim()) { toast.error('Firm name is required'); return; }
      setStep(1);
    } else {
      if (!form.name || !form.email || !form.password) { toast.error('All fields required'); return; }
      if (form.password !== form.confirmPass) { toast.error('Passwords do not match'); return; }
      if (form.password.length < 8) { toast.error('Minimum 8 characters'); return; }
      setLoading(true);
      try {
        const slug = form.firmName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        await authAPI.register({
          firmName: form.firmName, firmSlug: slug,
          region: form.region, method: form.method,
          name: form.name, email: form.email, password: form.password,
          phone: form.phone, designation: form.designation, avatar: form.avatar,
        });
        const res = await authAPI.login({ email: form.email, password: form.password });
        setAuth(res.token, res.user, res.firm);
        setStep(2);
        setTimeout(() => navigate('/'), 2000);
      } catch (err) {
        toast.error(err?.error || 'Registration failed');
      } finally { setLoading(false); }
    }
  }
 
  const passStrength = form.password.length === 0 ? 0
    : form.password.length < 6 ? 1
    : form.password.length < 8 ? 2
    : form.password.match(/[A-Z]/) && form.password.match(/[0-9]/) ? 4 : 3;
 
  const strengthColor = ['', 'bg-red-400', 'bg-amber-400', 'bg-yellow-400', 'bg-emerald-500'];
  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'];
 
  return (
    <div className="min-h-screen flex overflow-hidden">
 
      {/* ── LEFT: Background ─────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:flex-1 relative overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center transition-all duration-700"
          style={{ backgroundImage: `url(${BG_IMAGES[bgIdx]})`, opacity: fading ? 0 : 1 }} />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/85 via-slate-800/65 to-indigo-900/75" />
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
 
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-white">
                <path d="M3 3h18v4H3V3zm0 7h12v4H3v-4zm0 7h8v4H3v-4z" fill="currentColor" opacity="0.9"/>
              </svg>
            </div>
            <div>
              <p className="text-white font-bold text-lg tracking-tight leading-none">FinStatement</p>
              <p className="text-white/50 text-xs tracking-widest uppercase">Professional</p>
            </div>
          </div>
 
          {/* Value props */}
          <div>
            <h2 className="text-4xl font-bold text-white mb-4 leading-tight">
              Start generating<br />financial statements<br />in minutes
            </h2>
            <div className="space-y-3">
              {[
                { icon: '✓', text: 'Free to start — no credit card required' },
                { icon: '✓', text: 'AS, Ind AS, IFRS and IFRS SME supported' },
                { icon: '✓', text: 'India and UAE compliance built-in' },
                { icon: '✓', text: 'Export to Word and Excel instantly' },
              ].map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center flex-shrink-0">
                    <span className="text-emerald-400 text-xs font-bold">{p.icon}</span>
                  </div>
                  <p className="text-white/80 text-sm">{p.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
 
      {/* ── RIGHT: Register Panel ─────────────────────────────────────── */}
      <div className="w-full lg:w-[520px] flex-shrink-0 flex flex-col justify-center px-8 md:px-12 bg-gradient-to-br from-slate-50 to-blue-50/40 overflow-y-auto py-10">
        <div className="relative max-w-sm mx-auto w-full">
 
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-white">
                <path d="M3 3h18v4H3V3zm0 7h12v4H3v-4zm0 7h8v4H3v-4z" fill="currentColor"/>
              </svg>
            </div>
            <p className="text-slate-900 font-bold text-lg">FinStatement</p>
          </div>
 
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900 mb-1">Create your account</h1>
            <p className="text-slate-500 text-sm">Get started in under 2 minutes</p>
          </div>
 
          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-7">
            {['Firm Setup', 'Your Profile', 'Done'].map((s, i) => (
              <React.Fragment key={s}>
                <div className="flex items-center gap-1.5">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    i < step ? 'bg-indigo-600 text-white' :
                    i === step ? 'bg-indigo-600 text-white ring-2 ring-indigo-300' :
                    'bg-slate-200 text-slate-400'
                  }`}>
                    {i < step ? '✓' : i + 1}
                  </div>
                  <span className={`text-xs font-medium hidden sm:block ${i <= step ? 'text-indigo-600' : 'text-slate-400'}`}>{s}</span>
                </div>
                {i < 2 && <div className={`flex-1 h-px ${i < step ? 'bg-indigo-400' : 'bg-slate-200'}`} />}
              </React.Fragment>
            ))}
          </div>
 
          {/* ── STEP 0: Firm Setup ── */}
          {step === 0 && (
            <form onSubmit={nextStep} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Practice Region</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(REGION_CONFIG).map(([r, rc]) => (
                    <button key={r} type="button" onClick={() => handleRegion(r)}
                      className={`flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all ${
                        form.region === r
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}>
                      <span className="text-2xl">{rc.flag}</span>
                      <div>
                        <p className={`text-sm font-bold ${form.region === r ? 'text-indigo-700' : 'text-slate-800'}`}>{r}</p>
                        <p className="text-xs text-slate-400">{rc.currency}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
 
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Firm / Practice Name</label>
                <input required value={form.firmName}
                  onChange={e => set('firmName', e.target.value)}
                  className={INPUT}
                  placeholder={form.region === 'UAE' ? 'XYZ Audit LLC' : 'M/s XYZ & Associates'} />
              </div>
 
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Accounting Standard</label>
                <div className="grid grid-cols-2 gap-2">
                  {cfg.methods.map(m => (
                    <button key={m} type="button" onClick={() => set('method', m)}
                      className={`py-3 px-3 rounded-xl text-left border-2 transition-all ${
                        form.method === m
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}>
                      <p className={`text-sm font-bold ${form.method === m ? 'text-indigo-700' : 'text-slate-800'}`}>{m}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{cfg.methodLabels[m]}</p>
                    </button>
                  ))}
                </div>
              </div>
 
              <button type="submit"
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-xl transition-all shadow-md shadow-indigo-500/20">
                Continue →
              </button>
 
              <p className="text-center text-sm text-slate-500">
                Already have an account?{' '}
                <Link to="/login" className="text-indigo-600 font-semibold hover:text-indigo-700">Sign in</Link>
              </p>
            </form>
          )}
 
          {/* ── STEP 1: Profile ── */}
          {step === 1 && (
            <form onSubmit={nextStep} className="space-y-4">
              <button type="button" onClick={() => setStep(0)}
                className="flex items-center gap-1.5 text-slate-400 hover:text-slate-700 text-sm mb-1 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
                </svg>
                Back
              </button>
 
              {/* Avatar */}
              <div className="flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-200">
                <div className="w-16 h-16 rounded-xl overflow-hidden border-2 border-slate-200 bg-slate-100 flex items-center justify-center cursor-pointer hover:border-indigo-400 transition-all flex-shrink-0"
                  onClick={() => fileRef.current?.click()}>
                  {preview
                    ? <img src={preview} alt="Avatar" className="w-full h-full object-cover" />
                    : <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                      </svg>
                  }
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">Profile Photo</p>
                  <p className="text-xs text-slate-400 mt-0.5">JPG or PNG, max 2MB</p>
                  <button type="button" onClick={() => fileRef.current?.click()}
                    className="text-xs text-indigo-600 font-medium mt-1 hover:text-indigo-700">
                    Upload photo
                  </button>
                </div>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatar} className="hidden" />
              </div>
 
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Full Name *</label>
                  <input required value={form.name} onChange={e => set('name', e.target.value)}
                    className={INPUT} placeholder="Your full name" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Designation</label>
                  <input value={form.designation} onChange={e => set('designation', e.target.value)}
                    className={INPUT} placeholder="Partner / Manager" />
                </div>
              </div>
 
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email Address *</label>
                <input required type="email" value={form.email} onChange={e => set('email', e.target.value)}
                  className={INPUT} placeholder="you@yourfirm.com" />
              </div>
 
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Phone Number</label>
                <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
                  className={INPUT} placeholder={cfg.phonePlaceholder} />
              </div>
 
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Password *</label>
                <div className="relative">
                  <input required type={showPass ? 'text' : 'password'}
                    value={form.password} onChange={e => set('password', e.target.value)}
                    className={INPUT + ' pr-10'} placeholder="Minimum 8 characters" />
                  <button type="button" onClick={() => setShowPass(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPass
                      ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21"/></svg>
                      : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                    }
                  </button>
                </div>
                {form.password.length > 0 && (
                  <div className="mt-2">
                    <div className="flex gap-1 mb-1">
                      {[1,2,3,4].map(i => (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= passStrength ? strengthColor[passStrength] : 'bg-slate-200'}`}/>
                      ))}
                    </div>
                    <p className={`text-xs ${passStrength >= 3 ? 'text-emerald-600' : passStrength >= 2 ? 'text-amber-500' : 'text-red-500'}`}>
                      {strengthLabel[passStrength]} password
                    </p>
                  </div>
                )}
              </div>
 
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Confirm Password *</label>
                <input required type="password" value={form.confirmPass}
                  onChange={e => set('confirmPass', e.target.value)}
                  className={INPUT} placeholder="Repeat your password" />
                {form.confirmPass && form.password !== form.confirmPass && (
                  <p className="text-red-500 text-xs mt-1">Passwords do not match</p>
                )}
                {form.confirmPass && form.password === form.confirmPass && form.confirmPass.length > 0 && (
                  <p className="text-emerald-600 text-xs mt-1">✓ Passwords match</p>
                )}
              </div>
 
              <button type="submit" disabled={loading}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-xl transition-all shadow-md shadow-indigo-500/20 disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Creating account...
                  </>
                ) : 'Create Account'}
              </button>
 
              <p className="text-center text-sm text-slate-500">
                Already have an account?{' '}
                <Link to="/login" className="text-indigo-600 font-semibold hover:text-indigo-700">Sign in</Link>
              </p>
            </form>
          )}
 
          {/* ── STEP 2: Success ── */}
          {step === 2 && (
            <div className="text-center py-10">
              <div className="w-20 h-20 rounded-2xl bg-emerald-100 border-2 border-emerald-200 flex items-center justify-center mx-auto mb-5">
                <svg className="w-10 h-10 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Welcome to FinStatement!</h2>
              <p className="text-slate-500 text-sm">Account created for <span className="font-semibold text-indigo-600">{form.firmName}</span></p>
              <p className="text-slate-400 text-xs mt-2">Taking you to your dashboard...</p>
              <div className="mt-5 w-full bg-slate-200 rounded-full h-1 overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full animate-pulse" style={{ width: '70%' }}/>
              </div>
            </div>
          )}
 
          {/* Security note */}
          {step < 2 && (
            <div className="flex items-center justify-center gap-2 mt-6 text-xs text-slate-400">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
              </svg>
              256-bit SSL encrypted · Your data is safe
            </div>
          )}
        </div>
      </div>
    </div>
  );
}