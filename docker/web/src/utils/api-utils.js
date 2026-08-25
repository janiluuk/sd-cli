/**
 * Fetch helper with structured console errors (audit post-remediation polish).
 */
const CONTROL_TOKEN_STORAGE_KEY = 'defora_control_token';
let fetchInterceptorInstalled = false;

function getStoredControlToken() {
  if (typeof localStorage === 'undefined') return '';
  try {
    return localStorage.getItem(CONTROL_TOKEN_STORAGE_KEY) || '';
  } catch (_) {
    return '';
  }
}

function shouldAttachApiToken(input) {
  if (typeof window === 'undefined' || typeof URL === 'undefined') return false;
  const rawUrl = typeof input === 'string' || input instanceof URL
    ? input
    : input && typeof input.url === 'string'
      ? input.url
      : null;
  if (!rawUrl) return false;
  try {
    const url = new URL(rawUrl, window.location.origin);
    return url.origin === window.location.origin && url.pathname.startsWith('/api');
  } catch (_) {
    return false;
  }
}

function withControlTokenHeaders(input, options = {}) {
  const token = getStoredControlToken();
  if (!token || !shouldAttachApiToken(input) || typeof Headers === 'undefined') {
    return options;
  }
  const headers = new Headers(options.headers || undefined);
  if (!headers.has('Authorization') && !headers.has('X-API-Token') && !headers.has('X-Control-Token')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return {
    ...options,
    headers,
  };
}

export function installApiTokenFetchInterceptor() {
  if (fetchInterceptorInstalled || typeof window === 'undefined' || typeof window.fetch !== 'function') {
    return;
  }
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, options = {}) => nativeFetch(input, withControlTokenHeaders(input, options));
  fetchInterceptorInstalled = true;
}

export async function apiFetch(url, options = {}, context = 'API') {
  const label = context || url;
  try {
    const res = await fetch(url, withControlTokenHeaders(url, options));
    let data = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try {
        data = await res.json();
      } catch (_) {
        data = null;
      }
    } else {
      const text = await res.text();
      if (text) data = { _raw: text.slice(0, 200) };
    }
    if (!res.ok) {
      const detail = (data && (data.error || data.message)) || res.statusText || `HTTP ${res.status}`;
      console.error(`[Defora ${label}] ${res.status}: ${detail}`, data || '');
      const err = new Error(detail);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return { res, data };
  } catch (err) {
    if (err.status) throw err;
    console.error(`[Defora ${label}] Network error: ${err.message}`);
    throw err;
  }
}

export function modelSourceLabel(source) {
  if (source === 'sd-forge') return 'Forge';
  if (source === 'cache') return 'Cache';
  if (source === 'placeholder') return 'Placeholder';
  if (source === 'unavailable') return 'Unavailable';
  return source || 'Unknown';
}
