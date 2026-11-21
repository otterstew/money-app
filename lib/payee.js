// Bank descriptions are noisy: "CARTE 12/10 LECLERC QUIMPER", "PRLV ORANGE SA",
// "VIR Tobias Priemuth", "TESCO STORES 3456 ST HELIER GB". A clean payee name is
// what people read and what rules match on, so the noise comes off here.

const PREFIXES = [
  /^(carte|cb)\s+(x?\d{4}\s+)?\d{2}\/\d{2}(\/\d{2,4})?\s+/i,   // CMB card: CARTE 12/10 ...
  /^(prlv|prelevement|prélèvement)\s+(sepa\s+)?/i,               // direct debit
  /^(vir|virement)\s+((sepa|inst|instantane|recu|émis|emis)\s+)*(vir\s+)?/i, // transfer
  /^(ret|retrait)\s+(dab\s+)?\d{2}\/\d{2}\s+/i,                  // cash withdrawal
  /^(pos|dd|so|bp|tfr|fpo|fpi|bac|chq|d\/d|s\/o|cpt|dpc|vis|debit card|card payment( to)?)\s+/i, // UK codes
];

export function cleanPayee(raw) {
  let s = String(raw || '').replace(/\s+/g, ' ').trim();
  for (const re of PREFIXES) s = s.replace(re, '');
  s = s
    .replace(/,?\s*\d+(\.\d+)?\s*(gbp|eur)\b.*$/i, '')            // ", 12.00 GBP" foreign-currency tails
    .replace(/\b(on|le)\s+\d{1,2}[\/\s]\w{2,3}([\/\s]\d{2,4})?\b.*$/i, '')
    .replace(/\s+\d{4,}\s*$/, '')                                  // trailing reference numbers
    .replace(/\s+(gb|gbr|je|jey|fr|fra)$/i, '')
    .replace(/\*+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) s = String(raw || '').trim();
  return titleCase(s);
}

function titleCase(s) {
  // Leave mixed-case names alone; shouting names get title case.
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s\-\/&(.'])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase())
    .replace(/\b(Sa|Sas|Sarl|Ltd|Plc|Uk|Gb|Edf|Sncf|Urssaf|Dgfip|Bp|Tv|Ee)\b/g, (w) => w.toUpperCase());
}

// The key a rule learns from: lower case, letters only, first three words.
export function payeeKey(raw) {
  return cleanPayee(raw).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1).slice(0, 3).join(' ');
}

export function similarity(a, b) {
  const A = new Set(payeeKey(a).split(' ').filter(Boolean)), B = new Set(payeeKey(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let n = 0; for (const w of A) if (B.has(w) || [...B].some((x) => x.startsWith(w) || w.startsWith(x))) n++;
  return n / Math.min(A.size, B.size);
}
