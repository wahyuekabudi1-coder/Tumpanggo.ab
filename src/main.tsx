import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import './index.css';

// Runtime Safety Note:
// Do NOT assign or define properties on `window.fetch` or `globalThis.fetch`.
// In Google AI Studio sandboxed iframes, `window.fetch` has only a getter and throws TypeError if assigned.
// All API calls must use `apiFetch` from `./utils/apiClient.ts`.

// Safe alert shim for sandboxed environments where window.alert is blocked
if (typeof window !== 'undefined') {
  try {
    const originalAlert = window.alert;
    window.alert = function (message?: any) {
      try {
        originalAlert.call(window, message);
      } catch {
        console.warn('[Alert blocked by sandbox]:', message);
        try {
          const toast = document.createElement('div');
          toast.style.cssText = 'position:fixed;top:1rem;right:1rem;z-index:999999;max-width:360px;background:#0f172a;color:#fff;padding:12px 16px;border-radius:12px;box-shadow:0 10px 25px -5px rgba(0,0,0,0.3);font-size:14px;border:1px solid #334155;font-family:sans-serif;';
          toast.textContent = String(message ?? '');
          document.body.appendChild(toast);
          setTimeout(() => toast.remove(), 4000);
        } catch {}
      }
    };
  } catch {}
}

// Mark JS execution milestone
if (typeof window !== 'undefined') {
  (window as any).__TUMPANG_STARTUP = { stage: 'JS_INITIALIZED', time: Date.now() };
  const statusEl = document.getElementById('startup-status');
  const subEl = document.getElementById('startup-sub');
  if (statusEl) statusEl.textContent = 'Menginisialisasi React...';
  if (subEl) subEl.textContent = 'Merender komponen antarmuka tumpangGo...';
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary fallbackTitle="tumpangGo - Kendala Tampilan">
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
  console.log('[tumpangGo Boot] React createRoot.render executed.');
} else {
  console.error('Fatal: Failed to find #root element in document.');
}
