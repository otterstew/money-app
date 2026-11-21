// From a downloaded statement file to new ledger rows.
//
// 1. Work out the format (OFX/QFX, QIF, CSV) from the content, not the name.
// 2. Match each statement in the file to an account (by account number, else
//    the one the person picked).
// 3. Drop rows already in the ledger. OFX carries the bank's own id (FITID);
//    QIF and CSV don't, so the key is account + date + amount + payee + how many
//    identical rows came before it in the same file. Two genuine £4.50 coffees
//    on the same day survive; the same statement imported twice does not.
// 4. Classify (rules.js) and return the rows for the person to confirm.
import { isOFX, parseOFX } from './ofx.js';
import { isQIF, parseQIF } from './qif.js';
import { parseCSV } from './csv.js';
import { classify } from './rules.js';
import { cleanPayee, payeeKey } from './payee.js';

export function detectFormat(text, filename = '') {
  if (isOFX(text)) return 'ofx';
  if (isQIF(text)) return 'qif';
  if (/\.(ofx|qfx)$/i.test(filename)) return 'ofx';
  if (/\.qif$/i.test(filename)) return 'qif';
  return 'csv';
}

export function parseStatement(text, { filename = '', currency = 'GBP' } = {}) {
  const format = detectFormat(text, filename);
  const statements = format === 'ofx' ? parseOFX(text) : format === 'qif' ? parseQIF(text, { currency }) : parseCSV(text, { currency });
  return { format, statements };
}

// Last 4 of an account number is what people recognise, and all we store.
export const maskAccount = (id) => (id ? '••' + String(id).replace(/\W/g, '').slice(-4) : null);

export function matchAccount(stmt, accounts) {
  const tail = stmt.account.accountId ? String(stmt.account.accountId).replace(/\W/g, '').slice(-4) : null;
  if (tail) {
    const hit = accounts.find((a) => a.number_tail === tail && (!a.currency || a.currency === stmt.account.currency));
    if (hit) return hit;
  }
  return null;
}

export function dedupeKey(accountId, t, n) {
  if (t.fitid) return `${accountId}|f|${t.fitid}`;
  return `${accountId}|h|${t.date}|${t.amount}|${payeeKey(t.payee)}|${n}`;
}

// existingKeys: Set of dedupe keys already in the ledger.
export function prepareImport(stmt, { account, existingKeys, holidays = [], rules = [], importId, newId }) {
  const seen = new Map(), fresh = [], dupes = [];
  for (const t of stmt.txns) {
    const base = `${t.date}|${t.amount}|${payeeKey(t.payee)}`;
    const n = seen.get(base) || 0; seen.set(base, n + 1);
    const key = dedupeKey(account.id, t, n);
    if (existingKeys.has(key)) { dupes.push(t); continue; }
    existingKeys.add(key);
    const row = {
      id: newId(), account_id: account.id, import_id: importId, dedupe_key: key,
      date: t.date, amount: t.amount, currency: account.currency || t.currency,
      payee_raw: t.payee, payee: cleanPayee(t.payee), memo: t.memo || '', fitid: t.fitid || null,
      bucket_id: null, owner: null, scope: null, project_id: null, status: 'review', splits: null,
      transfer_id: null, receipt_id: null, note: '', flag: null, locked: [],
    };
    fresh.push(classify(row, { account, holidays, rules }));
  }
  return { fresh, dupes };
}
