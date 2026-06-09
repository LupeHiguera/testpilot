import path from 'node:path';
import { generatedTestsDir } from '../core/config.js';
import { Diagnosis, RepairProposal, TestIntent } from '../core/types.js';

const safeCategories = new Set(['SELECTOR_DRIFT', 'UI_COPY_CHANGE', 'TIMING_OR_FLAKE']);

/**
 * The guard that decides whether a proposed repair is safe to apply. It is the
 * heart of testpilot's "repair drift, refuse regressions" promise, so it only
 * ever LOOSENS toward refusal. The assertions it requires the repair to preserve
 * are derived from the parsed `intent` (the expected route + expected outcome
 * text), so the guard protects any flow — not just the bundled login demo.
 */
export function validatePatch(
  proposal: RepairProposal,
  diagnosis: Diagnosis,
  intent: TestIntent
): { valid: boolean; reason: string } {
  const normalizedPath = path.resolve(proposal.originalPath);
  const generatedRoot = path.resolve(generatedTestsDir);
  // Require a path strictly inside the generated-tests dir. The trailing separator
  // matters: a bare startsWith would also accept a sibling like `tests/generated-x`.
  if (!normalizedPath.startsWith(generatedRoot + path.sep)) {
    return { valid: false, reason: 'Repairs may only edit generated tests.' };
  }
  if (!diagnosis.repairable || !safeCategories.has(diagnosis.category)) {
    return { valid: false, reason: `Repairs are not allowed for ${diagnosis.category}.` };
  }
  if (!proposal.safeToApply || !proposal.diff.trim()) {
    return { valid: false, reason: 'The proposal did not include a safe concrete change.' };
  }
  const content = proposal.proposedContent;
  if (!/expect\(/.test(content)) {
    return { valid: false, reason: 'The repair removed all assertions.' };
  }
  // The route assertion must survive: a URL assertion that still targets the
  // intent's expected path (the path appears even inside the escaped regex form).
  if (!/toHaveURL|waitForURL/.test(content)) {
    return { valid: false, reason: 'The repair removed the route assertion.' };
  }
  if (intent.expectedPath && !content.includes(intent.expectedPath)) {
    return { valid: false, reason: `The repair no longer asserts the expected route (${intent.expectedPath}).` };
  }
  // The expected-outcome assertion (the visible text the flow should reach) must survive.
  if (intent.expectedText && !content.includes(intent.expectedText)) {
    return { valid: false, reason: `The repair removed the expected-outcome assertion ("${intent.expectedText}").` };
  }
  if (/TODO|skip|fixme|test\.skip|\.only/.test(content)) {
    return { valid: false, reason: 'The repair includes unsafe test-control markers.' };
  }
  return { valid: true, reason: 'Patch is limited to safe drift in the generated test and preserves the route and outcome assertions.' };
}
