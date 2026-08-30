import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { useApp } from '../../contexts/AppContext';
import { timeToMinutes } from '../../utils';

function fmtClock(hhmm) {
  const m = timeToMinutes(hhmm);
  if (m < 0) return hhmm || '--:--';
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h + 'h' + String(mm).padStart(2, '0');
}

function scheduledMinutes(start, end) {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s < 0 || e < 0) return 0;
  let d = e - s;
  if (d <= 0) d += 24 * 60;
  return d;
}

function fmtDur(min) {
  const sign = min < 0 ? '-' : '';
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = Math.round(abs % 60);
  const hh = h > 0 ? h + 'h ' : '';
  return sign + hh + m + 'm';
}

export default memo(function ScheduleCard() {
  const { shift, status } = useApp();
  const [now, setNow] = useState(() => Date.now());
  const intervalRef = useRef(null);

  const hasShift = !!(shift && (shift.start || shift.end));

  const act = status ? String(status.action || '') : '';
  const checkedIn = act === 'Check-in' || act === 'Break-in' || act === 'Break-out';

  const overtime = useMemo(() => {
    if (!hasShift || !checkedIn || !status || !status.checkinTime || !shift.end) return null;
    const sched = scheduledMinutes(shift.start, shift.end);
    if (!sched) return null;
    const checkInMin = timeToMinutes(status.checkinTime);
    const nowDate = new Date(now);
    const nowMin = nowDate.getHours() * 60 + nowDate.getMinutes() + nowDate.getSeconds() / 60;
    if (checkInMin < 0) return null;
    const workedMin = nowMin - checkInMin;
    if (workedMin < 0) return null;
    const breakMin = Number(status.breakMinToday || 0);
    const netMin = workedMin - breakMin;
    const overMin = netMin - sched;
    if (nowMin < checkInMin) return null;
    return Math.round(overMin);
  }, [shift, status, checkedIn, hasShift, now]);

  useEffect(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (!hasShift || !checkedIn) return;
    intervalRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [hasShift, checkedIn]);

  if (!hasShift) return null;

  const sched = scheduledMinutes(shift.start, shift.end);
  const active = overtime !== null && overtime > 0;

  return (
    <div className="card schedule-card">
      <div className="schedule-head">
        <span className="schedule-title">Mon planning</span>
        {overtime !== null && (
          <span className={'ot-chip' + (active ? ' on' : '')} title="Heures au-dela du creneau prevu">
            <span className="ot-dot" aria-hidden="true"></span>
            {active ? 'Heures sup. ' + fmtDur(overtime) : 'En heures sup?'}
          </span>
        )}
      </div>
      <div className="schedule-row">
        <div className="schedule-box">
          <span className="schedule-box-label">Entree</span>
          <span className="schedule-box-val">{fmtClock(shift.start)}</span>
        </div>
        <svg className="schedule-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        <div className="schedule-box">
          <span className="schedule-box-label">Sortie</span>
          <span className="schedule-box-val">{fmtClock(shift.end)}</span>
        </div>
        {sched > 0 && (
          <div className="schedule-box">
            <span className="schedule-box-label">Duree</span>
            <span className="schedule-box-val">{fmtDur(sched)}</span>
          </div>
        )}
      </div>
    </div>
  );
});
