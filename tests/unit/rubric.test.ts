import { describe, expect, it } from 'vitest';
import { PASS_THRESHOLD, RUBRIC_CRITERIA, rubricMarkdown } from '../../tools/grader-mcp/rubric.js';

describe('grader rubric', () => {
  it('exposes the criteria (incl. wow_factor) and a 0-10 pass threshold', () => {
    expect(RUBRIC_CRITERIA).toHaveLength(8);
    expect(RUBRIC_CRITERIA.map((c) => c.id)).toContain('wow_factor');
    expect(PASS_THRESHOLD.everyCriterionAtLeast).toBe(7);
    expect(PASS_THRESHOLD.noCriterionBelow).toBe(5);
  });

  it('renders every criterion id and the pass rule into the markdown', () => {
    const markdown = rubricMarkdown();
    for (const criterion of RUBRIC_CRITERIA) {
      expect(markdown).toContain(criterion.id);
    }
    expect(markdown).toContain('Pass = every criterion >= 7');
  });
});
