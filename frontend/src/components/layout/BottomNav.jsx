import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../../contexts/AppContext';

export default function BottomNav({ onShowHistory, onShowHelp }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin } = useApp();
  const isAdminView = location.pathname === '/admin';

  return (
    <nav className="bottom-nav" role="navigation" aria-label="Navigation principale">
      <button
        className={'nav-item' + (!isAdminView ? ' active' : '')}
        type="button"
        onClick={() => {
          if (isAdminView) navigate('/');
          else window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        <span>Accueil</span>
      </button>
      <button
        className="nav-item"
        type="button"
        onClick={() => onShowHistory && onShowHistory()}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span>Historique</span>
      </button>
      <button
        className={'nav-item' + (isAdminView ? ' active' : '') + (!isAdmin ? ' hidden' : '')}
        type="button"
        onClick={() => navigate('/admin')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
        <span>Admin</span>
      </button>
      <button
        className="nav-item"
        type="button"
        onClick={() => onShowHelp && onShowHelp()}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span>Aide</span>
      </button>
    </nav>
  );
}
