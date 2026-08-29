import {
  todayStr,
  shiftDateStr,
  parseQr,
  fmtDateLabel,
  dayLabel,
  fmtHours,
  timeToMinutes,
  escapeHtml,
  cmpVals,
  avatarInitials,
  avatarHue
} from './utils.js';

(function () {
  'use strict';

  var DEFAULTS = window.ATT_CONFIG || {};
  var API_URL = DEFAULTS.API_URL || '';
  var LS_PROFILE = 'att.profile.v1';
  var LS_STATUS = 'att.status.v1';
  var LS_QUEUE = 'att.queue.v1';
  var LS_ONBOARDED = 'att.onboarded.v1';
  var LS_THEME = 'att.theme.v1';
  var LS_CONSENT = 'att.consent.v1';
  var LS_REMIND = 'att.remind.v1';
  var LS_SESSION = 'att.session.v1';

  var state = {
    session: null,
    profile: null,
    config: defaultsConfig(),
    status: null,
    qrScanner: null,
    admin: null,
    adminEmail: '',
    isAdmin: false,
    adminChecking: false,
    pendingScan: false,
    processing: false,
    employees: [],
    admins: [],
    recent: [],
    recentLoading: false,
    week: [],
    weekLoading: false,
    monthSummary: null,
    monthLoading: false,
    privacyNoticeShown: false,
    peopleView: { query: '', sortKey: '', sortDir: 1 },
    reportView: { query: '', sortKey: '', sortDir: 1 },
    leaves: [],
    holidays: [],
    selfieStream: null,
    selfieDeferred: null
  };

  function $(id) { return document.getElementById(id); }

  function tenantFromProfile() {
    var t = state.profile && state.profile.tenant ? String(state.profile.tenant).trim() : '';
    return t || String(DEFAULTS.DEFAULT_TENANT || '').trim();
  }

  function vibrate(pattern) {
    if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) {} }
  }

  function startClock() {
    var clock = $('live-time');
    if (!clock) return;
    var tick = function () {
      var n = new Date();
      var p = function (x) { return String(x).padStart(2, '0'); };
      clock.textContent = p(n.getHours()) + ':' + p(n.getMinutes()) + ':' + p(n.getSeconds());
    };
    tick();
    setInterval(tick, 1000);
  }

  function isConfigured() {
    if (/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(API_URL) &&
        API_URL.indexOf('YOUR_SCRIPT_ID') === -1) return true;
    /* Local dev / test harness: same-origin mock endpoint (e.g. tests/server.js /exec). */
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/exec(\?|$)/.test(API_URL);
  }

  function defaultsConfig() {
    return {
      appName: DEFAULTS.APP_NAME || 'addredance'
    };
  }

  function hasConsent() {
    try { return localStorage.getItem(LS_CONSENT) === '1'; } catch (e) { return false; }
  }

  function setConsent(val) {
    try { localStorage.setItem(LS_CONSENT, val ? '1' : '0'); } catch (e) {}
  }

  function hasOnboarded() {
    try { return localStorage.getItem(LS_ONBOARDED) === '1'; } catch (e) { return false; }
  }

  function hasProfile() {
    return !!(state.profile && state.profile.name && String(state.profile.name).trim() && state.profile.email && String(state.profile.email).trim());
  }

  function init() {
    bindEvents();
    if (!hasConsent()) {
      $('consent-banner').classList.remove('hidden');
      return;
    }
    bootApp();
  }

  function bootApp() {
    initTheme();
    initCollapsibles();
    loadSession().then(function (s) {
      if (!s) {
        showLoginView();
        route();
        return;
      }
      enterApp();
    });
  }

  var sessionListenersBound = false;

  function enterApp() {
    loadProfile().then(function () {
      syncProfileFromSession();
      return loadStatus();
    }).then(function () {
      if (state.status && state.status.date !== todayStr()) {
        state.status = null;
        saveStatus();
      }
      $('today-date').textContent = fmtDateLabel(new Date());
      $('app-name').textContent = defaultsConfig().appName;
      startClock();

      if (!isConfigured()) showSetupBanner();

      renderHome();
      hideLoginView();
      refreshAdminAccess();
      route();

      if (!hasOnboarded()) {
        openOnboarding();
      }

      fetchConfig()
        .then(renderHome)
        .catch(function (err) {
          if (!state.config) state.config = defaultsConfig();
          if (isConfigured()) showFeedback('warn', 'Impossible de charger les parametres du bureau : ' + err.message);
          renderHome();
        });

      if (!sessionListenersBound) {
        sessionListenersBound = true;
        window.addEventListener('online', flushQueue);

        if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
          navigator.serviceWorker.register('sw.js').catch(function () {});
        }
      }

      setTimeout(function () {
        flushQueue();
        loadRecent();
        loadWeek();
        loadMonth();
        initReminders();
      }, 800);
    });
  }

  function bindEvents() {
    $('btn-scan').addEventListener('click', onScanClick);
    $('btn-break').addEventListener('click', onBreakToggle);
    $('btn-selfie-capture').addEventListener('click', captureSelfie);
    $('btn-selfie-retake').addEventListener('click', retakeSelfie);
    $('btn-selfie-use').addEventListener('click', useSelfie);
    $('btn-selfie-cancel').addEventListener('click', cancelSelfie);
    $('btn-profile').addEventListener('click', function () { showProfileModal(); });
    $('btn-profile-save').addEventListener('click', onProfileSave);
    $('btn-scan-cancel').addEventListener('click', closeScanner);
    $('btn-manual-ok').addEventListener('click', onManualQr);
    $('btn-admin').addEventListener('click', function () { location.hash = '#admin'; });
    $('btn-back').addEventListener('click', function () { location.hash = '#home'; });
    $('nav-home').addEventListener('click', function () {
      if (location.hash.indexOf('admin') !== -1) {
        location.hash = '#home';
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
    $('btn-history').addEventListener('click', onHistoryClick);
    $('btn-hist-close').addEventListener('click', function () { hideModal('modal-history'); });
    $('btn-hist-export').addEventListener('click', onHistoryExport);
    $('btn-hist-delete').addEventListener('click', onHistoryDelete);
    $('btn-admin-go').addEventListener('click', onAdminGo);
    $('btn-load').addEventListener('click', onAdminGo);
    $('btn-refresh').addEventListener('click', onAdminGo);
    var qrChips = document.querySelectorAll('.qr-chip');
    for (var qi = 0; qi < qrChips.length; qi++) {
      qrChips[qi].addEventListener('click', onQuickRange);
    }
    $('btn-csv').addEventListener('click', downloadCsv);
    $('btn-people-csv').addEventListener('click', downloadPeopleCsv);
    var peopleSearch = $('people-search');
    if (peopleSearch) peopleSearch.addEventListener('input', function () {
      state.peopleView.query = this.value;
      renderPeople();
    });
    var reportSearch = $('report-search');
    if (reportSearch) reportSearch.addEventListener('input', function () {
      state.reportView.query = this.value;
      renderReportTable();
    });
    setupSortable('people-table', 'peopleView', renderPeople);
    setupSortable('report-table', 'reportView', renderReportTable);
    $('btn-provision').addEventListener('click', onProvision);
    $('btn-emp-add').addEventListener('click', onEmployeeAdd);
    $('btn-adm-add').addEventListener('click', onAdminAdd);
    $('btn-lv-add').addEventListener('click', onLeaveAdd);
    $('btn-hf-add').addEventListener('click', onHolidayAdd);
    $('btn-co-apply').addEventListener('click', onCorrectionApply);
    $('co-mode').addEventListener('change', syncCorrectionFields);
    $('btn-help').addEventListener('click', function () { showModal('modal-help'); });
    $('btn-help-close').addEventListener('click', function () { hideModal('modal-help'); });
    $('ob-next').addEventListener('click', onOnboardNext);
    $('ob-skip').addEventListener('click', dismissOnboarding);
    $('admin-pin').addEventListener('keydown', function (e) { if (e.key === 'Enter') onAdminGo(); });
    $('admin-email').addEventListener('keydown', function (e) { if (e.key === 'Enter') onAdminGo(); });
    $('btn-login-go').addEventListener('click', onLoginGo);
    $('login-email').addEventListener('keydown', function (e) { if (e.key === 'Enter') onLoginGo(); });
    $('login-tenant').addEventListener('keydown', function (e) { if (e.key === 'Enter') onLoginGo(); });
    $('btn-logout').addEventListener('click', onLogout);
    var pinToggle = $('pin-toggle');
    if (pinToggle) pinToggle.addEventListener('click', function () {
      var inp = $('admin-pin');
      var show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      pinToggle.classList.toggle('on', show);
    });
    initOtpSegments('otp-seg', 'admin-otp', onAdminGo);
    initOtpSegments('login-otp-seg', 'login-otp', onLoginGo);
    var consentAccept = $('consent-accept');
    var consentDecline = $('consent-decline');
    if (consentAccept) consentAccept.addEventListener('click', function () {
      setConsent(true);
      $('consent-banner').classList.add('hidden');
      bootApp();
    });
    if (consentDecline) consentDecline.addEventListener('click', function () {
      setConsent(false);
      $('consent-banner').classList.add('hidden');
    });
    window.addEventListener('online', updateOfflinePill);
    window.addEventListener('offline', updateOfflinePill);
    window.addEventListener('hashchange', route);
    updateOfflinePill();
    initInstallPrompt();
    var themeBtn = $('btn-theme');
    if (themeBtn) themeBtn.addEventListener('click', function () {
      var cur = getThemeMode();
      var next = cur === 'auto' ? 'light' : (cur === 'light' ? 'dark' : 'auto');
      applyThemeMode(next, true);
      vibrate(12);
    });
  }

  /* ---------------- PWA install ---------------- */

  var deferredInstall = null;

  function initInstallPrompt() {
    var btn = $('btn-install');
    if (!btn) return;
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return;
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredInstall = e;
      btn.classList.remove('hidden');
    });
    btn.addEventListener('click', function () {
      if (!deferredInstall) return;
      deferredInstall.prompt();
      deferredInstall.userChoice.then(function () {
        deferredInstall = null;
        btn.classList.add('hidden');
      }).catch(function () {});
    });
    window.addEventListener('appinstalled', function () {
      deferredInstall = null;
      btn.classList.add('hidden');
      showFeedback('success', 'Application installee.');
    });
  }

  /* ---------------- Offline indicator ---------------- */

  function updateOfflinePill() {
    var pill = $('offline-pill');
    if (!pill) return;
    pill.classList.toggle('hidden', !!(navigator.onLine));
  }

  /* ---------------- Theme ---------------- */

  function getThemeMode() {
    return document.documentElement.getAttribute('data-theme-mode') || 'auto';
  }

  function systemPrefersLight() {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
  }

  function resolveTheme(mode) {
    if (mode === 'light' || mode === 'dark') return mode;
    return systemPrefersLight() ? 'light' : 'dark';
  }

  function withThemeTransition(fn) {
    var root = document.documentElement;
    root.classList.add('theme-switching');
    fn();
    setTimeout(function () { root.classList.remove('theme-switching'); }, 450);
  }

  function applyThemeMode(mode, animate) {
    var resolved = resolveTheme(mode);
    document.documentElement.setAttribute('data-theme-mode', mode);
    if (hasConsent()) { try { localStorage.setItem(LS_THEME, mode); } catch (e) {} }
    var setAttr = function () { document.documentElement.setAttribute('data-theme', resolved); };
    if (animate) withThemeTransition(setAttr); else setAttr();
    var sun = $('ic-sun');
    var moon = $('ic-moon');
    var auto = $('ic-auto');
    // Show the icons for the modes you can switch TO; hide the active one.
    if (sun) sun.style.display = mode === 'light' ? 'none' : '';
    if (moon) moon.style.display = mode === 'dark' ? 'none' : '';
    if (auto) auto.style.display = mode === 'auto' ? 'none' : '';
    var btn = $('btn-theme');
    if (btn) btn.title = 'Theme : ' + (mode === 'auto' ? 'automatique' : (mode === 'light' ? 'clair' : 'sombre'));
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved === 'light' ? '#0e86c4' : '#0a1525');
  }

  function initTheme() {
    var t = null;
    try { t = localStorage.getItem(LS_THEME); } catch (e) {}
    applyThemeMode(t === 'light' || t === 'dark' ? t : 'auto', false);
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: light)');
      var handler = function () {
        if (getThemeMode() === 'auto') applyThemeMode('auto', true);
      };
      if (mq.addEventListener) mq.addEventListener('change', handler);
      else if (mq.addListener) mq.addListener(handler);
    }
  }

  /* ---------------- Collapsible cards ---------------- */

  function initCollapsibles() {
    var heads = document.querySelectorAll('.block-head.collapsible');
    for (var i = 0; i < heads.length; i++) {
      heads[i].addEventListener('click', function () {
        var card = this.closest('.card');
        if (card) card.classList.toggle('collapsed');
      });
    }
  }

  /* ---------------- Encrypted local storage ---------------- */

  var LS_KEY = 'att.key.v1';
  var ENC_KEY_CACHE;
  var ENC_SUPPORTED = !!(window.crypto && window.crypto.subtle && window.TextEncoder && window.TextDecoder);

  function bytesToBase64(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return window.btoa(bin);
  }

  function base64ToBytes(b64) {
    var bin = window.atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function encKey() {
    if (ENC_KEY_CACHE !== undefined) return Promise.resolve(ENC_KEY_CACHE);
    if (!ENC_SUPPORTED) return Promise.resolve(null);
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) { ENC_KEY_CACHE = raw; return Promise.resolve(raw); }
      var bytes = new Uint8Array(32);
      window.crypto.getRandomValues(bytes);
      var b64 = bytesToBase64(bytes);
      localStorage.setItem(LS_KEY, b64);
      ENC_KEY_CACHE = b64;
      return Promise.resolve(b64);
    } catch (e) {
      ENC_SUPPORTED = false;
      return Promise.resolve(null);
    }
  }

  function importKey(b64, use) {
    return window.crypto.subtle.importKey('raw', base64ToBytes(b64), { name: 'AES-GCM' }, false, [use]);
  }

  function lsGet(key) {
    var v;
    try { v = localStorage.getItem(key); } catch (e) { return Promise.resolve(null); }
    if (v === null) return Promise.resolve(null);
    if (!ENC_SUPPORTED || v.indexOf('enc1:') !== 0) return Promise.resolve(v);
    return encKey().then(function (k) {
      if (!k) return v;
      return importKey(k, 'decrypt').then(function (cryptoKey) {
        var env = JSON.parse(v.slice(5));
        var iv = base64ToBytes(env.iv);
        var data = base64ToBytes(env.d);
        return window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, cryptoKey, data)
          .then(function (buf) { return new TextDecoder().decode(buf); });
      });
    }).catch(function () {
      return v;
    });
  }

  function lsSet(key, val) {
    if (!hasConsent()) return Promise.resolve();
    if (!ENC_SUPPORTED) { try { localStorage.setItem(key, val); } catch (e) {} return Promise.resolve(); }
    return encKey().then(function (k) {
      if (!k) { try { localStorage.setItem(key, val); } catch (e) {} return; }
      return importKey(k, 'encrypt').then(function (cryptoKey) {
        var iv = window.crypto.getRandomValues(new Uint8Array(12));
        return window.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, cryptoKey, new TextEncoder().encode(val))
          .then(function (ct) {
            var env = { v: 1, iv: bytesToBase64(iv), d: bytesToBase64(new Uint8Array(ct)) };
            try { localStorage.setItem(key, 'enc1:' + JSON.stringify(env)); } catch (e) {}
          });
      });
    });
  }

  /* ---------------- Profile ---------------- */

  function loadProfile() {
    return lsGet(LS_PROFILE).then(function (raw) {
      try { state.profile = raw ? JSON.parse(raw) : null; } catch (e) { state.profile = null; }
    });
  }

  function saveProfile() {
    return lsSet(LS_PROFILE, JSON.stringify(state.profile));
  }

  function loadStatus() {
    return lsGet(LS_STATUS).then(function (raw) {
      var parsed = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch (e) { parsed = null; }
      if (parsed && parsed.date !== todayStr()) {
        // Status from a previous day: start fresh.
        try { localStorage.removeItem(LS_STATUS); } catch (e) {}
        parsed = null;
      }
      state.status = parsed;
    });
  }

  function saveStatus() {
    return lsSet(LS_STATUS, JSON.stringify(state.status));
  }

  /* ---------------- Login session ---------------- */

  function loadSession() {
    return lsGet(LS_SESSION).then(function (raw) {
      try { state.session = raw ? JSON.parse(raw) : null; } catch (e) { state.session = null; }
      if (state.session && typeof state.session !== 'object') state.session = null;
      return state.session;
    });
  }

  function saveSession() {
    return lsSet(LS_SESSION, JSON.stringify(state.session));
  }

  function clearSession() {
    state.session = null;
    var prevToken = state.adminToken;
    state.adminToken = '';
    state.isAdmin = false;
    state.admin = null;
    try { localStorage.removeItem(LS_SESSION); } catch (e) {}
    if (prevToken) { applyAdminVisibility(); }
  }

  function syncProfileFromSession() {
    var s = state.session;
    if (!s) return;
    var p = state.profile || {};
    var changed = false;
    if (p.name !== s.name) { p.name = s.name; changed = true; }
    if (p.email !== s.email) { p.email = s.email; changed = true; }
    if (p.tenant !== (s.tenant || '')) { p.tenant = s.tenant || ''; changed = true; }
    if (changed) { state.profile = p; saveProfile(); }
  }

  function showLoginView() {
    $('view-login').classList.remove('hidden');
    $('view-home').classList.add('hidden');
    $('view-admin').classList.add('hidden');
    document.body.classList.remove('admin-view');
    var banner = $('setup-banner');
    if (banner) banner.classList.add('hidden');
    var nav = document.querySelector('.bottom-nav');
    if (nav) nav.classList.add('hidden');
    closeScanner();
    var f = $('login-email');
    if (f) { try { f.focus(); } catch (e) {} }
  }

  function hideLoginView() {
    $('view-login').classList.add('hidden');
    var nav = document.querySelector('.bottom-nav');
    if (nav) nav.classList.remove('hidden');
  }

  function resetLoginOtpState() {
    var row = $('login-otp-row');
    if (!row) return;
    row.classList.add('hidden');
    var note = $('login-otp-note');
    if (note) { note.textContent = ''; note.classList.add('hidden'); }
    $('login-otp').value = '';
    $('btn-login-go').textContent = 'Se connecter';
  }

  function onLoginGo() {
    var btn = $('btn-login-go');
    var email = $('login-email').value.trim();
    var tenant = $('login-tenant').value.trim();
    var otp = $('login-otp').value.trim();

    if (!email) { showError('login-error', 'Saisissez votre email.'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { showError('login-error', 'Saisissez un email valide.'); return; }
    if (tenant && !/^[a-z0-9][a-z0-9\-]{1,23}$/.test(tenant)) {
      showError('login-error', 'Code espace : 2-24 caracteres, lettres/chiffres/tirets.');
      return;
    }

    var otpRow = $('login-otp-row');
    var expectingOtp = otpRow && !otpRow.classList.contains('hidden');
    if (expectingOtp && otp.length < 6) { showError('login-error', 'Le code comporte 6 chiffres.'); return; }

    hideError('login-error');
    var body = { action: 'user_login', email: email };
    if (tenant) body.tenant = tenant;
    if (expectingOtp) body.otp = otp;
    btn.textContent = 'Chargement...';

    api(body).then(function (res) {
      if (!res.ok || !res.needOtp) btn.textContent = 'Se connecter';
      if (res && res.needOtp) {
        otpRow.classList.remove('hidden');
        var note = $('login-otp-note');
        if (note) {
          note.textContent = res.message || 'Code envoye par email.';
          if (res.otpDev) note.textContent += ' Code de developpement : ' + res.otpDev;
          note.classList.remove('hidden');
        }
        btn.textContent = 'Verifier le code';
        var firstBox = otpRow.querySelector('.otp-box');
        if (firstBox) firstBox.focus();
        else $('login-otp').focus();
        return;
      }
      if (!res.ok) throw new Error((res && res.message) || 'Connexion refusee.');
      if (!res.user) throw new Error('Reponse invalide du serveur.');

      state.session = {
        name: res.user.name || email,
        email: res.user.email || email,
        tenant: res.user.tenant || tenant,
        isAdmin: !!res.user.isAdmin,
        token: res.sessionToken || res.token || ''
      };
      state.profile = {
        name: state.session.name,
        email: state.session.email,
        tenant: state.session.tenant
      };
      state.adminToken = state.session.token || state.adminToken;
      state.isAdmin = state.session.isAdmin;
      applyAdminVisibility();
      saveSession();
      saveProfile();
      hideModal('modal-profile');
      resetLoginOtpState();
      enterApp();
    }).catch(function (err) {
      btn.textContent = 'Se connecter';
      showError('login-error', err.message);
    });
  }

  function onLogout() {
    var ok = window.confirm('Se deconnecter ? Vos donnees locales de cet utilisateur seront effacees de cet appareil.');
    if (!ok) return;
    clearSession();
    hideModal('modal-profile');
    try { localStorage.removeItem(LS_PROFILE); } catch (e) {}
    try { localStorage.removeItem(LS_STATUS); } catch (e) {}
    try { localStorage.removeItem(LS_QUEUE); } catch (e) {}
    state.profile = null;
    state.status = null;
    $('login-email').value = '';
    $('login-tenant').value = '';
    resetLoginOtpState();
    hideError('login-error');
    showLoginView();
    location.hash = '#home';
    route();
  }

  function showProfileModal() {
    if (state.profile) {
      $('pf-name').value = state.profile.name || '';
      $('pf-email').value = state.profile.email || '';
      $('pf-tenant').value = state.profile.tenant || '';
    } else {
      $('pf-tenant').value = DEFAULTS.DEFAULT_TENANT || '';
    }
    $('pf-remind').checked = remindersEnabled();
    hideError('profile-error');
    showModal('modal-profile');
  }

  function onProfileSave() {
    var name = $('pf-name').value.trim();
    var email = $('pf-email').value.trim();
    var tenant = $('pf-tenant').value.trim();
    if (!name) { showError('profile-error', 'Saisissez votre nom.'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { showError('profile-error', 'Saisissez un email valide.'); return; }
    if (tenant && !/^[a-z0-9][a-z0-9\-]{1,23}$/.test(tenant)) {
      showError('profile-error', 'Code espace : 2-24 caracteres, lettres/chiffres/tirets.');
      return;
    }
    var wantReminders = $('pf-remind').checked;
    setRemindersEnabled(wantReminders);
    if (wantReminders && 'Notification' in window && Notification.permission === 'default') {
      try { Notification.requestPermission().catch(function () {}); } catch (e) {}
    }
    var prevTenant = tenantFromProfile();
    state.profile = { name: name, email: email, tenant: tenant };
    saveProfile();
    state.privacyNoticeShown = false;
    hideModal('modal-profile');
    finishOnboarding();
    if (tenantFromProfile() !== prevTenant) {
      state.status = null;
      saveStatus();
      fetchConfig().then(renderHome).catch(function () { renderHome(); });
    }
    if (state.pendingScan) {
      state.pendingScan = false;
      openScanner();
    }
    renderHome();
    refreshAdminAccess();
    loadRecent();
    loadWeek();
    loadMonth();
  }

  /* ---------------- API ---------------- */

  function api(body) {
    if (!isConfigured()) {
      return Promise.reject(new Error("L'application n'est pas encore configuree. Consultez la banniere de configuration."));
    }
    return fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(injectTenant(body))
    }).then(function (r) {
      return r.text();
    }).then(function (txt) {
      try { return JSON.parse(txt); }
      catch (e) { throw new Error('Reponse inattendue du serveur.'); }
    }).catch(function (e) {
      if (!navigator.onLine || e instanceof TypeError) {
        var ne = new Error('Erreur reseau');
        ne.offline = true;
        throw ne;
      }
      throw e;
    });
  }

  function injectTenant(body) {
    var b = Object.assign({}, body);
    if (b.tenant === undefined) b.tenant = tenantFromProfile();
    return b;
  }

  /* ---------------- Offline queue ---------------- */

  function loadQueue() {
    return lsGet(LS_QUEUE).then(function (raw) {
      try { return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
    });
  }

  function saveQueue(q) {
    return lsSet(LS_QUEUE, JSON.stringify(q.slice(0, 20)));
  }

  function queueAttendance(payload) {
    return loadQueue().then(function (q) {
      q.push({ queuedAt: Date.now(), payload: payload });
      return saveQueue(q);
    });
  }

  function flushQueue() {
    if (!isConfigured()) return Promise.resolve();
    return loadQueue().then(function (q) {
      if (!q.length) return;
      showFeedback('info', 'Synchronisation de ' + q.length + ' pointage' + (q.length > 1 ? 's' : '') + ' enregistre' + (q.length > 1 ? 's' : '') + '...');
      var done = 0;
      var synced = 0;
      var lastRes = null;
      var remaining = [];
      q.forEach(function (item) {
        api(item.payload).then(function (res) {
          done++;
          if (res && res.ok) { synced++; lastRes = res; }
          finish();
        }, function (err) {
          done++;
          if (err && err.offline) remaining.push(item);
          finish();
        });
      });
      function finish() {
        if (done !== q.length) return;
        saveQueue(remaining);
        if (remaining.length) {
          showFeedback('warn', remaining.length + ' pointage' + (remaining.length > 1 ? 's' : '') + ' en attente de synchronisation.');
        } else if (synced > 0) {
          if (lastRes && lastRes.ok) {
            state.status = {
              date: lastRes.date || todayStr(),
              action: lastRes.action,
              time: lastRes.time,
              office: lastRes.office,
              tenant: lastRes.tenant || tenantFromProfile()
            };
            saveStatus();
          }
          showFeedback('success', synced + ' pointage' + (synced > 1 ? 's' : '') + ' hors ligne synchronise' + (synced > 1 ? 's' : '') + '.');
          renderHome();
          loadRecent();
          loadWeek();
        }
      }
    });
  }

  function fetchConfig() {
    if (!isConfigured()) {
      state.config = defaultsConfig();
      return Promise.resolve();
    }
    return api({ action: 'config' }).then(function (res) {
      if (!res.ok || !res.config) throw new Error((res && res.message) || 'Erreur de configuration');
      state.config = Object.assign({}, defaultsConfig(), res.config);
      $('app-name').textContent = state.config.appName;
    });
  }

  /* ---------------- Recent activity ---------------- */

  function onScanClick() {
    if (!state.config) { showFeedback('warn', 'Chargement des parametres du bureau en cours, reessayez dans un instant.'); return; }
    if (!hasProfile()) {
      state.pendingScan = true;
      showProfileModal();
      return;
    }
    openScanner();
  }

  function openScanner() {
    showModal('modal-scan');
    var reader = $('qr-reader');
    reader.innerHTML = '';
    if (typeof Html5Qrcode === 'undefined') {
      renderCameraError('Le scanner QR n\'a pas pu se charger (verifiez votre connexion).');
      return;
    }
    if (!state.qrScanner) state.qrScanner = new Html5Qrcode('qr-reader');
    state.qrScanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 240, height: 240 } },
      function (text) { handleScan(text); },
      function () {}
    ).catch(function (err) {
      renderCameraError('Camera indisponible: ' + err);
      var s = state.qrScanner;
      state.qrScanner = null;
      if (s) {
        try { var p = s.stop(); if (p && p.catch) p.catch(function () {}); } catch (e2) {}
      }
    });
  }

  function renderCameraError(msg) {
    var reader = $('qr-reader');
    reader.innerHTML =
      '<div class="cam-error">' +
        '<p class="cam-error-msg">' + escapeHtml(msg) + '</p>' +
        '<button type="button" class="ghost-btn" id="cam-retry">Reessayer la camera</button>' +
        '<p class="hint">Camera ne fonctionne pas? Saisissez le code manuellement ci-dessous.</p>' +
      '</div>';
    var retry = document.getElementById('cam-retry');
    if (retry) retry.addEventListener('click', function () { openScanner(); });
  }

  function onManualQr() {
    var v = $('manual-qr').value.trim();
    if (!v) { showFeedback('error', 'Saisissez d\'abord le contenu du QR.'); return; }
    handleScan(v);
  }

  function handleScan(text) {
    if (state.processing) return;
    state.processing = true;
    closeScanner();
    if (!text) {
      state.processing = false;
      showFeedback('error', 'Aucun QR code detecte.');
      return;
    }
    vibrate(18);
    setTimeout(function () {
      var chain = processAttendance(text);
      if (chain && chain.then) {
        chain.then(
          function () { state.processing = false; },
          function () { state.processing = false; }
        );
      } else {
        state.processing = false;
      }
    }, 200);
  }

  function closeScanner() {
    hideModal('modal-scan');
    if (state.qrScanner) {
      try {
        var stop = state.qrScanner.stop();
        if (stop && stop.then) {
          stop.then(function () { return state.qrScanner.clear(); }).catch(function () {});
        }
      } catch (e) {}
    }
  }

  function setBusy(busy) {
    var btn = $('btn-scan');
    var label = $('btn-scan-label');
    btn.disabled = busy;
    if (busy) {
      label.textContent = 'Traitement en cours...';
    }
  }

  function processAttendance(qrText) {
    if (!state.config) {
      showFeedback('warn', 'Les parametres du bureau sont en cours de chargement. Reessayez dans un instant.');
      return;
    }
    if (!hasProfile()) {
      showFeedback('warn', 'Definissez vos coordonnees d\'abord.');
      showProfileModal();
      return;
    }

    var parsed = parseQr(qrText);
    var tenant = parsed.tenant || tenantFromProfile();
    var token = parsed.token || qrText;

    var payload = {
      action: 'attendance',
      tenant: tenant,
      qr: token,
      name: state.profile.name,
      email: state.profile.email,
      ts: Date.now()
    };

    // Selfie proof at check-in when the office requires it.
    var willCheckIn = !state.status || state.status.action !== 'Check-in';
    if (willCheckIn && state.config.selfieMode === 'required') {
      openSelfieModal(payload);
      return;
    }

    return postAttendance(payload);
  }

  function postAttendance(payload) {
    setBusy(true);
    showFeedback('info', 'Traitement de votre scan...');

    return api(payload).then(function (res) {
      setBusy(false);
      if (!res.ok) {
        if (res.code === 'SELFIE_REQUIRED') { openSelfieModal(payload); return; }
        showFeedback('error', res.message || 'Echec du pointage.');
        return;
      }
      var prev = state.status;
      state.status = {
        date: res.date || todayStr(),
        action: res.action,
        time: res.time,
        office: res.office,
        tenant: payload.tenant || tenantFromProfile(),
        breakMinToday: res.breakMinToday || 0
      };
      if (res.action === 'Check-in') state.status.checkinTime = res.time;
      else state.status.checkinTime = (prev && prev.checkinTime) || null;
      saveStatus();
      renderHome();
      loadRecent();
      loadWeek();
      loadMonth();
      showScanSuccess(res.action, res.time, state.profile.name);
      var loc = res.office ? ' a ' + res.office : '';
      var msg;
      if (res.action === 'Check-in') msg = 'Vous etes passe' + (loc || '') + ' a ' + res.time + '.';
      else if (res.action === 'Check-out') msg = 'Vous etes sorti' + loc + ' a ' + res.time + '.';
      else if (res.action === 'Break-out') msg = 'Pause demarree a ' + res.time + '. Bonne pause !';
      else msg = 'On reprend le travail a ' + res.time + '.';
      showFeedback('success', msg, res.action === 'Check-in' ? [25, 70, 25] : [60]);
    }, function (err) {
      setBusy(false);
      if (err && err.offline) {
        queueAttendance(stripPhotoDataUrl(payload));
        showFeedback('info', 'Vous etes hors ligne. Votre pointage a ete enregistre et se synchronisera automatiquement lorsque vous serez en ligne.');
      } else {
        showFeedback('error', 'Impossible de joindre le serveur : ' + err.message + '. Verifiez votre connexion et reessayez.');
      }
    });
  }

  function stripPhotoDataUrl(payload) {
    var clone = {};
    for (var k in payload) {
      if (k !== 'photoDataUrl') clone[k] = payload[k];
    }
    return clone;
  }

  /* ---------------- Selfie capture ---------------- */

  function openSelfieModal(pendingPayload) {
    state.selfieDeferred = pendingPayload || null;
    $('selfie-error').classList.add('hidden');
    $('selfie-preview').classList.add('hidden');
    $('selfie-confirm-row').classList.add('hidden');
    $('btn-selfie-capture').classList.remove('hidden');
    showModal('modal-selfie');
    startSelfieCamera();
  }

  function startSelfieCamera() {
    var video = $('selfie-video');
    video.classList.remove('hidden');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      selfieCameraFail("L'appareil photo n'est pas disponible.");
      return;
    }
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    }).then(function (stream) {
      state.selfieStream = stream;
      video.srcObject = stream;
      var p = video.play();
      if (p && p.catch) p.catch(function () {});
    }).catch(function () {
      selfieCameraFail('Acces camera refuse. Autorisez la camera dans votre navigateur, puis reprenez la photo.');
    });
  }

  function selfieCameraFail(msg) {
    var el = $('selfie-error');
    el.textContent = msg;
    el.classList.remove('hidden');
    // If the office only suggests a photo, let the user continue without one.
    if (state.config.selfieMode !== 'required') {
      el.textContent += ' Vous pouvez annuler pour pointer sans photo.';
    }
  }

  function stopSelfieCamera() {
    if (state.selfieStream) {
      try {
        state.selfieStream.getTracks().forEach(function (t) { t.stop(); });
      } catch (e) {}
      state.selfieStream = null;
    }
    var video = $('selfie-video');
    if (video) video.srcObject = null;
  }

  function captureSelfie() {
    var video = $('selfie-video');
    if (!state.selfieStream || !video.videoWidth) {
      selfieCameraFail('La camera n\'est pas prete. Reessayez.');
      return;
    }
    var side = Math.min(video.videoWidth, video.videoHeight);
    var out = 480;
    var canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(
      video,
      (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side,
      0, 0, out, out
    );
    var dataUrl = canvas.toDataURL('image/jpeg', 0.72);
    stopSelfieCamera();
    video.classList.add('hidden');
    var preview = $('selfie-preview');
    preview.src = dataUrl;
    preview.classList.remove('hidden');
    $('btn-selfie-capture').classList.add('hidden');
    $('selfie-confirm-row').classList.remove('hidden');
  }

  function retakeSelfie() {
    $('selfie-preview').classList.add('hidden');
    $('selfie-confirm-row').classList.add('hidden');
    $('btn-selfie-capture').classList.remove('hidden');
    $('selfie-video').classList.remove('hidden');
    startSelfieCamera();
  }

  function useSelfie() {
    var dataUrl = $('selfie-preview').src;
    cleanupSelfieModal();
    var payload = state.selfieDeferred;
    state.selfieDeferred = null;
    if (payload && dataUrl) {
      payload.photoDataUrl = dataUrl;
      postAttendance(payload);
    }
  }

  function cancelSelfie() {
    cleanupSelfieModal();
    var wasRequired = !!state.selfieDeferred;
    state.selfieDeferred = null;
    if (wasRequired) {
      showFeedback('warn', 'Pointage annule : un selfie est requis pour pointer l\'entree.');
    }
  }

  function cleanupSelfieModal() {
    stopSelfieCamera();
    hideModal('modal-selfie');
  }

  /* ---------------- Dynamic favicon ---------------- */

  function updateFavicon() {
    var link = document.querySelector('link[rel="icon"]');
    if (!link || typeof document.createElement('canvas').getContext !== 'function') return;
    var status = state.status && state.status.action === 'Check-in' ? 'in' : 'out';
    if (updateFavicon._last === status && updateFavicon._done) return;
    updateFavicon._last = status;
    var img = new Image();
    img.onload = function () {
      try {
        var c = document.createElement('canvas');
        c.width = 64; c.height = 64;
        var ctx = c.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 64, 64);
        ctx.beginPath();
        ctx.arc(51, 51, 13, 0, Math.PI * 2);
        ctx.fillStyle = '#0a1525';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(51, 51, 10, 0, Math.PI * 2);
        ctx.fillStyle = status === 'in' ? '#0e86c4' : '#64748b';
        ctx.fill();
        link.href = c.toDataURL('image/png');
        updateFavicon._done = true;
      } catch (e) {}
    };
    img.src = 'icons/icon-192.png';
  }

  /* ---------------- Home render ---------------- */

  function renderHome() {
    var card = $('status-card');
    var avatar = $('status-avatar');
    var label = $('status-label');
    var sub = $('status-sub');
    var time = $('status-time');
    var btnLabel = $('btn-scan-label');
    var breakRow = $('break-row');

    card.classList.remove('checked-in');
    var recentCard = $('recent-card');
    if (recentCard) recentCard.classList.toggle('hidden', !hasProfile());
    var weekCard = $('week-card');
    if (weekCard) weekCard.classList.toggle('hidden', !hasProfile());
    var monthCard = $('month-card');
    if (monthCard) monthCard.classList.toggle('hidden', !hasProfile());

    if (!hasProfile()) {
      avatar.className = 'status-avatar';
      clearAvatarGradient(avatar);
      avatar.textContent = '?';
      label.textContent = 'Bienvenue';
      sub.textContent = 'Definissez votre nom et email pour commencer.';
      time.textContent = '--:--';
      btnLabel.textContent = 'Scanner QR pour pointer';
      if (breakRow) breakRow.classList.add('hidden');
      stopElapsedTimer();
      renderStreak();
      updateFavicon();
      return;
    }

    var seed = state.profile.name || state.profile.email || '?';
    var act = state.status ? String(state.status.action || '') : '';
    var onBreakNow = act === 'Break-out';

    if (act === 'Check-in' || act === 'Break-in' || onBreakNow) {
      card.classList.add('checked-in');
      avatar.className = 'status-avatar in';
      clearAvatarGradient(avatar);
      avatar.textContent = onBreakNow ? 'PAUSE' : 'ENTREE';
      label.textContent = onBreakNow ? 'En pause' : 'Pointe';
      sub.textContent = onBreakNow
        ? 'Profitez de votre pause. Scannez le QR (ou appuyez sur Reprendre) pour reprendre.'
        : (state.status.office ? 'A ' + state.status.office + '. Passez une bonne journee.' : 'Passez une bonne journee au bureau.');
      time.textContent = state.status.time;
      btnLabel.textContent = onBreakNow ? 'Scanner QR pour reprendre' : 'Scanner QR pour la sortie';
      startElapsedTimer();
    } else if (state.status) {
      avatar.className = 'status-avatar out';
      applyAvatarHueGradient(avatar, seed);
      avatar.textContent = 'SORTIE';
      label.textContent = 'Sorti';
      sub.textContent = state.status.office ? 'De ' + state.status.office + '. Vous pouvez pointer a nouveau plus tard.' : 'Vous pouvez pointer a nouveau plus tard aujourd\'hui.';
      time.textContent = state.status.time;
      btnLabel.textContent = 'Scanner QR pour pointer';
      stopElapsedTimer();
    } else {
      avatar.className = 'status-avatar out';
      applyAvatarHueGradient(avatar, seed);
      avatar.textContent = 'SORTIE';
      label.textContent = 'Non pointe';
      sub.textContent = 'Scannez le QR du bureau a l\'entree.';
      time.textContent = '--:--';
      btnLabel.textContent = 'Scanner QR pour pointer';
      stopElapsedTimer();
    }

    if (breakRow) {
      var showBreak = act === 'Check-in' || act === 'Break-in' || onBreakNow;
      breakRow.classList.toggle('hidden', !showBreak);
      $('btn-break-label').textContent = onBreakNow ? 'Reprendre' : 'Pause';
      var info = $('break-info');
      var mins = state.status && state.status.breakMinToday;
      info.textContent = showBreak && mins ? 'Pause cumulee aujourd\'hui : ' + fmtHours(mins / 60) : '';
    }
    renderStreak();
    updateFavicon();
  }

  function onBreakToggle() {
    if (!state.profile) return;
    var onBreak = state.status && state.status.action === 'Break-out';
    postAttendance({
      action: 'attendance',
      tenant: tenantFromProfile(),
      qr: '',
      mode: onBreak ? 'resume' : 'break',
      name: state.profile.name,
      email: state.profile.email,
      ts: Date.now()
    });
  }

  /* ---------------- Recent activity ---------------- */

  function loadRecent() {
    if (!hasProfile() || !isConfigured()) return;
    if (state.recentLoading) return;
    state.recentLoading = true;
    renderRecent();
    api({ action: 'recent', email: state.profile.email }).then(function (res) {
      state.recentLoading = false;
      if (!res.ok) {
        renderRecent();
        if (res.message && !state.privacyNoticeShown) {
          state.privacyNoticeShown = true;
          showFeedback('warn', res.message);
        }
        return;
      }
      state.recent = res.recent || [];
      renderRecent();
    }).catch(function () {
      state.recentLoading = false;
      renderRecent();
    });
  }

  function renderRecent() {
    var list = $('recent-list');
    if (!list) return;
    var empty = $('recent-empty');
    if (state.recentLoading) {
      list.innerHTML = '';
      if (empty) empty.classList.add('hidden');
      for (var i = 0; i < 3; i++) {
        var row = document.createElement('div');
        row.className = 'sk-row';
        row.innerHTML = '<span class="sk sk-dot"></span><div class="sk-wrap"><span class="sk sk-line"></span><span class="sk sk-line short"></span></div>';
        list.appendChild(row);
      }
      return;
    }
    list.innerHTML = '';
    if (!state.recent.length) {
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');
    state.recent.forEach(function (r) {
      var li = document.createElement('li');
      var dot = document.createElement('span');
      dot.className = 'recent-dot ' + (r.action === 'Check-in' ? 'in' : 'out');
      var main = document.createElement('span');
      main.className = 'recent-main';
      var top = document.createElement('span');
      top.className = 'recent-top';
      top.textContent = r.date;
      var meta = document.createElement('span');
      meta.className = 'recent-meta';
      meta.textContent = (r.office ? r.office : 'Bureau') + ' \u00b7 ' + r.time;
      main.appendChild(top);
      main.appendChild(meta);
      var badge = document.createElement('span');
      badge.className = 'tag ' + (r.action === 'Check-in' ? 'in' : 'out');
      badge.textContent = r.action === 'Check-in' ? 'ENTREE' : 'SORTIE';
      li.appendChild(dot);
      li.appendChild(main);
      li.appendChild(badge);
      list.appendChild(li);
    });
  }

  /* ---------------- Last 7 days ---------------- */

  function loadWeek() {
    if (!hasProfile() || !isConfigured()) return;
    if (state.weekLoading) return;
    state.weekLoading = true;
    renderWeek();
    api({ action: 'week', email: state.profile.email }).then(function (res) {
      state.weekLoading = false;
      if (!res.ok) {
        renderWeek();
        if (res.message && !state.privacyNoticeShown) {
          state.privacyNoticeShown = true;
          showFeedback('warn', res.message);
        }
        return;
      }
      state.week = res.week || [];
      renderWeek();
    }).catch(function () {
      state.weekLoading = false;
      renderWeek();
    });
  }

  /* ---------------- Streak badge ---------------- */

  function computeStreak() {
    var map = {};
    (state.week || []).forEach(function (d) { map[d.date] = d.hours || 0; });
    var today = todayStr();
    if (!(map[today] > 0) && !(map[shiftDateStr(-1)] > 0)) return 0;
    var cursor = map[today] > 0 ? 0 : -1;
    var streak = 0;
    while (streak < 7) {
      var day = shiftDateStr(cursor - streak);
      if (map[day] > 0) streak++;
      else break;
    }
    return streak;
  }

  function renderStreak() {
    var badge = $('streak-badge');
    if (!badge) return;
    var streak = computeStreak();
    if (streak >= 2) {
      $('streak-count').textContent = String(streak);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  function renderWeek() {
    var chart = $('week-chart');
    if (!chart) return;
    var empty = $('week-empty');
    chart.innerHTML = '';
    if (state.weekLoading) {
      if (empty) empty.classList.add('hidden');
      for (var i = 0; i < 7; i++) {
        var sk = document.createElement('div');
        sk.className = 'sk sk-bar';
        var col = document.createElement('div');
        col.className = 'week-col';
        col.appendChild(sk);
        chart.appendChild(col);
      }
      return;
    }
    var hasData = state.week.some(function (d) { return d.hours > 0; });
    if (empty) empty.classList.toggle('hidden', hasData);
    var max = 0;
    state.week.forEach(function (d) { if (d.hours > max) max = d.hours; });
    var today = todayStr();
    state.week.forEach(function (d) {
      var col = document.createElement('div');
      col.className = 'week-col';
      var val = document.createElement('span');
      val.className = 'week-val';
      val.textContent = d.hours > 0 ? fmtHours(d.hours) : '';
      var wrap = document.createElement('div');
      wrap.className = 'week-bar-wrap';
      var bar = document.createElement('div');
      bar.className = 'week-bar' + (d.hours > 0 ? '' : ' zero');
      bar.title = d.date + ': ' + (d.hours > 0 ? fmtHours(d.hours) : 'pas de pointage');
      if (d.hours > 0) {
        bar.style.height = Math.max(8, Math.round((d.hours / max) * 100)) + '%';
      }
      wrap.appendChild(bar);
      var label = document.createElement('span');
      label.className = 'week-label';
      label.textContent = d.date === today ? 'Aujourd\'hui' : dayLabel(d.date);
      col.appendChild(val);
      col.appendChild(wrap);
      col.appendChild(label);
      chart.appendChild(col);
    });
    renderStreak();
  }

  /* ---------------- Monthly summary ---------------- */

  function loadMonth() {
    if (!hasProfile() || !isConfigured()) return;
    if (state.monthLoading) return;
    state.monthLoading = true;
    api({ action: 'myattendance', email: state.profile.email }).then(function (res) {
      state.monthLoading = false;
      state.monthSummary = null;
      if (res.ok) {
        var prefix = todayStr().slice(0, 7);
        var days = 0, hours = 0, breakMin = 0, late = 0;
        (res.attendance.pairs || []).forEach(function (p) {
          if (!p.date || String(p.date).slice(0, 7) !== prefix) return;
          days++;
          if (p.hours != null && !isNaN(p.hours)) hours += p.hours;
          if (p.breakMin) breakMin += p.breakMin;
          if (p.late) late++;
        });
        state.monthSummary = { days: days, hours: hours, breakMin: breakMin, late: late };
      }
      renderMonthCard();
    }).catch(function () {
      state.monthLoading = false;
      state.monthSummary = null;
      renderMonthCard();
    });
  }

  function renderMonthCard() {
    var card = $('month-card');
    if (!card) return;
    var s = state.monthSummary;
    if (!s) return;
    $('mo-days').textContent = String(s.days);
    $('mo-hours').textContent = fmtHours(s.hours);
    $('mo-break').textContent = s.breakMin ? fmtHours(s.breakMin / 60) : '0h 0m';
    $('mo-late').textContent = String(s.late);
    var note = $('mo-note');
    if (note) note.textContent = s.days >= 15
      ? 'Excellent rythme ce mois-ci — continuez comme ca !'
      : 'Vos jours et heures de presence cumules depuis le 1er du mois.';
  }

  /* ---------------- Check-out reminders ---------------- */

  function remindersEnabled() {
    try { return localStorage.getItem(LS_REMIND) === '1'; } catch (e) { return false; }
  }

  function setRemindersEnabled(val) {
    try { localStorage.setItem(LS_REMIND, val ? '1' : '0'); } catch (e) {}
  }

  function initReminders() {
    setInterval(checkReminders, 60000);
    checkReminders();
  }

  function alreadyNotified(key) {
    try { return localStorage.getItem(key) === todayStr(); } catch (e) { return true; }
  }

  function markNotified(key) {
    try { localStorage.setItem(key, todayStr()); } catch (e) {}
  }

  function pushLocalNotification(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    try { new Notification(title, { body: body }); } catch (e) {}
  }

  function checkReminders() {
    if (!remindersEnabled()) return;
    var cfg = state.config;
    if (!cfg) return;

    var now = new Date();
    var nowMin = now.getHours() * 60 + now.getMinutes();

    // Morning nudge: not checked in yet after reminderCheckInAfter.
    var inAt = timeToMinutes(cfg.reminderCheckInAfter);
    if (inAt >= 0 && nowMin >= inAt && nowMin < inAt + 120 &&
        (!state.status || state.status.date !== todayStr() ||
         (state.status.action !== 'Check-in' && state.status.action !== 'Break-in')) &&
        !alreadyNotified('att.remind.in')) {
      markNotified('att.remind.in');
      pushLocalNotification(cfg.appName || 'addredance',
        'Vous n\'avez pas encore pointe votre arrivee. Pensez a scanner le QR !');
    }

    // Evening nudge: still checked in after reminderCheckOutAfter.
    var outAt = timeToMinutes(cfg.reminderCheckOutAfter);
    if (outAt >= 0 && nowMin >= outAt && nowMin < outAt + 180 &&
        state.status && state.status.date === todayStr() &&
        (state.status.action === 'Check-in' || state.status.action === 'Break-in') &&
        !alreadyNotified('att.remind.out')) {
      markNotified('att.remind.out');
      pushLocalNotification(cfg.appName || 'addredance',
        'Vous n\'avez pas pointe votre sortie. Si vous quittez le bureau, scannez le QR !');
    }
  }

  /* ---------------- Scan success overlay ---------------- */

  var elapsedInterval = null;
  var RING_CIRC = 2 * Math.PI * 35;
  var WORKDAY_HOURS = 8;

  function updateProgressRing(fraction) {
    var ring = $('avatar-ring');
    var fill = $('ring-fill');
    if (!ring || !fill) return;
    var f = Math.min(1, Math.max(0, fraction || 0));
    if (f > 0) ring.classList.add('on');
    fill.style.strokeDashoffset = String(RING_CIRC * (1 - f));
  }

  function hideProgressRing() {
    var ring = $('avatar-ring');
    var fill = $('ring-fill');
    if (ring) ring.classList.remove('on');
    if (fill) fill.style.strokeDashoffset = String(RING_CIRC);
  }

  function startElapsedTimer() {
    stopElapsedTimer();
    var el = $('elapsed-wrap');
    var timer = $('elapsed-timer');
    if (!el || !timer || !state.status || state.status.action !== 'Check-in' || !state.status.time) {
      if (el) el.classList.add('hidden');
      updateProgressRing(0);
      return;
    }
    el.classList.remove('hidden');
    var parts = String(state.status.checkinTime || state.status.time).split(':');
    var checkInSec = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2] || 0);
    function tick() {
      var now = new Date();
      var nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
      var diff = Math.max(0, nowSec - checkInSec);
      var h = Math.floor(diff / 3600);
      var m = Math.floor((diff % 3600) / 60);
      var s = diff % 60;
      timer.textContent = h + 'h ' + m + 'm ' + s + 's';
      updateProgressRing(diff / (WORKDAY_HOURS * 3600));
    }
    tick();
    elapsedInterval = setInterval(tick, 1000);
  }

  function stopElapsedTimer() {
    if (elapsedInterval) { clearInterval(elapsedInterval); elapsedInterval = null; }
    var el = $('elapsed-wrap');
    if (el) el.classList.add('hidden');
    hideProgressRing();
  }

  var ssTimer = null;

  var CONFETTI_COLORS = ['#0e86c4', '#4cc1e9', '#f09020', '#e00060', '#38bdf8', '#a78bfa'];

  function burstConfetti(container) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var wrap = document.createElement('div');
    wrap.className = 'confetti-wrap';
    for (var i = 0; i < 26; i++) {
      var c = document.createElement('span');
      c.className = 'confetti';
      var angle = Math.random() * Math.PI * 2;
      var dist = 60 + Math.random() * 130;
      c.style.setProperty('--cx', (Math.cos(angle) * dist).toFixed(0) + 'px');
      c.style.setProperty('--cy', (Math.sin(angle) * dist * 0.55 + 110).toFixed(0) + 'px');
      c.style.setProperty('--crot', (Math.random() * 540 - 270).toFixed(0) + 'deg');
      c.style.setProperty('--cdur', (0.9 + Math.random() * 0.7).toFixed(2) + 's');
      c.style.setProperty('--cdelay', (Math.random() * 0.15).toFixed(2) + 's');
      c.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      if (Math.random() > 0.5) { c.style.borderRadius = '50%'; c.style.width = '7px'; c.style.height = '7px'; }
      wrap.appendChild(c);
    }
    container.appendChild(wrap);
    setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 2200);
  }

  function showScanSuccess(action, time, name) {
    var el = $('scan-success');
    if (!el) return;
    clearTimeout(ssTimer);
    el.classList.remove('hidden', 'fade');
    var first = String(name || '').trim().split(/\s+/)[0] || '';
    var title;
    if (action === 'Check-in') title = first ? 'Bon retour, ' + first + '!' : 'Pointe';
    else if (action === 'Check-out') title = first ? 'Au revoir, ' + first + '!' : 'Sorti';
    else if (action === 'Break-out') title = 'Bonne pause !';
    else title = 'On reprend !';
    $('ss-title').textContent = title;
    $('ss-time').textContent = time || '';
    burstConfetti(el);
    ssTimer = setTimeout(function () {
      el.classList.add('fade');
      setTimeout(function () { el.classList.add('hidden'); }, 500);
    }, 1200);
  }

  /* ---------------- Feedback ---------------- */

  var feedbackTimer = null;

  function showFeedback(type, msg, hapticPattern) {
    var el = $('feedback');
    el.className = 'feedback ' + type;
    el.textContent = msg;
    if (hapticPattern) vibrate(hapticPattern);
    else if (type === 'success') vibrate([18, 50, 28]);
    if (type === 'error') {
      vibrate([60, 50, 60]);
      el.classList.add('shake');
      setTimeout(function () { el.classList.remove('shake'); }, 550);
    }
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(function () { el.classList.add('hidden'); }, type === 'info' ? 12000 : 9000);
  }

  function showError(id, msg) {
    var el = $(id);
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  function hideError(id) { $(id).classList.add('hidden'); }

  function showSetupBanner() {
    var b = $('setup-banner');
    b.innerHTML = 'Configuration requise : definissez votre URL Apps Script dans <code>config.js</code> (API_URL), puis deployez le backend. Voir README.md pour les etapes.';
    b.classList.remove('hidden');
  }

  /* ---------------- Modals / routing ---------------- */

  function showModal(id) { $(id).classList.remove('hidden'); }
  function hideModal(id) { $(id).classList.add('hidden'); }

  /* ---------------- Onboarding ---------------- */

  var ONBOARD_STEPS = [
    { title: 'Bienvenue', text: 'Cette application enregistre vos pointages au bureau grace au code QR a l\'entree. Aucun telechargement necessaire - ouvrez-la depuis votre navigateur ou installez-la.', btn: 'Suivant' },
    { title: 'Vos coordonnees', text: 'Commencez par definir votre nom et email. Vous ne le faites qu\'une seule fois - les donnees sont stockees sur cet appareil.', btn: 'Ouvrir le profil' },
    { title: 'Scanner pour pointer', text: 'Pointez votre camera vers le code QR a l\'entree du bureau. C\'est tout - vous etes pointe !', btn: 'Commencer' }
  ];
  var onboardStep = 0;

  function openOnboarding() {
    onboardStep = 0;
    renderOnboardStep();
    showModal('modal-onboard');
  }

  function renderOnboardStep() {
    var s = ONBOARD_STEPS[onboardStep];
    $('ob-title').textContent = s.title;
    $('ob-text').textContent = s.text;
    $('ob-next').textContent = s.btn;
    var dots = '';
    for (var i = 0; i < ONBOARD_STEPS.length; i++) {
      dots += '<span class="ob-dot' + (i === onboardStep ? ' on' : '') + '"></span>';
    }
    $('ob-steps').innerHTML = dots;
  }

  function onOnboardNext() {
    var s = ONBOARD_STEPS[onboardStep];
    if (s.btn === 'Ouvrir le profil') {
      showProfileModal();
      return;
    }
    onboardStep++;
    if (onboardStep >= ONBOARD_STEPS.length) {
      finishOnboarding();
      return;
    }
    renderOnboardStep();
  }

  function finishOnboarding() {
    localStorage.setItem(LS_ONBOARDED, '1');
    hideModal('modal-onboard');
  }

  function dismissOnboarding() {
    finishOnboarding();
  }

  function route() {
    var hash = location.hash || '#home';
    var wantsAdmin = hash.indexOf('admin') !== -1;
    var allowed = !!state.session && (!!state.isAdmin || !!state.adminToken);

    if (!state.session) {
      showLoginView();
      if (wantsAdmin) {
        showFeedback('warn', 'Connectez-vous pour acceder a cette page.');
        location.hash = '#home';
      }
      return;
    }

    document.body.classList.toggle('admin-view', wantsAdmin);

    if (wantsAdmin && !allowed && state.adminChecking) {
      $('view-home').classList.add('hidden');
      $('view-admin').classList.add('hidden');
      return;
    }

    if (wantsAdmin && !allowed) {
      showFeedback('warn', 'Acces admin reserve au personnel autorise.');
      location.hash = '#home';
      return;
    }

    hideLoginView();
    $('view-home').classList.toggle('hidden', wantsAdmin);
    $('view-admin').classList.toggle('hidden', !wantsAdmin);
    var navHome = $('nav-home');
    if (navHome) navHome.classList.toggle('active', !wantsAdmin);
    if (!wantsAdmin && state.qrScanner) closeScanner();
  }

  /* ---------------- Admin access gate ---------------- */

  function applyAdminVisibility() {
    var btn = $('btn-admin');
    if (btn) btn.classList.toggle('hidden', !state.isAdmin);
  }

  function refreshAdminAccess() {
    var email = state.profile && state.profile.email ? String(state.profile.email).trim() : '';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      state.isAdmin = false;
      state.adminChecking = false;
      state.adminCheck = null;
      applyAdminVisibility();
      return Promise.resolve(false);
    }
    state.adminChecking = true;
    var p = api({ action: 'admin_check', email: email })
      .then(function (res) {
        state.isAdmin = !!(res && res.ok && res.isAdmin);
      })
      .catch(function () {
        state.isAdmin = false;
      })
      .then(function () {
        state.adminChecking = false;
        state.adminCheck = null;
        applyAdminVisibility();
        route();
        return state.isAdmin;
      });
    state.adminCheck = p;
    return p;
  }

  /* ---------------- Admin ---------------- */

  function syncQuickRangeActive(from, to) {
    var chips = document.querySelectorAll('.qr-chip');
    var today = todayStr();
    var match = '';
    if (from === today && to === today) match = 'today';
    else if (to === today && from === shiftDateStr(-6)) match = '7d';
    else if (to === today && from === shiftDateStr(-29)) match = '30d';
    for (var i = 0; i < chips.length; i++) {
      chips[i].classList.toggle('active', chips[i].dataset.range === match);
    }
  }

  function onQuickRange(e) {
    var range = e.currentTarget.dataset.range;
    var today = todayStr();
    if (range === 'today') {
      $('rng-from').value = today;
      $('rng-to').value = today;
    } else if (range === '7d') {
      $('rng-from').value = shiftDateStr(-6);
      $('rng-to').value = today;
    } else if (range === '30d') {
      $('rng-from').value = shiftDateStr(-29);
      $('rng-to').value = today;
    } else if (range === 'month') {
      var n = new Date();
      $('rng-from').value = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-01';
      $('rng-to').value = today;
    }
    onAdminGo();
  }

  function onAdminGo() {
    var from = $('rng-from').value || todayStr();
    var to = $('rng-to').value || todayStr();
    var body = { action: 'admin', from: from, to: to };
    if (state.adminToken) {
      body.token = state.adminToken;
    } else {
      var email = $('admin-email') ? $('admin-email').value.trim() : '';
      var pin = $('admin-pin').value.trim() || state.pin || '';
      var otp = $('admin-otp') ? $('admin-otp').value.trim() : '';

      if (!email && !pin) { showError('admin-error', 'Saisissez votre email et votre code PIN.'); return; }
      if (email) {
        body.email = email;
        if (!otp && $('otp-row') && !$('otp-row').classList.contains('hidden')) {
          showError('admin-error', 'Saisissez le code a usage unique envoye par email.');
          return;
        }
        body.otp = otp;
        body.action = 'admin_login';
        body.pin = '';
      } else {
        if (!pin) { showError('admin-error', 'Saisissez le code PIN admin.'); return; }
        if (!otp && $('otp-row') && !$('otp-row').classList.contains('hidden')) {
          showError('admin-error', 'Saisissez le code a usage unique envoye par email.');
          return;
        }
        body.pin = pin;
        body.otp = otp;
      }
    }
    hideError('admin-error');
    $('btn-admin-go').textContent = 'Chargement...';
    showReportSkeleton();
    api(body).then(function (res) {
      $('btn-admin-go').textContent = 'Acceder au tableau de bord';
      if (res && res.needOtp) {
        clearReportSkeleton();
        showOtpStep(res);
        return;
      }
      if (!res.ok) {
        if (state.adminToken) state.adminToken = '';
        throw new Error((res && res.message) || 'Session expiree. Connectez-vous a nouveau.');
      }
      if (email) state.adminEmail = email;
      if (pin) state.pin = pin;
      state.isAdmin = true;
      applyAdminVisibility();
      state.adminToken = res.sessionToken || res.token || state.adminToken || '';
      if (email && res.ok) {
        var adminBody = { action: 'admin', from: from, to: to, token: state.adminToken };
        return api(adminBody).then(function (adminRes) {
          if (!adminRes.ok) throw new Error(adminRes.message || 'Echec du chargement des donnees admin.');
          state.admin = adminRes.admin;
          renderAdmin(adminRes.admin);
        });
      }
      state.admin = res.admin;
      renderAdmin(res.admin);
    }).catch(function (err) {
      $('btn-admin-go').textContent = 'Acceder au tableau de bord';
      clearReportSkeleton();
      handleAdminAuthFail(err);
      showError('admin-error', err.message);
    });
  }

  /* ---------------- Segmented OTP input ---------------- */

  function initOtpSegments(segId, hiddenId, onComplete) {
    var seg = $(segId);
    if (!seg) return;
    var hidden = $(hiddenId);
    var boxes = seg.querySelectorAll('.otp-box');

    function syncToHidden() {
      var v = '';
      for (var i = 0; i < boxes.length; i++) v += boxes[i].value;
      if (hidden) hidden.value = v;
      if (v.length === boxes.length && onComplete) onComplete();
    }

    for (var i = 0; i < boxes.length; i++) {
      (function (idx) {
        var box = boxes[idx];
        box.addEventListener('input', function () {
          box.value = box.value.replace(/\D/g, '').slice(-1);
          if (box.value && idx < boxes.length - 1) boxes[idx + 1].focus();
          syncToHidden();
        });
        box.addEventListener('keydown', function (e) {
          if (e.key === 'Backspace' && !box.value && idx > 0) {
            e.preventDefault();
            boxes[idx - 1].value = '';
            boxes[idx - 1].focus();
            syncToHidden();
          }
        });
        box.addEventListener('paste', function (e) {
          var txt = '';
          try { txt = (e.clipboardData || window.clipboardData).getData('text') || ''; } catch (err) {}
          var digits = txt.replace(/\D/g, '').slice(0, boxes.length);
          if (!digits) return;
          e.preventDefault();
          for (var j = 0; j < boxes.length; j++) boxes[j].value = digits.charAt(j) || '';
          boxes[Math.min(digits.length, boxes.length - 1)].focus();
          syncToHidden();
        });
        box.addEventListener('focus', function () { box.select(); });
      })(i);
    }
  }

  function showOtpStep(res) {
    $('otp-row').classList.remove('hidden');
    $('admin-otp-note').textContent = res.message || '';
    $('admin-otp-note').classList.remove('hidden');
    if (res.otpDev) {
      $('admin-otp-note').textContent = res.message + ' Code de developpement : ' + res.otpDev;
    }
    $('btn-admin-go').textContent = 'Verifier le code';
    var firstBox = document.querySelector('#otp-seg .otp-box');
    if (firstBox) firstBox.focus();
    else $('admin-otp').focus();
  }

  function showReportSkeleton() {
    var tbody = $('report-table').querySelector('tbody');
    tbody.innerHTML = '';
    for (var r = 0; r < 4; r++) {
      var tr = document.createElement('tr');
      for (var c = 0; c < 6; c++) {
        var td = document.createElement('td');
        var sk = document.createElement('span');
        sk.className = 'sk sk-line' + (c % 3 === 0 ? ' short' : '');
        td.appendChild(sk);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }

  function clearReportSkeleton() {
    var tbody = $('report-table').querySelector('tbody');
    if (tbody) tbody.innerHTML = '';
  }

  function countUp(el, target) {
    if (!el) return;
    var val = Number(target) || 0;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !window.requestAnimationFrame) { el.textContent = String(val); return; }
    var dur = Math.min(700, 300 + val * 40);
    var start = null;
    function frame(now) {
      if (start === null) start = now;
      var t = Math.min(1, (now - start) / dur);
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = String(Math.round(val * eased));
      if (t < 1) window.requestAnimationFrame(frame);
    }
    window.requestAnimationFrame(frame);
  }

  function renderAdmin(a) {
    $('admin-sub').textContent = a.range.from + ' \u2192 ' + a.range.to + ' \u00b7 ' + a.appName;
    $('rng-from').value = a.range.from;
    $('rng-to').value = a.range.to;
    syncQuickRangeActive(a.range.from, a.range.to);
    $('dash-range-label').textContent = 'Periode : ' + a.range.from + ' \u2192 ' + a.range.to;

    $('kpi-staff').textContent = String((a.people || []).length);
    $('kpi-onsite').textContent = String(a.live.onSite || 0);
    $('kpi-in').textContent = String(a.live.checkedInToday || 0);
    $('kpi-out').textContent = String(a.live.checkedOutToday || 0);

    $('rp-hours').textContent = fmtHours(a.summary.totalHours);
    $('rp-days').textContent = a.summary.daysPresent;
    $('rp-late').textContent = a.summary.lateCount;
    $('rp-miss').textContent = a.summary.missingOut;

    $('on-site-count').textContent = a.live.onSite + ' sur place';
    var chips = $('on-site-list');
    chips.innerHTML = '';
    var onBreakSet = {};
    (a.live.onBreakNames || []).forEach(function (n) { onBreakSet[n] = 1; });
    if (!a.live.onSiteNames || a.live.onSiteNames.length === 0) {
      var empty = document.createElement('span');
      empty.className = 'empty';
      empty.textContent = a.live.isHolidayToday
        ? 'Jour ferie : ' + (a.live.holidayToday || 'ferie') + '. Personne n\'est attendu.'
        : 'Personne n\'est sur place actuellement.';
      chips.appendChild(empty);
    } else {
      a.live.onSiteNames.forEach(function (n) {
        var c = document.createElement('span');
        c.className = 'chip' + (onBreakSet[n] ? ' chip-pause' : '');
        c.textContent = onBreakSet[n] ? n + ' · pause' : n;
        chips.appendChild(c);
      });
    }

    var absent = a.live.absent || [];
    $('absent-count').textContent = absent.length + ' non pointe' + (absent.length > 1 ? 's' : '');
    var absentList = $('absent-list');
    absentList.innerHTML = '';
    if (a.live.isHolidayToday && absent.length === 0) {
      var he = document.createElement('span');
      he.className = 'empty';
      he.textContent = 'Jour ferie : ' + (a.live.holidayToday || '') + '.';
      absentList.appendChild(he);
    } else if (absent.length === 0) {
      var ae = document.createElement('span');
      ae.className = 'empty';
      ae.textContent = 'Tout le personnel a deja pointe aujourd\'hui.';
      absentList.appendChild(ae);
    } else {
      absent.forEach(function (p) {
        var c = document.createElement('span');
        c.className = 'chip absent';
        c.textContent = p.name ? p.name + ' \u00b7 ' + p.email : p.email;
        c.title = p.email;
        absentList.appendChild(c);
      });
    }
    if (!a.live.isHolidayToday && (a.leaves || []).some(function (l) {
      return todayStr() >= l.start && todayStr() <= l.end;
    })) {
      var lc = document.createElement('span');
      lc.className = 'chip chip-leave';
      lc.textContent = ((a.people || []).filter(function (p) { return p.statusToday === 'leave'; }).length) + ' en conge';
      absentList.appendChild(lc);
    }

    $('link-sheet').href = a.sheetUrl || '#';
    $('admin-login').classList.add('hidden');
    $('admin-dash').classList.remove('hidden');

    renderPeople();
    renderReportTable();
    renderHoursChart(a.pairs || []);

    loadEmployees();
    loadAdmins();
    loadLeaves();
    loadHolidays();
    syncCorrectionFields();
  }

  function renderHoursChart(pairs) {
    var byDate = {};
    var order = [];
    (pairs || []).forEach(function (p) {
      if (!p.date) return;
      if (!byDate[p.date]) {
        byDate[p.date] = 0;
        order.push(p.date);
      }
      byDate[p.date] += (p.hours != null && !isNaN(p.hours)) ? p.hours : 0;
    });
    order.sort();

    var chart = $('hours-chart');
    var empty = $('hours-empty');
    var pill = $('chart-pill');
    chart.innerHTML = '';

    var shown = order.slice(-14);
    var total = 0;
    shown.forEach(function (d) { total += byDate[d]; });
    pill.textContent = Math.round(total * 10) / 10 + ' h';

    if (shown.length === 0) {
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    var max = 0;
    shown.forEach(function (d) { if (byDate[d] > max) max = byDate[d]; });

    shown.forEach(function (d) {
      var col = document.createElement('div');
      col.className = 'bar-col';
      var val = document.createElement('span');
      val.className = 'bar-val';
      val.textContent = Math.round(byDate[d] * 10) / 10 || '';
      var bar = document.createElement('div');
      bar.className = 'bar';
      var pct = max > 0 ? Math.max(4, Math.round((byDate[d] / max) * 100)) : 4;
      bar.style.height = pct + '%';
      if (!byDate[d]) bar.classList.add('zero');
      var lbl = document.createElement('span');
      lbl.className = 'bar-label';
      lbl.textContent = d.slice(8, 10) + '/' + d.slice(5, 7);
      col.title = d + ' \u00b7 ' + fmtHours(byDate[d]);
      col.appendChild(val);
      col.appendChild(bar);
      col.appendChild(lbl);
      chart.appendChild(col);
    });
  }

  function applyAvatarHueGradient(el, seed) {
    var hue = avatarHue(seed);
    el.style.background = 'linear-gradient(135deg, hsl(' + hue + ', 48%, 40%), hsl(' + ((hue + 40) % 360) + ', 52%, 28%))';
  }

  function clearAvatarGradient(el) {
    el.style.background = '';
  }

  var PEOPLE_STATUS = {
    onsite: { label: 'Sur place', cls: 'in' },
    break: { label: 'En pause', cls: 'pause' },
    leave: { label: 'En conge', cls: 'leave' },
    out: { label: 'Sorti', cls: 'out' },
    absent: { label: 'Absent', cls: 'neutral' }
  };

  /* ---------------- Table search & sort ---------------- */

  function tableViewProcess(list, view, searchFn, keyFns) {
    var q = String(view.query || '').trim().toLowerCase();
    var rows = q
      ? list.filter(function (item) { return String(searchFn(item)).toLowerCase().indexOf(q) !== -1; })
      : list.slice();
    if (view.sortKey && keyFns[view.sortKey]) {
      var fn = keyFns[view.sortKey];
      rows.sort(function (x, y) { return cmpVals(fn(x), fn(y)) * view.sortDir; });
    }
    return rows;
  }

  function setupSortable(tableId, viewName, rerender) {
    var table = $(tableId);
    if (!table) return;
    var ths = table.querySelectorAll('th.sortable');
    function onClick() {
      var view = state[viewName];
      var key = this.dataset.key;
      if (view.sortKey === key) view.sortDir = -view.sortDir;
      else { view.sortKey = key; view.sortDir = 1; }
      updateSortIndicators(table, view);
      rerender();
    }
    for (var i = 0; i < ths.length; i++) ths[i].addEventListener('click', onClick);
  }

  function updateSortIndicators(table, view) {
    var ths = table.querySelectorAll('th.sortable');
    for (var i = 0; i < ths.length; i++) {
      ths[i].classList.toggle('asc', ths[i].dataset.key === view.sortKey && view.sortDir === 1);
      ths[i].classList.toggle('desc', ths[i].dataset.key === view.sortKey && view.sortDir === -1);
    }
  }

  var PEOPLE_SORT_KEYS = {
    name: function (p) { return p.name || p.email || ''; },
    daysPresent: function (p) { return Number(p.daysPresent || 0); },
    totalHours: function (p) { return p.totalHours == null ? -1 : Number(p.totalHours); },
    avgHours: function (p) { return p.avgHours == null ? -1 : Number(p.avgHours); },
    lateCount: function (p) { return Number(p.lateCount || 0); },
    statusToday: function (p) { return PEOPLE_STATUS[p.statusToday] ? PEOPLE_STATUS[p.statusToday].label : ''; }
  };

  var REPORT_SORT_KEYS = {
    date: function (p) { return p.date || ''; },
    name: function (p) { return p.name || ''; },
    in: function (p) { return p.in || ''; },
    out: function (p) { return p.out || ''; },
    hours: function (p) { return p.hours == null ? -1 : Number(p.hours); },
    status: function (p) { return p.missing ? 2 : (p.late ? 1 : 0); }
  };

  function renderPeople() {
    if (!state.admin) return;
    var all = state.admin.people || [];
    var people = tableViewProcess(all, state.peopleView,
      function (p) { return [p.name, p.email, p.department].filter(Boolean).join(' '); },
      PEOPLE_SORT_KEYS
    );
    $('people-count').textContent = (people.length === all.length)
      ? all.length + (all.length > 1 ? ' personnes' : ' personne')
      : people.length + ' / ' + all.length;
    var tbody = $('people-table').querySelector('tbody');
    tbody.innerHTML = '';
    if (people.length === 0) {
      var tr0 = document.createElement('tr');
      var td0 = document.createElement('td');
      td0.colSpan = 6;
      td0.className = 'empty';
      td0.textContent = all.length === 0 ? 'Aucun membre d\'effectif configure.' : 'Aucun resultat pour cette recherche.';
      tr0.appendChild(td0);
      tbody.appendChild(tr0);
      return;
    }
    people.forEach(function (p) {
      var tr = document.createElement('tr');
      var tdName = document.createElement('td');
      var cell = document.createElement('div');
      cell.className = 'person-cell';
      var av = document.createElement('span');
      av.className = 'avatar';
      var hue = avatarHue(p.email || p.name);
      av.style.background = 'linear-gradient(135deg, hsl(' + hue + ', 70%, 84%), hsl(' + ((hue + 40) % 360) + ', 62%, 68%))';
      av.style.color = 'hsl(' + hue + ', 58%, 28%)';
      av.textContent = avatarInitials(p.name, p.email);
      var nm = document.createElement('span');
      nm.className = 'person-name';
      nm.textContent = p.name || p.email;
      cell.appendChild(av);
      cell.appendChild(nm);
      if (p.department) {
        var dept = document.createElement('span');
        dept.className = 'person-dept';
        dept.textContent = p.department;
        cell.appendChild(dept);
      }
      tdName.appendChild(cell);
      tr.appendChild(tdName);
      [String(p.daysPresent || 0), fmtHours(p.totalHours), fmtHours(p.avgHours), String(p.lateCount || 0)].forEach(function (txt) {
        var td = document.createElement('td');
        td.textContent = txt;
        tr.appendChild(td);
      });
      var st = PEOPLE_STATUS[p.statusToday] || null;
      var tdStatus = document.createElement('td');
      if (st) {
        var tag = document.createElement('span');
        tag.className = 'tag ' + st.cls;
        tag.textContent = st.label;
        tdStatus.appendChild(tag);
      } else {
        tdStatus.textContent = '\u2014';
      }
      tr.appendChild(tdStatus);
      tr.title = p.email + (p.department ? ' \u00b7 ' + p.department : '');
      tbody.appendChild(tr);
    });
  }

  function renderReportTable() {
    if (!state.admin) return;
    var all = state.admin.pairs || [];
    var pairs = tableViewProcess(all, state.reportView,
      function (p) { return p.name || ''; },
      REPORT_SORT_KEYS
    );
    if (!state.reportView.sortKey) {
      pairs.sort(function (x, y) {
        return (y.date + y.in).localeCompare(x.date + x.in);
      });
    }
    $('report-count').textContent = (pairs.length === all.length)
      ? all.length + ' entree' + (all.length > 1 ? 's' : '')
      : pairs.length + ' / ' + all.length;
    var tbody = $('report-table').querySelector('tbody');
    tbody.innerHTML = '';
    if (pairs.length === 0) {
      var tr0 = document.createElement('tr');
      var td0 = document.createElement('td');
      td0.colSpan = 6;
      td0.className = 'empty';
      td0.textContent = all.length === 0 ? 'Aucune presence dans cette periode.' : 'Aucun resultat pour cette recherche.';
      tr0.appendChild(td0);
      tbody.appendChild(tr0);
      return;
    }
    pairs.forEach(function (p) {
      var tr = document.createElement('tr');
      if (p.missing) tr.className = 'row-missing';
      else if (p.late) tr.className = 'row-late';
      var cells = [p.date, p.name, p.in || '\u2014', p.out || '\u2014', fmtHours(p.hours)];
      cells.forEach(function (txt) {
        var td = document.createElement('td');
        td.textContent = txt;
        tr.appendChild(td);
      });
      var tdStatus = document.createElement('td');
      var status = p.missing ? 'Pas de sortie' : (p.late ? 'Retard' : 'OK');
      var tag = document.createElement('span');
      tag.className = 'tag ' + (p.missing ? 'neutral' : (p.late ? 'out' : 'in'));
      tag.textContent = status;
      tdStatus.appendChild(tag);
      tr.appendChild(tdStatus);
      tbody.appendChild(tr);
    });
  }

  function buildPeopleCsv(people) {
    var head = ['Nom', 'Email', 'Departement', 'Jours presents', 'Total heures', 'Moyenne heures/jour', 'Retards', 'Pas de sortie', 'Derniere date', 'Premiere entree (dernier jour)', 'Derniere sortie (dernier jour)', 'Statut aujourd\'hui'];
    var lines = [head.join(',')];
    (people || []).forEach(function (p) {
      var st = PEOPLE_STATUS[p.statusToday];
      var row = [
        p.name || '', p.email, p.department || '',
        p.daysPresent || 0,
        p.totalHours != null ? p.totalHours : '',
        p.avgHours != null ? p.avgHours : '',
        p.lateCount || 0,
        p.missingOut || 0,
        p.lastDate || '', p.firstIn || '', p.lastOut || '',
        st ? st.label : ''
      ];
      lines.push(row.map(function (c) {
        return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"';
      }).join(','));
    });
    return '\uFEFF' + lines.join('\r\n');
  }

  function downloadPeopleCsv() {
    if (!state.admin) return;
    var blob = new Blob([buildPeopleCsv(state.admin.people)], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'effectif-' + state.admin.range.from + '_' + state.admin.range.to + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  function loadEmployees() {
    if (!state.adminToken) return;
    api({ action: 'employees', token: state.adminToken }).then(function (res) {
      if (!res.ok) { handleAdminAuthFail(res); showError('emp-error', res.message || 'Impossible de charger les employes.'); return; }
      hideError('emp-error');
      state.employees = res.employees || [];
      renderEmployees();
    }).catch(function (err) {
      handleAdminAuthFail(err);
      showError('emp-error', err.message);
    });
  }

  function handleAdminAuthFail(res) {
    if (!(res && res.message && String(res.message).indexOf('Admin login required') !== -1)) return;
    state.adminToken = '';
    state.pin = '';
    state.adminEmail = '';
    $('admin-login').classList.remove('hidden');
    $('admin-dash').classList.add('hidden');
    showError('admin-error', 'Votre session admin a expire. Connectez-vous a nouveau.');
  }

  function renderEmployees() {
    var tbody = $('emp-table').querySelector('tbody');
    $('emp-count').textContent = state.employees.length + (state.employees.length === 1 ? ' employe' : ' employes');
    tbody.innerHTML = '';
    if (state.employees.length === 0) {
      var tr0 = document.createElement('tr');
      var td0 = document.createElement('td');
      td0.colSpan = 5;
      td0.className = 'empty';
      td0.textContent = 'Aucun employe ajoute pour l\'instant.';
      tr0.appendChild(td0);
      tbody.appendChild(tr0);
      return;
    }
    state.employees.forEach(function (e) {
      var tr = document.createElement('tr');
      var shift = (e.shiftStart || e.shiftEnd)
        ? ((e.shiftStart || '--:--') + ' - ' + (e.shiftEnd || '--:--'))
        : '\u2014';
      [e.name, e.email, e.department || '\u2014', shift].forEach(function (txt) {
        var td = document.createElement('td');
        td.textContent = txt;
        tr.appendChild(td);
      });
      var tdBtn = document.createElement('td');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ghost-btn sm';
      btn.textContent = 'Supprimer';
      btn.dataset.email = e.email;
      btn.addEventListener('click', onEmployeeDelete);
      tdBtn.appendChild(btn);
      tr.appendChild(tdBtn);
      tbody.appendChild(tr);
    });
  }

  function onEmployeeAdd() {
    var name = $('emp-name').value.trim();
    var email = $('emp-email').value.trim();
    var dept = $('emp-dept').value.trim();
    var shiftStart = $('emp-shift-start').value;
    var shiftEnd = $('emp-shift-end').value;
    if (!name) { showError('emp-error', 'Saisissez le nom de l\'employe.'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { showError('emp-error', 'Saisissez un email valide.'); return; }
    if (!state.adminToken) { showError('emp-error', 'Connectez-vous en tant qu\'admin d\'abord.'); return; }
    hideError('emp-error');
    $('btn-emp-add').textContent = 'Ajout...';
    api({
      action: 'employee_add', token: state.adminToken,
      name: name, email: email, department: dept,
      shiftStart: shiftStart, shiftEnd: shiftEnd
    }).then(function (res) {
      $('btn-emp-add').textContent = 'Ajouter';
      if (!res.ok) throw new Error(res.message || 'Impossible d\'ajouter l\'employe');
      $('emp-name').value = '';
      $('emp-email').value = '';
      $('emp-dept').value = '';
      $('emp-shift-start').value = '';
      $('emp-shift-end').value = '';
      loadEmployees();
      showFeedback('success', 'Employe "' + res.employee.name + '" enregistre.');
    }).catch(function (err) {
      $('btn-emp-add').textContent = 'Ajouter';
      handleAdminAuthFail(err);
      showError('emp-error', err.message);
    });
  }

  function onEmployeeDelete(e) {
    var email = e.target && e.target.dataset.email;
    if (!email) return;
    if (!window.confirm('Supprimer ' + email + ' de la liste des employes ?')) return;
    api({ action: 'employee_delete', token: state.adminToken, email: email }).then(function (res) {
      if (!res.ok) throw new Error(res.message || 'Impossible de supprimer l\'employe');
      loadEmployees();
      showFeedback('success', email + ' supprime.');
    }).catch(function (err) {
      handleAdminAuthFail(err);
      showError('emp-error', err.message);
    });
  }

  /* ---------------- Admins ---------------- */

  function loadAdmins() {
    if (!state.adminToken) return;
    api({ action: 'admins_list', token: state.adminToken }).then(function (res) {
      if (!res.ok) { handleAdminAuthFail(res); showError('adm-error', res.message || 'Impossible de charger les admins.'); return; }
      hideError('adm-error');
      state.admins = res.admins || [];
      renderAdmins();
    }).catch(function (err) {
      handleAdminAuthFail(err);
      showError('adm-error', err.message);
    });
  }

  function renderAdmins() {
    var tbody = $('adm-table').querySelector('tbody');
    $('adm-count').textContent = state.admins.length + (state.admins.length === 1 ? ' admin' : ' admins');
    tbody.innerHTML = '';
    if (state.admins.length === 0) {
      var tr0 = document.createElement('tr');
      var td0 = document.createElement('td');
      td0.colSpan = 4;
      td0.className = 'empty';
      td0.textContent = 'Aucun admin ajoute pour l\'instant.';
      tr0.appendChild(td0);
      tbody.appendChild(tr0);
      return;
    }
    state.admins.forEach(function (a) {
      var tr = document.createElement('tr');
      [a.name || '\u2014', a.email, a.addedOn || '\u2014'].forEach(function (txt) {
        var td = document.createElement('td');
        td.textContent = txt;
        tr.appendChild(td);
      });
      var tdBtn = document.createElement('td');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ghost-btn sm';
      btn.textContent = 'Supprimer';
      btn.dataset.email = a.email;
      btn.addEventListener('click', onAdminRemove);
      tdBtn.appendChild(btn);
      tr.appendChild(tdBtn);
      tbody.appendChild(tr);
    });
  }

  function onAdminAdd() {
    var name = $('adm-name').value.trim();
    var email = $('adm-email').value.trim();
    if (!email) { showError('adm-error', 'Saisissez l\'email de l\'admin.'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { showError('adm-error', 'Saisissez un email valide.'); return; }
    if (!state.adminToken) { showError('adm-error', 'Connectez-vous en tant qu\'admin d\'abord.'); return; }
    hideError('adm-error');
    $('btn-adm-add').textContent = 'Ajout...';
    api({ action: 'admin_add', token: state.adminToken, name: name, email: email, adminEmail: state.adminEmail || '' }).then(function (res) {
      $('btn-adm-add').textContent = 'Ajouter un admin';
      if (!res.ok) throw new Error(res.message || 'Impossible d\'ajouter l\'admin');
      $('adm-name').value = '';
      $('adm-email').value = '';
      loadAdmins();
      showFeedback('success', res.message || (email + ' est maintenant admin.'));
    }).catch(function (err) {
      $('btn-adm-add').textContent = 'Ajouter un admin';
      handleAdminAuthFail(err);
      showError('adm-error', err.message);
    });
  }

  function onAdminRemove(e) {
    var email = e.target && e.target.dataset.email;
    if (!email) return;
    if (!window.confirm('Retirer l\'acces admin de ' + email + ' ?')) return;
    api({ action: 'admin_remove', token: state.adminToken, email: email, adminEmail: state.adminEmail || '' }).then(function (res) {
      if (!res.ok) throw new Error(res.message || 'Impossible de supprimer l\'admin');
      loadAdmins();
      showFeedback('success', email + ' retire des admins.');
    }).catch(function (err) {
      handleAdminAuthFail(err);
      showError('adm-error', err.message);
    });
  }

  /* ---------------- Leaves ---------------- */

  function loadLeaves() {
    if (!state.adminToken) return;
    api({ action: 'leave_list', token: state.adminToken }).then(function (res) {
      if (!res.ok) { handleAdminAuthFail(res); showError('lv-error', res.message || 'Impossible de charger les conges.'); return; }
      hideError('lv-error');
      state.leaves = res.leaves || [];
      renderLeaves();
    }).catch(function (err) {
      handleAdminAuthFail(err);
      showError('lv-error', err.message);
    });
  }

  function renderLeaves() {
    var tbody = $('lv-table').querySelector('tbody');
    $('lv-count').textContent = state.leaves.length + (state.leaves.length === 1 ? ' periode' : ' periodes');
    tbody.innerHTML = '';
    if (state.leaves.length === 0) {
      var tr0 = document.createElement('tr');
      var td0 = document.createElement('td');
      td0.colSpan = 5;
      td0.className = 'empty';
      td0.textContent = 'Aucun conge enregistre.';
      tr0.appendChild(td0);
      tbody.appendChild(tr0);
      return;
    }
    state.leaves.forEach(function (l, idx) {
      var tr = document.createElement('tr');
      [l.email, l.start, l.end, l.reason || '\u2014'].forEach(function (txt) {
        var td = document.createElement('td');
        td.textContent = txt;
        tr.appendChild(td);
      });
      var tdBtn = document.createElement('td');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ghost-btn sm';
      btn.textContent = 'Supprimer';
      btn.dataset.index = idx + 1; // server-side sheet row index
      btn.addEventListener('click', onLeaveDelete);
      tdBtn.appendChild(btn);
      tr.appendChild(tdBtn);
      tbody.appendChild(tr);
    });
  }

  function onLeaveAdd() {
    var email = $('lv-email').value.trim();
    var start = $('lv-start').value;
    var end = $('lv-end').value || start;
    var reason = $('lv-reason').value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { showError('lv-error', 'Saisissez un email valide.'); return; }
    if (!start || !end) { showError('lv-error', 'Saisissez les dates du conge.'); return; }
    if (!state.adminToken) { showError('lv-error', 'Connectez-vous en tant qu\'admin d\'abord.'); return; }
    hideError('lv-error');
    $('btn-lv-add').textContent = 'Ajout...';
    api({
      action: 'leave_add', token: state.adminToken,
      email: email, start: start, end: end, reason: reason,
      adminEmail: state.adminEmail || ''
    }).then(function (res) {
      $('btn-lv-add').textContent = 'Ajouter';
      if (!res.ok) throw new Error(res.message || 'Impossible d\'ajouter le conge');
      $('lv-email').value = '';
      $('lv-reason').value = '';
      loadLeaves();
      showFeedback('success', 'Conge enregistre pour ' + email + '.');
    }).catch(function (err) {
      $('btn-lv-add').textContent = 'Ajouter';
      handleAdminAuthFail(err);
      showError('lv-error', err.message);
    });
  }

  function onLeaveDelete(e) {
    var index = Number(e.target && e.target.dataset.index);
    if (!index) return;
    if (!window.confirm('Supprimer cette periode de conge ?')) return;
    api({ action: 'leave_delete', token: state.adminToken, index: index, adminEmail: state.adminEmail || '' }).then(function (res) {
      if (!res.ok) throw new Error(res.message || 'Impossible de supprimer le conge');
      loadLeaves();
      showFeedback('success', 'Conge supprime.');
    }).catch(function (err) {
      handleAdminAuthFail(err);
      showError('lv-error', err.message);
    });
  }

  /* ---------------- Holidays ---------------- */

  function loadHolidays() {
    if (!state.adminToken) return;
    api({ action: 'holiday_list', token: state.adminToken }).then(function (res) {
      if (!res.ok) { handleAdminAuthFail(res); showError('hf-error', res.message || 'Impossible de charger les jours feries.'); return; }
      hideError('hf-error');
      state.holidays = res.holidays || [];
      renderHolidays();
    }).catch(function (err) {
      handleAdminAuthFail(err);
      showError('hf-error', err.message);
    });
  }

  function renderHolidays() {
    var tbody = $('hf-table').querySelector('tbody');
    $('hf-count').textContent = state.holidays.length + (state.holidays.length === 1 ? ' jour' : ' jours');
    tbody.innerHTML = '';
    if (state.holidays.length === 0) {
      var tr0 = document.createElement('tr');
      var td0 = document.createElement('td');
      td0.colSpan = 3;
      td0.className = 'empty';
      td0.textContent = 'Aucun jour ferie enregistre.';
      tr0.appendChild(td0);
      tbody.appendChild(tr0);
      return;
    }
    state.holidays.forEach(function (h, idx) {
      var tr = document.createElement('tr');
      [h.date, h.name].forEach(function (txt) {
        var td = document.createElement('td');
        td.textContent = txt;
        tr.appendChild(td);
      });
      var tdBtn = document.createElement('td');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ghost-btn sm';
      btn.textContent = 'Supprimer';
      btn.dataset.index = idx + 1;
      btn.addEventListener('click', onHolidayDelete);
      tdBtn.appendChild(btn);
      tr.appendChild(tdBtn);
      tbody.appendChild(tr);
    });
  }

  function onHolidayAdd() {
    var date = $('hf-date').value;
    var name = $('hf-name').value.trim();
    if (!date) { showError('hf-error', 'Saisissez la date du jour ferie.'); return; }
    if (!state.adminToken) { showError('hf-error', 'Connectez-vous en tant qu\'admin d\'abord.'); return; }
    hideError('hf-error');
    $('btn-hf-add').textContent = 'Ajout...';
    api({ action: 'holiday_add', token: state.adminToken, date: date, name: name, adminEmail: state.adminEmail || '' }).then(function (res) {
      $('btn-hf-add').textContent = 'Ajouter';
      if (!res.ok) throw new Error(res.message || 'Impossible d\'ajouter le jour ferie');
      $('hf-date').value = '';
      $('hf-name').value = '';
      loadHolidays();
      showFeedback('success', 'Jour ferie enregistre.');
    }).catch(function (err) {
      $('btn-hf-add').textContent = 'Ajouter';
      handleAdminAuthFail(err);
      showError('hf-error', err.message);
    });
  }

  function onHolidayDelete(e) {
    var index = Number(e.target && e.target.dataset.index);
    if (!index) return;
    if (!window.confirm('Supprimer ce jour ferie ?')) return;
    api({ action: 'holiday_delete', token: state.adminToken, index: index, adminEmail: state.adminEmail || '' }).then(function (res) {
      if (!res.ok) throw new Error(res.message || 'Impossible de supprimer le jour ferie');
      loadHolidays();
      showFeedback('success', 'Jour ferie supprime.');
    }).catch(function (err) {
      handleAdminAuthFail(err);
      showError('hf-error', err.message);
    });
  }

  /* ---------------- Manual corrections ---------------- */

  function syncCorrectionFields() {
    var mode = $('co-mode').value;
    document.querySelector('.co-in-field').classList.toggle('hidden', mode !== 'add_pair');
    // remove_last needs no times at all
    $('co-out').parentElement.classList.toggle('hidden', mode === 'remove_last');
  }

  function onCorrectionApply() {
    var email = $('co-email').value.trim();
    var date = $('co-date').value;
    var fixMode = $('co-mode').value;
    var inTime = $('co-in').value;
    var out = $('co-out').value;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { showError('co-error', 'Saisissez un email valide.'); return; }
    if (!date) { showError('co-error', 'Saisissez la date a corriger.'); return; }
    if (!state.adminToken) { showError('co-error', 'Connectez-vous en tant qu\'admin d\'abord.'); return; }
    if (fixMode !== 'remove_last') {
      if (!out) { showError('co-error', 'Saisissez l\'heure de sortie (HH:MM).'); return; }
      if (fixMode === 'add_pair' && !inTime) { showError('co-error', 'Saisissez l\'heure d\'entree (HH:MM).'); return; }
    }
    hideError('co-error');
    $('co-result').classList.add('hidden');
    $('btn-co-apply').textContent = 'Application...';
    api({
      action: 'correction_apply', token: state.adminToken,
      email: email, date: date, fixMode: fixMode,
      inTime: inTime, out: out,
      adminEmail: state.adminEmail || ''
    }).then(function (res) {
      $('btn-co-apply').textContent = 'Appliquer';
      if (!res.ok) throw new Error(res.message || 'Correction refusee.');
      $('co-result').textContent = 'Fait : ' + (res.applied || 'correction appliquee.') + ' Pensez a recharger le rapport.';
      $('co-result').classList.remove('hidden');
      showFeedback('success', 'Correction appliquee.');
      onAdminGo(); // refresh the dashboard data
    }).catch(function (err) {
      $('btn-co-apply').textContent = 'Appliquer';
      handleAdminAuthFail(err);
      showError('co-error', err.message);
    });
  }

  function buildCsv(pairs) {
    var head = ['Date', 'Nom', 'Email', 'Entree', 'Sortie', 'Heures', 'Statut'];
    var lines = [head.join(',')];
    (pairs || []).forEach(function (p) {
      var status = p.missing ? 'Pas de sortie' : (p.late ? 'Retard' : 'OK');
      var row = [p.date, p.name, p.email, p.in || '', p.out || '', p.hours != null ? p.hours : '', status];
      lines.push(row.map(function (c) {
        return '"' + String(c).replace(/"/g, '""') + '"';
      }).join(','));
    });
    return '\uFEFF' + lines.join('\r\n');
  }

  function downloadCsv() {
    if (!state.admin) return;
    var blob = new Blob([buildCsv(state.admin.pairs)], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'presence-' + state.admin.range.from + '_' + state.admin.range.to + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  /* ---------------- Provision (multi-tenant) ---------------- */

  function onProvision() {
    var code = $('prov-code').value.trim();
    var appName = $('prov-name').value.trim();
    if (!state.pin) { showError('prov-error', 'Connectez-vous en tant qu\'admin d\'abord.'); return; }
    if (!code) { showError('prov-error', 'Saisissez un code espace.'); return; }
    if (!/^[a-z0-9][a-z0-9\-]{1,23}$/.test(code)) {
      showError('prov-error', 'Code espace : 2-24 caracteres, lettres/chiffres/tirets.');
      return;
    }
    hideError('prov-error');
    $('btn-provision').textContent = 'Creation...';
    api({ action: 'provision', masterPin: state.pin, code: code, appName: appName }).then(function (res) {
      $('btn-provision').textContent = 'Creer l\'espace';
      if (!res.ok) throw new Error(res.message || 'Echec de la creation');
      var t = res.tenant;
      $('prov-result').innerHTML =
        '<b>' + t.code + '</b> cree. Enregistrez ces informations - le PIN n\'est affiche qu\'une seule fois.<br>' +
        'PIN admin : <code>' + t.adminPin + '</code><br>' +
        'Contenu QR du bureau : <code>' + t.code + '|' + t.qrSecret + '</code><br>' +
        'Feuille de calcul : <a href="' + t.url + '" target="_blank" rel="noopener">' + t.url + '</a>';
      $('prov-result').classList.remove('hidden');
      showFeedback('success', 'Espace "' + t.code + '" cree.');
    }).catch(function (err) {
      $('btn-provision').textContent = 'Creer l\'espace';
      showError('prov-error', err.message);
    });
  }

  /* ---------------- My attendance ---------------- */

  function onHistoryClick() {
    if (!hasProfile()) {
      showFeedback('warn', 'Definissez vos coordonnees d\'abord, puis ouvrez Mon historique.');
      showProfileModal();
      return;
    }
    showFeedback('info', 'Chargement de votre historique...');
    api({ action: 'myattendance', email: state.profile.email }).then(function (res) {
      if (!res.ok) throw new Error(res.message || 'Impossible de charger l\'historique');
      renderHistory(res.attendance);
      showModal('modal-history');
    }).catch(function (err) {
      showFeedback('error', err.message);
    });
  }

  function onHistoryExport() {
    if (!hasProfile()) { showFeedback('warn', 'Definissez vos coordonnees d\'abord.'); return; }
    showFeedback('info', 'Preparation de vos donnees...');
    api({ action: 'myexport', email: state.profile.email }).then(function (res) {
      if (!res.ok) throw new Error(res.message || 'Impossible d\'exporter');
      var csv = '\uFEFF' + ['Date,Heure,Nom,Action,Statut,Distance(m),Bureau'].concat((res.rows || []).map(function (r) {
        return [r.date, r.time, r.name, r.action, r.status, r.distance, r.office].map(function (c) {
          return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"';
        }).join(',');
      })).join('\r\n');
      var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'ma-presence-' + state.profile.email + '.csv';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 100);
      showFeedback('success', (res.rows || []).length + ' enregistrement(s) exporte(s).');
    }).catch(function (err) {
      showFeedback('error', err.message);
    });
  }

  function onHistoryDelete() {
    if (!hasProfile()) { showFeedback('warn', 'Definissez vos coordonnees d\'abord.'); return; }
    if (!window.confirm('Effacer TOUS vos enregistrements de presence de la feuille du bureau ? Cette action est irreversible.')) return;
    api({ action: 'mydelete', email: state.profile.email }).then(function (res) {
      if (!res.ok) throw new Error(res.message || 'Impossible d\'effacer les donnees');
      hideModal('modal-history');
      loadRecent();
      loadWeek();
      showFeedback('success', (res.deleted || 0) + ' enregistrement(s) efface(s) de la feuille du bureau.');
    }).catch(function (err) {
      showFeedback('error', err.message);
    });
  }

  var HEAT_MONTHS = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre'];

  function renderHeatmap(pairs, rangeFrom) {
    var grid = $('history-heatmap');
    if (!grid) return;
    var present = {};
    var hoursMap = {};
    (pairs || []).forEach(function (p) {
      if (!p.date) return;
      present[p.date] = true;
      if (p.hours != null && !isNaN(p.hours)) {
        hoursMap[p.date] = Math.max(hoursMap[p.date] || 0, p.hours);
      }
    });
    var base = String(rangeFrom || todayStr()).split('-');
    var y = Number(base[0]);
    var m = Number(base[1]);
    var label = $('heat-month-label');
    if (label && y && m) label.textContent = HEAT_MONTHS[m - 1] + ' ' + y;
    if (!y || !m || m < 1 || m > 12) { grid.innerHTML = ''; return; }
    var first = new Date(y, m - 1, 1);
    var daysInMonth = new Date(y, m, 0).getDate();
    var lead = (first.getDay() + 6) % 7;
    var today = todayStr();
    var frag = document.createDocumentFragment();
    for (var i = 0; i < lead; i++) {
      var blank = document.createElement('span');
      blank.className = 'hm-cell blank';
      frag.appendChild(blank);
    }
    for (var d = 1; d <= daysInMonth; d++) {
      var ds = y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      var cell = document.createElement('span');
      cell.className = 'hm-cell';
      if (ds > today) {
        cell.classList.add('future');
      } else {
        var lvl = 0;
        if (present[ds]) {
          var h = hoursMap[ds];
          lvl = h == null ? 1 : (h < 2 ? 1 : h < 4 ? 2 : h < 6 ? 3 : 4);
        }
        cell.classList.add('lvl-' + lvl);
        cell.title = ds + ' \u00b7 ' + (present[ds] ? fmtHours(hoursMap[ds]) : 'Pas de pointage');
      }
      frag.appendChild(cell);
    }
    grid.innerHTML = '';
    grid.appendChild(frag);
  }

  function renderHistory(h) {
    $('hist-range').textContent = h.range.from + ' \u2192 ' + h.range.to;
    $('hist-days').textContent = h.summary.daysPresent;
    $('hist-hours').textContent = fmtHours(h.summary.totalHours);
    $('hist-late').textContent = h.summary.lateCount;
    renderHeatmap(h.pairs, h.range.from);

    var tbody = $('hist-table').querySelector('tbody');
    tbody.innerHTML = '';
    var pairs = (h.pairs || []).slice().sort(function (x, y) {
      return (y.date + y.in).localeCompare(x.date + x.in);
    });
    if (pairs.length === 0) {
      var tr0 = document.createElement('tr');
      var td0 = document.createElement('td');
      td0.colSpan = 5;
      td0.className = 'empty';
      td0.textContent = 'Aucune presence ce mois-ci.';
      tr0.appendChild(td0);
      tbody.appendChild(tr0);
    }
    pairs.forEach(function (p) {
      var tr = document.createElement('tr');
      if (p.missing) tr.className = 'row-missing';
      else if (p.late) tr.className = 'row-late';
      [p.date, p.in || '\u2014', p.out || '\u2014', fmtHours(p.hours)].forEach(function (txt) {
        var td = document.createElement('td');
        td.textContent = txt;
        tr.appendChild(td);
      });
      var tdStatus = document.createElement('td');
      var status = p.missing ? 'Pas de sortie' : (p.late ? 'Retard' : 'OK');
      var tag = document.createElement('span');
      tag.className = 'tag ' + (p.late ? 'out' : 'in');
      tag.textContent = status;
      tdStatus.appendChild(tag);
      tr.appendChild(tdStatus);
      tbody.appendChild(tr);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
