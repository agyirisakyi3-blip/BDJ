import { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../contexts/AppContext';
import { fmtHours, todayStr } from '../../utils';

const HEAT_MONTHS = ['Janvier','Fevrier','Mars','Avril','Mai','Juin','Juillet','Aout','Septembre','Octobre','Novembre','Decembre'];

function Heatmap({ pairs, rangeFrom }) {
  const cells = useMemo(() => {
    const present = {};
    const hoursMap = {};
    (pairs || []).forEach((p) => {
      if (!p.date) return;
      present[p.date] = true;
      if (p.hours != null && !isNaN(p.hours)) hoursMap[p.date] = Math.max(hoursMap[p.date] || 0, p.hours);
    });
    const base = String(rangeFrom || todayStr()).split('-');
    const y = Number(base[0]);
    const m = Number(base[1]);
    if (!y || !m || m < 1 || m > 12) return { cells: [], label: '' };
    const first = new Date(y, m - 1, 1);
    const daysInMonth = new Date(y, m, 0).getDate();
    const lead = (first.getDay() + 6) % 7;
    const today = todayStr();
    const result = [];
    for (let i = 0; i < lead; i++) result.push({ cls: 'hm-cell blank' });
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      if (ds > today) {
        result.push({ cls: 'hm-cell future', title: ds });
      } else {
        let lvl = 0;
        if (present[ds]) {
          const h = hoursMap[ds];
          lvl = h == null ? 1 : h < 2 ? 1 : h < 4 ? 2 : h < 6 ? 3 : 4;
        }
        result.push({ cls: 'hm-cell lvl-' + lvl, title: ds + ' \u00b7 ' + (present[ds] ? fmtHours(hoursMap[ds]) : 'Pas de pointage') });
      }
    }
    return { cells: result, label: HEAT_MONTHS[m - 1] + ' ' + y };
  }, [pairs, rangeFrom]);

  return (
    <div className="heatmap-block">
      <div className="block-head"><h4 className="heat-month-label">{cells.label}</h4></div>
      <div className="heatmap-weekdays" aria-hidden="true">
        <span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span>
      </div>
      <div className="heatmap-grid" role="img" aria-label="Calendrier de presence du mois">
        {cells.cells.map((c, i) => <span key={i} className={c.cls} title={c.title}></span>)}
      </div>
      <div className="heatmap-legend" aria-hidden="true">
        <span>Moins</span>
        <span className="hm-cell lvl-0"></span>
        <span className="hm-cell lvl-1"></span>
        <span className="hm-cell lvl-2"></span>
        <span className="hm-cell lvl-3"></span>
        <span className="hm-cell lvl-4"></span>
        <span>Plus</span>
      </div>
    </div>
  );
}

export default function HistoryModal({ isOpen, onClose }) {
  const { profile, apiCall, showFeedback } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !profile) return;
    setLoading(true);
    apiCall({ action: 'myattendance', email: profile.email }).then((res) => {
      setLoading(false);
      if (res.ok) setData(res.attendance);
      else showFeedback('error', res.message || 'Impossible de charger');
    }).catch((err) => { setLoading(false); showFeedback('error', err.message); });
  }, [isOpen, profile]);

  const handleExport = async () => {
    if (!profile) return;
    try {
      const res = await apiCall({ action: 'myexport', email: profile.email });
      if (!res.ok) throw new Error(res.message);
      const csv = '\uFEFF' + ['Date,Heure,Nom,Action,Statut,Distance(m),Bureau'].concat((res.rows || []).map((r) => {
        return [r.date, r.time, r.name, r.action, r.status, r.distance, r.office].map((c) =>
          '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'
        ).join(',');
      })).join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'ma-presence-' + profile.email + '.csv';
      document.body.appendChild(a); a.click(); a.remove();
      showFeedback('success', (res.rows || []).length + ' enregistrement(s) exporte(s).');
    } catch (err) { showFeedback('error', err.message); }
  };

  const handleDelete = async () => {
    if (!profile) return;
    if (!window.confirm('Effacer TOUS vos enregistrements de presence ?')) return;
    try {
      const res = await apiCall({ action: 'mydelete', email: profile.email });
      if (!res.ok) throw new Error(res.message);
      onClose();
      showFeedback('success', (res.deleted || 0) + ' enregistrement(s) efface(s).');
    } catch (err) { showFeedback('error', err.message); }
  };

  if (!isOpen) return null;

  const h = data;
  const pairs = h ? (h.pairs || []).slice().sort((x, y) => (y.date + y.in).localeCompare(x.date + x.in)) : [];

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Mon historique de presence">
      <div className="modal-card card">
        <div className="modal-head">
          <span className="brand-mark sm" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </span>
          <div>
            <h3>Votre presence</h3>
            <p className="muted">{h ? h.range.from + ' \u2192 ' + h.range.to : ''}</p>
          </div>
        </div>
        {h && <Heatmap pairs={h.pairs} rangeFrom={h.range.from} />}
        {h && (
          <div className="report-summary stat-row">
            <div className="stat stat-in"><b>{h.summary.daysPresent}</b><span>Jours presents</span></div>
            <div className="stat stat-on"><b>{fmtHours(h.summary.totalHours)}</b><span>Total heures</span></div>
            <div className="stat stat-out"><b>{h.summary.lateCount}</b><span>Retards</span></div>
          </div>
        )}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Entree</th><th>Sortie</th><th>Heures</th><th>Statut</th></tr></thead>
            <tbody>
              {pairs.length === 0 ? (
                <tr><td className="empty" colSpan="5">Aucune presence ce mois-ci.</td></tr>
              ) : pairs.map((p, i) => (
                <tr key={i} className={p.missing ? 'row-missing' : p.late ? 'row-late' : ''}>
                  <td>{p.date}</td>
                  <td>{p.in || '\u2014'}</td>
                  <td>{p.out || '\u2014'}</td>
                  <td>{fmtHours(p.hours)}</td>
                  <td>
                    <span className={'tag ' + (p.missing ? 'neutral' : p.late ? 'out' : 'in')}>
                      {p.missing ? 'Pas de sortie' : p.late ? 'Retard' : 'OK'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="btn-row">
          <button className="ghost-btn" onClick={handleExport}>Telecharger mes donnees (CSV)</button>
          <button className="ghost-btn" onClick={handleDelete}>Effacer mes donnees</button>
          <button className="ghost-btn" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
