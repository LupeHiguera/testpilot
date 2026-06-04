import type { ReactElement } from 'react';
import type { Stage, Status } from './types';

/**
 * Hand-plotted pixel sprites, one per pipeline stage, plus status marks.
 * Each sprite is a small string grid where every glyph maps to a palette slot.
 * Rendered as <rect> blocks on an integer grid with shape-rendering:crispEdges
 * so they stay crunchy at any size (image-rendering: pixelated on the <svg>).
 *
 * Legend per sprite uses single chars; '.' is transparent.
 */

// Shared palette keyed by single characters used in the grids below.
const INK: Record<string, string> = {
  '.': 'transparent',
  k: '#2a140e', // outline / deep shadow
  y: '#f6c453', // sun gold
  o: '#e8913f', // amber/ochre
  r: '#cf5a3a', // terracotta
  d: '#3aa0c9', // water blue
  D: '#1d6f95', // deep water
  s: '#d8d2c0', // steel / metal light
  S: '#8d8a82', // steel dark
  g: '#7fae4a', // flag green
  w: '#f4e4c9', // sand white
  b: '#2f7d72', // turquoise deep
  t: '#5fd6c6' // turquoise bright
};

// 8x8 grids. Designed to read as tiny icons even at sidebar size.
const SPRITES: Record<Stage, string[]> = {
  // Spec — a sheet of paper / scroll with lines.
  spec: [
    '.wwwww..',
    '.wkkkw..',
    '.wwwwww.',
    '.wkkkkw.',
    '.wwwwww.',
    '.wkkkw..',
    '.wwwwww.',
    '..wwww..'
  ],
  // Observe — sun over the rim (sharp eight-ray sun).
  observe: [
    '...y.y..',
    'y..y.y.y',
    '.y.yyy.y',
    '.yyyoyyy',
    'yyyoooyy',
    '.yyoooy.',
    'y.yyyy.y',
    '...y.y..'
  ],
  // Generate — a gear.
  generate: [
    '..s..s..',
    '.sssssss',
    '.sSkkSss',
    'ssSk.kSs',
    'ssSk.kSs',
    '.sSkkSss',
    '.sssssss',
    '..s..s..'
  ],
  // Run — a water drop (the canyon river / test execution).
  run: [
    '...dd...',
    '...dd...',
    '..dddd..',
    '..dDdd..',
    '.dDDddd.',
    '.dDdddd.',
    '..dddd..',
    '...dd...'
  ],
  // Diagnose — a magnifier.
  diagnose: [
    '.wwww...',
    'wkkkkw..',
    'wk..kw..',
    'wk..kw..',
    'wkkkkw..',
    '.wwwwk..',
    '....wkk.',
    '.....wkk'
  ],
  // Repair — a wrench.
  repair: [
    '.....sS.',
    '....sSS.',
    '...sSS..',
    '..sSS...',
    '.sSS....',
    'sSSk....',
    'SSk.....',
    'Sk......'
  ],
  // PR — a flag on a pole.
  pr: [
    'kgggg...',
    'kgggggg.',
    'kggggg..',
    'kgggg...',
    'k.......',
    'k.......',
    'k.......',
    'kkk.....'
  ],
  // Decision — a checkmark gavel-ish stamp (we recolor per verdict in CSS).
  decision: [
    '......tt',
    '.....tt.',
    '....tt..',
    'b...tt..',
    'bb.tt...',
    '.bbtt...',
    '..bbt...',
    '...b....'
  ]
};

const U = 3; // SVG unit per pixel block

/**
 * Chrome glyphs for the carved field-tablet headers + inbox rows. Same 8x8
 * grid + palette system as the stage sprites so the sidebar belongs to the
 * same hand-plotted world. Keyed by a plain name (not a Stage).
 */
const GLYPHS: Record<string, string[]> = {
  // Field Log — a quill pen nib tilted over a written line (the story journal).
  quill: [
    '......yw',
    '.....ywy',
    '....yws.',
    '...yws..',
    '..ywss..',
    '.ywsk...',
    'ywsk....',
    'kkkkkk..'
  ],
  // Expeditions — a pennant flag on a pole planted in the ground.
  flag: [
    'kgggg...',
    'kggggg..',
    'kgggggg.',
    'kggggg..',
    'kgg.....',
    'k.......',
    'k.......',
    'wwkww...'
  ],
  // Story inbox row — a signpost / trail blaze marking an expedition entry.
  trail: [
    '.oooooo.',
    'oowwwwo.',
    'oowwwwoo',
    '.oooooo.',
    '...ss...',
    '...ss...',
    '...ss...',
    '..wssw..'
  ]
};

export function ChromeGlyph({ name, size = 16 }: { name: keyof typeof GLYPHS; size?: number }): ReactElement {
  const grid = GLYPHS[name];
  const rects: ReactElement[] = [];
  grid.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const fill = INK[ch] ?? 'transparent';
      if (fill === 'transparent') return;
      rects.push(<rect key={`${x}-${y}`} x={x * U} y={y * U} width={U} height={U} fill={fill} />);
    });
  });
  return (
    <svg
      className="sprite glyph"
      width={size}
      height={size}
      viewBox={`0 0 ${8 * U} ${8 * U}`}
      role="img"
      aria-hidden
      shapeRendering="crispEdges"
    >
      {rects}
    </svg>
  );
}

export function StageSprite({ stage, size = 24 }: { stage: Stage; size?: number }): ReactElement {
  const grid = SPRITES[stage];
  const rects: ReactElement[] = [];
  grid.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const fill = INK[ch] ?? 'transparent';
      if (fill === 'transparent') return;
      rects.push(<rect key={`${x}-${y}`} x={x * U} y={y * U} width={U} height={U} fill={fill} />);
    });
  });
  return (
    <svg
      className="sprite"
      width={size}
      height={size}
      viewBox={`0 0 ${8 * U} ${8 * U}`}
      role="img"
      aria-hidden
      shapeRendering="crispEdges"
    >
      {rects}
    </svg>
  );
}

// Status mark: chunky pixel ✓ / ✕ / ▶ / • drawn as blocks so it matches sprites.
const MARKS: Record<Status, string[]> = {
  pass: [
    '......',
    '.....k',
    '....kk',
    'k..kk.',
    'kkkk..',
    '.kk...'
  ],
  fail: [
    'k....k',
    'kk..kk',
    '.kkkk.',
    '.kkkk.',
    'kk..kk',
    'k....k'
  ],
  start: [
    'k.....',
    'kkk...',
    'kkkkk.',
    'kkkkk.',
    'kkk...',
    'k.....'
  ],
  info: [
    '......',
    '..kk..',
    '.kkkk.',
    '.kkkk.',
    '..kk..',
    '......'
  ]
};

export function StatusMark({ status, size = 16 }: { status: Status; size?: number }): ReactElement {
  const grid = MARKS[status];
  const rects: ReactElement[] = [];
  grid.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch !== 'k') return;
      rects.push(<rect key={`${x}-${y}`} x={x * U} y={y * U} width={U} height={U} />);
    });
  });
  return (
    <svg
      className={`mark mark-${status}`}
      width={size}
      height={size}
      viewBox={`0 0 ${6 * U} ${6 * U}`}
      role="img"
      aria-hidden
      shapeRendering="crispEdges"
    >
      {rects}
    </svg>
  );
}
