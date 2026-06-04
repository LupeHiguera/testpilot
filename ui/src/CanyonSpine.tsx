import type { CSSProperties, ReactElement } from 'react';

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

const COLS = 28; // pixel columns across the WIDE cliff (~92px on screen)
const U = 4; // user units per pixel block

// POLYCHROME canyon: a blue sky strip at the rim, varied limestone/ochre/red
// walls, then a teal river at the floor — matching the --sky-*, --strata-*, and
// --river* tokens (duplicated here because SVG fills can't read CSS vars cheaply
// per-rect at this grid size; kept in sync with theme.css).
const SKY = ['#bcd9e6', '#6ea3c0', '#3d6e8c']; // rim sky: pale -> deep blue
const BAND = ['#e9d8b4', '#e6c281', '#e0a96d', '#cf6b3f', '#b9502f', '#a8432c', '#7c3a2e', '#5e3330'];
const RIM_LIGHT = '#f3e8c8'; // sunlit limestone edge
const GROOVE = '#3a221f'; // dark fracture line
const RIVER = '#2fa89a';
const RIVER_BRIGHT = '#49c5b4';
const RIVER_DEEP = '#1f7d72';
const GREEN = '#7e9b5e'; // sparse juniper clinging to the wall
const SUN = '#ffd873';
const SUN_CORE = '#fff0c2';

export function CanyonSpine({
  total,
  reached,
  rows = 24,
  active = false
}: {
  total: number;
  reached: number;
  rows?: number;
  active?: boolean;
}): ReactElement {
  const ROWS = Math.max(rows, total * 3);
  const rects: ReactElement[] = [];

  // Vertical bands of the scene, top -> bottom: a thin sky strip at the rim, the
  // polychrome rock wall, then a teal river at the floor. Fractions of height.
  const SKY_END = Math.max(2, Math.round(ROWS * 0.07)); // sky strip rows
  const RIVER_START = ROWS - Math.max(2, Math.round(ROWS * 0.06)); // river rows
  const wallSpan = Math.max(1, RIVER_START - SKY_END);

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      let fill: string;
      if (y < SKY_END) {
        // Blue sky at the rim, paling upward.
        const s = Math.min(SKY.length - 1, Math.floor((y / Math.max(1, SKY_END)) * SKY.length));
        fill = SKY[s];
      } else if (y >= RIVER_START) {
        // Teal river at the floor with a lit ripple line.
        const r = y - RIVER_START;
        fill = r === 0 ? RIVER_BRIGHT : (x + y) % 4 === 0 ? RIVER : RIVER_DEEP;
      } else {
        // Polychrome rock wall: band darkens/reddens with depth.
        const t = (y - SKY_END) / wallSpan;
        let band = Math.min(BAND.length - 1, Math.floor(t * BAND.length));
        fill = BAND[band];
        // Sunlit rim down the right edge of the cliff (faces the strata rows).
        if (x >= COLS - 2 && (x + y) % 7 !== 0) fill = RIM_LIGHT;
        // Eroded vertical grooves so it doesn't read as a flat ruled bar.
        const groove = (x * 3 + Math.round(Math.sin(y * 0.4) * 2) + 16) % 5 === 0;
        if (groove && x < COLS - 2) fill = BAND[Math.min(BAND.length - 1, band + 1)];
        // Occasional darker fracture lines between bands.
        if ((y - SKY_END) % Math.max(2, Math.floor(wallSpan / BAND.length)) === 0 && x < COLS - 2) fill = GROOVE;
        // Sparse juniper greenery clinging to ledges in the upper-mid wall.
        if (band <= 3 && x > 1 && x < 6 && (x * 5 + y * 3) % 23 === 0) fill = GREEN;
      }
      rects.push(<rect key={`w-${x}-${y}`} x={x * U} y={y * U} width={U} height={U} fill={fill} />);
    }
  }

  // --- Descending sun marker: sits at the depth of the deepest reached layer.
  //     frac = reached/total so a COMPLETE run (reached === total) lands the
  //     marker at the floor, and an empty run sits at the rim.
  if (total > 0) {
    const frac = Math.min(1, reached / total);
    const markY = Math.min(ROWS - 4, Math.max(1, Math.round(frac * (ROWS - 1))));
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

  // Depth fraction the descent has reached (0 at rim, 1 at floor). The glow trail
  // and the travelling "ember" both read off this via a CSS custom property so
  // they line up with the SVG sun marker without re-plotting rects every tick.
  const frac = total > 0 ? Math.min(1, reached / total) : 0;

  return (
    <div
      className={`spine-stack ${active ? 'is-active' : ''}`}
      style={{ '--descent': frac } as CSSProperties}
    >
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
      {/* A glow that pours DOWN the cliff to the depth reached so far — the run's
          "trail of fire/water" travelling through the layers. A brighter ember
          rides the leading edge while the run is live. Purely decorative. */}
      <div className="spine-trail" aria-hidden />
      <div className="spine-ember" aria-hidden />
    </div>
  );
}
