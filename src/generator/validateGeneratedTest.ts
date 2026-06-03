import { TestIntent } from '../core/types.js';

export interface GeneratedTestValidation {
  valid: boolean;
  reason: string;
}

// Structural sanity bar for freshly generated tests before they are written to
// disk. Unlike validatePatch (which guards *repairs*), this guards the initial
// generation path so a malformed or unsafe model response never becomes a test
// file. It intentionally checks structure and intent preservation, not behavior.
export function validateGeneratedTest(content: string, intent: TestIntent): GeneratedTestValidation {
  const trimmed = content.trim();
  if (!trimmed) {
    return { valid: false, reason: 'The model returned an empty test.' };
  }
  if (trimmed.includes('```')) {
    return { valid: false, reason: 'The generated test contains markdown fences instead of raw code.' };
  }
  if (!/from ['"]@playwright\/test['"]/.test(trimmed)) {
    return { valid: false, reason: 'The generated test does not import from @playwright/test.' };
  }
  if (!/\btest\s*\(/.test(trimmed)) {
    return { valid: false, reason: 'The generated test has no test() block.' };
  }
  if (!/\bpage\.goto\s*\(/.test(trimmed)) {
    return { valid: false, reason: 'The generated test never navigates with page.goto().' };
  }
  if (!/\bexpect\s*\(/.test(trimmed)) {
    return { valid: false, reason: 'The generated test contains no assertions.' };
  }
  if (/\.only\b|test\.skip|describe\.skip|\bxtest\b|\bxit\b/.test(trimmed)) {
    return { valid: false, reason: 'The generated test contains focus/skip markers (.only/.skip).' };
  }
  if (/\bTODO\b|\bFIXME\b/i.test(trimmed)) {
    return { valid: false, reason: 'The generated test contains TODO/FIXME placeholders.' };
  }
  // Intent preservation: the route and the expected outcome must survive into
  // the generated test, or it no longer tests what the spec asked for.
  if (!trimmed.includes(intent.route)) {
    return { valid: false, reason: `The generated test does not reference the target route ${intent.route}.` };
  }
  if (intent.expectedText && !trimmed.includes(intent.expectedText)) {
    return { valid: false, reason: `The generated test dropped the expected outcome "${intent.expectedText}".` };
  }
  return { valid: true, reason: 'Generated test is structurally sound and preserves the spec intent.' };
}
