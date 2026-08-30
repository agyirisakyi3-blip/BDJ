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
      { key: 'alertes', label: 'Alertes & anomalies', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M12 8v4 M12 16h.01' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { key: 'gestion', label: 'Gestion', icon: 'M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01z' },
      { key: 'qr', label: 'QR & acces', icon: 'M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z M7 7h3v3H7z M17 7h3v3h-3z M17 17h3v3h-3z M7 17h3v3H7z' },
    ],
  },
];

export default function AdminSidebar({ active, onSelect, open, onToggle, onLogout, adminEmail }) {
  const navigate = useNavigate();

  const renderIcon = (d) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {d.split(' ').map((path, i) => (
        <path key={i} d={path} />
      ))}
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
