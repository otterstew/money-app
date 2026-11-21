// CSV statements. Every bank lays these out differently, so the columns are
// found by their headings. NatWest International's export:
//   Date, Type, Description, Value, Balance, Account Name, Account Number
// Others split money into Paid in / Paid out, or Debit / Credit.
import { parseAmount } from './amounts.js';
import { parseDate, guessOrder } from './dates.js';

export function splitCSV(text) {
  const rows = []; let row = [], field = '', q = false;
  const t = text.replace(/^﻿/, '');
  const delim = sniffDelimiter(t);
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field); if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}
function sniffDelimiter(t) {
  const first = t.split(/\r?\n/).slice(0, 5).join('\n');
  const n = (ch) => (first.match(new RegExp('\\' + ch, 'g')) || []).length;
  return n(';') > n(',') ? ';' : n('\t') > n(',') ? '\t' : ',';
}

const H = {
  date: /^(transaction |posted |posting |value )?date$|^date (de )?op|^date$/i,
  desc: /description|narrative|details|payee|merchant|libell|memo|reference|name/i,
  amount: /^(amount|value|montant|transaction amount)( \(?(gbp|eur|£|€)\)?)?$/i,
  debit: /debit|paid out|money out|withdrawal|d[ée]bit/i,
  credit: /credit|paid in|money in|deposit|cr[ée]dit/i,
  balance: /balance|solde/i,
  type: /^type$|transaction type/i,
  account: /account (number|no)|acct/i,
  currency: /^currency$|devise/i,
};

export function detectColumns(header) {
  const find = (re, skip = []) => header.findIndex((h, i) => !skip.includes(i) && re.test(h.trim()));
  const date = find(H.date);
  const amount = find(H.amount);
  const debit = amount < 0 ? find(H.debit) : -1;
  const credit = amount < 0 ? find(H.credit) : -1;
  const balance = find(H.balance);
  const desc = find(H.desc, [date, amount, debit, credit, balance].filter((i) => i >= 0));
  return { date, desc, amount, debit, credit, balance, type: find(H.type), account: find(H.account), currency: find(H.currency) };
}

export function looksLikeCSV(text) {
  const rows = splitCSV(text.split(/\r?\n/).slice(0, 12).join('\n'));
  return rows.length > 0 && rows.some((r) => r.length >= 3);
}

export function parseCSV(text, { currency = 'GBP', columns, order } = {}) {
  const rows = splitCSV(text);
  // Some exports put a title or account line above the header: find the first
  // row that has a date column and something to read money from.
  let hi = -1, cols = columns;
  if (!cols) {
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const c = detectColumns(rows[i]);
      if (c.date >= 0 && (c.amount >= 0 || c.debit >= 0 || c.credit >= 0)) { hi = i; cols = c; break; }
    }
    if (!cols) throw new Error('Could not find the date and amount columns. Check the file has a heading row.');
  }
  const body = rows.slice(hi + 1);
  const ord = order || guessOrder(body.map((r) => r[cols.date]));
  const txns = []; let lastBalance = null, accountNo = null;
  for (const r of body) {
    const date = parseDate(r[cols.date], ord);
    if (!date) continue;
    let amount = null;
    if (cols.amount >= 0) amount = parseAmount(r[cols.amount]);
    else {
      const d = cols.debit >= 0 ? parseAmount(r[cols.debit]) : null;
      const c = cols.credit >= 0 ? parseAmount(r[cols.credit]) : null;
      if (d == null && c == null) continue;
      amount = (c ? Math.abs(c) : 0) - (d ? Math.abs(d) : 0);
    }
    if (amount == null) continue;
    const payee = (cols.desc >= 0 ? r[cols.desc] : '').replace(/\s+/g, ' ').trim();
    const bal = cols.balance >= 0 ? parseAmount(r[cols.balance]) : null;
    if (cols.account >= 0 && r[cols.account]) accountNo = r[cols.account].replace(/[^\d\-]/g, '');
    const cur = cols.currency >= 0 && r[cols.currency] ? r[cols.currency].trim().toUpperCase() : currency;
    txns.push({ date, amount, currency: cur, fitid: null, payee, memo: cols.type >= 0 ? r[cols.type] : '', balanceAfter: bal });
    if (bal != null) lastBalance = { amount: bal, date };
  }
  // Statements list newest first or oldest first; the balance that counts is the
  // one on the latest date.
  const withBal = txns.filter((t) => t.balanceAfter != null);
  if (withBal.length) {
    const asc = withBal[0].date <= withBal[withBal.length - 1].date;
    const latest = asc ? withBal[withBal.length - 1] : withBal[0];
    lastBalance = { amount: latest.balanceAfter, date: latest.date };
  }
  return [{ account: { kind: 'bank', accountId: accountNo, currency }, txns, balance: lastBalance }];
}
