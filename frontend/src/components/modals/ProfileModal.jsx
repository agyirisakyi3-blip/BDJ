import { useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import { lsSet } from '../../hooks/useEncryptedStorage';

export default function ProfileModal({ isOpen, onClose }) {
  const { profile, setProfile, showFeedback, refreshAdminAccess, loadRecent, loadWeek, loadMonth, config, setStatus } = useApp();
  const [name, setName] = useState(profile?.name || '');
  const [email, setEmail] = useState(profile?.email || '');
  const [tenant, setTenant] = useState(profile?.tenant || config?.DEFAULT_TENANT || '');
  const [remind, setRemind] = useState(() => {
    try { return localStorage.getItem('att.remind.v1') === '1'; } catch { return false; }
  });
  const [error, setError] = useState('');

  const handleSave = () => {
    if (!name.trim()) { setError('Saisissez votre nom.'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError('Saisissez un email valide.'); return; }
    if (tenant.trim() && !/^[a-z0-9][a-z0-9\-]{1,23}$/.test(tenant.trim())) {
      setError('Code espace : 2-24 caracteres, lettres/chiffres/tirets.'); return;
    }
    try { localStorage.setItem('att.remind.v1', remind ? '1' : '0'); } catch {}
    if (remind && 'Notification' in window && Notification.permission === 'default') {
      try { Notification.requestPermission().catch(() => {}); } catch {}
    }
    const prevTenant = profile?.tenant || '';
    const newProfile = { name: name.trim(), email: email.trim(), tenant: tenant.trim() };
    setProfile(newProfile);
    setError('');
    onClose();
    refreshAdminAccess();
    loadRecent();
    loadWeek();
    loadMonth();
  };

  if (!isOpen) return null;

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Vos coordonnees">
      <div className="modal-card card">
        <div className="modal-head">
          <span className="brand-mark sm" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </span>
          <div>
            <h3>Vos coordonnees</h3>
            <p className="muted">Utilise uniquement pour les enregistrements de presence sur cet appareil.</p>
          </div>
        </div>
        <label>Nom</label>
        <input type="text" placeholder="Nom complet" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        <label>Email</label>
        <input type="email" placeholder="vous@entreprise.com" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label>Code espace <span className="opt">(facultatif)</span></label>
        <input type="text" placeholder="ex. acme" autoComplete="off" value={tenant} onChange={(e) => setTenant(e.target.value)} />
        <p className="hint">Laissez vide pour l'espace par defaut.</p>
        <label className="check-row">
          <input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} />
          <span>M'avertir sur cet appareil si j'oublie de pointer ma sortie</span>
        </label>
        <p className="hint">Votre nom, email et historique de pointage sont enregistres dans la feuille Google de l'entreprise.</p>
        {error && <p className="feedback error">{error}</p>}
        <button className="primary-btn" type="button" onClick={handleSave}>Enregistrer</button>
      </div>
    </div>
  );
}
