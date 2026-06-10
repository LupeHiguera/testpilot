/**
 * A single in-process lock serializing pipeline runs. Two concurrent runs would
 * race for port 3000 (each spawns its own demo Vite server) and interleave their
 * events on the shared bus, so the API refuses a new run while one is in flight
 * rather than letting them corrupt each other.
 */
let runInFlight = false;

/** Take the lock. Returns false (and takes nothing) when a run is already in flight. */
export function tryAcquireRunLock(): boolean {
  if (runInFlight) {
    return false;
  }
  runInFlight = true;
  return true;
}

export function releaseRunLock(): void {
  runInFlight = false;
}
