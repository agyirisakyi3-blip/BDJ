import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../contexts/AppContext';
import { fmtHours, todayStr, shiftDateStr, cmpVals } from '../../utils';
import AdminLogin from './AdminLogin';
import QRGenerator from './QRGenerator';
import AnimatedNumber from './AnimatedNumber';
import Reveal from './Reveal';
import HoursChart from './HoursChart';
import PresenceDonut from './PresenceDonut';
import PhotoAvatar from './PhotoAvatar';
import AdminSidebar from './AdminSidebar';
import { compressImage } from '../../utils';

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

const VIEW_TITLES = {
  dashboard: 'Tableau de bord',
  effectif: 'Effectif',
  annuaire: 'Annuaire (bios)',
  rapport: 'Rapport',
  alertes: 'Alertes & anomalies',
  gestion: 'Gestion',
  qr: 'QR & acces',
};

const ANOMALY_MIN_HOURS = 2;      // days under this number of net hours
const ANOMALY_MAX_HOURS = 16;     // days over this number of net hours
const ANOMALY_MAX_BREAK = 120;    // minutes of break above which we flag

function buildAnomalies(pairs, people) {
  const items = [];
  (pairs || []).forEach((p) => {
    if (!p.date) return;
    if (p.hours != null && !isNaN(p.hours)) {
      if (p.hours < ANOMALY_MIN_HOURS) items.push({ kind: 'short', p, detail: fmtHours(p.hours) + ' h sur ' + p.date });
      else if (p.hours > ANOMALY_MAX_HOURS) items.push({ kind: 'long', p, detail: fmtHours(p.hours) + ' h sur ' + p.date });
    }
    if (p.breakMin != null && p.breakMin > ANOMALY_MAX_BREAK) items.push({ kind: 'break', p, detail: Math.round(p.breakMin / 60 * 10) / 10 + ' h de pause le ' + p.date });
    if (p.missing) items.push({ kind: 'missing', p, detail: 'Pas de sortie le ' + p.date });
  });
  (people || []).forEach((per) => {
    const late = Number(per.lateCount || 0);
    if (late >= 5) items.push({ kind: 'repeat-late', per, detail: late + ' retards sur la periode' });
  });
  items.sort((a, b) => (b.p && b.p.date || '').localeCompare(a.p && a.p.date || ''));
  return items;
}

function buildAlerts(adminData) {
  const out = [];
  const live = (adminData && adminData.live) || {};
  const summary = (adminData && adminData.summary) || {};

  if (!live.isHolidayToday && (live.absent || []).length > 0) {
    out.push({
      kind: 'absent',
      title: (live.absent || []).length + ' personne' + ((live.absent || []).length > 1 ? 's' : '') + ' pas encore pointe' + ((live.absent || []).length > 1 ? 'es' : 'e') + " aujourd'hui",
      rows: (live.absent || []).slice(0, 12).map((p) => p.name ? p.name + ' \u00b7 ' + p.email : p.email),
      more: (live.absent || []).length > 12 ? (live.absent || []).length - 12 + ' de plus...' : ''
    });
  }

  if (summary.missingOut > 0) {
    out.push({
      kind: 'missingout',
      title: summary.missingOut + ' sortie' + (summary.missingOut > 1 ? 's' : '') + ' manquante' + (summary.missingOut > 1 ? 's' : '') + ' sur la periode',
      rows: []
    });
  }

  if (summary.lateCount > 0) {
    out.push({
      kind: 'late',
      title: summary.lateCount + ' retard' + (summary.lateCount > 1 ? 's' : '') + ' sur la periode',
      rows: []
    });
  }

  return out;
}

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
  const { showFeedback, apiCall, config, setAdminToken: contextSetToken, setAdminEmail: contextSetEmail } = useApp();
  const [token, setToken] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminData, setAdminData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState(todayStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [activeQuickRange, setActiveQuickRange] = useState('today');
  const [activeView, setActiveView] = useState(() => {
    try { return sessionStorage.getItem('adminView') || 'dashboard'; } catch (e) { return 'dashboard'; }
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
  // Live refresh
  const [liveRefresh, setLiveRefresh] = useState(true);

  // Auto-refresh the "today" dashboard every 30s for live on-site status.
  useEffect(() => {
    if (!adminData || !liveRefresh || activeQuickRange !== 'today') return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') loadDashboard(todayStr(), todayStr());
    }, 30000);
    return () => clearInterval(id);
  }, [adminData, liveRefresh, activeQuickRange]);

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
    contextSetToken(tkn);
    contextSetEmail(email);
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
              <img src="/icons/icon-192.png" alt="Logo addredance" />
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

  // Map employee email -> uploaded photo (from the employees roster) so the
  // Effectif table and bios can show photos.
  const photoByEmail = {};
  employees.forEach((e) => { if (e.email) photoByEmail[e.email.toLowerCase()] = e.photo || ''; });

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
  const totalShownHours = shownDates.reduce((s, d) => s + hoursByDate[d], 0);
  const hoursChartData = shownDates.map((d) => ({
    label: d.slice(8, 10) + '/' + d.slice(5, 7),
    hours: Math.round(hoursByDate[d] * 10) / 10,
  }));

  // Presence donut (today's status breakdown)
  const onBreakCount = (live.onBreakNames || []).length;
  const statusBuckets = [
    { key: 'onsite', value: Number(live.onSite || 0) },
    { key: 'break', value: onBreakCount },
    { key: 'leave', value: Number(live.onLeave || 0) },
    { key: 'out', value: Number(live.checkedOutToday || 0) },
    { key: 'absent', value: Number((live.absent || []).length) },
  ].filter((b) => b.value > 0);
  const donutTotal = statusBuckets.reduce((s, b) => s + b.value, 0);

  const handleEmployeeAdd = async (data) => {
    try {
      const res = await apiCall({ action: 'employee_add', token, ...data });
      if (!res.ok) throw new Error(res.message);
      showFeedback('success', 'Employe "' + res.employee.name + '" enregistre.');
      loadSubData();
    } catch (err) { showFeedback('error', err.message); }
  };

  const handleBioUpdate = async (data) => {
    try {
      const res = await apiCall({ action: 'employee_bio_update', token, ...data });
      if (!res.ok) throw new Error(res.message);
      showFeedback('success', 'Fiche de "' + data.email + '" mise a jour.');
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

  const handleBulkImport = async (rows) => {
    let added = 0, updated = 0, failed = 0;
    for (const r of rows) {
      try {
        const res = await apiCall({ action: 'employee_add', token, ...r });
        if (!res.ok) throw new Error(res.message);
        if (res.employee && res.updated) updated++; else added++;
      } catch (err) { failed++; }
    }
    if (added || updated) {
      showFeedback('success', added + ' ajoute' + (added > 1 ? 's' : '') + ', ' + updated + ' mis a jour' + (failed ? ', ' + failed + ' en erreur' : '') + '.');
      loadSubData();
    } else {
      showFeedback('error', 'Aucun employe ajoute' + (failed ? ' (' + failed + ' erreur' + (failed > 1 ? 's' : '') + ').' : '.'));
    }
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
    <div className="admin-shell">
      <AdminSidebar
        active={activeView}
        onSelect={(v) => { setActiveView(v); try { sessionStorage.setItem('adminView', v); } catch (e) {} }}
        open={sidebarOpen}
        onToggle={(val) => { if (typeof val === 'boolean') setSidebarOpen(val); else setSidebarOpen((s) => !s); }}
        onLogout={() => { setToken(''); setAdminData(null); contextSetToken(''); }}
        adminEmail={adminEmail}
      />

      <div className="admin-content">
        {/* Dashboard Toolbar */}
        <div className="card block dash-toolbar">
          <div className="block-body">
            <div className="dash-toolbar-head">
              <button className="sidebar-toggle" type="button" onClick={() => setSidebarOpen(true)} aria-label="Ouvrir le menu">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
              </button>
              <span className="kpi-icon lg kpi-violet" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              </span>
              <div><h3>{VIEW_TITLES[activeView] || 'Tableau de bord'}</h3><p className="hint">Periode : {dateFrom} \u2192 {dateTo}</p></div>
            </div>
            {activeQuickRange === 'today' && (
              <label className="live-toggle" title="Actualisation automatique toutes les 30s">
                <input type="checkbox" checked={liveRefresh} onChange={(e) => setLiveRefresh(e.target.checked)} />
                <span className="live-dot" aria-hidden="true"></span>
                En direct
              </label>
            )}
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

        {activeView === 'dashboard' && (
          <>
            {/* KPIs */}
            <Reveal>
              <div className="kpi-grid">
                <div className="kpi">
                  <span className="kpi-icon kpi-violet"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
                  <b><AnimatedNumber value={allPeople.length} /></b><span>Effectif</span>
                </div>
                <div className="kpi">
                  <span className="kpi-icon kpi-emerald"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg></span>
                  <b><AnimatedNumber value={live.onSite || 0} /></b><span>Sur place</span>
                </div>
                <div className="kpi">
                  <span className="kpi-icon kpi-blue"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg></span>
                  <b><AnimatedNumber value={live.checkedInToday || 0} /></b><span>Entrees aujourd'hui</span>
                </div>
                <div className="kpi">
                  <span className="kpi-icon kpi-amber"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></span>
                  <b><AnimatedNumber value={live.checkedOutToday || 0} /></b><span>Sorties aujourd'hui</span>
                </div>
              </div>
            </Reveal>

            {/* Charts row */}
            <Reveal delay={80}>
              <div className="charts-row">
                <div className="card block chart-card">
                  <div className="block-head">
                    <h3>Heures par jour</h3>
                    <span className="pill">{totalShownHours ? Math.round(totalShownHours * 10) / 10 : 0} h</span>
                  </div>
                  <div className="block-body">
                    <HoursChart data={hoursChartData} />
                  </div>
                </div>
                <div className="card block chart-card donut-card">
                  <div className="block-head">
                    <h3>Presence aujourd'hui</h3>
                    <span className="pill">{donutTotal} personnel</span>
                  </div>
                  <div className="block-body">
                    <PresenceDonut data={statusBuckets} total={donutTotal} />
                  </div>
                </div>
              </div>
            </Reveal>

            {/* Period Summary */}
            <Reveal delay={40}>
              <div>
                <p className="stat-caption">Periode selectionnee</p>
                <div className="report-summary stat-row">
                  <div className="stat stat-in"><b>{fmtHours(summary.totalHours)}</b><span>Total heures</span></div>
                  <div className="stat stat-on"><b><AnimatedNumber value={summary.daysPresent} /></b><span>Jours presents</span></div>
                  <div className="stat stat-out"><b><AnimatedNumber value={summary.lateCount} /></b><span>Retards</span></div>
                  <div className="stat stat-in"><b><AnimatedNumber value={summary.missingOut} /></b><span>Pas de sortie</span></div>
                </div>
              </div>
            </Reveal>

            {/* On-site / Absent */}
            <Reveal delay={60}>
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
                    {live.isWeekendToday ? (
                      <span className="empty">Week-end : personne n'est attendu aujourd'hui (samedi/dimanche non ouvres).</span>
                    ) : live.isHolidayToday ? (
                      <span className="empty">Jour ferie : personne n'est attendu aujourd'hui ({live.holidayToday || ''}).</span>
                    ) : (live.absent || []).length === 0 ? (
                      <span className="empty">Tout le personnel a deja pointe aujourd'hui.</span>
                    ) : (live.absent || []).map((p) => (
                      <span key={p.email} className="chip absent" title={p.email}>{p.name ? p.name + ' \u00b7 ' + p.email : p.email}</span>
                    ))}
                  </div>
                </div>
                </div>
              </div>
            </Reveal>
          </>
        )}

        {activeView === 'effectif' && (
          <>
            {/* People Table */}
            <Reveal delay={40}>
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
                        const st = PEOPLE_STATUS[p.statusToday];
                        return (
                          <tr key={p.email} className="clickable-row" title={'Voir le detail de ' + p.email}
                              onClick={() => navigate('/admin/employe/' + encodeURIComponent(p.email))}>
                            <td>
                              <div className="person-cell">
                                <PhotoAvatar name={p.name} email={p.email} photo={photoByEmail[String(p.email || '').toLowerCase()]} />
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
            </Reveal>
          </>
        )}

        {activeView === 'annuaire' && (
          <Reveal delay={40}>
            {employees.length > 0
              ? <BiosSection employees={employees} onBioUpdate={handleBioUpdate} />
              : <div className="card block"><div className="block-body"><p className="empty">Aucune fiche. Ajoutez d'abord des employes dans « Gestion ».</p></div></div>}
          </Reveal>
        )}

        {activeView === 'rapport' && (
          <>
            {/* Report Table */}
            <Reveal delay={40}>
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
            </Reveal>

            {/* Export buttons */}
            <Reveal delay={40}>
              <div className="btn-row">
                <button className="ghost-btn" onClick={downloadReportCsv}>CSV</button>
                <a className="ghost-btn" href={a.sheetUrl || '#'} target="_blank" rel="noopener">Feuille</a>
                <button className="ghost-btn" onClick={handleRefresh}>Actualiser</button>
              </div>
            </Reveal>
          </>
        )}

        {activeView === 'alertes' && (
          <>
            {/* Alerts */}
            {(function () {
              const alerts = buildAlerts(adminData);
              if (!alerts.length) return <div className="card block"><div className="block-body"><p className="empty">Aucune alerte. Tout est en ordre.</p></div></div>;
              return (
                <div className="card block alert-block">
                  <div className="block-head"><h3>Alertes</h3><span className="pill pills-warn">{alerts.length}</span></div>
                  <div className="block-body">
                    {alerts.map((al, i) => (
                      <div key={i} className={'alert-item alert-' + al.kind}>
                        <strong>{al.title}</strong>
                        {al.rows && al.rows.length > 0 && (
                          <span className="alert-rows">{al.rows.join(' \u00b7 ')}{al.more ? ' ' + al.more : ''}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Anomalies */}
            {(function () {
              const anomalies = buildAnomalies(pairs, allPeople);
              if (!anomalies.length) return <div className="card block"><div className="block-body"><p className="empty">Aucune anomalie sur la periode.</p></div></div>;
              return (
                <div className="card block anomaly-block">
                  <div className="block-head"><h3>Anomalies</h3><span className="pill pills-warn">{anomalies.length}</span></div>
                  <div className="block-body">
                    {anomalies.slice(0, 20).map((an, i) => (
                      <div key={i} className={'anomaly-item anomaly-' + an.kind}>
                        <span className="anomaly-name">{an.p ? (an.p.name || an.p.email) : (an.per ? (an.per.name || an.per.email) : '')}</span>
                        <span className="anomaly-detail">{an.detail}</span>
                      </div>
                    ))}
                    {anomalies.length > 20 && <p className="hint">{anomalies.length - 20} autres anomalies...</p>}
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {activeView === 'gestion' && (
          <>
            <p className="stat-caption">Gestion</p>
            <EmployeeSection employees={employees} onAdd={handleEmployeeAdd} onDelete={handleEmployeeDelete} onBulkImport={handleBulkImport} />
            <AdminSection admins={admins} onAdd={handleAdminAdd} onRemove={handleAdminRemove} />
            <LeaveSection leaves={leaves} onAdd={handleLeaveAdd} onDelete={handleLeaveDelete} />
            <HolidaySection holidays={holidays} onAdd={handleHolidayAdd} onDelete={handleHolidayDelete} />
            <CorrectionSection onApply={handleCorrection} />
          </>
        )}

        {activeView === 'qr' && (
          <>
            <p className="stat-caption">Acces</p>
            <QRGenerator />
            <OfficeScreenLink />
          </>
        )}
      </div>
    </div>
  );
}

function EmployeeSection({ employees, onAdd, onDelete, onBulkImport }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [dept, setDept] = useState('');
  const [role, setRole] = useState('');
  const [phone, setPhone] = useState('');
  const [birth, setBirth] = useState('');
  const [photo, setPhoto] = useState('');
  const [shiftStart, setShiftStart] = useState('');
  const [shiftEnd, setShiftEnd] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkMsg, setBulkMsg] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  const handleAdd = async () => {
    if (!name.trim()) { setError('Saisissez le nom.'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError('Email invalide.'); return; }
    setLoading(true); setError('');
    await onAdd({ name: name.trim(), email: email.trim(), department: dept.trim(), role: role.trim(), phone: phone.trim(), birth: birth || '', photo, shiftStart, shiftEnd });
    setLoading(false);
    setName(''); setEmail(''); setDept(''); setRole(''); setPhone(''); setBirth(''); setPhoto('');
  };

  const handlePhotoFile = async (file) => {
    if (!file) return;
    try { const data = await compressImage(file); setPhoto(data); }
    catch (err) { setError(err.message); }
  };

  const parseCsvLine = (line) => {
    const out = [];
    let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') { q = true; }
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  };

  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setBulkText(String(reader.result || ''));
    reader.readAsText(file);
  };

  const handleBulk = async () => {
    const rows = bulkText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!rows.length) { setBulkMsg('Collez ou uploadez un CSV (Nom,Email,Departement,Debut,Fin).'); return; }
    const parsed = [];
    let skipped = 0;
    rows.forEach((line) => {
      if (/^(nom|name)/i.test(line)) return;
      const cols = parseCsvLine(line).map((c) => c.trim());
      const nm = cols[0] || '';
      const em = (cols[1] || '').toLowerCase();
      const dp = cols[2] || '';
      const ss = cols[3] || '';
      const se = cols[4] || '';
      if (!nm || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { skipped++; return; }
      parsed.push({ name: nm, email: em, department: dp, shiftStart: ss, shiftEnd: se });
    });
    if (!parsed.length) { setBulkMsg('Aucune ligne valide (il faut au moins Nom et Email).'); return; }
    setBulkLoading(true); setBulkMsg('');
    await onBulkImport(parsed);
    setBulkLoading(false);
    setBulkMsg(parsed.length + ' ligne' + (parsed.length > 1 ? 's' : '') + ' traitee' + (parsed.length > 1 ? 's' : '') + (skipped ? ' (' + skipped + ' ignoree' + (skipped > 1 ? 's' : '') + ').' : '.'));
  };

  return (
    <CollapsibleCard title="Employes" count={employees.length + ' employe' + (employees.length === 1 ? '' : 's')}>
      <p className="hint">Personnel pre-approuve.</p>
      <div className="emp-form">
        <label className="range-field">Nom<input type="text" placeholder="Nom complet" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="range-field">Email<input type="email" placeholder="vous@entreprise.com" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="range-field">Departement <span className="opt">(facultatif)</span><input type="text" placeholder="Informatique" value={dept} onChange={(e) => setDept(e.target.value)} /></label>
        <label className="range-field">Poste <span className="opt">(facultatif)</span><input type="text" placeholder="Developpeur" value={role} onChange={(e) => setRole(e.target.value)} /></label>
        <label className="range-field">Telephone <span className="opt">(facultatif)</span><input type="tel" placeholder="+33 6 12 34 56 78" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
        <label className="range-field">Naissance <span className="opt">(facultatif)</span><input type="date" value={birth} onChange={(e) => setBirth(e.target.value)} /></label>
        <label className="range-field">Debut <span className="opt">(HH:MM)</span><input type="time" value={shiftStart} onChange={(e) => setShiftStart(e.target.value)} /></label>
        <label className="range-field">Fin <span className="opt">(HH:MM)</span><input type="time" value={shiftEnd} onChange={(e) => setShiftEnd(e.target.value)} /></label>
        <div className="photo-upload">
          <PhotoAvatar name={name} email={email} photo={photo} size={64} />
          <div className="upload-controls">
            <label className="ghost-btn sm file-btn">Ajouter une photo<input type="file" accept="image/*" onChange={(e) => handlePhotoFile(e.target.files && e.target.files[0])} /></label>
            {photo && <button type="button" className="photo-clear" onClick={() => setPhoto('')}>Retirer la photo</button>}
          </div>
        </div>
        <button className="ghost-btn range-btn" onClick={handleAdd} disabled={loading}>{loading ? 'Ajout...' : 'Ajouter'}</button>
      </div>
      {error && <p className="feedback error">{error}</p>}
      <div className="emp-bulk">
        <p className="hint">Import en masse : collez un tableau ou uploadez un fichier CSV (en-tête facultatif) au format <b>Nom,Email,Departement,Debut(Fin)</b>.</p>
        <div className="bulk-row">
          <textarea rows={5} placeholder={'Nom,Email,Departement,08:00,17:00\nJean Dupont,jean@ex.fr,Compta,08:00,17:00'} value={bulkText} onChange={(e) => setBulkText(e.target.value)} />
          <label className="ghost-btn range-btn file-btn">Uploadez un CSV<input type="file" accept=".csv,text/csv" onChange={(e) => handleFile(e.target.files && e.target.files[0])} /></label>
        </div>
        <button className="primary-btn range-btn" onClick={handleBulk} disabled={bulkLoading || !bulkText.trim()}>{bulkLoading ? 'Import...' : 'Importer en masse'}</button>
        {bulkMsg && <p className="hint">{bulkMsg}</p>}
      </div>
      <div className="table-wrap emp-table">
        <table>
          <thead><tr><th>Nom</th><th>Email</th><th>Departement</th><th>Horaires</th><th></th></tr></thead>
          <tbody>
            {employees.length === 0 ? <tr><td className="empty" colSpan={5}>Aucun employe.</td></tr> : employees.map((e) => (
              <tr key={e.email}>
                <td><div className="person-cell"><PhotoAvatar name={e.name} email={e.email} photo={e.photo} /><span className="person-name">{e.name}</span></div></td>
                <td>{e.email}</td><td>{e.department || '\u2014'}</td>
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

function BiosSection({ employees, onBioUpdate }) {
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const list = query
    ? employees.filter((e) => [e.name, e.email, e.role, e.department, e.phone].filter(Boolean).join(' ').toLowerCase().includes(query))
    : employees;

  return (
    <CollapsibleCard title="Annuaire (bios)" count={employees.length + ' fiche' + (employees.length === 1 ? '' : 's')}>
      <p className="hint">Fiches du personnel avec photo, poste et coordonnees. Cliquez sur « Modifier » pour ajouter ou changer une photo.</p>
      <div className="table-tools">
        <div className="search-wrap">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="search" placeholder="Rechercher fiche..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {list.length === 0 ? (
        <p className="empty">Aucune fiche.</p>
      ) : (
        <div className="bio-grid">
          {list.map((e) => (
            <div className="bio-card" key={e.email}>
              {editing === e.email ? (
                <EmployeeBioEditor emp={e} onSave={(data) => onBioUpdate(data)} onCancel={() => setEditing(null)} />
              ) : (
                <>
                  <div className="bio-top">
                    <PhotoAvatar name={e.name} email={e.email} photo={e.photo} size={54} />
                    <div className="bio-id">
                      <div className="bio-name">{e.name || e.email}</div>
                      {e.role && <div className="bio-role">{e.role}</div>}
                    </div>
                  </div>
                  {e.department && <div className="bio-row"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg><span>{e.department}</span></div>}
                  {e.phone && <div className="bio-row"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.58 2.81.7A2 2 0 0 1 22 16.92z"/></svg><span>{e.phone}</span></div>}
                  {e.birth && <div className="bio-row"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><span>Nee le {e.birth}</span></div>}
                  <div className="bio-row"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg><span>{e.email}</span></div>
                  {e.shiftStart && <div className="bio-row"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span>{e.shiftStart} - {e.shiftEnd || '--:--'}</span></div>}
                  <div className="bio-actions">
                    <button className="ghost-btn sm" onClick={() => setEditing(e.email)}>Modifier</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </CollapsibleCard>
  );
}

function EmployeeBioEditor({ emp, onSave, onCancel }) {
  const [name, setName] = useState(emp.name || '');
  const [dept, setDept] = useState(emp.department || '');
  const [role, setRole] = useState(emp.role || '');
  const [phone, setPhone] = useState(emp.phone || '');
  const [birth, setBirth] = useState(emp.birth || '');
  const [photo, setPhoto] = useState(emp.photo || '');
  const [stillPhoto, setStillPhoto] = useState(emp.photo || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handlePhotoFile = async (file) => {
    if (!file) return;
    try { const data = await compressImage(file); setPhoto(data); setStillPhoto(''); }
    catch (e) { setErr(e.message); }
  };

  const submit = async () => {
    if (!name.trim()) { setErr('Le nom est requis.'); return; }
    setSaving(true); setErr('');
    await onSave({ email: emp.email, name: name.trim(), department: dept.trim(), role: role.trim(), phone: phone.trim(), birth: birth || '', photo: photo || stillPhoto });
    setSaving(false);
    onCancel();
  };

  return (
    <div className="bio-edit">
      <div className="bio-top">
        <PhotoAvatar name={name} email={emp.email} photo={photo || stillPhoto} size={54} />
        <div className="upload-controls">
          <label className="ghost-btn sm file-btn">Changer la photo<input type="file" accept="image/*" onChange={(e) => handlePhotoFile(e.target.files && e.target.files[0])} /></label>
          {photo && <button type="button" className="photo-clear" onClick={() => { setPhoto(''); setStillPhoto(''); }}>Retirer la photo</button>}
        </div>
      </div>
      <div className="edit-fields">
        <label className="range-field">Nom<input type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="range-field">Departement<input type="text" value={dept} onChange={(e) => setDept(e.target.value)} /></label>
        <label className="range-field">Poste<input type="text" value={role} onChange={(e) => setRole(e.target.value)} /></label>
        <label className="range-field">Telephone<input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
        <label className="range-field">Naissance<input type="date" value={birth} onChange={(e) => setBirth(e.target.value)} /></label>
      </div>
      {err && <p className="feedback error">{err}</p>}
      <div className="bio-actions">
        <button className="primary-btn sm" onClick={submit} disabled={saving}>{saving ? 'Enregistrement...' : 'Enregistrer'}</button>
        <button className="ghost-btn sm" onClick={onCancel} disabled={saving}>Annuler</button>
      </div>
    </div>
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
