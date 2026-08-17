window.ATT_CONFIG = {
  // The web app URL from: Apps Script > Deploy > New deployment > Web app.
  // Replace YOUR_SCRIPT_ID below after deploying. Keep the /exec suffix.
  API_URL: 'https://script.google.com/macros/s/AKfycbzY8Qf01Mlb7A6r0dd6WYFlBaKN2_swnW7GkvYmlkwNqCe0iAyqXaIY4-GFSS7PlRd3pQ/exec',

  // Fallback office settings used only if the Config sheet can't be reached.
  DEFAULT_OFFICE_LAT: 5.6037168,
  DEFAULT_OFFICE_LNG: -0.1869644,
  DEFAULT_RADIUS_METERS: 150,
  APP_NAME: 'BDJ Consulting',

  // Multi-tenant: optional default tenant code. Leave '' for a single-tenant app.
  // Office QRs may be "code|token" to auto-select the tenant; otherwise the
  // tenant set in Your details (or this value) is used.
  DEFAULT_TENANT: ''
};
