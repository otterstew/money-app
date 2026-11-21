// Sterling is home. Euro amounts are stored in euros and only converted for
// display, so every French line can be checked against the CMB statement and
// the URSSAF figures in its original currency.
//
// rates: { 'YYYY-MM-DD': { EUR: 0.8634, ... } } — pounds per one unit.
// mode:  'today' — every amount at the latest rate (the household view: "what
//                  is it all worth in pounds now").
//        'day'   — each amount at the rate on its own date (what it cost then).

export function latestRate(rates, currency) {
  const days = Object.keys(rates || {}).filter((d) => rates[d]?.[currency] != null).sort();
  return days.length ? { date: days[days.length - 1], rate: rates[days[days.length - 1]][currency] } : null;
}

export function rateOn(rates, currency, date) {
  const days = Object.keys(rates || {}).filter((d) => rates[d]?.[currency] != null).sort();
  if (!days.length) return null;
  // The rate on that day, else the last one before it (weekends, holidays),
  // else the first one after it.
  let pick = null;
  for (const d of days) { if (d <= date) pick = d; else break; }
  pick ??= days[0];
  return { date: pick, rate: rates[pick][currency] };
}

export function toGBP(minor, currency, { rates, mode = 'today', date } = {}) {
  if (minor == null) return null;
  if (!currency || currency === 'GBP') return minor;
  const r = mode === 'day' && date ? rateOn(rates, currency, date) : latestRate(rates, currency);
  if (!r) return null; // unknown: callers show the original only
  return Math.round(minor * r.rate);
}

// Frankfurter (ECB reference rates, free, no key). Returns a rates object.
export async function fetchRates({ currencies = ['EUR'], from, fetchImpl = fetch } = {}) {
  const out = {};
  for (const c of currencies) {
    const url = from
      ? `https://api.frankfurter.dev/v1/${from}..?base=${c}&symbols=GBP`
      : `https://api.frankfurter.dev/v1/latest?base=${c}&symbols=GBP`;
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`Exchange rates unavailable (${res.status})`);
    const j = await res.json();
    if (j.rates?.GBP != null) (out[j.date] ??= {})[c] = j.rates.GBP;
    else for (const [d, v] of Object.entries(j.rates || {})) (out[d] ??= {})[c] = v.GBP;
  }
  return out;
}

export function mergeRates(a, b) {
  const out = { ...(a || {}) };
  for (const [d, v] of Object.entries(b || {})) out[d] = { ...(out[d] || {}), ...v };
  return out;
}
