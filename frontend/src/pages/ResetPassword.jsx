// src/pages/ResetPassword.jsx
import React, { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../api/client';
import toast from 'react-hot-toast';

function PasswordStrength({ password }) {
  const checks = [
    { label: '8+ characters', ok: password.length >= 8 },
    { label: 'Uppercase letter', ok: /[A-Z]/.test(password) },
    { label: 'Number', ok: /\d/.test(password) },
  ];
  const score = checks.filter(c => c.ok).length;
  const colors = ['bg-red-500', 'bg-amber-500', 'bg-emerald-500'];
  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-1">
        {[0,1,2].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i < score ? colors[score-1] : 'bg-white/10'}`} />
        ))}
      </div>
      <div className="flex gap-3 flex-wrap">
        {checks.map(c => (
          <span key={c.label} className={`text-xs ${c.ok ? 'text-emerald-400' : 'text-slate-500'}`}>
            {c.ok ? '✓' : '○'} {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ResetPassword() {
  const [params]   = useSearchParams();
  const navigate   = useNavigate();
  const token      = params.get('token');
  const [form, setForm]     = useState({ password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [done, setDone]     = useState(false);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center text-white">
          <p className="text-xl mb-4">⚠ Invalid reset link</p>
          <Link to="/forgot-password" className="text-indigo-400 hover:text-indigo-300">Request a new one</Link>
        </div>
      </div>
    );
  }

  async function submit(e) {
    e.preventDefault();
    if (form.password.length < 8) return toast.error('Password must be at least 8 characters');
    if (form.password !== form.confirm) return toast.error('Passwords do not match');
    setLoading(true);
    try {
      await authAPI.resetPassword(token, form.password);
      setDone(true);
    } catch (err) {
      toast.error(err?.error || err?.response?.data?.error || 'Reset failed — link may have expired');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600 rounded-full opacity-20 blur-3xl animate-pulse" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-2xl mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M3 3h18v4H3V3zm0 7h12v4H3v-4zm0 7h18v4H3v-4z" fill="white" fillOpacity="0.9"/>
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-white">Set New Password</h1>
          <p className="text-slate-400 text-sm mt-1">FinStatement</p>
        </div>

        <div className="rounded-3xl p-8 shadow-2xl" style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(40px)' }}>
          {done ? (
            <div className="text-center">
              <div className="text-4xl mb-4">✅</div>
              <h2 className="text-white font-semibold text-lg mb-2">Password updated</h2>
              <p className="text-slate-400 text-sm mb-6">Your password has been reset and all other sessions have been logged out.</p>
              <button
                onClick={() => navigate('/login')}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
              >
                Log in with new password
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">New password</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="At least 8 characters"
                    required
                    className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-slate-500 border border-white/10 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all pr-10"
                    style={{ background: 'rgba(255,255,255,0.06)' }}
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-3 top-3 text-slate-500 hover:text-slate-300 text-xs">
                    {showPass ? 'Hide' : 'Show'}
                  </button>
                </div>
                {form.password && <PasswordStrength password={form.password} />}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Confirm password</label>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={form.confirm}
                  onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
                  placeholder="Same as above"
                  required
                  className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-slate-500 border border-white/10 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                />
                {form.confirm && form.password !== form.confirm && (
                  <p className="text-red-400 text-xs mt-1">Passwords don't match</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || form.password !== form.confirm || form.password.length < 8}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
              >
                {loading ? 'Updating...' : 'Update Password'}
              </button>

              <p className="text-center text-xs text-slate-500">
                <Link to="/login" className="text-indigo-400 hover:text-indigo-300 font-medium">← Back to login</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
