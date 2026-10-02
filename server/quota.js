// Daily generation allowance and Gumroad memberships. Everything here is OFF unless configured,
// so a self-hosted / FOSS copy (with its own Gemini key) has no limits and no license field:
//   QUOTA_FREE_PER_DAY=3            lessons a day for visitors without a key (per IP); unset or 0 = unlimited
//   GUMROAD_PRODUCT_ID=...          turns on license keys, verified with Gumroad's license API
//   QUOTA_MEMBER_PER_DAY=50         lessons a day per license key (default 50)
//   MEMBERSHIP_URL=https://...      where to get a key (your Gumroad membership page)
// Only the costly requests count: generating a lesson, answering a question.
// Keys are never stored: only a SHA-256 digest (its first 12 hex characters identify it in the admin panel).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { clientIp } from './usage.js';

const FILE = resolve(process.env.QUOTA_FILE || 'data/quota.json');
const int = (v, fallback) => (Number.isFinite(Number(v)) && String(v).trim() !== '' ? Math.max(0, Math.round(Number(v))) : fallback);
export const FREE_PER_DAY = int(process.env.QUOTA_FREE_PER_DAY, 0);          // 0 = unlimited
export const MEMBER_PER_DAY = int(process.env.QUOTA_MEMBER_PER_DAY, 50);
const PRODUCT_ID = (process.env.GUMROAD_PRODUCT_ID ?? '').trim();
export const MEMBERSHIP = Boolean(PRODUCT_ID);
export const MEMBERSHIP_URL = /^https:\/\/[^\s"<>]+$/.test(process.env.MEMBERSHIP_URL ?? '') ? process.env.MEMBERSHIP_URL : null;
export const QUOTA_ON = FREE_PER_DAY > 0 || MEMBERSHIP;

const VERIFY_OK_MS = 6 * 3600 * 1000;   // a valid key is re-checked with Gumroad every 6 hours
const VERIFY_BAD_MS = 10 * 60 * 1000;   // an invalid one after 10 minutes
const httpError = (status, message, code) => Object.assign(new Error(message), { status, code });
export const keyId = (key) => createHash('sha256').update(String(key)).digest('hex').slice(0, 12);
const today = () => new Date().toISOString().slice(0, 10);

// --- Counters (reset every UTC day) and blocked keys, kept in data/quota.json ---------------

let state = { day: today(), counts: {}, keyIps: {}, blocked: {} }; // counts: { 'ip:1.2.3.4' | 'key:<id>': n }
try {
  const saved = JSON.parse(readFileSync(FILE, 'utf8'));
  state = { day: saved.day ?? today(), counts: saved.counts ?? {}, keyIps: saved.keyIps ?? {}, blocked: saved.blocked ?? {} };
} catch (err) {
  if (err.code !== 'ENOENT') console.warn(`[quota] could not read ${FILE}:`, err.message);
}
let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    try {
      await mkdir(dirname(FILE), { recursive: true });
      await writeFile(`${FILE}.tmp`, JSON.stringify(state));
      await rename(`${FILE}.tmp`, FILE);
    } catch (err) {
      console.warn('[quota] could not save:', err.message);
    }
  }, 3000);
  saveTimer.unref?.();
}
function rollDay() {
  if (state.day === today()) return;
  state = { day: today(), counts: {}, keyIps: {}, blocked: state.blocked }; // a new day: fresh allowances
  scheduleSave();
}

// --- Gumroad license check ----------------------------------------------------------------

const verified = new Map(); // keyId -> { ok, reason, at }

/** Whether a Gumroad purchase grants access now (a cancelled membership runs until its period ends). */
export function purchaseActive(p) {
  if (!p || p.refunded || p.chargebacked || p.disputed) return false;
  if (p.subscription_ended_at || p.subscription_failed_at) return false;
  return true;
}

/** Checks `key` with Gumroad (cached). Resolves { ok, reason }. */
export async function verifyLicense(key, fetchImpl = fetch) {
  const id = keyId(key);
  const hit = verified.get(id);
  if (hit && Date.now() - hit.at < (hit.ok ? VERIFY_OK_MS : VERIFY_BAD_MS)) return hit;
  let result;
  try {
    const res = await fetchImpl('https://api.gumroad.com/v2/licenses/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ product_id: PRODUCT_ID, license_key: String(key), increment_uses_count: 'false' }),
    });
    const body = await res.json().catch(() => ({}));
    if (body.success && purchaseActive(body.purchase)) result = { ok: true };
    else result = { ok: false, reason: body.success ? 'expired' : 'invalid' };
  } catch (err) {
    // Gumroad unreachable: keep a key that was valid recently, refuse an unknown one.
    if (hit?.ok) return hit;
    console.warn('[quota] Gumroad check failed:', err.message);
    throw httpError(503, 'license check unavailable, try again in a minute', 'license');
  }
  const entry = { ...result, at: Date.now() };
  verified.set(id, entry);
  return entry;
}

// --- Who is asking, and how much they have left ------------------------------------------

/** { tier: 'unlimited' | 'free' | 'member', id, used, limit } for a request (throws on a bad key). */
export async function tierOf(req) {
  rollDay();
  if (!QUOTA_ON) return { tier: 'unlimited', id: null, used: 0, limit: null };
  const key = String(req.get('x-license-key') ?? '').trim();
  if (key && MEMBERSHIP) {
    if (key.length > 200) throw httpError(400, 'license key too long', 'license');
    const id = keyId(key);
    if (state.blocked[id]) throw httpError(403, 'this license key has been blocked', 'license');
    const { ok, reason } = await verifyLicense(key);
    if (!ok) throw httpError(403, reason === 'expired' ? 'this membership has ended' : 'unknown license key', 'license');
    return { tier: 'member', id: `key:${id}`, used: state.counts[`key:${id}`] ?? 0, limit: MEMBER_PER_DAY || null };
  }
  const id = `ip:${clientIp(req)}`;
  return { tier: 'free', id, used: state.counts[id] ?? 0, limit: FREE_PER_DAY || null };
}

/**
 * Express middleware for costly routes: refuses when the day's allowance is used up (429,
 * code 'quota'), counts the request once it succeeded.
 */
export async function checkQuota(req, res, next) {
  let t;
  try {
    t = await tierOf(req);
  } catch (err) {
    return res.status(err.status ?? 403).json({ error: err.message, code: err.code ?? 'license', membershipUrl: MEMBERSHIP_URL });
  }
  req.quota = t;
  if (t.limit && t.used >= t.limit) {
    return res.status(429).json({
      error: `daily limit reached (${t.limit} lessons)`, code: 'quota', tier: t.tier, limit: t.limit, membership: MEMBERSHIP, membershipUrl: MEMBERSHIP_URL,
    });
  }
  res.on('finish', () => {
    if (res.statusCode >= 400 || !t.id) return;
    rollDay();
    state.counts[t.id] = (state.counts[t.id] ?? 0) + 1;
    if (t.tier === 'member') { // how many addresses use this key today (sharing shows up here)
      const ips = new Set(state.keyIps[t.id] ?? []);
      ips.add(clientIp(req));
      state.keyIps[t.id] = [...ips].slice(-200);
    }
    scheduleSave();
  });
  next();
}

/** What the page shows: { enabled, membership, membershipUrl, tier, used, limit } (or { error, code } for a bad key). */
export async function quotaStatus(req) {
  const base = { enabled: QUOTA_ON, membership: MEMBERSHIP, membershipUrl: MEMBERSHIP_URL };
  try {
    const { tier, used, limit } = await tierOf(req);
    return { ...base, tier, used, limit };
  } catch (err) {
    const { used, limit } = { used: state.counts[`ip:${clientIp(req)}`] ?? 0, limit: FREE_PER_DAY || null };
    return { ...base, tier: 'free', used, limit, error: err.message, code: err.code ?? 'license' };
  }
}

// --- Admin -------------------------------------------------------------------------------

/** License keys used today: [{ id, used, ips, blocked }] plus blocked ones, busiest first. */
export function keysReport() {
  rollDay();
  const ids = new Set([
    ...Object.keys(state.counts).filter((k) => k.startsWith('key:')).map((k) => k.slice(4)),
    ...Object.keys(state.blocked),
  ]);
  const keys = [...ids].map((id) => ({
    id, used: state.counts[`key:${id}`] ?? 0, ips: (state.keyIps[`key:${id}`] ?? []).length, blocked: Boolean(state.blocked[id]),
  })).sort((a, b) => b.used - a.used);
  return { enabled: MEMBERSHIP, freePerDay: FREE_PER_DAY || null, memberPerDay: MEMBER_PER_DAY || null, keys };
}

export function setKeyBlocked(id, blocked) {
  if (!/^[0-9a-f]{12}$/.test(id)) throw httpError(400, 'not a key id');
  if (blocked) state.blocked[id] = { at: new Date().toISOString() };
  else delete state.blocked[id];
  scheduleSave();
  return { id, blocked };
}

/** For the tests: forget cached verifications and counters. */
export function _resetForTests() {
  verified.clear();
  state = { day: today(), counts: {}, keyIps: {}, blocked: {} };
}
