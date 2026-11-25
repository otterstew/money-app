// Money — the page. Pure logic lives in lib/ and is tested there; this file
// draws views and turns taps into ledger changes.
import { fmt, parseAmount, SYMBOL } from './lib/amounts.js';
import { todayISO, monthOf, addMonths, monthName, longDate, daysInMonth } from './lib/dates.js';
import { toGBP, latestRate, fetchRates, mergeRates } from './lib/fx.js';
import { parseStatement, prepareImport, matchAccount, maskAccount } from './lib/importer.js';
import { classify, ruleFromTransaction } from './lib/rules.js';
import { findTransferPairs } from './lib/transfers.js';
import { budgetMonth, bucketState } from './lib/buckets.js';
import { matchReceipt, splitsFromReceipt, receiptCheck } from './lib/receipts.js';
import { balances, byOwner, pacing, spendByBucket, businessByMonth, budgetBase, heldForOthers, spendingSplit } from './lib/summary.js';
import { projectReport } from './lib/projects.js';
import { PEOPLE, SCOPES } from './lib/seed.js';
import * as store from './lib/store.js';

let L, WHERE = 'device';
const ui = { view: 'overview', month: monthOf(todayISO()), q: '', acc: '', who: '', scope: '', bucket: '', reviewOnly: false, year: new Date().getFullYear(), pending: [] };
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const fxo = () => ({ rates: L.settings.rates, mode: L.settings.fxMode });
const acct = (id) => L.accounts.find((a) => a.id === id);
const bucket = (id) => L.buckets.find((b) => b.id === id);
const person = (id) => PEOPLE.find((p) => p.id === id) || PEOPLE[2];

// ---------- icons: one set, 1.75 stroke ----------
const P = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  review: 'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9',
  budget: 'M4 7h16M4 12h16M4 17h10M18 15v6M15 18h6',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  upload: 'M12 16V4M7 9l5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3',
  receipt: 'M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4',
  france: 'M4 21V4M4 4h10l-1 4h7l-2 7h-9l1-4H4',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  close: 'M6 6l12 12M18 6 6 18', left: 'M15 18l-6-6 6-6', right: 'M9 18l6-6-6-6',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01', warn: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  check: 'M20 6 9 17l-5-5', plus: 'M12 5v14M5 12h14', trash: 'M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15',
  tool: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[n]}"/></svg>`;

// ---------- money display: original first, sterling beneath ----------
function amt(minor, currency = 'GBP', date, { sign = false, cls = '' } = {}) {
  const show = L.settings.show;
  const gbp = currency === 'GBP' ? null : toGBP(minor, currency, { ...fxo(), date });
  const o = fmt(minor, currency, { sign }), g = gbp == null ? null : fmt(gbp, 'GBP', { sign });
  const tone = minor > 0 ? 't-pos' : '';
  if (currency === 'GBP') return `<span class="t-amt ${cls}"><span class="t-orig ${tone}">${o}</span></span>`;
  if (show === 'gbp' && g) return `<span class="t-amt ${cls}" title="${o}"><span class="t-orig ${tone}">${g}</span><span class="t-gbp">${o}</span></span>`;
  if (show === 'orig' || !g) return `<span class="t-amt ${cls}" title="${g ? '≈ ' + g : 'No exchange rate yet'}"><span class="t-orig ${tone}">${o}</span></span>`;
  return `<span class="t-amt ${cls}"><span class="t-orig ${tone}">${o}</span><span class="t-gbp">≈ ${g}</span></span>`;
}
const gbpStr = (minor, opts) => fmt(minor, 'GBP', opts);
const who = (id) => { const p = person(id); return `<span class="t-who" data-who="${p.id}"><i>${p.short}</i>${p.name}</span>`; };
const scopeTag = (s) => s === 'business' ? '<span class="t-tag">Gîte business</span>' : s === 'holiday' ? '<span class="t-tag t-warn">France holiday</span>' : '';

// ---------- persistence ----------
async function commit(changes, msg, undo) {
  try { WHERE = await store.save(L, changes); }
  catch (e) { toast('Saved on this device; the server did not answer.'); console.error(e); }
  if (msg) toast(msg, undo);
  render();
}

// ---------- navigation ----------
const VIEWS = [
  ['overview', 'Overview', 'home'], ['review', 'To review', 'review'], ['budget', 'Buckets', 'budget'], ['txns', 'Transactions', 'list'],
  ['import', 'Import', 'upload'], ['receipts', 'Receipts', 'receipt'], ['projects', 'Projects', 'tool'], ['france', 'France', 'france'], ['settings', 'Settings', 'settings'],
];
const PHONE = ['overview', 'review', 'budget', 'txns', 'more'];
function nav() {
  const n = L.txns.filter((t) => t.status === 'review').length;
  const badge = (id) => (id === 'review' && n ? `<span class="t-badge" aria-label="${n} to review">${n > 99 ? '99+' : n}</span>` : '');
  $('#rail').innerHTML = `<div class="t-brand">Money</div>` + VIEWS.map(([id, l, i]) => `<a href="#${id}" ${ui.view === id ? 'aria-current="page"' : ''}>${icon(i)}${l}${badge(id)}</a>`).join('');
  const moreOn = ['import', 'receipts', 'projects', 'france', 'settings', 'more'].includes(ui.view);
  $('#tabs').innerHTML = PHONE.map((id) => {
    const v = VIEWS.find((x) => x[0] === id) || ['more', 'More', 'more'];
    const cur = id === 'more' ? moreOn : ui.view === id;
    return `<a class="t-tab" href="#${id}" ${cur ? 'aria-current="page"' : ''}>${icon(v[2])}${id === 'review' ? 'Review' : id === 'txns' ? 'Spending' : id === 'budget' ? 'Buckets' : v[1]}${badge(id)}</a>`;
  }).join('');
}
window.addEventListener('hashchange', () => { ui.view = location.hash.slice(1) || 'overview'; render(); $('#main').focus({ preventScroll: true }); window.scrollTo(0, 0); });

function render() {
  nav();
  const v = { overview, review, budget, txns, import: importView, receipts, projects, france, settings, more }[ui.view] || overview;
  $('#main').innerHTML = v();
  after[ui.view]?.();
}
const after = {};

function appbar(title, extra = '') { return `<header class="t-appbar"><h1>${title}</h1>${extra}</header>`; }
function monthNav() {
  return `<div class="m-month"><button class="t-icon-btn" data-act="month" data-d="-1" aria-label="Previous month">${icon('left')}</button><strong>${monthName(ui.month)}</strong><button class="t-icon-btn" data-act="month" data-d="1" aria-label="Next month">${icon('right')}</button></div>`;
}
function showSeg() {
  const s = L.settings.show;
  return `<div class="t-seg" role="group" aria-label="Show amounts">${[['both', 'Both'], ['orig', 'Original'], ['gbp', 'Sterling']].map(([k, l]) => `<button data-act="show" data-v="${k}" aria-pressed="${s === k}">${l}</button>`).join('')}</div>`;
}

// ---------- overview ----------
function overview() {
  if (!L.txns.length) return appbar('Overview') + `<section class="t-panel t-empty"><h3>Nothing here yet</h3><p>Download a statement from NatWest International or CMB (OFX, QIF or CSV) and bring it in.</p><div class="t-actions"><a class="t-btn t-btn-primary" href="#import">${icon('upload')}Import a statement</a></div></section>`;
  const fx = fxo();
  const b = budgetMonth({ txns: L.txns, buckets: L.buckets, allocations: L.allocations, month: ui.month, fx, ...budgetBase(L.accounts, L.txns, fx) });
  const bal = balances(L.accounts, L.txns, fx);
  const owners = byOwner(L.txns, ui.month, fx);
  const toReview = L.txns.filter((t) => t.status === 'review');
  const rate = latestRate(L.settings.rates, 'EUR');
  const flagged = b.rows.filter((r) => ['over', 'under'].includes(bucketState(r))).sort((a, c) => a.available - c.available).slice(0, 6);
  const proj = L.projects.filter((p) => !p.done).map((p) => projectReport(p, L.txns, fxo()));
  const fr = businessByMonth(L.txns, ui.month.slice(0, 4), { ...fx, mode: 'day' });
  const frIn = fr.reduce((s, r) => s + r.in, 0), frOut = fr.reduce((s, r) => s + r.out, 0);
  // The two banks side by side (Stewart, 25 Nov 2026): sterling at NatWest, and
  // the French accounts in pounds so the two can be read together.
  const gbpAcc = bal.rows.filter((r) => r.account.currency === 'GBP'), eurAcc = bal.rows.filter((r) => r.account.currency !== 'GBP');
  const sum = (rs, k) => rs.reduce((s, r) => s + (r[k] || 0), 0);
  const eurUnset = eurAcc.filter((r) => !r.account.anchor).length;
  // Sterling: our own cash (Stewart, 25 Nov 2026). The loan is left out (it is
  // being paid off) and so is money held for someone else.
  const gbpCash = gbpAcc.filter((r) => r.account.kind !== 'loan');
  const held = heldForOthers(new Set(gbpCash.map((r) => r.account.id)), L.txns, L.buckets);
  // Where the month's money went (Stewart, 25 Nov 2026): Jersey living and
  // holidays make the headline; renovations and the gîtes sit beside them.
  const split = spendingSplit(L.txns, L.buckets, ui.month, fx), mon = monthName(ui.month).split(' ')[0];
  const part = (label, v, note, href, link) => `<div class="t-stat"><span class="t-small t-muted">${label}</span><span class="t-value">${gbpStr(v)}</span><span class="t-xs t-faint">${note}</span>${href ? `<a class="t-xs" href="${href}">${link}</a>` : ''}</div>`;
  const joint = L.settings.jointView === 'half';
  const ow = joint ? { stewart: owners.stewart + owners.joint / 2, trisha: owners.trisha + owners.joint / 2 } : owners;
  const owMax = Math.max(1, ...Object.values(ow));
  return appbar('Overview', monthNav()) + `
  ${toReview.length ? `<a class="t-notice t-warn" href="#review" style="text-decoration:none;margin-bottom:var(--s4)">${icon('review')}<span><strong>${toReview.length} transaction${toReview.length === 1 ? '' : 's'} to review.</strong> Check the bucket and whose it was, and they count in the totals properly.</span></a>` : ''}
  <div class="t-grid t-3">
    <section class="t-panel t-hero"><span class="t-label">Ready to assign</span><span class="t-value ${b.readyToAssign < 0 ? 't-over' : ''}">${gbpStr(b.readyToAssign)}</span><span class="t-sub">${b.readyToAssign < 0 ? 'More given to buckets or overspent than has come in.' : 'NatWest money not yet given to a bucket.'} The French accounts count only once money moves to NatWest.</span></section>
    <section class="t-panel t-hero"><span class="t-label">Spent in ${mon}</span><span class="t-value">${gbpStr(split.jersey + split.holiday)}</span><span class="t-sub">Jersey living and holidays. Renovations and the gîtes are split out below.${b.unbucketed ? ` ${gbpStr(-b.unbucketed)} has no bucket yet.` : ''}</span></section>
    <section class="t-panel t-hero"><span class="t-label">All accounts in pounds</span><span class="t-value">${gbpStr(sum(gbpCash, 'native') - held + sum(eurAcc, 'gbp'))}</span><span class="t-sub">Sterling and French together, on the same terms. ${rate ? `€1 = £${rate.rate.toFixed(4)}, ${L.settings.fxMode === 'today' ? 'today’s rate' : 'rate on each day'} (${longDate(rate.date)}).` : 'No euro rate yet: euro accounts left out.'}</span></section>
  </div>
  <div class="t-grid t-2 m-top-gap">
    <section class="t-panel t-hero"><span class="t-label">Sterling accounts</span><span class="t-value">${gbpStr(sum(gbpCash, 'native') - held)}</span><span class="t-sub">NatWest, ${gbpCash.length} account${gbpCash.length === 1 ? '' : 's'}${held > 0 ? `, less ${gbpStr(held)} held for our daughter` : ''}. The loan isn’t counted.</span></section>
    <section class="t-panel t-hero"><span class="t-label">French accounts in pounds</span><span class="t-value">${gbpStr(sum(eurAcc, 'gbp'))}</span><span class="t-sub">${eurAcc.length ? `CMB, ${fmt(sum(eurAcc, 'native'), 'EUR')} at the same rate. Not in Ready to assign until it moves to NatWest.` : 'No French accounts yet.'}${eurUnset ? ` <a href="#settings">${eurUnset === 1 ? 'One balance is' : `${eurUnset} balances are`} not set yet</a>, so this is only the lines brought in.` : ''}</span></section>
  </div>
  <section class="t-panel m-top-gap"><div class="t-panel-head"><h2>Where ${mon}’s money went</h2><span class="t-small t-muted">In pounds, refunds taken off</span></div>
    <div class="m-split4">
      ${part('Jersey living', split.jersey, 'Bills, food, the car, the children and everyday spending.', '#budget', 'Buckets')}
      ${part('Holidays', split.holiday, 'Trips away, and spending in France on holiday dates.', '', '')}
      ${part('Renovations', split.renovations, 'Work on the house, by project.', '#projects', 'Projects')}
      ${part('Gîte business', split.business, 'Costs of the gîtes, from either bank.', '#france', 'France')}
    </div></section>
  <div class="t-grid t-2 m-top-gap">
    <section class="t-panel"><div class="t-panel-head"><h2>Spending pace</h2><span class="t-small t-muted">${monthName(ui.month).split(' ')[0]} against ${monthName(addMonths(ui.month, -1)).split(' ')[0]}</span></div><div class="m-chartbox" id="pace"></div></section>
    <section class="t-panel"><div class="t-panel-head"><h2>Whose spending</h2><div class="t-seg" role="group" aria-label="Joint spending"><button data-act="joint" data-v="whole" aria-pressed="${!joint}">Joint apart</button><button data-act="joint" data-v="half" aria-pressed="${joint}">Joint halved</button></div></div>
      ${Object.entries(ow).map(([k, v]) => `<div class="t-bar-row">${who(k)}<span class="t-num">${gbpStr(v)}</span><div class="t-bar"><span style="width:${(v / owMax) * 100}%;background:var(--${k})"></span></div></div>`).join('')}
      <p class="t-xs t-faint">Household and holiday spending this month. Gîte business costs are on the France page.</p></section>
  </div>
  <div class="t-grid t-2 m-top-gap">
    <section class="t-panel"><div class="t-panel-head"><h2>Buckets to look at</h2><a class="t-btn t-btn-quiet t-btn-sm" href="#budget">All buckets</a></div>
      ${flagged.length ? `<ul class="t-list">${flagged.map((r) => `<li class="t-row"><div><div class="t-main-line">${esc(r.bucket.name)}</div><div class="t-meta">${bucketState(r) === 'over' ? 'Overspent' : 'Under its target'} · spent ${gbpStr(-r.activity)}</div></div><span class="t-avail" data-state="${bucketState(r)}">${gbpStr(r.available)}</span></li>`).join('')}</ul>` : '<p class="t-muted t-small">Every bucket is funded. Nothing overspent.</p>'}</section>
    <section class="t-panel"><div class="t-panel-head"><h2>Accounts</h2>${showSeg()}</div>
      <ul class="t-list">${bal.rows.map((r) => `<li class="t-row"><div><div class="t-main-line">${esc(r.account.name)}</div><div class="t-meta">${esc(r.account.bank || '')} ${r.account.number_tail ? '••' + esc(r.account.number_tail) : ''} · ${who(r.account.owner)} ${scopeTag(r.account.scope)} ${r.account.anchor ? '' : '<a class="t-tag t-warn" href="#settings" title="The bank file gave no balance. Enter it once in Settings and it stays right.">Balance not set</a>'}</div></div>${amt(r.native, r.account.currency)}</li>`).join('')}</ul></section>
  </div>
  <div class="t-grid t-2 m-top-gap">
    <section class="t-panel"><div class="t-panel-head"><h2>Gîtes this year</h2><a class="t-btn t-btn-quiet t-btn-sm" href="#france">France</a></div>
      <div class="m-split"><div class="t-stat"><span class="t-small t-muted">Money in</span>${amt(frIn, 'EUR', null, { cls: 't-value' })}</div><div class="t-stat"><span class="t-small t-muted">Costs</span>${amt(frOut, 'EUR')}</div><div class="t-stat"><span class="t-small t-muted">Net</span>${amt(frIn + frOut, 'EUR')}</div></div>
      <p class="t-xs t-faint m-top-gap">In euros as the bank shows them; pounds at the rate on each day.</p></section>
    <section class="t-panel"><div class="t-panel-head"><h2>Projects</h2><a class="t-btn t-btn-quiet t-btn-sm" href="#projects">All projects</a></div>
      ${proj.length ? proj.map((r) => `<div class="t-bar-row"><span class="t-main-line">${esc(r.project.name)}</span><span class="t-num t-small">${gbpStr(r.paid)}${r.estimate ? ` of ${gbpStr(r.estimate)}` : ''}</span><div class="t-bar"><span style="width:${r.estimate ? Math.min(100, (r.paid / r.estimate) * 100) : 0}%;background:var(--${r.state === 'over' ? 'fail' : 'accent'})"></span></div></div>`).join('') + '<p class="t-xs t-faint">Paid so far against the estimate, in pounds.</p>' : '<p class="t-muted t-small">No projects on the go.</p>'}</section>
  </div>`;
}
after.overview = () => { const el = $('#pace'); if (el) drawPace(el); };

function drawPace(el) {
  const fx = fxo(), inc = new Set(L.buckets.filter((b) => b.kind === 'income').map((b) => b.id));
  const p = pacing(L.txns, ui.month, fx, inc);
  const W = 560, H = 220, pl = 52, pr = 12, pt = 12, pb = 26, days = Math.max(p.current.length, p.previous.length);
  const isNow = ui.month === monthOf(todayISO()), today = +todayISO().slice(8);
  const cur = isNow ? p.current.slice(0, today) : p.current;
  const max = Math.max(100, ...cur, ...p.previous) * 1.08;
  const x = (i) => pl + (i / (days - 1)) * (W - pl - pr), y = (v) => pt + (1 - v / max) * (H - pt - pb);
  const line = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const ticks = [0, max / 2, max].map((v) => Math.round(v / 1000) * 1000);
  el.innerHTML = `<svg class="t-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Cumulative spending by day: ${gbpStr(cur[cur.length - 1] || 0)} so far this month against ${gbpStr(p.previous[p.previous.length - 1] || 0)} last month">
    ${ticks.map((t) => `<line class="t-grid-line" x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}"/><text class="t-axis" x="${pl - 6}" y="${y(t) + 4}" text-anchor="end">£${Math.round(t / 100).toLocaleString('en-GB')}</text>`).join('')}
    ${[1, 8, 15, 22, days].map((d) => `<text class="t-axis" x="${x(d - 1)}" y="${H - 6}" text-anchor="middle">${d}</text>`).join('')}
    <path d="${line(p.previous)}" fill="none" stroke="var(--ink-3)" stroke-width="2" stroke-dasharray="4 4"/>
    <path d="${line(cur)}" fill="none" stroke="var(--accent)" stroke-width="2"/>
    ${cur.length ? `<circle cx="${x(cur.length - 1)}" cy="${y(cur[cur.length - 1])}" r="4" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>` : ''}
    <line id="pace-x" x1="0" x2="0" y1="${pt}" y2="${H - pb}" stroke="var(--ink-3)" stroke-width="1" opacity="0"/>
    <rect x="${pl}" y="${pt}" width="${W - pl - pr}" height="${H - pt - pb}" fill="transparent" id="pace-hit"/>
  </svg><div class="t-legend"><span><i style="background:var(--accent)"></i>This month</span><span><i style="background:var(--ink-3)"></i>Last month</span></div>`;
  const svg = el.querySelector('svg'), hit = el.querySelector('#pace-hit'), xl = el.querySelector('#pace-x'), tip = $('#tip');
  const move = (e) => {
    const r = svg.getBoundingClientRect(), sx = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(days - 1, Math.round(((sx - pl) / (W - pl - pr)) * (days - 1))));
    xl.setAttribute('x1', x(i)); xl.setAttribute('x2', x(i)); xl.setAttribute('opacity', 1);
    tip.innerHTML = `Day ${i + 1}<br>This month ${cur[i] != null ? gbpStr(cur[i]) : '–'}<br>Last month ${gbpStr(p.previous[i] || 0)}`;
    tip.style.left = e.clientX + 12 + 'px'; tip.style.top = e.clientY - 40 + 'px'; tip.style.opacity = 1;
  };
  hit.addEventListener('pointermove', move); hit.addEventListener('pointerleave', () => { tip.style.opacity = 0; xl.setAttribute('opacity', 0); });
}

// ---------- review queue ----------
function bucketOptions(sel, scope) {
  const groups = {};
  for (const b of L.buckets.filter((b) => !b.archived)) {
    if (scope === 'business' ? b.kind !== 'business' : b.kind === 'business') continue;
    (groups[b.group] ||= []).push(b);
  }
  return `<option value="">Choose a bucket</option>` + Object.entries(groups).map(([g, bs]) => `<optgroup label="${esc(g)}">${bs.map((b) => `<option value="${b.id}" ${b.id === sel ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</optgroup>`).join('');
}
const projectOptions = (sel) => `<option value="">No project</option>` + L.projects.map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
const whoSeg = (id, cur) => `<div class="t-seg" role="group" aria-label="Whose">${PEOPLE.map((p) => `<button data-act="who" data-id="${id}" data-v="${p.id}" aria-pressed="${cur === p.id}">${p.name}</button>`).join('')}</div>`;
const scopeSelect = (id, cur, acc) => acc?.scope === 'business'
  ? `<label class="t-field"><span>Kind</span><select class="t-select" data-act="scope" data-id="${id}">${SCOPES.map((s) => `<option value="${s.id}" ${s.id === cur ? 'selected' : ''}>${s.name}</option>`).join('')}</select></label>` : '';

function review() {
  const q = L.txns.filter((t) => t.status === 'review').sort((a, b) => b.date.localeCompare(a.date));
  const ready = q.filter((t) => t.bucket_id);
  if (!q.length) return appbar('To review') + `<section class="t-panel t-empty"><h3>All caught up</h3><p>New transactions appear here after an import until you confirm their bucket and whose they were.</p></section>`;
  return appbar('To review', ready.length ? `<button class="t-btn t-btn-secondary" data-act="confirm-all">${icon('check')}Confirm ${ready.length} suggested</button>` : '') +
  `<p class="t-muted t-small" style="margin-bottom:var(--s4)">Tick “Always” and the same payee is filed the same way next time.</p><div class="m-review">${q.slice(0, 20).map((t) => {
    const a = acct(t.account_id);
    return `<section class="t-panel" data-id="${t.id}">
      <div class="m-review-top"><div><h3>${esc(t.payee)}</h3><div class="t-meta t-small t-faint">${longDate(t.date)} · ${esc(a?.name || '')} · <span title="${esc(t.payee_raw)}">${esc(t.payee_raw)}</span></div></div>${amt(t.amount, t.currency, t.date)}</div>
      ${t.flag ? `<div class="t-notice t-warn">${icon('warn')}<span>${esc(t.flag)}</span></div>` : ''}
      <div class="m-review-fields">
        <label class="t-field"><span>Bucket</span><select class="t-select" data-act="bucket" data-id="${t.id}">${bucketOptions(t.bucket_id, t.scope)}</select></label>
        ${scopeSelect(t.id, t.scope, a)}
        <label class="t-field"><span>Project</span><select class="t-select" data-act="project" data-id="${t.id}">${projectOptions(t.project_id)}</select></label>
      </div>
      ${whoSeg(t.id, t.owner)}
      <div class="t-actions"><button class="t-btn t-btn-primary" data-act="confirm" data-id="${t.id}">${icon('check')}Confirm</button><label class="t-check"><input type="checkbox" data-always="${t.id}">Always for ${esc(t.payee)}</label><button class="t-btn t-btn-quiet" data-act="open-txn" data-id="${t.id}">Split or note</button></div>
    </section>`;
  }).join('')}</div>${q.length > 20 ? `<p class="t-muted t-small m-top-gap">Showing the newest 20 of ${q.length}. Confirm these and the next ones appear.</p>` : ''}`;
}

// ---------- budget ----------
function budget() {
  const b = budgetMonth({ txns: L.txns, buckets: L.buckets, allocations: L.allocations, month: ui.month, fx: fxo(), ...budgetBase(L.accounts, L.txns, fxo()) });
  const groups = {};
  b.rows.filter((r) => r.bucket.kind === 'spend').forEach((r) => (groups[r.bucket.group] ||= []).push(r));
  const total = (rs, k) => rs.reduce((s, r) => s + r[k], 0);
  return appbar('Buckets', monthNav()) + `
  <div class="t-grid t-3">
    <section class="t-panel t-hero"><span class="t-label">Ready to assign</span><span class="t-value ${b.readyToAssign < 0 ? 't-over' : ''}">${gbpStr(b.readyToAssign)}</span><span class="t-sub">NatWest money only. The French accounts count once money moves to NatWest.</span></section>
    <section class="t-panel t-stat"><span class="t-small t-muted">Assigned this month</span><span class="t-value">${gbpStr(b.assigned)}</span><span class="t-small t-muted">Income ${gbpStr(b.income)}</span></section>
    <section class="t-panel t-stat"><span class="t-small t-muted">Spent this month</span><span class="t-value">${gbpStr(-b.spent)}</span><span class="t-small ${b.overspent.length ? 't-over' : 't-muted'}">${b.overspent.length ? `${b.overspent.length} bucket${b.overspent.length === 1 ? '' : 's'} overspent` : 'Nothing overspent'}</span></section>
  </div>
  <section class="t-panel m-top-gap"><div class="t-panel-head"><h2>${monthName(ui.month)}</h2><button class="t-btn t-btn-secondary t-btn-sm" data-act="copy-last">Assign same as last month</button></div>
  <div class="t-table-wrap"><table class="t-table"><thead><tr><th>Bucket</th><th class="t-r">Assigned</th><th class="t-r">Spent</th><th class="t-r">Available</th></tr></thead><tbody>
  ${Object.entries(groups).map(([g, rs]) => `<tr class="t-group"><td>${esc(g)}</td><td class="t-r t-num">${gbpStr(total(rs, 'assigned'))}</td><td class="t-r t-num">${gbpStr(-total(rs, 'activity'))}</td><td class="t-r t-num">${gbpStr(total(rs, 'available'))}</td></tr>` + rs.map((r) => `<tr><td>${esc(r.bucket.name)}${r.bucket.target ? `<div class="t-xs t-faint">Target ${gbpStr(r.bucket.target)} a month</div>` : ''}</td>
    <td class="t-r"><input class="t-input t-num m-assign" inputmode="decimal" aria-label="Assigned to ${esc(r.bucket.name)}" data-assign="${r.bucket.id}" value="${r.assigned ? (r.assigned / 100).toFixed(2) : ''}" placeholder="0.00"></td>
    <td class="t-r t-num"><a href="#txns" data-act="filter-bucket" data-id="${r.bucket.id}" style="color:inherit">${gbpStr(-r.activity)}</a></td>
    <td class="t-r"><span class="t-avail" data-state="${bucketState(r)}">${gbpStr(r.available)}</span></td></tr>`).join('')).join('')}
  </tbody></table></div><p class="t-xs t-faint m-top-gap">All in pounds. Euro spending during France holidays is converted at ${L.settings.fxMode === 'today' ? 'today’s rate' : 'the rate on each day'}. Gîte business spending is not in these buckets.</p></section>`;
}

// ---------- transactions ----------
function filtered() {
  const q = ui.q.toLowerCase();
  return L.txns.filter((t) => (!ui.acc || t.account_id === ui.acc) && (!ui.who || t.owner === ui.who) && (!ui.scope || t.scope === ui.scope)
    && (!ui.bucket || t.bucket_id === ui.bucket || (t.splits || []).some((s) => s.bucket_id === ui.bucket)) && (!ui.reviewOnly || t.status === 'review')
    && (!q || `${t.payee} ${t.payee_raw} ${t.note} ${bucket(t.bucket_id)?.name || ''}`.toLowerCase().includes(q))
    && (ui.q || ui.acc || ui.reviewOnly || monthOf(t.date) === ui.month)).sort((a, b) => b.date.localeCompare(a.date) || a.payee.localeCompare(b.payee));
}
function txns() {
  const rows = filtered(); let day = '';
  const sel = (id, opts, cur, label) => `<select class="t-select" data-filter="${id}" aria-label="${label}">${opts.map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const searching = ui.q || ui.acc || ui.reviewOnly;
  return appbar('Transactions', searching ? '' : monthNav()) + `
  <div class="m-filters">
    <input class="t-input m-search" type="search" placeholder="Search payee, note or bucket" value="${esc(ui.q)}" data-filter="q" aria-label="Search">
    ${sel('acc', [['', 'All accounts'], ...L.accounts.map((a) => [a.id, a.name])], ui.acc, 'Account')}
    ${sel('who', [['', 'Everyone'], ...PEOPLE.map((p) => [p.id, p.name])], ui.who, 'Whose')}
    ${sel('scope', [['', 'All kinds'], ...SCOPES.map((s) => [s.id, s.name])], ui.scope, 'Kind')}
    ${sel('bucket', [['', 'All buckets'], ...L.buckets.map((b) => [b.id, b.name])], ui.bucket, 'Bucket')}
  </div>
  <div class="t-actions" style="margin-bottom:var(--s3)"><label class="t-check"><input type="checkbox" data-filter="reviewOnly" ${ui.reviewOnly ? 'checked' : ''}>To review only</label><span class="t-small t-muted" style="margin-left:auto">${rows.length} shown${searching ? ', all months' : ''}</span>${showSeg()}</div>
  <section class="t-panel">${rows.length ? `<ul class="t-list">${rows.slice(0, 400).map((t) => {
    const head = t.date !== day ? `<li class="t-day">${longDate(day = t.date)}</li>` : '';
    const bk = t.splits?.length ? `Split ${t.splits.length} ways` : bucket(t.bucket_id)?.name || 'No bucket';
    return head + `<li class="t-row t-clickable" data-act="open-txn" data-id="${t.id}" tabindex="0" role="button"><div><div class="t-main-line">${esc(t.payee)}</div><div class="t-meta">${esc(bk)} · ${esc(acct(t.account_id)?.name || '')} · ${who(t.owner)} ${scopeTag(t.scope)} ${t.status === 'review' ? '<span class="t-tag t-warn">To review</span>' : ''} ${t.transfer_id ? '<span class="t-tag">Transfer</span>' : ''} ${t.receipt_id ? '<span class="t-tag t-accent">Receipt</span>' : ''}</div></div>${amt(t.amount, t.currency, t.date)}</li>`;
  }).join('')}</ul>` : '<div class="t-empty"><h3>No transactions</h3><p>Nothing matches these filters.</p></div>'}</section>`;
}

function openTxn(id) {
  const t = L.txns.find((x) => x.id === id); if (!t) return;
  const a = acct(t.account_id), r = t.receipt_id && L.receipts.find((x) => x.id === t.receipt_id);
  const splits = t.splits?.length ? t.splits : null;
  sheet(esc(t.payee), `
    <div style="margin-bottom:var(--s4)">${amt(t.amount, t.currency, t.date)}</div>
    <dl class="m-kv"><dt>Date</dt><dd>${longDate(t.date)}</dd><dt>Account</dt><dd>${esc(a?.name)}</dd><dt>Bank text</dt><dd>${esc(t.payee_raw)}${t.memo ? ' · ' + esc(t.memo) : ''}</dd>
    ${t.currency !== 'GBP' ? `<dt>In pounds</dt><dd>${fmt(toGBP(t.amount, t.currency, { ...fxo(), mode: 'today' }))} today · ${fmt(toGBP(t.amount, t.currency, { ...fxo(), mode: 'day', date: t.date }))} on the day</dd>` : ''}
    ${r ? `<dt>Receipt</dt><dd>${esc(r.merchant)}, ${r.lines.length} lines</dd>` : ''}</dl>
    <div class="t-form m-top-gap">
      <label class="t-field"><span>Payee</span><input class="t-input" data-edit="payee" value="${esc(t.payee)}"></label>
      <label class="t-field"><span>Bucket</span><select class="t-select" data-edit="bucket_id" ${splits ? 'disabled' : ''}>${bucketOptions(t.bucket_id, t.scope)}</select>${splits ? '<span class="t-help">Split below.</span>' : ''}</label>
      ${a?.scope === 'business' ? `<label class="t-field"><span>Kind</span><select class="t-select" data-edit="scope">${SCOPES.map((s) => `<option value="${s.id}" ${s.id === t.scope ? 'selected' : ''}>${s.name}</option>`).join('')}</select></label>` : ''}
      <label class="t-field"><span>Project</span><select class="t-select" data-edit="project_id">${projectOptions(t.project_id)}</select></label>
      <div class="t-field"><span>Whose</span><div class="t-seg" role="group">${PEOPLE.map((p) => `<button data-edit-who="${p.id}" aria-pressed="${t.owner === p.id}">${p.name}</button>`).join('')}</div></div>
      <label class="t-field"><span>Note</span><textarea class="t-textarea" data-edit="note">${esc(t.note)}</textarea></label>
      <div class="t-field"><span>Split across buckets</span><div class="m-lines" id="splits">${(splits || []).map((s, i) => splitRow(s, i, t)).join('')}</div>
        <div class="t-actions"><button class="t-btn t-btn-secondary t-btn-sm" data-act="add-split">${icon('plus')}Add a part</button><span class="t-help" id="split-sum"></span></div></div>
      <label class="t-check"><input type="checkbox" data-edit-check="transfer" ${t.transfer_id ? 'checked' : ''}>Transfer between our own accounts (not spending)</label>
      <label class="t-check"><input type="checkbox" data-edit-check="void" ${t.status === 'void' ? 'checked' : ''}>Ignore this line (duplicate or reversed)</label>
    </div>
    <div class="t-actions m-top-gap"><button class="t-btn t-btn-primary" data-act="save-txn" data-id="${t.id}">Save</button><button class="t-btn t-btn-secondary" data-act="close">Cancel</button></div>`);
  const sum = () => {
    if (!$('#split-sum')) return;
    const parts = [...document.querySelectorAll('#splits .m-line')].map((l) => parseAmount(l.querySelector('[data-s=amount]').value) || 0);
    const total = parts.reduce((a, b) => a + b, 0), want = Math.abs(t.amount);
    $('#split-sum').textContent = parts.length ? (total === want ? 'Parts add up.' : `Parts ${fmt(total, t.currency)} of ${fmt(want, t.currency)}: ${fmt(want - total, t.currency)} left.`) : '';
  };
  $('#sheet').addEventListener('input', sum); sum();
}
const splitRow = (s, i, t) => `<div class="m-line"><input class="t-input" data-s="note" placeholder="What" value="${esc(s.note || '')}" aria-label="Part ${i + 1} description"><input class="t-input t-num" data-s="amount" inputmode="decimal" value="${s.amount ? (Math.abs(s.amount) / 100).toFixed(2) : ''}" aria-label="Part ${i + 1} amount"><select class="t-select" data-s="bucket_id" aria-label="Part ${i + 1} bucket">${bucketOptions(s.bucket_id, t.scope)}</select><select class="t-select" data-s="project_id" aria-label="Part ${i + 1} project">${projectOptions(s.project_id)}</select></div>`;

function saveTxn(id) {
  const t = L.txns.find((x) => x.id === id), sh = $('#sheet'), locked = new Set(t.locked || []);
  const was = JSON.parse(JSON.stringify(t));
  sh.querySelectorAll('[data-edit]').forEach((el) => { if (el.disabled) return; const k = el.dataset.edit; if ((t[k] ?? '') !== el.value) { t[k] = el.value || (k === 'note' || k === 'payee' ? el.value : null); locked.add(k); } });
  const w = sh.querySelector('[data-edit-who][aria-pressed="true"]'); if (w && w.dataset.editWho !== t.owner) { t.owner = w.dataset.editWho; locked.add('owner'); }
  const lines = [...sh.querySelectorAll('#splits .m-line')].map((l) => ({ note: l.querySelector('[data-s=note]').value, amount: parseAmount(l.querySelector('[data-s=amount]').value), bucket_id: l.querySelector('[data-s=bucket_id]').value || null, project_id: l.querySelector('[data-s=project_id]').value || null })).filter((s) => s.amount);
  if (lines.length) {
    const total = lines.reduce((a, b) => a + b.amount, 0);
    if (total !== Math.abs(t.amount)) { toast(`The parts add up to ${fmt(total, t.currency)}, not ${fmt(Math.abs(t.amount), t.currency)}.`); return; }
    const sign = Math.sign(t.amount); t.splits = lines.map((s) => ({ ...s, amount: s.amount * sign }));
  } else t.splits = null;
  const tr = sh.querySelector('[data-edit-check=transfer]').checked;
  if (tr && !t.transfer_id) t.transfer_id = 'manual-' + uid(); if (!tr) t.transfer_id = null;
  const vd = sh.querySelector('[data-edit-check=void]').checked;
  t.status = vd ? 'void' : (t.bucket_id || t.splits || t.transfer_id) ? 'done' : 'review';
  locked.add('status'); t.locked = [...locked];
  closeSheet();
  commit({ txns: { upsert: [t] } }, 'Saved', () => { Object.assign(t, was); commit({ txns: { upsert: [t] } }, 'Put back'); });
}

// ---------- import ----------
function importView() {
  const pend = ui.pending;
  return appbar('Import') + `
  <section class="t-panel"><div class="t-drop" id="drop"><p><strong>Drop statement files here</strong></p><p class="t-small">OFX or QFX (best: the bank’s own ids stop duplicates), QIF, or CSV. Receipts as .json too.</p>
    <div class="t-actions" style="justify-content:center;margin-top:var(--s4)"><label class="t-btn t-btn-primary">${icon('upload')}Choose files<input type="file" id="file" multiple accept=".ofx,.qfx,.qif,.csv,.txt,.json" class="t-sr"></label></div></div>
    <details class="m-top-gap"><summary class="t-small"><strong>How to download statements</strong></summary><div class="t-small t-muted" style="padding-top:var(--s2)">
      <p><strong>NatWest International:</strong> online banking on a computer, choose the account, Statements, then Download transactions. Pick a date range and the Microsoft Money / Quicken (OFX) option if offered, otherwise CSV.</p>
      <p class="m-top-gap"><strong>CMB:</strong> Mes comptes, the account, Télécharger, format OFX (Money / Quicken). Both comptes chèques download separately.</p>
      <p class="m-top-gap">Overlapping dates are fine: anything already here is skipped.</p></div></details></section>
  ${pend.map((p, i) => `<section class="t-panel m-top-gap"><div class="t-panel-head"><h2>${esc(p.name)}</h2><span class="t-tag">${p.format.toUpperCase()}</span></div>
    ${p.error ? `<div class="t-notice t-fail">${icon('warn')}<span>${esc(p.error)}</span></div>` : p.statements.map((s, j) => {
      const dates = s.txns.map((t) => t.date).sort();
      return `<div class="t-form t-2"><label class="t-field"><span>Account${s.account.accountId ? ` (file says ${maskAccount(s.account.accountId)}, ${s.account.currency})` : ''}</span><select class="t-select" data-pend="${i}" data-stmt="${j}">${L.accounts.map((a) => `<option value="${a.id}" ${a.id === s.accountId ? 'selected' : ''}>${esc(a.name)} (${a.currency})</option>`).join('')}<option value="_new" ${s.accountId ? '' : 'selected'}>New account…</option></select></label>
        <div class="t-small t-muted" style="align-self:end">${s.txns.length} transactions${dates.length ? `, ${longDate(dates[0])} to ${longDate(dates[dates.length - 1])}` : ''}${s.balance ? `. Balance ${fmt(s.balance.amount, s.account.currency)} on ${longDate(s.balance.date)}` : ''}</div></div>`;
    }).join('')}
    ${p.receipts ? `<p>${p.receipts.length} receipt${p.receipts.length === 1 ? '' : 's'}: ${p.receipts.map((r) => esc(r.merchant) + ' ' + fmt(r.total, r.currency)).join(', ')}</p>` : ''}
    <div class="t-actions m-top-gap">${p.error ? '' : `<button class="t-btn t-btn-primary" data-act="do-import" data-i="${i}">Bring it in</button>`}<button class="t-btn t-btn-quiet" data-act="drop-pend" data-i="${i}">Remove</button></div></section>`).join('')}
  <section class="t-panel m-top-gap"><h2>Past imports</h2>${L.imports.length ? `<ul class="t-list">${[...L.imports].reverse().slice(0, 30).map((im) => `<li class="t-row"><div><div class="t-main-line">${esc(im.file)}</div><div class="t-meta">${esc(new Date(im.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }))} · ${esc(acct(im.account_id)?.name || 'Receipts')} · ${im.added} new, ${im.skipped} already here</div></div><button class="t-btn t-btn-danger t-btn-sm" data-act="undo-import" data-id="${im.id}">Undo</button></li>`).join('')}</ul>` : '<p class="t-muted t-small">None yet.</p>'}</section>`;
}
after.import = () => {
  const drop = $('#drop'), file = $('#file');
  file.addEventListener('change', () => readFiles(file.files));
  ['dragenter', 'dragover'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.dataset.over = 'true'; }));
  ['dragleave', 'drop'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.dataset.over = 'false'; }));
  drop.addEventListener('drop', (ev) => readFiles(ev.dataTransfer.files));
};
async function readFiles(files) {
  for (const f of files) {
    const text = await f.text();
    try {
      if (/\.json$/i.test(f.name) || /^\s*[\[{]/.test(text)) {
        const j = JSON.parse(text); const list = Array.isArray(j) ? j : j.receipts || [j];
        if (j.app === 'money') { ui.pending.push({ name: f.name, format: 'backup', statements: [], backup: j }); continue; }
        ui.pending.push({ name: f.name, format: 'receipt', statements: [], receipts: list.map(normReceipt) });
        continue;
      }
      const { format, statements } = parseStatement(text, { filename: f.name });
      statements.forEach((s) => { const a = matchAccount(s, L.accounts); s.accountId = a?.id || null; });
      ui.pending.push({ name: f.name, format, statements });
    } catch (e) { ui.pending.push({ name: f.name, format: '?', statements: [], error: e.message || 'Could not read this file.' }); }
  }
  render();
}
function normReceipt(r) {
  const money = (v) => (typeof v === 'number' ? Math.round(v * 100) : parseAmount(v));
  return { id: uid(), merchant: r.merchant, date: r.date, currency: r.currency || 'GBP', total: money(r.total), tax: money(r.tax || 0), ref: r.ref || r.invoice || '', note: r.note || '',
    lines: (r.lines || []).map((l) => ({ description: l.description, qty: l.qty ?? null, amount: money(l.amount), bucket_id: l.bucket_id || null, project_id: l.project_id || null, owner: l.owner || null })), txn_id: null };
}
function doImport(i) {
  const p = ui.pending[i]; const changes = { txns: { upsert: [] }, accounts: { upsert: [] }, imports: { upsert: [] }, receipts: { upsert: [] } };
  let added = 0, skipped = 0;
  if (p.backup) { if (!confirm('Replace everything on this page with the backup? This cannot be undone here.')) return; Object.assign(L, p.backup); ui.pending.splice(i, 1); store.save(L, {}).then(render); toast('Backup restored'); return; }
  if (p.receipts) {
    for (const r of p.receipts) { L.receipts.push(r); changes.receipts.upsert.push(r); const m = matchReceipt(r, L.txns)[0]; if (m) applyReceipt(r, m, changes); added++; }
    const im = { id: uid(), file: p.name, at: new Date().toISOString(), account_id: null, added, skipped: 0, receipt_ids: p.receipts.map((r) => r.id) };
    L.imports.push(im); changes.imports.upsert.push(im); ui.pending.splice(i, 1);
    return commit(changes, `${added} receipt${added === 1 ? '' : 's'} added`);
  }
  const keys = new Set(L.txns.map((t) => t.dedupe_key));
  const im = { id: uid(), file: p.name, at: new Date().toISOString(), account_id: null, added: 0, skipped: 0 };
  document.querySelectorAll(`[data-pend="${i}"]`).forEach((sel) => { p.statements[+sel.dataset.stmt].accountId = sel.value; });
  for (const s of p.statements) {
    let a = acct(s.accountId);
    if (!a) {
      a = { id: uid(), name: s.account.currency === 'EUR' ? 'New euro account' : 'New account', bank: '', currency: s.account.currency, kind: s.account.kind === 'card' ? 'card' : 'current', owner: 'joint', scope: s.account.currency === 'EUR' ? 'business' : 'household', number_tail: s.account.accountId ? String(s.account.accountId).replace(/\W/g, '').slice(-4) : null, opening: 0, anchor: null, sort: L.accounts.length + 1 };
      L.accounts.push(a); changes.accounts.upsert.push(a);
    }
    if (s.account.accountId && !a.number_tail) { a.number_tail = String(s.account.accountId).replace(/\W/g, '').slice(-4); changes.accounts.upsert.push(a); }
    s.txns.forEach((t) => { t.currency = a.currency; });
    const { fresh, dupes } = prepareImport(s, { account: a, existingKeys: keys, holidays: L.holidays, rules: L.rules, importId: im.id, newId: uid });
    L.txns.push(...fresh); changes.txns.upsert.push(...fresh); added += fresh.length; skipped += dupes.length;
    if (s.balance && s.balance.amount != null && (!a.anchor || s.balance.date >= a.anchor.date)) { a.anchor = { amount: s.balance.amount, date: s.balance.date }; changes.accounts.upsert.push(a); }
    im.account_id = a.id;
  }
  // Pair up transfers between our own accounts among everything now held.
  for (const [o, n] of findTransferPairs(L.txns, { rates: L.settings.rates })) {
    const tid = 'tr-' + uid();
    for (const t of [o, n]) { t.transfer_id = tid; if (t.status === 'review' && !t.bucket_id) t.status = 'done'; changes.txns.upsert.push(t); }
  }
  // A receipt waiting for its bank line finds it now.
  for (const r of L.receipts.filter((r) => !r.txn_id)) { const m = matchReceipt(r, L.txns)[0]; if (m) applyReceipt(r, m, changes); }
  im.added = added; im.skipped = skipped; L.imports.push(im); changes.imports.upsert.push(im);
  ui.pending.splice(i, 1);
  // An account may have just learned its number: let files still waiting find it.
  for (const q of ui.pending) for (const s of q.statements || []) if (!s.accountId) s.accountId = matchAccount(s, L.accounts)?.id || null;
  commit(changes, `${added} new transaction${added === 1 ? '' : 's'}${skipped ? `, ${skipped} already here` : ''}`);
  if (L.txns.some((t) => t.currency !== 'GBP')) refreshRates(true);
}
function undoImport(id) {
  const im = L.imports.find((x) => x.id === id); if (!im) return;
  const gone = L.txns.filter((t) => t.import_id === id).map((t) => t.id);
  if (!confirm(`Remove the ${gone.length || (im.receipt_ids || []).length} item(s) this import added?`)) return;
  L.txns = L.txns.filter((t) => t.import_id !== id);
  const rgone = im.receipt_ids || [];
  L.receipts = L.receipts.filter((r) => !rgone.includes(r.id));
  L.imports = L.imports.filter((x) => x.id !== id);
  commit({ txns: { delete: gone }, receipts: { delete: rgone }, imports: { delete: [id] } }, 'Import removed');
}

// ---------- receipts ----------
function applyReceipt(r, t, changes) {
  r.txn_id = t.id; t.receipt_id = r.id;
  if (r.lines.some((l) => l.bucket_id || l.project_id)) {
    t.splits = splitsFromReceipt(r, t.amount);
    if (t.splits.length === 1) { t.bucket_id = t.splits[0].bucket_id || t.bucket_id; t.project_id = t.splits[0].project_id; t.splits = null; }
  }
  if (t.bucket_id || t.splits) { t.status = 'done'; t.locked = [...new Set([...(t.locked || []), 'status', 'bucket_id'])]; }
  changes.txns.upsert.push(t); changes.receipts.upsert.push(r);
}
function receipts() {
  const list = [...L.receipts].sort((a, b) => b.date.localeCompare(a.date));
  return appbar('Receipts', `<button class="t-btn t-btn-primary" data-act="new-receipt">${icon('plus')}Add a receipt</button>`) +
  (list.length ? `<div class="t-grid t-2">${list.map((r) => {
    const c = receiptCheck(r), t = r.txn_id && L.txns.find((x) => x.id === r.txn_id);
    const cand = !t ? matchReceipt(r, L.txns) : [];
    return `<section class="t-panel"><div class="t-panel-head"><h2>${esc(r.merchant)}</h2>${amt(-r.total, r.currency, r.date)}</div>
      <p class="t-small t-muted">${longDate(r.date)}${r.ref ? ' · ' + esc(r.ref) : ''} · ${r.lines.length} line${r.lines.length === 1 ? '' : 's'}${r.tax ? ` · tax ${fmt(r.tax, r.currency)}` : ''}</p>
      ${c.ok ? '' : `<div class="t-notice t-warn m-top-gap">${icon('warn')}<span>Lines and tax add to ${fmt(c.expected, r.currency)}, the total says ${fmt(r.total, r.currency)}.</span></div>`}
      <div class="m-top-gap">${t ? `<span class="t-tag t-ok">${icon('link')}Matched</span> <span class="t-small">${esc(t.payee)}, ${longDate(t.date)}, ${esc(acct(t.account_id)?.name)}</span>` : cand.length ? `<button class="t-btn t-btn-secondary t-btn-sm" data-act="match-receipt" data-id="${r.id}" data-t="${cand[0].id}">${icon('link')}Match to ${esc(cand[0].payee)}, ${longDate(cand[0].date)}</button>` : '<span class="t-tag t-warn">Waiting for the bank line</span> <span class="t-xs t-faint">It matches itself when that statement comes in.</span>'}</div>
      <details class="m-top-gap"><summary class="t-small">Lines</summary><ul class="t-list">${r.lines.map((l) => `<li class="t-row"><div><div class="t-small">${l.qty ? l.qty + ' × ' : ''}${esc(l.description)}</div><div class="t-meta">${esc(bucket(l.bucket_id)?.name || 'No bucket')}${l.project_id ? ' · ' + esc(L.projects.find((p) => p.id === l.project_id)?.name || '') : ''}</div></div><span class="t-num t-small">${fmt(l.amount, r.currency)}</span></li>`).join('')}</ul></details>
      <div class="t-actions m-top-gap"><button class="t-btn t-btn-quiet t-btn-sm" data-act="edit-receipt" data-id="${r.id}">Edit</button><button class="t-btn t-btn-danger t-btn-sm" data-act="del-receipt" data-id="${r.id}">Delete</button></div></section>`;
  }).join('')}</div>` : `<section class="t-panel t-empty"><h3>No receipts yet</h3><p>Add one by hand, or bring in a receipt file on the Import page. A receipt matches its bank line by amount and date, then splits it across buckets and projects.</p></section>`);
}
function receiptSheet(id) {
  const r = id ? L.receipts.find((x) => x.id === id) : { merchant: '', date: todayISO(), currency: 'GBP', total: 0, tax: 0, ref: '', lines: [{ description: '', amount: 0 }] };
  sheet(id ? 'Edit receipt' : 'Add a receipt', `<div class="t-form">
    <div class="t-form t-2"><label class="t-field"><span>Shop</span><input class="t-input" data-r="merchant" value="${esc(r.merchant)}"></label><label class="t-field"><span>Date</span><input class="t-input" type="date" data-r="date" value="${r.date}"></label>
    <label class="t-field"><span>Total paid</span><input class="t-input t-num" data-r="total" inputmode="decimal" value="${r.total ? (r.total / 100).toFixed(2) : ''}"></label><label class="t-field"><span>Tax included (GST/TVA)</span><input class="t-input t-num" data-r="tax" inputmode="decimal" value="${r.tax ? (r.tax / 100).toFixed(2) : ''}"></label>
    <label class="t-field"><span>Currency</span><select class="t-select" data-r="currency"><option ${r.currency === 'GBP' ? 'selected' : ''}>GBP</option><option ${r.currency === 'EUR' ? 'selected' : ''}>EUR</option></select></label><label class="t-field"><span>Invoice number</span><input class="t-input" data-r="ref" value="${esc(r.ref || '')}"></label></div>
    <div class="t-field"><span>Lines (before tax, if the receipt lists them that way)</span><div class="m-lines" id="rlines">${r.lines.map((l, i) => splitRow({ note: l.description, amount: l.amount, bucket_id: l.bucket_id, project_id: l.project_id }, i, { scope: 'household' })).join('')}</div>
      <div class="t-actions"><button class="t-btn t-btn-secondary t-btn-sm" data-act="add-rline">${icon('plus')}Add a line</button></div></div>
    <div class="t-actions"><button class="t-btn t-btn-primary" data-act="save-receipt" data-id="${id || ''}">Save</button><button class="t-btn t-btn-secondary" data-act="close">Cancel</button></div></div>`);
}
function saveReceipt(id) {
  const sh = $('#sheet'), g = (k) => sh.querySelector(`[data-r=${k}]`).value;
  const r = id ? L.receipts.find((x) => x.id === id) : { id: uid(), txn_id: null };
  Object.assign(r, { merchant: g('merchant').trim(), date: g('date'), currency: g('currency'), total: parseAmount(g('total')) || 0, tax: parseAmount(g('tax')) || 0, ref: g('ref') });
  r.lines = [...sh.querySelectorAll('#rlines .m-line')].map((l) => ({ description: l.querySelector('[data-s=note]').value, amount: parseAmount(l.querySelector('[data-s=amount]').value) || 0, bucket_id: l.querySelector('[data-s=bucket_id]').value || null, project_id: l.querySelector('[data-s=project_id]').value || null })).filter((l) => l.description || l.amount);
  if (!r.merchant || !r.total) { toast('A receipt needs a shop and a total.'); return; }
  if (!id) L.receipts.push(r);
  const changes = { receipts: { upsert: [r] }, txns: { upsert: [] } };
  if (!r.txn_id) { const m = matchReceipt(r, L.txns)[0]; if (m) applyReceipt(r, m, changes); }
  else { const t = L.txns.find((x) => x.id === r.txn_id); if (t) applyReceipt(r, t, changes); }
  closeSheet(); commit(changes, r.txn_id ? 'Receipt saved and matched' : 'Receipt saved');
}

// ---------- projects ----------
// Each project: the estimate item by item, what has been paid against it, and
// every payment (bank lines tagged with the project, and costs paid elsewhere).
function projects() {
  const list = [...L.projects].sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0));
  const reps = list.map((p) => projectReport(p, L.txns, fxo()));
  const live = reps.filter((r) => !r.project.done);
  const totE = live.reduce((s, r) => s + r.estimate, 0), totP = live.reduce((s, r) => s + r.paid, 0);
  return appbar('Projects', `<button class="t-btn t-btn-primary" data-act="new-project">${icon('plus')}Add a project</button>`) + `
  <div class="t-grid t-3">
    <section class="t-panel t-hero"><span class="t-label">Paid so far</span><span class="t-value">${gbpStr(totP)}</span><span class="t-sub">Across ${live.length} project${live.length === 1 ? '' : 's'} on the go.</span></section>
    <section class="t-panel t-stat"><span class="t-small t-muted">Estimated</span><span class="t-value">${gbpStr(totE)}</span></section>
    <section class="t-panel t-stat"><span class="t-small t-muted">${totP > totE && totE ? 'Over the estimate by' : 'Still to pay'}</span><span class="t-value ${totP > totE && totE ? 't-over' : ''}">${gbpStr(Math.abs(totE - totP))}</span></section>
  </div>
  <p class="t-small t-muted m-top-gap">Tag a bank line with a project when you review it, or split a receipt across projects. Pick the item it paid for below. Anything paid another way (cash, a card not brought in here) goes in with “Add a payment”.</p>
  <div class="m-proj m-top-gap">${reps.map(projectPanel).join('')}</div>`;
}
function projectPanel(r) {
  const p = r.project, items = p.items || [];
  const leftLabel = r.state === 'over' ? 'Over by' : 'Left';
  const itemOpts = (sel) => `<option value="">No item</option>` + items.map((i) => `<option value="${i.id}" ${i.id === sel ? 'selected' : ''}>${esc(i.name)}</option>`).join('');
  return `<section class="t-panel" id="proj-${p.id}"><div class="t-panel-head"><div><h2>${esc(p.name)}${p.done ? ' <span class="t-tag t-ok">Finished</span>' : ''}</h2>${p.note ? `<p class="t-small t-muted">${esc(p.note)}</p>` : ''}</div>
      <div class="t-actions"><button class="t-btn t-btn-secondary t-btn-sm" data-act="edit-project" data-id="${p.id}">Edit estimate</button><button class="t-btn t-btn-quiet t-btn-sm" data-act="new-payment" data-id="${p.id}">${icon('plus')}Add a payment</button></div></div>
    <div class="m-split"><div class="t-stat"><span class="t-small t-muted">Estimate</span><span class="t-value">${r.estimate ? gbpStr(r.estimate) : '–'}</span></div><div class="t-stat"><span class="t-small t-muted">Paid</span><span class="t-value">${gbpStr(r.paid)}</span></div><div class="t-stat"><span class="t-small t-muted">${leftLabel}</span><span class="t-value ${r.state === 'over' ? 't-over' : ''}">${r.estimate ? gbpStr(Math.abs(r.left)) : '–'}</span></div></div>
    ${r.estimate ? `<div class="t-meter m-top-gap" data-state="${r.state}" role="img" aria-label="${Math.round((r.share || 0) * 100)}% of the estimate paid"><span style="width:${Math.min(100, (r.share || 0) * 100)}%"></span></div>` : `<div class="t-notice m-top-gap">${icon('info')}<span>No estimate yet. “Edit estimate” to list what it needs and what you think each part will cost.</span></div>`}
    ${items.length || r.unplanned ? `<div class="t-table-wrap m-top-gap"><table class="t-table"><thead><tr><th>Item</th><th class="t-r">Estimate</th><th class="t-r">Paid</th><th class="t-r">Left</th></tr></thead><tbody>
      ${r.rows.map((x) => `<tr><td>${esc(x.item.name)}${x.item.note ? `<div class="t-xs t-faint">${esc(x.item.note)}</div>` : ''}</td><td class="t-r t-num">${x.estimate ? gbpStr(x.estimate) : '–'}</td><td class="t-r t-num">${gbpStr(x.paid)}</td><td class="t-r">${x.estimate ? `<span class="t-avail" data-state="${x.over ? 'over' : 'ok'}">${x.over ? 'Over ' : ''}${gbpStr(Math.abs(x.left))}</span>` : '–'}</td></tr>`).join('')}
      ${r.unplanned ? `<tr><td>Not linked to an item<div class="t-xs t-faint">Pick the item in Payments below.</div></td><td class="t-r t-num">–</td><td class="t-r t-num">${gbpStr(r.unplanned)}</td><td class="t-r">–</td></tr>` : ''}
    </tbody><tfoot><tr><td>Total</td><td class="t-r t-num">${gbpStr(r.estimate)}</td><td class="t-r t-num">${gbpStr(r.paid)}</td><td class="t-r t-num">${r.estimate ? (r.left < 0 ? 'Over ' : '') + gbpStr(Math.abs(r.left)) : '–'}</td></tr></tfoot></table></div>` : ''}
    <details class="m-top-gap" ${r.lines.length && r.lines.length <= 6 ? 'open' : ''}><summary class="t-small"><strong>Payments (${r.lines.length})</strong></summary>
      ${r.lines.length ? `<ul class="t-list">${r.lines.map((l) => `<li class="t-row m-pay-row"><div><div class="t-main-line">${esc(l.payee)}</div><div class="t-meta">${longDate(l.date)} · ${l.source === 'bank' ? 'Bank line' : 'Paid elsewhere'}${l.note && l.source === 'bank' ? ' · ' + esc(l.note) : ''}</div></div>
        ${items.length ? `<select class="t-select" aria-label="Item this paid for" data-pitem="${p.id}" ${l.source === 'bank' ? `data-txn="${l.txn_id}" data-part="${l.part ?? ''}"` : `data-pay="${l.id}"`}>${itemOpts(l.item_id)}</select>` : ''}
        <div class="t-actions">${amt(-l.amount, l.currency, l.date)}${l.source === 'manual' ? `<button class="t-icon-btn" data-act="del-payment" data-id="${p.id}" data-pay="${l.id}" aria-label="Remove this payment">${icon('trash')}</button>` : ''}</div></li>`).join('')}</ul>` : '<p class="t-muted t-small">Nothing paid yet.</p>'}
    </details></section>`;
}
const pItemRow = (it = {}) => `<div class="m-pline" data-pi="${it.id || ''}"><input class="t-input" data-p="name" placeholder="What, e.g. Units and worktop" value="${esc(it.name || '')}" aria-label="Item"><input class="t-input t-num" data-p="estimate" inputmode="decimal" placeholder="0.00" value="${it.estimate ? (it.estimate / 100).toFixed(2) : ''}" aria-label="Estimate in pounds"><button class="t-icon-btn" data-act="del-pitem" aria-label="Remove this item">${icon('trash')}</button></div>`;
function projectSheet(id) {
  const p = id ? L.projects.find((x) => x.id === id) : { name: '', note: '', items: [], done: false };
  sheet(id ? `${esc(p.name)}: estimate` : 'Add a project', `<div class="t-form">
    <label class="t-field"><span>Name</span><input class="t-input" id="p-name" value="${esc(p.name)}"></label>
    <label class="t-field"><span>Note</span><input class="t-input" id="p-note" value="${esc(p.note || '')}"></label>
    <div class="t-field"><span>What it needs, and what you think each part will cost (pounds)</span><div class="m-lines" id="pitems">${(p.items?.length ? p.items : [{}]).map(pItemRow).join('')}</div>
      <div class="t-actions"><button class="t-btn t-btn-secondary t-btn-sm" data-act="add-pitem">${icon('plus')}Add an item</button><span class="t-help" id="p-total"></span></div></div>
    ${id ? `<label class="t-check"><input type="checkbox" id="p-done" ${p.done ? 'checked' : ''}>Finished (kept, but off the overview)</label>` : ''}
    <div class="t-actions"><button class="t-btn t-btn-primary" data-act="save-project" data-id="${id || ''}">Save</button><button class="t-btn t-btn-secondary" data-act="close">Cancel</button></div></div>`);
  const total = () => { if (!$('#p-total')) return; const t = [...document.querySelectorAll('#pitems [data-p=estimate]')].reduce((s, el) => s + (parseAmount(el.value) || 0), 0); $('#p-total').textContent = `Estimate ${gbpStr(t)}`; };
  $('#sheet').addEventListener('input', total); total();
}
function saveProject(id) {
  const name = $('#p-name').value.trim(); if (!name) { toast('A project needs a name.'); return; }
  const p = id ? L.projects.find((x) => x.id === id) : { id: 'p-' + uid().slice(0, 8), started: todayISO(), budget: null, payments: [] };
  const was = id ? JSON.parse(JSON.stringify(p)) : null;
  p.name = name; p.note = $('#p-note').value.trim(); p.done = !!$('#p-done')?.checked;
  p.items = [...document.querySelectorAll('#pitems .m-pline')].map((r) => ({ id: r.dataset.pi || 'i-' + uid().slice(0, 8), name: r.querySelector('[data-p=name]').value.trim(), estimate: parseAmount(r.querySelector('[data-p=estimate]').value) || 0 }))
    .filter((i) => i.name || i.estimate).map((i) => ({ ...i, name: i.name || 'Unnamed', note: (was?.items || []).find((o) => o.id === i.id)?.note || '' }));
  if (!id) L.projects.push(p);
  closeSheet();
  commit({ projects: { upsert: [p] } }, id ? 'Estimate saved' : 'Project added', was ? () => { Object.assign(p, was); commit({ projects: { upsert: [p] } }, 'Put back'); } : null);
}
function paymentSheet(pid) {
  const p = L.projects.find((x) => x.id === pid);
  sheet(`${esc(p.name)}: add a payment`, `<div class="t-form"><p class="t-small t-muted">For costs paid another way: cash, a card or account not brought in here. Bank lines already here are tagged with the project instead.</p>
    <div class="t-form t-2"><label class="t-field"><span>Date</span><input class="t-input" type="date" id="pay-date" value="${todayISO()}"></label><label class="t-field"><span>Amount</span><input class="t-input t-num" id="pay-amount" inputmode="decimal" placeholder="0.00"></label>
    <label class="t-field"><span>Currency</span><select class="t-select" id="pay-cur"><option>GBP</option><option>EUR</option></select></label>
    <label class="t-field"><span>Item</span><select class="t-select" id="pay-item"><option value="">No item</option>${(p.items || []).map((i) => `<option value="${i.id}">${esc(i.name)}</option>`).join('')}</select></label></div>
    <label class="t-field"><span>What and who</span><input class="t-input" id="pay-note" placeholder="Electrician, cash"></label>
    <div class="t-actions"><button class="t-btn t-btn-primary" data-act="save-payment" data-id="${pid}">Save</button><button class="t-btn t-btn-secondary" data-act="close">Cancel</button></div></div>`);
}
function savePayment(pid) {
  const p = L.projects.find((x) => x.id === pid), amount = parseAmount($('#pay-amount').value), date = $('#pay-date').value;
  if (!amount || !date) { toast('Enter a date and an amount.'); return; }
  const m = { id: 'm-' + uid().slice(0, 8), date, amount, currency: $('#pay-cur').value, note: $('#pay-note').value.trim(), item_id: $('#pay-item').value || null };
  (p.payments ||= []).push(m); closeSheet();
  commit({ projects: { upsert: [p] } }, 'Payment added', () => { p.payments = p.payments.filter((x) => x.id !== m.id); commit({ projects: { upsert: [p] } }, 'Put back'); });
}
function setLineItem(el) {
  const p = L.projects.find((x) => x.id === el.dataset.pitem), v = el.value || null;
  if (el.dataset.pay) { const m = (p.payments || []).find((x) => x.id === el.dataset.pay); if (m) { m.item_id = v; commit({ projects: { upsert: [p] } }); } return; }
  const t = L.txns.find((x) => x.id === el.dataset.txn); if (!t) return;
  if (el.dataset.part !== '' && t.splits?.[+el.dataset.part]) t.splits[+el.dataset.part].item_id = v; else t.item_id = v;
  t.locked = [...new Set([...(t.locked || []), 'item_id'])];
  commit({ txns: { upsert: [t] } });
}

// ---------- France ----------
function france() {
  const fx = { ...fxo(), mode: 'day' };
  const rows = businessByMonth(L.txns, ui.year, fx);
  const tot = rows.reduce((s, r) => ({ in: s.in + r.in, out: s.out + r.out, inGBP: s.inGBP + r.inGBP, outGBP: s.outGBP + r.outGBP }), { in: 0, out: 0, inGBP: 0, outGBP: 0 });
  const cats = {};
  L.txns.filter((t) => t.scope === 'business' && !t.transfer_id && t.status !== 'void' && t.date.startsWith(String(ui.year))).forEach((t) => { const k = t.bucket_id || '_none'; cats[k] = (cats[k] || 0) + t.amount; });
  const hol = L.txns.filter((t) => t.scope === 'holiday' && t.status !== 'void' && t.date.startsWith(String(ui.year)));
  const holTot = hol.reduce((s, t) => s + t.amount, 0);
  const cell = (v) => `<td class="t-r">${amt(v, 'EUR', null)}</td>`;
  const cellDay = (eur, gbp) => `<td class="t-r"><span class="t-amt"><span class="t-orig">${fmt(eur, 'EUR')}</span>${L.settings.show !== 'orig' ? `<span class="t-gbp">${fmt(gbp)} on the day</span>` : ''}</span></td>`;
  return appbar('France', `<div class="m-month"><button class="t-icon-btn" data-act="year" data-d="-1" aria-label="Previous year">${icon('left')}</button><strong>${ui.year}</strong><button class="t-icon-btn" data-act="year" data-d="1" aria-label="Next year">${icon('right')}</button></div>`) + `
  <p class="t-small t-muted" style="margin-bottom:var(--s4)">The CMB accounts are the gîtes’ money. Everything spent from them is a gîte cost unless it falls in your holiday dates, when it counts as joint holiday spending instead. Euros are exact (the bank’s figures, for URSSAF and the accountant); pounds use the rate on each day.</p>
  <section class="t-panel"><div class="t-panel-head"><h2>Month by month</h2>${showSeg()}</div><div class="t-table-wrap"><table class="t-table"><thead><tr><th>Month</th><th class="t-r">In</th><th class="t-r">Costs</th><th class="t-r">Net</th></tr></thead><tbody>
  ${rows.length ? rows.map((r) => `<tr><td>${monthName(r.month).split(' ')[0]}</td>${cellDay(r.in, r.inGBP)}${cellDay(r.out, r.outGBP)}${cellDay(r.in + r.out, r.inGBP + r.outGBP)}</tr>`).join('') : `<tr><td colspan="4" class="t-muted">No gîte transactions in ${ui.year}.</td></tr>`}
  </tbody>${rows.length ? `<tfoot><tr><td>Year</td>${cellDay(tot.in, tot.inGBP)}${cellDay(tot.out, tot.outGBP)}${cellDay(tot.in + tot.out, tot.inGBP + tot.outGBP)}</tr></tfoot>` : ''}</table></div>
  <p class="t-xs t-faint m-top-gap">Bank lines only. Vrbo pays out net of commission, so “In” here is what reached CMB, not the gross turnover URSSAF counts. The gross figures stay on the owner page.</p></section>
  <div class="t-grid t-2 m-top-gap">
    <section class="t-panel"><h2>Costs by kind</h2><ul class="t-list">${Object.entries(cats).filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]).map(([k, v]) => `<li class="t-row"><span>${esc(bucket(k)?.name || 'Not yet sorted')}</span>${cell(v).replace(/<\/?td[^>]*>/g, '')}</li>`).join('') || '<li class="t-muted t-small">None yet.</li>'}</ul></section>
    <section class="t-panel"><div class="t-panel-head"><h2>Holiday dates</h2><button class="t-btn t-btn-secondary t-btn-sm" data-act="new-holiday">${icon('plus')}Add</button></div>
      <ul class="t-list">${L.holidays.length ? [...L.holidays].sort((a, b) => b.start.localeCompare(a.start)).map((h) => `<li class="t-row"><div><div class="t-main-line">${esc(h.label || 'Family holiday')}</div><div class="t-meta">${longDate(h.start)} to ${longDate(h.end)}${h.account_ids?.length ? ' · ' + esc(h.account_ids.map((id) => acct(id)?.name || '').join(', ')) : ''}</div></div><button class="t-icon-btn" data-act="del-holiday" data-id="${h.id}" aria-label="Remove ${esc(h.label || 'holiday')}">${icon('trash')}</button></li>`).join('') : '<li class="t-muted t-small">None yet. Add the dates you are there, and spending from the French accounts in those dates is counted as holiday, not gîte cost.</li>'}</ul>
      <p class="t-small m-top-gap">Holiday spending in ${ui.year}: ${amt(holTot, 'EUR')}</p></section>
  </div>`;
}

// ---------- settings ----------
function settings() {
  const s = L.settings, rate = latestRate(s.rates, 'EUR'), cfg = store.serverConfig();
  const seg = (k, opts) => `<div class="t-seg" role="group">${opts.map(([v, l]) => `<button data-act="set" data-k="${k}" data-v="${v}" aria-pressed="${s[k] === v}">${l}</button>`).join('')}</div>`;
  return appbar('Settings') + `<div class="t-grid t-2">
  <section class="t-panel"><h2>Currency</h2><div class="t-form">
    <div class="t-field"><span>Show euro amounts as</span>${seg('show', [['both', 'Euros and pounds'], ['orig', 'Euros only'], ['gbp', 'Pounds first']])}</div>
    <div class="t-field"><span>Convert to pounds at</span>${seg('fxMode', [['today', 'Today’s rate'], ['day', 'Rate on the day']])}<span class="t-help">Today’s rate: what it is all worth now. Rate on the day: what it cost then. The France page always uses the rate on the day.</span></div>
    <p class="t-small">${rate ? `€1 = £${rate.rate.toFixed(4)} (European Central Bank, ${longDate(rate.date)}).` : 'No rate yet.'} <button class="t-btn t-btn-quiet t-btn-sm" data-act="rates">Update rates</button></p></div></section>
  <section class="t-panel"><h2>Where the ledger is kept</h2><p class="t-small t-muted">${cfg ? `Server: ${esc(cfg.url)}. This device keeps a copy.` : 'On this device only, until the server is switched on.'} Now reading from: ${esc(WHERE)}.</p>
    <div class="t-form m-top-gap"><label class="t-field"><span>Server address</span><input class="t-input" id="srv-url" placeholder="https://….supabase.co/functions/v1/money" value="${esc(cfg?.url || SERVER)}"></label><label class="t-field"><span>Money key</span><input class="t-input" id="srv-key" type="password" autocomplete="off" value="${esc(cfg?.key || '')}"></label>
    <div class="t-actions"><button class="t-btn t-btn-secondary" data-act="srv-save">Connect</button>${cfg ? '<button class="t-btn t-btn-secondary" data-act="srv-push">Send this device’s ledger to the server</button><button class="t-btn t-btn-quiet" data-act="srv-off">Disconnect</button>' : ''}</div></div>
    <div class="t-actions m-top-gap"><button class="t-btn t-btn-secondary" data-act="export">Download a backup</button></div></section>
  </div>
  <section class="t-panel m-top-gap"><div class="t-panel-head"><h2>Accounts</h2><button class="t-btn t-btn-secondary t-btn-sm" data-act="new-account">${icon('plus')}Add</button></div>
    <div class="t-table-wrap"><table class="t-table"><thead><tr><th>Name</th><th>Bank</th><th>Last 4</th><th>Balance</th><th>on</th><th>Currency</th><th>Whose by default</th><th>Kind</th><th></th></tr></thead><tbody>
    ${L.accounts.map((a) => `<tr data-acc="${a.id}"><td><input class="t-input" data-a="name" value="${esc(a.name)}" aria-label="Name"></td><td><input class="t-input" data-a="bank" value="${esc(a.bank || '')}" aria-label="Bank"></td><td><input class="t-input" data-a="number_tail" value="${esc(a.number_tail || '')}" maxlength="4" style="width:72px" aria-label="Last 4 digits"></td>
      <td><input class="t-input t-num" data-a="anchor_amount" inputmode="decimal" style="width:120px" value="${a.anchor ? (a.anchor.amount / 100).toFixed(2) : ''}" aria-label="Balance from the bank"></td><td><input class="t-input" type="date" data-a="anchor_date" value="${a.anchor?.date || ''}" aria-label="Balance date"></td>
      <td><select class="t-select" data-a="currency" aria-label="Currency"><option ${a.currency === 'GBP' ? 'selected' : ''}>GBP</option><option ${a.currency === 'EUR' ? 'selected' : ''}>EUR</option></select></td>
      <td><select class="t-select" data-a="owner" aria-label="Whose">${PEOPLE.map((p) => `<option value="${p.id}" ${a.owner === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}</select></td>
      <td><select class="t-select" data-a="scope" aria-label="Kind"><option value="household" ${a.scope === 'household' ? 'selected' : ''}>Household</option><option value="business" ${a.scope === 'business' ? 'selected' : ''}>Gîte business</option></select></td>
      <td><label class="t-check"><input type="checkbox" data-a="archived" ${a.archived ? 'checked' : ''}>Hide</label></td></tr>`).join('')}</tbody></table></div>
    <div class="t-actions m-top-gap"><button class="t-btn t-btn-primary" data-act="save-accounts">Save accounts</button></div></section>
  <section class="t-panel m-top-gap"><div class="t-panel-head"><h2>Buckets</h2><button class="t-btn t-btn-secondary t-btn-sm" data-act="new-bucket">${icon('plus')}Add</button></div>
    <div class="t-table-wrap"><table class="t-table"><thead><tr><th>Name</th><th>Group</th><th class="t-r">Monthly target</th><th>Carry over</th><th></th></tr></thead><tbody>
    ${L.buckets.map((b) => `<tr data-bk="${b.id}"><td><input class="t-input" data-b="name" value="${esc(b.name)}" aria-label="Name"></td><td><input class="t-input" data-b="group" value="${esc(b.group)}" aria-label="Group"></td><td class="t-r"><input class="t-input t-num" data-b="target" inputmode="decimal" style="width:110px" value="${b.target ? (b.target / 100).toFixed(2) : ''}" aria-label="Target"></td><td><input type="checkbox" data-b="rollover" ${b.rollover !== false ? 'checked' : ''} aria-label="Carry over"></td><td><label class="t-check"><input type="checkbox" data-b="archived" ${b.archived ? 'checked' : ''}>Hide</label></td></tr>`).join('')}</tbody></table></div>
    <div class="t-actions m-top-gap"><button class="t-btn t-btn-primary" data-act="save-buckets">Save buckets</button></div></section>
  <div class="t-grid t-2 m-top-gap">
  <section class="t-panel"><h2>Rules</h2><p class="t-small t-muted">Made when you tick “Always” in review. Auto rules file silently; the others only suggest.</p><ul class="t-list">${L.rules.map((r) => `<li class="t-row"><div><div class="t-main-line">${esc(r.match.value || 'everything')}${r.match.direction ? (r.match.direction === 'in' ? ' (money in)' : ' (money out)') : ''}</div><div class="t-meta">→ ${esc(bucket(r.set.bucket_id)?.name || '')} ${r.set.owner ? who(r.set.owner) : ''} ${r.set.scope ? esc(r.set.scope) : ''}</div></div><div class="t-actions"><label class="t-check"><input type="checkbox" data-act="rule-auto" data-id="${r.id}" ${r.auto ? 'checked' : ''}>Auto</label><button class="t-icon-btn" data-act="del-rule" data-id="${r.id}" aria-label="Delete rule">${icon('trash')}</button></div></li>`).join('')}</ul></section>
  <section class="t-panel"><div class="t-panel-head"><h2>Projects</h2><a class="t-btn t-btn-secondary t-btn-sm" href="#projects">Open projects</a></div><ul class="t-list">${L.projects.map((p) => `<li class="t-row"><div><div class="t-main-line">${esc(p.name)}</div><div class="t-meta">${esc(p.note || '')}${p.done ? ' · Finished' : ''}</div></div></li>`).join('')}</ul></section>
  </div>`;
}
function more() {
  return appbar('More') + `<section class="t-panel"><ul class="t-list">${VIEWS.filter(([id]) => !PHONE.includes(id)).map(([id, l, i]) => `<li class="t-row t-clickable" onclick="location.hash='${id}'"><a href="#${id}" style="display:flex;gap:var(--s3);align-items:center;color:inherit;text-decoration:none;font-weight:600">${icon(i)}${l}</a></li>`).join('')}</ul></section>`;
}

// ---------- sheet & toast ----------
function sheet(title, body) {
  $('#sheet').innerHTML = `<div class="t-sheet-head"><h2 id="sheet-title">${title}</h2><button class="t-icon-btn" data-act="close" aria-label="Close">${icon('close')}</button></div>${body}`;
  $('#sheet').dataset.open = 'true'; $('#scrim').dataset.open = 'true';
  setTimeout(() => ($('#sheet .t-form input, #sheet .t-form select') || $('#sheet').querySelector('input,select,button'))?.focus(), 50);
}
function closeSheet() { $('#sheet').dataset.open = 'false'; $('#scrim').dataset.open = 'false'; }
let toastTimer;
function toast(msg, undo) {
  const t = $('#toast'); t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button">Undo</button>' : ''}`;
  if (undo) t.querySelector('button').onclick = () => { t.dataset.open = 'false'; undo(); };
  t.dataset.open = 'true'; clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.dataset.open = 'false'), undo ? 6000 : 3000);
}

// ---------- actions ----------
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act],[data-edit-who]'); if (!el) return;
  if (el.dataset.editWho) { el.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === el)); return; }
  const a = el.dataset.act, id = el.dataset.id;
  if (el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type !== 'checkbox')) return;
  const T = id && L.txns.find((t) => t.id === id);
  switch (a) {
    case 'month': ui.month = addMonths(ui.month, +el.dataset.d); render(); break;
    case 'year': ui.year += +el.dataset.d; render(); break;
    case 'show': L.settings.show = el.dataset.v; commit({ settings: {} }); break;
    case 'joint': L.settings.jointView = el.dataset.v; commit({ settings: {} }); break;
    case 'set': L.settings[el.dataset.k] = el.dataset.v; commit({ settings: {} }); break;
    case 'who': T.owner = el.dataset.v; T.locked = [...new Set([...(T.locked || []), 'owner'])]; el.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === el)); break;
    case 'confirm': confirmTxn(T, document.querySelector(`[data-always="${id}"]`)?.checked); break;
    case 'confirm-all': { const ready = L.txns.filter((t) => t.status === 'review' && t.bucket_id); ready.forEach((t) => { t.status = 'done'; }); commit({ txns: { upsert: ready } }, `${ready.length} confirmed`, () => { ready.forEach((t) => (t.status = 'review')); commit({ txns: { upsert: ready } }, 'Put back'); }); break; }
    case 'open-txn': openTxn(id); break;
    case 'save-txn': saveTxn(id); break;
    case 'add-split': { const t = L.txns.find((x) => x.id === $('[data-act=save-txn]').dataset.id); $('#splits').insertAdjacentHTML('beforeend', splitRow({}, $('#splits').children.length, t)); break; }
    case 'add-rline': $('#rlines').insertAdjacentHTML('beforeend', splitRow({}, $('#rlines').children.length, { scope: 'household' })); break;
    case 'close': closeSheet(); break;
    case 'filter-bucket': ui.bucket = id; ui.q = ''; ui.acc = ''; break;
    case 'do-import': doImport(+el.dataset.i); break;
    case 'drop-pend': ui.pending.splice(+el.dataset.i, 1); render(); break;
    case 'undo-import': undoImport(id); break;
    case 'new-receipt': receiptSheet(); break;
    case 'edit-receipt': receiptSheet(id); break;
    case 'save-receipt': saveReceipt(id); break;
    case 'del-receipt': { const r = L.receipts.find((x) => x.id === id); if (!confirm(`Delete the ${r.merchant} receipt?`)) break; const t = L.txns.find((x) => x.receipt_id === id); if (t) { t.receipt_id = null; t.splits = null; } L.receipts = L.receipts.filter((x) => x.id !== id); commit({ receipts: { delete: [id] }, txns: { upsert: t ? [t] : [] } }, 'Receipt deleted'); break; }
    case 'match-receipt': { const r = L.receipts.find((x) => x.id === id), t = L.txns.find((x) => x.id === el.dataset.t); const ch = { txns: { upsert: [] }, receipts: { upsert: [] } }; applyReceipt(r, t, ch); commit(ch, 'Matched'); break; }
    case 'copy-last': copyLastMonth(); break;
    case 'new-holiday': holidaySheet(); break;
    case 'save-holiday': saveHoliday(); break;
    case 'del-holiday': L.holidays = L.holidays.filter((h) => h.id !== id); reclassifyFrench(); commit({ holidays: { delete: [id] }, txns: { upsert: L.txns.filter((t) => acct(t.account_id)?.scope === 'business') } }, 'Holiday removed'); break;
    case 'rates': refreshRates(true, true); break;
    case 'srv-save': { const url = $('#srv-url').value.trim(), key = $('#srv-key').value.trim(); if (!url || !key) { toast('Enter the address and the key.'); break; } store.setServerConfig({ url, key }); boot('Connected'); break; }
    case 'srv-off': store.setServerConfig(null); boot('Disconnected: this device only'); break;
    case 'srv-push': store.pushAll(L).then(() => toast('Sent to the server')).catch((er) => toast('Could not send: ' + er.message)); break;
    case 'export': { const blob = new Blob([store.exportJSON(L)], { type: 'application/json' }); const u = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = u; link.download = `money-backup-${todayISO()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); break; }
    case 'save-accounts': saveTable('acc', L.accounts, 'a', 'accounts'); break;
    case 'save-buckets': saveTable('bk', L.buckets, 'b', 'buckets'); break;
    case 'new-account': { const n = { id: uid(), name: 'New account', bank: '', currency: 'GBP', kind: 'current', owner: 'joint', scope: 'household', number_tail: null, opening: 0, anchor: null }; L.accounts.push(n); commit({ accounts: { upsert: [n] } }); break; }
    case 'new-bucket': { const n = { id: 'b-' + uid().slice(0, 8), name: 'New bucket', group: 'Everyday', kind: 'spend', target: null, rollover: true, archived: false }; L.buckets.push(n); commit({ buckets: { upsert: [n] } }); break; }
    case 'new-project': projectSheet(); break;
    case 'edit-project': projectSheet(id); break;
    case 'save-project': saveProject(id); break;
    case 'add-pitem': $('#pitems').insertAdjacentHTML('beforeend', pItemRow()); $('#pitems .m-pline:last-child input').focus(); break;
    case 'del-pitem': el.closest('.m-pline').remove(); $('#sheet').dispatchEvent(new Event('input')); break;
    case 'new-payment': paymentSheet(id); break;
    case 'save-payment': savePayment(id); break;
    case 'del-payment': { const p = L.projects.find((x) => x.id === id); const m = p.payments.find((x) => x.id === el.dataset.pay); p.payments = p.payments.filter((x) => x !== m); commit({ projects: { upsert: [p] } }, 'Payment removed', () => { p.payments.push(m); commit({ projects: { upsert: [p] } }, 'Put back'); }); break; }
    case 'del-rule': L.rules = L.rules.filter((r) => r.id !== id); commit({ rules: { delete: [id] } }, 'Rule deleted'); break;
    case 'rule-auto': { const r = L.rules.find((x) => x.id === id); r.auto = el.checked; commit({ rules: { upsert: [r] } }); break; }
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSheet();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.t-row[data-act=open-txn]')) { e.preventDefault(); openTxn(e.target.dataset.id); }
});
$('#scrim').addEventListener('click', closeSheet);
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.filter) { ui[el.dataset.filter] = el.type === 'checkbox' ? el.checked : el.value; render(); return; }
  if (el.dataset.pitem) { setLineItem(el); return; }
  if (el.dataset.assign) { setAssign(el.dataset.assign, parseAmount(el.value) || 0); return; }
  // Keep an account choice on a waiting file, so bringing in another file doesn't reset it.
  if (el.dataset.pend != null) { const s = ui.pending[+el.dataset.pend]?.statements[+el.dataset.stmt]; if (s) s.accountId = el.value; return; }
  const id = el.dataset.id, T = id && L.txns.find((t) => t.id === id);
  if (!T) return;
  const lock = (k) => (T.locked = [...new Set([...(T.locked || []), k])]);
  if (el.dataset.act === 'bucket') { T.bucket_id = el.value || null; lock('bucket_id'); }
  if (el.dataset.act === 'project') { T.project_id = el.value || null; lock('project_id'); }
  if (el.dataset.act === 'scope') { T.scope = el.value; lock('scope'); render(); }
});
document.addEventListener('input', (e) => { if (e.target.dataset.filter === 'q') { ui.q = e.target.value; clearTimeout(window._q); window._q = setTimeout(() => { const pos = e.target.selectionStart; render(); const s = $('[data-filter=q]'); s.focus(); s.setSelectionRange(pos, pos); }, 250); } });

function confirmTxn(t, always) {
  if (!t.bucket_id && !t.transfer_id) { toast('Choose a bucket first.'); return; }
  t.status = 'done'; t.locked = [...new Set([...(t.locked || []), 'status', 'bucket_id', 'owner'])];
  const changes = { txns: { upsert: [t] } };
  if (always) {
    const r = { ...ruleFromTransaction(t), id: 'r-' + uid().slice(0, 8) };
    L.rules = L.rules.filter((x) => !(x.match.op === 'key' && x.match.value === r.match.value && x.match.direction === r.match.direction));
    L.rules.push(r); changes.rules = { upsert: [r] };
    // File the rest of this payee's waiting transactions the same way.
    const acc = acct(t.account_id);
    L.txns.filter((x) => x.status === 'review' && x.id !== t.id).forEach((x) => { const before = x.bucket_id; classify(x, { account: acct(x.account_id), holidays: L.holidays, rules: [r] }); if (x.rule_id === r.id) { x.status = x.flag ? 'review' : 'done'; changes.txns.upsert.push(x); } else x.bucket_id = before; });
  }
  commit(changes, always ? `Done. ${t.payee} will be filed the same way from now on.` : 'Done');
}
function setAssign(bucketId, amount) {
  const key = `${ui.month}|${bucketId}`;
  let a = L.allocations.find((x) => x.id === key);
  if (!a) { a = { id: key, month: ui.month, bucket_id: bucketId, amount: 0 }; L.allocations.push(a); }
  a.amount = amount; commit({ allocations: { upsert: [a] } });
}
function copyLastMonth() {
  const prev = addMonths(ui.month, -1), src = L.allocations.filter((a) => a.month === prev && a.amount);
  if (!src.length) { toast(`Nothing was assigned in ${monthName(prev)}.`); return; }
  const up = src.map((s) => { const key = `${ui.month}|${s.bucket_id}`; let a = L.allocations.find((x) => x.id === key); if (!a) { a = { id: key, month: ui.month, bucket_id: s.bucket_id, amount: 0 }; L.allocations.push(a); } a.amount = s.amount; return a; });
  commit({ allocations: { upsert: up } }, `Copied ${up.length} amounts from ${monthName(prev)}`);
}
function saveTable(rowAttr, list, fieldAttr, coll) {
  const up = [];
  document.querySelectorAll(`[data-${rowAttr}]`).forEach((tr) => {
    const o = list.find((x) => x.id === tr.dataset[rowAttr]); if (!o) return;
    tr.querySelectorAll(`[data-${fieldAttr}]`).forEach((f) => {
      const k = f.dataset[fieldAttr];
      o[k] = f.type === 'checkbox' ? f.checked : k === 'target' ? parseAmount(f.value) : f.value.trim() || null;
    });
    if (o.name == null) o.name = 'Unnamed';
    // Balance as the bank shows it on a date: the anchor every balance is worked from.
    if ('anchor_amount' in o) {
      const amt = parseAmount(o.anchor_amount), d = o.anchor_date;
      o.anchor = amt != null && d ? { amount: amt, date: d, manual: true } : o.anchor_amount === null ? null : o.anchor;
      delete o.anchor_amount; delete o.anchor_date;
    }
    up.push(o);
  });
  if (coll === 'accounts') reclassifyFrench();
  commit({ [coll]: { upsert: up }, ...(coll === 'accounts' ? { txns: { upsert: L.txns } } : {}) }, 'Saved');
}
function holidaySheet() {
  sheet('Add holiday dates', `<div class="t-form"><label class="t-field"><span>Name</span><input class="t-input" id="h-label" placeholder="Summer at the gîtes"></label><div class="t-form t-2"><label class="t-field"><span>From</span><input class="t-input" type="date" id="h-start"></label><label class="t-field"><span>To</span><input class="t-input" type="date" id="h-end"></label></div>
  <label class="t-field"><span>Spent from</span><select class="t-select" id="h-acc">${L.accounts.filter((a) => a.scope === 'business' && !a.archived).map((a) => `<option value="${a.id}" ${a.id === 'acc-cmb-2' ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}<option value="">All French accounts</option></select><span class="t-help">The account the trip was paid from. Bills and booking money on the other account stay gîte business.</span></label>
  <p class="t-help">French-account spending in these dates moves from gîte business to France holiday, and is flagged so you can check each line.</p><div class="t-actions"><button class="t-btn t-btn-primary" data-act="save-holiday">Save</button><button class="t-btn t-btn-secondary" data-act="close">Cancel</button></div></div>`);
}
function saveHoliday() {
  const acc = $('#h-acc').value;
  const h = { id: uid(), label: $('#h-label').value.trim(), start: $('#h-start').value, end: $('#h-end').value, account_ids: acc ? [acc] : [] };
  if (!h.start || !h.end || h.end < h.start) { toast('Enter a start and an end date.'); return; }
  L.holidays.push(h); const n = reclassifyFrench(); closeSheet();
  commit({ holidays: { upsert: [h] }, txns: { upsert: L.txns.filter((t) => acct(t.account_id)?.scope === 'business') } }, `Holiday added${n ? `: ${n} line${n === 1 ? '' : 's'} now count as holiday` : ''}`);
}
// Re-run the defaults on French lines a person has not set by hand. Transfers
// between our own accounts are left alone: they are not spending, and re-running
// them sent filed transfers back to review (25 Nov 2026, after a balance was set
// in Settings). A line whose status is locked keeps its question; one filed by
// an auto rule stays filed, as in tools/plan.js.
function reclassifyFrench() {
  let n = 0;
  for (const t of L.txns) {
    const a = acct(t.account_id), locked = t.locked || [];
    if (a?.scope !== 'business' || t.transfer_id || t.status === 'void' || locked.includes('scope')) continue;
    const before = t.scope;
    if (!locked.includes('status')) t.flag = null;
    classify(t, { account: a, holidays: L.holidays, rules: L.rules });
    const r = L.rules.find((x) => x.id === t.rule_id);
    if (!locked.includes('status') && r?.auto && (t.bucket_id || t.splits)) { t.status = 'done'; t.flag = null; }
    if (t.scope === 'holiday' && before !== 'holiday') n++;
  }
  return n;
}

async function refreshRates(force, loud) {
  const s = L.settings, age = s.ratesFetched ? Date.now() - Date.parse(s.ratesFetched) : Infinity;
  if (!force && age < 6 * 3600e3) return;
  const eur = L.txns.filter((t) => t.currency === 'EUR').map((t) => t.date).sort()[0];
  try {
    const now = await fetchRates({ currencies: ['EUR'] });
    const hist = eur ? await fetchRates({ currencies: ['EUR'], from: eur }) : {};
    s.rates = mergeRates(mergeRates(s.rates, hist), now); s.ratesFetched = new Date().toISOString();
    await store.save(L, { settings: {} }); render();
    if (loud) toast('Rates updated');
  } catch (e) { if (loud) toast('Could not reach the rates service. Using the last rates saved.'); }
}

// A one-time connect link: #connect=<key> saves the server and key on this
// device, then the key is wiped from the address bar and history.
const SERVER = 'https://uftlxeahciewiitclkbu.supabase.co/functions/v1/money';
function takeConnectLink() {
  const m = location.hash.match(/^#connect=([A-Za-z0-9]{20,})$/);
  if (!m) return false;
  store.setServerConfig({ url: SERVER, key: m[1] });
  history.replaceState(null, '', location.pathname + '#overview');
  return true;
}

async function boot(msg) {
  if (takeConnectLink()) msg = 'This device is connected';
  const r = await store.load(); L = r.ledger; WHERE = r.where;
  ui.view = location.hash.slice(1) || 'overview';
  render(); if (msg) toast(msg);
  refreshRates(false);
}
boot();
// A tab left open keeps running the code it loaded. publish.sh writes
// version.json; when the tab comes back into view and the live version has
// changed, reload so the page never mixes old code with new data. Every change
// is saved as it is made, so a reload loses nothing.
let builtAs = null;
const liveVersion = () => fetch('version.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => j?.v || null).catch(() => null);
liveVersion().then((v) => { builtAs = v; });
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !builtAs) return;
  const v = await liveVersion();
  if (v && v !== builtAs) location.reload();
});
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
