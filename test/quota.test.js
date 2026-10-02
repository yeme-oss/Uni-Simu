import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.QUOTA_FILE = join(mkdtempSync(join(tmpdir(), 'quota-')), 'quota.json');
process.env.QUOTA_FREE_PER_DAY = '2';
process.env.QUOTA_MEMBER_PER_DAY = '3';
process.env.GUMROAD_PRODUCT_ID = 'test-product';
const { checkQuota, verifyLicense, purchaseActive, setKeyBlocked, keyId, keysReport, _resetForTests } = await import('../server/quota.js');

/** Runs the middleware once; a request that gets through "succeeds" (status 200, finish). */
async function call(ip, key = '') {
  const req = { ip, get: (h) => (h.toLowerCase() === 'x-license-key' ? key : undefined), socket: {} };
  const res = Object.assign(new EventEmitter(), {
    statusCode: 200, body: null,
    status(s) { this.statusCode = s; return this; },
    json(b) { this.body = b; return this; },
  });
  let passed = false;
  await checkQuota(req, res, () => { passed = true; });
  if (passed) res.emit('finish');
  return { passed, status: res.statusCode, body: res.body, tier: req.quota?.tier };
}

const gumroad = (body) => async () => ({ json: async () => body });

test('a purchase grants access unless refunded, disputed, failed or ended', () => {
  assert.equal(purchaseActive({}), true);
  assert.equal(purchaseActive({ subscription_cancelled_at: '2026-09-01' }), true); // runs to the end of the period
  for (const bad of [{ refunded: true }, { chargebacked: true }, { disputed: true }, { subscription_ended_at: 'x' }, { subscription_failed_at: 'x' }]) {
    assert.equal(purchaseActive(bad), false, JSON.stringify(bad));
  }
  assert.equal(purchaseActive(null), false);
});

test('free visitors get the daily allowance per IP', async () => {
  _resetForTests();
  assert.equal((await call('1.1.1.1')).passed, true);
  assert.equal((await call('1.1.1.1')).passed, true);
  const third = await call('1.1.1.1');
  assert.deepEqual([third.passed, third.status, third.body.code], [false, 429, 'quota']);
  assert.equal((await call('2.2.2.2')).passed, true); // someone else still has theirs
});

test('a valid Gumroad key gets the member allowance; bad, ended or blocked keys are refused', async () => {
  _resetForTests();
  await verifyLicense('GOOD-KEY', gumroad({ success: true, purchase: {} }));
  await verifyLicense('ENDED-KEY', gumroad({ success: true, purchase: { subscription_ended_at: '2026-01-01' } }));
  await verifyLicense('FAKE-KEY', gumroad({ success: false }));

  const first = await call('3.3.3.3', 'GOOD-KEY');
  assert.deepEqual([first.passed, first.tier], [true, 'member']);
  await call('4.4.4.4', 'GOOD-KEY'); // shared from another address: same key, same allowance
  await call('3.3.3.3', 'GOOD-KEY');
  assert.equal((await call('3.3.3.3', 'GOOD-KEY')).status, 429);
  assert.deepEqual(keysReport().keys.find((k) => k.id === keyId('GOOD-KEY')), { id: keyId('GOOD-KEY'), used: 3, ips: 2, blocked: false });

  assert.equal((await call('3.3.3.3', 'ENDED-KEY')).status, 403);
  assert.equal((await call('3.3.3.3', 'FAKE-KEY')).status, 403);

  await verifyLicense('OTHER-KEY', gumroad({ success: true, purchase: {} }));
  setKeyBlocked(keyId('OTHER-KEY'), true);
  const blocked = await call('5.5.5.5', 'OTHER-KEY');
  assert.deepEqual([blocked.status, blocked.body.code], [403, 'license']);
});
