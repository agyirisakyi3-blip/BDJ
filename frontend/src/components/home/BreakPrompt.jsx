import { useState, useEffect, useCallback, memo } from 'react';
import { useApp } from '../../contexts/AppContext';
import { todayStr } from '../../utils';

const LS_DISMISSED = 'att.breakPromptDismissed.v1';
const BREAK_START_HOUR = 11;
const BREAK_END_HOUR = 12;
const CHECK_INTERVAL_MS = 30_000;

function isBreakWindow() {
  const h = new Date().getHours();
  return h >= BREAK_START_HOUR && h < BREAK_END_HOUR;
}

function wasDismissedToday() {
  try {
    const val = localStorage.getItem(LS_DISMISSED);
    return val === todayStr();
  } catch { return false; }
}

function markDismissedToday() {
  try { localStorage.setItem(LS_DISMISSED, todayStr()); } catch {}
}

export default memo(function BreakPrompt({ onBreak }) {
  const { profile, status } = useApp();
  const [show, setShow] = useState(false);

  const act = status ? String(status.action || '') : '';
  const checkedIn = act === 'Check-in' || act === 'Break-in';
  const alreadyOnBreak = act === 'Break-out';

  const evaluate = useCallback(() => {
    if (!checkedIn || alreadyOnBreak || !isBreakWindow() || wasDismissedToday()) {
      setShow(false);
      return;
    }
    setShow(true);
  }, [checkedIn, alreadyOnBreak]);

  useEffect(() => {
    evaluate();
    const id = setInterval(evaluate, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [evaluate]);

  const handleStartBreak = () => {
    setShow(false);
    if (onBreak) onBreak('break');
  };

  const handleDismiss = () => {
    markDismissedToday();
    setShow(false);
  };

  if (!show || !profile) return null;

  const now = new Date();
  const minsLeft = BREAK_END_HOUR * 60 - (now.getHours() * 60 + now.getMinutes());

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Rappel de pause">
      <div className="modal-card card break-prompt-card">
        <div className="modal-head break-prompt-head">
          <span className="break-prompt-icon" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
              <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
              <line x1="6" y1="1" x2="6" y2="4"/>
              <line x1="10" y1="1" x2="10" y2="4"/>
              <line x1="14" y1="1" x2="14" y2="4"/>
            </svg>
          </span>
          <div>
            <h3>Heure de la pause</h3>
            <p className="muted">
              Il est {String(now.getHours()).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')}.
              {minsLeft > 0 && minsLeft <= 60
                ? ' Il vous reste environ ' + minsLeft + ' minutes avant la fin de la fenêtre de pause.'
                : ' Profitez de votre pause déjeuner.'}
            </p>
          </div>
        </div>
        <div className="confirm-actions break-prompt-actions">
          <button className="ghost-btn" type="button" onClick={handleDismiss}>
            Plus tard
          </button>
          <button className="primary-btn" type="button" onClick={handleStartBreak}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{width:16,height:16,marginRight:6}}>
              <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
              <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
            </svg>
            Prendre ma pause
          </button>
        </div>
      </div>
    </div>
  );
});
