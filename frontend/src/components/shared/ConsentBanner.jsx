import { useApp } from '../../contexts/AppContext';

export default function ConsentBanner() {
  const { consent, setConsent } = useApp();
  if (consent) return null;
  return (
    <div className="consent-banner">
      <p>Cette application stocke des donnees localement sur cet appareil (profil, preferences, historique de presence). Aucune donnee n'est envoyee a des tiers.</p>
      <div className="consent-actions">
        <button className="primary-btn" onClick={() => setConsent(true)}>Accepter</button>
        <button className="ghost-btn" onClick={() => setConsent(false)}>Refuser</button>
      </div>
    </div>
  );
}
