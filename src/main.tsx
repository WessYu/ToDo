import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './AppSocial';
import './neo.css';
import './monthly.css';
import './profile-photo.css';
import './nav-icons.css';
import './saka.css';
import './avatar-fallback.css';
import './loading-screen.css';
import './app-premium.css';

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
