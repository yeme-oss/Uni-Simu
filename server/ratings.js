// Star ratings of the free lectures (1 to 5). Each browser rates under a random,
// anonymous reviewer id it keeps in localStorage: rating again replaces its previous stars.
// No IP or personal data here. Kept in one JSON file (data/ratings.json).
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { freeLectures } from '../src/whiteboard/freeLectures.js';
import { listCompletedCursus } from './cursus.js';

const FILE = resolve(process.env.RATINGS_FILE || 'data/ratings.json');
const LECTURES = new Set(freeLectures('en').map((l) => l.id));
/** Everything that can be rated: the hand-made lectures and the completed cursus ("cursus:<id>"). */
const rateable = async () => new Set([...LECTURES, ...(await listCompletedCursus()).map((c) => c.id)]);
const MAX_VOTERS = 100000; // per lecture
const httpError = (status, message) => Object.assign(new Error(message), { status });

let db = null;           // { lectures: { id: { voters: { voterId: stars } } } }
let queue = Promise.resolve();

async function load() {
  if (db) return db;
  try {
    const raw = JSON.parse(await readFile(FILE, 'utf8'));
    db = { lectures: raw?.lectures && typeof raw.lectures === 'object' ? raw.lectures : {} };
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`[ratings] could not read ${FILE}, starting empty:`, err.message);
    db = { lectures: {} };
  }
  return db;
}

async function save() {
  await mkdir(dirname(FILE), { recursive: true });
  await writeFile(`${FILE}.tmp`, JSON.stringify(db));
  await rename(`${FILE}.tmp`, FILE);
}

const summary = (voters = {}) => {
  const stars = Object.values(voters);
  return { count: stars.length, average: stars.length ? Math.round((stars.reduce((a, b) => a + b, 0) / stars.length) * 10) / 10 : null };
};

/** { ratings: { lectureId: { average (1 decimal, or null), count, mine (this voter's stars, or null) } } } */
export async function listRatings(voter) {
  await load();
  const ratings = {};
  for (const id of await rateable()) {
    const voters = db.lectures[id]?.voters;
    ratings[id] = { ...summary(voters), mine: (voter && voters?.[voter]) || null };
  }
  return { ratings };
}

/** Records `stars` (1-5) from `voter` for lecture `id` (replacing the voter's previous rating). */
export async function rateLecture(id, { stars, voter }) {
  if (!(await rateable()).has(id)) throw httpError(404, 'unknown lecture');
  stars = Math.round(Number(stars));
  if (!(stars >= 1 && stars <= 5)) throw httpError(400, 'stars must be 1 to 5');
  if (typeof voter !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(voter)) throw httpError(400, 'invalid reviewer id');
  const run = queue.then(async () => {
    await load();
    const voters = ((db.lectures[id] ??= {}).voters ??= {});
    if (!(voter in voters) && Object.keys(voters).length >= MAX_VOTERS) throw httpError(429, 'too many reviews');
    voters[voter] = stars;
    await save();
    return { id, ...summary(voters), mine: stars };
  });
  queue = run.catch(() => {});
  return run;
}
