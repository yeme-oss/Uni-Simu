// Gemini spend, shown in the top-right corner. The server prices every request from the
// token counts Gemini reports (server/pricing.js) and returns it with the result; this
// adds them up: this session, and all time on this device (localStorage).
import { t, getLang, onLangChange } from './i18n.js';

const STORAGE_KEY = 'wb-spent';
const session = { usd: 0, inputTokens: 0, outputTokens: 0, calls: 0, unpriced: new Set() };
let allTime = 0;
try { allTime = Number(localStorage.getItem(STORAGE_KEY)) || 0; } catch { /* storage unavailable */ }

const chip = document.getElementById('wb-cost');

/** "$0.0042" for small amounts, "$1.23" for larger ones. */
const usd = (value) => value.toLocaleString(getLang(), {
  style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: value < 1 ? 4 : 2,
});

function render() {
  if (!chip) return;
  chip.textContent = `${usd(session.usd)}${session.unpriced.size ? ' +?' : ''}`;
  const lines = [t('cost.session', {
    usd: usd(session.usd), calls: session.calls,
    input: session.inputTokens.toLocaleString(getLang()), output: session.outputTokens.toLocaleString(getLang()),
  }), t('cost.allTime', { usd: usd(allTime) })];
  if (session.unpriced.size) lines.push(t('cost.unpriced', { models: [...session.unpriced].join(', ') }));
  chip.title = lines.join('\n');
}

/** Adds the `cost` a server response reported ({ usd, inputTokens, outputTokens, calls, unpriced }). */
export function recordCost(cost) {
  if (!cost || !cost.calls) return;
  session.usd += cost.usd;
  session.inputTokens += cost.inputTokens;
  session.outputTokens += cost.outputTokens;
  session.calls += cost.calls;
  for (const model of cost.unpriced ?? []) session.unpriced.add(model);
  allTime += cost.usd;
  try { localStorage.setItem(STORAGE_KEY, String(allTime)); } catch { /* ignore */ }
  render();
}

onLangChange(render);
render();
