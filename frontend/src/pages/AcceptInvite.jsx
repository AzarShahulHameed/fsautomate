// src/pages/AcceptInvite.jsx
import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { authAPI } from '../api/client';
import { useStore } from '../store';
import toast from 'react-hot-toast';

export default function AcceptInvite() {
  const [params]   = useSearchParams();
  const navigate   = useNavigate();
  const { setAuth } = useStore();
  const token      = params.get('token');

  const [invite,  setInvite]  = useState(null);
  const [invalid, setInvalid] = useState(false);
  const [form,    setForm]    = useState({ name: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showPass, setShowPass] = useState(false);

  useEffect(() => {
    if (!token) { setInvalid(true); setLoading(false); return; }
    authAPI.validateInvite(token)
      .then(data => { setInvite(data); setLoading(false); })
      .catch(() => { setInvalid(true); setLoading(false); });
  }, [token]);

  async function submit(e) {
    e.preventDefault();
    if (form.password.length < 8) return toast.error('Password must be at least 8 characters');
    if (form.password !== form.confirm) return toast.error('Passwords do not match');
    if (!form.name.trim()) return toast.error('Name required');
    setSubmitting(true);
    try {
      const res = await authAPI.acceptInvite({ token, name: form.name.trim(), password: form.password });
      setAuth(res.token, res.user, res.firm);
      toast.success(`Welcome to ${res.firm.name}!`);
      navigate('/');
    } catch (err) {
      toast.error(err?.error || err?.response?.data?.error || 'Failed to accept invitation');
    } finally { setSubmitting(false); }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (invalid) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="text-center text-white max-w-sm">
        <div className="text-5xl mb-6">🔗</div>
        <h2 className="text-xl font-semibold mb-3">Invite link expired</h2>
        <p className="text-slate-400 text-sm mb-6">This invitation link is invalid or has expired. Ask your manager to send a new invitation.</p>
      </div>
    </div>
  );

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
          <h1 className="text-2xl font-semibold text-white">You're invited!</h1>
          <p className="text-slate-400 text-sm mt-1">Join {invite?.firmName} on FinStatement</p>
        </div>

        <div className="rounded-3xl p-8 shadow-2xl" style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(40px)' }}>
          <div className="mb-6 p-3 rounded-xl text-center" style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }}>
            <p className="text-xs text-indigo-300 mb-0.5">Joining as</p>
            <p className="text-white font-medium text-sm">{invite?.email}</p>
            <p className="text-indigo-400 text-xs mt-0.5">Role: {invite?.role}</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Your full name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Priya Sharma"
                required
                className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-slate-500 border border-white/10 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all"
                style={{ background: 'rgba(255,255,255,0.06)' }}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Create password</label>
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
            </div>

            <button
              type="submit"
              disabled={submitting || form.password !== form.confirm || form.password.length < 8}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 mt-2"
              style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
            >
              {submitting ? 'Creating account...' : 'Accept & Create Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
