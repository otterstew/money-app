// QIF, the Quicken Interchange Format. One field per line, the first letter is
// the field (D date, T/U amount, P payee, M memo, N number), "^" ends a record.
// QIF has no transaction ids, so duplicates are caught by content (dedupe.js).
// Dates are ambiguous: UK and French banks write day first, so that is the
// default unless a date in the file can only be month first.
import { parseAmount } from './amounts.js';
import { parseDate, guessOrder } from './dates.js';

export function isQIF(text) { return /^\s*!(Type|Account|Option)/im.test(text); }

export function parseQIF(text, { currency = 'GBP', order } = {}) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const records = []; let cur = {}; let type = 'Bank';
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) continue;
    if (line.startsWith('!')) { const m = line.match(/^!Type:(\w+)/i); if (m) type = m[1]; continue; }
    if (line === '^') { if (Object.keys(cur).length) records.push(cur); cur = {}; continue; }
    const k = line[0], v = line.slice(1).trim();
    if (k === 'D') cur.d = v;
    else if (k === 'T' || (k === 'U' && cur.t == null)) cur.t = v;
    else if (k === 'P') cur.p = v;
    else if (k === 'M') cur.m = v;
    else if (k === 'N') cur.n = v;
  }
  if (Object.keys(cur).length) records.push(cur);
  const ord = order || guessOrder(records.map((r) => r.d));
  const txns = [];
  for (const r of records) {
    const date = parseDate(r.d, ord), amount = parseAmount(r.t);
    if (!date || amount == null) continue;
    txns.push({ date, amount, currency, fitid: null, payee: r.p || r.m || '', memo: r.p ? (r.m || '') : '', checkNum: r.n || null });
  }
  return [{ account: { kind: /ccard/i.test(type) ? 'card' : 'bank', accountId: null, currency }, txns, balance: null }];
}
