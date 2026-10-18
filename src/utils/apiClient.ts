/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food & Shop Unified Safe API Client
 * Wraps browser native fetch safely WITHOUT modifying window.fetch.
 * Automatically injects authentication tokens and headers for protected endpoints.
 */

import { safeStorage } from './safeStorage';

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = safeStorage.getItem('tumpang_auth_token') || safeStorage.getItem('tumpang_shop_token');
  const email = safeStorage.getItem('tumpang_auth_email');

  let urlString = '';
  if (typeof input === 'string') {
    urlString = input;
  } else if (input instanceof URL) {
    urlString = input.pathname;
  } else if (input && typeof (input as Request).url === 'string') {
    urlString = (input as Request).url;
  }

  const isApiRequest = urlString.startsWith('/api') || urlString.includes('/api/');

  const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined) || {});

  if (isApiRequest && (token || email)) {
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    if (token && !headers.has('x-auth-token')) {
      headers.set('x-auth-token', token);
    }
    if (email && !headers.has('x-auth-email')) {
      headers.set('x-auth-email', email);
    }
  }

  const nativeFetch = typeof window !== 'undefined' && typeof window.fetch === 'function'
    ? window.fetch.bind(window)
    : (typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : fetch);

  const response = await nativeFetch(input, { ...init, headers });

  if (isApiRequest && response.status === 401) {
    console.warn(`[apiClient] 401 Unauthorized for endpoint: ${urlString}`);
  }

  return response;
}

/**
 * Safely extracts and normalizes an array from an API response.
 * Supports:
 * - Direct array payload: [...]
 * - Wrapped payloads: { data: [...] }, { [resourceKey]: [...] }, { items: [...] }, etc.
 *
 * Throws an Error when the response represents an error or cannot be parsed as a collection,
 * ensuring backend errors are properly surfaced to the UI and not silently hidden.
 */
export function extractArrayResponse<T>(json: any, resourceKey?: string): T[] {
  if (Array.isArray(json)) {
    return json as T[];
  }
  if (!json || typeof json !== 'object') {
    throw new Error('Data yang diterima dari server tidak valid (bukan array atau objek).');
  }
  if (json.error || json.detail || json.message) {
    const errorMsg = typeof json.error === 'string'
      ? json.error
      : (typeof json.detail === 'string' ? json.detail : (typeof json.message === 'string' ? json.message : 'Respon error dari server.'));
    throw new Error(errorMsg);
  }
  if (resourceKey && Array.isArray(json[resourceKey])) {
    return json[resourceKey] as T[];
  }
  if (Array.isArray(json.data)) {
    return json.data as T[];
  }
  // Common wrapped collection keys
  const fallbackKeys = ['items', 'results', 'list', 'merchants', 'products', 'categories', 'orders', 'drivers', 'shipments', 'settlements'];
  for (const key of fallbackKeys) {
    if (Array.isArray(json[key])) {
      return json[key] as T[];
    }
  }
  throw new Error(`Respon server tidak memuat data berbentuk daftar array${resourceKey ? ` (${resourceKey})` : ''}.`);
}

/**
 * Convenience helper to fetch and guarantee an array result,
 * throwing informative errors if the HTTP status is not ok or the body isn't a valid array.
 */
export async function fetchArray<T>(input: RequestInfo | URL, resourceKey?: string, init?: RequestInit): Promise<T[]> {
  const res = await apiFetch(input, init);
  if (!res.ok) {
    const errJson = await res.json().catch(() => null);
    const errMsg = errJson?.error || errJson?.detail || errJson?.message || `Gagal memuat data dari server (HTTP ${res.status})`;
    throw new Error(errMsg);
  }
  const json = await res.json();
  return extractArrayResponse<T>(json, resourceKey);
}

export default apiFetch;
