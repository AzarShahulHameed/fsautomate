import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../api/client';
import { useStore } from '../store';
import toast from 'react-hot-toast';
 
const BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:4000' : 'https://fsautomate.onrender.com');
 
async function pingBackend() {
  try {
    const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch { return false; }
}
 
async function waitForBackend(maxWait = 90000, interval = 3000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    if (await pingBackend()) return true;
    await new Promise(r => setTimeout(r, interval));
  }
  return false;
}
 
// Financial background slides using Unsplash
const SLIDES = [
  {
    url: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1600&q=80',
    caption: 'Real-time financial intelligence',
    sub: 'Track every rupee, every dirham',
  },
  {
    url: 'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=1600&q=80',
    caption: 'Compliance made simple',
    sub: 'AS · Ind AS · IFRS · IFRS SME',
  },
  {
    url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1600&q=80',
    caption: 'From trial balance to financial statements',
    sub: 'Automated mapping, zero errors',
  },
  {
    url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1600&q=80',
    caption: 'Multi-client. Multi-region.',
    sub: 'India & UAE under one platform',
  },
  {
    url: 'https://images.unsplash.com/photo-1642790106117-e829e14a795f?w=1600&q=80',
    caption: 'Audit-ready in minutes',
    sub: 'Schedule III · Notes · Disclosures',
  },
];
 
export default function Login() {
  const [form, setForm]         = useState({ email: '', password: '' });
  const [loading, setLoading]   = useState(false);
  const [waking, setWaking]     = useState(false);
  const [wakeSecs, setWakeSecs] = useState(0);
  const [showPass, setShowPass] = useState(false);
  const [slide, setSlide]       = useState(0);
  const [fadeIn, setFadeIn]     = useState(true);
 
  const { setAuth } = useStore();
  const navigate    = useNavigate();
 
  // Slideshow
  useEffect(() => {
    const t = setInterval(() => {
      setFadeIn(false);
      setTimeout(() => {
        setSlide(s => (s + 1) % SLIDES.length);
        setFadeIn(true);
      }, 700);
    }, 4000);
    return () => clearInterval(t);
  }, []);
 
  // Pre-warm
  useEffect(() => { pingBackend(); }, []);
 
  // Wake counter
  useEffect(() => {
    if (!waking) { setWakeSecs(0); return; }
    const t = setInterval(() => setWakeSecs(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [waking]);
 
  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const awake = await pingBackend();
    if (!awake) {
      setWaking(true);
      toast('Server is starting up…', { icon: '⏳', duration: 10000 });
      const cameUp = await waitForBackend();
      setWaking(false);
      if (!cameUp) {
        toast.error('Server took too long. Please try again.');
        setLoading(false);
        return;
      }
    }
    try {
      const res = await authAPI.login(form);
      setAuth(res.token, res.user, res.firm);
      navigate('/');
    } catch (err) {
      toast.error(err?.error || err?.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };
 
  const isWorking = loading || waking;
  const current   = SLIDES[slide];
 
  return (
    <div className="min-h-screen flex overflow-hidden" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
 
      {/* ── Left: Slideshow ── */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden">
        {/* Background image */}
        <div
          className="absolute inset-0 bg-cover bg-center transition-all"
          style={{
            backgroundImage: `url(${current.url})`,
            opacity: fadeIn ? 1 : 0,
            transition: 'opacity 0.7s ease-in-out',
          }}
        />
 
        {/* Dark overlay */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(5,10,30,0.75) 0%, rgba(10,15,50,0.55) 100%)' }} />
 
        {/* Brand top-left */}
        <div className="absolute top-8 left-8 flex items-center gap-3 z-10">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.2)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M3 3h18v4H3V3zm0 7h12v4H3v-4zm0 7h18v4H3v-4z" fill="white" fillOpacity="0.9"/>
            </svg>
          </div>
          <div>
            <div className="text-white font-bold text-lg leading-none">FinStatement</div>
            <div className="text-blue-200 text-xs opacity-80">Financial Platform</div>
          </div>
        </div>
 
        {/* Bottom caption */}
        <div className="absolute bottom-12 left-8 right-8 z-10">
          <div
            style={{
              opacity: fadeIn ? 1 : 0,
              transform: fadeIn ? 'translateY(0)' : 'translateY(8px)',
              transition: 'all 0.7s ease-in-out',
            }}
          >
            <p className="text-white text-3xl font-bold leading-tight mb-2" style={{ textShadow: '0 2px 20px rgba(0,0,0,0.5)' }}>
              {current.caption}
            </p>
            <p className="text-blue-200 text-base opacity-90">{current.sub}</p>
          </div>
 
          {/* Slide dots */}
          <div className="flex gap-2 mt-6">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => { setFadeIn(false); setTimeout(() => { setSlide(i); setFadeIn(true); }, 300); }}
                className="transition-all duration-300 rounded-full"
                style={{
                  width: i === slide ? '28px' : '8px',
                  height: '8px',
                  background: i === slide ? 'white' : 'rgba(255,255,255,0.4)',
                }}
              />
            ))}
          </div>
        </div>
      </div>
 
      {/* ── Right: Login Panel ── */}
      <div className="w-full lg:w-[480px] flex items-center justify-center relative" style={{ background: '#0a0f1e' }}>
 
        {/* Subtle glow behind form */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)' }} />
 
        <div className="relative z-10 w-full max-w-sm px-8 py-10">
 
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M3 3h18v4H3V3zm0 7h12v4H3v-4zm0 7h18v4H3v-4z" fill="white" fillOpacity="0.9"/>
              </svg>
            </div>
            <span className="text-white font-bold text-xl">FinStatement</span>
          </div>
 
          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-white mb-1">Welcome back</h1>
            <p className="text-slate-400 text-sm">Sign in to your account</p>
          </div>
 
          {/* Wake-up banner */}
          {waking && (
            <div className="mb-5 px-4 py-3 rounded-xl text-sm flex items-center gap-3"
              style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}>
              <svg className="animate-spin w-4 h-4 text-indigo-400 shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <div>
                <p className="text-indigo-300 font-medium">Server waking up…</p>
                <p className="text-indigo-400 text-xs mt-0.5">~30s on first load ({wakeSecs}s). Signing in automatically.</p>
              </div>
            </div>
          )}
 
          <form onSubmit={submit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 tracking-wide">EMAIL ADDRESS</label>
              <input
                type="email" required autoFocus
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="you@firm.com"
                disabled={isWorking}
                className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-slate-600 outline-none disabled:opacity-50"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', transition: 'border-color 0.2s' }}
                onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,0.6)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
              />
            </div>
 
            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-400 tracking-wide">PASSWORD</label>
                <button type="button" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">Forgot password?</button>
              </div>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'} required
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="••••••••••"
                  disabled={isWorking}
                  className="w-full px-4 py-3 pr-11 rounded-xl text-sm text-white placeholder-slate-600 outline-none disabled:opacity-50"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', transition: 'border-color 0.2s' }}
                  onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,0.6)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
                />
                <button type="button" onClick={() => setShowPass(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors text-sm">
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
            </div>
 
            {/* Sign In */}
            <button type="submit" disabled={isWorking}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200 mt-2 disabled:opacity-60"
              style={{
                background: isWorking ? 'rgba(99,102,241,0.4)' : 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                boxShadow: isWorking ? 'none' : '0 4px 24px rgba(79,70,229,0.4)',
              }}>
              {waking ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4"/>
                    <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Waking server… {wakeSecs}s
                </span>
              ) : loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4"/>
                    <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Signing in…
                </span>
              ) : 'Sign In'}
            </button>
          </form>
 
          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.07)' }} />
            <span className="text-xs text-slate-600">or continue with</span>
            <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.07)' }} />
          </div>
 
          {/* Social */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { name: 'Google', icon: (
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )},
              { name: 'Microsoft', icon: (
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#f25022" d="M1 1h10v10H1z"/>
                  <path fill="#00a4ef" d="M13 1h10v10H13z"/>
                  <path fill="#7fba00" d="M1 13h10v10H1z"/>
                  <path fill="#ffb900" d="M13 13h10v10H13z"/>
                </svg>
              )},
            ].map(s => (
              <button key={s.name} type="button"
                onClick={() => toast('Coming soon', { icon: '🔐' })}
                className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm text-slate-400 hover:text-slate-200 transition-all"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}>
                {s.icon}
                <span>{s.name}</span>
              </button>
            ))}
          </div>
 
          {/* Register */}
          <p className="text-center text-xs text-slate-600 mt-6">
            New firm?{' '}
            <Link to="/register" className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
              Create an account
            </Link>
          </p>
 
          {/* Footer */}
          <p className="text-center text-xs mt-8" style={{ color: 'rgba(255,255,255,0.15)' }}>
            Supports AS · Ind AS · IFRS · IFRS SME
          </p>
        </div>
      </div>
    </div>
  );
}