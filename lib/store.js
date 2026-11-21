// Where the ledger is kept. Two homes, one shape:
//  - this device (IndexedDB), the default until the server is switched on;
//  - the money edge function in Open Brain's Supabase, once its address and key
//    are entered in Settings. Then this device is a cache and the server is the
//    record, so the Mac and the phone see the same ledger.
// The page always works from an in-memory copy and saves the collections it
// changed.
import { emptyLedger } from './seed.js';

const DB = 'money-ledger', STORE = 'kv', COLLECTIONS = ['accounts', 'txns', 'buckets', 'rules', 'projects', 'holidays', 'receipts', 'imports', 'allocations'];

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function kvGet(key) {
  const db = await idb();
  return new Promise((res, rej) => { const r = db.transaction(STORE).objectStore(STORE).get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function kvSet(key, val) {
  const db = await idb();
  return new Promise((res, rej) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(val, key); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
}

export function serverConfig() {
  try { return JSON.parse(localStorage.getItem('money-server') || 'null'); } catch { return null; }
}
export function setServerConfig(cfg) {
  try { cfg ? localStorage.setItem('money-server', JSON.stringify(cfg)) : localStorage.removeItem('money-server'); } catch {}
}

async function call(cfg, path, body) {
  const res = await fetch(cfg.url.replace(/\/$/, '') + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-money-key': cfg.key, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Server said ${res.status}`);
  return res.json();
}

export async function load() {
  const cfg = serverConfig();
  let L = null;
  if (cfg) {
    try {
      const s = await call(cfg, '/state');
      if (s.accounts?.length) {
        L = { ...emptyLedger(), ...s, settings: { ...emptyLedger().settings, ...(s.settings?.[0] || {}) } };
        delete L.settings.id;
        await cacheLocal(L);
        return { ledger: L, where: 'server' };
      }
      // An empty server: this device's ledger (or a fresh one) becomes the record.
      L = (await kvGet('ledger')) || emptyLedger();
      const base = emptyLedger(); for (const k of Object.keys(base)) L[k] ??= base[k];
      await cacheLocal(L); await pushAll(L);
      return { ledger: L, where: 'server' };
    } catch (e) { console.warn('Server unavailable, using this device', e); }
  }
  L = await kvGet('ledger');
  if (!L) { L = emptyLedger(); await cacheLocal(L); }
  else { const base = emptyLedger(); for (const k of Object.keys(base)) L[k] ??= base[k]; L.settings = { ...base.settings, ...L.settings }; }
  return { ledger: L, where: cfg ? 'device (server unreachable)' : 'device' };
}

async function cacheLocal(L) { await kvSet('ledger', L); }

// One row per id, the last version winning. An import can touch a row twice
// (a new line that is also half of a transfer, an account that learns its number
// and its balance), and Postgres refuses an upsert that hits a row twice.
export function uniqueById(rows = []) {
  const m = new Map(); for (const r of rows) m.set(String(r.id), r);
  return [...m.values()];
}

// changes: { collection: { upsert: [rows], delete: [ids] } }
export async function save(L, changes = {}) {
  await cacheLocal(L);
  const cfg = serverConfig();
  if (!cfg) return 'device';
  for (const [collection, c] of Object.entries(changes)) {
    if (collection === 'settings') { await call(cfg, '/sync', { collection, upsert: [{ id: 'settings', ...L.settings }] }); continue; }
    await call(cfg, '/sync', { collection, upsert: uniqueById(c.upsert), delete: [...new Set(c.delete || [])] });
  }
  return 'server';
}

// First push of everything on this device to a newly connected server.
export async function pushAll(L) {
  const cfg = serverConfig(); if (!cfg) throw new Error('No server set');
  for (const c of COLLECTIONS) await call(cfg, '/sync', { collection: c, upsert: L[c] });
  await call(cfg, '/sync', { collection: 'settings', upsert: [{ id: 'settings', ...L.settings }] });
}

export function exportJSON(L) { return JSON.stringify({ app: 'money', version: 1, exported: new Date().toISOString(), ...L }, null, 1); }
