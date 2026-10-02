import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'ratings-'));
process.env.RATINGS_FILE = join(dir, 'ratings.json');
process.env.CURSUS_FILE = join(dir, 'cursus.json'); // no completed cursus: only the hand-made lectures
process.env.COURSEWORK_FILE = join(dir, 'coursework.json');
const { listRatings, rateLecture } = await import('../server/ratings.js');

test('ratings average per lecture; rating again replaces the voter\'s stars', async () => {
  await rateLecture('cs', { stars: 5, voter: 'voter-aaaa' });
  await rateLecture('cs', { stars: 2, voter: 'voter-bbbb' });
  assert.deepEqual(await rateLecture('cs', { stars: 4, voter: 'voter-bbbb' }), { id: 'cs', count: 2, average: 4.5, mine: 4 });
  const { ratings } = await listRatings('voter-aaaa');
  assert.deepEqual(ratings.cs, { count: 2, average: 4.5, mine: 5 });
  assert.deepEqual(ratings.bio, { count: 0, average: null, mine: null });
});

test('bad ratings are refused', async () => {
  await assert.rejects(rateLecture('nope', { stars: 5, voter: 'voter-aaaa' }), /unknown lecture/);
  await assert.rejects(rateLecture('cs', { stars: 6, voter: 'voter-aaaa' }), /1 to 5/);
  await assert.rejects(rateLecture('cs', { stars: 3, voter: 'x' }), /reviewer id/);
});
