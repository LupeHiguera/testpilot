export interface RubricCriterion {
  id: string;
  title: string;
  whatEarnsFour: string;
}

// The single source of truth for grading the testpilot live view. The grader
// subagent scores each criterion 0-4 and must give specific, actionable feedback.
//
// This is the "wow" revision: the bar is no longer "clean and inoffensive" — that
// now scores a 2. A 4 must feel ALIVE and DISTINCTIVE. Boldness, atmosphere, and a
// signature moment are rewarded; "safe", "generic", and "static" are penalized.
// The only hard floor is legibility of the run data and accessibility.
export const RUBRIC_CRITERIA: RubricCriterion[] = [
  {
    id: 'wow_factor',
    title: 'Wow factor / signature moment',
    whatEarnsFour:
      'A first-time viewer reacts ("whoa"). There is at least one memorable, signature moment — a dramatic reveal, living motion, atmospheric depth, a hero element — that could not come from a template. The interface feels alive, not a static list. Safe/clean/generic caps this at 2; nothing distinctive is a 0.'
  },
  {
    id: 'theme_craft',
    title: 'Theme craft & atmosphere',
    whatEarnsFour:
      'The Grand Canyon / desert world is rendered as a cohesive, atmospheric, pixel-art system that STRUCTURES the layout (not just colors it): depth, light, motion, weather, time-of-day — all in service of the metaphor. Bold and immersive, while the data stays readable.'
  },
  {
    id: 'evidence_altitude',
    title: 'Decision & evidence altitude',
    whatEarnsFour:
      'Surfaces the judgment (safe drift vs. product regression) WITH its evidence — vision reasoning, before/after, the diff, the verdict — and makes the verdict a dramatic, unmissable moment. Hierarchy guides the eye to what matters.'
  },
  {
    id: 'liveness',
    title: 'Live-ness & motion',
    whatEarnsFour:
      'The run visibly, beautifully unfolds in real time — the active stage is unmistakable, transitions feel physical and intentional, and there is ambient life. No jank, no strobe; motion tells the story.'
  },
  {
    id: 'real_data',
    title: 'Real-data fidelity',
    whatEarnsFour:
      'Binds to actual runs/ artifacts and live events. No lorem-ipsum or fake placeholders. Handles empty, loading, error, and reconnect states gracefully.'
  },
  {
    id: 'design_system',
    title: 'Design-system rigor',
    whatEarnsFour:
      'A constrained, intentional palette and consistent spacing/type scales underneath the boldness — so it reads as authored, not chaotic. No emoji-as-UI, no generic component-kit defaults.'
  },
  {
    id: 'accessibility',
    title: 'Accessibility & robustness (floor)',
    whatEarnsFour:
      'Keyboard-navigable, axe-core clean, sufficient contrast despite the bold theme, no console errors, holds up at 1440 / 768 / 375, and honours prefers-reduced-motion. This is a hard floor — wow never comes at its expense.'
  },
  {
    id: 'engineering',
    title: 'Engineering quality',
    whatEarnsFour:
      'A thin read-layer that does not entangle the agent core; typed; clean build; no needless heavy dependencies; motion implemented performantly (CSS/SVG, no jank).'
  }
];

export const PASS_THRESHOLD = {
  everyCriterionAtLeast: 3,
  noCriterionBelow: 2
};

export function rubricMarkdown(): string {
  const lines = [
    '# testpilot live-view rubric (wow revision)',
    '',
    'Score each criterion 0-4. Give specific, actionable feedback (what to change), not a vibe.',
    'The bar is WOW: "clean and inoffensive" is a 2. A 4 must feel alive and distinctive.',
    `Pass = every criterion >= ${PASS_THRESHOLD.everyCriterionAtLeast} and none < ${PASS_THRESHOLD.noCriterionBelow}.`,
    '',
    ...RUBRIC_CRITERIA.map((c) => `## ${c.id} — ${c.title}\n4/4: ${c.whatEarnsFour}`),
    '',
    'Reward: atmosphere, depth, motion, a signature moment, boldness that serves the canyon metaphor.',
    'Penalize: safe/generic/static layouts, emoji-as-UI, generic gradients, component-kit defaults, fake data,',
    'and anything that hurts legibility or accessibility (the hard floor).'
  ];
  return lines.join('\n');
}
