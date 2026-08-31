import { useApp } from '../../contexts/AppContext';
import { todayStr, fmtHours } from '../../utils';

export default function BreakControls({ onFeedback }) {
  const { profile, status, setStatus, apiCall, tenantFromProfile } = useApp();
  if (!profile) return null;
  const act = status ? String(status.action || '') : '';
  const showBreak = act === 'Check-in' || act === 'Break-in' || act === 'Break-out';
  if (!showBreak) return null;

  const onBreak = act === 'Break-out';
  const mins = status && status.breakMinToday;

  const handleBreak = () => {
    apiCall({
      action: 'attendance',
      tenant: tenantFromProfile(),
      qr: '',
      mode: onBreak ? 'resume' : 'break',
      name: profile.name,
      email: profile.email,
      ts: Date.now(),
    }).then((res) => {
      if (!res.ok) { onFeedback('error', res.message || 'Echec.'); return; }
      setStatus({
        date: res.date || todayStr(),
        action: res.action,
        time: res.time,
        office: res.office,
        tenant: tenantFromProfile(),
        breakMinToday: res.breakMinToday || 0,
      });
      onFeedback('success', onBreak ? 'Reprise !' : 'Pause demarree a ' + res.time + '.');
    }).catch((err) => {
      onFeedback('error', 'Erreur: ' + err.message);
    });
  };

  return (
    <div className="break-row">
      <button className="ghost-btn break-btn" type="button" onClick={handleBreak} title="Marquer une pause">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
        <span id="btn-break-label">{onBreak ? 'Reprendre' : 'Pause'}</span>
      </button>
      <span className="hint">{mins ? 'Pause cumulee aujourd\'hui : ' + fmtHours(mins / 60) : ''}</span>
    </div>
  );
}
