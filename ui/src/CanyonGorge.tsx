import type { ReactElement } from 'react';

/**
 * CanyonGorge — the full-viewport, FIXED backdrop that puts the whole app INSIDE
 * a dramatic Grand Canyon gorge. It is pure SVG/CSS, lives behind all content
 * (z-index below the app), and is purely decorative (aria-hidden), so legibility
 * never depends on it.
 *
 * Composition, back-to-front:
 *   - a sky strip across the top (the canyon RIM opening) with drifting clouds,
 *   - a RECEDING far wall on each side (palest, hazy — parallax depth),
 *   - a FOREGROUND towering canyon WALL on each edge whose TOP silhouettes
 *     boldly against the sky: tapered HOODOO SPIRES, a natural ARCH you can see
 *     sky through, a BALANCED ROCK, and varied BUTTES / MESAS of different
 *     heights — an eroded, unmistakable canyon skyline, not a flat column,
 *   - a dramatic flowing RIVER at the canyon FLOOR (banks/shoreline, animated
 *     current, ripple sparkle, foam, a WATERFALL + RAPIDS, sky reflection) — the
 *     showpiece the walls descend to.
 *
 * Each wall is drawn once (left + a mirrored right) as efficient shaped SVG
 * paths + gradients — no thousands of DOM nodes. All motion (clouds, current,
 * sparkle, foam, waterfall) is gated by prefers-reduced-motion in CSS; the
 * static walls, formations and river body remain so a still frame still reads
 * unmistakably as a canyon.
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

      {/* The two towering walls. Right is the left, mirrored. Each holds a hazy
          RECEDING wall behind a darker FOREGROUND wall for canyon depth. */}
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
 * One canyon wall — a tall vertical SVG of layered polychrome rock whose TOP is a
 * dramatic eroded SKYLINE silhouetting against the sky, and whose body descends
 * to the canyon floor. The OUTER edge (x=0) is the cliff face the content sits
 * against; the INNER edge (x≈340) is the gorge opening.
 *
 * viewBox is 360 wide x 1000 tall, drawn full-bleed (meet → the skyline sits at
 * the top of the viewport, the body fills down). The same drawing serves both
 * edges; the right wall is mirrored in CSS (scaleX(-1)).
 *
 * Named formations along the skyline (outer→inner):
 *   - THE GUARDIAN MESA: a tall flat-topped caprock block at the outer edge,
 *   - THE SENTINEL SPIRES: a cluster of tapered hoodoo spires of varied height,
 *   - SKYBRIDGE ARCH: a natural arch with a real sky-through opening,
 *   - BALANCED ROCK: a boulder perched on a slender neck,
 *   - THE STEP BUTTES: a descending run of mesas stepping into the gorge.
 */
function CanyonWall({ side }: { side: 'left' | 'right' }): ReactElement {
  const g = (n: string) => `${side}-${n}`; // unique gradient/filter ids per side
  return (
    <svg
      className="canyon-wall-svg"
      viewBox="0 0 360 1000"
      preserveAspectRatio="xMinYMin slice"
      shapeRendering="geometricPrecision"
      aria-hidden
    >
      <defs>
        {/* Polychrome rim->bedrock vertical strata gradient (foreground wall). */}
        <linearGradient id={g('rock')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#eadbb8" />
          <stop offset="10%" stopColor="#e6c281" />
          <stop offset="22%" stopColor="#e0a96d" />
          <stop offset="38%" stopColor="#cf6b3f" />
          <stop offset="54%" stopColor="#b9502f" />
          <stop offset="68%" stopColor="#a8432c" />
          <stop offset="82%" stopColor="#7c3a2e" />
          <stop offset="100%" stopColor="#562f2c" />
        </linearGradient>
        {/* The RECEDING far wall — same sequence, hazed toward the sky blue so it
            reads as atmospheric distance behind the foreground wall. */}
        <linearGradient id={g('rock-far')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d8b48a" />
          <stop offset="24%" stopColor="#cf9a6c" />
          <stop offset="52%" stopColor="#b97554" />
          <stop offset="78%" stopColor="#8f5a48" />
          <stop offset="100%" stopColor="#6b4942" />
        </linearGradient>
        {/* Shading from the lit outer face into the shadowed inner gorge. */}
        <linearGradient id={g('shade')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(0,0,0,0)" />
          <stop offset="58%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(8,10,14,0.66)" />
        </linearGradient>
        {/* Haze over the far wall (distance wash toward sky). */}
        <linearGradient id={g('haze')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(188,217,230,0.5)" />
          <stop offset="40%" stopColor="rgba(188,217,230,0.18)" />
          <stop offset="100%" stopColor="rgba(188,217,230,0)" />
        </linearGradient>
        <linearGradient id={g('pocket')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(0,0,0,0.42)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.05)" />
        </linearGradient>
      </defs>

      {/* ---- RECEDING far wall: a paler, simpler eroded ridge set BEHIND and a
          little inward of the foreground wall, so the gorge reads with depth
          (foreground darker, distance hazier). Its own jagged skyline pokes up
          between the foreground formations. */}
      <path
        className="wall-far-body"
        fill={`url(#${g('rock-far')})`}
        d={
          'M0,150 L26,150 L40,108 L70,150 L96,96 L120,150 L150,120 L182,168 ' +
          'L214,132 L250,182 L286,150 L322,196 L360,168 L360,1000 L0,1000 Z'
        }
      />
      <path
        className="wall-far-haze"
        fill={`url(#${g('haze')})`}
        d={
          'M0,150 L26,150 L40,108 L70,150 L96,96 L120,150 L150,120 L182,168 ' +
          'L214,132 L250,182 L286,150 L322,196 L360,168 L360,1000 L0,1000 Z'
        }
      />

      {/* ---- FOREGROUND wall body: the OUTER edge is straight (x=0); the TOP is
          a dramatic carved SKYLINE; the INNER edge descends in eroded steps to
          the floor. Everything above the skyline path is open sky. */}
      <path
        className="wall-body"
        fill={`url(#${g('rock')})`}
        d={WALL_PATH}
      />

      {/* Horizontal strata bands — thin darker rules that read as rock layers,
          clipped to the wall body so they never spill into the sky. */}
      <clipPath id={g('clip')}>
        <path d={WALL_PATH} />
      </clipPath>
      <g className="wall-strata" clipPath={`url(#${g('clip')})`}>
        {STRATA_Y.map((y, i) => (
          <rect key={i} x="0" y={y} width="360" height="4" />
        ))}
      </g>

      {/* Group everything that decorates the FOREGROUND wall, clipped to it. */}
      <g clipPath={`url(#${g('clip')})`}>
        {/* Ledges: chunky stepped shelves jutting from the wall, lit on top. */}
        <g className="wall-ledges">
          <polygon points="0,560 150,560 172,580 0,580" />
          <polygon points="0,760 120,760 138,778 0,778" />
          <polygon points="0,360 96,360 110,376 0,376" />
          <polygon points="0,872 188,872 206,892 0,892" />
        </g>
        <g className="wall-ledge-lip">
          <rect x="0" y="557" width="150" height="3" />
          <rect x="0" y="757" width="120" height="3" />
          <rect x="0" y="357" width="96" height="3" />
          <rect x="0" y="869" width="188" height="3" />
        </g>

        {/* Vertical erosion runnels carved down the face — long shadow grooves. */}
        <g className="wall-runnels">
          <rect x="70" y="220" width="4" height="640" />
          <rect x="128" y="300" width="3" height="560" />
          <rect x="210" y="260" width="4" height="600" />
          <rect x="276" y="340" width="3" height="520" />
        </g>

        {/* Balanced boulders perched on the lower ledges. */}
        <g className="wall-boulders">
          <ellipse className="boulder" cx="64" cy="772" rx="16" ry="13" />
          <ellipse className="boulder-sm" cx="150" cy="884" rx="11" ry="9" />
        </g>

        {/* Sparse juniper / sage clinging to ledges (used sparingly). */}
        <g className="wall-juniper">
          <circle cx="120" cy="560" r="7" />
          <circle cx="130" cy="565" r="5" />
          <circle cx="96" cy="760" r="6" />
          <circle cx="170" cy="872" r="7" />
        </g>

        {/* Inner-gorge shadow wash so the wall reads 3D / receding. */}
        <rect x="0" y="0" width="360" height="1000" fill={`url(#${g('shade')})`} />
      </g>

      {/* ---- SKYLINE FORMATIONS — drawn AFTER the body, NOT clipped, so their
          silhouettes rise crisply against the open sky above the wall. ---- */}

      {/* ALL FOUR signature formations are clustered in the OUTER 0–210 band of
          the viewBox so that — at desktop, where only the outer ~210 units of the
          wall show in the open side margin — the mesa, hoodoo spires, sky-through
          arch and balanced rock ALL silhouette against the sky. The plain inner
          step-buttes live past x=210, where they recede behind the content. */}

      {/* THE GUARDIAN MESA — a tall flat-topped caprock block at the outer edge,
          with a lit cap rim and a darker base. The tallest skyline element. */}
      <g className="wall-mesa">
        <polygon className="mesa-body" points="14,58 72,58 72,300 0,300 0,96" />
        <rect className="mesa-cap" x="8" y="50" width="68" height="11" />
        <rect className="mesa-shadow" x="58" y="58" width="14" height="242" />
      </g>

      {/* THE SENTINEL SPIRES — a cluster of stout tapered HOODOO spires of varied
          height standing ON the saddle ledge, the signature canyon silhouette.
          Each is a chunky tapered column under a bulbous mushroom cap; they sit
          on the ledge (bottoms ~y=300) rather than running the whole face. */}
      <g className="wall-spires">
        {/* tall central hoodoo — bulbous cap on a tapered stem, a waist band */}
        <polygon className="spire" points="98,120 120,120 115,304 103,304" />
        <ellipse className="spire-cap" cx="109" cy="116" rx="19" ry="11" />
        <ellipse className="spire-cap2" cx="109" cy="200" rx="14" ry="7" />
        {/* shorter hoodoo (outer) */}
        <polygon className="spire" points="80,178 96,178 93,304 83,304" />
        <ellipse className="spire-cap" cx="88" cy="174" rx="13" ry="8" />
        {/* stubby hoodoo (inner) */}
        <polygon className="spire" points="126,206 140,206 138,304 128,304" />
        <ellipse className="spire-cap" cx="133" cy="202" rx="11" ry="7" />
      </g>

      {/* BALANCED ROCK — a wide boulder perched on a slender eroded neck, standing
          clear on the saddle between the spires and the arch. */}
      <g className="wall-balanced">
        <rect className="balanced-neck" x="150" y="150" width="13" height="62" />
        <ellipse className="balanced-cap" cx="156" cy="138" rx="27" ry="18" />
        <ellipse className="balanced-shadow" cx="163" cy="142" rx="19" ry="11" />
      </g>

      {/* SKYBRIDGE ARCH — a natural arch with a REAL sky-through opening (the void
          is the page sky showing through, not paint). Two thick piers carry a
          spanning lintel; the wide gap beneath shows sky. Sits at the inner end of
          the visible band so it still clears the content panel. */}
      <g className="wall-arch">
        <path
          className="arch-mass"
          d="M168,116 L214,116 L214,300 L200,300 L200,206
             Q191,180 182,206 L182,300 L168,300 Z"
        />
        {/* lit rim catching light along the top of the span */}
        <rect className="arch-rim" x="168" y="116" width="46" height="11" />
        {/* soft inner shadow lining the underside of the span opening */}
        <path
          className="arch-inner"
          d="M172,206 Q191,174 210,206 L210,218 Q191,186 172,218 Z"
        />
      </g>

      {/* THE STEP BUTTES — a descending run of mesas stepping inward toward the
          gorge floor (in the inner band, behind the content), giving depth. */}
      <g className="wall-stepbuttes">
        <polygon className="butte-body" points="244,250 312,250 312,420 234,420 234,290" />
        <rect className="butte-cap" x="234" y="246" width="78" height="6" />
        <polygon className="butte-body" points="300,330 360,330 360,470 292,470 292,360" />
        <rect className="butte-cap" x="292" y="326" width="68" height="5" />
      </g>
    </svg>
  );
}

/**
 * The carved FOREGROUND wall silhouette. The top edge is a dramatic eroded
 * skyline (outer mesa shoulder → notch → spire saddle → arch shoulder → step
 * down toward the inner gorge); the inner edge (x≈360) descends to the floor in
 * eroded steps. Drawn clockwise from the top-outer corner. Reused for the body
 * fill, the strata clip and the decoration clip so they always agree.
 */
const WALL_PATH =
  'M0,96 ' +
  // GUARDIAN MESA outer shoulder (its flat cap is the highest skyline point)
  'L14,96 L72,58 L72,300 ' +
  // deep SADDLE across the spire + balanced-rock + arch field so they rise free
  'L98,300 L150,300 L168,300 ' +
  // ARCH springs up out of the body (its piers + sky-through gap stand above)
  'L214,300 ' +
  // recede to the inner STEP BUTTES (behind the content), then drop to the floor
  'L244,250 L312,250 ' +
  'L360,300 ' +
  'L360,1000 L0,1000 Z';

/** Y positions for the thin horizontal strata rules down the wall. */
const STRATA_Y = [
  168, 220, 272, 330, 388, 448, 508, 568, 628, 688, 748, 800, 852, 904, 952,
];

/**
 * The dramatic river along the canyon FLOOR — the showpiece. A wide teal
 * waterway sitting clearly at the bottom of the gorge with: shoreline banks, a
 * deep channel, a banded flowing current, a travelling ripple/sparkle sheen,
 * foam lines, a sky reflection near the surface, a WATERFALL spilling in from
 * one wall and a set of RAPIDS. All motion is CSS and reduced-motion-gated; the
 * water body, banks and waterfall column themselves stay rendered.
 */
function GorgeRiver(): ReactElement {
  return (
    <div className="gorge-river">
      {/* sloped shoreline banks where the canyon walls meet the water */}
      <div className="river-bank river-bank-left" />
      <div className="river-bank river-bank-right" />
      {/* a WATERFALL spilling down the left wall into the river */}
      <div className="river-fall">
        <span className="fall-mist" />
        <span className="fall-pool" />
      </div>
      {/* sky reflection sheen near the surface */}
      <div className="river-reflect" />
      {/* the flowing current (animated band texture) */}
      <div className="river-current" />
      {/* deeper channel sheen scrolling at a different rate (depth) */}
      <div className="river-current river-current-deep" />
      {/* travelling sparkle highlight */}
      <div className="river-sheen" />
      {/* foam lines riding the surface */}
      <div className="river-foam river-foam-1" />
      <div className="river-foam river-foam-2" />
      <div className="river-foam river-foam-3" />
      {/* a set of RAPIDS / standing waves with flecks of whitewater */}
      <div className="river-rapid river-rapid-1">
        <span className="rapid-spray" />
      </div>
      <div className="river-rapid river-rapid-2">
        <span className="rapid-spray" />
      </div>
    </div>
  );
}
