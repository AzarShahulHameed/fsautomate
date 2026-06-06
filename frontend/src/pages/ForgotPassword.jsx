// src/pages/ForgotPassword.jsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authAPI } from '../api/client';
import toast from 'react-hot-toast';

export default function ForgotPassword() {
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!email.trim()) return toast.error('Enter your email');
    setLoading(true);
    try {
      await authAPI.forgotPassword(email.trim().toLowerCase());
      setSent(true);
    } catch {
      // Always show success — don't reveal if email exists
      setSent(true);
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600 rounded-full opacity-20 blur-3xl animate-pulse" />
        <div className="absolute -bottom-20 right-1/3 w-72 h-72 bg-purple-600 rounded-full opacity-15 blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-2xl mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M3 3h18v4H3V3zm0 7h12v4H3v-4zm0 7h18v4H3v-4z" fill="white" fillOpacity="0.9"/>
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-white">Reset Password</h1>
          <p className="text-slate-400 text-sm mt-1">FinStatement</p>
        </div>

        <div className="rounded-3xl p-8 shadow-2xl" style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(40px)' }}>
          {sent ? (
            <div className="text-center">
              <div className="text-4xl mb-4">📬</div>
              <h2 className="text-white font-semibold text-lg mb-2">Check your inbox</h2>
              <p className="text-slate-400 text-sm mb-6">
                If an account exists for <strong className="text-slate-300">{email}</strong>, 
                a reset link has been sent. Check your spam folder if you don't see it.
              </p>
              <p className="text-slate-500 text-xs mb-4">The link expires in 30 minutes.</p>
              <Link to="/login" className="text-indigo-400 hover:text-indigo-300 text-sm font-medium">
                ← Back to login
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <div>
                <p className="text-slate-400 text-sm mb-5">
                  Enter the email address for your account and we'll send you a link to reset your password.
                </p>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@firm.com"
                  required
                  className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-slate-500 border border-white/10 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
              <p className="text-center text-xs text-slate-500">
                <Link to="/login" className="text-indigo-400 hover:text-indigo-300 font-medium">
                  ← Back to login
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
