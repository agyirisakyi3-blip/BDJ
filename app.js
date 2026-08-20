(function () {
  'use strict';

  var DEFAULTS = window.ATT_CONFIG || {};
  var API_URL = DEFAULTS.API_URL || '';
  var LS_PROFILE = 'att.profile.v1';
  var LS_STATUS = 'att.status.v1';
  var LS_QUEUE = 'att.queue.v1';
  var LS_ONBOARDED = 'att.onboarded.v1';
  var LS_THEME = 'att.theme.v1';

  var state = {
    profile: null,
    config: defaultsConfig(),
    status: null,
    qrScanner: null,
    admin: null,
    pendingScan: false,
    processing: false,
    employees: [],
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
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var wd = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
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
      appName: DEFAULTS.APP_NAME || 'Attendance'
    };
  }

  function init() {
    bindEvents();
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

      fetchConfig()
        .then(renderHome)
        .catch(function (err) {
          if (!state.config) state.config = defaultsConfig();
          if (isConfigured()) showFeedback('warn', 'Could not load office settings: ' + err.message);
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
    $('btn-provision').addEventListener('click', onProvision);
    $('btn-emp-add').addEventListener('click', onEmployeeAdd);
    $('ob-next').addEventListener('click', onOnboardNext);
    $('ob-skip').addEventListener('click', dismissOnboarding);
    $('admin-pin').addEventListener('keydown', function (e) { if (e.key === 'Enter') onAdminGo(); });
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
    try { localStorage.setItem(LS_THEME, light ? 'light' : 'dark'); } catch (e) {}
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
    if (!name) { showError('profile-error', 'Enter your name.'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { showError('profile-error', 'Enter a valid email.'); return; }
    if (tenant && !/^[a-z0-9][a-z0-9\-]{1,23}$/.test(tenant)) {
      showError('profile-error', 'Tenant code: 2-24 chars, letters/digits/hyphens.');
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
    loadRecent();
    loadWeek();
  }

  /* ---------------- API ---------------- */

  function api(body) {
    if (!isConfigured()) {
      return Promise.reject(new Error('The app is not configured yet. See the setup banner.'));
    }
    return fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(injectTenant(body))
    }).then(function (r) {
      return r.text();
    }).then(function (txt) {
      try { return JSON.parse(txt); }
      catch (e) { throw new Error('Unexpected server response.'); }
    }).catch(function (e) {
      if (!navigator.onLine || e instanceof TypeError) {
        var ne = new Error('Network error');
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
      showFeedback('info', 'Syncing ' + q.length + ' saved check-in' + (q.length > 1 ? 's' : '') + '...');
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
          showFeedback('warn', remaining.length + ' saved check-in' + (remaining.length > 1 ? 's' : '') + ' still waiting to sync.');
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
          showFeedback('success', synced + ' offline check-in' + (synced > 1 ? 's' : '') + ' synced.');
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
      if (!res.ok || !res.config) throw new Error((res && res.message) || 'Config error');
      state.config = Object.assign({}, defaultsConfig(), res.config);
      $('app-name').textContent = state.config.appName;
    });
  }

  /* ---------------- Recent activity ---------------- */

  function onScanClick() {
    if (!state.config) { showFeedback('warn', 'Still loading office settings, try again in a moment.'); return; }
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
      renderCameraError('The QR scanner failed to load (check your connection).');
      return;
    }
    if (!state.qrScanner) state.qrScanner = new Html5Qrcode('qr-reader');
    state.qrScanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 240, height: 240 } },
      function (text) { handleScan(text); },
      function () {}
    ).catch(function (err) {
      renderCameraError('Camera unavailable: ' + err);
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
        '<button type="button" class="ghost-btn" id="cam-retry">Retry camera</button>' +
        '<p class="hint">Camera not working? Enter the code manually below.</p>' +
      '</div>';
    var retry = document.getElementById('cam-retry');
    if (retry) retry.addEventListener('click', function () { openScanner(); });
  }

  function onManualQr() {
    var v = $('manual-qr').value.trim();
    if (!v) { showFeedback('error', 'Enter the QR content first.'); return; }
    handleScan(v);
  }

  function handleScan(text) {
    if (state.processing) return;
    state.processing = true;
    closeScanner();
    if (!text) {
      state.processing = false;
      showFeedback('error', 'No QR code detected.');
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
    label.textContent = busy ? 'Processing...' : (state.status ? 'Scan QR to check out' : 'Scan QR to check in');
  }

  function processAttendance(qrText) {
    if (!state.config) {
      setBusy(false);
      showFeedback('warn', 'Office settings are still loading. Try again in a moment.');
      return;
    }
    if (!state.profile) {
      setBusy(false);
      showFeedback('warn', 'Set your details first.');
      showProfileModal();
      return;
    }

    setBusy(true);
    showFeedback('info', 'Processing your scan...');

    var parsed = parseQr(qrText);
    var tenant = parsed.tenant || tenantFromProfile();
    var token = parsed.token || qrText;

    var payload = {
      action: 'attendance',
      tenant: tenant,
      qr: token,
      name: state.profile.name,
      email: state.profile.email,
      lat: 0,
      lng: 0,
      accuracy: 0,
      ts: Date.now()
    };

    return api(payload).then(function (res) {
      setBusy(false);
      if (!res.ok) {
        showFeedback('error', res.message || 'Check failed.');
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
      var verb = res.action === 'Check-in' ? 'checked in' : 'checked out';
      var loc = res.office ? ' at ' + res.office : '';
      showFeedback('success', 'You ' + verb + loc + ' at ' + res.time + '.');
    }, function (err) {
      setBusy(false);
      if (err && err.offline) {
        queueAttendance(payload);
        showFeedback('info', 'You are offline. Your check-in was saved and will sync automatically when you\'re back online.');
      } else {
        showFeedback('error', 'Could not reach the server: ' + err.message + '. Check your connection and try again.');
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
      label.textContent = 'Welcome';
      sub.textContent = 'Set your name and email to begin.';
      time.textContent = '--:--';
      btnLabel.textContent = 'Scan QR to check in';
      stopElapsedTimer();
      return;
    }

    if (state.status && state.status.action === 'Check-in') {
      card.classList.add('checked-in');
      avatar.className = 'status-avatar in';
      avatar.textContent = 'IN';
      label.textContent = 'Checked in';
      sub.textContent = state.status.office ? 'At ' + state.status.office + '. Have a great day.' : 'Have a great day at the office.';
      time.textContent = state.status.time;
      btnLabel.textContent = 'Scan QR to check out';
      startElapsedTimer();
    } else if (state.status) {
      avatar.className = 'status-avatar out';
      avatar.textContent = 'OUT';
      label.textContent = 'Checked out';
      sub.textContent = state.status.office ? 'From ' + state.status.office + '. You can check back in later.' : 'You can check back in later today.';
      time.textContent = state.status.time;
      btnLabel.textContent = 'Scan QR to check in';
      stopElapsedTimer();
    } else {
      avatar.className = 'status-avatar out';
      avatar.textContent = 'OUT';
      label.textContent = 'Not checked in';
      sub.textContent = 'Scan the office QR at the entrance.';
      time.textContent = '--:--';
      btnLabel.textContent = 'Scan QR to check in';
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
      meta.textContent = (r.office ? r.office : 'Office') + ' \u00b7 ' + r.time;
      main.appendChild(top);
      main.appendChild(meta);
      var badge = document.createElement('span');
      badge.className = 'tag ' + (r.action === 'Check-in' ? 'in' : 'out');
      badge.textContent = r.action === 'Check-in' ? 'IN' : 'OUT';
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
    var names = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
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
      bar.title = d.date + ': ' + (d.hours > 0 ? fmtHours(d.hours) : 'no check-in');
      if (d.hours > 0) {
        bar.style.height = Math.max(8, Math.round((d.hours / max) * 100)) + '%';
      }
      wrap.appendChild(bar);
      var label = document.createElement('span');
      label.className = 'week-label';
      label.textContent = d.date === today ? 'Today' : dayLabel(d.date);
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
      ? (first ? 'Welcome back, ' + first + '!' : 'Checked in')
      : (first ? 'Goodbye, ' + first + '!' : 'Checked out');
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
    b.innerHTML = 'Setup needed: set your Apps Script URL in <code>config.js</code> (API_URL), then deploy the backend. See README.md for steps.';
    b.classList.remove('hidden');
  }

  /* ---------------- Modals / routing ---------------- */

  function showModal(id) { $(id).classList.remove('hidden'); }
  function hideModal(id) { $(id).classList.add('hidden'); }

  /* ---------------- Onboarding ---------------- */

  var ONBOARD_STEPS = [
    { title: 'Welcome', text: 'This app records your office check-ins using the QR code at the entrance. No download needed - open it from your browser or install it.', btn: 'Next' },
    { title: 'Your details', text: 'First, set your name and email. You only do this once - it is stored on this device.', btn: 'Open profile' },
    { title: 'Scan to check in', text: 'Point your camera at the QR code at the office entrance. That\'s it - you\'re checked in!', btn: 'Get started' }
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
    if (s.btn === 'Open profile') {
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
    var admin = (location.hash || '#home').indexOf('admin') !== -1;
    $('view-home').classList.toggle('hidden', admin);
    $('view-admin').classList.toggle('hidden', !admin);
    if (!admin && state.qrScanner) closeScanner();
  }

  /* ---------------- Admin ---------------- */

  function onAdminGo() {
    var from = $('rng-from').value || todayStr();
    var to = $('rng-to').value || todayStr();
    var body = { action: 'admin', from: from, to: to };
    if (state.adminToken) {
      body.token = state.adminToken;
    } else {
      var pin = $('admin-pin').value.trim() || state.pin || '';
      if (!pin) { showError('admin-error', 'Enter the admin PIN.'); return; }
      var otp = $('admin-otp') ? $('admin-otp').value.trim() : '';
      if (!otp && $('otp-row') && !$('otp-row').classList.contains('hidden')) {
        showError('admin-error', 'Enter the one-time code emailed to you.');
        return;
      }
      body.pin = pin;
      body.otp = otp;
    }
    hideError('admin-error');
    $('btn-admin-go').textContent = 'Loading...';
    showReportSkeleton();
    api(body).then(function (res) {
      $('btn-admin-go').textContent = 'View today\'s summary';
      if (res && res.needOtp) {
        clearReportSkeleton();
        showOtpStep(res);
        return;
      }
      if (!res.ok) {
        if (state.adminToken) state.adminToken = '';
        throw new Error((res && res.message) || 'Session expired. Log in again.');
      }
      if (pin) state.pin = pin;
      state.adminToken = res.sessionToken || state.adminToken || '';
      state.admin = res.admin;
      renderAdmin(res.admin);
    }).catch(function (err) {
      $('btn-admin-go').textContent = 'View today\'s summary';
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
      $('admin-otp-note').textContent = res.message + ' Development code: ' + res.otpDev;
    }
    $('btn-admin-go').textContent = 'Verify code';
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

    $('st-in').textContent = a.live.checkedInToday;
    $('st-out').textContent = a.live.checkedOutToday;
    $('st-on').textContent = a.live.onSite;

    $('rp-hours').textContent = fmtHours(a.summary.totalHours);
    $('rp-days').textContent = a.summary.daysPresent;
    $('rp-late').textContent = a.summary.lateCount;
    $('rp-miss').textContent = a.summary.missingOut;

    $('on-site-count').textContent = a.live.onSite + ' on site';
    var chips = $('on-site-list');
    chips.innerHTML = '';
    if (!a.live.onSiteNames || a.live.onSiteNames.length === 0) {
      var empty = document.createElement('span');
      empty.className = 'empty';
      empty.textContent = 'No one is on site right now.';
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
    $('absent-count').textContent = absent.length + ' not checked in';
    var absentList = $('absent-list');
    absentList.innerHTML = '';
    if (absent.length === 0) {
      var ae = document.createElement('span');
      ae.className = 'empty';
      ae.textContent = 'Everyone on the roster has checked in today.';
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
    $('report-count').textContent = pairs.length + ' entries';
    var tbody = $('report-table').querySelector('tbody');
    tbody.innerHTML = '';
    if (pairs.length === 0) {
      var tr0 = document.createElement('tr');
      var td0 = document.createElement('td');
      td0.colSpan = 6;
      td0.className = 'empty';
      td0.textContent = 'No attendance in this range.';
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
      var status = p.missing ? 'No check-out' : (p.late ? 'Late' : 'OK');
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

    loadEmployees();
  }

  function loadEmployees() {
    if (!state.adminToken) return;
    api({ action: 'employees', token: state.adminToken }).then(function (res) {
      if (!res.ok) { handleAdminAuthFail(res); showError('emp-error', res.message || 'Could not load employees.'); return; }
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
    $('admin-login').classList.remove('hidden');
    $('admin-dash').classList.add('hidden');
    showError('admin-error', 'Your admin session expired. Log in again.');
  }

  function renderEmployees() {
    var tbody = $('emp-table').querySelector('tbody');
    $('emp-count').textContent = state.employees.length + (state.employees.length === 1 ? ' employee' : ' employees');
    tbody.innerHTML = '';
    if (state.employees.length === 0) {
      var tr0 = document.createElement('tr');
      var td0 = document.createElement('td');
      td0.colSpan = 4;
      td0.className = 'empty';
      td0.textContent = 'No employees added yet.';
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
      btn.textContent = 'Remove';
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
    if (!name) { showError('emp-error', 'Enter the employee name.'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { showError('emp-error', 'Enter a valid email.'); return; }
    if (!state.adminToken) { showError('emp-error', 'Log in as admin first.'); return; }
    hideError('emp-error');
    $('btn-emp-add').textContent = 'Adding...';
    api({ action: 'employee_add', token: state.adminToken, name: name, email: email, department: dept }).then(function (res) {
      $('btn-emp-add').textContent = 'Add';
      if (!res.ok) throw new Error(res.message || 'Could not add employee');
      $('emp-name').value = '';
      $('emp-email').value = '';
      $('emp-dept').value = '';
      loadEmployees();
      showFeedback('success', 'Employee "' + res.employee.name + '" saved.');
    }).catch(function (err) {
      $('btn-emp-add').textContent = 'Add';
      handleAdminAuthFail(err);
      showError('emp-error', err.message);
    });
  }

  function onEmployeeDelete(e) {
    var email = e.target && e.target.dataset.email;
    if (!email) return;
    if (!window.confirm('Remove ' + email + ' from the employee list?')) return;
    api({ action: 'employee_delete', token: state.adminToken, email: email }).then(function (res) {
      if (!res.ok) throw new Error(res.message || 'Could not remove employee');
      loadEmployees();
      showFeedback('success', email + ' removed.');
    }).catch(function (err) {
      handleAdminAuthFail(err);
      showError('emp-error', err.message);
    });
  }

  function buildCsv(pairs) {
    var head = ['Date', 'Name', 'Email', 'Check-in', 'Check-out', 'Hours', 'Status'];
    var lines = [head.join(',')];
    (pairs || []).forEach(function (p) {
      var status = p.missing ? 'No check-out' : (p.late ? 'Late' : 'OK');
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
    a.download = 'attendance-' + state.admin.range.from + '_' + state.admin.range.to + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  /* ---------------- Provision (multi-tenant) ---------------- */

  function onProvision() {
    var code = $('prov-code').value.trim();
    var appName = $('prov-name').value.trim();
    if (!state.pin) { showError('prov-error', 'Log in as admin first.'); return; }
    if (!code) { showError('prov-error', 'Enter a tenant code.'); return; }
    if (!/^[a-z0-9][a-z0-9\-]{1,23}$/.test(code)) {
      showError('prov-error', 'Tenant code: 2-24 chars, letters/digits/hyphens.');
      return;
    }
    hideError('prov-error');
    $('btn-provision').textContent = 'Creating...';
    api({ action: 'provision', masterPin: state.pin, code: code, appName: appName }).then(function (res) {
      $('btn-provision').textContent = 'Create tenant';
      if (!res.ok) throw new Error(res.message || 'Provision failed');
      var t = res.tenant;
      $('prov-result').innerHTML =
        '<b>' + t.code + '</b> created. Save these now - the PIN is shown once.<br>' +
        'Admin PIN: <code>' + t.adminPin + '</code><br>' +
        'Office QR content: <code>' + t.code + '|' + t.qrSecret + '</code><br>' +
        'Spreadsheet: <a href="' + t.url + '" target="_blank" rel="noopener">' + t.url + '</a>';
      $('prov-result').classList.remove('hidden');
      showFeedback('success', 'Tenant "' + t.code + '" created.');
    }).catch(function (err) {
      $('btn-provision').textContent = 'Create tenant';
      showError('prov-error', err.message);
    });
  }

  /* ---------------- My attendance ---------------- */

  function onHistoryClick() {
    if (!state.profile) {
      showFeedback('warn', 'Set your details first, then open My history.');
      showProfileModal();
      return;
    }
    showFeedback('info', 'Loading your history...');
    api({ action: 'myattendance', email: state.profile.email }).then(function (res) {
      if (!res.ok) throw new Error(res.message || 'Could not load history');
      renderHistory(res.attendance);
      showModal('modal-history');
    }).catch(function (err) {
      showFeedback('error', err.message);
    });
  }

  function onHistoryExport() {
    if (!state.profile) { showFeedback('warn', 'Set your details first.'); return; }
    showFeedback('info', 'Preparing your data...');
    api({ action: 'myexport', email: state.profile.email }).then(function (res) {
      if (!res.ok) throw new Error(res.message || 'Could not export');
      var csv = '\uFEFF' + ['Date,Time,Name,Action,Status,Distance(m),Office'].concat((res.rows || []).map(function (r) {
        return [r.date, r.time, r.name, r.action, r.status, r.distance, r.office].map(function (c) {
          return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"';
        }).join(',');
      })).join('\r\n');
      var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'my-attendance-' + state.profile.email + '.csv';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 100);
      showFeedback('success', (res.rows || []).length + ' record(s) exported.');
    }).catch(function (err) {
      showFeedback('error', err.message);
    });
  }

  function onHistoryDelete() {
    if (!state.profile) { showFeedback('warn', 'Set your details first.'); return; }
    if (!window.confirm('Erase ALL of your attendance records from the office sheet? This cannot be undone.')) return;
    api({ action: 'mydelete', email: state.profile.email }).then(function (res) {
      if (!res.ok) throw new Error(res.message || 'Could not erase data');
      hideModal('modal-history');
      loadRecent();
      loadWeek();
      showFeedback('success', (res.deleted || 0) + ' record(s) erased from the office sheet.');
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
      td0.textContent = 'No attendance yet this month.';
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
      var status = p.missing ? 'No check-out' : (p.late ? 'Late' : 'OK');
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
