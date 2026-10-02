// Cost of Gemini calls, from the token counts every response reports (usageMetadata).
// Prices: USD per 1M tokens, paid tier, standard - https://ai.google.dev/gemini-api/docs/pricing
// (checked 2026-09-30). Some have an introductory price until a date ("until", exclusive).
// Thinking tokens are billed as output. Update this table when prices change.
const PRICES = {
  'gemini-3.5-flash-lite': [{ input: 0.30, output: 2.50 }],
  'gemini-3.8-flash': [{ until: '2027-01-01', input: 0.75, output: 3.75 }, { input: 1.50, output: 7.50 }],
  'gemini-3.1-pro-preview': [{ input: 2.00, output: 12.00, long: { above: 200_000, input: 4.00, output: 18.00 } }],
  // Text-to-speech: text input, audio output.
  'gemini-3.8-flash-lite-tts': [{ until: '2027-01-01', input: 0.50, output: 6.00 }, { input: 1.00, output: 12.00 }],
  'gemini-3.8-flash-tts': [{ until: '2027-01-01', input: 0.50, output: 9.00 }, { input: 1.00, output: 18.00 }],
};

/** The price in effect for `model` on `date`, or null if the model isn't in the table. */
export function priceFor(model, date = new Date()) {
  const periods = PRICES[model];
  if (!periods) return null;
  const day = date.toISOString().slice(0, 10);
  return periods.find((p) => !p.until || day < p.until) ?? periods.at(-1);
}

/** Tokens and USD cost of one response's usageMetadata. `known` is false for unpriced models. */
export function costOf(model, usage = {}, date = new Date()) {
  const input = usage.promptTokenCount ?? 0;
  const output = (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0);
  const price = priceFor(model, date);
  if (!price) return { input, output, usd: 0, known: false };
  const rate = price.long && input > price.long.above ? price.long : price;
  return { input, output, usd: (input * rate.input + output * rate.output) / 1e6, known: true };
}

/** Collects the cost of every Gemini call made while serving one request. */
export function createMeter() {
  const total = { usd: 0, inputTokens: 0, outputTokens: 0, calls: 0, unpriced: [] };
  return {
    add(model, usage) {
      const c = costOf(model, usage);
      total.usd += c.usd;
      total.inputTokens += c.input;
      total.outputTokens += c.output;
      total.calls += 1;
      if (!c.known && !total.unpriced.includes(model)) total.unpriced.push(model);
    },
    summary: () => ({ ...total, usd: Math.round(total.usd * 1e8) / 1e8 }),
  };
}
