export interface RubricCriterion {
  id: string;
  title: string;
  whatEarnsTen: string;
}

// The single source of truth for grading the testpilot live view, scored 0-10.
//
// CALIBRATION: the current site is a 5/10. The canyon HERO (the live run view) is
// striking and alive — but the rest of the site (the sidebar panels, the story
// inbox, the forms, the docs cards, the run history, the topbar controls) is still
// generic dark-dashboard chrome that does NOT belong to the canyon world. A 10 means
// EVERY surface is authored, cohesive, and alive — not just the hero. Generic chrome,
// plain form inputs, and flat dark list panels cap the score hard.
// The only hard floor is legibility of the run data and accessibility.
export const RUBRIC_CRITERIA: RubricCriterion[] = [
  {
    id: 'wow_factor',
    title: 'Wow factor across the whole site',
    whatEarnsTen:
      'EVERY screen and panel has a signature, memorable quality — not only the canyon hero. A first-time viewer reacts no matter where they look (sidebar, forms, docs, history). At 5 today only the live-run hero wows; a 10 makes the whole experience feel crafted and alive.'
  },
  {
    id: 'theme_craft',
    title: 'Whole-world theme cohesion',
    whatEarnsTen:
      'The Grand Canyon / desert / expedition world STRUCTURES every surface: the Stories panel, Expeditions log, forms, Docs cards, and history read as carved-stone / field-journal artifacts of one world — not generic dark panels with a themed hero bolted on. Total cohesion and atmosphere everywhere. Generic chrome caps this.'
  },
  {
    id: 'evidence_altitude',
    title: 'Decision & evidence altitude',
    whatEarnsTen:
      'Surfaces the judgment (safe drift vs. product regression) WITH its evidence — reasoning, before/after, diff, verdict — and makes the verdict a dramatic, unmissable moment, both live and in history.'
  },
  {
    id: 'liveness',
    title: 'Live-ness & motion everywhere',
    whatEarnsTen:
      'The run unfolds beautifully in real time AND the supporting UI feels alive too (ambient texture/motion, responsive feedback on forms and lists). No jank, no strobe; motion tells the story. Reduced-motion still reads.'
  },
  {
    id: 'real_data',
    title: 'Real-data fidelity',
    whatEarnsTen:
      'Binds to actual runs/ artifacts and live events. No lorem-ipsum or fake placeholders. Empty, loading, error, and reconnect states are all handled and on-theme.'
  },
  {
    id: 'design_system',
    title: 'Design-system rigor',
    whatEarnsTen:
      'A constrained, intentional palette and consistent spacing/type scales underneath the boldness, applied consistently to EVERY component so the site reads as authored, not chaotic. No emoji-as-UI, no generic component-kit defaults, no flat undecorated panels.'
  },
  {
    id: 'accessibility',
    title: 'Accessibility & robustness (floor)',
    whatEarnsTen:
      'Keyboard-navigable, axe-core clean, sufficient contrast despite the bold theme, no console errors, holds up at 1440 / 768 / 375, and honours prefers-reduced-motion. A hard floor — wow never comes at its expense.'
  },
  {
    id: 'engineering',
    title: 'Engineering quality',
    whatEarnsTen:
      'A thin read-layer that does not entangle the agent core; typed; clean build; no needless heavy dependencies; motion implemented performantly (CSS/SVG, no jank).'
  }
];

export const PASS_THRESHOLD = {
  // 0-10 scale. The current site sits ~5; we are pushing the WHOLE site to >= 7.
  everyCriterionAtLeast: 7,
  noCriterionBelow: 5
};

export function rubricMarkdown(): string {
  const lines = [
    '# testpilot live-view rubric (0-10, whole-site)',
    '',
    'Score each criterion 0-10. Give specific, actionable feedback (what to change), not a vibe.',
    'CALIBRATION: the current site is a 5/10 — the canyon hero wows, but the surrounding chrome',
    '(sidebar panels, story inbox, forms, docs cards, history, topbar) is still generic dark-dashboard',
    'UI that does not belong to the canyon world. A 10 means EVERY surface is authored, cohesive, alive.',
    `Pass = every criterion >= ${PASS_THRESHOLD.everyCriterionAtLeast} and none < ${PASS_THRESHOLD.noCriterionBelow}.`,
    '',
    ...RUBRIC_CRITERIA.map((c) => `## ${c.id} — ${c.title}\n10/10: ${c.whatEarnsTen}`),
    '',
    'Reward: atmosphere, depth, motion, a signature moment, and craft applied to EVERY surface.',
    'Penalize hard: generic dark panels, plain form inputs, flat list chrome, a themed hero bolted onto a',
    'generic dashboard, emoji-as-UI, component-kit defaults, fake data, and anything that hurts legibility',
    'or accessibility (the hard floor).'
  ];
  return lines.join('\n');
}
