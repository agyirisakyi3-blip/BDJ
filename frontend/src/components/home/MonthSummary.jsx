import { memo } from 'react';
import { useApp } from '../../contexts/AppContext';
import { fmtHours } from '../../utils';

export default memo(function MonthSummary() {
  const { profile, monthSummary } = useApp();
  if (!profile || !monthSummary) return null;

  const s = monthSummary;
  const note = s.days >= 15
    ? 'Excellent rythme ce mois-ci \u2014 continuez comme ca !'
    : 'Vos jours et heures de presence cumules depuis le 1er du mois.';

  if (s.days === 0) {
    return (
      <section className="card block" id="month-card">
        <div className="block-head collapsible"><h3>Ce mois-ci</h3></div>
        <div className="month-empty">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <p>Pas encore de pointage ce mois-ci. Scannez le QR a l'entree pour commencer !</p>
        </div>
      </section>
    );
  }

  return (
    <section className="card block" id="month-card">
      <div className="block-head collapsible"><h3>Ce mois-ci</h3></div>
      <div className="report-summary stat-row">
        <div className="stat stat-in"><b>{s.days}</b><span>Jours</span></div>
        <div className="stat stat-on"><b>{fmtHours(s.hours)}</b><span>Heures</span></div>
        <div className="stat stat-out"><b>{s.breakMin ? fmtHours(s.breakMin / 60) : '0h 0m'}</b><span>Pause</span></div>
        <div className="stat stat-in"><b>{s.late}</b><span>Retards</span></div>
      </div>
      <p className="hint">{note}</p>
    </section>
  );
});
