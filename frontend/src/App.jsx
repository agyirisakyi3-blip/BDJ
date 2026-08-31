import { useState, useEffect, Suspense, lazy } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { AppProvider, useApp } from './contexts/AppContext';
import HomePage from './pages/HomePage';
import BottomNav from './components/layout/BottomNav';
import OfflinePill from './components/layout/OfflinePill';
import Feedback from './components/shared/Feedback';
import ConsentBanner from './components/shared/ConsentBanner';
import PageLoader from './components/shared/PageLoader';

const AdminPage = lazy(() => import('./pages/AdminPage'));
const EmployeeDetailPage = lazy(() => import('./pages/EmployeeDetailPage'));
const HelpModal = lazy(() => import('./components/modals/HelpModal'));
const HistoryModal = lazy(() => import('./components/modals/HistoryModal'));

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
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/employe/:email" element={<EmployeeDetailPage />} />
          </Routes>
        </Suspense>
      </main>
      <BottomNav
        onShowHistory={() => setShowHistory(true)}
        onShowHelp={() => setShowHelp(true)}
      />
      <Feedback />
      <Suspense fallback={null}>
        {showHelp && <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />}
        {showHistory && <HistoryModal isOpen={showHistory} onClose={() => setShowHistory(false)} />}
      </Suspense>
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
