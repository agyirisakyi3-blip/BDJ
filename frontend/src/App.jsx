import { useState, useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { AppProvider, useApp } from './contexts/AppContext';
import HomePage from './pages/HomePage';
import AdminPage from './pages/AdminPage';
import BottomNav from './components/layout/BottomNav';
import OfflinePill from './components/layout/OfflinePill';
import Feedback from './components/shared/Feedback';
import ConsentBanner from './components/shared/ConsentBanner';
import HelpModal from './components/modals/HelpModal';
import HistoryModal from './components/modals/HistoryModal';

function AppContent() {
  const { consent } = useApp();
  const [showHelp, setShowHelp] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  if (!consent) {
    return (
      <>
        <div className="bg-decor" aria-hidden="true">
          <div className="blob blob-1"></div>
          <div className="blob blob-2"></div>
          <div className="blob blob-3"></div>
          <div className="grain"></div>
        </div>
        <ConsentBanner />
      </>
    );
  }

  return (
    <>
      <div className="bg-decor" aria-hidden="true">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
        <div className="grain"></div>
      </div>
      <OfflinePill />
      <main className="app">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </main>
      <BottomNav
        onShowHistory={() => setShowHistory(true)}
        onShowHelp={() => setShowHelp(true)}
      />
      <Feedback />
      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
      <HistoryModal isOpen={showHistory} onClose={() => setShowHistory(false)} />
    </>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </HashRouter>
  );
}
