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
  /** Root of the git repo the repair belongs to. Defaults to testpilot's own repo;
   *  a connected project passes its repoPath so the branch/PR land in THAT repo. */
  repoRoot?: string;
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

/** Deterministic branch name for a repair, derived from the diagnosis and a timestamp. */
export function repairBranchName(category: string, stamp: string): string {
  const slug = category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `testpilot/repair-${slug}-${stamp}`;
}

/**
 * Pure builder for the PR branch name, title, and markdown body. Kept separate
 * from any git/network side effects so it can be unit tested deterministically.
 * `beforeImageRef`/`afterImageRef` are the markdown image sources to embed:
 * relative paths (`./before.png`) for a local bundle, or absolute raw URLs for
 * a real PR. When omitted, no image is rendered.
 */
export function buildRepairPrContent(input: {
  testPath: string;
  proposal: RepairProposal;
  diagnosis: Diagnosis;
  intent: TestIntent;
  baseBranch?: string;
  beforeImageRef?: string;
  afterImageRef?: string;
  stamp?: string;
}): RepairPrContent {
  const stamp = input.stamp ?? new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = path.basename(input.testPath);
  const branch = repairBranchName(input.diagnosis.category, stamp);
  const title = `testpilot: repair ${input.diagnosis.category} in ${fileName}`;

  const screenshotLines: string[] = [];
  if (input.beforeImageRef || input.afterImageRef) {
    screenshotLines.push('## Before / after', '');
    if (input.beforeImageRef) {
      screenshotLines.push('Before (failing state):', '', `![before](${input.beforeImageRef})`, '');
    }
    if (input.afterImageRef) {
      screenshotLines.push('After (repaired state):', '', `![after](${input.afterImageRef})`, '');
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
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  const bundleDir = path.join(input.runDir, 'pr');
  await fs.mkdir(bundleDir, { recursive: true });
  await copyIfPresent(input.beforeScreenshot, path.join(bundleDir, 'before.png'));
  await copyIfPresent(input.afterScreenshot, path.join(bundleDir, 'after.png'));

  // Local bundle uses relative refs that resolve when viewing the bundle folder.
  const content = buildRepairPrContent({
    testPath: input.testPath,
    proposal: input.proposal,
    diagnosis: input.diagnosis,
    intent: input.intent,
    baseBranch,
    stamp,
    beforeImageRef: input.beforeScreenshot ? './before.png' : undefined,
    afterImageRef: input.afterScreenshot ? './after.png' : undefined
  });

  const bodyPath = path.join(bundleDir, 'pr-body.md');
  await fs.writeFile(bodyPath, content.body, 'utf8');
  await fs.writeFile(
    path.join(bundleDir, 'pr-meta.json'),
    JSON.stringify(
      { branch: content.branch, title: content.title, baseBranch, testPath: input.testPath, category: input.diagnosis.category },
      null,
      2
    ),
    'utf8'
  );
  await fs.writeFile(path.join(bundleDir, 'repaired-test.ts'), input.proposal.proposedContent, 'utf8');

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

  const repoRoot = input.repoRoot ?? projectRoot;
  const skippedReason = await checkPrPrerequisites(repoRoot);
  if (skippedReason) {
    result.skippedReason = skippedReason;
    return result;
  }

  try {
    result.prUrl = await openGithubPr({
      branch: content.branch,
      title: content.title,
      baseBranch,
      stamp,
      repoRoot,
      testPath: input.testPath,
      proposal: input.proposal,
      diagnosis: input.diagnosis,
      intent: input.intent,
      beforeScreenshot: input.beforeScreenshot,
      afterScreenshot: input.afterScreenshot,
      bodyPath
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

async function checkPrPrerequisites(repoRoot: string): Promise<string | undefined> {
  const gh = await runCommand('gh', ['--version'], repoRoot);
  if (gh.code !== 0) {
    return 'GitHub CLI (gh) is not available; wrote the PR bundle instead.';
  }
  const remote = await runCommand('git', ['remote', 'get-url', 'origin'], repoRoot);
  if (remote.code !== 0 || !remote.stdout.trim()) {
    return 'No git remote "origin" is configured; wrote the PR bundle instead.';
  }
  return undefined;
}

async function openGithubPr(input: {
  branch: string;
  title: string;
  baseBranch: string;
  stamp: string;
  repoRoot: string;
  testPath: string;
  proposal: RepairProposal;
  diagnosis: Diagnosis;
  intent: TestIntent;
  beforeScreenshot?: string;
  afterScreenshot?: string;
  bodyPath: string;
}): Promise<string> {
  const { repoRoot } = input;
  const relTest = path.relative(repoRoot, input.testPath);
  const ownerRepo = parseGithubOwnerRepo((await runCommand('git', ['remote', 'get-url', 'origin'], repoRoot)).stdout);

  // Stage tracked copies of the screenshots so they can be committed to the
  // branch and referenced by absolute raw URL in the PR body (relative paths do
  // not render in PR descriptions).
  const imageDirRel = path.join('.testpilot', 'pr', input.stamp);
  let beforeRepoPath: string | undefined;
  let afterRepoPath: string | undefined;
  if (input.beforeScreenshot || input.afterScreenshot) {
    await fs.mkdir(path.join(repoRoot, imageDirRel), { recursive: true });
    beforeRepoPath = await copyIntoRepo(repoRoot, input.beforeScreenshot, path.join(imageDirRel, 'before.png'));
    afterRepoPath = await copyIntoRepo(repoRoot, input.afterScreenshot, path.join(imageDirRel, 'after.png'));
  }

  // Remember where the repo was so the checkout is restored afterwards — in a
  // connected repo, leaving the user stranded on a testpilot branch is not ours
  // to do. The repair commit lives on the pushed branch either way.
  const originalRef = (await git(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot)).stdout.trim();
  await git(['switch', '-c', input.branch], repoRoot);
  try {
    // Force-add so a generated test that is gitignored in the demo still lands in the PR branch.
    await git(['add', '--force', relTest], repoRoot);
    const commitPaths = [relTest];
    if (beforeRepoPath || afterRepoPath) {
      await git(['add', '--force', imageDirRel], repoRoot);
      commitPaths.push(imageDirRel);
    }
    // Scope the commit to only these paths so nothing else staged (e.g. drafts) leaks in.
    await git(['commit', '-m', input.title, '--', ...commitPaths], repoRoot);
    const sha = (await git(['rev-parse', 'HEAD'], repoRoot)).stdout.trim();

    // Rebuild the body with absolute raw URLs (pinned to the commit SHA) so the
    // before/after images render on GitHub. Fall back to relative refs if we
    // could not determine owner/repo.
    const body = buildRepairPrContent({
      testPath: input.testPath,
      proposal: input.proposal,
      diagnosis: input.diagnosis,
      intent: input.intent,
      baseBranch: input.baseBranch,
      stamp: input.stamp,
      beforeImageRef: imageRef(ownerRepo, sha, beforeRepoPath, './before.png'),
      afterImageRef: imageRef(ownerRepo, sha, afterRepoPath, './after.png')
    }).body;
    await fs.writeFile(input.bodyPath, body, 'utf8');

    await git(['push', '-u', 'origin', input.branch], repoRoot);
    const pr = await runCommand(
      'gh',
      ['pr', 'create', '--base', input.baseBranch, '--head', input.branch, '--title', input.title, '--body-file', input.bodyPath],
      repoRoot
    );
    if (pr.code !== 0) {
      throw new Error(pr.stderr || pr.stdout || 'gh pr create failed');
    }
    return pr.stdout.trim();
  } finally {
    if (originalRef && originalRef !== 'HEAD') {
      await git(['switch', originalRef], repoRoot).catch(() => {
        // Best effort: a failed switch-back leaves the repair branch checked out,
        // which is recoverable by hand; never mask the primary error with this.
      });
    }
  }
}

async function copyIntoRepo(repoRoot: string, source: string | undefined, repoRelPath: string): Promise<string | undefined> {
  if (!source) {
    return undefined;
  }
  try {
    await fs.copyFile(source, path.join(repoRoot, repoRelPath));
    return repoRelPath;
  } catch {
    return undefined;
  }
}

function imageRef(
  ownerRepo: { owner: string; repo: string } | undefined,
  sha: string,
  repoRelPath: string | undefined,
  relativeFallback: string
): string | undefined {
  if (!repoRelPath) {
    return undefined;
  }
  if (!ownerRepo) {
    return relativeFallback;
  }
  const urlPath = repoRelPath.split(path.sep).join('/');
  return `https://raw.githubusercontent.com/${ownerRepo.owner}/${ownerRepo.repo}/${sha}/${urlPath}`;
}

export function parseGithubOwnerRepo(remoteUrl: string): { owner: string; repo: string } | undefined {
  const cleaned = remoteUrl.trim().replace(/\.git$/, '');
  // Matches https://github.com/owner/repo and git@github.com:owner/repo
  const match = cleaned.match(/github\.com[:/]([^/]+)\/([^/]+)$/);
  if (!match) {
    return undefined;
  }
  return { owner: match[1], repo: match[2] };
}

async function git(args: string[], cwd: string) {
  const result = await runCommand('git', args, cwd);
  if (result.code !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

function runCommand(command: string, args: string[], cwd: string = projectRoot) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const child =
      process.platform === 'win32'
        ? spawn('cmd.exe', ['/c', command, ...args], { cwd, shell: false })
        : spawn(command, args, { cwd, shell: false });
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
