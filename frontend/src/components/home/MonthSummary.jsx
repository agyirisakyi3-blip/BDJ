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
