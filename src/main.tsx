import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './AppSocial';
import './neo.css';
import './monthly.css';
import './profile-photo.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => undefined);
  });
}
