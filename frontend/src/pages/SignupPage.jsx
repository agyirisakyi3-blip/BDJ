import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../hooks/useApp';
import { api } from '../api';

const ORG_CODE_REGEX = /^[a-z0-9][a-z0-9-]{1,23}$/;

export default function SignupPage() {
  const { showFeedback } = useApp();
  const [appName, setAppName] = useState('');
  const [code, setCode] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleSignup = async () => {
    const orgCode = code.trim().toLowerCase();
    const name = appName.trim();
    const email = adminEmail.trim().toLowerCase();
    if (!name) { setError('Saisissez le nom de votre organisation.'); return; }
    if (!ORG_CODE_REGEX.test(orgCode)) {
      setError('Le code doit contenir 2-24 caracteres : lettres minuscules, chiffres ou tirets.');
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setError('Saisissez une adresse email admin valide.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await api({ action: 'provision', code: orgCode, appName: name, adminEmail: email });
      if (!res.ok) throw new Error(res.message || 'Creation impossible');
      try { localStorage.setItem('att.orgcode.v1', orgCode); } catch {}
      setResult(res);
      showFeedback('success', 'Organisation creee avec succes.');
    } catch (err) {
      setError(err.message || 'Impossible de creer l\'organisation.');
    }
    setLoading(false);
  };

  if (result) {
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
              <img src="/bdj-logo.jpg" alt="Logo addredance" />
            </span>
            <h3>Organisation creee</h3>
            <p>L'espace de pointage de <strong>{result.tenant.appName}</strong> est pret. Un email avec vos acces administrateur a ete envoye a <strong>{adminEmail}</strong>.</p>
          </div>

          <div className="emp-login-form">
            <label>Code organisation (a partager avec vos employes)</label>
            <div className="emp-signup-result">
              <code>{result.tenant.code}</code>
            </div>
            <p className="emp-hint">Le PIN administrateur a ete envoye par email. Il ne sera jamais affiche ici ni renvoye par l'application.</p>
            <Link className="emp-cta emp-cta-link" to="/" style={{ textDecoration: 'none', textAlign: 'center' }}>
              Aller a la connexion
            </Link>
          </div>

          <p className="emp-foot">
            Prochaine etape : connectez-vous en admin avec votre email (code recu par email), ajoutez des employes puis creez les QR codes du bureau.
          </p>
        </div>
      </div>
    );
  }

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
            <img src="/bdj-logo.jpg" alt="Logo addredance" />
          </span>
          <h3>Creer une organisation</h3>
          <p>Mettez en place un espace de pointage pour votre entreprise en moins d'une minute.</p>
        </div>

        <div className="emp-login-form">
          <label>Nom de l'organisation</label>
          <div className="emp-input-wrap">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 9h1"/><path d="M9 13h1"/><path d="M9 17h1"/><path d="M14 9h1"/><path d="M14 13h1"/><path d="M14 17h1"/></svg>
            <input
              type="text"
              placeholder="Ex : AGY Tech SAS"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSignup()}
            />
          </div>

          <label>Code organisation</label>
          <div className="emp-input-wrap">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><circle cx="12" cy="12" r="4"/></svg>
            <input
              type="text"
              placeholder="code-entreprise"
              value={code}
              onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24))}
              onKeyDown={(e) => e.key === 'Enter' && handleSignup()}
            />
          </div>
          <p className="emp-hint">Identifiant court unique (2-24 caracteres) : lettres minuscules, chiffres ou tirets.</p>

          <label>Email admin</label>
          <div className="emp-input-wrap">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="vous@entreprise.com"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSignup()}
            />
          </div>
          <p className="emp-hint">Cet email recevra un code a usage unique pour acceder au tableau de bord admin.</p>

          {error && <p className="feedback error" style={{ marginTop: 10 }}>{error}</p>}

          <button className="emp-cta" type="button" onClick={handleSignup} disabled={loading} style={{ marginTop: 14 }}>
            <span>{loading ? 'Creation...' : 'Creer mon organisation'}</span>
          </button>

          <Link className="emp-resend-link" to="/" style={{ marginTop: 12 }}>
            Deja inscrit ? Aller a la connexion
          </Link>
        </div>

        <p className="emp-foot">
          Vous administrerez le pointage, les QR codes et les rapports de votre entreprise.
        </p>
      </div>
    </div>
  );
}