import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cursusShape, distribute, orderTopics, levelInfo, MAX_TOPICS } from '../server/cursus.js';

const sum = (a) => a.reduce((s, n) => s + n, 0);

test('distribute splits evenly, larger shares first', () => {
  assert.deepEqual(distribute(10, 3), [4, 3, 3]);
  assert.deepEqual(distribute(12, 4), [3, 3, 3, 3]);
});

test('a 2-hour course of 1-minute topics: 120 topics in 12 parts of 10, 4 acts', () => {
  const s = cursusShape(120, 60);
  assert.equal(s.topics, 120);
  assert.deepEqual(s.parts, Array(12).fill(10));
  assert.deepEqual(s.acts, [3, 3, 3, 3]);
});

test('the default course: 30 minutes of 2-minute topics = 15 topics in 3 acts', () => {
  const s = cursusShape();
  assert.deepEqual([s.totalMinutes, s.topicSeconds, s.topics], [30, 120, 15]);
  assert.deepEqual(s.acts, [1, 1, 1]);
  assert.deepEqual(s.parts, [5, 5, 5]);
});

test('parts stay about 10 minutes whatever the topic length; totals always add up', () => {
  for (const [minutes, seconds] of [[120, 300], [120, 30], [30, 60], [45, 90], [240, 20], [10, 300]]) {
    const s = cursusShape(minutes, seconds);
    assert.equal(sum(s.parts), s.topics, `${minutes}/${seconds}: topics`);
    assert.equal(sum(s.acts), s.parts.length, `${minutes}/${seconds}: parts`);
    assert.ok(s.topics <= MAX_TOPICS);
    assert.ok(s.parts.every((n) => n >= 1));
  }
  assert.equal(cursusShape(120, 300).parts.length, 12);
});

test('levelInfo: a named level every 25, a nuance in between', () => {
  assert.deepEqual([0, 25, 50, 75, 100].map((l) => levelInfo(l).difficulty), ['eli5', 'beginner', 'undergraduate', 'graduate', 'expert']);
  assert.equal(levelInfo(60).difficulty, 'undergraduate');
  assert.match(levelInfo(60).audience, /a little above that level: 40% of the way toward graduate/);
  assert.match(levelInfo(90).audience, /a little below/);
  assert.equal(levelInfo(50).audience.includes('Pitch'), false);
  assert.equal(levelInfo('nonsense').level, 50);
  assert.equal(levelInfo(140).level, 100);
});

test('orderTopics moves a topic after the one introducing what it builds on', () => {
  const { topics, problems } = orderTopics([
    { title: 'uses B', introduces: [], buildsOn: ['B'] },
    { title: 'A', introduces: ['A'], buildsOn: [] },
    { title: 'B', introduces: ['B'], buildsOn: ['A'] },
  ], ['A', 'B']);
  assert.deepEqual(topics.map((t) => t.title), ['A', 'B', 'uses B']);
  assert.deepEqual(problems, []);
});

test('orderTopics keeps a consistent order as is, and reports cycles and missing notions', () => {
  const ok = orderTopics([
    { title: '1', introduces: ['A'], buildsOn: ['earlier'] },
    { title: '2', introduces: [], buildsOn: ['A'] },
  ], ['A']);
  assert.deepEqual(ok.topics.map((t) => t.title), ['1', '2']);

  const bad = orderTopics([
    { title: 'x', introduces: ['A'], buildsOn: ['B'] },
    { title: 'y', introduces: ['B'], buildsOn: ['A'] },
  ], ['A', 'B', 'C']);
  assert.equal(bad.topics.length, 2); // nothing is lost
  assert.equal(bad.problems.length, 2); // the cycle, and C introduced by nobody
});

test('orderTopics: a notion introduced twice counts for the first topic only', () => {
  const { topics } = orderTopics([
    { title: '1', introduces: ['A'], buildsOn: [] },
    { title: '2', introduces: ['A'], buildsOn: [] },
  ], ['A']);
  assert.deepEqual(topics[1].introduces, []);
});
