import type { ReactElement } from 'react';

/**
 * "TESTPILOT" rendered as a true 5x7 bitmap display face, hand-plotted so the
 * brand reads as authored pixel-art rather than a system monospace heading.
 * The "PILOT" half is tinted with the sun token to echo the wordmark accent.
 */

// 5x7 glyphs. '#'=filled.
// CONSTRAINT: this map only covers the distinct letters in "TESTPILOT"
// (T,E,S,P,I,L,O — 7 glyphs). Any character passed in that is missing here
// will throw at render (FONT[ch] is undefined). If the wordmark label ever
// changes, add the new glyphs below before changing `letters` in render.
const FONT: Record<string, string[]> = {
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.']
};

const U = 3; // px per cell
const GAP = 1; // empty columns between letters

interface Letter {
  ch: string;
  tint: string;
}

export function PixelWordmark({ scale = 1 }: { scale?: number }): ReactElement {
  const sand = 'var(--sand)';
  const sun = 'var(--sun)';
  const letters: Letter[] = [
    ...'TEST'.split('').map((ch) => ({ ch, tint: sand })),
    ...'PILOT'.split('').map((ch) => ({ ch, tint: sun }))
  ];

  const rects: ReactElement[] = [];
  let cx = 0;
  letters.forEach((letter, li) => {
    const glyph = FONT[letter.ch];
    glyph.forEach((row, y) => {
      [...row].forEach((cell, x) => {
        if (cell !== '#') return;
        rects.push(
          <rect
            key={`${li}-${x}-${y}`}
            x={(cx + x) * U}
            y={y * U}
            width={U}
            height={U}
            fill={letter.tint}
          />
        );
      });
    });
    cx += 5 + GAP;
  });

  const w = (cx - GAP) * U;
  const h = 7 * U;
  return (
    <svg
      className="wordmark-svg"
      width={w * scale}
      height={h * scale}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label="testpilot"
      shapeRendering="crispEdges"
    >
      {rects}
    </svg>
  );
}
