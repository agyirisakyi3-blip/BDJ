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

  var state = {
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
    privacyNoticeShown: false
  };

  function $(id) { return document.getElementById(id); }

  function todayStr() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function tenantFromProfile() {
    var t = state.profile && state.profile.tenant ? String(state.profile.tenant).trim() : '';
    return t || String(DEFAULTS.DEFAULT_TENANT || '').trim();
  }

  function parseQr(text) {
    var idx = String(text).indexOf('|');
    if (idx === -1) return { tenant: '', token: String(text).trim() };
    return { tenant: String(text).slice(0, idx).trim(), token: String(text).slice(idx + 1).trim() };
  }

  function vibrate(pattern) {
    if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) {} }
  }

  function fmtDateLabel(d) {
    var months = ['Jan','Fev','Mar','Avr','Mai','Jun','Jul','Aou','Sep','Oct','Nov','Dec'];
    var wd = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
    return wd[d.getDay()] + ', ' + d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
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
    return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(API_URL) &&
           API_URL.indexOf('YOUR_SCRIPT_ID') === -1;
  }

  function defaultsConfig() {
    return {
      appName: DEFAULTS.APP_NAME || 'Presence'
    };
  }

  function hasConsent() {
    try { return localStorage.getItem(LS_CONSENT) === '1'; } catch (e) { return false; }
  }

  function setConsent(val) {
    try { localStorage.setItem(LS_CONSENT, val ? '1' : '0'); } catch (e) {}
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
    loadProfile().then(function () {
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

      refreshAdminAccess();

      fetchConfig()
        .then(renderHome)
        .catch(function (err) {
          if (!state.config) state.config = defaultsConfig();
          if (isConfigured()) showFeedback('warn', 'Impossible de charger les parametres du bureau : ' + err.message);
          renderHome();
        });

      route();
      window.addEventListener('hashchange', route);
      window.addEventListener('online', flushQueue);

      if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      }

      setTimeout(function () {
        flushQueue();
        loadRecent();
        loadWeek();
        if (!state.profile && !localStorage.getItem(LS_ONBOARDED)) openOnboarding();
      }, 800);
    });
  }

  function bindEvents() {
    $('btn-scan').addEventListener('click', onScanClick);
    $('btn-profile').addEventListener('click', function () { showProfileModal(); });
    $('btn-profile-save').addEventListener('click', onProfileSave);
    $('btn-scan-cancel').addEventListener('click', closeScanner);
    $('btn-manual-ok').addEventListener('click', onManualQr);
    $('btn-admin').addEventListener('click', function () { location.hash = '#admin'; });
    $('btn-back').addEventListener('click', function () { location.hash = '#home'; });
    $('btn-history').addEventListener('click', onHistoryClick);
    $('btn-hist-close').addEventListener('click', function () { hideModal('modal-history'); });
    $('btn-hist-export').addEventListener('click', onHistoryExport);
    $('btn-hist-delete').addEventListener('click', onHistoryDelete);
    $('btn-admin-go').addEventListener('click', onAdminGo);
    $('btn-load').addEventListener('click', onAdminGo);
    $('btn-refresh').addEventListener('click', onAdminGo);
    $('btn-csv').addEventListener('click', downloadCsv);
    $('btn-people-csv').addEventListener('click', downloadPeopleCsv);
    $('btn-provision').addEventListener('click', onProvision);
    $('btn-emp-add').addEventListener('click', onEmployeeAdd);
    $('btn-adm-add').addEventListener('click', onAdminAdd);
    $('btn-help').addEventListener('click', function () { showModal('modal-help'); });
    $('btn-help-close').addEventListener('click', function () { hideModal('modal-help'); });
    $('ob-next').addEventListener('click', onOnboardNext);
    $('ob-skip').addEventListener('click', dismissOnboarding);
    $('admin-pin').addEventListener('keydown', function (e) { if (e.key === 'Enter') onAdminGo(); });
    $('admin-email').addEventListener('keydown', function (e) { if (e.key === 'Enter') onAdminGo(); });
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
    var themeBtn = $('btn-theme');
    if (themeBtn) themeBtn.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      applyTheme(cur === 'light' ? 'dark' : 'light');
    });
  }

  /* ---------------- Theme ---------------- */

  function initTheme() {
    var t = localStorage.getItem(LS_THEME);
    if (t !== 'light' && t !== 'dark' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      t = 'light';
    }
    applyTheme(t === 'light' ? 'light' : 'dark');
  }

  function applyTheme(t) {
    var light = t === 'light';
    document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark');
    if (hasConsent()) { try { localStorage.setItem(LS_THEME, light ? 'light' : 'dark'); } catch (e) {} }
    var sun = $('ic-sun');
    var moon = $('ic-moon');
    if (sun) sun.style.display = light ? 'none' : '';
    if (moon) moon.style.display = light ? '' : 'none';
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

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
      try { state.status = raw ? JSON.parse(raw) : null; } catch (e) { state.status = null; }
    });
  }

  function saveStatus() {
    return lsSet(LS_STATUS, JSON.stringify(state.status));
  }

  function showProfileModal() {
    if (state.profile) {
      $('pf-name').value = state.profile.name || '';
      $('pf-email').value = state.profile.email || '';
      $('pf-tenant').value = state.profile.tenant || '';
    } else {
      $('pf-tenant').value = DEFAULTS.DEFAULT_TENANT || '';
    }
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
    if (!state.profile) {
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
    if (!state.profile) {
      showFeedback('warn', 'Definissez vos coordonnees d\'abord.');
      showProfileModal();
      return;
    }

    setBusy(true);
    showFeedback('info', 'Traitement de votre scan...');

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

    return api(payload).then(function (res) {
      setBusy(false);
      if (!res.ok) {
        showFeedback('error', res.message || 'Echec du pointage.');
        return;
      }
      state.status = {
        date: res.date || todayStr(),
        action: res.action,
        time: res.time,
        office: res.office,
        tenant: tenant
      };
      saveStatus();
      renderHome();
      loadRecent();
      loadWeek();
      vibrate(40);
      showScanSuccess(res.action, res.time, state.profile.name);
      var verb = res.action === 'Check-in' ? 'passe' : 'sorti';
      var loc = res.office ? ' a ' + res.office : '';
      showFeedback('success', 'Vous etes ' + verb + loc + ' a ' + res.time + '.');
    }, function (err) {
      setBusy(false);
      if (err && err.offline) {
        queueAttendance(payload);
        showFeedback('info', 'Vous etes hors ligne. Votre pointage a ete enregistre et se synchronisera automatiquement lorsque vous serez en ligne.');
      } else {
        showFeedback('error', 'Impossible de joindre le serveur : ' + err.message + '. Verifiez votre connexion et reessayez.');
      }
    });
  }

  /* ---------------- Home render ---------------- */

  function renderHome() {
    var card = $('status-card');
    var avatar = $('status-avatar');
    var label = $('status-label');
    var sub = $('status-sub');
    var time = $('status-time');
    var btnLabel = $('btn-scan-label');

    card.classList.remove('checked-in');
    var recentCard = $('recent-card');
    if (recentCard) recentCard.classList.toggle('hidden', !state.profile);
    var weekCard = $('week-card');
    if (weekCard) weekCard.classList.toggle('hidden', !state.profile);

    if (!state.profile) {
      avatar.className = 'status-avatar';
      avatar.textContent = '?';
      label.textContent = 'Bienvenue';
      sub.textContent = 'Definissez votre nom et email pour commencer.';
      time.textContent = '--:--';
      btnLabel.textContent = 'Scanner QR pour pointer';
      stopElapsedTimer();
      return;
    }

    if (state.status && state.status.action === 'Check-in') {
      card.classList.add('checked-in');
      avatar.className = 'status-avatar in';
      avatar.textContent = 'ENTREE';
      label.textContent = 'Pointe';
      sub.textContent = state.status.office ? 'A ' + state.status.office + '. Passez une bonne journee.' : 'Passez une bonne journee au bureau.';
      time.textContent = state.status.time;
      btnLabel.textContent = 'Scanner QR pour la sortie';
      startElapsedTimer();
    } else if (state.status) {
      avatar.className = 'status-avatar out';
      avatar.textContent = 'SORTIE';
      label.textContent = 'Sorti';
      sub.textContent = state.status.office ? 'De ' + state.status.office + '. Vous pouvez pointer a nouveau plus tard.' : 'Vous pouvez pointer a nouveau plus tard aujourd\'hui.';
      time.textContent = state.status.time;
      btnLabel.textContent = 'Scanner QR pour pointer';
      stopElapsedTimer();
    } else {
      avatar.className = 'status-avatar out';
      avatar.textContent = 'SORTIE';
      label.textContent = 'Non pointe';
      sub.textContent = 'Scannez le QR du bureau a l\'entree.';
      time.textContent = '--:--';
      btnLabel.textContent = 'Scanner QR pour pointer';
      stopElapsedTimer();
    }
  }

  /* ---------------- Recent activity ---------------- */

  function loadRecent() {
    if (!state.profile || !isConfigured()) return;
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
    if (!state.profile || !isConfigured()) return;
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

  function dayLabel(dateStr) {
    var p = dateStr.split('-');
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    var names = ['Di', 'Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa'];
    return names[d.getDay()];
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
  }

  /* ---------------- Scan success overlay ---------------- */

  var elapsedInterval = null;

  function startElapsedTimer() {
    stopElapsedTimer();
    var el = $('elapsed-wrap');
    var timer = $('elapsed-timer');
    if (!el || !timer || !state.status || state.status.action !== 'Check-in' || !state.status.time) {
      if (el) el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    var parts = state.status.time.split(':');
    var checkInSec = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2] || 0);
    function tick() {
      var now = new Date();
      var nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
      var diff = Math.max(0, nowSec - checkInSec);
      var h = Math.floor(diff / 3600);
      var m = Math.floor((diff % 3600) / 60);
      var s = diff % 60;
      timer.textContent = h + 'h ' + m + 'm ' + s + 's';
    }
    tick();
    elapsedInterval = setInterval(tick, 1000);
  }

  function stopElapsedTimer() {
    if (elapsedInterval) { clearInterval(elapsedInterval); elapsedInterval = null; }
    var el = $('elapsed-wrap');
    if (el) el.classList.add('hidden');
  }

  var ssTimer = null;

  function showScanSuccess(action, time, name) {
    var el = $('scan-success');
    if (!el) return;
    clearTimeout(ssTimer);
    el.classList.remove('hidden', 'fade');
    var first = String(name || '').trim().split(/\s+/)[0] || '';
    $('ss-title').textContent = action === 'Check-in'
      ? (first ? 'Bon retour, ' + first + '!' : 'Pointe')
      : (first ? 'Au revoir, ' + first + '!' : 'Sorti');
    $('ss-time').textContent = time || '';
    ssTimer = setTimeout(function () {
      el.classList.add('fade');
      setTimeout(function () { el.classList.add('hidden'); }, 500);
    }, 1200);
  }

  /* ---------------- Feedback ---------------- */

  var feedbackTimer = null;

  function showFeedback(type, msg) {
    var el = $('feedback');
    el.className = 'feedback ' + type;
    el.textContent = msg;
    if (type === 'success') vibrate(40);
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
    var allowed = !!state.isAdmin || !!state.adminToken;

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

    $('view-home').classList.toggle('hidden', wantsAdmin);
    $('view-admin').classList.toggle('hidden', !wantsAdmin);
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

  function showOtpStep(res) {
    $('otp-row').classList.remove('hidden');
    $('admin-otp-note').textContent = res.message || '';
    $('admin-otp-note').classList.remove('hidden');
    if (res.otpDev) {
      $('admin-otp-note').textContent = res.message + ' Code de developpement : ' + res.otpDev;
    }
    $('btn-admin-go').textContent = 'Verifier le code';
    $('admin-otp').focus();
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

  function fmtHours(h) {
    if (h === null || h === undefined || isNaN(h)) return '\u2014';
    var total = Math.round(h * 60);
    var hours = Math.floor(total / 60);
    var mins = total % 60;
    return hours + 'h ' + mins + 'm';
  }

  function renderAdmin(a) {
    $('admin-sub').textContent = a.range.from + ' \u2192 ' + a.range.to + ' \u00b7 ' + a.appName;
    $('rng-from').value = a.range.from;
    $('rng-to').value = a.range.to;
    $('dash-range-label').textContent = 'Periode : ' + a.range.from + ' \u2192 ' + a.range.to;

    $('kpi-staff').textContent = (a.people || []).length;
    $('kpi-onsite').textContent = a.live.onSite;
    $('kpi-in').textContent = a.live.checkedInToday;
    $('kpi-out').textContent = a.live.checkedOutToday;

    $('rp-hours').textContent = fmtHours(a.summary.totalHours);
    $('rp-days').textContent = a.summary.daysPresent;
    $('rp-late').textContent = a.summary.lateCount;
    $('rp-miss').textContent = a.summary.missingOut;

    $('on-site-count').textContent = a.live.onSite + ' sur place';
    var chips = $('on-site-list');
    chips.innerHTML = '';
    if (!a.live.onSiteNames || a.live.onSiteNames.length === 0) {
      var empty = document.createElement('span');
      empty.className = 'empty';
      empty.textContent = 'Personne n\'est sur place actuellement.';
      chips.appendChild(empty);
    } else {
      a.live.onSiteNames.forEach(function (n) {
        var c = document.createElement('span');
        c.className = 'chip';
        c.textContent = n;
        chips.appendChild(c);
      });
    }

    var absent = a.live.absent || [];
    $('absent-count').textContent = absent.length + ' non pointe' + (absent.length > 1 ? 's' : '');
    var absentList = $('absent-list');
    absentList.innerHTML = '';
    if (absent.length === 0) {
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

    var pairs = (a.pairs || []).slice().sort(function (x, y) {
      return (y.date + y.in).localeCompare(x.date + x.in);
    });
    $('report-count').textContent = pairs.length + ' entree' + (pairs.length > 1 ? 's' : '');
    var tbody = $('report-table').querySelector('tbody');
    tbody.innerHTML = '';
    if (pairs.length === 0) {
      var tr0 = document.createElement('tr');
      var td0 = document.createElement('td');
      td0.colSpan = 6;
      td0.className = 'empty';
      td0.textContent = 'Aucune presence dans cette periode.';
      tr0.appendChild(td0);
      tbody.appendChild(tr0);
      $('rp-hours').textContent = '0h 0m';
    }
    pairs.forEach(function (p) {
      var tr = document.createElement('tr');
      var cells = [p.date, p.name, p.in || '\u2014', p.out || '\u2014', fmtHours(p.hours)];
      cells.forEach(function (txt) {
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

    $('link-sheet').href = a.sheetUrl || '#';
    $('admin-login').classList.add('hidden');
    $('admin-dash').classList.remove('hidden');

    renderPeople(a.people || []);
    renderHoursChart(a.pairs || []);

    loadEmployees();
    loadAdmins();
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

  function avatarInitials(name, email) {
    var src = String(name || email || '?').trim();
    var parts = src.split(/[\s._@-]+/).filter(Boolean);
    var initials = '';
    if (parts.length >= 2) initials = parts[0].charAt(0) + parts[1].charAt(0);
    else if (parts.length === 1) initials = parts[0].slice(0, 2);
    return initials.toUpperCase();
  }

  var AVATAR_HUES = [258, 160, 199, 24, 340, 42, 120, 286];

  function avatarHue(email) {
    var h = 0;
    var s = String(email || '');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return AVATAR_HUES[h % AVATAR_HUES.length];
  }

  var PEOPLE_STATUS = {
    onsite: { label: 'Sur place', cls: 'in' },
    out: { label: 'Sorti', cls: 'out' },
    absent: { label: 'Absent', cls: 'neutral' }
  };

  function renderPeople(people) {
    $('people-count').textContent = people.length + (people.length > 1 ? ' personnes' : ' personne');
    var tbody = $('people-table').querySelector('tbody');
    tbody.innerHTML = '';
    if (people.length === 0) {
      var tr0 = document.createElement('tr');
      var td0 = document.createElement('td');
      td0.colSpan = 6;
      td0.className = 'empty';
      td0.textContent = 'Aucun membre d\'effectif configure.';
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
      av.style.background = 'hsl(' + avatarHue(p.email) + ', 62%, 88%)';
      av.style.color = 'hsl(' + avatarHue(p.email) + ', 55%, 32%)';
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
      td0.colSpan = 4;
      td0.className = 'empty';
      td0.textContent = 'Aucun employe ajoute pour l\'instant.';
      tr0.appendChild(td0);
      tbody.appendChild(tr0);
      return;
    }
    state.employees.forEach(function (e) {
      var tr = document.createElement('tr');
      [e.name, e.email, e.department || '\u2014'].forEach(function (txt) {
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
    if (!name) { showError('emp-error', 'Saisissez le nom de l\'employe.'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { showError('emp-error', 'Saisissez un email valide.'); return; }
    if (!state.adminToken) { showError('emp-error', 'Connectez-vous en tant qu\'admin d\'abord.'); return; }
    hideError('emp-error');
    $('btn-emp-add').textContent = 'Ajout...';
    api({ action: 'employee_add', token: state.adminToken, name: name, email: email, department: dept }).then(function (res) {
      $('btn-emp-add').textContent = 'Ajouter';
      if (!res.ok) throw new Error(res.message || 'Impossible d\'ajouter l\'employe');
      $('emp-name').value = '';
      $('emp-email').value = '';
      $('emp-dept').value = '';
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
    if (!state.profile) {
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
    if (!state.profile) { showFeedback('warn', 'Definissez vos coordonnees d\'abord.'); return; }
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
    if (!state.profile) { showFeedback('warn', 'Definissez vos coordonnees d\'abord.'); return; }
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

  function renderHistory(h) {
    $('hist-range').textContent = h.range.from + ' \u2192 ' + h.range.to;
    $('hist-days').textContent = h.summary.daysPresent;
    $('hist-hours').textContent = fmtHours(h.summary.totalHours);
    $('hist-late').textContent = h.summary.lateCount;

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
