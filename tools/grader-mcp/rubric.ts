export interface RubricCriterion {
  id: string;
  title: string;
  whatEarnsFour: string;
}

// The single source of truth for grading the testpilot live view. The grader
// subagent scores each criterion 0-4 and must give specific, actionable feedback.
export const RUBRIC_CRITERIA: RubricCriterion[] = [
  {
    id: 'design_system',
    title: 'Design-system rigor',
    whatEarnsFour:
      'Consistent spacing scale, type scale, and a constrained, intentional palette. No ad-hoc pixel values, generic gradients, emoji-as-UI, or off-the-shelf component-kit defaults.'
  },
  {
    id: 'evidence_altitude',
    title: 'Decision & evidence altitude',
    whatEarnsFour:
      'Surfaces the judgment (safe drift vs. product regression) WITH its evidence — vision reasoning, before/after, the diff, the guardrail verdict — not just pass/fail. Hierarchy guides the eye to what matters.'
  },
  {
    id: 'real_data',
    title: 'Real-data fidelity',
    whatEarnsFour:
      'Binds to actual runs/ artifacts and live events. No lorem-ipsum or fake placeholders. Handles empty, loading, error, and reconnect states.'
  },
  {
    id: 'liveness',
    title: 'Live-ness',
    whatEarnsFour:
      'Reflects pipeline state transitions in real time as events stream, smoothly, with no jank or layout thrash. The active stage is obvious.'
  },
  {
    id: 'accessibility',
    title: 'Accessibility & robustness',
    whatEarnsFour:
      'Keyboard-navigable, axe-core clean, sufficient contrast despite the pixel theme, no console errors, and holds up at 1440 / 768 / 375 widths.'
  },
  {
    id: 'theme_craft',
    title: 'Theme craft',
    whatEarnsFour:
      'Grand Canyon / desert pixel art executed as a cohesive system (consistent pixel grid, crisp pixelated rendering, deliberate palette) that ENHANCES legibility and never fights the run data.'
  },
  {
    id: 'engineering',
    title: 'Engineering quality',
    whatEarnsFour:
      'A thin read-layer that does not entangle the agent core; typed; clean build; no needless heavy dependencies (a component kit would invite the vibe-coded look).'
  }
];

export const PASS_THRESHOLD = {
  everyCriterionAtLeast: 3,
  noCriterionBelow: 2
};

export function rubricMarkdown(): string {
  const lines = [
    '# testpilot live-view rubric',
    '',
    'Score each criterion 0-4. Give specific, actionable feedback (what to change), not a vibe.',
    `Pass = every criterion >= ${PASS_THRESHOLD.everyCriterionAtLeast} and none < ${PASS_THRESHOLD.noCriterionBelow}.`,
    '',
    ...RUBRIC_CRITERIA.map((c) => `## ${c.id} — ${c.title}\n4/4: ${c.whatEarnsFour}`),
    '',
    'Anti-patterns that cap a score (the "vibe-coded" look): purple gradients, emoji used as UI,',
    'generic component-kit defaults, fake/placeholder data, centered-everything with no hierarchy,',
    'low contrast, and decoration that obscures the data.'
  ];
  return lines.join('\n');
}
