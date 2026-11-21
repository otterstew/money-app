// Dates are calendar days, 'YYYY-MM-DD' strings, never instants: a payment on
// 19 Nov is on 19 Nov wherever the browser is.

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  janv: 1, févr: 2, fevr: 2, mars: 3, avr: 4, mai: 5, juin: 6, juil: 7, août: 8, aout: 8, sept: 9, déc: 12 };

const pad = (n) => String(n).padStart(2, '0');
export const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

function valid(y, m, d) {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2200)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 ? iso(y, m, d) : null;
}

// order: 'dmy' (UK, France) or 'mdy' (US). Banks here are all day-first.
export function parseDate(raw, order = 'dmy') {
  if (raw == null) return null;
  const s = String(raw).trim();
  let m;
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})/))) return valid(+m[1], +m[2], +m[3]);         // OFX yyyymmdd, with or without a time
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return valid(+m[1], +m[2], +m[3]);   // ISO
  if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-'](\d{2,4})$/))) {
    let y = +m[3]; if (y < 100) y += 2000;
    const [a, b] = [+m[1], +m[2]];
    return order === 'mdy' ? valid(y, a, b) : valid(y, b, a);
  }
  if ((m = s.match(/^(\d{1,2})[\s\-]+([A-Za-zéû]+)\.?[\s\-]+(\d{2,4})$/))) {               // 19 Nov 2026, 19-Nov-26
    const mo = MONTHS[m[2].toLowerCase().slice(0, 4)] ?? MONTHS[m[2].toLowerCase().slice(0, 3)];
    let y = +m[3]; if (y < 100) y += 2000;
    return mo ? valid(y, mo, +m[1]) : null;
  }
  return null;
}

// Which order fits every date in a column? Any first part over 12 settles it.
export function guessOrder(samples) {
  let dmy = false, mdy = false;
  for (const s of samples) {
    const m = String(s).trim().match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-'](\d{2,4})$/);
    if (!m) continue;
    if (+m[1] > 12) dmy = true;
    if (+m[2] > 12) mdy = true;
  }
  return mdy && !dmy ? 'mdy' : 'dmy';
}

export const monthOf = (d) => d.slice(0, 7);
export function addDays(d, n) {
  const dt = new Date(d + 'T00:00:00Z'); dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
export const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
export function addMonths(month, n) {
  let [y, m] = month.split('-').map(Number); m += n;
  while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; }
  return `${y}-${pad(m)}`;
}
export const daysInMonth = (month) => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
export function todayISO(now = new Date()) { return iso(now.getFullYear(), now.getMonth() + 1, now.getDate()); }
export function longDate(d) {
  const [y, m, dd] = d.split('-').map(Number);
  return `${dd} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1]} ${y}`;
}
export function monthName(month) {
  const [y, m] = month.split('-').map(Number);
  return ['January','February','March','April','May','June','July','August','September','October','November','December'][m - 1] + ' ' + y;
}
