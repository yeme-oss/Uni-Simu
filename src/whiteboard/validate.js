// Spec validation (Node side): JSON Schema via ajv, plus checks a schema can't
// express. Errors are short, readable lines (later sent back to the LLM).
import Ajv from 'ajv';
import schema from './schema.json' with { type: 'json' };
import { parsePath } from './geometry.js';
import { renderMath } from './math.js';

const ELEMENT_TYPES = schema.definitions.element.oneOf.map((ref) => ref.$ref.split('/').pop());

const ajv = new Ajv({ allErrors: true, discriminator: true });
const validateSchema = ajv.compile(schema);

// "/steps/2/elements/0/x" -> "steps[2].elements[0].x"
const toPath = (pointer) => pointer.split('/').slice(1)
  .reduce((out, key) => (/^\d+$/.test(key) ? `${out}[${key}]` : out ? `${out}.${key}` : key), '') || 'spec';

function describe(err) {
  const at = toPath(err.instancePath);
  switch (err.keyword) {
    case 'required': return `${at}: missing required property "${err.params.missingProperty}"`;
    case 'additionalProperties': return `${at}: unknown property "${err.params.additionalProperty}"`;
    case 'enum': return `${at}: must be one of ${err.params.allowedValues.map((v) => JSON.stringify(v)).join(', ')}`;
    default: return `${at}: ${err.message}`;
  }
}

/**
 * Validates a diagram spec. `cues` (optional) are the narration segment ids the
 * steps must refer to. Returns { valid, errors: string[] }.
 */
export function validateSpec(spec, { cues } = {}) {
  const errors = [];

  // Unknown element types first: ajv's discriminator message for these is cryptic.
  const steps = Array.isArray(spec?.steps) ? spec.steps : [];
  steps.forEach((step, s) => (Array.isArray(step?.elements) ? step.elements : []).forEach((el, e) => {
    if (el && typeof el === 'object' && !ELEMENT_TYPES.includes(el.type)) {
      errors.push(`steps[${s}].elements[${e}]: unknown element type ${JSON.stringify(el.type)} (expected one of: ${ELEMENT_TYPES.join(', ')})`);
    }
  }));
  if (errors.length) return { valid: false, errors };

  if (!validateSchema(spec)) {
    // With oneOf + discriminator, keep the errors of the matching branch only.
    const seen = new Set();
    for (const err of validateSchema.errors) {
      if (err.keyword === 'oneOf' || err.keyword === 'discriminator') continue;
      const line = describe(err);
      if (!seen.has(line)) { seen.add(line); errors.push(line); }
    }
    return { valid: false, errors: errors.length ? errors : ['spec: does not match the schema'] };
  }

  const seenCues = new Set();
  spec.steps.forEach((step, s) => {
    if (seenCues.has(step.cue)) errors.push(`steps[${s}].cue: duplicate cue "${step.cue}"`);
    seenCues.add(step.cue);
    if (cues && !cues.includes(step.cue)) errors.push(`steps[${s}].cue: "${step.cue}" matches no narration segment`);
    step.elements.forEach((el, e) => {
      if (el.type === 'path') {
        try { parsePath(el.d); } catch (err) { errors.push(`steps[${s}].elements[${e}].d: ${err.message}`); }
      } else if (el.type === 'math') {
        const { error } = renderMath(el.tex); // typesets it (cached for drawing)
        if (error) errors.push(`steps[${s}].elements[${e}].tex: ${error}`);
      }
    });
  });
  return { valid: errors.length === 0, errors };
}

/** Throws with all messages if the spec is invalid. */
export function assertValidSpec(spec, options) {
  const { valid, errors } = validateSpec(spec, options);
  if (!valid) throw new Error(`Invalid whiteboard spec:\n- ${errors.join('\n- ')}`);
  return spec;
}
