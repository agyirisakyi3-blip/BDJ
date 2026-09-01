import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useEncryptedStorage, lsGet, lsSet } from '../hooks/useEncryptedStorage';
import CONFIG from '../config';
import { api, isConfigured } from '../api';
import { todayStr } from '../utils';

const LS_PROFILE = 'att.profile.v1';
const LS_STATUS = 'att.status.v1';
const LS_QUEUE = 'att.queue.v1';
const LS_ONBOARDED = 'att.onboarded.v1';
const LS_THEME = 'att.theme.v1';
const LS_CONSENT = 'att.consent.v1';
const LS_REMIND = 'att.remind.v1';
const LS_AUTH = 'att.auth.v1';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [profile, setProfileRaw, profileLoaded] = useEncryptedStorage(LS_PROFILE, null);
  const [auth, setAuthRaw, authLoaded] = useEncryptedStorage(LS_AUTH, null);
  const [status, setStatusRaw, statusLoaded] = useEncryptedStorage(LS_STATUS, null);
  const [config, setConfig] = useState({ appName: CONFIG.APP_NAME });
  const [consent, setConsentRaw] = useState(() => {
    try { return localStorage.getItem(LS_CONSENT) === '1'; } catch { return false; }
  });
  const [onboarded, setOnboardedRaw] = useState(() => {
    try { return localStorage.getItem(LS_ONBOARDED) === '1'; } catch { return false; }
  });
  const [themeMode, setThemeModeRaw] = useState(() => {
    try { const t = localStorage.getItem(LS_THEME); return t === 'light' || t === 'dark' ? t : 'auto'; } catch { return 'auto'; }
  });
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminToken, setAdminToken] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [recent, setRecent] = useState([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [week, setWeek] = useState([]);
  const [weekLoading, setWeekLoading] = useState(false);
  const [shift, setShift] = useState(null);
  const [monthSummary, setMonthSummary] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [adminData, setAdminData] = useState(null);
  const [privacyNoticeShown, setPrivacyNoticeShown] = useState(false);

  const tenantFromProfile = useCallback(() => {
    const t = profile && profile.tenant ? String(profile.tenant).trim() : '';
    return t || String(CONFIG.DEFAULT_TENANT || '').trim();
  }, [profile]);

  const apiCall = useCallback((body) => {
    return api(body, tenantFromProfile());
  }, [tenantFromProfile]);

  const showFeedback = useCallback((type, msg, hapticPattern) => {
    setFeedback({ type, msg });
    if (navigator.vibrate) {
      try {
        if (hapticPattern) navigator.vibrate(hapticPattern);
        else if (type === 'success') navigator.vibrate([18, 50, 28]);
        else if (type === 'error') navigator.vibrate([60, 50, 60]);
      } catch {}
    }
    setTimeout(() => setFeedback(null), type === 'info' ? 12000 : 9000);
  }, []);

  const setProfile = useCallback(async (p) => {
    setProfileRaw(p);
  }, [setProfileRaw]);

  const setStatus = useCallback(async (s) => {
    if (s && s.date !== todayStr()) {
      setStatusRaw(null);
    } else {
      setStatusRaw(s);
    }
  }, [setStatusRaw]);

  const setConsent = useCallback((val) => {
    setConsentRaw(val);
    try { localStorage.setItem(LS_CONSENT, val ? '1' : '0'); } catch {}
  }, []);

  const setOnboarded = useCallback(() => {
    setOnboardedRaw(true);
    try { localStorage.setItem(LS_ONBOARDED, '1'); } catch {}
  }, []);

  const login = useCallback(async (user, sessionToken) => {
    await setAuthRaw({ user, sessionToken, ts: Date.now() });
    await setProfileRaw({
      name: user && user.name ? user.name : (profile && profile.name) || '',
      email: user && user.email ? user.email : (profile && profile.email) || '',
      tenant: (user && user.tenant ? String(user.tenant).trim() : '') || (profile && profile.tenant) || '',
      photo: (profile && profile.photo) || '',
    });
  }, [setAuthRaw, setProfileRaw, profile]);

  const logout = useCallback(async () => {
    await setAuthRaw(null);
    await setProfileRaw(null);
    setStatusRaw(null);
    setRecent([]); setWeek([]); setMonthSummary(null);
    setIsAdmin(false);
    setAdminToken('');
    setAdminEmail('');
  }, [setAuthRaw, setProfileRaw, setStatusRaw]);

  // Theme
  useEffect(() => {
    function systemPrefersLight() {
      return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
    }
    function resolveTheme(mode) {
      if (mode === 'light' || mode === 'dark') return mode;
      return systemPrefersLight() ? 'light' : 'dark';
    }
    const resolved = resolveTheme(themeMode);
    document.documentElement.setAttribute('data-theme-mode', themeMode);
    document.documentElement.setAttribute('data-theme', resolved);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved === 'light' ? '#4f46e5' : '#0a1525');
  }, [themeMode]);

  const cycleTheme = useCallback(() => {
    setThemeModeRaw((prev) => {
      const next = prev === 'auto' ? 'light' : prev === 'light' ? 'dark' : 'auto';
      try { localStorage.setItem(LS_THEME, next); } catch {}
      return next;
    });
  }, []);

  // Load config on mount
  useEffect(() => {
    if (!isConfigured()) return;
    api({ action: 'config' })
      .then((res) => {
        if (res.ok && res.config) {
          setConfig((prev) => ({ ...prev, ...res.config }));
        }
      })
      .catch(() => {});
  }, []);

  // Flush offline queue on online
  useEffect(() => {
    const flush = async () => {
      if (!isConfigured()) return;
      let q;
      try { const raw = await lsGet(LS_QUEUE); q = raw ? JSON.parse(raw) : []; } catch { q = []; }
      if (!q.length) return;
      showFeedback('info', 'Synchronisation de ' + q.length + ' pointage' + (q.length > 1 ? 's' : '') + '...');
      const remaining = [];
      let synced = 0;
      let lastRes = null;
      for (const item of q) {
        try {
          const res = await api(item.payload, tenantFromProfile());
          if (res && res.ok) { synced++; lastRes = res; }
        } catch (err) {
          if (err && err.offline) remaining.push(item);
        }
      }
      await lsSet(LS_QUEUE, JSON.stringify(remaining.slice(0, 20)));
      if (remaining.length) {
        showFeedback('warn', remaining.length + ' pointage' + (remaining.length > 1 ? 's' : '') + ' en attente de synchronisation.');
      } else if (synced > 0) {
        if (lastRes && lastRes.ok) {
          const newStatus = {
            date: lastRes.date || todayStr(),
            action: lastRes.action,
            time: lastRes.time,
            office: lastRes.office,
            tenant: lastRes.tenant || tenantFromProfile(),
          };
          setStatus(newStatus);
        }
        showFeedback('success', synced + ' pointage' + (synced > 1 ? 's' : '') + ' hors ligne synchronise' + (synced > 1 ? 's' : '') + '.');
      }
    };
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, [setStatus, showFeedback, tenantFromProfile]);

  // Load recent
  const loadRecent = useCallback(() => {
    if (!profile || !isConfigured()) return;
    setRecentLoading(true);
    apiCall({ action: 'recent', email: profile.email }).then((res) => {
      setRecentLoading(false);
      if (res.ok) setRecent(res.recent || []);
      else if (res.message && !privacyNoticeShown) {
        setPrivacyNoticeShown(true);
        showFeedback('warn', res.message);
      }
    }).catch(() => setRecentLoading(false));
  }, [profile, apiCall, privacyNoticeShown, showFeedback]);

  // Load week
  const loadWeek = useCallback(() => {
    if (!profile || !isConfigured()) return;
    setWeekLoading(true);
    apiCall({ action: 'week', email: profile.email }).then((res) => {
      setWeekLoading(false);
      if (res.ok) {
        setWeek(res.week || []);
        setShift(res.shift && (res.shift.start || res.shift.end) ? res.shift : null);
      } else if (res.message && !privacyNoticeShown) {
        setPrivacyNoticeShown(true);
        showFeedback('warn', res.message);
      }
    }).catch(() => setWeekLoading(false));
  }, [profile, apiCall, privacyNoticeShown, showFeedback]);

  // Load month
  const loadMonth = useCallback(() => {
    if (!profile || !isConfigured()) return;
    apiCall({ action: 'myattendance', email: profile.email }).then((res) => {
      if (res.ok) {
        const prefix = todayStr().slice(0, 7);
        let days = 0, hours = 0, breakMin = 0, late = 0;
        (res.attendance.pairs || []).forEach((p) => {
          if (!p.date || String(p.date).slice(0, 7) !== prefix) return;
          days++;
          if (p.hours != null && !isNaN(p.hours)) hours += p.hours;
          if (p.breakMin) breakMin += p.breakMin;
          if (p.late) late++;
        });
        setMonthSummary({ days, hours, breakMin, late });
      }
    }).catch(() => setMonthSummary(null));
  }, [profile, apiCall]);

  // Refresh admin access
  const refreshAdminAccess = useCallback(() => {
    const email = profile && profile.email ? String(profile.email).trim() : '';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setIsAdmin(false);
      return;
    }
    apiCall({ action: 'admin_check', email }).then((res) => {
      setIsAdmin(!!(res && res.ok && res.isAdmin));
    }).catch(() => setIsAdmin(false));
  }, [profile, apiCall]);

  const value = useMemo(() => ({
    profile, setProfile, profileLoaded,
    auth, authLoaded, authenticated: !!(auth && auth.user),
    login, logout,
    status, setStatus, statusLoaded,
    config, setConfig,
    consent, setConsent,
    onboarded, setOnboarded,
    themeMode, cycleTheme,
    isAdmin, setIsAdmin,
    adminToken, setAdminToken,
    adminEmail, setAdminEmail,
    feedback, showFeedback,
    recent, recentLoading, loadRecent,
    week, weekLoading, loadWeek,
    shift, monthSummary, loadMonth,
    employees, setEmployees,
    admins, setAdmins,
    leaves, setLeaves,
    holidays, setHolidays,
    adminData, setAdminData,
    apiCall, tenantFromProfile,
    refreshAdminAccess,
    privacyNoticeShown,
  }), [
    profile, profileLoaded, status, statusLoaded, config, consent, onboarded, themeMode,
    isAdmin, adminToken, adminEmail, feedback, recent, recentLoading, week, weekLoading,
    shift, monthSummary, employees, admins, leaves, holidays, adminData, privacyNoticeShown,
    auth, authLoaded, login, logout,
    setProfile, setStatus, setConfig, setConsent, setOnboarded, cycleTheme, setIsAdmin,
    setAdminToken, setAdminEmail, showFeedback, loadRecent, loadWeek, loadMonth,
    setEmployees, setAdmins, setLeaves, setHolidays, setAdminData,
    apiCall, tenantFromProfile, refreshAdminAccess,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
