const CONFIG = {
  // v2.0 (Supabase): point to your deployed Supabase-backed API server.
  // Local dev (backend runs `npm run dev` on port 3000):
  API_URL: (import.meta.env && import.meta.env.VITE_API_URL) || 'http://localhost:3000/api',
  APP_NAME: 'addredance',
  DEFAULT_TENANT: '',
};

export default CONFIG;
