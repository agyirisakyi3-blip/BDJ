import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { fmtHours, todayStr, shiftDateStr, avatarHue, avatarInitials } from '../utils';
import AdminLogin from '../components/admin/AdminLogin';

const PEOPLE_STATUS = {
  onsite: { label: 'Sur place', cls: 'in' },
  break: { label: 'En pause', cls: 'pause' },
  leave: { label: 'En conge', cls: 'leave' },
  out: { label: 'Sorti', cls: 'out' },
  absent: { label: 'Absent', cls: 'neutral' },
};

export default function EmployeeDetailPage() {
  const { email: routeEmail } = useParams();
  const email = decodeURIComponent(routeEmail || '').toLowerCase();
  const navigate = useNavigate();

  useEffect(() => {
    document.body.classList.add('admin-view');
    return () => document.body.classList.remove('admin-view');
  }, []);

  const { apiCall, showFeedback } = useApp();
  const [adminToken, setAdminToken] = useAdminToken();
  const [dateFrom, setDateFrom] = useState(shiftDateStr(-29));
  const [dateTo, setDateTo] = useState(todayStr());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (from, to, tkn) => {
    if (!tkn) return;
    setLoading(true);
    try {
      const res = await apiCall({ action: 'admin', from, to, token: tkn });
      if (!res.ok) throw new Error(res.message || 'Echec');
      setData(res.admin);
    } catch (err) {
      showFeedback('error', err.message);
      if (String(err.message || '').includes('Admin login required')) setAdminToken('');
    }
    setLoading(false);
  }, [apiCall, setAdminToken, showFeedback]);

  const handleLogin = (res) => {
    const tkn = res.token;
    setAdminToken(tkn);
    load(dateFrom, dateTo, tkn);
  };

  const handleRange = (from, to) => {
    setDateFrom(from); setDateTo(to);
    load(from, to, adminToken);
  };

  const a = data || {};
  const allPeople = a.people || [];
  const person = allPeople.find((p) => p.email === email);
  const pairs = (a.pairs || [])
    .filter((p) => p.email === email)
    .slice()
    .sort((x, y) => (y.date || '').localeCompare(x.date || ''));

  const inTimes = {}, outTimes = {};
  let missing = 0;
  pairs.forEach((pp) => {
    if (pp.missing) missing++;
    inTimes[pp.in] = (inTimes[pp.in] || 0) + 1;
    if (pp.out) outTimes[pp.out] = (outTimes[pp.out] || 0) + 1;
  });
  const commonIn = Object.keys(inTimes).sort((a1, b1) => (inTimes[b1] - inTimes[a1]) || (a1 || '').localeCompare(b1 || ''))[0] || '\u2014';
  const commonOut = Object.keys(outTimes).sort((a1, b1) => (outTimes[b1] - outTimes[a1]) || (a1 || '').localeCompare(b1 || ''))[0] || '\u2014';

  if (!adminToken) {
    return (
      <div>
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark brand-logo" aria-hidden="true"><img src="/icons/icon-192.png" alt="Logo addredance" /></span>
            <div className="brand-text"><h1>Detail employe</h1><p className="muted">Acces admin requis</p></div>
          </div>
          <button className="icon-btn" type="button" onClick={() => navigate('/admin')}>Retour</button>
        </header>
        <AdminLogin onLogin={handleLogin} />
      </div>
    );
  }

  const st = person ? PEOPLE_STATUS[person.statusToday] : null;
  const hue = avatarHue(email);

  return (
    <div>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark brand-logo" aria-hidden="true"><img src="/icons/icon-192.png" alt="Logo addredance" /></span>
          <div className="brand-text"><h1>{person ? person.name || email : email}</h1><p className="muted">{person && person.department ? person.department + ' \u00b7 ' : ''}{dateFrom} \u2192 {dateTo}</p></div>
        </div>
        <button className="icon-btn" type="button" onClick={() => navigate('/admin')}>Retour</button>
      </header>

      <div className="card block dash-toolbar">
        <div className="block-body">
          <div className="dash-toolbar-head">
            <span className="avatar" style={{ background: `linear-gradient(135deg, hsl(${hue}, 70%, 84%), hsl(${(hue + 40) % 360}, 62%, 68%))`, color: `hsl(${hue}, 58%, 28%)`, width: '42px', height: '42px', fontSize: '16px' }}>{avatarInitials(person && person.name, email)}</span>
            <div>
              <h3>{person ? person.name || email : email}</h3>
              <p className="hint">{email}{st ? ' \u00b7 ' + st.label : ''}</p>
            </div>
          </div>
          <div className="quick-ranges">
            {[['30d', '30 jours'], ['month', 'Ce mois'], ['today', "Aujourd'hui"]].map(([r, label]) => (
              <button key={r} className="qr-chip" onClick={() => {
                const t = todayStr();
                if (r === '30d') handleRange(shiftDateStr(-29), t);
                else if (r === 'month') { const n = new Date(); handleRange(n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-01', t); }
                else handleRange(t, t);
              }}>{label}</button>
            ))}
          </div>
          <div className="range-row">
            <label className="range-field"><span>Du</span><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
            <label className="range-field"><span>Au</span><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
            <button className="primary-btn range-btn" onClick={() => handleRange(dateFrom, dateTo)}>{loading ? 'Chargement...' : 'Charger'}</button>
          </div>
        </div>
      </div>

      <div className="report-summary stat-row">
        <div className="stat stat-in"><b>{person ? person.daysPresent || 0 : 0}</b><span>Jours presents</span></div>
        <div className="stat stat-on"><b>{person ? fmtHours(person.totalHours) : fmtHours(0)}</b><span>Total heures</span></div>
        <div className="stat stat-out"><b>{person ? person.lateCount || 0 : 0}</b><span>Retards</span></div>
        <div className="stat stat-in"><b>{commonIn}</b><span>Entree typique</span></div>
        <div className="stat stat-on"><b>{commonOut}</b><span>Sortie typique</span></div>
      </div>

      <div className="card block">
        <div className="block-head"><h3>Historique de pointage</h3><span className="pill">{pairs.length + ' entree' + (pairs.length > 1 ? 's' : '')}</span></div>
        <div className="block-body">
          {pairs.length === 0 ? (
            <p className="empty">Aucune presence sur cette periode.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Entree</th><th>Sortie</th><th>Heures</th><th>Pause</th><th>Statut</th></tr></thead>
                <tbody>
                  {pairs.map((pp, i) => (
                    <tr key={i} className={pp.missing ? 'row-missing' : pp.late ? 'row-late' : ''}>
                      <td>{pp.date}</td><td>{pp.in || '\u2014'}</td><td>{pp.out || '\u2014'}</td><td>{fmtHours(pp.hours)}</td>
                      <td>{pp.breakMin ? Math.round((pp.breakMin / 60) * 10) / 10 + ' h' : '\u2014'}</td>
                      <td><span className={'tag ' + (pp.missing ? 'neutral' : pp.late ? 'out' : 'in')}>{pp.missing ? 'Pas de sortie' : pp.late ? 'Retard' : 'OK'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {missing > 0 && <p className="hint">{missing} jour{missing > 1 ? 's' : ''} sans sortie sur la periode.</p>}
        </div>
      </div>
    </div>
  );
}

function useAdminToken() {
  const { adminToken, setAdminToken } = useApp();
  return [adminToken, setAdminToken];
}
