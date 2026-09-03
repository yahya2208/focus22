import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { devError } from './core/logging';
import { ensureInventorySeeded } from './services/inventory-seed';
import { bootstrapCentralInventory } from './services/inventory-central-service';
import { track } from './core/telemetry';

window.addEventListener('error', (event) => {
  devError('[FOCUS ERROR]', event.message, event.error);
  // Telemetry (Phase 8G): only a structured error_code/count — never the raw
  // message/stack/URL. Global handler reports only errors that escaped every
  // boundary (distinct from the boundary's ui_error).
  void track({ event: 'unhandled_error', properties: { error_code: 'UNHANDLED_ERROR', count: 1 } });
});

window.addEventListener('unhandledrejection', (event) => {
  devError('[FOCUS UNHANDLED REJECTION]', event.reason);
  void track({ event: 'unhandled_error', properties: { error_code: 'UNHANDLED_REJECTION', count: 1 } });
});

// Telemetry (Phase 8G): network_error on a genuine offline transition. Reported
// only when connectivity is actually lost (never for the initial state).
window.addEventListener('offline', () => {
  void track({ event: 'network_error', properties: { error_code: 'OFFLINE' } });
});

// Central inventory bootstrap: hydrates the in-memory caches (public view,
// admin list, movements) once at app boot. Reads are served from those caches.
ensureInventorySeeded();
void bootstrapCentralInventory();

// PWA: register the service worker in production builds only.
// Guarded: SW support check + build-mode check; failures are non-fatal.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker.register(swUrl).catch((err) => {
      devError('[PWA] Service worker registration failed', err);
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
