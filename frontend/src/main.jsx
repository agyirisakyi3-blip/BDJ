import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

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
    <App />
  </StrictMode>,
)
