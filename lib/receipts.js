// Receipts. A receipt is the detail behind one bank line: the £526.44 to
// Romerils was 17 lines of Polyplumb, all for the kitchen. Matching it to the
// bank line lets the line be split across buckets and projects, and keeps the
// paper trail for returns and tax.
//
// Receipt lines are often ex-tax (Jersey GST is 5%), so the tax is spread over
// the lines in proportion, and any penny left from rounding goes to the biggest
// line, so the parts always add up to the bank amount exactly.
import { daysBetween } from './dates.js';
import { similarity } from './payee.js';

export function matchReceipt(receipt, txns, { windowDays = 6 } = {}) {
  const target = -Math.abs(receipt.total);
  return txns
    .filter((t) => t.currency === receipt.currency && t.amount === target && Math.abs(daysBetween(receipt.date, t.date)) <= windowDays && !t.receipt_id)
    .map((t) => ({ t, score: similarity(receipt.merchant, t.payee_raw || t.payee) * 2 - Math.abs(daysBetween(receipt.date, t.date)) * 0.1 }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.t);
}

// Group receipt lines by bucket+project+owner and scale them to the bank amount.
export function splitsFromReceipt(receipt, txnAmount) {
  const groups = new Map();
  for (const l of receipt.lines) {
    const k = `${l.bucket_id || ''}|${l.project_id || ''}|${l.owner || ''}`;
    const g = groups.get(k) || { bucket_id: l.bucket_id || null, project_id: l.project_id || null, owner: l.owner || null, base: 0, items: [] };
    g.base += l.amount; g.items.push(l.description); groups.set(k, g);
  }
  const list = [...groups.values()];
  const base = list.reduce((s, g) => s + g.base, 0) || 1;
  let allotted = 0;
  const out = list.map((g) => {
    const amount = Math.round((g.base / base) * txnAmount);
    allotted += amount;
    return { bucket_id: g.bucket_id, project_id: g.project_id, owner: g.owner, amount, note: g.items.slice(0, 3).join(', ') + (g.items.length > 3 ? ` and ${g.items.length - 3} more` : '') };
  });
  if (out.length) {
    const biggest = out.reduce((a, b) => (Math.abs(b.amount) > Math.abs(a.amount) ? b : a));
    biggest.amount += txnAmount - allotted;
  }
  return out;
}

export function receiptCheck(receipt) {
  const lines = receipt.lines.reduce((s, l) => s + l.amount, 0);
  const expected = lines + (receipt.tax || 0);
  return { lines, tax: receipt.tax || 0, expected, total: receipt.total, ok: Math.abs(expected - receipt.total) <= 1 };
}
