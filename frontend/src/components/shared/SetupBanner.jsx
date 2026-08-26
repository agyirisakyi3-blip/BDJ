import { useApp } from '../../contexts/AppContext';

export default function SetupBanner() {
  const { config } = useApp();
  const url = config?.API_URL || '';
  const isConfigured = /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url) && url.indexOf('YOUR_SCRIPT_ID') === -1;
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/exec(\?|$)/.test(url);
  if (isConfigured || isLocal) return null;

  return (
    <div className="banner warn">
      Configuration requise : definissez votre URL Apps Script dans <code>config.js</code> (API_URL), puis deployez le backend. Voir README.md pour les etapes.
    </div>
  );
}
