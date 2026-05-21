import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api/v1',
  withCredentials: true, // sends httpOnly cookies automatically
  headers: { 'Content-Type': 'application/json' },
});

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

// Response interceptor — auto-refresh on 401 TOKEN_EXPIRED
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 &&
        error.response?.data?.code === 'TOKEN_EXPIRED' &&
        !originalRequest._retry) {

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => api(originalRequest)).catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        await api.post('/auth/refresh');
        processQueue(null);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        // Redirect to login
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ─── Typed API helpers ──────────────────────────────────────────
export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (data) => api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  refresh: () => api.post('/auth/refresh'),
};

export const clientsAPI = {
  list: () => api.get('/clients'),
  get: (id) => api.get(`/clients/${id}`),
  create: (data) => api.post('/clients', data),
  update: (id, data) => api.put(`/clients/${id}`, data),
  delete: (id) => api.delete(`/clients/${id}`),
};

export const engagementsAPI = {
  list: (clientId) => api.get('/engagements', { params: { clientId } }),
  get: (id) => api.get(`/engagements/${id}`),
  create: (data) => api.post('/engagements', data),
  updateStatus: (id, status) => api.patch(`/engagements/${id}/status`, { status }),
};

export const tbAPI = {
  upload: (engagementId, file, onProgress) => {
    const fd = new FormData();
    fd.append('tb_file', file);
    return api.post(`/tb/upload/${engagementId}`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => onProgress && onProgress(Math.round((e.loaded * 100) / e.total)),
    });
  },
  versions: (engagementId) => api.get(`/tb/${engagementId}/versions`),
  data: (engagementId, page = 1) => api.get(`/tb/${engagementId}/data`, { params: { page, limit: 100 } }),
  compare: (engagementId, v1, v2) => api.get(`/tb/${engagementId}/compare`, { params: { v1, v2 } }),
};

export const mappingAPI = {
  list: (engagementId) => api.get(`/mapping/${engagementId}`),
  unmapped: (engagementId) => api.get(`/mapping/${engagementId}/unmapped`),
  update: (engagementId, tbDataId, data) => api.put(`/mapping/${engagementId}/${tbDataId}`, data),
  masterOptions: (engagementId) => api.get(`/mapping/${engagementId}/master-options`),
  saved: (engagementId) => api.get(`/mapping/${engagementId}/saved`),
};

export const fsAPI = {
  full: (engagementId) => api.get(`/financial-statements/${engagementId}`),
  balanceSheet: (engagementId) => api.get(`/financial-statements/${engagementId}/balance-sheet`),
  profitLoss: (engagementId) => api.get(`/financial-statements/${engagementId}/profit-loss`),
  recompute: (engagementId) => api.post(`/financial-statements/${engagementId}/recompute`),
};

export const notesAPI = {
  get: (engagementId) => api.get(`/notes/${engagementId}`),
  groups: (engagementId) => api.get(`/notes/${engagementId}/groups`),
  updateGroup: (engagementId, noteGroupId, data) => api.patch(`/notes/${engagementId}/groups/${noteGroupId}`, data),
};

export const reportAPI = {
  get: (engagementId) => api.get(`/reports/${engagementId}`),
  saveSection: (engagementId, section, data) => api.put(`/reports/${engagementId}/${section}`, data),
  getToc: (engagementId) => api.get(`/reports/${engagementId}/toc`),
  reorderToc: (engagementId, items) => api.put(`/reports/${engagementId}/toc/reorder`, items),
};

export const exportAPI = {
  pdf: (engagementId) => api.get(`/exports/${engagementId}/pdf`, { responseType: 'blob' }),
  excel: (engagementId) => api.get(`/exports/${engagementId}/excel`, { responseType: 'blob' }),
  word: (engagementId) => api.get(`/exports/${engagementId}/word`, { responseType: 'blob' }),
};

export const validationAPI = {
  run: (engagementId) => api.post(`/validation/${engagementId}/run`),
  latest: (engagementId) => api.get(`/validation/${engagementId}/latest`),
};

export const uiStateAPI = {
  save: (pageKey, stateJson) => api.put(`/ui-state/${encodeURIComponent(pageKey)}`, { stateJson }),
  get: (pageKey) => api.get(`/ui-state/${encodeURIComponent(pageKey)}`),
};

export const masterAPI = {
  list: (method, statementType) => api.get('/master', { params: { method, statementType } }),
};

export default api;
