import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freeLectures, freeLecture, freeNarrationTexts, FREE_LANGS } from '../src/whiteboard/freeLectures.js';
import { validateSpec } from '../src/whiteboard/validate.js';
import { expandSpec } from '../src/whiteboard/expand.js';
import { lintLayout } from '../src/whiteboard/layout.js';

for (const lang of FREE_LANGS) {
  for (const lecture of freeLectures(lang)) {
    test(`${lecture.id} (${lang}): 5 valid slides with no layout problem`, () => {
      assert.equal(lecture.slides.length, 5);
      for (const [i, slide] of lecture.slides.entries()) {
        const { errors } = validateSpec(slide.spec, { cues: slide.narration.map((n) => n.id) });
        assert.deepEqual(errors, [], `slide ${i + 1} "${slide.title}"`);
        assert.ok(slide.narration.every((n) => n.text.length > 20 && n.text.length < 1000), `slide ${i + 1}: narration length`);
        assert.deepEqual(lintLayout(expandSpec(slide.spec)), [], `slide ${i + 1} "${slide.title}"`);
      }
    });

    test(`${lecture.id} (${lang}): a 5-question quiz with one answer each`, () => {
      assert.equal(lecture.quiz.length, 5);
      for (const q of lecture.quiz) {
        assert.equal(q.options.length, 3);
        assert.ok(q.answer >= 0 && q.answer < 3);
        assert.ok(q.question.length <= 110, q.question);
      }
    });
  }
}

test('English and French lectures have the same structure', () => {
  for (const en of freeLectures('en')) {
    const fr = freeLecture(en.id, 'fr');
    assert.deepEqual(fr.slides.map((s) => s.spec.steps.length), en.slides.map((s) => s.spec.steps.length));
    assert.deepEqual(fr.quiz.map((q) => q.answer), en.quiz.map((q) => q.answer));
  }
});

test('all narration texts are known for the voice cache', () => {
  assert.equal(freeNarrationTexts().size, 2 * 3 * 5 * 4);
});
