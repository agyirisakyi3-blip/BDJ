import { useState } from 'react';
import { useApp } from '../contexts/AppContext';

export default function EmployeeLogin() {
  const { apiCall, login, showFeedback } = useApp();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(Array(6).fill(''));
  const [showOtp, setShowOtp] = useState(false);
  const [otpNote, setOtpNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRequestCode = async () => {
    if (!email.trim()) { setError('Saisissez votre email professionnel.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await apiCall({ action: 'user_login', email: email.trim() });
      if (!res.ok) throw new Error(res.message || 'Echec');
      setShowOtp(true);
      setOtpNote(res.otpDev ? res.message + ' Code de test : ' + res.otpDev : (res.message || 'Un code vous a ete envoye.'));
    } catch (err) {
      setError(err.message || 'Impossible de joindre le serveur.');
    }
    setLoading(false);
  };

  const handleVerify = async (code) => {
    const otpValue = code || otp.join('');
    if (!otpValue || otpValue.length < 6) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiCall({ action: 'user_login', email: email.trim(), otp: otpValue });
      if (!res.ok) throw new Error(res.message || 'Code invalide.');
      if (res.user) {
        await login(res.user, res.sessionToken);
        showFeedback('success', 'Bienvenue, ' + (res.user.name || '') + '.');
      }
    } catch (err) {
      setError(err.message || 'Code invalide ou expire.');
    }
    setLoading(false);
  };

  const handleOtpInput = (idx, val) => {
    const digits = val.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[idx] = digits;
    setOtp(next);
    if (digits && idx < 5) {
      const inputs = document.querySelectorAll('.emp-otp-box');
      if (inputs[idx + 1]) inputs[idx + 1].focus();
    }
    if (next.every((d) => d) && next.join('').length === 6) {
      setTimeout(() => handleVerify(next.join('')), 100);
    }
  };

  const handleResend = () => {
    setOtp(Array(6).fill(''));
    handleRequestCode();
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

        {!showOtp ? (
          <div className="emp-login-form">
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
                onKeyDown={(e) => e.key === 'Enter' && handleRequestCode()}
              />
            </div>
            <p className="emp-hint">Un code de vérification vous sera envoyé par email.</p>
            {error && <p className="feedback error">{error}</p>}
            <button className="emp-cta" type="button" onClick={handleRequestCode} disabled={loading}>
              <span>{loading ? 'Envoi du code...' : 'Recevoir mon code'}</span>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
          </div>
        ) : (
          <div className="emp-login-form">
            <button className="emp-email-chip" type="button" onClick={() => setShowOtp(false)} title="Changer d'email">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              {email}
            </button>
            <label>Code de vérification</label>
            <div className="otp-seg emp-otp-seg" role="group" aria-label="Code a 6 chiffres">
              {otp.map((v, i) => (
                <input key={i} className="otp-box emp-otp-box" type="text" inputMode="numeric" maxLength={1}
                  value={v} onChange={(e) => handleOtpInput(i, e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Backspace' && !v && i > 0) { document.querySelectorAll('.emp-otp-box')[i-1]?.focus(); } }} />
              ))}
            </div>
            {otpNote && <p className="emp-hint">{otpNote}</p>}
            {error && <p className="feedback error">{error}</p>}
            <button className="emp-cta" type="button" onClick={() => handleVerify()} disabled={loading}>
              <span>{loading ? 'Vérification...' : 'Se connecter'}</span>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
            <button className="emp-ghost" type="button" onClick={handleResend} disabled={loading}>
              Renvoyer le code
            </button>
          </div>
        )}

        <p className="emp-foot">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Vos accès sont protégés par un code envoyé par email.
        </p>
      </div>
    </div>
  );
}