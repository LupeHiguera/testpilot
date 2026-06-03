import type { ReactElement } from 'react';

/**
 * The CanyonSpine is the structural backbone of the POPULATED run view: a
 * vertical pixel-art cliff face that runs down the left edge of the live strata.
 * The run literally descends it — a sun marker sits at the depth of the active
 * (or last-reached) layer, so progress reads as "how deep into the canyon are
 * we" rather than "how far down a list".
 *
 * It is drawn on a coarse integer grid (crispEdges) like the hero PixelCanyon,
 * but oriented tall-and-narrow. `total` = number of strata layers currently
 * shown; `reached` = 1-based depth of the deepest layer (the marker sits there).
 * The SVG stretches to the full height of the strata column via CSS so the
 * marker lines up with real rows.
 */

const COLS = 16; // pixel columns across the narrow cliff
const U = 4; // user units per pixel block

// Warm sandstone -> deep shadow, matching the --strata-* tokens (kept in sync
// with theme.css; values duplicated here because SVG fills can't read CSS vars
// per-rect cheaply at this grid size).
const BAND = ['#f0bf6b', '#e0a05a', '#c8703f', '#b85a34', '#a8512f', '#7d3b29', '#5a2c22'];
const RIM_LIGHT = '#ffdf9a';
const GROOVE = '#3a1c14';
const SUN = '#ffd873';
const SUN_CORE = '#fff0c2';

export function CanyonSpine({
  total,
  reached,
  rows = 24
}: {
  total: number;
  reached: number;
  rows?: number;
}): ReactElement {
  const ROWS = Math.max(rows, total * 3);
  const rects: ReactElement[] = [];

  // Map a pixel row to a strata band so the wall darkens with depth, matching
  // the stacked rows beside it.
  for (let y = 0; y < ROWS; y++) {
    const t = ROWS <= 1 ? 0 : y / (ROWS - 1);
    let band = Math.min(BAND.length - 1, Math.floor(t * BAND.length));
    for (let x = 0; x < COLS; x++) {
      let fill = BAND[band];
      // Sunlit rim down the right edge of the cliff (faces the strata rows).
      if (x >= COLS - 2 && (x + y) % 7 !== 0) fill = RIM_LIGHT;
      // Eroded vertical grooves so it doesn't read as a flat ruled bar.
      const groove = (x * 3 + Math.round(Math.sin(y * 0.4) * 2) + 16) % 5 === 0;
      if (groove && x < COLS - 2) fill = BAND[Math.min(BAND.length - 1, band + 1)];
      // Occasional darker fracture lines between bands.
      if (y % Math.max(2, Math.floor(ROWS / BAND.length)) === 0 && x < COLS - 2) fill = GROOVE;
      rects.push(<rect key={`w-${x}-${y}`} x={x * U} y={y * U} width={U} height={U} fill={fill} />);
    }
  }

  // --- Descending sun marker: sits at the depth of the deepest reached layer.
  if (total > 0) {
    const frac = total <= 1 ? 0 : (reached - 1) / total;
    const markY = Math.min(ROWS - 4, Math.round(frac * ROWS) + 1);
    const markX = 3;
    // a small sun disc embedded in the cliff, tracking the run's descent
    const disc: Array<[number, number]> = [
      [0, -1], [-1, 0], [0, 0], [1, 0], [2, 0], [0, 1],
      [1, -1], [1, 1], [-1, -1], [-1, 1], [2, -1], [2, 1]
    ];
    disc.forEach(([dx, dy], i) => {
      const x = markX + dx;
      const y = markY + dy;
      if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return;
      const core = dx >= 0 && dx <= 1 && dy === 0;
      rects.push(
        <rect key={`m-${i}`} x={x * U} y={y * U} width={U} height={U} fill={core ? SUN_CORE : SUN} />
      );
    });
    // short sun rays
    [[-2, 0], [3, 0], [4, 0]].forEach(([dx, dy], i) => {
      const x = markX + dx;
      const y = markY + dy;
      if (x < 0 || x >= COLS) return;
      rects.push(<rect key={`r-${i}`} x={x * U} y={y * U} width={U} height={U} fill={SUN} />);
    });
  }

  return (
    <svg
      className="canyon-spine"
      viewBox={`0 0 ${COLS * U} ${ROWS * U}`}
      role="img"
      aria-label={`Canyon depth gauge: descended ${reached} of ${total} rock layers`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
    >
      {rects}
    </svg>
  );
}
