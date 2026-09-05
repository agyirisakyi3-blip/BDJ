import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import CONFIG from '../config';

export default function EmployeeLogin() {
  const { apiCall, login, showFeedback } = useApp();
  const [tenant, setTenant] = useState(() => {
    if (CONFIG.DEFAULT_TENANT) return CONFIG.DEFAULT_TENANT;
    try { return window.localStorage.getItem('att.orgcode.v1') || ''; } catch { return ''; }
  });
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');

  const handleResend = async () => {
    if (!email.trim()) { setError('Saisissez votre email professionnel pour recevoir votre code.'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError('Adresse email invalide.'); return; }
    setResending(true);
    setError('');
    try {
      const res = await apiCall({ action: 'employee_code_resend', email: email.trim() }, tenant);
      if (!res.ok) throw new Error(res.message || 'Echec');
      showFeedback('success', res.message || 'Votre code a ete envoye par email.');
    } catch (err) {
      setError(err.message || 'Impossible d\'envoyer le code.');
    }
    setResending(false);
  };

  const handleSignIn = async () => {
    if (!email.trim()) { setError('Saisissez votre email professionnel.'); return; }
    if (!code.trim()) { setError('Saisissez votre code personnel (6 chiffres).'); return; }
    if (!/^\d{6}$/.test(code.trim())) { setError('Le code comporte 6 chiffres.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await apiCall({ action: 'user_login', tenant: tenant.trim().toLowerCase(), email: email.trim(), code: code.trim() }, tenant);
      if (!res.ok) throw new Error(res.message || 'Echec');
      if (res.user) {
        await login(res.user, res.sessionToken);
        showFeedback('success', 'Bienvenue, ' + (res.user.name || '') + '.');
      }
    } catch (err) {
      setError(err.message || 'Impossible de se connecter.');
    }
    setLoading(false);
  };

  return (
    <div className="emp-login-wrap">
      <div className="emp-login-bg" aria-hidden="true">
        <span className="emp-orb emp-orb-1"></span>
        <span className="emp-orb emp-orb-2"></span>
        <span className="emp-orb emp-orb-3"></span>
        <span className="emp-grid"></span>
        <span className="grain"></span>
      </div>

      <div className="emp-login-card">
        <div className="emp-login-brand">
          <span className="emp-login-logo">
            <img src="/bdj-logo.jpg" alt="Logo BDJ" />
          </span>
          <h3>addredance</h3>
          <p>Connectez-vous pour pointer votre présence en toute sécurité.</p>
        </div>

        <div className="emp-login-form">
          <label>Organisation</label>
          <div className="emp-input-wrap">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 9h1"/><path d="M9 13h1"/><path d="M9 17h1"/><path d="M14 9h1"/><path d="M14 13h1"/><path d="M14 17h1"/></svg>
            <input
              type="text"
              inputMode="text"
              autoComplete="organization"
              placeholder="code-entreprise"
              value={tenant}
              onChange={(e) => setTenant(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
              disabled={!!CONFIG.DEFAULT_TENANT}
            />
          </div>

          <label>Email professionnel</label>
          <div className="emp-input-wrap">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="vous@entreprise.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
            />
          </div>

          <label>Code personnel</label>
          <div className="emp-input-wrap">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              placeholder="6 chiffres"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
            />
          </div>
          <p className="emp-hint">Code de 6 chiffres remis par votre administrateur.</p>
          <button className="emp-resend-link" type="button" onClick={handleResend} disabled={resending}>
            {resending ? 'Envoi en cours...' : 'Je n\'ai pas recu mon code, envoyez-le-moi'}
          </button>
          {error && <p className="feedback error">{error}</p>}
          <button className="emp-cta" type="button" onClick={handleSignIn} disabled={loading}>
            <span>{loading ? 'Connexion...' : 'Se connecter'}</span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
        </div>

        <p className="emp-foot">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Vos accès sont protégés par un code personnel.
        </p>

        <Link className="emp-signup-cta" to="/signup">
          Creer une organisation pour mon entreprise
        </Link>
      </div>
    </div>
  );
}