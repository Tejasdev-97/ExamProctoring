/**
 * ExamProctor.ai — Axios API client
 * Base URL from env; attaches auth token; handles 401 globally.
 */

import axios from 'axios';

/**
 * Normalizes the API base URL to ensure it always points to the '/api/v1' route prefix,
 * regardless of whether the environment variable includes trailing slashes or omits the prefix.
 *
 * Examples:
 *   - "https://backend.onrender.com" -> "https://backend.onrender.com/api/v1"
 *   - "https://backend.onrender.com/" -> "https://backend.onrender.com/api/v1"
 *   - "https://backend.onrender.com/api/v1" -> "https://backend.onrender.com/api/v1"
 *   - "https://backend.onrender.com/api/v1/" -> "https://backend.onrender.com/api/v1"
 *   - "" or undefined -> "http://localhost:8000/api/v1"
 */
export function normalizeApiBaseUrl(rawUrl) {
  const url = (rawUrl || '').trim();
  if (!url) {
    return 'http://localhost:8000/api/v1';
  }
  const trimmed = url.replace(/\/+$/, '');
  if (trimmed.endsWith('/api/v1')) {
    return trimmed;
  }
  if (trimmed.endsWith('/api')) {
    return `${trimmed}/v1`;
  }
  return `${trimmed}/api/v1`;
}

const isElectron = typeof window !== 'undefined' && (Boolean(window.electronAPI?.isElectron) || window.location.protocol === 'file:');
const isProd = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.PROD || import.meta.env?.MODE === 'production');

const rawEnvUrl = (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_API_BASE_URL)
  || (typeof process !== 'undefined' && process.env?.VITE_API_BASE_URL)
  || ((isProd || isElectron) ? 'https://examproctor-backend-2yfp.onrender.com/api/v1' : undefined);

export const BASE_URL = normalizeApiBaseUrl(rawEnvUrl);

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,   // send httpOnly cookie
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// Attach Bearer token from localStorage (fallback when cookie unavailable)
api.interceptors.request.use((config) => {
  // Prevent duplicate /api/v1 prefix if a caller passed '/api/v1/...' or 'api/v1/...'
  if (config.url) {
    if (config.url.startsWith('/api/v1/')) {
      config.url = config.url.replace(/^\/api\/v1/, '');
    } else if (config.url.startsWith('api/v1/')) {
      config.url = config.url.replace(/^api\/v1\/?/, '/');
    } else if (config.url === '/api/v1' || config.url === 'api/v1') {
      config.url = '/';
    }
  }

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
    // Diagnostic error logging for API/network visibility in Electron and web
    if (typeof console !== 'undefined') {
      const fullUrl = error.config?.baseURL
        ? `${error.config.baseURL.replace(/\/+$/, '')}/${(error.config.url || '').replace(/^\/+/, '')}`
        : (error.config?.url || 'unknown');
      console.warn(`[API Error] ${error.config?.method?.toUpperCase() || 'REQ'} ${fullUrl} -> ${error.message} (status: ${error.response?.status || 'none'})`);
    }

    if (error.response?.status === 401) {
      localStorage.removeItem('ep_access_token');
      // Only redirect to /login if on a protected route (not on public landing or login page)
      const isElectron = typeof window !== 'undefined' && (Boolean(window.electronAPI?.isElectron) || window.location.protocol === 'file:');
      if (isElectron) {
        if (!window.location.hash.startsWith('#/login')) {
          window.location.hash = '#/login';
        }
      } else {
        if (!window.location.pathname.startsWith('/login') && window.location.pathname !== '/') {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
