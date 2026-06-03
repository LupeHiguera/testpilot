import fs from 'node:fs/promises';
import path from 'node:path';
import { generatedTestsDir } from '../core/config.js';
import { ModelClient, ObservationArtifacts, TestIntent } from '../core/types.js';
import { validateGeneratedTest } from './validateGeneratedTest.js';

export async function generatePlaywrightTest(client: ModelClient, intent: TestIntent, observation: ObservationArtifacts) {
  await fs.mkdir(generatedTestsDir, { recursive: true });
  const content = await client.generateTest(intent, observation);
  const validation = validateGeneratedTest(content, intent);
  if (!validation.valid) {
    throw new Error(`Refused to write generated test: ${validation.reason}`);
  }
  const testPath = path.join(generatedTestsDir, 'login.spec.ts');
  await fs.writeFile(testPath, content, 'utf8');
  return testPath;
}
