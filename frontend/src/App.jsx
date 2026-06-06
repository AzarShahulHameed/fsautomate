// src/App.jsx
import React, { useEffect } from 'react';
import {
  BrowserRouter, Routes, Route, Navigate,
  useNavigate, useLocation,
} from 'react-router-dom';
import { useStore } from './store';
import Layout from './components/layout/Layout';

// ── Auth pages ───────────────────────────────────────────────────────────────
import Login          from './pages/Login';
import Register       from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword  from './pages/ResetPassword';
import AcceptInvite   from './pages/AcceptInvite';
import OAuthCallback  from './pages/OAuthCallback';

// ── Public pages (no auth) ───────────────────────────────────────────────────
import ClientPortal   from './pages/ClientPortal';

// ── Protected pages ──────────────────────────────────────────────────────────
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

// ── Auth guard ────────────────────────────────────────────────────────────────
function PrivateRoute({ children }) {
  const { token } = useStore();
  return token ? children : <Navigate to="/login" replace />;
}

// ── Page state restoration ────────────────────────────────────────────────────
function PageStateRestorer() {
  const { token, restorePageState, setPageRoute } = useStore();
  const navigate  = useNavigate();
  const location  = useLocation();

  useEffect(() => {
    if (!token) return;
    const ps = restorePageState?.();
    if (ps?.pageRoute && ps.pageRoute !== '/' && location.pathname === '/') {
      navigate(ps.pageRoute, { replace: true });
    }
  }, [token]);

  useEffect(() => {
    if (token && setPageRoute) {
      setPageRoute(location.pathname + location.search);
    }
  }, [location.pathname, token]);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <PageStateRestorer />
      <Routes>
        {/* ── Public routes (no auth required) ── */}
        <Route path="/login"           element={<Login />} />
        <Route path="/register"        element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password"  element={<ResetPassword />} />
        <Route path="/accept-invite"   element={<AcceptInvite />} />
        <Route path="/oauth-callback"  element={<OAuthCallback />} />
        <Route path="/view/:token"     element={<ClientPortal />} />

        {/* ── Protected routes (auth required) ── */}
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index                                              element={<Dashboard />} />
          <Route path="clients"                                     element={<Clients />} />
          <Route path="clients/:clientId/engagements"              element={<Engagements />} />
          <Route path="engagements/:engagementId/tb"               element={<TBUpload />} />
          <Route path="engagements/:engagementId/mapping"          element={<Mapping />} />
          <Route path="engagements/:engagementId/fs"               element={<FinancialStatements />} />
          <Route path="engagements/:engagementId/notes"            element={<Notes />} />
          <Route path="engagements/:engagementId/schedules"        element={<Schedules />} />
          <Route path="engagements/:engagementId/validation"       element={<ValidationChecks />} />
          <Route path="engagements/:engagementId/report"           element={<ReportEditor />} />
          <Route path="engagements/:engagementId/export"           element={<Export />} />
          <Route path="settings"                                    element={<Settings />} />
          <Route path="audit-log"                                   element={<AuditLog />} />
        </Route>

        {/* ── Catch-all ── */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
