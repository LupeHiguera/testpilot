import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { projectRoot } from '../../src/core/config.js';
import { getProject } from '../../src/projects/store.js';
import { Project } from '../../src/projects/types.js';

const registryDir = path.join(projectRoot, '.testpilot', 'projects');
const file = path.join(registryDir, 'zz-bom-test.json');

afterAll(async () => {
  await fs.rm(file, { force: true });
});

describe('project registry parsing', () => {
  it('reads a project file written with a UTF-8 BOM (hand-edits, PowerShell Out-File)', async () => {
    const project: Project = {
      id: 'zz-bom-test',
      name: 'BOM test',
      repoPath: projectRoot,
      baseUrl: 'http://127.0.0.1:5999',
      testsDir: 'tests',
      docsDir: 'docs',
      route: '/login',
      framework: 'playwright',
      runnable: false,
      sources: [{ type: 'upload' }]
    };
    await fs.mkdir(registryDir, { recursive: true });
    const BOM = String.fromCharCode(0xfeff);
    await fs.writeFile(file, BOM + JSON.stringify(project, null, 2), 'utf8');

    const loaded = await getProject('zz-bom-test');
    // Without BOM stripping this file silently vanished from the registry
    // ("Unknown project" with no error anywhere).
    expect(loaded?.name).toBe('BOM test');
  });
});
