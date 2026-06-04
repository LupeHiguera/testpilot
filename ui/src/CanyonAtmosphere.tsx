import { useMemo } from 'react';
import type { CSSProperties, ReactElement } from 'react';

/**
 * The living sky behind the canyon. This is the atmospheric backdrop that makes
 * the run feel ALIVE: as the run descends (progress 0 -> 1) the sky shifts from
 * bright day -> warm dusk -> deep sunset, a pixel sun arcs across and sets, and
 * blocky clouds drift. On a finished run the sky settles into a final tone keyed
 * to the verdict (sunset-gold for success, smoky-red for a caught regression).
 *
 * It is drawn behind the strata grid (z-index 0) with the data content layered
 * on top, so legibility never depends on it. ALL motion is decorative and is
 * disabled under prefers-reduced-motion via CSS; the time-of-day tint that the
 * run reaches is set inline so the "how deep are we" read survives without
 * motion too. A STATIC pixel-mesa + sun silhouette is baked into the horizon so
 * even a still frame / screenshot reads as a real canyon vista, not a bare
 * gradient — the drifting clouds/bird/parallax are motion layered ON TOP of it.
 *
 * `progress` is the descent fraction (reached/total, 0..1).
 * `phase` keys the verdict-tinted final sky once a run is done.
 */

export type SkyPhase = 'running' | 'idle' | 'pass' | 'repaired' | 'error';

interface Props {
  progress: number; // 0..1 descent
  phase: SkyPhase;
}

interface SkyStop {
  top: string;
  mid: string;
  low: string;
}

/**
 * Time-of-day + verdict sky stops. The COLOURS themselves live in theme.css as
 * custom properties (single source of truth); we resolve them once at module
 * load via getComputedStyle so the interpolation math can run in JS. A static
 * fallback mirrors the CSS values for SSR / non-DOM environments.
 */
const FALLBACK: Record<string, SkyStop> = {
  day: { top: '#bcd9e6', mid: '#7fb2cf', low: '#4f86a6' },
  dusk: { top: '#d9b88f', mid: '#b07a73', low: '#6a4f72' },
  sunset: { top: '#caa15f', mid: '#9c4f49', low: '#3c2f55' },
  pass: { top: '#e7c987', mid: '#c98a4f', low: '#5a4a6b' },
  repaired: { top: '#bfe0c9', mid: '#7bb8a4', low: '#3e5a63' },
  error: { top: '#caa15f', mid: '#8a3a2d', low: '#321f33' }
};

function readSkyStops(): Record<string, SkyStop> {
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') {
    return FALLBACK;
  }
  const cs = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: SkyStop): SkyStop => {
    const top = cs.getPropertyValue(`--sky-${name}-top`).trim();
    const mid = cs.getPropertyValue(`--sky-${name}-mid`).trim();
    const low = cs.getPropertyValue(`--sky-${name}-low`).trim();
    return top && mid && low ? { top, mid, low } : fallback;
  };
  return {
    day: read('day', FALLBACK.day),
    dusk: read('dusk', FALLBACK.dusk),
    sunset: read('sunset', FALLBACK.sunset),
    pass: read('pass', FALLBACK.pass),
    repaired: read('repaired', FALLBACK.repaired),
    error: read('error', FALLBACK.error)
  };
}

// Resolve once — the tokens are static for the app's lifetime.
const STOPS: Record<string, SkyStop> = readSkyStops();

function lerp(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}
function hex(c: string) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}
function mix(c1: string, c2: string, t: number) {
  const a = hex(c1);
  const b = hex(c2);
  return `rgb(${lerp(a[0], b[0], t)}, ${lerp(a[1], b[1], t)}, ${lerp(a[2], b[2], t)})`;
}

function skyAt(progress: number, phase: SkyPhase): SkyStop {
  const finals: Partial<Record<SkyPhase, SkyStop>> = {
    pass: STOPS.pass,
    repaired: STOPS.repaired,
    error: STOPS.error
  };
  const final = finals[phase];
  // When a run has resolved, hold the sky on its verdict tone; otherwise use the
  // day -> dusk -> sunset interpolation reached by the current descent.
  if (final) {
    return { top: final.top, mid: final.mid, low: final.low };
  }
  const p = Math.max(0, Math.min(1, progress));
  const from = p < 0.5 ? STOPS.day : STOPS.dusk;
  const to = p < 0.5 ? STOPS.dusk : STOPS.sunset;
  const seg = p < 0.5 ? p / 0.5 : (p - 0.5) / 0.5;
  return {
    top: mix(from.top, to.top, seg),
    mid: mix(from.mid, to.mid, seg),
    low: mix(from.low, to.low, seg)
  };
}

export function CanyonAtmosphere({ progress, phase }: Props): ReactElement {
  const sky = useMemo(() => skyAt(progress, phase), [progress, phase]);
  const settled = phase === 'pass' || phase === 'repaired' || phase === 'error';

  // The sun arcs left->right and DOWN as the run descends: x tracks progress,
  // y dips so it "sets" toward the horizon. On a resolved run it rests low and
  // large (a held sunset). Positions are % of the atmosphere box.
  const sunX = 12 + progress * 70;
  const sunY = 14 + progress * 46;

  return (
    <div
      className={`atmosphere ${settled ? 'is-settled' : ''} phase-${phase}`}
      aria-hidden
      style={
        {
          '--sky-a': sky.top,
          '--sky-b': sky.mid,
          '--sky-c': sky.low,
          '--sun-x': `${sunX}%`,
          '--sun-y': `${sunY}%`
        } as CSSProperties
      }
    >
      {/* STATIC baked silhouette: a pixel mesa range + a sun disc rendered with
          ZERO animation so a still frame already reads as a canyon vista. The
          drifting parallax/clouds/bird below are motion layered on top of this. */}
      <StaticVista settled={settled} />

      {/* Far parallax mesa silhouette band (drifts slowest). */}
      <div className="atmo-mesa atmo-mesa-far" />
      <div className="atmo-mesa atmo-mesa-near" />

      {/* Drifting pixel clouds — two layers at different speeds for depth. */}
      <div className="atmo-clouds atmo-clouds-1">
        <span className="cloud c-a" />
        <span className="cloud c-b" />
      </div>
      <div className="atmo-clouds atmo-clouds-2">
        <span className="cloud c-c" />
      </div>

      {/* The arcing / setting sun. Glow halo + crisp pixel disc. On a settled
          run a slow corona pulse keeps the finished sky breathing (see CSS). */}
      <div className="atmo-sun">
        <span className="sun-corona" />
        <span className="sun-glow" />
        <span className="sun-disc" />
      </div>

      {/* A bird gliding across, looping slowly (ambient life, sparing). */}
      <div className="atmo-bird" />

      {/* Heat-shimmer / drifting dust veil over the lower sky. */}
      <div className="atmo-dust" />
    </div>
  );
}

/**
 * Pure-SVG, fully STATIC canyon vista baked into the horizon sky band: a soft
 * static sun and a layered pixel mesa silhouette. No animation, no inline timing
 * — this is what carries the "it's a world" read at rest / in a screenshot.
 * Drawn at the very back of the atmosphere (z 0) so live motion sits on top.
 */
function StaticVista({ settled }: { settled: boolean }): ReactElement {
  // Two staggered mesa profiles described as polygon point strings over a
  // 320x140 viewBox, scaled to slice the full width. Heights chosen so the
  // ridgeline sits in the lower horizon band where the strata meet the sky.
  const far =
    '0,96 24,84 40,88 60,72 84,78 104,66 128,74 150,60 176,70 200,58 226,68 250,56 276,66 300,60 320,72 320,140 0,140';
  const near =
    '0,118 30,108 52,114 78,98 100,106 128,92 156,104 184,90 210,102 240,88 268,100 296,94 320,104 320,140 0,140';
  return (
    <svg
      className="atmo-static"
      viewBox="0 0 320 140"
      preserveAspectRatio="xMidYMax slice"
      shapeRendering="crispEdges"
      aria-hidden
    >
      {/* Static sun: a soft disc high-left of the ridgeline. Kept faint so the
          live arcing sun reads as the "real" one; this is the baked vista sun. */}
      <circle className={`vista-sun ${settled ? 'vista-sun-settled' : ''}`} cx="246" cy="40" r="13" />
      {/* Far ridge — paler, hazier (atmospheric depth). */}
      <polygon className="vista-mesa vista-mesa-far" points={far} />
      {/* Near ridge — darker, lower. */}
      <polygon className="vista-mesa vista-mesa-near" points={near} />
    </svg>
  );
}
