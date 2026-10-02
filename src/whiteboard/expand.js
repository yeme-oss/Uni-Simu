// Spec -> primitives -> draw operations. Components expand into primitives,
// so the animator only ever sees primitives. Pure: no DOM.
import { toDrawOps } from './primitives.js';
import { dnaStrandPair, replicationFork } from './components/dna.js';
import { layoutMath } from './math.js';

const COMPONENTS = {
  dnaStrandPair: (el) => dnaStrandPair(el).primitives,
  replicationFork: (el) => replicationFork(el).primitives,
  // Formulas are laid out once here: glyph outlines (`d`) and their box, in board units.
  math: (el) => {
    const laid = layoutMath(el);
    if (laid.error) throw new Error(`formula "${el.tex}": ${laid.error}`);
    return [{ ...el, ...laid }];
  },
};

/** Expands one spec element into primitives. */
export function expandElement(el) {
  const component = COMPONENTS[el.type];
  return component ? component(el) : [el];
}

/** Expands a (validated) spec: [{ cue, primitives, ops }] per step. */
export function expandSpec(spec) {
  return spec.steps.map((step) => {
    const primitives = step.elements.flatMap(expandElement);
    return { cue: step.cue, primitives, ops: primitives.flatMap(toDrawOps) };
  });
}
