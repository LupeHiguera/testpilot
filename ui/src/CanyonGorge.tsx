import type { ReactElement } from 'react';

/**
 * CanyonGorge — the full-viewport, FIXED backdrop that puts the whole app INSIDE
 * a Grand Canyon gorge. It is pure SVG/CSS, lives behind all content (z-index
 * below the app), and is purely decorative (aria-hidden), so legibility never
 * depends on it.
 *
 * Composition, back-to-front:
 *   - a sky strip across the top (the canyon RIM opening),
 *   - a far horizon band of distant mesas/buttes (palest, hazy parallax),
 *   - TWO towering layered canyon WALLS rising on the far left + right edges of
 *     the viewport, carved with polychrome strata, ledges, hoodoos, a natural
 *     ARCH, buttes, balanced boulders and sparse juniper — framing the centered
 *     app content like the canyon floor between them,
 *   - a dramatic flowing RIVER along the very floor (animated current, ripple
 *     sparkle, foam, sky reflection) — the showpiece.
 *
 * The walls are drawn once each (left + a mirrored right) as efficient SVG with
 * gradients and a modest number of polygons — no thousands of DOM nodes. All
 * motion (clouds, river current, sparkle, shimmer) is gated by
 * prefers-reduced-motion in CSS; the static gorge walls, formations and river
 * body remain so a still frame still reads unmistakably as a canyon.
 */
export function CanyonGorge(): ReactElement {
  return (
    <div className="gorge" aria-hidden>
      {/* Sky strip — the rim opening overhead, with drifting pixel clouds. */}
      <div className="gorge-sky">
        <div className="gorge-clouds">
          <span className="gorge-cloud gc-1" />
          <span className="gorge-cloud gc-2" />
          <span className="gorge-cloud gc-3" />
        </div>
        {/* A distant butte range on the far horizon (palest parallax layer). */}
        <GorgeHorizon />
      </div>

      {/* The two towering walls. Right is the left, mirrored. */}
      <div className="gorge-wall gorge-wall-left">
        <CanyonWall side="left" />
      </div>
      <div className="gorge-wall gorge-wall-right">
        <CanyonWall side="right" />
      </div>

      {/* The dramatic river along the canyon floor. */}
      <GorgeRiver />
    </div>
  );
}

/** A hazy distant butte/mesa range seen through the gorge opening. */
function GorgeHorizon(): ReactElement {
  // One slim polygon band of stepped buttes over a wide viewBox.
  const buttes =
    '0,70 0,52 34,52 34,40 70,40 70,50 110,50 110,30 138,30 138,46 184,46 184,38 ' +
    '210,38 210,52 250,52 250,34 286,34 286,48 330,48 330,42 372,42 372,54 410,54 ' +
    '410,44 452,44 452,52 500,52 500,70';
  return (
    <svg
      className="gorge-horizon"
      viewBox="0 0 500 70"
      preserveAspectRatio="xMidYMax slice"
      shapeRendering="crispEdges"
      aria-hidden
    >
      <polygon className="gorge-horizon-far" points={buttes} />
    </svg>
  );
}

/**
 * One canyon wall — a tall vertical SVG of layered polychrome rock receding into
 * the gorge, carved with strata bands, ledges, a natural arch, hoodoos (totem
 * spires), a butte cap, balanced boulders and sparse juniper. The same drawing
 * serves both edges; the right wall is mirrored in CSS (scaleX(-1)).
 *
 * viewBox is 220 wide x 1000 tall; the OUTER edge (x=0) is the cliff face the
 * content sits against, the INNER edge (x=220) is where the wall meets sky/floor
 * — drawn with a jagged silhouette so the gorge opening looks carved, not boxed.
 */
function CanyonWall({ side }: { side: 'left' | 'right' }): ReactElement {
  const g = (n: string) => `${side}-${n}`; // unique gradient ids per side
  return (
    <svg
      className="canyon-wall-svg"
      viewBox="0 0 220 1000"
      preserveAspectRatio="xMidYMid slice"
      shapeRendering="geometricPrecision"
      aria-hidden
    >
      <defs>
        {/* Polychrome rim->bedrock vertical strata gradient. */}
        <linearGradient id={g('rock')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e9d8b4" />
          <stop offset="12%" stopColor="#e6c281" />
          <stop offset="26%" stopColor="#e0a96d" />
          <stop offset="42%" stopColor="#cf6b3f" />
          <stop offset="58%" stopColor="#b9502f" />
          <stop offset="72%" stopColor="#a8432c" />
          <stop offset="86%" stopColor="#7c3a2e" />
          <stop offset="100%" stopColor="#5e3330" />
        </linearGradient>
        {/* Shading from the lit outer face into the shadowed inner gorge. */}
        <linearGradient id={g('shade')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(0,0,0,0)" />
          <stop offset="62%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(8,10,14,0.62)" />
        </linearGradient>
        {/* A subtler dark for inset shadow pockets. */}
        <linearGradient id={g('pocket')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(0,0,0,0.42)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.05)" />
        </linearGradient>
      </defs>

      {/* Wall body: outer edge straight (x=0), inner edge a jagged carved profile. */}
      <polygon
        className="wall-body"
        fill={`url(#${g('rock')})`}
        points={
          '0,0 0,1000 196,1000 188,940 200,892 176,840 196,792 170,742 192,690 ' +
          '168,632 196,576 172,520 200,470 174,414 198,360 170,300 200,244 ' +
          '176,188 202,128 178,66 200,0'
        }
      />

      {/* Horizontal strata bands — thin darker rules that read as rock layers. */}
      <g className="wall-strata">
        {STRATA_Y.map((y, i) => (
          <rect key={i} x="0" y={y} width="206" height="3" />
        ))}
      </g>

      {/* Ledges: chunky stepped shelves jutting from the wall, lit on top. */}
      <g className="wall-ledges">
        <polygon points="0,470 96,470 110,486 0,486" />
        <polygon points="0,690 74,690 86,704 0,704" />
        <polygon points="0,250 60,250 70,264 0,264" />
        <polygon points="0,872 120,872 132,890 0,890" />
      </g>
      {/* Lit highlight along the ledge tops. */}
      <g className="wall-ledge-lip">
        <rect x="0" y="468" width="96" height="2" />
        <rect x="0" y="688" width="74" height="2" />
        <rect x="0" y="248" width="60" height="2" />
        <rect x="0" y="870" width="120" height="2" />
      </g>

      {/* A natural ARCH high on the wall — two piers and a spanning lintel with a
          dark void beneath. An iconic Grand Canyon formation. */}
      <g className="wall-arch">
        {/* solid mass the arch is cut from */}
        <path
          className="arch-mass"
          d="M120,150 L186,150 L186,250 L120,250 Z"
        />
        {/* the void under the span (transparent cut shown as shadow) */}
        <path
          className="arch-void"
          d="M132,250 L132,196 Q153,166 174,196 L174,250 Z"
        />
        {/* lit rim along the top of the span */}
        <path className="arch-rim" d="M120,150 L186,150 L186,158 L120,158 Z" />
      </g>

      {/* Hoodoos — mushroom/totem spires standing off a ledge. A few slim columns
          with bulbous caps, the signature Bryce/Canyon formation. */}
      <g className="wall-hoodoos">
        {/* tall hoodoo */}
        <rect className="hoodoo-stem" x="150" y="486" width="9" height="120" />
        <rect className="hoodoo-cap" x="146" y="478" width="17" height="12" />
        <rect className="hoodoo-cap2" x="148" y="528" width="13" height="8" />
        {/* shorter hoodoo */}
        <rect className="hoodoo-stem" x="172" y="520" width="7" height="86" />
        <rect className="hoodoo-cap" x="168" y="514" width="15" height="10" />
        {/* stubby hoodoo */}
        <rect className="hoodoo-stem" x="134" y="552" width="6" height="54" />
        <rect className="hoodoo-cap" x="131" y="546" width="12" height="9" />
      </g>

      {/* A butte cap near the rim — a flat-topped block standing proud. */}
      <g className="wall-butte">
        <polygon className="butte-body" points="150,40 196,40 196,150 142,150 142,72" />
        <rect className="butte-cap" x="142" y="40" width="54" height="6" />
      </g>

      {/* Balanced boulders perched on the lower ledge. */}
      <g className="wall-boulders">
        <ellipse className="boulder" cx="58" cy="700" rx="13" ry="11" />
        <ellipse className="boulder-sm" cx="92" cy="880" rx="9" ry="8" />
      </g>

      {/* Sparse juniper / sage clinging to ledges (used sparingly). */}
      <g className="wall-juniper">
        <circle cx="104" cy="478" r="6" />
        <circle cx="112" cy="482" r="4" />
        <circle cx="80" cy="698" r="5" />
        <circle cx="128" cy="884" r="6" />
      </g>

      {/* Inner-gorge shadow wash + shadow pocket so the wall reads 3D / receding. */}
      <rect x="0" y="0" width="220" height="1000" fill={`url(#${g('shade')})`} />
    </svg>
  );
}

/** Y positions for the thin horizontal strata rules down the wall. */
const STRATA_Y = [60, 128, 188, 244, 300, 360, 414, 470, 520, 576, 632, 690, 742, 792, 840, 892, 940];

/**
 * The dramatic river along the canyon floor — the showpiece. A wide teal
 * waterway with: a banded base current, a flowing ripple/sparkle sheen, foam
 * lines, a sky-reflection sheen near the surface, and a small rapid/standing
 * wave. All motion is CSS and reduced-motion-gated; the water body itself stays.
 */
function GorgeRiver(): ReactElement {
  return (
    <div className="gorge-river">
      {/* far bank shadow where water meets the wall feet */}
      <div className="river-bank" />
      {/* sky reflection sheen near the surface */}
      <div className="river-reflect" />
      {/* the flowing current (animated band texture) */}
      <div className="river-current" />
      {/* travelling sparkle highlight */}
      <div className="river-sheen" />
      {/* foam lines riding the surface */}
      <div className="river-foam river-foam-1" />
      <div className="river-foam river-foam-2" />
      {/* a small rapid / standing wave with a fleck of whitewater */}
      <div className="river-rapid">
        <span className="rapid-spray" />
      </div>
    </div>
  );
}
