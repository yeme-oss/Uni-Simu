import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.USAGE_FILE = join(mkdtempSync(join(tmpdir(), 'usage-')), 'usage.json');
process.env.ADMIN_TOKEN = 'a-long-enough-admin-token';
process.env.BANS_FILE = join(mkdtempSync(join(tmpdir(), 'bans-')), 'bans.json');
const { recordUsage, usageReport, ipReport, forgetIp, banIp, unbanIp, listBans, blockBanned, requireAdmin, clientIp } = await import('../server/usage.js');

const req = (ip, path = '/api/whiteboard/generate') => ({ ip, path, socket: {} });
const cost = (inputTokens, outputTokens, usd) => ({ calls: 1, inputTokens, outputTokens, usd });

test('usage is totalled per IP, biggest spender first, with the recent requests', async () => {
  await recordUsage(req('::ffff:10.0.0.1'), cost(100, 50, 0.01));
  await recordUsage(req('10.0.0.1', '/api/whiteboard/quiz'), cost(10, 5, 0.001));
  await recordUsage(req('10.0.0.2'), cost(1000, 500, 0.1));
  await recordUsage(req('10.0.0.3'), { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 }); // no Gemini call: not logged
  const r = await usageReport({ days: 1 });
  assert.deepEqual(r.ips.map((x) => x.ip), ['10.0.0.2', '10.0.0.1']);
  assert.equal(r.ips[1].requests, 2);
  assert.equal(r.ips[1].inputTokens, 110);
  assert.equal(r.ips[1].lastPath, '/api/whiteboard/quiz');
  assert.equal(r.totals.requests, 3);
  assert.equal(r.recent[0].ip, '10.0.0.2'); // newest first
});

test('recent requests come a page at a time, newest first', async () => {
  const r = await usageReport({ days: 1, page: 1, perPage: 2 });
  assert.equal(r.recent.length, 2);
  assert.deepEqual(r.recentPage, { page: 1, pages: 2, perPage: 2, total: 3 });
  const last = await usageReport({ days: 1, page: 9, perPage: 2 }); // out of range: the last page
  assert.equal(last.recentPage.page, 2);
  assert.equal(last.recent.length, 1);
  assert.equal(last.recent[0].path, '/api/whiteboard/generate'); // the oldest one
});

test('ipReport sums one IP over the whole log', async () => {
  const r = await ipReport('10.0.0.1');
  assert.equal(r.totals.requests, 2);
  assert.equal(r.totals.inputTokens, 110);
  assert.ok(Math.abs(r.totals.usd - 0.011) < 1e-9);
  assert.equal(r.days.length, 1);
  assert.equal(r.recent.length, 2);
  assert.equal(r.ban, null);
});

test('a banned IP is blocked until unbanned', async () => {
  const blocked = (ip) => {
    let status = 200;
    blockBanned({ ip }, { status(s) { status = s; return this; }, json() { return this; } }, () => {});
    return status;
  };
  await banIp('10.0.0.2');
  assert.equal(blocked('10.0.0.2'), 403);
  assert.equal(blocked('::ffff:10.0.0.2'), 403);
  assert.equal(blocked('10.0.0.9'), 200);
  assert.deepEqual(listBans().bans.map((b) => b.ip), ['10.0.0.2']);
  assert.equal((await usageReport({ days: 1 })).ips.find((x) => x.ip === '10.0.0.2').banned, true);
  await unbanIp('10.0.0.2');
  assert.equal(blocked('10.0.0.2'), 200);
  await assert.rejects(banIp('<script>'), /not an IP/);
});

test('an IP can be erased entirely', async () => {
  await forgetIp('10.0.0.1');
  const r = await usageReport({ days: 1 });
  assert.equal(r.ips.some((x) => x.ip === '10.0.0.1'), false);
  assert.equal(r.recent.some((e) => e.ip === '10.0.0.1'), false);
});

test('the admin API needs the token', () => {
  const run = (authorization) => {
    let status = 200, nexted = false;
    const res = { status(s) { status = s; return this; }, json() { return this; } };
    requireAdmin({ get: () => authorization }, res, () => { nexted = true; });
    return nexted ? 'ok' : status;
  };
  assert.equal(run(undefined), 401);
  assert.equal(run('Bearer wrong'), 401);
  assert.equal(run('Bearer a-long-enough-admin-token'), 'ok');
});

test('clientIp strips the IPv4-mapped prefix', () => {
  assert.equal(clientIp({ ip: '::ffff:192.168.1.5' }), '192.168.1.5');
});
