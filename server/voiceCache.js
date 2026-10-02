// Voice cache for the free lectures: their narration never changes, so each clip is
// synthesised once (per voice and model) and then served from disk, at no Gemini cost.
// Only the free lectures' own sentences are cached: any other text is voiced as usual.
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { freeNarrationTexts } from '../src/whiteboard/freeLectures.js';

const DIR = resolve(process.env.VOICE_CACHE_DIR || 'data/voice-cache');
const FREE_TEXTS = freeNarrationTexts();

/**
 * The clip for `text`: from the cache when it is a free-lecture sentence already voiced,
 * else from `make()` (which calls Gemini), stored for next time if it is a free sentence.
 */
export async function voiceWithCache(text, teacher, model, make) {
  text = String(text ?? '').trim();
  if (!FREE_TEXTS.has(text)) return make();
  const key = createHash('sha256').update(`${model}|${teacher}|${text}`).digest('hex');
  const file = join(DIR, key);
  try {
    const [data, mimeType] = await Promise.all([readFile(`${file}.bin`), readFile(`${file}.type`, 'utf8')]);
    return { data, mimeType };
  } catch { /* not cached yet */ }
  const result = await make();
  try {
    await mkdir(DIR, { recursive: true });
    await writeFile(`${file}.bin.tmp`, result.data);
    await rename(`${file}.bin.tmp`, `${file}.bin`);
    await writeFile(`${file}.type`, result.mimeType);
  } catch (err) {
    console.warn('[voice cache] could not store a clip:', err.message);
  }
  return result;
}
