import { useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import ProfileModal from './ProfileModal';

const STEPS = [
  { title: 'Bienvenue', text: "Cette application enregistre vos pointages au bureau grace au code QR a l'entree. Aucun telechargement necessaire - ouvrez-la depuis votre navigateur ou installez-la.", btn: 'Suivant' },
  { title: 'Vos coordonnees', text: 'Commencez par definir votre nom et email. Vous ne le faites qu\'une seule fois - les donnees sont stockees sur cet appareil.', btn: 'Ouvrir le profil' },
  { title: 'Scanner pour pointer', text: "Pointez votre camera vers le code QR a l'entree du bureau. C'est tout - vous etes pointe !", btn: 'Commencer' },
];

export default function OnboardingModal({ isOpen, onClose }) {
  const { setOnboarded } = useApp();
  const [step, setStep] = useState(0);
  const [showProfile, setShowProfile] = useState(false);

  if (!isOpen) return null;
  const s = STEPS[step];

  const handleNext = () => {
    if (s.btn === 'Ouvrir le profil') {
      setShowProfile(true);
      return;
    }
    if (step + 1 >= STEPS.length) {
      setOnboarded();
      onClose();
      return;
    }
    setStep(step + 1);
  };

  const handleDismiss = () => { setOnboarded(); onClose(); };

  return (
    <>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Bienvenue">
        <div className="modal-card card">
          <div className="modal-head">
            <span className="brand-mark sm" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>
            </span>
            <div><h3>{s.title}</h3><p className="muted">{s.text}</p></div>
          </div>
          <div className="ob-steps" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span key={i} className={'ob-dot' + (i === step ? ' on' : '')}></span>
            ))}
          </div>
          <button className="primary-btn" type="button" onClick={handleNext}>{s.btn}</button>
          <button className="ghost-btn" type="button" onClick={handleDismiss}>Passer</button>
        </div>
      </div>
      <ProfileModal isOpen={showProfile} onClose={() => { setShowProfile(false); handleDismiss(); }} />
    </>
  );
}
