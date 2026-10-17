import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Transparent API authentication interceptor
const originalFetch = window.fetch;
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const token = localStorage.getItem('tumpang_auth_token');
  const email = localStorage.getItem('tumpang_auth_email');

  const isApiRequest = typeof input === 'string' ? input.startsWith('/api') : input instanceof URL ? input.pathname.startsWith('/api') : false;

  if (isApiRequest && (token || email)) {
    const headers = new Headers(init?.headers || {});
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    if (token && !headers.has('x-auth-token')) {
      headers.set('x-auth-token', token);
    }
    if (email && !headers.has('x-auth-email')) {
      headers.set('x-auth-email', email);
    }
    return originalFetch(input, { ...init, headers });
  }
  return originalFetch(input, init);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
