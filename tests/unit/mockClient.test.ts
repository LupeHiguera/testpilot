import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MockModelClient } from '../../src/generator/mockClient.js';
import { Diagnosis, RunResult } from '../../src/core/types.js';

describe('MockModelClient', () => {
  it('proposes a role-based submit repair for safe copy drift', async () => {
    const client = new MockModelClient();
    const proposal = await client.proposeRepair({
      testPath: path.join(process.cwd(), 'tests', 'generated', 'login.spec.ts'),
      testContent: "await page.getByRole('button', { name: 'Sign in' }).click();",
      diagnosis: {
        category: 'UI_COPY_CHANGE',
        confidence: 0.9,
        reason: 'copy changed',
        repairable: true
      } satisfies Diagnosis,
      runResult: {
        passed: false,
        testPath: 'login.spec.ts',
        runDir: 'runs/unit',
        stdout: '',
        stderr: ''
      } satisfies RunResult
    });

    expect(proposal.safeToApply).toBe(true);
    expect(proposal.proposedContent).toContain("getByRole('button'");
  });
});
