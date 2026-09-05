import { useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import CONFIG from '../../config';

export default function AdminLogin({ onLogin }) {
  const { showFeedback, apiCall } = useApp();
  const [tenant, setTenant] = useState(() => {
    if (CONFIG.DEFAULT_TENANT) return CONFIG.DEFAULT_TENANT;
    try { return window.localStorage.getItem('att.orgcode.v1') || ''; } catch { return ''; }
  });
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [pinType, setPinType] = useState('password');
  const [otp, setOtp] = useState(Array(6).fill(''));
  const [showOtp, setShowOtp] = useState(false);
  const [otpNote, setOtpNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (submittedOtp) => {
    if (!tenant.trim()) { setError('Saisissez votre code organisation.'); return; }
    if (!email.trim()) { setError('Saisissez votre email.'); return; }
    setLoading(true);
    setError('');
    try {
      const otpValue = typeof submittedOtp === 'string' && submittedOtp ? submittedOtp : otp.join('');
      const body = { action: 'admin_login', tenant: tenant.trim().toLowerCase(), email: email.trim(), pin: pin.trim(), otp: otpValue };
      const res = await apiCall(body, tenant);
      if (res && res.needOtp) {
        setShowOtp(true);
        setOtpNote(res.otpDev ? res.message + ' Code de developpement : ' + res.otpDev : (res.message || ''));
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error(res.message || 'Echec');
      // Now fetch admin data
      const tkn = res.token || res.sessionToken || '';
      const adminBody = { action: 'admin', tenant: tenant.trim().toLowerCase(), from: new Date().toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10), token: tkn };
      const adminRes = await apiCall(adminBody, tenant);
      if (!adminRes.ok) throw new Error(adminRes.message || 'Echec chargement');
      onLogin({ token: tkn, email: email.trim(), data: adminRes });
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleOtpInput = (idx, val) => {
    const digits = val.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[idx] = digits;
    setOtp(next);
    if (digits && idx < 5) {
      const inputs = document.querySelectorAll('.otp-box');
      if (inputs[idx + 1]) inputs[idx + 1].focus();
    }
    if (next.every((d) => d) && next.join('').length === 6) {
      setTimeout(() => handleLogin(next.join('')), 100);
    }
  };

  return (
    <div className="login-split card" id="admin-login">
      <div className="login-panel" aria-hidden="true">
        <div className="login-panel-inner">
          <span className="login-panel-mark">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </span>
          <h3>Espace administrateur</h3>
          <p>Resume du jour, effectif en direct et gestion du pointage, tout au meme endroit.</p>
          <ul className="login-panel-points">
            <li>Etat de presence en temps reel</li>
            <li>Rapports et corrections de pointage</li>
            <li>Gestion des employes, conges et jours feries</li>
          </ul>
        </div>
      </div>
      <div className="login-form">
        <div className="login-head">
          <div><h3>Acces admin</h3><p className="muted">Connectez-vous avec votre email admin et votre code PIN.</p></div>
        </div>
        <label>Organisation</label>
        <input type="text" autoComplete="organization" placeholder="code-entreprise" value={tenant}
          onChange={(e) => setTenant(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          disabled={!!CONFIG.DEFAULT_TENANT} />
        <label>Email</label>
        <input type="email" inputMode="email" autoComplete="email" placeholder="vous@entreprise.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label>PIN</label>
        <div className="pin-wrap">
          <input type={pinType} autoComplete="off" placeholder="Saisissez le code PIN" value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
          <button className={'pin-toggle' + (pinType === 'text' ? ' on' : '')} type="button" onClick={() => setPinType(pinType === 'password' ? 'text' : 'password')}>
            <svg className="i-eye" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            <svg className="i-eye-off" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          </button>
        </div>
        {showOtp && (
          <div>
            <label>Code a usage unique</label>
            <div className="otp-seg" role="group" aria-label="Code a 6 chiffres">
              {otp.map((v, i) => (
                <input key={i} className="otp-box" type="text" inputMode="numeric" maxLength={1}
                  value={v} onChange={(e) => handleOtpInput(i, e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Backspace' && !v && i > 0) { document.querySelectorAll('.otp-box')[i-1]?.focus(); } }} />
              ))}
            </div>
            {otpNote && <p className="hint">{otpNote}</p>}
          </div>
        )}
        <button className="primary-btn" type="button" onClick={() => handleLogin()} disabled={loading}>
          {loading ? 'Chargement...' : showOtp ? 'Verifier le code' : 'Acceder au tableau de bord'}
        </button>
        {error && <p className="feedback error">{error}</p>}
      </div>
    </div>
  );
}
