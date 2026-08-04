import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { devError } from './core/logging';

window.addEventListener('error', (event) => {
  devError('[FOCUS ERROR]', event.message, event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  devError('[FOCUS UNHANDLED REJECTION]', event.reason);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
