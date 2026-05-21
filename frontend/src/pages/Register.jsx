import React, { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../api/client';
import { useStore } from '../store';
import toast from 'react-hot-toast';

const REGION_CONFIG = {
  India: {
    flag: '🇮🇳', methods: ['AS', 'IND_AS'], currency: 'INR',
    methodLabels: { AS: 'AS — Companies Act 2013', IND_AS: 'Ind AS — IFRS-converged' },
  },
  UAE: {
    flag: '🇦🇪', methods: ['IFRS', 'IFRS_SME'], currency: 'AED',
    methodLabels: { IFRS: 'IFRS — Full Standards', IFRS_SME: 'IFRS SME — Simplified' },
  },
};

export default function Register() {
  const [step, setStep]       = useState(0);
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const fileRef = useRef();
  const { setAuth } = useStore();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    firmName: '', firmSlug: '', region: 'India', method: 'AS',
    name: '', email: '', password: '', confirmPassword: '',
    phone: '', designation: '', avatar: '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const regionCfg = REGION_CONFIG[form.region];

  // Avatar upload — convert to base64
  function handleAvatar(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Image must be under 2MB'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setAvatarPreview(ev.target.result);
      set('avatar', ev.target.result);
    };
    reader.readAsDataURL(file);
  }

  // Region change → reset method to first available
  function handleRegionChange(region) {
    set('region', region);
    set('method', REGION_CONFIG[region].methods[0]);
  }

  const nextStep = (e) => {
    e.preventDefault();
    if (step === 0) {
      if (!form.firmName) { toast.error('Firm name is required'); return; }
      set('firmSlug', form.firmName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''));
      setStep(1);
    } else if (step === 1) {
      if (!form.name || !form.email || !form.password) { toast.error('All fields required'); return; }
      if (form.password !== form.confirmPassword) { toast.error('Passwords do not match'); return; }
      if (form.password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
      submit();
    }
  };

  async function submit() {
    setLoading(true);
    try {
      await authAPI.register({
        firmName: form.firmName, firmSlug: form.firmSlug,
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
      setStep(1);
    } finally { setLoading(false); }
  }

  const glassInput = "w-full px-4 py-3 rounded-xl text-sm text-white placeholder-slate-500 outline-none transition-all bg-white/[0.07] border border-white/[0.12] focus:border-indigo-500/70 focus:bg-white/[0.10]";
  const glassSelect = "w-full px-4 py-3 rounded-xl text-sm text-white outline-none transition-all bg-white/[0.07] border border-white/[0.12] focus:border-indigo-500/70 [&>option]:bg-slate-900 [&>option]:text-white";

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-slate-950">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-purple-600 rounded-full opacity-20 blur-3xl animate-pulse" />
        <div className="absolute bottom-0 -left-40 w-80 h-80 bg-indigo-600 rounded-full opacity-15 blur-3xl animate-pulse" style={{animationDelay:'1.5s'}} />
        <div className="absolute top-1/3 left-1/2 w-64 h-64 bg-blue-600 rounded-full opacity-10 blur-3xl animate-pulse" style={{animationDelay:'0.7s'}} />
        <div className="absolute inset-0 opacity-[0.04]" style={{backgroundImage:'linear-gradient(rgba(99,102,241,0.5) 1px, transparent 1px),linear-gradient(90deg, rgba(99,102,241,0.5) 1px, transparent 1px)',backgroundSize:'60px 60px'}} />
      </div>

      <div className="relative z-10 w-full max-w-lg mx-4 py-8">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-2xl mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M3 3h18v4H3V3zm0 7h12v4H3v-4zm0 7h18v4H3v-4z" fill="white" fillOpacity="0.9"/>
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">FinStatement</h1>
          <p className="text-slate-400 text-sm mt-1">Create your firm account</p>
        </div>

        {/* Steps */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {['Firm Details','Your Profile','Done'].map((s,i) => (
            <React.Fragment key={s}>
              <div className="flex items-center gap-1.5">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${i<step?'bg-indigo-600 text-white':i===step?'bg-indigo-600 text-white ring-2 ring-indigo-400/50 ring-offset-2 ring-offset-slate-950':'bg-slate-800 text-slate-500'}`}>
                  {i<step?'✓':i+1}
                </div>
                <span className={`text-xs hidden sm:block ${i<=step?'text-indigo-400':'text-slate-600'}`}>{s}</span>
              </div>
              {i<2 && <div className={`w-8 h-px ${i<step?'bg-indigo-600':'bg-slate-700'}`}/>}
            </React.Fragment>
          ))}
        </div>

        {/* Card */}
        <div className="rounded-3xl p-8 shadow-2xl" style={{background:'rgba(255,255,255,0.06)',backdropFilter:'blur(40px)',WebkitBackdropFilter:'blur(40px)',border:'1px solid rgba(255,255,255,0.10)'}}>

          {/* ── STEP 0: Firm Details ── */}
          {step === 0 && (
            <>
              <h2 className="text-xl font-semibold text-white mb-1">Your Firm</h2>
              <p className="text-slate-400 text-sm mb-6">Tell us where you practice</p>
              <form onSubmit={nextStep} className="space-y-4">

                {/* Region selection — big toggle cards */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-2">Practice Region</label>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(REGION_CONFIG).map(([region, cfg]) => (
                      <button key={region} type="button" onClick={() => handleRegionChange(region)}
                        className={`flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all ${form.region===region?'border-indigo-500 bg-indigo-600/20':'border-white/10 bg-white/[0.04] hover:border-white/20'}`}>
                        <span className="text-3xl">{cfg.flag}</span>
                        <div>
                          <div className="font-semibold text-white text-sm">{region}</div>
                          <div className="text-xs text-slate-400">{cfg.currency} · {cfg.methods.join(', ')}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Firm / Practice Name</label>
                  <input required value={form.firmName}
                    onChange={e => { set('firmName',e.target.value); set('firmSlug',e.target.value.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'')); }}
                    className={glassInput} placeholder={form.region==='UAE'?'XYZ Audit LLC':'M/s XYZ & Associates'} />
                </div>

                {/* Method selection — based on region */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-2">Accounting Standard</label>
                  <div className="grid grid-cols-2 gap-2">
                    {regionCfg.methods.map(m => (
                      <button key={m} type="button" onClick={() => set('method', m)}
                        className={`py-3 px-4 rounded-xl text-sm font-medium text-left border-2 transition-all ${form.method===m?'border-indigo-500 bg-indigo-600/20 text-white':'border-white/10 bg-white/[0.04] text-slate-400 hover:border-white/20'}`}>
                        <div className="font-bold">{m}</div>
                        <div className="text-xs opacity-70 mt-0.5">{regionCfg.methodLabels[m]}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <button type="submit" className="w-full py-3 rounded-xl text-sm font-semibold text-white mt-2" style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)',boxShadow:'0 8px 32px rgba(99,102,241,0.35)'}}>
                  Continue →
                </button>
              </form>
            </>
          )}

          {/* ── STEP 1: User Profile ── */}
          {step === 1 && (
            <>
              <button onClick={() => setStep(0)} className="text-slate-400 hover:text-white text-sm mb-3 flex items-center gap-1">← Back</button>
              <h2 className="text-xl font-semibold text-white mb-1">Your Profile</h2>
              <p className="text-slate-400 text-sm mb-6">You'll be the firm admin</p>
              <form onSubmit={nextStep} className="space-y-4">

                {/* Avatar upload */}
                <div className="flex items-center gap-4">
                  <div className="relative flex-shrink-0">
                    <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-white/20 bg-white/10 flex items-center justify-center cursor-pointer hover:border-indigo-400 transition-all"
                      onClick={() => fileRef.current?.click()}>
                      {avatarPreview ? (
                        <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <div className="text-center">
                          <div className="text-2xl">📷</div>
                          <div className="text-xs text-slate-400 mt-1">Photo</div>
                        </div>
                      )}
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatar} className="hidden" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-slate-300 font-medium">Profile Photo</p>
                    <p className="text-xs text-slate-500 mt-0.5">Click to upload. JPG, PNG under 2MB.</p>
                    <p className="text-xs text-slate-500">Shown on dashboard and sidebar.</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Full Name *</label>
                    <input required value={form.name} onChange={e=>set('name',e.target.value)} className={glassInput} placeholder="CA Rahul Sharma" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Designation</label>
                    <input value={form.designation} onChange={e=>set('designation',e.target.value)} className={glassInput} placeholder="Managing Partner" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Email Address *</label>
                  <input required type="email" value={form.email} onChange={e=>set('email',e.target.value)} className={glassInput} placeholder="you@yourfirm.com" />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Phone</label>
                  <input type="tel" value={form.phone} onChange={e=>set('phone',e.target.value)} className={glassInput} placeholder={form.region==='UAE'?'+971 50 000 0000':'+91 98765 43210'} />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Password *</label>
                  <div className="relative">
                    <input required type={showPass?'text':'password'} value={form.password} onChange={e=>set('password',e.target.value)} className={glassInput} placeholder="Minimum 8 characters" />
                    <button type="button" onClick={()=>setShowPass(p=>!p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">{showPass?'🙈':'👁'}</button>
                  </div>
                  {form.password && (
                    <div className="flex gap-1 mt-1.5">
                      {[1,2,3,4].map(i=>(
                        <div key={i} className={`h-1 flex-1 rounded-full transition-all ${form.password.length>=i*2+2?(i<=1?'bg-red-500':i<=2?'bg-amber-500':i<=3?'bg-yellow-400':'bg-emerald-500'):'bg-slate-700'}`}/>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Confirm Password *</label>
                  <input required type="password" value={form.confirmPassword} onChange={e=>set('confirmPassword',e.target.value)} className={glassInput} placeholder="Repeat password" />
                  {form.confirmPassword && form.password!==form.confirmPassword && (
                    <p className="text-red-400 text-xs mt-1">Passwords do not match</p>
                  )}
                </div>

                <button type="submit" disabled={loading} className="w-full py-3 rounded-xl text-sm font-semibold text-white mt-2 disabled:opacity-60" style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)',boxShadow:'0 8px 32px rgba(99,102,241,0.35)'}}>
                  {loading?(
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4"/><path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                      Creating your account...
                    </span>
                  ):'Create Account'}
                </button>
              </form>
            </>
          )}

          {/* ── STEP 2: Success ── */}
          {step === 2 && (
            <div className="text-center py-8">
              <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500/30 flex items-center justify-center mx-auto mb-5">
                <svg className="w-10 h-10 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Welcome aboard! 🎉</h2>
              <p className="text-slate-400">Account created for <span className="text-indigo-400 font-medium">{form.firmName}</span></p>
              <p className="text-slate-500 text-sm mt-2">Redirecting to your dashboard...</p>
              <div className="mt-5 w-full bg-slate-800 rounded-full h-1 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full animate-pulse" style={{width:'70%'}}/>
              </div>
            </div>
          )}

          {step < 2 && (
            <p className="text-center text-xs text-slate-500 mt-6">
              Already have an account?{' '}
              <Link to="/login" className="text-indigo-400 hover:text-indigo-300 font-medium">Sign in</Link>
            </p>
          )}
        </div>
        <p className="text-center text-xs text-slate-700 mt-6">India (INR) · UAE (AED) · AS · Ind AS · IFRS · IFRS SME</p>
      </div>
    </div>
  );
}
