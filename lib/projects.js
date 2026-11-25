// Home projects (Kitchen, Laundry, Dining room): what each is expected to cost
// against what has actually been paid.
//
// A project holds its plan as items, each with an estimate in pounds:
//   { id, name, note, started, done, items: [{ id, name, estimate, note }],
//     payments: [{ id, date, amount, currency, note, item_id }] }
// "payments" are costs paid outside the accounts brought in here (cash, a
// credit card, a builder paid from elsewhere). Everything else that counts as
// paid comes from bank lines, or parts of split lines, tagged with the project;
// a line can also name the item it paid for (item_id).
//
// Paid is converted to pounds at the rate on the day: what it cost then.
// Amounts are positive pence for money paid out; a refund is negative.
import { toGBP } from './fx.js';
import { parts } from './buckets.js';

export function projectLines(project, txns, fx = {}) {
  const out = [];
  for (const t of txns) {
    if (t.status === 'void' || t.transfer_id) continue;
    const ps = parts(t);
    ps.forEach((p, i) => {
      if (p.project_id !== project.id) return;
      const item = ps.length > 1 ? (t.splits?.[i]?.item_id ?? null) : (t.item_id ?? null);
      const gbp = toGBP(-p.amount, t.currency, { ...fx, mode: 'day', date: t.date });
      out.push({ source: 'bank', txn_id: t.id, part: ps.length > 1 ? i : null, date: t.date, payee: t.payee, note: t.splits?.[i]?.note || t.note || '',
        amount: -p.amount, currency: t.currency, gbp, item_id: item });
    });
  }
  for (const m of project.payments || []) {
    const gbp = toGBP(m.amount, m.currency || 'GBP', { ...fx, mode: 'day', date: m.date });
    out.push({ source: 'manual', id: m.id, date: m.date, payee: m.note || 'Paid elsewhere', note: m.note || '', amount: m.amount, currency: m.currency || 'GBP', gbp, item_id: m.item_id || null });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export function projectReport(project, txns, fx = {}) {
  const items = project.items || [];
  const lines = projectLines(project, txns, fx);
  const known = new Set(items.map((i) => i.id));
  const paidFor = (id) => lines.filter((l) => l.item_id === id).reduce((s, l) => s + (l.gbp || 0), 0);
  const rows = items.map((it) => {
    const paid = paidFor(it.id), est = it.estimate || 0;
    return { item: it, estimate: est, paid, left: est - paid, over: est > 0 && paid > est };
  });
  const unplanned = lines.filter((l) => !l.item_id || !known.has(l.item_id)).reduce((s, l) => s + (l.gbp || 0), 0);
  const fromItems = rows.reduce((s, r) => s + r.estimate, 0);
  // With no items yet, a single overall figure (the old "budget") stands in.
  const estimate = fromItems || project.budget || 0;
  const paid = lines.reduce((s, l) => s + (l.gbp || 0), 0);
  return {
    project, rows, lines, estimate, paid, unplanned,
    left: estimate - paid,
    share: estimate > 0 ? paid / estimate : null,
    state: !estimate ? 'none' : paid > estimate ? 'over' : 'ok',
    missingRate: lines.some((l) => l.gbp == null),
  };
}
