// The FOSS default: no QUOTA_FREE_PER_DAY, no GUMROAD_PRODUCT_ID -> no limit, nothing counted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.QUOTA_FILE = join(mkdtempSync(join(tmpdir(), 'quota-off-')), 'quota.json');
delete process.env.QUOTA_FREE_PER_DAY;
delete process.env.GUMROAD_PRODUCT_ID;
const { checkQuota, QUOTA_ON, MEMBERSHIP, keysReport } = await import('../server/quota.js');

test('without configuration there is no allowance and no membership', async () => {
  assert.equal(QUOTA_ON, false);
  assert.equal(MEMBERSHIP, false);
  for (let i = 0; i < 50; i++) {
    const req = { ip: '9.9.9.9', get: () => undefined, socket: {} };
    const res = Object.assign(new EventEmitter(), { statusCode: 200, status(s) { this.statusCode = s; return this; }, json() { return this; } });
    let passed = false;
    await checkQuota(req, res, () => { passed = true; });
    res.emit('finish');
    assert.equal(passed, true);
    assert.equal(req.quota.tier, 'unlimited');
  }
  assert.deepEqual(keysReport().keys, []);
});
