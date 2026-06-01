// src/api/client.js
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL
    ? `${import.meta.env.VITE_API_BASE_URL}/api`
    : (window.location.hostname === 'localhost'
        ? 'http://localhost:4000/api'
        : 'https://fsautomate.onrender.com/api'),
  withCredentials: true,  // Sends session cookie
  timeout: 60000,
});

// Attach stored JWT token on every request
api.interceptors.request.use((config) => {
  try {
    const raw = localStorage.getItem('finstatement-auth');
    if (raw) {
      const { state } = JSON.parse(raw);
      if (state?.token) {
        config.headers.Authorization = `Bearer ${state.token}`;
      }
    }
  } catch (_) {}
  return config;
});

// Handle 401 globally — clear session and go to login
api.interceptors.response.use(
  (res) => res.data,  // Unwrap .data so callers get objects directly
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('finstatement-auth');
      window.location.href = '/login';
    }
    return Promise.reject(err?.response?.data || err);
  }
);

export default api;

// ─── Auth API ─────────────────────────────────────────────────────────────
export const authAPI = {
  login:          (data) => api.post('/auth/login', data),
  register:       (data) => api.post('/auth/register', data),
  logout:         ()     => api.post('/auth/logout'),
  me:             ()     => api.get('/auth/me'),
  savePageState:  (ps)   => api.patch('/auth/page-state', { pageState: ps }),
  getPageState:   ()     => api.get('/auth/page-state'),
  updateProfile:    (data) => api.patch('/auth/profile', data),
  changePassword:   (data) => api.patch('/auth/password', data),
  updateFirm:       (data) => api.patch('/auth/firm', data),
  forgotPassword:   (data) => api.post('/auth/forgot-password', data),
  resetPassword:    (data) => api.post('/auth/reset-password', data),
};

// ─── Client API ───────────────────────────────────────────────────────────
export const clientAPI = {
  list:   ()         => api.get('/clients'),
  get:    (id)       => api.get(`/clients/${id}`),
  create: (data)     => api.post('/clients', data),
  update: (id, data) => api.put(`/clients/${id}`, data),
  delete: (id)       => api.delete(`/clients/${id}`),
};

// ─── Engagement API ───────────────────────────────────────────────────────
export const engagementAPI = {
  list:       (clientId) => api.get(`/engagements/client/${clientId}`),
  update:     (id, data) => api.patch(`/engagements/${id}`, data),
  delete:     (id)       => api.delete(`/engagements/${id}`),
  get:        (id)       => api.get(`/engagements/${id}`),
  create:     (data)           => api.post('/engagements', data),
  lock:       (id, lock) => api.patch(`/engagements/${id}/lock`, { lock }),
  validation:    (id) => api.get(`/engagements/${id}/validation-checks`),
  runValidation: (id) => api.post(`/engagements/${id}/validation-checks`),
};

// ─── Trial Balance API ────────────────────────────────────────────────────
export const tbAPI = {
  upload: (eid, file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post(`/tb/${eid}/upload`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });
  },
  latest:   (eid)         => api.get(`/tb/${eid}/latest`),
  versions: (eid)         => api.get(`/tb/${eid}/versions`),
  diff:     (eid, vid)    => api.get(`/tb/${eid}/versions/${vid}/diff`),
};

// ─── Mapping API ──────────────────────────────────────────────────────────
export const mappingAPI = {
  status:  (eid)       => api.get(`/mapping/${eid}/status`),
  autoMap: (eid)       => api.post(`/mapping/${eid}/auto`),
  save:    (eid, data) => api.put(`/mapping/${eid}/manual`, data),
  master:  (method, search) => api.get(`/mapping/master`, { params: { method, search } }),
};

// ─── Financial Statements API ─────────────────────────────────────────────
export const fsAPI = {
  generate: (eid) => api.post(`/fs/${eid}/generate`, {}, { timeout: 120000 }),
  get:      (eid) => api.get(`/fs/${eid}`),
};

// ─── Notes API ────────────────────────────────────────────────────────────
export const notesAPI = {
  generate: (eid) => api.post(`/notes/${eid}/generate`),
  get:      (eid) => api.get(`/notes/${eid}`),
};

// ─── Report API ───────────────────────────────────────────────────────────
export const reportAPI = {
  sections:    (eid)            => api.get(`/report/${eid}/sections`),
  saveSection: (eid, sid, data) => api.put(`/report/${eid}/sections/${sid}`, data),
  toggleVis:   (eid, sid, v)   => api.patch(`/report/${eid}/sections/${sid}/visibility`, { isVisible: v }),
  reorder:     (eid, order)    => api.patch(`/report/${eid}/sections/reorder`, { order }),
};

// ─── Export API (blob responses — bypass interceptor) ─────────────────────
const BASE = import.meta.env.VITE_API_BASE_URL || (window.location.hostname === 'localhost' ? 'http://localhost:4000' : 'https://fsautomate.onrender.com');

function authHeader() {
  try {
    const raw = localStorage.getItem('finstatement-auth');
    if (raw) {
      const { state } = JSON.parse(raw);
      if (state?.token) return { Authorization: `Bearer ${state.token}` };
    }
  } catch (_) {}
  return {};
}

// ─── Upload API ───────────────────────────────────────────────────────────────
// ─── Preferences API ─────────────────────────────────────────────────────────
export const prefsAPI = {
  get:  ()     => api.get('/preferences'),
  save: (data) => api.patch('/preferences', data),
};

// ─── OTP API ──────────────────────────────────────────────────────────────────
export const otpAPI = {
  send:   (type, target)       => api.post('/otp/send', { type, target }),
  verify: (type, target, otp)  => api.post('/otp/verify', { type, target, otp }),
};

export const uploadAPI = {
  avatar: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/upload/avatar', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export const exportAPI = {
  word:  (eid) => axios.get(
    `${BASE}/api/export/${eid}/word`,
    { responseType: 'blob', withCredentials: true, headers: authHeader() }
  ).then(r => r.data),
  excel: (eid) => axios.get(
    `${BASE}/api/export/${eid}/excel`,
    { responseType: 'blob', withCredentials: true, headers: authHeader() }
  ).then(r => r.data),
};
