import { useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import { lsSet } from '../../hooks/useEncryptedStorage';
import { avatarHue, avatarInitials } from '../../utils';
import PhotoModal from './PhotoModal';

export default function ProfileModal({ isOpen, onClose }) {
  const { profile, setProfile, showFeedback, refreshAdminAccess, loadRecent, loadWeek, loadMonth, config, setStatus, authenticated, logout } = useApp();
  const [name, setName] = useState(profile?.name || '');
  const [email, setEmail] = useState(profile?.email || '');
  const [tenant, setTenant] = useState(profile?.tenant || config?.DEFAULT_TENANT || '');
  const [photo, setPhoto] = useState(profile?.photo || '');
  const [photoOpen, setPhotoOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [remind, setRemind] = useState(() => {
    try { return localStorage.getItem('att.remind.v1') === '1'; } catch { return false; }
  });
  const [error, setError] = useState('');

  const handleSave = () => {
    if (!name.trim()) { setError('Saisissez votre nom.'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError('Saisissez un email valide.'); return; }
    if (tenant.trim() && !/^[a-z0-9][a-z0-9\-]{1,23}$/.test(tenant.trim())) {
      setError('Code espace : 2-24 caractères, lettres/chiffres/tirets.'); return;
    }
    try { localStorage.setItem('att.remind.v1', remind ? '1' : '0'); } catch {}
    if (remind && 'Notification' in window && Notification.permission === 'default') {
      try { Notification.requestPermission().catch(() => {}); } catch {}
    }
    const prevTenant = profile?.tenant || '';
    const newProfile = { name: name.trim(), email: email.trim(), tenant: tenant.trim(), photo: photo };
    setProfile(newProfile);
    setError('');
    onClose();
    refreshAdminAccess();
    loadRecent();
    loadWeek();
    loadMonth();
  };

  const handleLogout = () => {
    logout();
    onClose();
  };

  if (!isOpen) return null;

  const hue = avatarHue(name || email || '?');
  const locked = !!authenticated;

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Vos coordonnees">
      <div className="modal-card card">
        <div className="modal-head">
          <span className="brand-mark sm" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </span>
          <div>
            <h3>Vos coordonnées</h3>
            <p className="muted">Utilisé uniquement pour les enregistrements de présence sur cet appareil.</p>
          </div>
        </div>
        <div className="profile-photo">
          {photo && photo.indexOf('data:') === 0 ? (
            <img className="profile-photo-avatar photo" src={photo} alt="Photo de profil" />
          ) : (
            <span className="profile-photo-avatar" style={{ background: `linear-gradient(135deg, hsl(${hue}, 60%, 55%), hsl(${(hue + 40) % 360}, 60%, 38%))` }}>{avatarInitials(name, email)}</span>
          )}
          <div className="profile-photo-controls">
            <button className="ghost-btn sm" type="button" onClick={() => setPhotoOpen(true)}>{photo ? 'Changer la photo' : 'Ajouter une photo'}</button>
            {photo && <button className="ghost-btn sm danger-text" type="button" onClick={() => setPhoto('')}>Retirer</button>}
          </div>
        </div>
        <label>Nom {locked && <span className="opt">(verifié)</span>}</label>
        <input type="text" placeholder="Nom complet" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} disabled={locked} />
        <label>Email {locked && <span className="opt">(verifié)</span>}</label>
        <input type="email" placeholder="vous@entreprise.com" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={locked} />
        <label>Code espace <span className="opt">(facultatif)</span></label>
        <input type="text" placeholder="ex. acme" autoComplete="off" value={tenant} onChange={(e) => setTenant(e.target.value)} />
        <p className="hint">Laissez vide pour l'espace par défaut.</p>
        <label className="check-row">
          <input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} />
          <span>M'avertir sur cet appareil si j'oublie de pointer ma sortie</span>
        </label>
        <p className="hint">Votre nom, email et historique de pointage sont enregistrés dans la feuille Google de l'entreprise.</p>
        {error && <p className="feedback error">{error}</p>}
        {confirmLogout ? (
          <div className="confirm-actions profile-logout-actions">
            <button className="ghost-btn" type="button" onClick={() => setConfirmLogout(false)}>Annuler</button>
            <button className="primary-btn danger-btn confirm-submit" type="button" onClick={handleLogout}>Se déconnecter</button>
          </div>
        ) : (
          <button className="primary-btn" type="button" onClick={handleSave}>Enregistrer</button>
        )}
        {!confirmLogout && (
          <button className="ghost-btn danger-text profile-logout-btn" type="button" onClick={() => setConfirmLogout(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{width:15,height:15,marginRight:6}}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Se déconnecter
          </button>
        )}
      </div>
      <PhotoModal isOpen={photoOpen} onClose={() => setPhotoOpen(false)} onCapture={(d) => { if (d !== undefined) setPhoto(d); }} existing={photo} />
    </div>
  );
}
