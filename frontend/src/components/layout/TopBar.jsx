import { useState, useEffect, useRef } from 'react';
import { useApp } from '../../contexts/AppContext';
import { fmtDateLabel, todayStr, fmtHours } from '../../utils';

export default function TopBar({ onProfileClick, onThemeClick, onInstallClick }) {
  const { profile, config, themeMode } = useApp();
  const [time, setTime] = useState('--:--:--');
  const [installPrompt, setInstallPrompt] = useState(null);

  useEffect(() => {
    const tick = () => {
      const n = new Date();
      const p = (x) => String(x).padStart(2, '0');
      setTime(p(n.getHours()) + ':' + p(n.getMinutes()) + ':' + p(n.getSeconds()));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>
        </span>
        <div className="brand-text">
          <h1>{config.appName || 'Presence'}</h1>
          <p className="muted">{fmtDateLabel(new Date())}</p>
        </div>
      </div>
      <div className="topbar-right">
        {installPrompt && (
          <button className="icon-btn" type="button" title="Installer l'application" onClick={handleInstall}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 15 21 19 3 19 3 15"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
        )}
        <div className="live-clock" role="timer" aria-label="Heure actuelle">
          <span className="live-dot" aria-hidden="true"></span>
          <span>{time}</span>
        </div>
        <button className="icon-btn" type="button" title={'Theme : ' + (themeMode === 'auto' ? 'automatique' : themeMode === 'light' ? 'clair' : 'sombre')} onClick={onThemeClick}>
          {themeMode === 'light' ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          ) : themeMode === 'dark' ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor" stroke="none"/></svg>
          )}
        </button>
        <button className="icon-btn" type="button" title="Vos coordonnees" onClick={onProfileClick}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
      </div>
    </header>
  );
}
