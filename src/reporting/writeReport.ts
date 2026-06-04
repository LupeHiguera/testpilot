import fs from 'node:fs/promises';
import path from 'node:path';
import { Diagnosis, ObservationArtifacts, RepairProposal, RunResult, TestIntent } from '../core/types.js';

export async function writeReport(input: {
  runDir: string;
  intent: TestIntent;
  observation?: ObservationArtifacts;
  runResult?: RunResult;
  diagnosis?: Diagnosis;
  repair?: RepairProposal;
  repairApplied?: boolean;
  /** How many repair attempts the re-observe loop made before settling. */
  attempts?: number;
  scenarios?: Array<{
    name: string;
    passed: boolean;
    diagnosis?: string;
    repairApplied?: boolean;
    note: string;
  }>;
}) {
  await fs.mkdir(input.runDir, { recursive: true });
  const reportPath = path.join(input.runDir, 'report.md');
  const lines = [
    '# testpilot Report',
    '',
    `Spec: ${input.intent.originalSpec}`,
    `Route: ${input.intent.route}`,
    `Expected: ${input.intent.expectedPath} with "${input.intent.expectedText}"`,
    '',
    '## Result',
    input.runResult ? `Passed: ${input.runResult.passed}` : 'Generated test only.',
    input.diagnosis ? `Diagnosis: ${input.diagnosis.category} (${input.diagnosis.confidence})` : '',
    input.diagnosis ? `Reason: ${input.diagnosis.reason}` : '',
    '',
    ...(input.scenarios?.length
      ? [
          '## Scenarios',
          ...input.scenarios.map(
            (scenario) =>
              `- ${scenario.name}: ${scenario.passed ? 'passed' : 'failed'}${scenario.diagnosis ? `, ${scenario.diagnosis}` : ''}${
                scenario.repairApplied === undefined ? '' : `, repair applied: ${scenario.repairApplied}`
              }. ${scenario.note}`
          )
        ]
      : []),
    '',
    '## Artifacts',
    input.observation ? `Observation screenshot: ${input.observation.screenshotPath}` : '',
    input.runResult ? `Run directory: ${input.runResult.runDir}` : '',
    '',
    '## Repair',
    input.repair ? `Safe to apply: ${input.repair.safeToApply}` : 'No repair proposed.',
    input.repair ? `Applied: ${Boolean(input.repairApplied)}` : '',
    input.attempts ? `Attempts: ${input.attempts}` : '',
    input.repair ? `Reason: ${input.repair.reason}` : '',
    input.repair?.diff ? '```diff' : '',
    input.repair?.diff ?? '',
    input.repair?.diff ? '```' : ''
  ].filter((line) => line !== '');

  await fs.writeFile(reportPath, `${lines.join('\n')}\n`, 'utf8');
  await fs.writeFile(path.join(input.runDir, 'report.json'), JSON.stringify(input, null, 2), 'utf8');
  return reportPath;
}
