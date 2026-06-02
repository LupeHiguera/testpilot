import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifyFailure } from '../../src/diagnosis/classifyFailure.js';
import { RunResult, TestIntent } from '../../src/core/types.js';

const intent: TestIntent = {
  name: 'login flow',
  route: '/login',
  credentials: {
    email: 'demo@example.com',
    password: 'password123'
  },
  expectedPath: '/dashboard',
  expectedText: 'Welcome, Demo User',
  submitText: 'Sign in',
  originalSpec: 'login spec'
};

describe('classifyFailure', () => {
  it('classifies equivalent button copy as UI_COPY_CHANGE', async () => {
    const result = await classifyFailure(makeRunResult("Timeout waiting for getByText('Sign in')", ['Log in']), intent);

    expect(result.category).toBe('UI_COPY_CHANGE');
    expect(result.repairable).toBe(true);
  });

  it('classifies URL assertion failure as product regression', async () => {
    const result = await classifyFailure(makeRunResult('Error: expect(page).toHaveURL expected /dashboard', ['Sign in']), intent);

    expect(result.category).toBe('PRODUCT_REGRESSION');
    expect(result.repairable).toBe(false);
  });
});

function makeRunResult(error: string, buttons: string[]): RunResult {
  return {
    passed: false,
    testPath: path.join(process.cwd(), 'tests', 'generated', 'login.spec.ts'),
    runDir: path.join(process.cwd(), 'runs', 'unit'),
    stdout: error,
    stderr: '',
    error,
    failureArtifacts: {
      url: 'http://127.0.0.1:3000/login',
      title: 'testpilot demo',
      domPath: '',
      screenshotPath: '',
      consoleLogs: [],
      networkErrors: [],
      buttons,
      inputs: []
    }
  };
}
