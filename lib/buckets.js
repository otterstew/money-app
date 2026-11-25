// Buckets, YNAB-style: income lands in "Ready to assign", each month you give
// pounds to buckets, spending takes them out, and whatever is left carries
// into next month. An overspend is taken from Ready to assign the month after.
//
// Everything here is in pounds. Euro spending is converted with the chosen mode
// (fx.js). Only household and holiday spending counts: business spending on the
// gîtes has its own page and must not eat the family's grocery money.
import { toGBP } from './fx.js';
import { monthOf, addMonths } from './dates.js';

// The pieces of a transaction that land in buckets. A split transaction (one
// Romerils receipt across Kitchen and Repairs) counts each part separately.
export function parts(t) {
  if (Array.isArray(t.splits) && t.splits.length) {
    return t.splits.map((s) => ({ bucket_id: s.bucket_id, amount: s.amount, owner: s.owner || t.owner, project_id: s.project_id ?? t.project_id }));
  }
  return [{ bucket_id: t.bucket_id, amount: t.amount, owner: t.owner, project_id: t.project_id }];
}

export const countsInHousehold = (t) => !t.transfer_id && t.status !== 'void' && (t.scope === 'household' || t.scope === 'holiday');

export function monthActivity(txns, buckets, month, fxOpts) {
  const kind = Object.fromEntries(buckets.map((b) => [b.id, b.kind]));
  const spend = {}; let income = 0, unbucketed = 0;
  for (const t of txns) {
    if (monthOf(t.date) !== month || !countsInHousehold(t)) continue;
    for (const p of parts(t)) {
      const gbp = toGBP(p.amount, t.currency, { ...fxOpts, date: t.date });
      if (gbp == null) continue;
      if (p.bucket_id && kind[p.bucket_id] === 'income') income += gbp;
      else if (p.bucket_id) spend[p.bucket_id] = (spend[p.bucket_id] || 0) + gbp;
      else if (gbp < 0) unbucketed += gbp;   // spending still waiting for a bucket
    }
  }
  return { spend, income, unbucketed };
}

// allocations: [{ month, bucket_id, amount }] in pence.
// budgetAccounts (a Set of account ids) and opening (pence) bring in what YNAB
// counts besides income: the money already in the family's accounts when the
// ledger starts, and money moving between them and an account outside the
// budget (the gîtes' CMB accounts, the loan). Without these a year brought in
// after the fact reads as spending far more than came in (25 Nov 2026).
export function budgetMonth({ txns, buckets, allocations, month, fx, opening = 0, budgetAccounts = null }) {
  const legs = {};
  if (budgetAccounts) for (const t of txns) if (t.transfer_id && t.status !== 'void') (legs[t.transfer_id] ||= []).push(t.account_id);
  const crossing = (m) => budgetAccounts ? txns.reduce((s, t) => {
    if (!t.transfer_id || t.status === 'void' || monthOf(t.date) !== m || !budgetAccounts.has(t.account_id)) return s;
    if (!legs[t.transfer_id].some((id) => !budgetAccounts.has(id))) return s;   // between two of ours, or one-sided
    return s + (toGBP(t.amount, t.currency, { ...fx, date: t.date }) || 0);
  }, 0) : 0;
  const first = [
    ...txns.map((t) => monthOf(t.date)),
    ...allocations.map((a) => a.month),
  ].sort()[0] || month;
  const spendBuckets = buckets.filter((b) => b.kind !== 'income' && !b.archived);
  const carry = Object.fromEntries(spendBuckets.map((b) => [b.id, 0]));
  // Overspending, as YNAB does it: a bucket shows it in red in the month it
  // happens, then starts the next month at nil, and the overspend comes out of
  // Ready to assign instead. Carrying it in the bucket (as this did until
  // 25 Nov 2026) left Mortgage at −£12,030 after a year of paid mortgages.
  let incomeToDate = opening, assignedToDate = 0, overspentBefore = 0, rows = [], last = null;
  for (let m = first < month ? first : month; m <= month; m = addMonths(m, 1)) {
    if (rows.length) overspentBefore += rows.reduce((s, r) => s + Math.max(0, -r.available), 0);
    const act = monthActivity(txns, buckets, m, fx);
    incomeToDate += act.income + crossing(m);
    rows = spendBuckets.map((b) => {
      const assigned = allocations.filter((a) => a.month === m && a.bucket_id === b.id).reduce((s, a) => s + a.amount, 0);
      const activity = act.spend[b.id] || 0;           // negative for spending
      const carried = carry[b.id];
      const available = carried + assigned + activity;
      return { bucket: b, assigned, activity, carried, available };
    });
    rows.forEach((r) => { carry[r.bucket.id] = r.bucket.rollover === false ? 0 : Math.max(0, r.available); assignedToDate += r.assigned; });
    last = act;
  }
  const readyToAssign = incomeToDate - assignedToDate - overspentBefore;
  return {
    month, rows, readyToAssign,
    income: last?.income || 0,
    unbucketed: last?.unbucketed || 0,
    spent: rows.reduce((s, r) => s + Math.min(0, r.activity), 0),
    assigned: rows.reduce((s, r) => s + r.assigned, 0),
    overspent: rows.filter((r) => r.available < 0),
  };
}

// Status colour for a bucket row, as YNAB does: funded, under target, overspent.
export function bucketState(r) {
  if (r.available < 0) return 'over';
  if (r.bucket.target && r.assigned + r.carried < r.bucket.target) return 'under';
  if (r.available === 0 && r.activity === 0 && r.assigned === 0) return 'empty';
  return 'ok';
}
