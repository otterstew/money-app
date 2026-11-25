// The numbers behind the dashboard. Each function takes the ledger and returns
// plain figures; nothing here draws.
import { toGBP } from './fx.js';
import { monthOf, daysInMonth, addMonths } from './dates.js';
import { parts, countsInHousehold } from './buckets.js';

// A balance is anchored to the last statement balance the bank gave (OFX
// LEDGERBAL, the CSV balance column) and moved by anything dated after it. With
// no anchor it is the opening balance plus everything.
export function accountBalance(account, txns) {
  const mine = txns.filter((t) => t.account_id === account.id && t.status !== 'void');
  const a = account.anchor;
  if (a && a.amount != null) return a.amount + mine.filter((t) => t.date > a.date).reduce((s, t) => s + t.amount, 0);
  return (account.opening || 0) + mine.reduce((s, t) => s + t.amount, 0);
}

export function balances(accounts, txns, fx) {
  const rows = accounts.filter((a) => !a.archived).map((a) => {
    const native = accountBalance(a, txns);
    return { account: a, native, gbp: toGBP(native, a.currency, fx) };
  });
  return { rows, totalGBP: rows.reduce((s, r) => s + (r.gbp || 0), 0), missingRate: rows.some((r) => r.gbp == null) };
}

// The accounts the buckets are paid from (household current and savings; not
// the gîtes' accounts, not the loan), and what they held before their first
// line here. That opening money is the first thing in Ready to assign.
export function budgetBase(accounts, txns, fx) {
  const mine = accounts.filter((a) => !a.archived && a.scope !== 'business' && a.kind !== 'loan');
  const opening = mine.reduce((s, a) => {
    const lines = txns.filter((t) => t.account_id === a.id && t.status !== 'void').reduce((x, t) => x + t.amount, 0);
    return s + (toGBP(accountBalance(a, txns) - lines, a.currency, fx) || 0);
  }, 0);
  return { opening, budgetAccounts: new Set(mine.map((a) => a.id)) };
}

// Household spending this month by whose it was. Joint can be shown whole or
// shared half each.
export function byOwner(txns, month, fx) {
  const out = { stewart: 0, trisha: 0, joint: 0 };
  for (const t of txns) {
    if (monthOf(t.date) !== month || !countsInHousehold(t) || t.amount >= 0) continue;
    for (const p of parts(t)) {
      if (p.amount >= 0) continue;
      const g = toGBP(-p.amount, t.currency, { ...fx, date: t.date });
      if (g != null) out[p.owner || 'joint'] += g;
    }
  }
  return out;
}

// Cumulative household spending by day, this month against last, for the
// "are we on pace" line.
export function pacing(txns, month, fx, incomeIds = new Set()) {
  const series = (m) => {
    const days = daysInMonth(m), daily = Array(days).fill(0);
    for (const t of txns) {
      if (monthOf(t.date) !== m || !countsInHousehold(t)) continue;
      for (const p of parts(t)) {
        if (p.amount >= 0 || incomeIds.has(p.bucket_id)) continue;
        const g = toGBP(-p.amount, t.currency, { ...fx, date: t.date });
        if (g != null) daily[+t.date.slice(8) - 1] += g;
      }
    }
    let run = 0; return daily.map((v) => (run += v));
  };
  return { month, current: series(month), previous: series(addMonths(month, -1)) };
}

export function spendByBucket(txns, month, fx) {
  const out = {};
  for (const t of txns) {
    if (monthOf(t.date) !== month || !countsInHousehold(t)) continue;
    for (const p of parts(t)) {
      if (p.amount >= 0) continue;
      const g = toGBP(-p.amount, t.currency, { ...fx, date: t.date });
      if (g != null) out[p.bucket_id || '_none'] = (out[p.bucket_id || '_none'] || 0) + g;
    }
  }
  return out;
}

// The French business: income and costs per month in euros (the figures that
// go to URSSAF and the accountant) with the pound value beside them.
export function businessByMonth(txns, year, fx) {
  const months = {};
  for (const t of txns) {
    if (t.scope !== 'business' || t.transfer_id || t.status === 'void' || !t.date.startsWith(String(year))) continue;
    const m = monthOf(t.date);
    const r = (months[m] ||= { month: m, in: 0, out: 0, inGBP: 0, outGBP: 0, currency: t.currency });
    const g = toGBP(t.amount, t.currency, { ...fx, date: t.date }) || 0;
    if (t.amount >= 0) { r.in += t.amount; r.inGBP += g; } else { r.out += t.amount; r.outGBP += g; }
  }
  return Object.values(months).sort((a, b) => a.month.localeCompare(b.month));
}

export function projectTotals(txns, projects, fx) {
  return projects.map((p) => {
    let spent = 0, count = 0;
    for (const t of txns) {
      if (t.status === 'void' || t.transfer_id) continue;
      for (const q of parts(t)) {
        if (q.project_id !== p.id) continue;
        const g = toGBP(q.amount, t.currency, { ...fx, date: t.date });
        if (g != null) { spent += g; count++; }
      }
    }
    return { project: p, spent, count };
  });
}
