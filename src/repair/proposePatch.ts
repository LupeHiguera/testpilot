import fs from 'node:fs/promises';
import { Diagnosis, ModelClient, ObservationArtifacts, RepairProposal, RunResult } from '../core/types.js';

export async function proposePatch(client: ModelClient, input: {
  testPath: string;
  diagnosis: Diagnosis;
  runResult: RunResult;
  observation?: ObservationArtifacts;
}): Promise<RepairProposal> {
  const testContent = await fs.readFile(input.testPath, 'utf8');
  return client.proposeRepair({
    testPath: input.testPath,
    testContent,
    diagnosis: input.diagnosis,
    runResult: input.runResult,
    observation: input.observation
  });
}
