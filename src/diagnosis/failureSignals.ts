import { ObservationArtifacts, TestIntent } from '../core/types.js';

/**
 * App-agnostic signals derived from a failed run. `classifyFailure` decides a
 * category from THESE rather than from login-demo-specific string matching, so the
 * diagnosis generalises to any Playwright flow. Two sources, both app-neutral:
 *
 *  - the Playwright error, parsed STRUCTURALLY: which assertion/locator class
 *    failed, and which control texts the test located by (the `name:` of a
 *    getByRole, the arg of getByText/getByLabel/getByPlaceholder, a `text=`
 *    selector) — i.e. *what the test was reaching for*; and
 *  - the re-observed page artifacts: the interactive controls actually present,
 *    plus network / console / connection errors.
 *
 * The intent supplies what the flow was *supposed* to reach (its expected outcome
 * text). The crucial safety distinction lives in `failedMatcher`: a CONTROL-LOOKUP
 * timeout can be safe drift, but a failed URL/outcome ASSERTION is the product not
 * reaching its end state — never a relabel — so a real regression can't be
 * mistaken for repairable drift.
 */
export interface FailureSignals {
  /** The assertion/locator class that failed, as far as the error reveals.
   *  Assertions ('url' | 'visibility' | 'text') win over a 'locator' wait. */
  failedMatcher: 'url' | 'visibility' | 'text' | 'locator' | 'none';
  /** A route/outcome assertion failed (the URL, or a visibility/text assertion of
   *  the intent's expected outcome) → the flow did not reach its end state. */
  outcomeAssertionFailed: boolean;
  /** Control texts the test located by, parsed from the error's locator refs. */
  lookedForTexts: string[];
  /** A control the test DROVE (a locator-lookup failure) is gone from the page,
   *  but an equivalent interactive control is present → relabelled (safe drift). */
  relabelledControl: boolean;
  /** A control lookup failed on an otherwise healthy page that is NOT a relabel
   *  (the text is still present, or the locator was non-textual) → selector drift. */
  selectorDrift: boolean;
  /** The re-observed page renders interactive controls. */
  pageHealthy: boolean;
  hasNetworkErrors: boolean;
  /** A console error that looks network/API-flavoured (fetch/xhr/5xx/etc.). */
  networkConsoleError: boolean;
  connectionError: boolean;
  authFailure: boolean;
  timeoutOnly: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Parse the control texts the test located by, from the error's locator refs. */
export function collectLookedForTexts(output: string): string[] {
  const texts = new Set<string>();
  const add = (value?: string) => {
    const trimmed = value?.trim();
    if (trimmed) texts.add(trimmed);
  };
  // getByRole('button', { name: 'X' })  /  { name: "X" }
  for (const m of output.matchAll(/name:\s*['"`]([^'"`]+)['"`]/g)) add(m[1]);
  // { name: /^X$/i } — regex locator name
  for (const m of output.matchAll(/name:\s*\/\^?([^/$]+)\$?\/[a-z]*/g)) add(m[1]);
  // getByText('X') / getByLabel('X') / getByPlaceholder('X') / getByAltText / getByTitle
  for (const m of output.matchAll(/getBy(?:Text|Label|Placeholder|AltText|Title)\(\s*['"`]([^'"`]+)['"`]/g)) add(m[1]);
  // getByText(/X/) — regex form
  for (const m of output.matchAll(/getBy(?:Text|Label|Placeholder|AltText|Title)\(\s*\/\^?([^/$]+)\$?\//g)) add(m[1]);
  // text=X selector engine
  for (const m of output.matchAll(/text=["']?([^"'`)\]\n]+)/g)) add(m[1]);
  return [...texts];
}

/**
 * Strip Playwright's echoed test SOURCE from the error output. Playwright prints
 * the failing line with a `<n> |` gutter (optionally a `>` pointer) and a `| ^`
 * caret line — which means the source of a LATER assertion (e.g. `toHaveURL`)
 * appears even when the failure was an EARLIER `locator.click`. Removing the echo
 * lets the matcher read the actual failure, not the surrounding code.
 */
function stripSourceSnippet(output: string): string {
  return output
    .split('\n')
    .filter((line) => !/^\s*>?\s*\d+\s*\|/.test(line) && !/^\s*\|\s*\^?\s*$/.test(line))
    .join('\n');
}

/**
 * Decide which assertion/locator class actually failed, from the cleaned output.
 * A real ASSERTION failure carries `expect(...) ... failed` or a `Expect "<m>"`
 * call-log line; a control-lookup failure carries `locator.<action>:` / "waiting
 * for <locator>". Assertions win, so a failed outcome assertion is never mistaken
 * for a repairable control lookup (and vice-versa).
 */
function detectMatcher(clean: string): FailureSignals['failedMatcher'] {
  const assertionFailed = /\bexpect\([^\n]*?\)\s*\.\s*\w+[^\n]*?\bfailed\b/i.test(clean) || /Expect "\w+"/.test(clean);
  const actionFailed = /\blocator\.\w+:/i.test(clean) || /waiting for (?:locator|getBy)/i.test(clean);

  if (assertionFailed) {
    if (/toHaveURL|waitForURL/.test(clean)) return 'url';
    if (/toBeVisible|toBeHidden|toBeAttached|toBeChecked|toBeEnabled|toBeInViewport/.test(clean)) return 'visibility';
    if (/toContainText|toHaveText|toHaveValue|toHaveAttribute|toHaveTitle/.test(clean)) return 'text';
    return 'none'; // an assertion we do not model → stay conservative (refuse)
  }
  if (actionFailed || /strict mode violation/i.test(clean)) return 'locator';
  if (/Timeout.*exceeded/i.test(clean)) return 'locator';
  return 'none';
}

/** The interactive control texts the re-observed page currently exposes. */
function presentControlTexts(artifacts: ObservationArtifacts | undefined): string[] {
  return [
    ...(artifacts?.buttons ?? []),
    ...(artifacts?.links ?? []),
    ...(artifacts?.inputs ?? []).flatMap((input) => [input.label, input.placeholder, input.name])
  ]
    .map((text) => text.toLowerCase().trim())
    .filter(Boolean);
}

function controlIsPresent(lookedFor: string, present: string[]): boolean {
  const needle = lookedFor.toLowerCase().trim();
  return present.some((text) => text === needle || text.includes(needle) || needle.includes(text));
}

export function deriveFailureSignals(
  output: string,
  dom: string,
  artifacts: ObservationArtifacts | undefined,
  intent: TestIntent
): FailureSignals {
  // Read both the matcher and the looked-for controls from the source-stripped
  // output so Playwright's echoed code can't masquerade as the real failure.
  const clean = stripSourceSnippet(output);
  const failedMatcher = detectMatcher(clean);
  const lookedForTexts = collectLookedForTexts(clean);

  const interactiveCount =
    (artifacts?.buttons.length ?? 0) + (artifacts?.links?.length ?? 0) + (artifacts?.inputs.length ?? 0);
  const pageHealthy = interactiveCount > 0 || /<(?:button|input|select|form|a\s)/i.test(dom);

  const assertedExpectedText =
    Boolean(intent.expectedText) && new RegExp(escapeRegExp(intent.expectedText), 'i').test(clean);
  const outcomeAssertionFailed =
    failedMatcher === 'url' || ((failedMatcher === 'visibility' || failedMatcher === 'text') && assertedExpectedText);

  // Relabel vs. selector drift are only considered when a CONTROL LOOKUP failed
  // (not when an assertion failed) — that gate is what keeps a missing outcome
  // from ever being read as a repairable relabel.
  const controlLookupFailed = failedMatcher === 'locator';
  const present = presentControlTexts(artifacts);
  const missingControls = lookedForTexts.filter((text) => !controlIsPresent(text, present));
  const relabelledControl = controlLookupFailed && missingControls.length > 0 && interactiveCount > 0;
  const selectorDrift = controlLookupFailed && !relabelledControl && pageHealthy;

  const consoleText = (artifacts?.consoleLogs ?? []).join(' ');
  const connectionError = /ERR_CONNECTION|ECONNREFUSED|ERR_NAME_NOT_RESOLVED|net::ERR/i.test(clean);
  const hasNetworkErrors = (artifacts?.networkErrors.length ?? 0) > 0;
  const networkConsoleError =
    /error/i.test(consoleText) &&
    /(fetch|networkerror|xhr|failed to load|status (?:of )?[45]\d\d|net::err)/i.test(consoleText);
  const authFailure =
    /\b(?:401|403)\b|unauthor|invalid (?:credential|login|password|username)|incorrect (?:password|username|credential)|authentication failed|login failed|sign[- ]?in failed/i.test(
      `${clean} ${consoleText}`
    );
  const timeoutOnly = /Timeout|timed out|exceeded/i.test(clean) && failedMatcher !== 'url';

  return {
    failedMatcher,
    outcomeAssertionFailed,
    lookedForTexts,
    relabelledControl,
    selectorDrift,
    pageHealthy,
    hasNetworkErrors,
    networkConsoleError,
    connectionError,
    authFailure,
    timeoutOnly
  };
}
