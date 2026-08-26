import { useApp } from '../../contexts/AppContext';
import { fmtHours, dayLabel, todayStr } from '../../utils';

export default function WeekChart() {
  const { profile, week, weekLoading } = useApp();
  if (!profile) return null;

  if (weekLoading) {
    return (
      <section className="card block" id="week-card">
        <div className="block-head"><h3>7 derniers jours</h3></div>
        <div className="week-chart">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="week-col"><span className="sk sk-bar"></span></div>
          ))}
        </div>
      </section>
    );
  }

  const hasData = week.some((d) => d.hours > 0);
  const max = Math.max(...week.map((d) => d.hours || 0), 0);
  const today = todayStr();

  return (
    <section className="card block" id="week-card">
      <div className="block-head"><h3>7 derniers jours</h3></div>
      <div className="week-chart" role="img" aria-label="Heures par jour sur les 7 derniers jours">
        {week.map((d, i) => (
          <div key={i} className="week-col">
            <span className="week-val">{d.hours > 0 ? fmtHours(d.hours) : ''}</span>
            <div className="week-bar-wrap">
              <div
                className={'week-bar' + (d.hours > 0 ? '' : ' zero')}
                title={d.date + ': ' + (d.hours > 0 ? fmtHours(d.hours) : 'pas de pointage')}
                style={d.hours > 0 ? { height: Math.max(8, Math.round((d.hours / max) * 100)) + '%' } : {}}
              />
            </div>
            <span className="week-label">{d.date === today ? "Aujourd'hui" : dayLabel(d.date)}</span>
          </div>
        ))}
      </div>
      {!hasData && <p className="hint">Aucun pointage sur les 7 derniers jours.</p>}
    </section>
  );
}
