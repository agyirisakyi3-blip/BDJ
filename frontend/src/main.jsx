import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './index.css'

// No service worker is registered by this app. Unregistering on startup is a
// deliberate guard: it prevents a stale cache from an older deployment from
// serving outdated JS bundles to returning mobile users.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
    .then(() => (typeof caches === 'undefined'
      ? undefined
      : caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('att-')).map((key) => caches.delete(key))))))
    .catch((error) => console.error('Legacy service worker cleanup failed:', error));
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)