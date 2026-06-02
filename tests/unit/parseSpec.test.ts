import { describe, expect, it } from 'vitest';
import { parseSpec } from '../../src/spec/parseSpec.js';

describe('parseSpec', () => {
  it('extracts the login flow intent from plain English', () => {
    const intent = parseSpec("Go to /login, enter valid credentials, submit the form, and verify the dashboard displays the user's name.");

    expect(intent.route).toBe('/login');
    expect(intent.expectedPath).toBe('/dashboard');
    expect(intent.expectedText).toBe('Welcome, Demo User');
    expect(intent.credentials.email).toBe('demo@example.com');
    expect(intent.submitText).toBe('Sign in');
  });
});
