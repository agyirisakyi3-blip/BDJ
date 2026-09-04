import CONFIG from './config';

export function isConfigured() {
  const url = CONFIG.API_URL;
  if (/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url) &&
      url.indexOf('YOUR_SCRIPT_ID') === -1) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/(exec|api)(\?|$)/.test(url)) return true;
  // Supabase-backed API server
  return /^https:\/\/.+\/api(\?|$)/.test(url) && url.indexOf('your-api-server') === -1;
}

export function api(body, tenant = '') {
  if (!isConfigured()) {
    return Promise.reject(new Error("L'application n'est pas encore configuree. Consultez la banniere de configuration."));
  }
  const payload = { ...body };
  if (payload.tenant === undefined && tenant) payload.tenant = tenant;
  return fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  })
    .then((r) => r.text())
    .then((txt) => {
      try { return JSON.parse(txt); }
      catch { throw new Error('Reponse inattendue du serveur.'); }
    })
    .catch((e) => {
      if (!navigator.onLine || e instanceof TypeError) {
        const ne = new Error('Erreur reseau');
        ne.offline = true;
        throw ne;
      }
      throw e;
    });
}
