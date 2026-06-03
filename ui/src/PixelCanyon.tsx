import type { ReactElement } from 'react';

/**
 * Inline pixel-art Grand Canyon rim / mesa silhouette for the hero empty state.
 * Drawn on a coarse integer grid with hard edges (shape-rendering: crispEdges)
 * so it reads as deliberate pixel-art rather than a smooth vector illustration.
 * Colors are pulled from the strata palette so it stays on-theme.
 */
export function PixelCanyon() {
  // Each rect is one "pixel block" on a 64x36 grid. We build mesa columns by
  // stacking colored bands; a small pixel sun sits in the sky.
  const U = 8; // unit size in SVG user units
  const cols = 64;
  const rows = 36;

  // Strata band colors top->bottom (rim light to deep shadow).
  const bands = ['#f2c14e', '#e0a96d', '#c8703f', '#b05a3a', '#a04a35', '#6e466b', '#3c3357'];

  // Skyline: height (in blocks) of the canyon rim per column. A blocky mesa
  // profile — flat tops, sheer step-downs — evoking the South Rim.
  const skyline: number[] = [];
  for (let x = 0; x < cols; x++) {
    // Deterministic stepped silhouette built from a few plateaus.
    let h = 14;
    if (x > 6) h = 17;
    if (x > 12) h = 15;
    if (x > 18) h = 21;
    if (x > 23) h = 19;
    if (x > 28) h = 24;
    if (x > 34) h = 20;
    if (x > 39) h = 26;
    if (x > 45) h = 22;
    if (x > 50) h = 28;
    if (x > 56) h = 24;
    skyline.push(h);
  }

  const rects: ReactElement[] = [];

  // Mesa body: fill each column from its rim down to the canyon floor, banded.
  for (let x = 0; x < cols; x++) {
    const top = skyline[x];
    for (let y = top; y < rows; y++) {
      const depth = y - top;
      const band = bands[Math.min(bands.length - 1, Math.floor(depth / 3))];
      rects.push(<rect key={`m${x}-${y}`} x={x * U} y={y * U} width={U} height={U} fill={band} />);
    }
  }

  // Pixel sun in the upper-left sky.
  const sun: Array<[number, number]> = [];
  const sCx = 10;
  const sCy = 7;
  const r = 3;
  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -r; dy <= r; dy++) {
      if (dx * dx + dy * dy <= r * r + 1) sun.push([sCx + dx, sCy + dy]);
    }
  }
  sun.forEach(([x, y], i) => {
    rects.push(<rect key={`s${i}`} x={x * U} y={y * U} width={U} height={U} fill="#f4d27a" />);
  });

  return (
    <svg
      className="pixel-canyon"
      viewBox={`0 0 ${cols * U} ${rows * U}`}
      role="img"
      aria-label="Pixel-art silhouette of the Grand Canyon rim at sunset"
      preserveAspectRatio="xMidYMax slice"
      shapeRendering="crispEdges"
    >
      {rects}
    </svg>
  );
}
