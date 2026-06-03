import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { projectRoot } from '../core/config.js';
import { Diagnosis, RepairProposal, TestIntent } from '../core/types.js';

export interface CreateRepairPrInput {
  testPath: string;
  proposal: RepairProposal;
  diagnosis: Diagnosis;
  intent: TestIntent;
  /** Directory to write the PR bundle into (typically the current run dir). */
  runDir: string;
  /** Screenshot of the failing/old state, if available. */
  beforeScreenshot?: string;
  /** Screenshot of the repaired/passing state, if available. */
  afterScreenshot?: string;
  /** Base branch the PR should target. Defaults to "main". */
  baseBranch?: string;
  /** When true, actually create a branch + GitHub PR via git/gh. Defaults to false (bundle only). */
  openPr?: boolean;
}

export interface RepairPrContent {
  branch: string;
  title: string;
  body: string;
}

export interface RepairPrResult {
  branch: string;
  title: string;
  bundleDir: string;
  bodyPath: string;
  opened: boolean;
  prUrl?: string;
  /** Set when openPr was requested but could not be completed. */
  skippedReason?: string;
}

const SAFE_BODY_NOTE =
  'This repair was produced by testpilot and limited to a validated safe-drift category. ' +
  'It preserves the original assertions and expected outcome. Human review is still required before merge.';

/**
 * Pure builder for the PR branch name, title, and markdown body. Kept separate
 * from any git/network side effects so it can be unit tested deterministically.
 */
export function buildRepairPrContent(input: {
  testPath: string;
  proposal: RepairProposal;
  diagnosis: Diagnosis;
  intent: TestIntent;
  baseBranch?: string;
  hasBeforeScreenshot?: boolean;
  hasAfterScreenshot?: boolean;
  stamp?: string;
}): RepairPrContent {
  const stamp = input.stamp ?? new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = path.basename(input.testPath);
  const categorySlug = input.diagnosis.category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const branch = `testpilot/repair-${categorySlug}-${stamp}`;
  const title = `testpilot: repair ${input.diagnosis.category} in ${fileName}`;

  const screenshotLines: string[] = [];
  if (input.hasBeforeScreenshot || input.hasAfterScreenshot) {
    screenshotLines.push('## Before / after', '');
    if (input.hasBeforeScreenshot) {
      screenshotLines.push('Before (failing state):', '', '![before](./before.png)', '');
    }
    if (input.hasAfterScreenshot) {
      screenshotLines.push('After (repaired state):', '', '![after](./after.png)', '');
    }
  }

  const body = [
    `## Summary`,
    '',
    `testpilot proposes a safe repair to \`${fileName}\` after detecting **${input.diagnosis.category}**.`,
    '',
    `- **Spec:** ${input.intent.originalSpec}`,
    `- **Expected outcome:** ${input.intent.expectedPath} with "${input.intent.expectedText}"`,
    `- **Diagnosis confidence:** ${input.diagnosis.confidence}`,
    '',
    '## Why this is safe',
    '',
    input.diagnosis.reason,
    '',
    input.proposal.reason,
    '',
    '## Proposed change',
    '',
    '```diff',
    input.proposal.diff.trim() || '(no diff available)',
    '```',
    '',
    ...screenshotLines,
    '## Guardrails',
    '',
    SAFE_BODY_NOTE,
    '',
    '- [ ] A human has confirmed the behavior still matches the original intent.',
    `- [ ] Targeting base branch \`${input.baseBranch ?? 'main'}\`.`,
    ''
  ].join('\n');

  return { branch, title, body };
}

/**
 * Writes a reviewable PR bundle to disk and, when openPr is set and the
 * environment supports it, opens a real GitHub PR. Defaults to bundle-only so
 * it never touches a remote unless explicitly asked.
 */
export async function createRepairPr(input: CreateRepairPrInput): Promise<RepairPrResult> {
  if (!input.proposal.safeToApply) {
    throw new Error('Refusing to open a PR for a repair that is not marked safe to apply.');
  }

  const baseBranch = input.baseBranch ?? 'main';
  const content = buildRepairPrContent({
    testPath: input.testPath,
    proposal: input.proposal,
    diagnosis: input.diagnosis,
    intent: input.intent,
    baseBranch,
    hasBeforeScreenshot: Boolean(input.beforeScreenshot),
    hasAfterScreenshot: Boolean(input.afterScreenshot)
  });

  const bundleDir = path.join(input.runDir, 'pr');
  await fs.mkdir(bundleDir, { recursive: true });
  const bodyPath = path.join(bundleDir, 'pr-body.md');
  await fs.writeFile(bodyPath, content.body, 'utf8');
  await fs.writeFile(
    path.join(bundleDir, 'pr-meta.json'),
    JSON.stringify(
      {
        branch: content.branch,
        title: content.title,
        baseBranch,
        testPath: input.testPath,
        category: input.diagnosis.category
      },
      null,
      2
    ),
    'utf8'
  );
  await fs.writeFile(path.join(bundleDir, 'repaired-test.ts'), input.proposal.proposedContent, 'utf8');
  await copyIfPresent(input.beforeScreenshot, path.join(bundleDir, 'before.png'));
  await copyIfPresent(input.afterScreenshot, path.join(bundleDir, 'after.png'));

  const result: RepairPrResult = {
    branch: content.branch,
    title: content.title,
    bundleDir,
    bodyPath,
    opened: false
  };

  if (!input.openPr) {
    return result;
  }

  const skippedReason = await checkPrPrerequisites();
  if (skippedReason) {
    result.skippedReason = skippedReason;
    return result;
  }

  try {
    result.prUrl = await openGithubPr({
      branch: content.branch,
      title: content.title,
      bodyPath,
      baseBranch,
      testPath: input.testPath
    });
    result.opened = true;
  } catch (error) {
    result.skippedReason = `Failed to open PR: ${String(error)}`;
  }
  return result;
}

async function copyIfPresent(source: string | undefined, destination: string) {
  if (!source) {
    return;
  }
  await fs.copyFile(source, destination).catch(() => {
    // Best effort: a missing screenshot should not block the bundle.
  });
}

async function checkPrPrerequisites(): Promise<string | undefined> {
  const gh = await runCommand('gh', ['--version']);
  if (gh.code !== 0) {
    return 'GitHub CLI (gh) is not available; wrote the PR bundle instead.';
  }
  const remote = await runCommand('git', ['remote', 'get-url', 'origin']);
  if (remote.code !== 0 || !remote.stdout.trim()) {
    return 'No git remote "origin" is configured; wrote the PR bundle instead.';
  }
  return undefined;
}

async function openGithubPr(input: {
  branch: string;
  title: string;
  bodyPath: string;
  baseBranch: string;
  testPath: string;
}): Promise<string> {
  const relTest = path.relative(projectRoot, input.testPath);
  await git(['switch', '-c', input.branch]);
  // Force-add so a generated test that is gitignored in the demo still lands in the PR branch.
  await git(['add', '--force', relTest]);
  // Scope the commit to only the repaired test so nothing else staged (e.g. drafts) leaks in.
  await git(['commit', '-m', input.title, '--', relTest]);
  await git(['push', '-u', 'origin', input.branch]);
  const pr = await runCommand('gh', [
    'pr',
    'create',
    '--base',
    input.baseBranch,
    '--head',
    input.branch,
    '--title',
    input.title,
    '--body-file',
    input.bodyPath
  ]);
  if (pr.code !== 0) {
    throw new Error(pr.stderr || pr.stdout || 'gh pr create failed');
  }
  return pr.stdout.trim();
}

async function git(args: string[]) {
  const result = await runCommand('git', args);
  if (result.code !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

function runCommand(command: string, args: string[]) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const child =
      process.platform === 'win32'
        ? spawn('cmd.exe', ['/c', command, ...args], { cwd: projectRoot, shell: false })
        : spawn(command, args, { cwd: projectRoot, shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', () => resolve({ code: 1, stdout, stderr }));
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}
