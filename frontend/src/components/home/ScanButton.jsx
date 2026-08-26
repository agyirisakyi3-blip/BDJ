import { useApp } from '../../contexts/AppContext';

export default function ScanButton({ onScan }) {
  const { profile, status } = useApp();
  const act = status ? String(status.action || '') : '';
  const onBreakNow = act === 'Break-out';

  let label = 'Scanner QR pour pointer';
  if (onBreakNow) label = 'Scanner QR pour reprendre';
  else if (act === 'Check-in' || act === 'Break-in') label = 'Scanner QR pour la sortie';

  return (
    <button className="primary-btn big-btn" type="button" onClick={onScan}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="btn-icon" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
      <span className="btn-label">{label}</span>
    </button>
  );
}
