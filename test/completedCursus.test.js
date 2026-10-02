import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'completed-'));
process.env.CURSUS_FILE = join(dir, 'cursus.json');
process.env.COURSEWORK_FILE = join(dir, 'coursework.json');

const topic = (n, extra) => ({ id: `t${n}`, title: `Topic ${n}`, summary: 's', introduces: [], buildsOn: [], ...extra });
const cursus = (id, topics, updatedAt = '2026-09-01') => ({
  id, title: `Course ${id}`, domain: 'Biology', module: 'Bacteria', lang: 'en', level: 50, difficulty: 'undergraduate',
  totalMinutes: 4, topicSeconds: 120, topicCount: 2, createdAt: '2026-09-01', updatedAt, thread: '',
  acts: [{ title: 'Act', summary: '', parts: [{ title: 'P', objective: '', notions: ['n'], topicCount: 2, firstTopic: 1, topics }] }],
});
writeFileSync(process.env.CURSUS_FILE, JSON.stringify({ cursus: [
  cursus('full', [topic(1, { done: true, lessonId: 'L1' }), topic(2, { done: true, lessonId: 'L2' })]),
  cursus('half', [topic(1, { done: true, lessonId: 'L1' }), topic(2, { lessonId: 'L2' })]),         // topic 2 not finished
  cursus('private', [topic(1, { done: true, lessonId: 'L1' }), topic(2, { done: true, lessonId: 'P9' })]), // P9 only in a browser
  cursus('unplanned', null),                                                                             // part never written
] }));
writeFileSync(process.env.COURSEWORK_FILE, JSON.stringify({ lessons: [{ id: 'L1' }, { id: 'L2' }] }));

const { listCompletedCursus } = await import('../server/cursus.js');

test('only fully studied cursus with every lesson saved on the server are free lectures', async () => {
  const list = await listCompletedCursus();
  assert.deepEqual(list.map((c) => c.id), ['cursus:full']);
  assert.equal(list[0].topics, 2);
});
