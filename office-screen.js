    (function () {
      var API_URL = window.ATT_CONFIG && window.ATT_CONFIG.API_URL;
      var POLL_MS = 10000;

      var LS_KEY = 'att.key.v1';
      var LS_SCR_TOKEN = 'att_screen_token';
      var LS_SCR_EMAIL = 'att_screen_email';
      var LS_SCR_TENANT = 'att_screen_tenant';
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
        if (!ENC_SUPPORTED) return Promise.resolve(null);
        try {
          var raw = localStorage.getItem(LS_KEY);
          if (raw) return Promise.resolve(raw);
          var bytes = new Uint8Array(32);
          window.crypto.getRandomValues(bytes);
          var b64 = bytesToBase64(bytes);
          localStorage.setItem(LS_KEY, b64);
          return Promise.resolve(b64);
        } catch (e) {
          ENC_SUPPORTED = false;
          return Promise.resolve(null);
        }
      }

      function importKey(b64, use) {
        return window.crypto.subtle.importKey('raw', base64ToBytes(b64), { name: 'AES-GCM' }, false, [use]);
      }

      function secureGet(key) {
        var v;
        try { v = localStorage.getItem(key); } catch (e) { return null; }
        if (v === null) return null;
        if (!ENC_SUPPORTED || v.indexOf('enc1:') !== 0) return v;
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

      function secureSet(key, val) {
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

      function secureRemove(key) {
        try { localStorage.removeItem(key); } catch (e) {}
      }

      function loadState() {
        return Promise.all([
          secureGet(LS_SCR_TOKEN),
          secureGet(LS_SCR_EMAIL),
          secureGet(LS_SCR_TENANT)
        ]).then(function (vals) {
          return {
            token: '',
            sessionToken: vals[0] || '',
            email: vals[1] || '',
            tenant: vals[2] || ''
          };
        });
      }

      var state = { token: '', sessionToken: '', email: '', tenant: '' };

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
          secureSet(LS_SCR_TOKEN, state.sessionToken);
          secureSet(LS_SCR_EMAIL, email);
          secureSet(LS_SCR_TENANT, state.tenant);
          enterScreen();
        }).catch(function () { st.textContent = 'Erreur reseau.'; });
      }

      function injectTenant(body) {
        var t = ($('tenant-inp') ? $('tenant-inp').value.trim() : '') || state.tenant;
        if (t) body.tenant = t;
        return body;
      }

      function logout() {
        secureRemove(LS_SCR_TOKEN);
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
      loadState().then(function (saved) {
        state.sessionToken = saved.sessionToken;
        state.email = saved.email;
        state.tenant = saved.tenant;
        if (state.sessionToken && state.email) {
          $('l-email').value = state.email;
          enterScreen();
        }
      });
    })();