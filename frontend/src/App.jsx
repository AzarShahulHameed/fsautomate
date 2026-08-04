
// src/App.jsx
import React, { useEffect, useState } from 'react';
import {
  BrowserRouter, Routes, Route, Navigate,
  useNavigate, useLocation,
} from 'react-router-dom';
import { useStore } from './store';
import Layout from './components/layout/Layout';
 
// ── Auth pages ────────────────────────────────────────────────────────────────
import Login          from './pages/Login';
import Register       from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword  from './pages/ResetPassword';
import AcceptInvite   from './pages/AcceptInvite';
import OAuthCallback  from './pages/OAuthCallback';
 
// ── Public pages ──────────────────────────────────────────────────────────────
import ClientPortal   from './pages/ClientPortal';
 
// ── Protected pages ───────────────────────────────────────────────────────────
import Dashboard           from './pages/Dashboard';
import Clients             from './pages/Clients';
import Engagements         from './pages/Engagements';
import TBUpload            from './pages/TBUpload';
import Mapping             from './pages/Mapping';
import FinancialStatements from './pages/FinancialStatements';
import Notes               from './pages/Notes';
import ValidationChecks    from './pages/ValidationChecks';
import Schedules           from './pages/Schedules';
import ReportEditor        from './pages/ReportEditor';
import Export              from './pages/Export';
import Settings            from './pages/Settings';
import AuditLog            from './pages/AuditLog';
 
// ── Error Boundary — shows the actual error instead of blank page ─────────────
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: '40px', maxWidth: '700px', margin: '60px auto',
          fontFamily: 'monospace', background: '#fff1f2',
          border: '1px solid #fca5a5', borderRadius: '12px'
        }}>
          <h2 style={{ color: '#b91c1c', marginBottom: '12px' }}>
            🔴 Page crashed — error details below
          </h2>
          <pre style={{
            background: '#fff', padding: '16px', borderRadius: '8px',
            fontSize: '13px', overflowX: 'auto', whiteSpace: 'pre-wrap',
            border: '1px solid #fca5a5', color: '#1e293b'
          }}>
            {this.state.error?.message}
            {'\n\n'}
            {this.state.error?.stack?.slice(0, 1200)}
          </pre>
          <button
            onClick={() => { this.setState({ error: null }); window.location.href = '/'; }}
            style={{
              marginTop: '20px', padding: '10px 20px',
              background: '#ef4444', color: 'white',
              border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px'
            }}
          >
            ← Go back to Dashboard
          </button>
          <p style={{ color: '#64748b', fontSize: '12px', marginTop: '12px' }}>
            Screenshot this error and share it for a fix.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
 
// ── Auth guard ────────────────────────────────────────────────────────────────
// Auth state now comes from an httpOnly cookie the frontend can't read
// directly, so we can't gate routes on a token value in the store anymore.
// AuthBoot (below) resolves `authChecked` once on app load by calling
// /auth/me; until then, PrivateRoute shows a brief loading state instead of
// bouncing straight to /login (which would flash logged-in users to the
// login page on every refresh).
function PrivateRoute({ children }) {
  const { isAuthenticated, authChecked } = useStore();
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

// ── Auth bootstrap — verifies the httpOnly cookie once per app load ───────────
function AuthBoot() {
  const { checkAuth, authChecked } = useStore();
  useEffect(() => {
    if (!authChecked) checkAuth();
  }, []);
  return null;
}
 
// ── Page state restoration ─────────────────────────────────────────────────────
function PageStateRestorer() {
  const { isAuthenticated, setPageRoute } = useStore();
  const navigate  = useNavigate();
  const location  = useLocation();
 
  useEffect(() => {
    if (isAuthenticated && setPageRoute) {
      setPageRoute(location.pathname + location.search);
    }
  }, [location.pathname, isAuthenticated]);
 
  return null;
}
 
export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AuthBoot />
        <PageStateRestorer />
        <Routes>
          {/* ── Public routes ── */}
          <Route path="/login"           element={<Login />} />
          <Route path="/register"        element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password"  element={<ResetPassword />} />
          <Route path="/accept-invite"   element={<AcceptInvite />} />
          <Route path="/oauth-callback"  element={<OAuthCallback />} />
          <Route path="/view/:token"     element={<ClientPortal />} />
 
          {/* ── Protected routes ── */}
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index                                              element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
            <Route path="clients"                                     element={<ErrorBoundary><Clients /></ErrorBoundary>} />
            <Route path="clients/:clientId/engagements"              element={<ErrorBoundary><Engagements /></ErrorBoundary>} />
            <Route path="engagements/:engagementId/tb"               element={<ErrorBoundary><TBUpload /></ErrorBoundary>} />
            <Route path="engagements/:engagementId/mapping"          element={<ErrorBoundary><Mapping /></ErrorBoundary>} />
            <Route path="engagements/:engagementId/fs"               element={<ErrorBoundary><FinancialStatements /></ErrorBoundary>} />
            <Route path="engagements/:engagementId/notes"            element={<ErrorBoundary><Notes /></ErrorBoundary>} />
            <Route path="engagements/:engagementId/schedules"        element={<ErrorBoundary><Schedules /></ErrorBoundary>} />
            <Route path="engagements/:engagementId/validation"       element={<ErrorBoundary><ValidationChecks /></ErrorBoundary>} />
            <Route path="engagements/:engagementId/report"           element={<ErrorBoundary><ReportEditor /></ErrorBoundary>} />
            <Route path="engagements/:engagementId/export"           element={<ErrorBoundary><Export /></ErrorBoundary>} />
            <Route path="settings"                                    element={<ErrorBoundary><Settings /></ErrorBoundary>} />
            <Route path="audit-log"                                   element={<ErrorBoundary><AuditLog /></ErrorBoundary>} />
          </Route>
 
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
 