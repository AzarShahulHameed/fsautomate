import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../api/client';
import { useStore } from '../store';
import toast from 'react-hot-toast';
 
const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
 
// Ping the backend health endpoint — returns true when awake
async function pingBackend() {
  try {
    const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}
 
// Wait until the backend responds, up to maxWait ms
async function waitForBackend(maxWait = 90000, interval = 3000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    if (await pingBackend()) return true;
    await new Promise(r => setTimeout(r, interval));
  }
  return false;
}
 
export default function Login() {
  const [form, setForm]         = useState({ email: '', password: '' });
  const [loading, setLoading]   = useState(false);
  const [waking, setWaking]     = useState(false);   // server cold-start state
  const [wakeSecs, setWakeSecs] = useState(0);
  const [showPass, setShowPass] = useState(false);
  const { setAuth } = useStore();
  const navigate = useNavigate();
 
  // Pre-warm the backend as soon as the login page loads
  useEffect(() => {
    pingBackend(); // fire-and-forget — just starts the wake-up early
  }, []);
 
  // Tick the "waking up" counter every second
  useEffect(() => {
    if (!waking) { setWakeSecs(0); return; }
    const t = setInterval(() => setWakeSecs(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [waking]);
 
  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
 
    // 1. Quick ping — is the server already awake?
    const awake = await pingBackend();
    if (!awake) {
      // Server is sleeping — show friendly wake-up UI and wait
      setWaking(true);
      toast('Server is starting up, please wait…', { icon: '⏳', duration: 10000 });
      const cameUp = await waitForBackend();
      setWaking(false);
      if (!cameUp) {
        toast.error('Server took too long to respond. Please try again in a moment.');
        setLoading(false);
        return;
      }
    }
 
    // 2. Server is awake — attempt login
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
 
  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-slate-950">
 
      {/* ── Animated background ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600 rounded-full opacity-20 blur-3xl animate-pulse" />
        <div className="absolute top-1/2 -right-40 w-80 h-80 bg-purple-600 rounded-full opacity-15 blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute -bottom-20 left-1/3 w-72 h-72 bg-blue-500 rounded-full opacity-10 blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
 
        <div className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: `linear-gradient(rgba(99,102,241,0.3) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(99,102,241,0.3) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
        />
 
        {['Balance Sheet','P&L Statement','Trial Balance','Cash Flow','IFRS','Ind AS','AS 3','Schedule III','₹','$'].map((t, i) => (
          <div key={i}
            className="absolute text-indigo-400 opacity-10 font-mono text-sm select-none"
            style={{
              left: `${10 + (i * 9.3) % 80}%`,
              top: `${5 + (i * 13.7) % 85}%`,
              animation: `float ${4 + i * 0.7}s ease-in-out infinite`,
              animationDelay: `${i * 0.4}s`,
            }}
          >
            {t}
          </div>
        ))}
      </div>
 
      {/* ── Glass card ── */}
      <div className="relative z-10 w-full max-w-sm mx-4">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-2xl mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M3 3h18v4H3V3zm0 7h12v4H3v-4zm0 7h18v4H3v-4z" fill="white" fillOpacity="0.9"/>
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">FinStatement</h1>
          <p className="text-slate-400 text-sm mt-1">Financial Statement Platform</p>
        </div>
 
        {/* Card */}
        <div
          className="rounded-3xl p-8 shadow-2xl"
          style={{
            background: 'rgba(255,255,255,0.06)',
            backdropFilter: 'blur(40px)',
            WebkitBackdropFilter: 'blur(40px)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          <h2 className="text-xl font-semibold text-white mb-1">Welcome back</h2>
          <p className="text-slate-400 text-sm mb-6">Sign in to your account</p>
 
          {/* Wake-up banner */}
          {waking && (
            <div
              className="mb-4 px-4 py-3 rounded-xl text-sm flex items-center gap-3"
              style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }}
            >
              <svg className="animate-spin w-4 h-4 text-indigo-400 shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <div>
                <p className="text-indigo-300 font-medium">Server is waking up…</p>
                <p className="text-indigo-400 text-xs mt-0.5">
                  This takes ~30s on first load ({wakeSecs}s elapsed). You'll be signed in automatically.
                </p>
              </div>
            </div>
          )}
 
          <form onSubmit={submit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Email address</label>
              <input
                type="email" required autoFocus
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="you@firm.com"
                disabled={isWorking}
                className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-slate-500 outline-none transition-all disabled:opacity-50"
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.12)',
                }}
                onFocus={e => e.target.style.border = '1px solid rgba(99,102,241,0.7)'}
                onBlur={e => e.target.style.border = '1px solid rgba(255,255,255,0.12)'}
              />
            </div>
 
            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-slate-300">Password</label>
                <button type="button" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'} required
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Enter your password"
                  disabled={isWorking}
                  className="w-full px-4 py-3 pr-10 rounded-xl text-sm text-white placeholder-slate-500 outline-none transition-all disabled:opacity-50"
                  style={{
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.12)',
                  }}
                  onFocus={e => e.target.style.border = '1px solid rgba(99,102,241,0.7)'}
                  onBlur={e => e.target.style.border = '1px solid rgba(255,255,255,0.12)'}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
            </div>
 
            {/* Sign in button */}
            <button
              type="submit" disabled={isWorking}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200 disabled:opacity-60 mt-2"
              style={{
                background: isWorking
                  ? 'rgba(99,102,241,0.5)'
                  : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                boxShadow: isWorking ? 'none' : '0 8px 32px rgba(99,102,241,0.4)',
              }}
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
              ) : 'Sign In'}
            </button>
          </form>
 
          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-white opacity-10" />
            <span className="text-xs text-slate-500">or continue with</span>
            <div className="flex-1 h-px bg-white opacity-10" />
          </div>
 
          {/* Social buttons */}
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
              <button
                key={s.name}
                type="button"
                onClick={() => toast('Coming soon — contact admin for access', { icon: '🔐' })}
                className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm text-slate-300 transition-all hover:text-white"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.10)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              >
                {s.icon}
                <span>{s.name}</span>
              </button>
            ))}
          </div>
 
          {/* Register link */}
          <p className="text-center text-xs text-slate-500 mt-6">
            New firm?{' '}
            <Link to="/register" className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
              Create an account
            </Link>
          </p>
        </div>
 
        {/* Footer */}
        <p className="text-center text-xs text-slate-600 mt-6">
          Supports AS · Ind AS · IFRS · IFRS SME
        </p>
      </div>
 
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-12px); }
        }
      `}</style>
    </div>
  );
}
 