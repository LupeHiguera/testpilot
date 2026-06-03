import { describe, expect, it } from 'vitest';
import { PASS_THRESHOLD, RUBRIC_CRITERIA, rubricMarkdown } from '../../tools/grader-mcp/rubric.js';

describe('grader rubric', () => {
  it('exposes seven criteria and a pass threshold', () => {
    expect(RUBRIC_CRITERIA).toHaveLength(7);
    expect(PASS_THRESHOLD.everyCriterionAtLeast).toBe(3);
    expect(PASS_THRESHOLD.noCriterionBelow).toBe(2);
  });

  it('renders every criterion id and the pass rule into the markdown', () => {
    const markdown = rubricMarkdown();
    for (const criterion of RUBRIC_CRITERIA) {
      expect(markdown).toContain(criterion.id);
    }
    expect(markdown).toContain('Pass = every criterion >= 3');
  });
});
