import { useEffect, useState } from 'react';

export default function ScanSuccess({ show, action, time, name }) {
  const [visible, setVisible] = useState(false);
  const [fade, setFade] = useState(false);

  useEffect(() => {
    if (show) {
      setVisible(true);
      setFade(false);
      const t1 = setTimeout(() => setFade(true), 1200);
      const t2 = setTimeout(() => setVisible(false), 1700);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [show, action, time]);

  if (!visible) return null;

  const first = String(name || '').trim().split(/\s+/)[0] || '';
  let title;
  if (action === 'Check-in') title = first ? 'Bon retour, ' + first + '!' : 'Pointe';
  else if (action === 'Check-out') title = first ? 'Au revoir, ' + first + '!' : 'Sorti';
  else if (action === 'Break-out') title = 'Bonne pause !';
  else title = 'On reprend !';

  return (
    <div className={'scan-success' + (fade ? ' fade' : '')} role="status" aria-live="assertive">
      <div className="scan-success-inner">
        <span className="scan-success-check" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </span>
        <span className="scan-success-title">{title}</span>
        <span className="scan-success-time">{time || ''}</span>
      </div>
    </div>
  );
}
