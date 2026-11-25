// Who, what and why for each transaction.
//
// Three fields say whose money and what kind of spending it was:
//   owner: 'stewart' | 'trisha' | 'joint'
//   scope: 'household' | 'business' | 'holiday'
//     household — Jersey family spending, counted in the buckets.
//     business  — the French accounts' default: spending on the gîtes. Kept out
//                 of the household buckets; shown on the France page.
//     holiday   — French-account spending while the family is there on holiday.
//                 Counted as joint holiday spending, not a gîte cost.
//   bucket: the budget bucket (or, for business, the business category).
//
// Order of precedence: account defaults, then holiday dates, then the first rule
// that matches. Anything no rule settles waits in the review queue; a rule only
// files a transaction silently when it is marked "auto".
import { cleanPayee, payeeKey } from './payee.js';

export function inPeriod(date, periods) {
  return periods.find((p) => date >= p.start && date <= p.end) || null;
}

export function ruleMatches(rule, t) {
  const m = rule.match || {};
  if (m.account_id && m.account_id !== t.account_id) return false;
  if (m.direction === 'out' && t.amount >= 0) return false;
  if (m.direction === 'in' && t.amount < 0) return false;
  if (m.min != null && Math.abs(t.amount) < m.min) return false;
  if (m.max != null && Math.abs(t.amount) > m.max) return false;
  if (!m.value) return true;
  const hay = `${t.payee_raw || ''} ${t.payee || ''} ${t.memo || ''}`.toLowerCase();
  const v = String(m.value).toLowerCase();
  switch (m.op || 'contains') {
    case 'equals': return (t.payee || '').toLowerCase() === v;
    case 'starts': return (t.payee || '').toLowerCase().startsWith(v) || (t.payee_raw || '').toLowerCase().startsWith(v);
    case 'regex': try { return new RegExp(m.value, 'i').test(hay); } catch { return false; }
    case 'key': return payeeKey(t.payee_raw || t.payee) === v;
    default: return hay.includes(v);
  }
}

// Fill in a freshly imported transaction. Never overrides a field a person set
// (t.locked lists those), so re-running rules is safe.
export function classify(t, { account, holidays = [], rules = [] }) {
  const locked = new Set(t.locked || []);
  const set = (k, v) => { if (!locked.has(k) && v !== undefined && v !== null && v !== '') t[k] = v; };
  if (!t.payee) t.payee = cleanPayee(t.payee_raw);
  set('owner', account?.owner || 'joint');
  let scope = account?.scope === 'business' ? 'business' : 'household';
  // A holiday can name the accounts spent from on that trip (the card account),
  // so the gîtes' bills and booking income on the other account stay business.
  const mine = holidays.filter((h) => !h.account_ids?.length || h.account_ids.includes(t.account_id));
  const hol = scope === 'business' ? inPeriod(t.date, mine) : null;
  if (hol) scope = 'holiday';
  set('scope', scope);
  let auto = false, ruleId = null;
  const ordered = [...rules].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  for (const r of ordered) {
    if (r.disabled || !ruleMatches(r, t)) continue;
    const s = r.set || {};
    set('bucket_id', s.bucket_id); set('owner', s.owner); set('project_id', s.project_id); set('payee', s.payee);
    // A rule can say "business" but holiday dates still win: that is the whole
    // point of the holiday list. A rule saying holiday or household is explicit.
    if (s.scope && !(hol && s.scope === 'business')) set('scope', s.scope);
    auto = !!r.auto; ruleId = r.id; break;
  }
  t.rule_id = ruleId;
  if (!locked.has('status')) t.status = auto && t.bucket_id && !hol ? 'done' : 'review';
  if (hol && t.scope === 'holiday' && !t.flag) t.flag = `In holiday dates (${hol.label || hol.start + ' to ' + hol.end}): check it was holiday spending, not the gîtes.`;
  return t;
}

// When a person files a transaction in review and ticks "always", this is the
// rule it becomes: same cleaned payee, same account kind of money direction.
export function ruleFromTransaction(t, { auto = true } = {}) {
  const key = payeeKey(t.payee_raw || t.payee);
  return {
    id: null,
    name: `${t.payee} → ${t.bucket_id ? 'bucket' : 'owner'}`,
    match: { op: 'key', value: key, direction: t.amount < 0 ? 'out' : 'in' },
    set: { bucket_id: t.bucket_id || null, owner: t.owner, scope: t.scope === 'holiday' ? undefined : t.scope, project_id: t.project_id || undefined },
    auto, priority: 100,
  };
}
