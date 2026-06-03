import { Diagnosis, VisionDiagnosis } from '../core/types.js';
import { isRepairableCategory } from './categories.js';

/**
 * Combine a deterministic heuristic diagnosis with a vision model's read of the
 * failure screenshot.
 *
 * Safety invariant: vision may VETO a repair but never AUTHORIZE one the
 * heuristics did not already allow. The result is repairable only when both the
 * heuristic and the vision category are repairable. This keeps the model from
 * ever turning a product regression (or an UNKNOWN) into an auto-applied repair.
 */
export function mergeVisionDiagnosis(heuristic: Diagnosis, vision: VisionDiagnosis): Diagnosis {
  const visionRepairable = isRepairableCategory(vision.category);

  // Vision veto: heuristic thought it was safe drift, vision sees a real problem.
  if (heuristic.repairable && !visionRepairable) {
    return {
      category: vision.category,
      confidence: vision.confidence,
      reason: `Heuristics suggested ${heuristic.category}, but vision flagged ${vision.category}: ${vision.reason}. Repair withheld for human review.`,
      repairable: false
    };
  }

  // Both agree this is safe drift: confirm and take the stronger confidence.
  if (heuristic.repairable && visionRepairable) {
    return {
      category: heuristic.category,
      confidence: Math.max(heuristic.confidence, vision.confidence),
      reason: `${heuristic.reason} Vision concurs (${vision.category}): ${vision.reason}`,
      repairable: true
    };
  }

  // Heuristic is already cautious. Vision cannot upgrade it to repairable;
  // keep the cautious verdict and attach the vision context for the reviewer.
  return {
    category: heuristic.category,
    confidence: heuristic.confidence,
    reason: `${heuristic.reason} Vision note (${vision.category}): ${vision.reason}`,
    repairable: false
  };
}
