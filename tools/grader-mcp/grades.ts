import fs from 'node:fs/promises';
import path from 'node:path';

const gradingDir = path.join(process.cwd(), 'grading');
const gradesFile = path.join(gradingDir, 'grades.jsonl');

export interface GradeRecord {
  iteration: number;
  scores: Record<string, number>;
  feedback: Record<string, string>;
  pass: boolean;
  ts?: number;
}

/** Append a grade to grading/grades.jsonl so the loop's progress is tracked. */
export async function recordGrade(record: GradeRecord): Promise<string> {
  await fs.mkdir(gradingDir, { recursive: true });
  const line = JSON.stringify({ ...record, ts: record.ts ?? Date.now() });
  await fs.appendFile(gradesFile, line + '\n', 'utf8');
  return gradesFile;
}

export async function readGrades(): Promise<GradeRecord[]> {
  const text = await fs.readFile(gradesFile, 'utf8').catch(() => '');
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as GradeRecord);
}
