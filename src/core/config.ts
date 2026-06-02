import path from 'node:path';

export const projectRoot = process.cwd();
export const generatedTestsDir = path.join(projectRoot, 'tests', 'generated');
export const runsDir = path.join(projectRoot, 'runs');
export const defaultBaseUrl = 'http://127.0.0.1:3000';
export const defaultCredentials = {
  email: 'demo@example.com',
  password: 'password123'
};

export function createRunDir(prefix: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(runsDir, `${prefix}-${stamp}`);
}
