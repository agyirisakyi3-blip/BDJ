export function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + day;
}

export function shiftDateStr(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + day;
}

export function parseQr(text) {
  const idx = String(text).indexOf('|');
  if (idx === -1) return { tenant: '', token: String(text).trim() };
  return {
    tenant: String(text).slice(0, idx).trim(),
    token: String(text).slice(idx + 1).trim(),
  };
}

const FMT_MONTHS = ['Jan','Fev','Mar','Avr','Mai','Jun','Jul','Aou','Sep','Oct','Nov','Dec'];
const FMT_DAYS = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];

export function fmtDateLabel(d) {
  return FMT_DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + FMT_MONTHS[d.getMonth()] + ' ' + d.getFullYear();
}

const DAY_ABBR = ['Di','Lu','Ma','Me','Je','Ve','Sa'];

export function dayLabel(dateStr) {
  const p = dateStr.split('-');
  const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  return DAY_ABBR[d.getDay()];
}

export function fmtHours(h) {
  if (h === null || h === undefined || isNaN(h)) return '\u2014';
  const total = Math.round(h * 60);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return hours + 'h ' + mins + 'm';
}

export function timeToMinutes(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function cmpVals(a, b) {
  const an = typeof a === 'number' && !isNaN(a);
  const bn = typeof b === 'number' && !isNaN(b);
  if (an && bn) return a < b ? -1 : a > b ? 1 : 0;
  return String(a == null ? '' : a).localeCompare(String(b == null ? '' : b));
}

const AVATAR_HUES = [258, 160, 199, 24, 340, 42, 120, 286];

export function avatarHue(emailOrName) {
  let h = 0;
  const s = String(emailOrName || '?');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_HUES[h % AVATAR_HUES.length];
}

export function avatarInitials(name, email) {
  const src = String(name || email || '?').trim();
  const parts = src.split(/[\s._@-]+/).filter(Boolean);
  let initials = '';
  if (parts.length >= 2) initials = parts[0].charAt(0) + parts[1].charAt(0);
  else if (parts.length === 1) initials = parts[0].slice(0, 2);
  return initials.toUpperCase();
}
