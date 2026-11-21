// Money moving between your own accounts is neither spending nor income. Left
// alone, a £500 move from the joint account to Trisha's reads as £500 spent and
// £500 earned. Pairs are matched on opposite amounts within a few days; across
// currencies (NatWest → CMB) the sterling values must agree within 3%, because
// the bank's rate is never quite the reference rate.
import { toGBP } from './fx.js';
import { daysBetween } from './dates.js';

export function findTransferPairs(txns, { rates, windowDays = 4, tolerance = 0.03 } = {}) {
  const open = txns.filter((t) => !t.transfer_id && t.status !== 'void');
  const outs = open.filter((t) => t.amount < 0), ins = open.filter((t) => t.amount > 0);
  const used = new Set(), pairs = [];
  const sorted = [...outs].sort((a, b) => a.date.localeCompare(b.date));
  for (const o of sorted) {
    let best = null, bestScore = Infinity;
    for (const i of ins) {
      if (used.has(i.id) || i.account_id === o.account_id) continue;
      const gap = Math.abs(daysBetween(o.date, i.date));
      if (gap > windowDays) continue;
      let diff;
      if (o.currency === i.currency) diff = Math.abs(i.amount + o.amount) === 0 ? 0 : Infinity;
      else {
        const a = toGBP(-o.amount, o.currency, { rates, mode: 'day', date: o.date });
        const b = toGBP(i.amount, i.currency, { rates, mode: 'day', date: i.date });
        if (a == null || b == null) continue;
        diff = Math.abs(a - b) / Math.max(a, b);
        if (diff > tolerance) continue;
      }
      if (diff === Infinity) continue;
      const score = diff * 100 + gap;
      if (score < bestScore) { best = i; bestScore = score; }
    }
    if (best) { used.add(best.id); pairs.push([o, best]); }
  }
  return pairs;
}
