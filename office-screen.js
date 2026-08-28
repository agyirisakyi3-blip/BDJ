    (function () {
      var API_URL = window.ATT_CONFIG && window.ATT_CONFIG.API_URL;
      var POLL_MS = 10000;
      var state = {
        token: '',
        sessionToken: localStorage.getItem('att_screen_token') || '',
        email: localStorage.getItem('att_screen_email') || '',
        tenant: localStorage.getItem('att_screen_tenant') || ''
      };

      var $ = function (id) { return document.getElementById(id); };
      var loginEl = $('login'), screenEl = $('screen'), statusEl = $('status');

      function call(body) {
        return fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(body)
        }).then(function (r) { return r.text(); }).then(function (t) {
          try { return JSON.parse(t); } catch (e) { throw new Error('Reponse inattendue.'); }
        });
      }

      /* ---------------- Login ---------------- */

      function doLogin() {
        var email = $('l-email').value.trim();
        var otp = $('l-otp').value.trim();
        var st = $('l-status');
        if (!email) { st.textContent = 'Email requis.'; return; }
        st.textContent = '...';
        var body = { action: 'admin_login', email: email };
        if (otp) body.otp = otp;
        call(injectTenant(body)).then(function (res) {
          if (!res.ok) { st.textContent = res.message || 'Connexion impossible.'; return; }
          if (res.needOtp) {
            $('otp-row').classList.remove('hidden');
            $('l-email').readOnly = true;
            state.email = email;
            st.textContent = res.message || 'Code envoye.';
            return;
          }
          state.sessionToken = res.token || '';
          state.email = email;
          state.tenant = ($('tenant-inp').value.trim() || state.tenant);
          localStorage.setItem('att_screen_token', state.sessionToken);
          localStorage.setItem('att_screen_email', email);
          localStorage.setItem('att_screen_tenant', state.tenant);
          enterScreen();
        }).catch(function () { st.textContent = 'Erreur reseau.'; });
      }

      function injectTenant(body) {
        var t = ($('tenant-inp') ? $('tenant-inp').value.trim() : '') || state.tenant;
        if (t) body.tenant = t;
        return body;
      }

      function logout() {
        localStorage.removeItem('att_screen_token');
        state.sessionToken = '';
        location.reload();
      }

      /* ---------------- Screen ---------------- */

      function enterScreen() {
        loginEl.classList.add('hidden');
        screenEl.classList.remove('hidden');
        $('logout-btn').classList.remove('hidden');
        poll();
        setInterval(poll, POLL_MS);
        setInterval(tickClock, 1000);
      }

      function poll() {
        if (!state.sessionToken) return;
        call({ action: 'office_screen', token: state.sessionToken })
          .then(function (res) {
            if (!res.ok) {
              statusEl.textContent = res.message || 'Session expiree.';
              if (/login|session|token/i.test(String(res.message || ''))) logout();
              return;
            }
            render(res.screen);
          })
          .catch(function () { statusEl.textContent = 'Hors ligne â€” nouvelle tentative...'; });
      }

      function render(scr) {
        statusEl.textContent = '';
        $('app-title').textContent = scr.appName || 'addredance';
        drawQr(scr.token);
        var pct = Math.max(0, Math.min(100, (scr.secondsLeft / scr.intervalSec) * 100));
        $('cd-bar').style.width = pct.toFixed(1) + '%';
        $('cd').classList.toggle('warn', scr.secondsLeft <= 5);
        tickClock(scr.serverTime);
      }

      var qrBox = null;
      function drawQr(token) {
        if (!token || token === state.token) return;
        state.token = token;
        var box = $('qrcode');
        box.innerHTML = '';
        if (!window.QRCode) {
          statusEl.textContent = 'Bibliotheque QR indisponible (hors ligne ?).';
          return;
        }
        qrBox = new QRCode(box, { text: token, width: 420, height: 420, correctLevel: QRCode.CorrectLevel.M });
      }

      function tickClock(serverTime) {
        if (serverTime) { $('clock').textContent = 'Heure serveur : ' + serverTime; return; }
        // Local fallback between polls.
        var now = new Date();
        $('clock').textContent = 'Heure locale : ' +
          String(now.getHours()).padStart(2, '0') + ':' +
          String(now.getMinutes()).padStart(2, '0') + ':' +
          String(now.getSeconds()).padStart(2, '0');
      }

      /* ---------------- Wiring ---------------- */

      $('l-go').addEventListener('click', doLogin);
      $('l-otp').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
      $('l-email').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
      $('logout-btn').addEventListener('click', logout);
      $('fs-btn').addEventListener('click', function () {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(function () {});
        else document.exitFullscreen();
      });

      if (window.QRCode === undefined) {
        // Library blocked/offline: show a hint but keep login usable.
        console.warn('qrcodejs failed to load');
      }
      if (state.sessionToken && state.email) {
        $('l-email').value = state.email;
        enterScreen();
      }
    })();