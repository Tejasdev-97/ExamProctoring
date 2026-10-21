/**
 * ExamProctor.ai — Axios API client
 * Base URL from env; attaches auth token; handles 401 globally.
 */

import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,   // send httpOnly cookie
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// Attach Bearer token from localStorage (fallback when cookie unavailable)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ep_access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Global 401 handler — clear token and redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('ep_access_token');
      // Only redirect to /login if on a protected route (not on public landing or login page)
      if (!window.location.pathname.startsWith('/login') && window.location.pathname !== '/') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
