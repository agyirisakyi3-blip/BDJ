import { isConfigured } from '../../api';

export default function SetupBanner() {
  if (isConfigured()) return null;

  return (
    <div className="banner warn">
      Configuration requise : definissez votre URL Apps Script dans <code>config.js</code> (API_URL), puis deployez le backend. Voir README.md pour les etapes.
    </div>
  );
}