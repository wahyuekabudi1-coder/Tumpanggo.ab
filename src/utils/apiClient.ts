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

  return window.fetch(input, { ...init, headers });
}

export default apiFetch;
