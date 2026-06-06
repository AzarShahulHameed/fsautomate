import React, { useEffect } from 'react';
import {
  BrowserRouter, Routes, Route, Navigate,
  useNavigate, useLocation
} from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useStore } from './store';

import Layout              from './components/layout/Layout';
import Login               from './pages/Login';
import Register            from './pages/Register';
import Settings from './pages/Settings';
import Dashboard           from './pages/Dashboard';
import Clients             from './pages/Clients';
import Engagements         from './pages/Engagements';
import TBUpload            from './pages/TBUpload';
import Mapping             from './pages/Mapping';
import FinancialStatements from './pages/FinancialStatements';
import Notes               from './pages/Notes';
import ReportEditor        from './pages/ReportEditor';
import ValidationChecks    from './pages/ValidationChecks';
import Schedules            from './pages/Schedules';

function PrivateRoute({ children }) {
  const token = useStore(s => s.token);
  return token ? children : <Navigate to="/login" replace />;
}

function PageStateRestorer() {
  const { token, restorePageState, setPageRoute } = useStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!token) return;
    restorePageState().then(ps => {
      if (ps?.pageRoute && ps.pageRoute !== '/' && location.pathname === '/') {
        navigate(ps.pageRoute, { replace: true });
      }
    });
  }, [token]);

  useEffect(() => {
    setPageRoute(location.pathname + location.search);
  }, [location.pathname, location.search]);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <PageStateRestorer />
      <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
      <Routes>
        <Route path="/login"           element={<Login />} />
        <Route path="/register"        element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password"  element={<ResetPassword />} />
        <Route path="/accept-invite"   element={<AcceptInvite />} />
        <Route path="/audit-log"       element={<AuditLog />} />
        <Route path="/view/:token"       element={<ClientPortal />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="clients" element={<Clients />} />
          <Route path="clients/:clientId/engagements" element={<Engagements />} />
          <Route path="engagements/:engagementId/tb"         element={<TBUpload />} />
          <Route path="engagements/:engagementId/mapping"    element={<Mapping />} />
          <Route path="engagements/:engagementId/fs"         element={<FinancialStatements />} />
          <Route path="engagements/:engagementId/notes"      element={<Notes />} />
          <Route path="engagements/:engagementId/validation" element={<ValidationChecks />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="engagements/:engagementId/schedules"   element={<Schedules />} />
          <Route path="engagements/:engagementId/report"     element={<ReportEditor />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
