import fs from 'node:fs/promises';
import { ModelClient, RepairProposal, RunResult, Diagnosis } from '../core/types.js';

export async function proposePatch(client: ModelClient, input: {
  testPath: string;
  diagnosis: Diagnosis;
  runResult: RunResult;
}): Promise<RepairProposal> {
  const testContent = await fs.readFile(input.testPath, 'utf8');
  return client.proposeRepair({
    testPath: input.testPath,
    testContent,
    diagnosis: input.diagnosis,
    runResult: input.runResult
  });
}
