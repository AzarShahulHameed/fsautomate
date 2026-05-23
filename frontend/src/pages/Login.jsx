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
 
const SLIDES = [
  {
    url: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1600&q=80',
    caption: 'Real-time financial intelligence',
    sub: 'Track every rupee, every dirham',
    accent: 'rgba(56,189,248,0.9)',       // sky blue
    tint: 'rgba(14,30,60,0.55)',
  },
  {
    url: 'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=1600&q=80',
    caption: 'Compliance made simple',
    sub: 'AS · Ind AS · IFRS · IFRS SME',
    accent: 'rgba(52,211,153,0.9)',       // emerald
    tint: 'rgba(5,30,20,0.50)',
  },
  {
    url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1600&q=80',
    caption: 'From trial balance to statements',
    sub: 'Automated mapping, zero errors',
    accent: 'rgba(251,191,36,0.9)',       // amber
    tint: 'rgba(30,20,5,0.50)',
  },
  {
    url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1600&q=80',
    caption: 'Multi-client. Multi-region.',
    sub: 'India & UAE under one platform',
    accent: 'rgba(167,139,250,0.9)',      // violet
    tint: 'rgba(20,10,40,0.52)',
  },
  {
    url: 'https://images.unsplash.com/photo-1642790106117-e829e14a795f?w=1600&q=80',
    caption: 'Audit-ready in minutes',
    sub: 'Schedule III · Notes · Disclosures',
    accent: 'rgba(249,115,22,0.9)',       // orange
    tint: 'rgba(30,15,5,0.50)',
  },
];
 
export default function Login() {
  const [form, setForm]         = useState({ email: '', password: '' });
  const [loading, setLoading]   = useState(false);
  const [waking, setWaking]     = useState(false);
  const [wakeSecs, setWakeSecs] = useState(0);
  const [showPass, setShowPass] = useState(false);
  const [slide, setSlide]       = useState(0);
  const [visible, setVisible]   = useState(true);
 
  const { setAuth } = useStore();
  const navigate    = useNavigate();
 
  // Slideshow
  useEffect(() => {
    const t = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setSlide(s => (s + 1) % SLIDES.length);
        setVisible(true);
      }, 600);
    }, 4500);
    return () => clearInterval(t);
  }, []);
 
  useEffect(() => { pingBackend(); }, []);
 
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
    <div className="min-h-screen flex overflow-hidden relative">
 
      {/* ── Full-screen background image ── */}
      {SLIDES.map((s, i) => (
        <div
          key={i}
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${s.url})`,
            opacity: i === slide ? (visible ? 1 : 0) : 0,
            transition: 'opacity 0.8s ease-in-out',
            zIndex: 0,
          }}
        />
      ))}
 
      {/* Gradient overlay — left lighter, right darker to contrast panel */}
      <div className="absolute inset-0 z-10"
        style={{
          background: `linear-gradient(105deg, ${current.tint} 0%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.60) 100%)`,
          transition: 'background 0.8s ease-in-out',
        }}
      />
 
      {/* ── Left: Brand + Caption ── */}
      <div className="hidden lg:flex flex-1 flex-col justify-between p-10 relative z-20">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.25)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M3 3h18v4H3V3zm0 7h12v4H3v-4zm0 7h18v4H3v-4z" fill="white"/>
            </svg>
          </div>
          <div>
            <div className="text-white font-bold text-lg leading-none" style={{ textShadow: '0 1px 8px rgba(0,0,0,0.4)' }}>FinStatement</div>
            <div className="text-white/60 text-xs">Financial Platform</div>
          </div>
        </div>
 
        {/* Caption */}
        <div>
          <div
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(10px)',
              transition: 'all 0.7s ease-in-out',
            }}
          >
            {/* Accent line */}
            <div className="w-10 h-1 rounded-full mb-5"
              style={{ background: current.accent, boxShadow: `0 0 16px ${current.accent}` }} />
            <p className="text-white font-bold leading-tight mb-3"
              style={{ fontSize: '2.4rem', textShadow: '0 2px 24px rgba(0,0,0,0.5)' }}>
              {current.caption}
            </p>
            <p className="text-white/70 text-lg">{current.sub}</p>
          </div>
 
          {/* Dots */}
          <div className="flex gap-2 mt-8">
            {SLIDES.map((_, i) => (
              <button key={i}
                onClick={() => { setVisible(false); setTimeout(() => { setSlide(i); setVisible(true); }, 300); }}
                className="rounded-full transition-all duration-500"
                style={{
                  width: i === slide ? '32px' : '8px',
                  height: '8px',
                  background: i === slide ? current.accent : 'rgba(255,255,255,0.35)',
                  boxShadow: i === slide ? `0 0 12px ${current.accent}` : 'none',
                }}
              />
            ))}
          </div>
        </div>
      </div>
 
      {/* ── Right: Glass Login Panel ── */}
      <div className="w-full lg:w-[460px] flex items-center justify-center relative z-20 p-6">
        <div className="w-full max-w-sm rounded-3xl px-8 py-10"
          style={{
            background: 'rgba(255,255,255,0.13)',
            backdropFilter: 'blur(32px)',
            WebkitBackdropFilter: 'blur(32px)',
            border: '1px solid rgba(255,255,255,0.25)',
            boxShadow: '0 24px 80px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.3)',
          }}>
 
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M3 3h18v4H3V3zm0 7h12v4H3v-4zm0 7h18v4H3v-4z" fill="white"/>
              </svg>
            </div>
            <span className="text-white font-bold text-lg">FinStatement</span>
          </div>
 
          {/* Heading */}
          <div className="mb-7">
            <h1 className="text-2xl font-bold text-white mb-1">Welcome back</h1>
            <p className="text-white/60 text-sm">Sign in to your account</p>
          </div>
 
          {/* Wake-up banner */}
          {waking && (
            <div className="mb-4 px-4 py-3 rounded-2xl text-sm flex items-center gap-3"
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)' }}>
              <svg className="animate-spin w-4 h-4 text-white shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <div>
                <p className="text-white font-medium">Server waking up…</p>
                <p className="text-white/60 text-xs mt-0.5">~30s on first load ({wakeSecs}s elapsed)</p>
              </div>
            </div>
          )}
 
          <form onSubmit={submit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-white/70 mb-1.5 tracking-widest uppercase">Email</label>
              <input
                type="email" required autoFocus
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="you@firm.com"
                disabled={isWorking}
                className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/30 outline-none disabled:opacity-50"
                style={{
                  background: 'rgba(255,255,255,0.10)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  transition: 'all 0.2s',
                }}
                onFocus={e => { e.target.style.background = 'rgba(255,255,255,0.16)'; e.target.style.borderColor = 'rgba(255,255,255,0.45)'; }}
                onBlur={e => { e.target.style.background = 'rgba(255,255,255,0.10)'; e.target.style.borderColor = 'rgba(255,255,255,0.18)'; }}
              />
            </div>
 
            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-white/70 tracking-widest uppercase">Password</label>
                <button type="button" className="text-xs text-white/60 hover:text-white transition-colors">Forgot?</button>
              </div>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'} required
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="••••••••••"
                  disabled={isWorking}
                  className="w-full px-4 py-3 pr-11 rounded-xl text-sm text-white placeholder-white/30 outline-none disabled:opacity-50"
                  style={{
                    background: 'rgba(255,255,255,0.10)',
                    border: '1px solid rgba(255,255,255,0.18)',
                    transition: 'all 0.2s',
                  }}
                  onFocus={e => { e.target.style.background = 'rgba(255,255,255,0.16)'; e.target.style.borderColor = 'rgba(255,255,255,0.45)'; }}
                  onBlur={e => { e.target.style.background = 'rgba(255,255,255,0.10)'; e.target.style.borderColor = 'rgba(255,255,255,0.18)'; }}
                />
                <button type="button" onClick={() => setShowPass(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/90 transition-colors text-sm">
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
            </div>
 
            {/* Sign In */}
            <button type="submit" disabled={isWorking}
              className="w-full py-3 rounded-xl text-sm font-bold text-white mt-2 transition-all duration-200 disabled:opacity-60"
              style={{
                background: isWorking
                  ? 'rgba(255,255,255,0.15)'
                  : 'rgba(255,255,255,0.22)',
                border: '1px solid rgba(255,255,255,0.35)',
                backdropFilter: 'blur(8px)',
                boxShadow: isWorking ? 'none' : '0 4px 20px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.3)',
              }}
              onMouseEnter={e => { if (!isWorking) e.currentTarget.style.background = 'rgba(255,255,255,0.30)'; }}
              onMouseLeave={e => { if (!isWorking) e.currentTarget.style.background = 'rgba(255,255,255,0.22)'; }}
            >
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
              ) : 'Sign In →'}
            </button>
          </form>
 
          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.15)' }} />
            <span className="text-xs text-white/40">or</span>
            <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.15)' }} />
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
                className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm text-white/70 hover:text-white transition-all"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.16)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}>
                {s.icon}
                <span>{s.name}</span>
              </button>
            ))}
          </div>
 
          {/* Register */}
          <p className="text-center text-xs text-white/40 mt-6">
            New firm?{' '}
            <Link to="/register" className="text-white/80 hover:text-white font-semibold transition-colors underline underline-offset-2">
              Create an account
            </Link>
          </p>
 
          <p className="text-center text-xs text-white/20 mt-5">
            AS · Ind AS · IFRS · IFRS SME
          </p>
        </div>
      </div>
    </div>
  );
}