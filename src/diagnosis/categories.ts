import { FailureCategory } from '../core/types.js';

export const FAILURE_CATEGORIES: FailureCategory[] = [
  'APP_UNAVAILABLE',
  'NETWORK_OR_API_FAILURE',
  'AUTH_OR_TEST_DATA_FAILURE',
  'SELECTOR_DRIFT',
  'UI_COPY_CHANGE',
  'TIMING_OR_FLAKE',
  'PRODUCT_REGRESSION',
  'UNKNOWN'
];

/** Categories that represent safe test drift the repair agent may act on. */
export const REPAIRABLE_CATEGORIES: ReadonlySet<FailureCategory> = new Set<FailureCategory>([
  'SELECTOR_DRIFT',
  'UI_COPY_CHANGE',
  'TIMING_OR_FLAKE'
]);

export function isRepairableCategory(category: FailureCategory): boolean {
  return REPAIRABLE_CATEGORIES.has(category);
}
