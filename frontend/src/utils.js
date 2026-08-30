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

/**
 * Open a printable window with an HTML table and invoke the browser's
 * print dialog (user can "Save as PDF"). Falls back to a modal-less alert
 * if popups are blocked. Returns nothing.
 */
export function printReportPDF(title, period, columns, rows) {
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const head = columns.map((c) => '<th>' + esc(c) + '</th>').join('');
  const body = rows.map((r) => '<tr>' + r.map((cell) => '<td>' + esc(cell) + '</td>').join('') + '</tr>').join('');
  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title>' +
    '<style>body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;margin:24px}' +
    '.h{display:flex;justify-content:space-between;border-bottom:2px solid #333;padding-bottom:8px;margin-bottom:16px}' +
    '.h h1{font-size:18px;margin:0}.h p{margin:0;color:#555;font-size:13px}' +
    'table{width:100%;border-collapse:collapse;font-size:12px}' +
    'th{background:#f1f3f5;text-align:left;padding:7px 8px;border-bottom:2px solid #ccc;font-size:11px;text-transform:uppercase;letter-spacing:.3px}' +
    'td{padding:6px 8px;border-bottom:1px solid #e5e7eb}' +
    'tr:nth-child(even) td{background:#fafafa}' +
    '.f{margin-top:12px;color:#777;font-size:11px}@media print{.no-print{display:none}}</style></head><body>' +
    '<div class="h"><div><h1>' + esc(title) + '</h1><p>' + esc(period) + '</p></div></div>' +
    '<table><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table>' +
    '<p class="f">Genere le ' + new Date().toLocaleString() + ' \u00b7 ' + esc(title) + '</p>' +
    '<button class="no-print" onclick="window.print()">Imprimer / Enregistrer en PDF</button>' +
    '<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>';
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) { alert('Autorisez les fenetres pop-up pour exporter en PDF.'); return; }
  w.document.write(html);
  w.document.close();
}

/**
 * Read an image File, center-crop it to a square, downscale it and return a
 * small JPEG data URL (default ~160px) ready to store per employee.
 * Rejects non-image files and files that fail to decode.
 */
export function compressImage(file, size = 160) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(new Error('Fichier image invalide.')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const side = Math.min(img.width, img.height);
        const sw = (img.width - side) / 2;
        const sh = (img.height - side) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, sw, sh, side, side, 0, 0, size, size);
        let data = canvas.toDataURL('image/jpeg', 0.82);
        if (data.length > 55000) data = canvas.toDataURL('image/jpeg', 0.6);
        URL.revokeObjectURL(url);
        resolve(data);
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Impossible de lire cette image.')); };
    img.src = url;
  });
}
