import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../../contexts/AppContext';
import { avatarHue, avatarInitials, fmtHours, todayStr } from '../../utils';

const RING_CIRC = 2 * Math.PI * 35;
const WORKDAY_HOURS = 8;

export default function StatusCard() {
  const { profile, status, week } = useApp();
  const [elapsed, setElapsed] = useState('0h 0m 0s');
  const intervalRef = useRef(null);

  const act = status ? String(status.action || '') : '';
  const onBreakNow = act === 'Break-out';
  const checkedIn = act === 'Check-in' || act === 'Break-in' || onBreakNow;
  const isCheckedOut = status && !checkedIn;

  const computeStreak = useCallback(() => {
    const map = {};
    (week || []).forEach((d) => { map[d.date] = d.hours || 0; });
    const today = todayStr();
    if (!(map[today] > 0) && !(map[today.replace(/(\d{4}-\d{2}-)\d{2}/, (_, p) => {
      const d = new Date(); d.setDate(d.getDate() - 1);
      return p + String(d.getDate()).padStart(2, '0');
    })] > 0)) return 0;
    let cursor = map[today] > 0 ? 0 : -1;
    let streak = 0;
    while (streak < 7) {
      const d = new Date();
      d.setDate(d.getDate() + cursor - streak);
      const ds = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      if (map[ds] > 0) streak++;
      else break;
    }
    return streak;
  }, [week]);

  useEffect(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (!checkedIn || !status || !status.time) return;

    const parts = String(status.checkinTime || status.time).split(':');
    const checkInSec = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2] || 0);

    const tick = () => {
      const now = new Date();
      const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
      const diff = Math.max(0, nowSec - checkInSec);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setElapsed(h + 'h ' + m + 'm ' + s + 's');
    };
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => clearInterval(intervalRef.current);
  }, [checkedIn, status]);

  const seed = profile ? (profile.name || profile.email || '?') : '?';
  const avatarClass = 'status-avatar' + (checkedIn ? ' in' : isCheckedOut ? ' out' : '');
  const avatarStyle = {};
  if (!checkedIn && profile) {
    const hue = avatarHue(seed);
    avatarStyle.background = `linear-gradient(135deg, hsl(${hue}, 48%, 40%), hsl(${(hue + 40) % 360}, 52%, 28%))`;
  }

  let label, sub, time, avatarText;
  if (!profile) {
    avatarText = '?'; label = 'Bienvenue'; sub = 'Definissez votre nom et email pour commencer.';
    time = '--:--';
  } else if (onBreakNow) {
    avatarText = 'PAUSE'; label = 'En pause';
    sub = 'Profitez de votre pause. Scannez le QR (ou appuyez sur Reprendre) pour reprendre.';
    time = status.time;
  } else if (act === 'Check-in' || act === 'Break-in') {
    avatarText = 'ENTREE'; label = 'Pointe';
    sub = status.office ? 'A ' + status.office + '. Passez une bonne journee.' : 'Passez une bonne journee au bureau.';
    time = status.time;
  } else if (isCheckedOut) {
    avatarText = 'SORTIE'; label = 'Sorti';
    sub = status.office ? 'De ' + status.office + '. Vous pouvez pointer a nouveau plus tard.' : 'Vous pouvez pointer a nouveau plus tard aujourd\'hui.';
    time = status.time;
  } else {
    avatarText = 'SORTIE'; label = 'Non pointe';
    sub = 'Scannez le QR du bureau a l\'entree.';
    time = '--:--';
  }

  const ringFraction = checkedIn ? 0.5 : 0;

  return (
    <div className={'card status-card' + (checkedIn ? ' checked-in' : '')}>
      <div className={'status-avatar-ring' + (ringFraction > 0 ? ' on' : '')} id="avatar-ring">
        <svg className="ring-svg" viewBox="0 0 76 76" aria-hidden="true">
          <circle className="ring-track" cx="38" cy="38" r="35"/>
          <circle className="ring-fill" cx="38" cy="38" r="35"
            style={{ strokeDashoffset: RING_CIRC * (1 - ringFraction) }}/>
        </svg>
        <div className={avatarClass} style={avatarStyle}>{avatarText}</div>
      </div>
      <div className="status-info">
        <div className="status-label-row">
          <div className="status-label">{label}</div>
          {computeStreak() >= 2 && (
            <span className="streak-badge" title="Jours de presence consecutifs">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/></svg>
              <span>{computeStreak()}</span>&nbsp;j
            </span>
          )}
        </div>
        <div className="status-sub">{sub}</div>
      </div>
      <div className="status-clock">
        <span className="status-time">{time}</span>
        <span className="status-dot" aria-hidden="true"></span>
        {checkedIn && (
          <div className="elapsed-wrap">
            <span className="elapsed-label">Duree</span>
            <span className="elapsed-timer">{elapsed}</span>
          </div>
        )}
      </div>
    </div>
  );
}
