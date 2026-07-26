import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

window.addEventListener('error', (event) => {
  console.error('[FOCUS ERROR]', event.message, event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[FOCUS UNHANDLED REJECTION]', event.reason);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
