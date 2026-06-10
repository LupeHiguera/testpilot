import { afterEach, describe, expect, it } from 'vitest';
import { releaseRunLock, tryAcquireRunLock } from '../../src/server/runLock.js';

// The lock behind the 409 on POST /api/run and /api/stories: two concurrent
// pipeline runs would race for the demo app's port and interleave their events.
describe('runLock', () => {
  afterEach(() => releaseRunLock());

  it('refuses a second acquire while a run is in flight', () => {
    expect(tryAcquireRunLock()).toBe(true);
    expect(tryAcquireRunLock()).toBe(false);
  });

  it('can be re-acquired after release', () => {
    expect(tryAcquireRunLock()).toBe(true);
    releaseRunLock();
    expect(tryAcquireRunLock()).toBe(true);
  });
});
