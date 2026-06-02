import path from 'node:path';
import { generatedTestsDir } from '../core/config.js';
import { Diagnosis, RepairProposal } from '../core/types.js';

const safeCategories = new Set(['SELECTOR_DRIFT', 'UI_COPY_CHANGE', 'TIMING_OR_FLAKE']);

export function validatePatch(proposal: RepairProposal, diagnosis: Diagnosis): { valid: boolean; reason: string } {
  const normalizedPath = path.resolve(proposal.originalPath);
  const generatedRoot = path.resolve(generatedTestsDir);
  if (!normalizedPath.startsWith(generatedRoot)) {
    return { valid: false, reason: 'Repairs may only edit generated tests.' };
  }
  if (!diagnosis.repairable || !safeCategories.has(diagnosis.category)) {
    return { valid: false, reason: `Repairs are not allowed for ${diagnosis.category}.` };
  }
  if (!proposal.safeToApply || !proposal.diff.trim()) {
    return { valid: false, reason: 'The proposal did not include a safe concrete change.' };
  }
  if (!/expect\(/.test(proposal.proposedContent)) {
    return { valid: false, reason: 'The repair removed all assertions.' };
  }
  if (!/toHaveURL/.test(proposal.proposedContent)) {
    return { valid: false, reason: 'The repair removed the route assertion.' };
  }
  if (!/Welcome, Demo User|Demo User/.test(proposal.proposedContent)) {
    return { valid: false, reason: 'The repair removed the expected user assertion.' };
  }
  if (/TODO|skip|fixme|test\.skip|\.only/.test(proposal.proposedContent)) {
    return { valid: false, reason: 'The repair includes unsafe test-control markers.' };
  }
  return { valid: true, reason: 'Patch is limited to generated-test selector drift and preserves assertions.' };
}
