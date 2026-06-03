import type { ReactElement } from 'react';

/**
 * Pixel-art Sonoran canyon at dusk for the hero empty state.
 *
 * Built on a coarse integer grid with hard edges (shapeRendering: crispEdges)
 * so it reads as deliberate pixel-art. The scene has real depth: a dusk-gradient
 * sky with a sharp eight-ray sun, layered distant mesas, then a near canyon wall
 * with irregular eroded strata bands and a turquoise river threading the floor.
 *
 * Wide + short on purpose: the banner is letterboxed, and preserveAspectRatio
 * "slice" scales to width — a tall scene would crop the sky away. Colors echo
 * the desert tokens; the .pixel-canyon CSS background uses the tokens directly.
 */

const U = 6; // SVG user units per pixel block
const COLS = 120;
const ROWS = 30;

// Desert-dusk palette (top sky -> deep canyon shadow), matching theme tokens.
const SKY_TOP = '#caa7b8'; // dusty rose high sky
const SKY_MID = '#e08e63'; // amber band near horizon
const SKY_LOW = '#d27a48'; // terracotta haze
const SUN = '#ffd873';
const SUN_CORE = '#fff0c2';
const MESA_FAR = '#9a6048'; // distant mesa silhouette
const MESA_MID = '#7d4636';
const STRATA = ['#f0bf6b', '#e0a05a', '#c8703f', '#a8512f', '#7d3b29', '#5a2c22']; // wall bands
const RIM_LIGHT = '#ffdf9a';
const RIVER = '#3fb8a6';
const RIVER_DEEP = '#1f7d72';
const FLOOR = '#43271f';

function px(rects: ReactElement[], x: number, y: number, fill: string, key: string) {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return;
  rects.push(<rect key={key} x={x * U} y={y * U} width={U} height={U} fill={fill} />);
}

export function PixelCanyon() {
  const rects: ReactElement[] = [];
  const FLOOR_Y = ROWS - 3;

  // --- Sky: three banded gradients (kept blocky on purpose). ---
  for (let y = 0; y < ROWS; y++) {
    const sky = y < 4 ? SKY_TOP : y < 8 ? SKY_MID : SKY_LOW;
    for (let x = 0; x < COLS; x++) px(rects, x, y, sky, `sky-${x}-${y}`);
  }

  // --- Sharp eight-ray sun (no fuzzy blob): solid disc + crisp straight rays. ---
  const sCx = 94;
  const sCy = 6;
  for (let dx = -3; dx <= 3; dx++) {
    for (let dy = -3; dy <= 3; dy++) {
      const d = dx * dx + dy * dy;
      if (d <= 9) px(rects, sCx + dx, sCy + dy, d <= 2 ? SUN_CORE : SUN, `sun-${dx}-${dy}`);
    }
  }
  const rays: Array<[number, number]> = [
    [0, -5], [0, -6], [0, 5], [0, 6], [-5, 0], [-6, 0], [5, 0], [6, 0],
    [4, 4], [5, 5], [-4, 4], [-5, 5], [4, -4], [5, -5], [-4, -4], [-5, -5]
  ];
  rays.forEach(([dx, dy], i) => px(rects, sCx + dx, sCy + dy, SUN, `ray-${i}`));

  // --- Distant mesas: two staggered silhouettes for depth. ---
  const mesaFar = (x: number) => {
    let h = 11;
    if (x > 12) h = 9;
    if (x > 26) h = 12;
    if (x > 44) h = 8;
    if (x > 62) h = 11;
    if (x > 82) h = 9;
    if (x > 102) h = 12;
    return h;
  };
  for (let x = 0; x < COLS; x++) {
    const top = mesaFar(x);
    for (let y = top; y < top + 3; y++) px(rects, x, y, MESA_FAR, `mf-${x}-${y}`);
  }
  const mesaMid = (x: number) => {
    let h = 14;
    if (x > 16) h = 12;
    if (x > 34) h = 15;
    if (x > 56) h = 11;
    if (x > 78) h = 14;
    if (x > 100) h = 12;
    return h;
  };
  for (let x = 0; x < COLS; x++) {
    const top = mesaMid(x);
    for (let y = top; y < top + 2; y++) px(rects, x, y, MESA_MID, `mm-${x}-${y}`);
  }

  // --- Near canyon wall with eroded strata. Rim is irregular (erosion);
  //     band lower edges wobble so layers don't read as flat ruled rows. ---
  const rim = (x: number) => {
    let h = 16;
    if (x > 9) h = 15;
    if (x > 20) h = 17;
    if (x > 32) h = 14;
    if (x > 46) h = 16;
    if (x > 60) h = 13;
    if (x > 74) h = 16;
    if (x > 90) h = 14;
    if (x > 106) h = 16;
    if (x % 11 === 3) h += 1; // erosion notches
    if (x % 7 === 5) h -= 1;
    return h;
  };
  const bandOffset = (x: number, band: number) =>
    Math.round(Math.sin((x + band * 5) * 0.6) + Math.sin(x * 0.27 + band)); // -2..2

  for (let x = 0; x < COLS; x++) {
    const top = rim(x);
    for (let y = top; y < FLOOR_Y; y++) {
      const depth = y - top;
      const baseBand = Math.floor(depth / 2.2);
      let band = baseBand + bandOffset(x, baseBand);
      band = Math.max(0, Math.min(STRATA.length - 1, band));
      let fill = STRATA[band];
      if (depth === 0) fill = RIM_LIGHT; // sunlit top edge of the wall
      if (x % 9 === 4 && depth > 2) fill = STRATA[Math.min(STRATA.length - 1, band + 1)]; // erosion grooves
      px(rects, x, y, fill, `w-${x}-${y}`);
    }
  }

  // --- Canyon floor + meandering turquoise river seated on the floor. ---
  for (let x = 0; x < COLS; x++) {
    for (let y = FLOOR_Y; y < ROWS; y++) px(rects, x, y, FLOOR, `fl-${x}-${y}`);
  }
  for (let x = 0; x < COLS; x++) {
    const meander = Math.sin(x * 0.18) > 0 ? 0 : 1; // gentle 2-row sway
    px(rects, x, FLOOR_Y + meander, RIVER, `r-${x}`);
    px(rects, x, FLOOR_Y + 1 + meander, RIVER_DEEP, `rd-${x}`);
  }

  return (
    <svg
      className="pixel-canyon"
      viewBox={`0 0 ${COLS * U} ${ROWS * U}`}
      role="img"
      aria-label="Pixel-art Sonoran canyon at dusk: a sharp sun over layered mesas, an eroded strata wall, and a turquoise river on the canyon floor"
      preserveAspectRatio="xMidYMax slice"
      shapeRendering="crispEdges"
    >
      {rects}
    </svg>
  );
}
