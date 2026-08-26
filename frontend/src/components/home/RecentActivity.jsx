import { useApp } from '../../contexts/AppContext';

export default function RecentActivity() {
  const { profile, recent, recentLoading } = useApp();
  if (!profile) return null;

  return (
    <section className="card block" id="recent-card">
      <div className="block-head">
        <h3>Activite recente</h3>
      </div>
      <ul className="recent-list">
        {recentLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="sk-row">
              <span className="sk sk-dot"></span>
              <div className="sk-wrap">
                <span className="sk sk-line"></span>
                <span className="sk sk-line short"></span>
              </div>
            </div>
          ))
        ) : recent.length > 0 ? (
          recent.map((r, i) => (
            <li key={i}>
              <span className={'recent-dot ' + (r.action === 'Check-in' ? 'in' : 'out')}></span>
              <span className="recent-main">
                <span className="recent-top">{r.date}</span>
                <span className="recent-meta">{(r.office || 'Bureau') + ' \u00b7 ' + r.time}</span>
              </span>
              <span className={'tag ' + (r.action === 'Check-in' ? 'in' : 'out')}>
                {r.action === 'Check-in' ? 'ENTREE' : 'SORTIE'}
              </span>
            </li>
          ))
        ) : null}
      </ul>
      {!recentLoading && recent.length === 0 && (
        <p className="hint">Aucun pointage pour l'instant.</p>
      )}
    </section>
  );
}
