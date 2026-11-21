// OFX / QFX statements. Banks send two shapes:
//  - OFX 2.x: XML, every tag closed (CMB / Crédit Mutuel de Bretagne does this).
//  - OFX 1.x: SGML, leaf tags left open ("<TRNAMT>-12.00" then a newline).
// Rather than an XML parser that chokes on the second, read leaf values with a
// pattern that stops at the next "<" either way.
import { parseAmount } from './amounts.js';
import { parseDate } from './dates.js';

const leaf = (block, tag) => {
  const m = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'));
  return m ? decode(m[1].trim()) : null;
};
const blocks = (text, tag) => {
  const out = []; const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'gi'); let m;
  while ((m = re.exec(text))) out.push(m[1]);
  return out;
};
// SGML files often leave STMTTRN closed but nothing else; if a file never closes
// STMTTRN, split on the opening tags instead.
const trnBlocks = (text) => {
  const closed = blocks(text, 'STMTTRN');
  if (closed.length) return closed;
  return text.split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/BANKTRANLIST>/i)[0]);
};
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&quot;/g, '"');

export function isOFX(text) { return /<OFX>/i.test(text) || /OFXHEADER/i.test(text); }

// Returns one statement per account in the file (a file can hold several).
export function parseOFX(text) {
  const statements = [];
  const stmtBlocks = [...blocks(text, 'STMTRS').map((b) => ['bank', b]), ...blocks(text, 'CCSTMTRS').map((b) => ['card', b])];
  // An SGML file that never closes STMTRS: treat the whole file as one statement.
  if (!stmtBlocks.length) stmtBlocks.push([/<CCACCTFROM>/i.test(text) ? 'card' : 'bank', text]);
  for (const [kind, b] of stmtBlocks) {
    const currency = (leaf(b, 'CURDEF') || 'GBP').toUpperCase();
    const acctFrom = blocks(b, kind === 'card' ? 'CCACCTFROM' : 'BANKACCTFROM')[0] || b;
    const account = {
      kind,
      bankId: leaf(acctFrom, 'BANKID'),
      branchId: leaf(acctFrom, 'BRANCHID'),
      accountId: leaf(acctFrom, 'ACCTID'),
      accountType: leaf(acctFrom, 'ACCTTYPE'),
      currency,
    };
    const txns = [];
    for (const t of trnBlocks(b)) {
      const amount = parseAmount(leaf(t, 'TRNAMT'));
      const date = parseDate(leaf(t, 'DTPOSTED') || leaf(t, 'DTUSER'));
      if (amount == null || !date) continue;
      const name = leaf(t, 'NAME') || leaf(t, 'PAYEE') || '';
      const memo = leaf(t, 'MEMO') || '';
      txns.push({
        date, amount, currency,
        fitid: leaf(t, 'FITID'),
        type: leaf(t, 'TRNTYPE'),
        payee: name || memo,
        memo: name ? memo : '',
        checkNum: leaf(t, 'CHECKNUM'),
      });
    }
    const ledger = blocks(b, 'LEDGERBAL')[0];
    let balance = ledger ? { amount: parseAmount(leaf(ledger, 'BALAMT')), date: parseDate(leaf(ledger, 'DTASOF')) } : null;
    // CMB's exports always say 0.00 here, whatever the account holds. A busy
    // account sitting at exactly zero is rarer than a bank leaving the field
    // blank, so a zero is treated as "not given"; the real balance can be set
    // by hand in Settings.
    if (balance && (balance.amount == null || (balance.amount === 0 && txns.length))) balance = null;
    statements.push({
      account, txns,
      start: parseDate(leaf(b, 'DTSTART')), end: parseDate(leaf(b, 'DTEND')),
      balance,
    });
  }
  return statements;
}
