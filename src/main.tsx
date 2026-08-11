import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { devError } from './core/logging';
import { ensureInventorySeeded } from './services/inventory-seed';
import { bootstrapCentralInventory } from './services/inventory-central-service';

window.addEventListener('error', (event) => {
  devError('[FOCUS ERROR]', event.message, event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  devError('[FOCUS UNHANDLED REJECTION]', event.reason);
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
