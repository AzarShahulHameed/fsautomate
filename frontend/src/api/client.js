// src/api/client.js
import axios from 'axios';
 
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL
    ? `${import.meta.env.VITE_API_BASE_URL}/api`
    : 'http://localhost:4000/api',
  withCredentials: true, // sends the httpOnly auth cookie automatically
  timeout: 60000,
});
 
// No auth-token interceptor needed anymore — the backend sets an httpOnly
// cookie on login/invite-accept/OAuth, and withCredentials above makes the
// browser attach it automatically. We no longer read a JWT out of
// localStorage and never had a token to hand it (an XSS bug anywhere in the
// app could otherwise read it straight out of storage and exfiltrate it).
 
// CSRF protection: the backend also sets a second, readable cookie
// (fs_csrf) alongside the httpOnly auth cookie. Every state-changing
// request must echo its value back in a header — see backend/src/utils/csrf.js
// for why (short version: SameSite=None auth cookies are needed for the
// cross-site Vercel/Render setup, and that alone is forgeable by a
// malicious page's auto-submitting form; a header isn't, since a foreign
// page can't read this cookie to copy it).
function readCookie(name) {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}
 
const CSRF_METHODS = new Set(['post', 'put', 'patch', 'delete']);
 
api.interceptors.request.use((config) => {
  if (CSRF_METHODS.has((config.method || '').toLowerCase())) {
    const csrfToken = readCookie('fs_csrf');
    if (csrfToken) config.headers['X-CSRF-Token'] = csrfToken;
  }
  return config;
});
 
api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (err.response?.status === 401) {
      window.location.href = '/login';
    }
    return Promise.reject(err?.response?.data || err);
  }
);
 
export default api;
 
export const authAPI = {
  login:          (data) => api.post('/auth/login', data),
  register:       (data) => api.post('/auth/register', data),
  logout:         ()     => api.post('/auth/logout'),
  me:             ()     => api.get('/auth/me'),
  savePageState:  (ps)   => api.patch('/auth/page-state', { pageState: ps }),
  getPageState:   ()     => api.get('/auth/page-state'),
  updateProfile:  (data) => api.patch('/auth/profile', data),
  changePassword: (data) => api.patch('/auth/password', data),
  updateFirm:     (data) => api.patch('/auth/firm', data),
  forgotPassword: (email)           => api.post('/auth/forgot-password', { email }),
  resetPassword:  (token, password) => api.post('/auth/reset-password',  { token, password }),
  invite:         (email, role)     => api.post('/auth/invite',           { email, role }),
  validateInvite: (token)           => api.get(`/auth/invite/${token}`),
  acceptInvite:   (data)            => api.post('/auth/accept-invite',    data),
  listUsers:      ()                => api.get('/auth/users'),
  changeRole:     (id, role)        => api.patch(`/auth/users/${id}/role`, { role }),
  deactivateUser: (id)              => api.patch(`/auth/users/${id}/deactivate`),
};
 
export const clientAPI = {
  list:   ()         => api.get('/clients'),
  get:    (id)       => api.get(`/clients/${id}`),
  create: (data)     => api.post('/clients', data),
  update: (id, data) => api.put(`/clients/${id}`, data),
  delete: (id)       => api.delete(`/clients/${id}`),
};
 
export const engagementAPI = {
  list:                (clientId)        => api.get(`/engagements/client/${clientId}`),
  get:                 (id)              => api.get(`/engagements/${id}`),
  create:              (clientId, data)  => api.post('/engagements', { ...data, clientId }),
  update:              (id, data)        => api.put(`/engagements/${id}`, data),
  lock:                (id, lock)        => api.patch(`/engagements/${id}/lock`, { lock }),
  validation:          (id)              => api.get(`/engagements/${id}/validation-checks`),
  runValidation:       (id)              => api.post(`/engagements/${id}/validation-checks`),
  setStatus:           (id, status)      => api.patch(`/engagements/${id}/status`, { status }),
  delete:              (id)              => api.delete(`/engagements/${id}`),
  listEngagementUsers: (eid)             => api.get(`/engagements/${eid}/users`),
  assignUser:          (eid, uid, role)  => api.post(`/engagements/${eid}/users`, { userId: uid, role }),
  removeEngagementUser:(eid, uid)        => api.delete(`/engagements/${eid}/users/${uid}`),
};
 
export const tbAPI = {
  upload: (eid, file, isPriorYear = false, label = null) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('isPriorYear', String(isPriorYear));
    if (label) fd.append('label', label);
    return api.post(`/tb/${eid}/upload`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });
  },
  latest:       (eid)                              => api.get(`/tb/${eid}/latest`),
  versions:     (eid)                              => api.get(`/tb/${eid}/versions`),
  diff:         (eid, vid)                         => api.get(`/tb/${eid}/versions/${vid}/diff`),
  previousYear: (eid)                              => api.get(`/tb/${eid}/previous-year`),
  copyPriorYear:(eid, sourceEngagementId, label)   => api.post(`/tb/${eid}/copy-prior-year`, { sourceEngagementId, label }),
};
 
export const mappingAPI = {
  status:   (eid)            => api.get(`/mapping/${eid}/status`),
  autoMap:  (eid)            => api.post(`/mapping/${eid}/auto`),
  save:     (eid, data)      => api.put(`/mapping/${eid}/manual`, data),
  master:   (method, search) => api.get(`/mapping/master`, { params: { method, search } }),
  copyFrom: (eid, srcEid)    => api.post(`/mapping/${eid}/copy-from/${srcEid}`),
  deleteRow:(eid, sg)        => api.delete(`/mapping/${eid}/row/${encodeURIComponent(sg)}`),
};
 
export const fsAPI = {
  generate: (eid) => api.post(`/fs/${eid}/generate`),
  get:      (eid) => api.get(`/fs/${eid}`),
};
 
export const notesAPI = {
  generate:    (eid)            => api.post(`/notes/${eid}/generate`),
  get:         (eid)            => api.get(`/notes/${eid}`),
  saveContent: (eid, ngid, txt) => api.patch(`/notes/${eid}/${ngid}/content`, { noteContent: txt }),
};
 
export const reportAPI = {
  sections:    (eid)            => api.get(`/report/${eid}/sections`),
  saveSection: (eid, sid, data) => api.put(`/report/${eid}/sections/${sid}`, data),
  toggleVis:   (eid, sid, v)   => api.patch(`/report/${eid}/sections/${sid}/visibility`, { isVisible: v }),
  reorder:     (eid, order)    => api.patch(`/report/${eid}/sections/reorder`, { order }),
};
 
const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
 
export const exportAPI = {
  word:  (eid) => axios.get(`${BASE}/api/export/${eid}/word`,  { responseType: 'blob', withCredentials: true }).then(r => r.data),
  excel: (eid) => axios.get(`${BASE}/api/export/${eid}/excel`, { responseType: 'blob', withCredentials: true }).then(r => r.data),
  fsGroupings: (method) => {
    return fetch(`${BASE}/api/mapping/master/download?method=${encodeURIComponent(method || '')}`, {
      credentials: 'include',
    }).then(r => { if (!r.ok) throw new Error('Download failed'); return r.blob(); });
  },
};
 
export const uploadAPI = {
  avatar: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/upload/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
};
 
export const schedulesAPI = {
  getPPE:            (eid)       => api.get(`/schedules/${eid}/ppe`),
  savePPE:           (eid,id,d)  => api.put(`/schedules/${eid}/ppe/${id}`, d),
  addPPE:            (eid,d)     => api.post(`/schedules/${eid}/ppe`, d),
  deletePPE:         (eid,id)    => api.delete(`/schedules/${eid}/ppe/${id}`),
  getIntangibles:    (eid)       => api.get(`/schedules/${eid}/intangibles`),
  saveIntangible:    (eid,id,d)  => api.put(`/schedules/${eid}/intangibles/${id}`, d),
  addIntangible:     (eid,d)     => api.post(`/schedules/${eid}/intangibles`, d),
  deleteIntangible:  (eid,id)    => api.delete(`/schedules/${eid}/intangibles/${id}`),
  getRelatedParties: (eid)       => api.get(`/schedules/${eid}/related-parties`),
  addParty:          (eid,d)     => api.post(`/schedules/${eid}/related-parties`, d),
  updateParty:       (eid,id,d)  => api.put(`/schedules/${eid}/related-parties/${id}`, d),
  deleteParty:       (eid,id)    => api.delete(`/schedules/${eid}/related-parties/${id}`),
  addTransaction:    (eid,pid,d) => api.post(`/schedules/${eid}/related-parties/${pid}/transactions`, d),
  updateTransaction: (eid,tid,d) => api.put(`/schedules/${eid}/transactions/${tid}`, d),
  deleteTransaction: (eid,tid)   => api.delete(`/schedules/${eid}/transactions/${tid}`),
  getEPS:            (eid)       => api.get(`/schedules/${eid}/eps`),
  saveEPS:           (eid,d)     => api.put(`/schedules/${eid}/eps`, d),
  getDeferredTax:    (eid)       => api.get(`/schedules/${eid}/deferred-tax`),
  addDTItem:         (eid,d)     => api.post(`/schedules/${eid}/deferred-tax`, d),
  saveDTItem:        (eid,id,d)  => api.put(`/schedules/${eid}/deferred-tax/${id}`, d),
  deleteDTItem:      (eid,id)    => api.delete(`/schedules/${eid}/deferred-tax/${id}`),
  getFinInstruments: (eid)       => api.get(`/schedules/${eid}/financial-instruments`),
  saveFinInstruments:(eid,d)     => api.put(`/schedules/${eid}/financial-instruments`, d),
  getContingencies:  (eid)       => api.get(`/schedules/${eid}/contingencies`),
  addContingency:    (eid,d)     => api.post(`/schedules/${eid}/contingencies`, d),
  saveContingency:   (eid,id,d)  => api.put(`/schedules/${eid}/contingencies/${id}`, d),
  deleteContingency: (eid,id)    => api.delete(`/schedules/${eid}/contingencies/${id}`),
};
 
export const prefsAPI = {
  get:  ()     => api.get('/preferences'),
  save: (data) => api.patch('/preferences', data),
};
 
export const otpAPI = {
  send:   (type, target)       => api.post('/otp/send',   { type, target }),
  verify: (type, target, otp)  => api.post('/otp/verify', { type, target, otp }),
};
 
export const shareAPI = {
  create: (eid, expiryDays, label) => api.post(`/share/${eid}`, { expiryDays, label }),
  list:   (eid)                    => api.get(`/share/${eid}/links`),
  revoke: (token)                  => api.delete(`/share/links/${token}`),
};
 
export const billingAPI = {
  plan:          ()            => api.get('/billing/plan'),
  createOrder:   (targetPlan) => api.post('/billing/create-order',   { targetPlan }),
  verifyPayment: (data)        => api.post('/billing/verify-payment', data),
  cancel:        ()            => api.post('/billing/cancel'),
};
 
export const dataExportAPI = {
  download: () => axios.get(`${BASE}/api/data-export`, {
    responseType: 'blob', withCredentials: true
  }).then(r => r.data),
};