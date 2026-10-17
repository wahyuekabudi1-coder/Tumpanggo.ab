import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import './index.css';

// Runtime Safety Note:
// Do NOT assign or define properties on `window.fetch` or `globalThis.fetch`.
// In Google AI Studio sandboxed iframes, `window.fetch` has only a getter and throws TypeError if assigned.
// All API calls must use `apiFetch` from `./utils/apiClient.ts`.

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
