import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costOf, priceFor, createMeter } from '../server/pricing.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const DEC_2026 = new Date('2026-12-31T12:00:00Z');
const JAN_2027 = new Date('2027-01-01T12:00:00Z');

test('Flash-Lite text: input and output (thinking included) per 1M tokens', () => {
  const c = costOf('gemini-3.5-flash-lite', { promptTokenCount: 1_000_000, candidatesTokenCount: 600_000, thoughtsTokenCount: 400_000 });
  assert.deepEqual([c.input, c.output, c.known], [1_000_000, 1_000_000, true]);
  close(c.usd, 0.30 + 2.50);
});

test('introductory prices end on 2027-01-01', () => {
  const usage = { promptTokenCount: 1_000_000, candidatesTokenCount: 1_000_000 };
  close(costOf('gemini-3.8-flash', usage, DEC_2026).usd, 0.75 + 3.75);
  close(costOf('gemini-3.8-flash', usage, JAN_2027).usd, 1.50 + 7.50);
  close(costOf('gemini-3.8-flash-lite-tts', usage, DEC_2026).usd, 0.50 + 6.00);
  close(costOf('gemini-3.8-flash-tts', usage, JAN_2027).usd, 1.00 + 18.00);
});

test('Pro: long prompts (> 200k tokens) use the higher rate', () => {
  close(costOf('gemini-3.1-pro-preview', { promptTokenCount: 200_000, candidatesTokenCount: 1_000_000 }).usd, 0.2 * 2 + 12);
  close(costOf('gemini-3.1-pro-preview', { promptTokenCount: 200_001, candidatesTokenCount: 1_000_000 }).usd, 0.200001 * 4 + 18);
});

test('unknown models are flagged, not silently free', () => {
  assert.equal(priceFor('gemini-made-up'), null);
  assert.deepEqual(costOf('gemini-made-up', { promptTokenCount: 10, candidatesTokenCount: 5 }), { input: 10, output: 5, usd: 0, known: false });
});

test('a meter adds up every call of one request', () => {
  const m = createMeter();
  m.add('gemini-3.5-flash-lite', { promptTokenCount: 12_000, candidatesTokenCount: 3_000, thoughtsTokenCount: 1_000 });
  m.add('gemini-3.5-flash-lite', { promptTokenCount: 15_000, candidatesTokenCount: 2_500 }); // a repair attempt
  m.add('gemini-made-up', { promptTokenCount: 1 });
  const s = m.summary();
  assert.deepEqual([s.calls, s.inputTokens, s.outputTokens, s.unpriced], [3, 27_001, 6_500, ['gemini-made-up']]);
  close(s.usd, (27_000 * 0.30 + 6_500 * 2.50) / 1e6);
});
