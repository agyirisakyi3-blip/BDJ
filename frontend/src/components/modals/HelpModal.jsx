export default function HelpModal({ isOpen, onClose }) {
  if (!isOpen) return null;
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Aide">
      <div className="modal-card card">
        <div className="modal-head">
          <span className="brand-mark sm" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </span>
          <div><h3>Aide</h3><p className="muted">Comment utiliser l'application de presence.</p></div>
        </div>
        <div className="help-section"><h4>1. Definir vos coordonnees</h4><p>Avant de scanner, ouvrez votre profil et saisissez votre nom et email. Vous ne le faites qu'une seule fois.</p></div>
        <div className="help-section"><h4>2. Scanner le code QR</h4><p>Appuyez sur le bouton <b>Scanner</b>, pointez votre camera vers le code QR a l'entree du bureau.</p></div>
        <div className="help-section"><h4>3. Pointage automatique</h4><ul><li><b>Premier scan</b> = Entree (check-in)</li><li><b>Deuxieme scan</b> = Sortie (check-out)</li><li>La duree de votre presence s'affiche en temps reel.</li></ul></div>
        <div className="help-section"><h4>4. Voir votre historique</h4><p>Appuyez sur <b>Mon historique</b> pour consulter vos pointages precedents.</p></div>
        <div className="help-section"><h4>5. Mode hors ligne</h4><p>Si vous n'avez pas de connexion, le pointage est enregistre localement et synchronise automatiquement.</p></div>
        <div className="help-section"><h4>Questions frequentes</h4>
          <p><b>Q : Le scanner ne s'ouvre pas ?</b><br/>A : Autorisez l'acces a la camera dans les parametres de votre navigateur.</p>
          <p><b>Q : J'ai oublie de scanner en sortant ?</b><br/>A : Demandez a votre admin de corriger votre pointage manuellement.</p>
          <p><b>Q : Mes donnees sont-elles privees ?</b><br/>A : Vos donnees restent sur cet appareil et dans la feuille de calcul du bureau.</p>
        </div>
        <button className="primary-btn" type="button" onClick={onClose} style={{ width: '100%', marginTop: 6 }}>Fermer</button>
      </div>
    </div>
  );
}
