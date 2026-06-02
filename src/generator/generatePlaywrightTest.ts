import fs from 'node:fs/promises';
import path from 'node:path';
import { generatedTestsDir } from '../core/config.js';
import { ModelClient, ObservationArtifacts, TestIntent } from '../core/types.js';

export async function generatePlaywrightTest(client: ModelClient, intent: TestIntent, observation: ObservationArtifacts) {
  await fs.mkdir(generatedTestsDir, { recursive: true });
  const content = await client.generateTest(intent, observation);
  const testPath = path.join(generatedTestsDir, 'login.spec.ts');
  await fs.writeFile(testPath, content, 'utf8');
  return testPath;
}
