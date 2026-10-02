// Usage log for the admin panel: Gemini tokens and cost per client IP, to watch spending and
// spot abuse. IP addresses are personal data (GDPR), so the log is kept minimal:
//   - no query content, no user agent: only IP, endpoint, tokens, cost and time;
//   - entries older than USAGE_RETENTION_DAYS (default 30) are deleted automatically;
//   - only readable through the admin API, which is off unless ADMIN_TOKEN is set.
// Kept in one JSON file (data/usage.json), written at most every few seconds.
// Banned IPs (data/bans.json) get a 403 on the API until they are unbanned.
import { timingSafeEqual, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const FILE = resolve(process.env.USAGE_FILE || 'data/usage.json');
export const RETENTION_DAYS = Math.max(1, Number(process.env.USAGE_RETENTION_DAYS) || 30);
const DAY = 24 * 60 * 60 * 1000;
const MAX_EVENTS = 5000;  // most recent requests kept individually (older ones only in daily totals)
const SAVE_DELAY = 5000;

let db = null;       // { days: { 'YYYY-MM-DD': { ip: totals } }, events: [event] }
let saveTimer = null;

async function load() {
  if (db) return db;
  try {
    const raw = JSON.parse(await readFile(FILE, 'utf8'));
    db = { days: raw?.days && typeof raw.days === 'object' ? raw.days : {}, events: Array.isArray(raw?.events) ? raw.events : [] };
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`[usage] could not read ${FILE}, starting empty:`, err.message);
    db = { days: {}, events: [] };
  }
  purge();
  return db;
}

/** Deletes everything older than the retention period. */
function purge(now = Date.now()) {
  const oldest = new Date(now - RETENTION_DAYS * DAY).toISOString();
  for (const day of Object.keys(db.days)) if (day < oldest.slice(0, 10)) delete db.days[day];
  db.events = db.events.filter((e) => e.at >= oldest).slice(-MAX_EVENTS);
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    try {
      await mkdir(dirname(FILE), { recursive: true });
      await writeFile(`${FILE}.tmp`, JSON.stringify(db));
      await rename(`${FILE}.tmp`, FILE);
    } catch (err) {
      console.warn('[usage] could not save:', err.message);
    }
  }, SAVE_DELAY);
  saveTimer.unref?.();
}

/** The client's address ("::ffff:1.2.3.4" -> "1.2.3.4"). Behind a proxy, set TRUST_PROXY=true. */
export const clientIp = (req) => String(req.ip || req.socket?.remoteAddress || 'unknown').replace(/^::ffff:/, '');

/** Records one request that used Gemini (`cost`: the meter's summary). Requests that used nothing are skipped. */
export async function recordUsage(req, cost) {
  if (!cost || (!cost.calls && !cost.inputTokens && !cost.outputTokens)) return;
  await load();
  const ip = clientIp(req);
  const at = new Date().toISOString();
  const day = at.slice(0, 10);
  const totals = ((db.days[day] ??= {})[ip] ??= { requests: 0, inputTokens: 0, outputTokens: 0, usd: 0 });
  totals.requests += 1;
  totals.inputTokens += cost.inputTokens || 0;
  totals.outputTokens += cost.outputTokens || 0;
  totals.usd += cost.usd || 0;
  db.events.push({
    at, ip, path: req.path, inputTokens: cost.inputTokens || 0, outputTokens: cost.outputTokens || 0, usd: cost.usd || 0,
    ...(req.quota?.tier === 'member' && { key: req.quota.id.slice(4) }), // which license key (its short id), for members
  });
  if (db.events.length > MAX_EVENTS * 1.1) purge();
  scheduleSave();
}

/**
 * Usage over the last `days` days: { ips: [{ ip, requests, inputTokens, outputTokens, usd,
 * firstSeen, lastSeen, lastPath }] (biggest spenders first), totals, retentionDays,
 * recent: one page of requests, newest first, and recentPage: { page, pages, perPage, total } }.
 */
export async function usageReport({ days = 7, page = 1, perPage = 20 } = {}) {
  await load();
  purge();
  days = Math.max(1, Math.min(RETENTION_DAYS, Math.round(Number(days) || 7)));
  const since = new Date(Date.now() - (days - 1) * DAY).toISOString().slice(0, 10);
  const byIp = new Map();
  for (const [day, ips] of Object.entries(db.days)) {
    if (day < since) continue;
    for (const [ip, t] of Object.entries(ips)) {
      const row = byIp.get(ip) ?? { ip, requests: 0, inputTokens: 0, outputTokens: 0, usd: 0, firstSeen: null, lastSeen: null, lastPath: null };
      row.requests += t.requests;
      row.inputTokens += t.inputTokens;
      row.outputTokens += t.outputTokens;
      row.usd += t.usd;
      byIp.set(ip, row);
    }
  }
  const events = db.events.filter((e) => e.at.slice(0, 10) >= since);
  for (const e of events) { // first / last request of each IP (from the detailed log)
    const row = byIp.get(e.ip);
    if (!row) continue;
    row.firstSeen ??= e.at;
    row.lastSeen = e.at;
    row.lastPath = e.path;
  }
  const ips = [...byIp.values()].map((r) => ({ ...r, usd: Math.round(r.usd * 1e6) / 1e6, banned: bans.has(r.ip) })).sort((a, b) => b.usd - a.usd);
  const totals = ips.reduce((s, r) => ({
    requests: s.requests + r.requests, inputTokens: s.inputTokens + r.inputTokens,
    outputTokens: s.outputTokens + r.outputTokens, usd: s.usd + r.usd,
  }), { requests: 0, inputTokens: 0, outputTokens: 0, usd: 0 });
  perPage = Math.max(1, Math.min(200, Math.round(Number(perPage) || 20)));
  const pages = Math.max(1, Math.ceil(events.length / perPage));
  page = Math.max(1, Math.min(pages, Math.round(Number(page) || 1)));
  const newestFirst = events.slice().reverse();
  return {
    days, retentionDays: RETENTION_DAYS, ips, totals: { ...totals, ips: ips.length },
    recent: newestFirst.slice((page - 1) * perPage, page * perPage),
    recentPage: { page, pages, perPage, total: events.length },
  };
}

/** Erases everything logged for `ip` (a user's erasure request, GDPR art. 17). */
export async function forgetIp(ip) {
  await load();
  let removed = db.events.length;
  db.events = db.events.filter((e) => e.ip !== ip);
  removed -= db.events.length;
  for (const ips of Object.values(db.days)) if (ips[ip]) { delete ips[ip]; removed++; }
  scheduleSave();
  return { removed };
}

/**
 * Everything logged for one IP over the retention period: { ip, totals (sum of requests,
 * tokens and cost), firstSeen, lastSeen, days: [{ day, ...totals }] (newest first),
 * recent: its 20 newest requests, ban: { at } | null }.
 */
export async function ipReport(ip) {
  await load();
  purge();
  const days = Object.entries(db.days)
    .filter(([, ips]) => ips[ip])
    .map(([day, ips]) => ({ day, ...ips[ip], usd: Math.round(ips[ip].usd * 1e6) / 1e6 }))
    .sort((a, b) => b.day.localeCompare(a.day));
  const totals = days.reduce((s, d) => ({
    requests: s.requests + d.requests, inputTokens: s.inputTokens + d.inputTokens,
    outputTokens: s.outputTokens + d.outputTokens, usd: s.usd + d.usd,
  }), { requests: 0, inputTokens: 0, outputTokens: 0, usd: 0 });
  const events = db.events.filter((e) => e.ip === ip);
  return {
    ip, retentionDays: RETENTION_DAYS, totals: { ...totals, usd: Math.round(totals.usd * 1e6) / 1e6 },
    firstSeen: events[0]?.at ?? null, lastSeen: events.at(-1)?.at ?? null,
    days, recent: events.slice(-20).reverse(), ban: bans.get(ip) ?? null,
  };
}

// --- Bans -----------------------------------------------------------------------------------

const BANS_FILE = resolve(process.env.BANS_FILE || 'data/bans.json');
const bans = new Map(); // ip -> { at } (read once at startup: checked on every request)
try {
  for (const [ip, ban] of Object.entries(JSON.parse(readFileSync(BANS_FILE, 'utf8')).bans ?? {})) bans.set(ip, ban);
} catch (err) {
  if (err.code !== 'ENOENT') console.warn(`[usage] could not read ${BANS_FILE}:`, err.message);
}

async function saveBans() {
  await mkdir(dirname(BANS_FILE), { recursive: true });
  await writeFile(`${BANS_FILE}.tmp`, JSON.stringify({ bans: Object.fromEntries(bans) }, null, 1));
  await rename(`${BANS_FILE}.tmp`, BANS_FILE);
}

const validIp = (ip) => typeof ip === 'string' && ip.length <= 64 && /^[0-9a-fA-F:.]+$/.test(ip);

export async function banIp(ip) {
  if (!validIp(ip)) throw Object.assign(new Error('not an IP address'), { status: 400 });
  if (!bans.has(ip)) {
    bans.set(ip, { at: new Date().toISOString() });
    await saveBans();
  }
  return { ip, ban: bans.get(ip) };
}

export async function unbanIp(ip) {
  if (bans.delete(ip)) await saveBans();
  return { ip, ban: null };
}

/** Banned IPs, most recent first: [{ ip, at }]. */
export const listBans = () => ({ bans: [...bans].map(([ip, b]) => ({ ip, ...b })).sort((a, b) => b.at.localeCompare(a.at)) });

/** Express middleware: a banned IP gets 403 (the admin API is not behind it). */
export function blockBanned(req, res, next) {
  if (bans.size && bans.has(clientIp(req))) return res.status(403).json({ error: 'access blocked' });
  next();
}

// --- Admin access ------------------------------------------------------------------------

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
export const ADMIN_ENABLED = ADMIN_TOKEN.length >= 16;
if (ADMIN_TOKEN && !ADMIN_ENABLED) console.warn('[admin] ADMIN_TOKEN is too short (16 characters minimum): the admin panel stays off.');

const digest = (s) => createHash('sha256').update(String(s)).digest();

/** Express middleware: 404 when the panel is off, 401 without the right "Authorization: Bearer <token>". */
export function requireAdmin(req, res, next) {
  if (!ADMIN_ENABLED) return res.status(404).json({ error: 'not found' });
  const given = String(req.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!timingSafeEqual(digest(given), digest(ADMIN_TOKEN))) return res.status(401).json({ error: 'wrong admin token' });
  next();
}
