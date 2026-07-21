import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './AppSocial';
import './brand-avatar-sync';
import './neo.css';
import './monthly.css';
import './profile-photo.css';
import './nav-icons.css';
import './saka.css';
import './avatar-fallback.css';
import './loading-screen.css';
import './app-premium.css';
import './nothing-modern.css';
import './friends-app.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.filter((key) => key.startsWith('ritmo-')).map((key) => caches.delete(key)));
  });
}
