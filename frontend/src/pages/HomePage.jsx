import { useState, useCallback, useEffect, Suspense, lazy } from 'react';
import { useApp } from '../contexts/AppContext';
import { api, isConfigured } from '../api';
import { parseQr, todayStr } from '../utils';
import { lsGet, lsSet } from '../hooks/useEncryptedStorage';
import TopBar from '../components/layout/TopBar';
import StatusCard from '../components/home/StatusCard';
import ScheduleCard from '../components/home/ScheduleCard';
import AnnouncementsCard from '../components/home/AnnouncementsCard';
import ScanButton from '../components/home/ScanButton';
import BreakControls from '../components/home/BreakControls';
import RecentActivity from '../components/home/RecentActivity';
import WeekChart from '../components/home/WeekChart';
import MonthSummary from '../components/home/MonthSummary';
import SetupBanner from '../components/shared/SetupBanner';
import ScanSuccess from '../components/shared/ScanSuccess';

const ScannerModal = lazy(() => import('../components/modals/ScannerModal'));
const SelfieModal = lazy(() => import('../components/modals/SelfieModal'));
const ProfileModal = lazy(() => import('../components/modals/ProfileModal'));
const OnboardingModal = lazy(() => import('../components/modals/OnboardingModal'));

const LS_QUEUE = 'att.queue.v1';

export default function HomePage() {
  const {
    profile, setStatus, status, config, showFeedback,
    loadRecent, loadWeek, loadMonth, apiCall, tenantFromProfile,
    cycleTheme, refreshAdminAccess, onboarded,
  } = useApp();

  const [showScanner, setShowScanner] = useState(false);
  const [showSelfie, setShowSelfie] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [scanSuccess, setScanSuccess] = useState({ show: false, action: '', time: '', name: '' });
  const [pendingPayload, setPendingPayload] = useState(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!profile && !onboarded) {
      setTimeout(() => setShowOnboarding(true), 1000);
    }
  }, [onboarded, profile]);

  useEffect(() => {
    if (profile) {
      loadRecent();
      loadWeek();
      loadMonth();
    }
  }, [profile]);

  const showScanSuccess = useCallback((action, time, name) => {
    setScanSuccess({ show: true, action, time, name });
    setTimeout(() => setScanSuccess({ show: false, action: '', time: '', name: '' }), 2000);
  }, []);

  const postAttendance = useCallback(async (payload) => {
    setProcessing(true);
    showFeedback('info', 'Traitement de votre scan...');
    try {
      const res = await apiCall(payload);
      setProcessing(false);
      if (!res.ok) {
        if (res.code === 'SELFIE_REQUIRED') {
          setPendingPayload(payload);
          setShowSelfie(true);
          return;
        }
        showFeedback('error', res.message || 'Échec du pointage.');
        return;
      }
      const prev = status;
      const newStatus = {
        date: res.date || todayStr(),
        action: res.action,
        time: res.time,
        office: res.office,
        tenant: payload.tenant || tenantFromProfile(),
        breakMinToday: res.breakMinToday || 0,
      };
      if (res.action === 'Check-in') newStatus.checkinTime = res.time;
      else newStatus.checkinTime = (prev && prev.checkinTime) || null;
      setStatus(newStatus);
      loadRecent(); loadWeek(); loadMonth();
      showScanSuccess(res.action, res.time, profile?.name);
      const loc = res.office ? ' à ' + res.office : '';
      let msg;
      if (res.action === 'Check-in') msg = 'Vous êtes passé' + (loc || '') + ' à ' + res.time + '.';
      else if (res.action === 'Check-out') msg = 'Vous êtes sorti' + loc + ' à ' + res.time + '.';
      else if (res.action === 'Break-out') msg = 'Pause démarrée à ' + res.time + '.';
      else msg = 'On reprend le travail à ' + res.time + '.';
      showFeedback('success', msg);
    } catch (err) {
      setProcessing(false);
      if (err && err.offline) {
        const queueItem = { queuedAt: Date.now(), payload: { ...payload } };
        delete queueItem.payload.photoDataUrl;
        let q;
        try { const raw = await lsGet(LS_QUEUE); q = raw ? JSON.parse(raw) : []; } catch { q = []; }
        q.push(queueItem);
        await lsSet(LS_QUEUE, JSON.stringify(q.slice(0, 20)));
        showFeedback('info', 'Hors ligne. Votre pointage sera synchronisé automatiquement.');
      } else {
        showFeedback('error', 'Impossible de joindre le serveur : ' + err.message);
      }
    }
  }, [apiCall, config, profile, status, setStatus, loadRecent, loadWeek, loadMonth, showFeedback, showScanSuccess, tenantFromProfile]);

  const handleScan = useCallback((text) => {
    if (processing) return;
    setProcessing(true);
    setShowScanner(false);

    if (!text) {
      setProcessing(false);
      showFeedback('error', 'Aucun QR code détecté.');
      return;
    }

    if (navigator.vibrate) try { navigator.vibrate(18); } catch {}

    setTimeout(() => {
      if (!config) { showFeedback('warn', 'Paramètres en cours de chargement.'); setProcessing(false); return; }
      if (!profile) { showFeedback('warn', 'Définissez vos coordonnées.'); setShowProfile(true); setProcessing(false); return; }

      const parsed = parseQr(text);
      const tenant = parsed.tenant || tenantFromProfile();
      const token = parsed.token || text;
      const payload = {
        action: 'attendance', tenant, qr: token,
        name: profile.name, email: profile.email, ts: Date.now(),
      };

      const willCheckIn = !status || status.action !== 'Check-in';
      if (willCheckIn && config.selfieMode === 'required') {
        setPendingPayload(payload);
        setShowSelfie(true);
        setProcessing(false);
        return;
      }
      postAttendance(payload);
    }, 200);
  }, [processing, config, profile, status, showFeedback, postAttendance, tenantFromProfile]);

  const handleSelfieCapture = (dataUrl) => {
    if (pendingPayload && dataUrl) {
      postAttendance({ ...pendingPayload, photoDataUrl: dataUrl });
    }
    setPendingPayload(null);
  };

  const handleBreak = (mode) => {
    if (!profile) return;
    postAttendance({
      action: 'attendance', tenant: tenantFromProfile(), qr: '',
      mode, name: profile.name, email: profile.email, ts: Date.now(),
    });
  };

  return (
    <>
      <TopBar
        onProfileClick={() => setShowProfile(true)}
        onThemeClick={cycleTheme}
      />
      <SetupBanner />
      <StatusCard />

      <div className="action-zone">
        <ScanButton onScan={() => {
          if (!config) { showFeedback('warn', 'Paramètres en cours de chargement.'); return; }
          if (!profile) { setShowProfile(true); return; }
          setShowScanner(true);
        }} />
        <BreakControls onFeedback={showFeedback} />
      </div>

      <div className="info-zone">
        <ScheduleCard />
        <AnnouncementsCard />
        <RecentActivity />
        <WeekChart />
        <MonthSummary />
      </div>

      <Suspense fallback={null}>
        <ScannerModal isOpen={showScanner} onClose={() => setShowScanner(false)} onScan={handleScan} />
        <SelfieModal isOpen={showSelfie} onClose={() => { setShowSelfie(false); setPendingPayload(null); }} onCapture={handleSelfieCapture} />
        <ProfileModal isOpen={showProfile} onClose={() => setShowProfile(false)} />
        <OnboardingModal isOpen={showOnboarding} onClose={() => setShowOnboarding(false)} />
      </Suspense>
      <ScanSuccess {...scanSuccess} />
    </>
  );
}
