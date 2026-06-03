export type StorySourceType = 'upload' | 'github' | 'jira';

export interface StorySource {
  type: StorySourceType;
  /** Source-specific config (github: { owner, repo, label }; jira: { jql }). */
  config?: Record<string, unknown>;
}

export interface ProjectCredentials {
  email: string;
  password: string;
}

/**
 * A connected project under test. Generated tests and docs are written into the
 * project's own repo (repoPath); the registry entry lives in testpilot's workspace.
 */
export interface Project {
  id: string;
  name: string;
  /** Absolute path to the connected repo where tests/docs are written. */
  repoPath: string;
  /** Where the app under test serves (for observation + running). */
  baseUrl: string;
  /** Test output dir, relative to repoPath. */
  testsDir: string;
  /** Docs output dir, relative to repoPath. */
  docsDir: string;
  /** Default route to observe, e.g. "/login". */
  route: string;
  credentials?: ProjectCredentials;
  framework: 'playwright';
  /** Whether testpilot can run the generated tests here (true when the repo shares
   *  testpilot's Playwright context, e.g. the built-in demo). */
  runnable: boolean;
  sources: StorySource[];
}
