export type FailureCategory =
  | 'APP_UNAVAILABLE'
  | 'NETWORK_OR_API_FAILURE'
  | 'AUTH_OR_TEST_DATA_FAILURE'
  | 'SELECTOR_DRIFT'
  | 'UI_COPY_CHANGE'
  | 'TIMING_OR_FLAKE'
  | 'PRODUCT_REGRESSION'
  | 'UNKNOWN';

export type ModelMode = 'mock' | 'openai';

export interface TestIntent {
  name: string;
  route: string;
  credentials: {
    email: string;
    password: string;
  };
  expectedPath: string;
  expectedText: string;
  submitText: string;
  originalSpec: string;
}

export interface ObservationArtifacts {
  url: string;
  title: string;
  domPath: string;
  screenshotPath: string;
  consoleLogs: string[];
  networkErrors: string[];
  /** Accessible names of button-role controls (<button>, [role=button],
   *  submit/button inputs — everything getByRole('button') matches). */
  buttons: string[];
  /** Accessible names of links. Optional: artifacts recorded before links were
   *  captured (older run-result.json files on disk) lack the field. */
  links?: string[];
  inputs: Array<{
    name: string;
    type: string;
    placeholder: string;
    label: string;
  }>;
}

export interface RunResult {
  passed: boolean;
  testPath: string;
  runDir: string;
  stdout: string;
  stderr: string;
  error?: string;
  failureArtifacts?: ObservationArtifacts;
}

export interface Diagnosis {
  category: FailureCategory;
  confidence: number;
  reason: string;
  repairable: boolean;
}

export interface VisionDiagnosis {
  category: FailureCategory;
  confidence: number;
  reason: string;
}

export interface RepairProposal {
  category: FailureCategory;
  reason: string;
  originalPath: string;
  proposedContent: string;
  diff: string;
  safeToApply: boolean;
}

export interface ModelClient {
  parseSpec(spec: string): Promise<TestIntent>;
  generateTest(intent: TestIntent, observation: ObservationArtifacts): Promise<string>;
  proposeRepair(input: {
    testPath: string;
    testContent: string;
    diagnosis: Diagnosis;
    runResult: RunResult;
    // A fresh observation of the page at repair time, so the proposal can be
    // grounded in the CURRENT UI rather than only the stale failure. Optional so
    // the contract stays backward-compatible and mock mode can ignore it.
    observation?: ObservationArtifacts;
  }): Promise<RepairProposal>;
  classifyScreenshot(input: {
    screenshotPath: string;
    intent: TestIntent;
    heuristic: Diagnosis;
  }): Promise<VisionDiagnosis>;
}
