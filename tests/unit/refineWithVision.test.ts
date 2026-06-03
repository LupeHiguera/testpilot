import { describe, expect, it } from 'vitest';
import { Diagnosis, FailureCategory, VisionDiagnosis } from '../../src/core/types.js';
import { isRepairableCategory } from '../../src/diagnosis/categories.js';
import { mergeVisionDiagnosis } from '../../src/diagnosis/refineWithVision.js';

function heuristic(category: FailureCategory, repairable: boolean): Diagnosis {
  return { category, confidence: 0.7, reason: `heuristic ${category}`, repairable };
}

function vision(category: FailureCategory, confidence = 0.8): VisionDiagnosis {
  return { category, confidence, reason: `vision ${category}` };
}

describe('mergeVisionDiagnosis', () => {
  it('confirms a repair when heuristic and vision both see safe drift', () => {
    const result = mergeVisionDiagnosis(heuristic('UI_COPY_CHANGE', true), vision('UI_COPY_CHANGE', 0.95));
    expect(result.repairable).toBe(true);
    expect(result.category).toBe('UI_COPY_CHANGE');
    expect(result.confidence).toBe(0.95); // takes the stronger confidence
  });

  it('vetoes a repair when vision sees a product regression', () => {
    const result = mergeVisionDiagnosis(heuristic('UI_COPY_CHANGE', true), vision('PRODUCT_REGRESSION'));
    expect(result.repairable).toBe(false);
    expect(result.category).toBe('PRODUCT_REGRESSION');
  });

  it('never lets vision authorize a repair the heuristic withheld', () => {
    // Heuristic was cautious (UNKNOWN, not repairable); vision thinks it is safe drift.
    const result = mergeVisionDiagnosis(heuristic('UNKNOWN', false), vision('UI_COPY_CHANGE'));
    expect(result.repairable).toBe(false);
    expect(result.category).toBe('UNKNOWN');
  });

  it('keeps a non-repairable heuristic non-repairable even if vision agrees it is broken', () => {
    const result = mergeVisionDiagnosis(heuristic('PRODUCT_REGRESSION', false), vision('PRODUCT_REGRESSION'));
    expect(result.repairable).toBe(false);
    expect(result.category).toBe('PRODUCT_REGRESSION');
  });

  it('upholds the invariant: result is repairable only if BOTH sides are repairable', () => {
    const categories: FailureCategory[] = [
      'APP_UNAVAILABLE',
      'NETWORK_OR_API_FAILURE',
      'AUTH_OR_TEST_DATA_FAILURE',
      'SELECTOR_DRIFT',
      'UI_COPY_CHANGE',
      'TIMING_OR_FLAKE',
      'PRODUCT_REGRESSION',
      'UNKNOWN'
    ];
    for (const hCat of categories) {
      for (const vCat of categories) {
        for (const hRepairable of [true, false]) {
          const result = mergeVisionDiagnosis(heuristic(hCat, hRepairable), vision(vCat));
          expect(result.repairable).toBe(hRepairable && isRepairableCategory(vCat));
        }
      }
    }
  });
});
