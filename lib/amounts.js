// Money is held as integer minor units (pence, cents) in the currency it moved in.
// Floats never touch a stored amount: 0.1 + 0.2 is not 0.3, and a ledger that is
// a penny out will not be trusted.

export const SYMBOL = { GBP: '£', EUR: '€', USD: '$' };

// "1.234,56", "1,234.56", "-55.99", "(12.00)", "£12" -> minor units, or null.
export function parseAmount(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[£€$\s ]|GBP|EUR/gi, '');
  if (s.endsWith('-')) { neg = !neg; s = s.slice(0, -1); }
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); } else if (s.startsWith('+')) s = s.slice(1);
  if (!/^[\d.,']+$/.test(s)) return null;
  s = s.replace(/'/g, '');
  const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
  const dec = Math.max(lastDot, lastComma);
  let whole = s, frac = '';
  // A separator followed by exactly 1 or 2 digits at the end is the decimal point.
  if (dec >= 0 && s.length - dec - 1 <= 2 && s.length - dec - 1 > 0) {
    whole = s.slice(0, dec); frac = s.slice(dec + 1);
  } else if (dec >= 0 && s.length - dec - 1 === 3 && lastDot >= 0 && lastComma >= 0) {
    return null; // "1.234,567" is not money
  }
  whole = whole.replace(/[.,]/g, '');
  if (!/^\d*$/.test(whole) || !/^\d*$/.test(frac)) return null;
  const v = Number(whole || '0') * 100 + Number((frac + '00').slice(0, 2));
  return neg ? -v : v;
}

export function fmt(minor, currency = 'GBP', { sign = false, plain = false } = {}) {
  if (minor == null || Number.isNaN(minor)) return '–';
  const neg = minor < 0, abs = Math.abs(Math.round(minor));
  const s = (Math.floor(abs / 100)).toLocaleString('en-GB') + '.' + String(abs % 100).padStart(2, '0');
  const sym = plain ? '' : (SYMBOL[currency] ?? currency + ' ');
  return (neg ? '−' : sign && minor > 0 ? '+' : '') + sym + s;
}

export const sum = (xs) => xs.reduce((a, b) => a + b, 0);
