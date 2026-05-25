import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { authAPI } from '../api/client';
import toast from 'react-hot-toast';

// High-quality financial stock photos from Unsplash (free, no attribution needed for display)
const BG_IMAGES = [
  'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1920&q=85&fit=crop', // trading screens
  'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=1920&q=85&fit=crop', // modern office
  'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1920&q=85&fit=crop', // financial charts
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1920&q=85&fit=crop', // professional
  'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1920&q=85&fit=crop', // city skyline
];

const CAPTIONS = [
  { title: 'Financial Intelligence', sub: 'Real-time insights for smarter decisions' },
  { title: 'Built for CA Firms', sub: 'Streamline your audit and compliance workflow' },
  { title: 'Multi-Standard Ready', sub: 'AS · Ind AS · IFRS · IFRS SME in one platform' },
  { title: 'Trusted by Professionals', sub: 'Secure, accurate, and audit-ready reporting' },
  { title: 'Scale with Confidence', sub: 'From single engagements to enterprise portfolios' },
];

const BACKEND = import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? 'https://fsautomate.onrender.com' : 'http://localhost:4000');

export default function Login() {
  const navigate = useNavigate();
  const { setAuth } = useStore();

  const [form, setForm]         = useState({ email: '', password: '' });
  const [loading, setLoading]   = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [current, setCurrent]   = useState(0);
  const [fading, setFading]     = useState(false);

  // Forgot password state
  const [forgotOpen, setForgotOpen]   = useState(false);
  const [fpStep, setFpStep]           = useState(1); // 1=email, 2=otp+newpass
  const [fpEmail, setFpEmail]         = useState('');
  const [fpOTP, setFpOTP]             = useState('');
  const [fpPass, setFpPass]           = useState('');
  const [fpPass2, setFpPass2]         = useState('');
  const [fpLoading, setFpLoading]     = useState(false);
  const [fpDevOTP, setFpDevOTP]       = useState('');

  // Rotate background images every 4 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setCurrent(p => (p + 1) % BG_IMAGES.length);
        setFading(false);
      }, 800);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  // Preload images
  useEffect(() => {
    BG_IMAGES.forEach(src => { const img = new Image(); img.src = src; });
  }, []);

  async function sendForgotOTP() {
    if (!fpEmail.trim()) { toast.error('Enter your email address'); return; }
    setFpLoading(true);
    try {
      const res = await authAPI.forgotPassword({ email: fpEmail.trim() });
      toast.success(res.message || 'OTP sent to your email');
      if (res.otp) setFpDevOTP(res.otp); // dev mode
      setFpStep(2);
    } catch (err) { toast.error(err?.error || 'Failed to send OTP'); }
    finally { setFpLoading(false); }
  }

  async function resetPassword() {
    if (!fpOTP.trim()) { toast.error('Enter the OTP'); return; }
    if (!fpPass || fpPass.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (fpPass !== fpPass2) { toast.error('Passwords do not match'); return; }
    setFpLoading(true);
    try {
      await authAPI.resetPassword({ email: fpEmail, otp: fpOTP, newPassword: fpPass });
      toast.success('Password reset! Please log in.');
      setForgotOpen(false);
      setFpStep(1); setFpEmail(''); setFpOTP(''); setFpPass(''); setFpPass2(''); setFpDevOTP('');
      setForm(f => ({ ...f, email: fpEmail }));
    } catch (err) { toast.error(err?.error || 'Invalid OTP'); }
    finally { setFpLoading(false); }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.email || !form.password) { toast.error('Please enter email and password'); return; }
    setLoading(true);
    try {
      const res = await authAPI.login(form);
      setAuth(res.token, res.user, res.firm);
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(err?.error || 'Invalid email or password');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex overflow-hidden font-sans">

      {/* ── LEFT: Rotating Background ─────────────────────────────────── */}
      <div className="hidden lg:flex lg:flex-1 relative overflow-hidden">
        {/* Background image */}
        <div
          className="absolute inset-0 bg-cover bg-center transition-all duration-700"
          style={{
            backgroundImage: `url(${BG_IMAGES[current]})`,
            opacity: fading ? 0 : 1,
          }}
        />

        {/* Dark overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/80 via-slate-800/60 to-indigo-900/70" />

        {/* Subtle grid overlay */}
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

        {/* Content */}
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

          {/* Caption */}
          <div className={`transition-all duration-700 ${fading ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}`}>
            <div className="mb-6">
              <div className="flex gap-1.5 mb-8">
                {BG_IMAGES.map((_, i) => (
                  <div key={i}
                    className={`h-0.5 rounded-full transition-all duration-500 ${i === current ? 'w-8 bg-white' : 'w-2 bg-white/30'}`}
                  />
                ))}
              </div>
              <h2 className="text-4xl font-bold text-white leading-tight mb-3">
                {CAPTIONS[current].title}
              </h2>
              <p className="text-white/70 text-lg">{CAPTIONS[current].sub}</p>
            </div>

            {/* Stats row */}
            <div className="flex gap-6">
              {[
                { value: '4', label: 'Standards' },
                { value: '100%', label: 'Compliant' },
                { value: '∞', label: 'Clients' },
              ].map((s, i) => (
                <div key={i} className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-3 border border-white/10">
                  <p className="text-white font-bold text-xl">{s.value}</p>
                  <p className="text-white/60 text-xs">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT: Login Panel ────────────────────────────────────────── */}
      <div className="w-full lg:w-[480px] flex-shrink-0 flex flex-col justify-center px-8 md:px-12 bg-gradient-to-br from-slate-50 to-blue-50/40 relative">

        {/* Subtle background texture */}
        <div className="absolute inset-0 opacity-30"
          style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(99,102,241,0.08) 0%, transparent 60%), radial-gradient(circle at 80% 80%, rgba(59,130,246,0.06) 0%, transparent 60%)' }} />

        <div className="relative z-10 max-w-sm mx-auto w-full">

          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-white">
                <path d="M3 3h18v4H3V3zm0 7h12v4H3v-4zm0 7h8v4H3v-4z" fill="currentColor"/>
              </svg>
            </div>
            <p className="text-slate-900 font-bold text-lg">FinStatement</p>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900 mb-1">Welcome back</h1>
            <p className="text-slate-500 text-sm">Sign in to your workspace</p>
          </div>

          {/* OAuth buttons */}
          <div className="space-y-3 mb-6">
            {[
              {
                name: 'Google',
                icon: (
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                ),
              },
              {
                name: 'Microsoft',
                icon: (
                  <svg viewBox="0 0 24 24" className="w-4 h-4">
                    <path fill="#F25022" d="M1 1h10v10H1z"/>
                    <path fill="#00A4EF" d="M13 1h10v10H13z"/>
                    <path fill="#7FBA00" d="M1 13h10v10H1z"/>
                    <path fill="#FFB900" d="M13 13h10v10H13z"/>
                  </svg>
                ),
              },
            ].map(s => (
              <button
                key={s.name}
                onClick={() => window.location.href = `${BACKEND}/api/auth/${s.name.toLowerCase()}`}
                className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
              >
                {s.icon}
                Continue with {s.name}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-xs text-slate-400 font-medium">or sign in with email</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email address</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="you@firm.com"
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
                autoComplete="email"
                autoFocus
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-600">Password</label>
                <button type="button" onClick={() => { setForgotOpen(true); setFpStep(1); setFpDevOTP(''); }}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Enter your password"
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all pr-10"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPass ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-xl transition-all shadow-md shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Signing in...
                </>
              ) : 'Sign in'}
            </button>
          </form>

          {/* Register link */}
          <p className="text-center text-sm text-slate-500 mt-6">
            New to FinStatement?{' '}
            <a href="/register" className="text-indigo-600 font-semibold hover:text-indigo-700">
              Create account
            </a>
          </p>

          {/* Security badge */}
          <div className="flex items-center justify-center gap-2 mt-8 text-xs text-slate-400">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
            256-bit SSL encrypted · SOC 2 compliant
          </div>
        </div>
      </div>
    </div>

      {/* Forgot Password Modal */}
      {forgotOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm mx-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-900">
                {fpStep === 1 ? 'Reset Password' : 'Enter OTP & New Password'}
              </h2>
              <button onClick={() => setForgotOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>

            {fpStep === 1 ? (
              <div className="space-y-4">
                <p className="text-sm text-slate-500">Enter your email address and we'll send you a reset code.</p>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email Address</label>
                  <input type="email" value={fpEmail}
                    onChange={e => setFpEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendForgotOTP()}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                    placeholder="your@email.com" autoFocus />
                </div>
                <button onClick={sendForgotOTP} disabled={fpLoading}
                  className="w-full py-2.5 bg-indigo-600 text-white font-semibold text-sm rounded-xl hover:bg-indigo-700 disabled:opacity-50">
                  {fpLoading ? 'Sending...' : 'Send Reset Code'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-slate-500">Enter the 6-digit code sent to <strong>{fpEmail}</strong></p>
                {fpDevOTP && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                    <p className="text-xs text-amber-600 font-medium">Dev Mode OTP</p>
                    <p className="text-2xl font-bold text-amber-700 tracking-widest">{fpDevOTP}</p>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">6-Digit OTP</label>
                  <input type="text" maxLength={6} value={fpOTP}
                    onChange={e => setFpOTP(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 text-center tracking-widest font-bold text-lg"
                    placeholder="000000" autoFocus />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">New Password</label>
                  <input type="password" value={fpPass}
                    onChange={e => setFpPass(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                    placeholder="At least 8 characters" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Confirm New Password</label>
                  <input type="password" value={fpPass2}
                    onChange={e => setFpPass2(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && resetPassword()}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                    placeholder="Repeat new password" />
                  {fpPass2 && fpPass !== fpPass2 && <p className="text-red-500 text-xs mt-1">Passwords do not match</p>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setFpStep(1)} className="px-4 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50">
                    Back
                  </button>
                  <button onClick={resetPassword} disabled={fpLoading}
                    className="flex-1 py-2.5 bg-indigo-600 text-white font-semibold text-sm rounded-xl hover:bg-indigo-700 disabled:opacity-50">
                    {fpLoading ? 'Resetting...' : 'Reset Password'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
