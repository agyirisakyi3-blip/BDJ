import { useNavigate } from 'react-router-dom';

const NAV_GROUPS = [
  {
    label: 'Vue generale',
    items: [
      { key: 'dashboard', label: 'Tableau de bord', icon: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z' },
      { key: 'effectif', label: 'Effectif', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75 M16 3.13a4 4 0 0 1 0 7.75' },
      { key: 'annuaire', label: 'Annuaire (bios)', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
    ],
  },
  {
    label: 'Activite',
    items: [
      { key: 'rapport', label: 'Rapport', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8' },
      { key: 'paie', label: 'Paie', icon: 'M17 15.5a2.5 2.5 0 0 0 2.5 2.5h2a2.5 2.5 0 0 0 0-5h-3a2.5 2.5 0 0 1 0-5h3a2.5 2.5 0 0 1 2.5 2.5 M12 3v18' },
      { key: 'departements', label: 'Departements', icon: 'M3 21h18 M5 21V5a2 2 0 0 0-2-2h2a2 2 0 0 1 2 2v16 M9 21V9a2 2 0 0 0-2-2h2a2 2 0 0 1 2 2v12 M13 21V13a2 2 0 0 0-2-2h2a2 2 0 0 1 2 2v8 M17 21v-6a2 2 0 0 0-2-2h2a2 2 0 0 1 2 2v6' },
      { key: 'assiduite', label: 'Assiduite', icon: 'M12 2v4 M4.93 4.93l2.83 2.83 M2 12h4 M4.93 19.07l2.83-2.83 M12 22v-4 M19.07 19.07l-2.83-2.83 M22 12h-4 M19.07 4.93l-2.83 2.83 M12 6a6 6 0 0 1 0 12' },
      { key: 'alertes', label: 'Alertes & anomalies', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M12 8v4 M12 16h.01' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { key: 'gestion', label: 'Gestion', icon: 'M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01z' },
      { key: 'qr', label: 'QR & acces', icon: 'M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z M7 7h3v3H7z M17 7h3v3h-3z M17 17h3v3h-3z M7 17h3v3H7z' },
      { key: 'annonces', label: 'Annonces', icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
    ],
  },
  {
    label: 'Support',
    items: [
      { key: 'aide', label: 'Aide', icon: 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3 M12 17h.01' },
    ],
  },
];

export default function AdminSidebar({ active, onSelect, open, onToggle, onLogout, adminEmail, themeMode, onToggleTheme }) {
  const navigate = useNavigate();

  const renderIcon = (d) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );

  return (
    <>
      {/* Mobile overlay */}
      {open && <div className="sidebar-overlay" onClick={onToggle} aria-hidden="true" />}

      <aside className={'admin-sidebar' + (open ? ' open' : '')} aria-label="Navigation administrateur">
        <div className="sidebar-head">
          <span className="brand-mark brand-logo" aria-hidden="true">
            <img src="/icons/icon-192.png" alt="Logo" />
          </span>
          <div className="sidebar-brand-text">
            <span className="sidebar-kicker">Console admin</span>
            <strong>Espace Admin</strong>
          </div>
          <button className="sidebar-close" type="button" onClick={onToggle} aria-label="Fermer le menu">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <nav className="sidebar-nav">
          {NAV_GROUPS.map((group) => (
            <div className="sidebar-group" key={group.label}>
              <p className="sidebar-group-label">{group.label}</p>
              {group.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={'sidebar-item' + (active === item.key ? ' active' : '')}
                  onClick={() => { onSelect(item.key); onToggle(false); }}
                >
                  <span className="sidebar-item-icon">{renderIcon(item.icon)}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          {adminEmail && <p className="sidebar-admin">Connecte : {adminEmail}</p>}
          <button type="button" className="sidebar-foot-btn" onClick={onToggleTheme} title={'Theme : ' + (themeMode === 'auto' ? 'automatique' : themeMode === 'light' ? 'clair' : 'sombre')}>
            {themeMode === 'light' ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            ) : themeMode === 'dark' ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor" stroke="none"/></svg>
            )}
            <span>{themeMode === 'auto' ? 'Theme automatique' : themeMode === 'light' ? 'Mode clair' : 'Mode sombre'}</span>
          </button>
          <button type="button" className="sidebar-foot-btn" onClick={onLogout}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            <span>Se deconnecter</span>
          </button>
          <button type="button" className="sidebar-foot-btn" onClick={() => navigate('/')}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            <span>Retour a l'accueil</span>
          </button>
        </div>
      </aside>
    </>
  );
}
