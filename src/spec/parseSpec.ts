import { z } from 'zod';
import { defaultCredentials } from '../core/config.js';
import { TestIntent } from '../core/types.js';

const intentSchema = z.object({
  name: z.string().min(1),
  route: z.string().startsWith('/'),
  credentials: z.object({
    email: z.string().email(),
    password: z.string().min(1)
  }),
  expectedPath: z.string().startsWith('/'),
  expectedText: z.string().min(1),
  submitText: z.string().min(1),
  originalSpec: z.string().min(1)
});

export function parseSpec(spec: string): TestIntent {
  const route = spec.match(/(?:go to|visit|open)\s+(`?)(\/[a-z0-9/_-]+)\1/i)?.[2] ?? '/login';
  const expectedPath = spec.match(/(?:loads?|routes?|navigates?)\s+(?:to\s+)?(`?)(\/[a-z0-9/_-]+)\1/i)?.[2] ?? '/dashboard';
  const expectedText = /user.?s name|user name|welcome/i.test(spec) ? 'Welcome, Demo User' : 'Demo User';
  const submitText = /log in/i.test(spec) ? 'Log in' : 'Sign in';

  return intentSchema.parse({
    name: 'login flow',
    route,
    credentials: defaultCredentials,
    expectedPath,
    expectedText,
    submitText,
    originalSpec: spec.trim()
  });
}
