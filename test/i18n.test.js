import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { STRINGS, LANGS } from '../src/i18n.js';

const keys = (lang) => Object.keys(STRINGS[lang]).sort();

test('English and French have exactly the same keys', () => {
  for (const lang of LANGS) assert.deepEqual(keys(lang), keys('en'), `${lang} keys differ from en`);
});

test('placeholders match between languages', () => {
  const holes = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const key of keys('en')) {
    for (const lang of LANGS) assert.deepEqual(holes(STRINGS[lang][key]), holes(STRINGS.en[key]), `${lang}:${key}`);
  }
});

test('every key used by the page and the code exists', () => {
  const used = new Set();
  const html = fs.readFileSync('index.html', 'utf8');
  for (const m of html.matchAll(/data-i18n(?:-placeholder|-title|-aria-label)?="([^"]+)"/g)) used.add(m[1]);
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []));
  for (const file of walk('src')) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\bt\('([\w.]+)'/g)) used.add(m[1]);
    for (const m of src.matchAll(/\btn\('([\w.]+)'/g)) { used.add(`${m[1]}_one`); used.add(`${m[1]}_other`); }
  }
  const missing = [...used].filter((k) => !(k in STRINGS.en));
  assert.deepEqual(missing, []);
});
