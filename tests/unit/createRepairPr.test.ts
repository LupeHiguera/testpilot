import { describe, expect, it } from 'vitest';
import { Diagnosis, RepairProposal, TestIntent } from '../../src/core/types.js';
import { buildRepairPrContent, parseGithubOwnerRepo } from '../../src/pr/createRepairPr.js';

const intent: TestIntent = {
  name: 'login flow',
  route: '/login',
  credentials: { email: 'demo@example.com', password: 'password123' },
  expectedPath: '/dashboard',
  expectedText: 'Welcome, Demo User',
  submitText: 'Sign in',
  originalSpec: 'log in and see the dashboard'
};

const diagnosis: Diagnosis = {
  category: 'UI_COPY_CHANGE',
  confidence: 0.9,
  reason: 'The submit button copy changed but the behavior is equivalent.',
  repairable: true
};

const proposal: RepairProposal = {
  category: 'UI_COPY_CHANGE',
  reason: 'Replace the brittle copy selector with a role locator.',
  originalPath: '/repo/tests/generated/login.spec.ts',
  proposedContent: "expect(page).toHaveURL(/dashboard/)",
  diff: '--- a\n+++ b\n-old\n+new',
  safeToApply: true
};

describe('buildRepairPrContent', () => {
  it('builds a deterministic branch name from the diagnosis and stamp', () => {
    const content = buildRepairPrContent({
      testPath: '/repo/tests/generated/login.spec.ts',
      proposal,
      diagnosis,
      intent,
      stamp: '2026-06-03T00-00-00-000Z'
    });

    expect(content.branch).toBe('testpilot/repair-ui-copy-change-2026-06-03T00-00-00-000Z');
    expect(content.title).toContain('login.spec.ts');
    expect(content.title).toContain('UI_COPY_CHANGE');
  });

  it('embeds the diff, diagnosis, and guardrail note in the body', () => {
    const content = buildRepairPrContent({ testPath: '/repo/login.spec.ts', proposal, diagnosis, intent });

    expect(content.body).toContain('```diff');
    expect(content.body).toContain(proposal.diff.trim());
    expect(content.body).toContain(diagnosis.reason);
    expect(content.body).toContain('Human review is still required');
    expect(content.body).toContain('Welcome, Demo User');
  });

  it('includes before/after image references only when refs are provided', () => {
    const without = buildRepairPrContent({ testPath: '/repo/login.spec.ts', proposal, diagnosis, intent });
    expect(without.body).not.toContain('![before]');
    expect(without.body).not.toContain('## Before / after');

    const relative = buildRepairPrContent({
      testPath: '/repo/login.spec.ts',
      proposal,
      diagnosis,
      intent,
      beforeImageRef: './before.png',
      afterImageRef: './after.png'
    });
    expect(relative.body).toContain('![before](./before.png)');
    expect(relative.body).toContain('![after](./after.png)');
  });

  it('embeds absolute raw URLs when given as image refs', () => {
    const raw = 'https://raw.githubusercontent.com/LupeHiguera/testpilot/abc123/.testpilot/pr/s/before.png';
    const content = buildRepairPrContent({
      testPath: '/repo/login.spec.ts',
      proposal,
      diagnosis,
      intent,
      beforeImageRef: raw
    });
    expect(content.body).toContain(`![before](${raw})`);
    expect(content.body).not.toContain('![after]');
  });

  it('defaults the base branch to main', () => {
    const content = buildRepairPrContent({ testPath: '/repo/login.spec.ts', proposal, diagnosis, intent });
    expect(content.body).toContain('base branch `main`');
  });
});

describe('parseGithubOwnerRepo', () => {
  it('parses an https remote with a .git suffix', () => {
    expect(parseGithubOwnerRepo('https://github.com/LupeHiguera/testpilot.git')).toEqual({
      owner: 'LupeHiguera',
      repo: 'testpilot'
    });
  });

  it('parses an ssh remote', () => {
    expect(parseGithubOwnerRepo('git@github.com:LupeHiguera/testpilot.git')).toEqual({
      owner: 'LupeHiguera',
      repo: 'testpilot'
    });
  });

  it('returns undefined for a non-github remote', () => {
    expect(parseGithubOwnerRepo('https://gitlab.com/foo/bar.git')).toBeUndefined();
  });
});
