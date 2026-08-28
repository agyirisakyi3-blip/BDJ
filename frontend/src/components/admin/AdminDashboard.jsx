import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../contexts/AppContext';
import { fmtHours, todayStr, shiftDateStr, avatarHue, avatarInitials, cmpVals } from '../../utils';
import AdminLogin from './AdminLogin';
import QRGenerator from './QRGenerator';

const PEOPLE_STATUS = {
  onsite: { label: 'Sur place', cls: 'in' },
  break: { label: 'En pause', cls: 'pause' },
  leave: { label: 'En conge', cls: 'leave' },
  out: { label: 'Sorti', cls: 'out' },
  absent: { label: 'Absent', cls: 'neutral' },
};

const PEOPLE_SORT_KEYS = {
  name: (p) => p.name || p.email || '',
  daysPresent: (p) => Number(p.daysPresent || 0),
  totalHours: (p) => p.totalHours == null ? -1 : Number(p.totalHours),
  avgHours: (p) => p.avgHours == null ? -1 : Number(p.avgHours),
  lateCount: (p) => Number(p.lateCount || 0),
  statusToday: (p) => PEOPLE_STATUS[p.statusToday]?.label || '',
};

const REPORT_SORT_KEYS = {
  date: (p) => p.date || '',
  name: (p) => p.name || '',
  in: (p) => p.in || '',
  out: (p) => p.out || '',
  hours: (p) => p.hours == null ? -1 : Number(p.hours),
  status: (p) => p.missing ? 2 : p.late ? 1 : 0,
};

function CollapsibleCard({ title, count, children, defaultCollapsed = false }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <div className={'card block' + (collapsed ? ' collapsed' : '')}>
      <div className="block-head collapsible" onClick={() => setCollapsed(!collapsed)}>
        <h3>{title}</h3>
        {count !== undefined && <span className="pill">{count}</span>}
      </div>
      {!collapsed && <div className="block-body">{children}</div>}
    </div>
  );
}

function SortableTable({ columns, data, sortKey, sortDir, onSort, renderRow }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="sortable"
                onClick={() => onSort(col.key)}
                style={col.key === sortKey ? { color: 'var(--accent-light)' } : {}}>
                {col.label}
                {col.key === sortKey && (sortDir === 1 ? ' \u2191' : ' \u2193')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr><td className="empty" colSpan={columns.length}>Aucun resultat.</td></tr>
          ) : data.map((row, i) => renderRow(row, i))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { showFeedback, apiCall, config } = useApp();
  const [token, setToken] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminData, setAdminData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState(todayStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [activeQuickRange, setActiveQuickRange] = useState('today');

  // Sub-section data
  const [employees, setEmployees] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [holidays, setHolidays] = useState([]);

  // People table state
  const [peopleQuery, setPeopleQuery] = useState('');
  const [peopleSort, setPeopleSort] = useState({ key: '', dir: 1 });
  // Report table state
  const [reportQuery, setReportQuery] = useState('');
  const [reportSort, setReportSort] = useState({ key: '', dir: 1 });

  const loadDashboard = useCallback(async (from, to, tkn) => {
    setLoading(true);
    try {
      const res = await apiCall({ action: 'admin', from, to, token: tkn || token });
      if (!res.ok) throw new Error(res.message || 'Echec');
      setAdminData(res.admin);
      setToken(tkn || token);
      loadSubData(tkn || token);
    } catch (err) {
      showFeedback('error', err.message);
      if (err.message?.includes('Admin login required')) {
        setToken('');
        setAdminData(null);
      }
    }
    setLoading(false);
  }, [apiCall, token, showFeedback]);

  const loadSubData = useCallback((tkn) => {
    const t = tkn || token;
    apiCall({ action: 'employees', token: t }).then((r) => setEmployees(r.ok ? r.employees || [] : [])).catch(() => {});
    apiCall({ action: 'admins_list', token: t }).then((r) => setAdmins(r.ok ? r.admins || [] : [])).catch(() => {});
    apiCall({ action: 'leave_list', token: t }).then((r) => setLeaves(r.ok ? r.leaves || [] : [])).catch(() => {});
    apiCall({ action: 'holiday_list', token: t }).then((r) => setHolidays(r.ok ? r.holidays || [] : [])).catch(() => {});
  }, [apiCall, token]);

  const handleLogin = ({ token: tkn, email, data }) => {
    setToken(tkn);
    setAdminEmail(email);
    setAdminData(data.admin);
    const from = todayStr();
    const to = todayStr();
    setDateFrom(from);
    setDateTo(to);
    loadSubData(tkn);
  };

  const handleQuickRange = (range) => {
    const today = todayStr();
    let from, to;
    if (range === 'today') { from = today; to = today; }
    else if (range === '7d') { from = shiftDateStr(-6); to = today; }
    else if (range === '30d') { from = shiftDateStr(-29); to = today; }
    else if (range === 'month') {
      const n = new Date();
      from = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-01';
      to = today;
    }
    setDateFrom(from); setDateTo(to); setActiveQuickRange(range);
    loadDashboard(from, to);
  };

  const handleRefresh = () => loadDashboard(dateFrom, dateTo);

  if (!adminData) {
    return (
      <div>
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark brand-logo" aria-hidden="true">
              <img src="/icons/icon-192.png" alt="Logo BDJ" />
            </span>
            <div className="brand-text"><h1>Admin</h1><p className="muted">Resume du jour</p></div>
          </div>
          <button className="icon-btn" type="button" onClick={() => navigate('/')}>Retour</button>
        </header>
        <AdminLogin onLogin={handleLogin} />
      </div>
    );
  }

  const a = adminData;
  const live = a.live || {};
  const summary = a.summary || {};
  const pairs = a.pairs || [];
  const allPeople = a.people || [];

  // Filter + sort people
  const pq = peopleQuery.trim().toLowerCase();
  let filteredPeople = pq ? allPeople.filter((p) => [p.name, p.email, p.department].filter(Boolean).join(' ').toLowerCase().includes(pq)) : [...allPeople];
  if (peopleSort.key && PEOPLE_SORT_KEYS[peopleSort.key]) {
    filteredPeople.sort((x, y) => cmpVals(PEOPLE_SORT_KEYS[peopleSort.key](x), PEOPLE_SORT_KEYS[peopleSort.key](y)) * peopleSort.dir);
  }

  // Filter + sort report
  const rq = reportQuery.trim().toLowerCase();
  let filteredReport = rq ? pairs.filter((p) => (p.name || '').toLowerCase().includes(rq)) : [...pairs];
  if (reportSort.key && REPORT_SORT_KEYS[reportSort.key]) {
    filteredReport.sort((x, y) => cmpVals(REPORT_SORT_KEYS[reportSort.key](x), REPORT_SORT_KEYS[reportSort.key](y)) * reportSort.dir);
  } else {
    filteredReport.sort((x, y) => (y.date + y.in).localeCompare(x.date + x.in));
  }

  // Hours chart
  const hoursByDate = {};
  const dates = [];
  pairs.forEach((p) => { if (!p.date) return; if (!hoursByDate[p.date]) { hoursByDate[p.date] = 0; dates.push(p.date); } hoursByDate[p.date] += (p.hours != null && !isNaN(p.hours)) ? p.hours : 0; });
  dates.sort();
  const shownDates = dates.slice(-14);
  const hoursMax = Math.max(...shownDates.map((d) => hoursByDate[d]), 0);
  const totalShownHours = shownDates.reduce((s, d) => s + hoursByDate[d], 0);

  const handleEmployeeAdd = async (data) => {
    try {
      const res = await apiCall({ action: 'employee_add', token, ...data });
      if (!res.ok) throw new Error(res.message);
      showFeedback('success', 'Employe "' + res.employee.name + '" enregistre.');
      loadSubData();
    } catch (err) { showFeedback('error', err.message); }
  };

  const handleEmployeeDelete = async (email) => {
    if (!window.confirm('Supprimer ' + email + ' ?')) return;
    try {
      const res = await apiCall({ action: 'employee_delete', token, email });
      if (!res.ok) throw new Error(res.message);
      showFeedback('success', email + ' supprime.');
      loadSubData();
    } catch (err) { showFeedback('error', err.message); }
  };

  const handleAdminAdd = async (data) => {
    try {
      const res = await apiCall({ action: 'admin_add', token, ...data, adminEmail });
      if (!res.ok) throw new Error(res.message);
      showFeedback('success', res.message || data.email + ' est maintenant admin.');
      loadSubData();
    } catch (err) { showFeedback('error', err.message); }
  };

  const handleAdminRemove = async (email) => {
    if (!window.confirm('Retirer l\'acces admin de ' + email + ' ?')) return;
    try {
      const res = await apiCall({ action: 'admin_remove', token, email, adminEmail });
      if (!res.ok) throw new Error(res.message);
      showFeedback('success', email + ' retire des admins.');
      loadSubData();
    } catch (err) { showFeedback('error', err.message); }
  };

  const handleLeaveAdd = async (data) => {
    try {
      const res = await apiCall({ action: 'leave_add', token, ...data, adminEmail });
      if (!res.ok) throw new Error(res.message);
      showFeedback('success', 'Conge enregistre pour ' + data.email + '.');
      loadSubData();
    } catch (err) { showFeedback('error', err.message); }
  };

  const handleLeaveDelete = async (index) => {
    if (!window.confirm('Supprimer cette periode de conge ?')) return;
    try {
      const res = await apiCall({ action: 'leave_delete', token, index, adminEmail });
      if (!res.ok) throw new Error(res.message);
      showFeedback('success', 'Conge supprime.');
      loadSubData();
    } catch (err) { showFeedback('error', err.message); }
  };

  const handleHolidayAdd = async (data) => {
    try {
      const res = await apiCall({ action: 'holiday_add', token, ...data, adminEmail });
      if (!res.ok) throw new Error(res.message);
      showFeedback('success', 'Jour ferie enregistre.');
      loadSubData();
    } catch (err) { showFeedback('error', err.message); }
  };

  const handleHolidayDelete = async (index) => {
    if (!window.confirm('Supprimer ce jour ferie ?')) return;
    try {
      const res = await apiCall({ action: 'holiday_delete', token, index, adminEmail });
      if (!res.ok) throw new Error(res.message);
      showFeedback('success', 'Jour ferie supprime.');
      loadSubData();
    } catch (err) { showFeedback('error', err.message); }
  };

  const handleCorrection = async (data) => {
    try {
      const res = await apiCall({ action: 'correction_apply', token, ...data, adminEmail });
      if (!res.ok) throw new Error(res.message);
      showFeedback('success', 'Correction appliquee.');
      loadDashboard(dateFrom, dateTo);
    } catch (err) { showFeedback('error', err.message); }
  };

  const downloadReportCsv = () => {
    const head = ['Date', 'Nom', 'Email', 'Entree', 'Sortie', 'Heures', 'Statut'];
    const lines = [head.join(',')];
    pairs.forEach((p) => {
      const status = p.missing ? 'Pas de sortie' : p.late ? 'Retard' : 'OK';
      const row = [p.date, p.name, p.email, p.in || '', p.out || '', p.hours != null ? p.hours : '', status];
      lines.push(row.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(','));
    });
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'presence-' + dateFrom + '_' + dateTo + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  };

  const downloadPeopleCsv = () => {
    const head = ['Nom', 'Email', 'Departement', 'Jours presents', 'Total heures', 'Moyenne', 'Retards', 'Statut'];
    const lines = [head.join(',')];
    allPeople.forEach((p) => {
      const st = PEOPLE_STATUS[p.statusToday];
      const row = [p.name || '', p.email, p.department || '', p.daysPresent || 0, p.totalHours ?? '', p.avgHours ?? '', p.lateCount || 0, st?.label || ''];
      lines.push(row.map((c) => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(','));
    });
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'effectif-' + dateFrom + '_' + dateTo + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  };

  const onBreakSet = {};
  (live.onBreakNames || []).forEach((n) => { onBreakSet[n] = true; });

  return (
    <div>
      {/* Dashboard Toolbar */}
      <div className="card block dash-toolbar">
        <div className="block-body">
          <div className="dash-toolbar-head">
            <span className="kpi-icon lg kpi-violet" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            </span>
            <div><h3>Tableau de bord</h3><p className="hint">Periode : {dateFrom} \u2192 {dateTo}</p></div>
          </div>
          <div className="quick-ranges">
            {['today','7d','30d','month'].map((r) => (
              <button key={r} className={'qr-chip' + (activeQuickRange === r ? ' active' : '')} onClick={() => handleQuickRange(r)}>
                {r === 'today' ? "Aujourd'hui" : r === '7d' ? '7 jours' : r === '30d' ? '30 jours' : 'Ce mois'}
              </button>
            ))}
          </div>
          <div className="range-row">
            <label className="range-field"><span>Du</span>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </label>
            <label className="range-field"><span>Au</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </label>
            <button className="primary-btn range-btn" onClick={() => loadDashboard(dateFrom, dateTo)}>
              {loading ? 'Chargement...' : 'Charger'}
            </button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid">
        <div className="kpi">
          <span className="kpi-icon kpi-violet"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
          <b>{allPeople.length}</b><span>Effectif</span>
        </div>
        <div className="kpi">
          <span className="kpi-icon kpi-emerald"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg></span>
          <b>{live.onSite || 0}</b><span>Sur place</span>
        </div>
        <div className="kpi">
          <span className="kpi-icon kpi-blue"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg></span>
          <b>{live.checkedInToday || 0}</b><span>Entrees aujourd'hui</span>
        </div>
        <div className="kpi">
          <span className="kpi-icon kpi-amber"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></span>
          <b>{live.checkedOutToday || 0}</b><span>Sorties aujourd'hui</span>
        </div>
      </div>

      {/* Period Summary */}
      <p className="stat-caption">Periode selectionnee</p>
      <div className="report-summary stat-row">
        <div className="stat stat-in"><b>{fmtHours(summary.totalHours)}</b><span>Total heures</span></div>
        <div className="stat stat-on"><b>{summary.daysPresent}</b><span>Jours presents</span></div>
        <div className="stat stat-out"><b>{summary.lateCount}</b><span>Retards</span></div>
        <div className="stat stat-in"><b>{summary.missingOut}</b><span>Pas de sortie</span></div>
      </div>

      {/* Hours Chart */}
      <div className="card block chart-block">
        <div className="block-head collapsible">
          <h3>Heures par jour</h3>
          <span className="pill">{Math.round(totalShownHours * 10) / 10} h</span>
        </div>
        <div className="block-body">
          <div className="bar-chart">
            {shownDates.length === 0 ? null : shownDates.map((d) => (
              <div key={d} className="bar-col" title={d + ' \u00b7 ' + fmtHours(hoursByDate[d])}>
                <span className="bar-val">{hoursByDate[d] ? Math.round(hoursByDate[d] * 10) / 10 : ''}</span>
                <div className={'bar' + (hoursByDate[d] ? '' : ' zero')}
                  style={hoursByDate[d] ? { height: Math.max(4, Math.round((hoursByDate[d] / hoursMax) * 100)) + '%' } : {}} />
                <span className="bar-label">{d.slice(8, 10) + '/' + d.slice(5, 7)}</span>
              </div>
            ))}
          </div>
          {shownDates.length === 0 && <p className="hint">Aucune donnee sur cette periode.</p>}
        </div>
      </div>

      {/* On-site / Absent */}
      <div className="card block">
        <div className="block-head collapsible">
          <h3>Present maintenant</h3>
          <span className="pill">{live.onSite || 0} sur place</span>
        </div>
        <div className="block-body">
          <div className="chips">
            {(!live.onSiteNames || live.onSiteNames.length === 0) ? (
              <span className="empty">{live.isHolidayToday ? 'Jour ferie : ' + (live.holidayToday || '') + '. Personne n\'est attendu.' : 'Personne n\'est sur place actuellement.'}</span>
            ) : live.onSiteNames.map((n) => (
              <span key={n} className={'chip' + (onBreakSet[n] ? ' chip-pause' : '')}>{onBreakSet[n] ? n + ' \u00b7 pause' : n}</span>
            ))}
          </div>
          <div className="absent-block">
            <div className="block-head"><h3>Pas encore pointe</h3><span className="pill">{(live.absent || []).length} non pointe{(live.absent || []).length > 1 ? 's' : ''}</span></div>
            <div className="chips">
              {(live.absent || []).length === 0 ? (
                <span className="empty">Tout le personnel a deja pointe aujourd'hui.</span>
              ) : (live.absent || []).map((p) => (
                <span key={p.email} className="chip absent" title={p.email}>{p.name ? p.name + ' \u00b7 ' + p.email : p.email}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* People Table */}
      <div className="card block">
        <div className="block-head collapsible">
          <h3>Effectif complet</h3>
          <span className="pill">{filteredPeople.length === allPeople.length ? allPeople.length + (allPeople.length > 1 ? ' personnes' : ' personne') : filteredPeople.length + ' / ' + allPeople.length}</span>
        </div>
        <div className="block-body">
          <div className="table-tools">
            <div className="search-wrap">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="search" placeholder="Rechercher nom, email, departement..." value={peopleQuery} onChange={(e) => setPeopleQuery(e.target.value)} />
            </div>
          </div>
          <div className="table-wrap people-table">
            <table>
              <thead>
                <tr>
                  {[{key:'name',label:'Nom'},{key:'daysPresent',label:'Jours'},{key:'totalHours',label:'Heures'},{key:'avgHours',label:'Moy./jour'},{key:'lateCount',label:'Retards'},{key:'statusToday',label:"Aujourd'hui"}].map((col) => (
                    <th key={col.key} className="sortable" onClick={() => setPeopleSort((s) => s.key === col.key ? { key: col.key, dir: -s.dir } : { key: col.key, dir: 1 })}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredPeople.length === 0 ? (
                  <tr><td className="empty" colSpan={6}>{allPeople.length === 0 ? 'Aucun membre d\'effectif configure.' : 'Aucun resultat pour cette recherche.'}</td></tr>
                ) : filteredPeople.map((p) => {
                  const hue = avatarHue(p.email || p.name);
                  const st = PEOPLE_STATUS[p.statusToday];
                  return (
                    <tr key={p.email} title={p.email + (p.department ? ' \u00b7 ' + p.department : '')}>
                      <td>
                        <div className="person-cell">
                          <span className="avatar" style={{ background: `linear-gradient(135deg, hsl(${hue}, 70%, 84%), hsl(${(hue+40)%360}, 62%, 68%))`, color: `hsl(${hue}, 58%, 28%)` }}>{avatarInitials(p.name, p.email)}</span>
                          <span className="person-name">{p.name || p.email}</span>
                          {p.department && <span className="person-dept">{p.department}</span>}
                        </div>
                      </td>
                      <td>{p.daysPresent || 0}</td>
                      <td>{fmtHours(p.totalHours)}</td>
                      <td>{fmtHours(p.avgHours)}</td>
                      <td>{p.lateCount || 0}</td>
                      <td>{st ? <span className={'tag ' + st.cls}>{st.label}</span> : '\u2014'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button className="ghost-btn sm" onClick={downloadPeopleCsv}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>Exporter l'effectif (CSV)</span>
          </button>
        </div>
      </div>

      {/* Report Table */}
      <div className="card block">
        <div className="block-head collapsible">
          <h3>Rapport</h3>
          <span className="pill">{filteredReport.length === pairs.length ? pairs.length + ' entree' + (pairs.length > 1 ? 's' : '') : filteredReport.length + ' / ' + pairs.length}</span>
        </div>
        <div className="block-body">
          <div className="table-tools">
            <div className="search-wrap">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="search" placeholder="Rechercher un nom..." value={reportQuery} onChange={(e) => setReportQuery(e.target.value)} />
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {[{key:'date',label:'Date'},{key:'name',label:'Nom'},{key:'in',label:'Entree'},{key:'out',label:'Sortie'},{key:'hours',label:'Heures'},{key:'status',label:'Statut'}].map((col) => (
                    <th key={col.key} className="sortable" onClick={() => setReportSort((s) => s.key === col.key ? { key: col.key, dir: -s.dir } : { key: col.key, dir: 1 })}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredReport.length === 0 ? (
                  <tr><td className="empty" colSpan={6}>{pairs.length === 0 ? 'Aucune presence dans cette periode.' : 'Aucun resultat pour cette recherche.'}</td></tr>
                ) : filteredReport.map((p, i) => (
                  <tr key={i} className={p.missing ? 'row-missing' : p.late ? 'row-late' : ''}>
                    <td>{p.date}</td><td>{p.name}</td><td>{p.in || '\u2014'}</td><td>{p.out || '\u2014'}</td><td>{fmtHours(p.hours)}</td>
                    <td><span className={'tag ' + (p.missing ? 'neutral' : p.late ? 'out' : 'in')}>{p.missing ? 'Pas de sortie' : p.late ? 'Retard' : 'OK'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Export buttons */}
      <div className="btn-row">
        <button className="ghost-btn" onClick={downloadReportCsv}>CSV</button>
        <a className="ghost-btn" href={a.sheetUrl || '#'} target="_blank" rel="noopener">Feuille</a>
        <button className="ghost-btn" onClick={handleRefresh}>Actualiser</button>
      </div>

      {/* Management sections */}
      <p className="stat-caption">Gestion</p>

      <EmployeeSection employees={employees} onAdd={handleEmployeeAdd} onDelete={handleEmployeeDelete} />
      <AdminSection admins={admins} onAdd={handleAdminAdd} onRemove={handleAdminRemove} />
      <LeaveSection leaves={leaves} onAdd={handleLeaveAdd} onDelete={handleLeaveDelete} />
      <HolidaySection holidays={holidays} onAdd={handleHolidayAdd} onDelete={handleHolidayDelete} />
      <CorrectionSection onApply={handleCorrection} />
      <QRGenerator />
      <OfficeScreenLink />
    </div>
  );
}

function EmployeeSection({ employees, onAdd, onDelete }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [dept, setDept] = useState('');
  const [shiftStart, setShiftStart] = useState('');
  const [shiftEnd, setShiftEnd] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!name.trim()) { setError('Saisissez le nom.'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError('Email invalide.'); return; }
    setLoading(true); setError('');
    await onAdd({ name: name.trim(), email: email.trim(), department: dept.trim(), shiftStart, shiftEnd });
    setLoading(false);
    setName(''); setEmail(''); setDept(''); setShiftStart(''); setShiftEnd('');
  };

  return (
    <CollapsibleCard title="Employes" count={employees.length + ' employe' + (employees.length === 1 ? '' : 's')}>
      <p className="hint">Personnel pre-approuve.</p>
      <div className="emp-form">
        <label className="range-field">Nom<input type="text" placeholder="Nom complet" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="range-field">Email<input type="email" placeholder="vous@entreprise.com" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="range-field">Departement <span className="opt">(facultatif)</span><input type="text" placeholder="Informatique" value={dept} onChange={(e) => setDept(e.target.value)} /></label>
        <label className="range-field">Debut <span className="opt">(HH:MM)</span><input type="time" value={shiftStart} onChange={(e) => setShiftStart(e.target.value)} /></label>
        <label className="range-field">Fin <span className="opt">(HH:MM)</span><input type="time" value={shiftEnd} onChange={(e) => setShiftEnd(e.target.value)} /></label>
        <button className="ghost-btn range-btn" onClick={handleAdd} disabled={loading}>{loading ? 'Ajout...' : 'Ajouter'}</button>
      </div>
      {error && <p className="feedback error">{error}</p>}
      <div className="table-wrap emp-table">
        <table>
          <thead><tr><th>Nom</th><th>Email</th><th>Departement</th><th>Horaires</th><th></th></tr></thead>
          <tbody>
            {employees.length === 0 ? <tr><td className="empty" colSpan={5}>Aucun employe.</td></tr> : employees.map((e) => (
              <tr key={e.email}>
                <td>{e.name}</td><td>{e.email}</td><td>{e.department || '\u2014'}</td>
                <td>{(e.shiftStart || e.shiftEnd) ? ((e.shiftStart || '--:--') + ' - ' + (e.shiftEnd || '--:--')) : '\u2014'}</td>
                <td><button className="ghost-btn sm" onClick={() => onDelete(e.email)}>Supprimer</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CollapsibleCard>
  );
}

function AdminSection({ admins, onAdd, onRemove }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!email.trim()) { setError('Saisissez l\'email.'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError('Email invalide.'); return; }
    setLoading(true); setError('');
    await onAdd({ name: name.trim(), email: email.trim() });
    setLoading(false);
    setName(''); setEmail('');
  };

  return (
    <CollapsibleCard title="Admins" count={admins.length + ' admin' + (admins.length === 1 ? '' : 's')}>
      <div className="emp-form">
        <label className="range-field">Nom<input type="text" placeholder="Nom complet" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="range-field">Email<input type="email" placeholder="vous@entreprise.com" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <button className="ghost-btn range-btn" onClick={handleAdd} disabled={loading}>{loading ? 'Ajout...' : 'Ajouter un admin'}</button>
      </div>
      {error && <p className="feedback error">{error}</p>}
      <div className="table-wrap emp-table">
        <table>
          <thead><tr><th>Nom</th><th>Email</th><th>Ajoute le</th><th></th></tr></thead>
          <tbody>
            {admins.length === 0 ? <tr><td className="empty" colSpan={4}>Aucun admin.</td></tr> : admins.map((a) => (
              <tr key={a.email}><td>{a.name || '\u2014'}</td><td>{a.email}</td><td>{a.addedOn || '\u2014'}</td>
                <td><button className="ghost-btn sm" onClick={() => onRemove(a.email)}>Supprimer</button></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </CollapsibleCard>
  );
}

function LeaveSection({ leaves, onAdd, onDelete }) {
  const [email, setEmail] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError('Email invalide.'); return; }
    if (!start || !end) { setError('Saisissez les dates.'); return; }
    setLoading(true); setError('');
    await onAdd({ email: email.trim(), start, end: end || start, reason: reason.trim() });
    setLoading(false);
    setEmail(''); setReason('');
  };

  return (
    <CollapsibleCard title="Conges" count={leaves.length + ' periode' + (leaves.length === 1 ? '' : 's')}>
      <p className="hint">Conges approuves.</p>
      <div className="emp-form">
        <label className="range-field">Email<input type="email" placeholder="vous@entreprise.com" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="range-field">Du<input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="range-field">Au<input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        <label className="range-field">Motif <span className="opt">(facultatif)</span><input type="text" placeholder="Conge annuel, maladie..." value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <button className="ghost-btn range-btn" onClick={handleAdd} disabled={loading}>{loading ? 'Ajout...' : 'Ajouter'}</button>
      </div>
      {error && <p className="feedback error">{error}</p>}
      <div className="table-wrap emp-table">
        <table>
          <thead><tr><th>Email</th><th>Du</th><th>Au</th><th>Motif</th><th></th></tr></thead>
          <tbody>
            {leaves.length === 0 ? <tr><td className="empty" colSpan={5}>Aucun conge.</td></tr> : leaves.map((l, idx) => (
              <tr key={idx}><td>{l.email}</td><td>{l.start}</td><td>{l.end}</td><td>{l.reason || '\u2014'}</td>
                <td><button className="ghost-btn sm" onClick={() => onDelete(idx + 1)}>Supprimer</button></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </CollapsibleCard>
  );
}

function HolidaySection({ holidays, onAdd, onDelete }) {
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!date) { setError('Saisissez la date.'); return; }
    setLoading(true); setError('');
    await onAdd({ date, name: name.trim() });
    setLoading(false);
    setDate(''); setName('');
  };

  return (
    <CollapsibleCard title="Jours feries" count={holidays.length + ' jour' + (holidays.length === 1 ? '' : 's')}>
      <div className="emp-form">
        <label className="range-field">Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="range-field">Nom<input type="text" placeholder="Fete du travail" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <button className="ghost-btn range-btn" onClick={handleAdd} disabled={loading}>{loading ? 'Ajout...' : 'Ajouter'}</button>
      </div>
      {error && <p className="feedback error">{error}</p>}
      <div className="table-wrap emp-table">
        <table>
          <thead><tr><th>Date</th><th>Nom</th><th></th></tr></thead>
          <tbody>
            {holidays.length === 0 ? <tr><td className="empty" colSpan={3}>Aucun jour ferie.</td></tr> : holidays.map((h, idx) => (
              <tr key={idx}><td>{h.date}</td><td>{h.name}</td>
                <td><button className="ghost-btn sm" onClick={() => onDelete(idx + 1)}>Supprimer</button></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </CollapsibleCard>
  );
}

function CorrectionSection({ onApply }) {
  const [email, setEmail] = useState('');
  const [date, setDate] = useState('');
  const [fixMode, setFixMode] = useState('set_out');
  const [inTime, setInTime] = useState('');
  const [outTime, setOutTime] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  const handleApply = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError('Email invalide.'); return; }
    if (!date) { setError('Saisissez la date.'); return; }
    if (fixMode !== 'remove_last' && !outTime) { setError('Saisissez l\'heure de sortie.'); return; }
    if (fixMode === 'add_pair' && !inTime) { setError('Saisissez l\'heure d\'entree.'); return; }
    setLoading(true); setError(''); setResult('');
    try {
      await onApply({ email: email.trim(), date, fixMode, inTime, out: outTime });
      setResult('Correction appliquee.');
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  return (
    <CollapsibleCard title="Corrections de pointage">
      <p className="hint">Corrigez un pointage oublie ou errone.</p>
      <div className="emp-form">
        <label className="range-field">Email<input type="email" placeholder="vous@entreprise.com" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="range-field">Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="range-field">Correction
          <select value={fixMode} onChange={(e) => setFixMode(e.target.value)}>
            <option value="set_out">Sortie oubliee</option>
            <option value="add_pair">Paire complete</option>
            <option value="remove_last">Supprimer le dernier pointage</option>
          </select>
        </label>
        {fixMode === 'add_pair' && <label className="range-field">Entree (HH:MM)<input type="time" value={inTime} onChange={(e) => setInTime(e.target.value)} /></label>}
        {fixMode !== 'remove_last' && <label className="range-field">Sortie (HH:MM)<input type="time" value={outTime} onChange={(e) => setOutTime(e.target.value)} /></label>}
        <button className="ghost-btn range-btn" onClick={handleApply} disabled={loading}>{loading ? 'Application...' : 'Appliquer'}</button>
      </div>
      {error && <p className="feedback error">{error}</p>}
      {result && <p className="hint">{result}</p>}
    </CollapsibleCard>
  );
}

function OfficeScreenLink() {
  return (
    <CollapsibleCard title="Ecran d'entree (QR rotatif)">
      <p className="hint">Ouvrez cette page sur la tablette ou l'ecran a l'entree du bureau.</p>
      <a className="ghost-btn range-btn" href="office-screen.html" target="_blank" rel="noopener">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
        Ouvrir l'ecran d'entree
      </a>
    </CollapsibleCard>
  );
}
