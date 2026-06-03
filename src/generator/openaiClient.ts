import fs from 'node:fs/promises';
import OpenAI from 'openai';
import { parseSpec } from '../spec/parseSpec.js';
import { Diagnosis, FailureCategory, ModelClient, ObservationArtifacts, RepairProposal, RunResult, TestIntent, VisionDiagnosis } from '../core/types.js';
import { FAILURE_CATEGORIES } from '../diagnosis/categories.js';
import { MockModelClient } from './mockClient.js';

export class OpenAiModelClient implements ModelClient {
  private readonly client = new OpenAI();
  private readonly model: string;
  private readonly fallback = new MockModelClient();

  constructor(model = process.env.OPENAI_MODEL ?? 'gpt-5.5') {
    this.model = model;
  }

  async parseSpec(spec: string): Promise<TestIntent> {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required for --mode openai');
    }
    const response = await this.client.responses.create({
      model: this.model,
      input: [
        {
          role: 'system',
          content: 'Extract a Playwright login test intent. Return JSON only.'
        },
        {
          role: 'user',
          content: spec
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'test_intent',
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'route', 'credentials', 'expectedPath', 'expectedText', 'submitText', 'originalSpec'],
            properties: {
              name: { type: 'string' },
              route: { type: 'string' },
              credentials: {
                type: 'object',
                additionalProperties: false,
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string' },
                  password: { type: 'string' }
                }
              },
              expectedPath: { type: 'string' },
              expectedText: { type: 'string' },
              submitText: { type: 'string' },
              originalSpec: { type: 'string' }
            }
          }
        }
      }
    });
    return parseSpec(response.output_text || spec);
  }

  async generateTest(intent: TestIntent, observation: ObservationArtifacts): Promise<string> {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required for --mode openai');
    }
    const response = await this.client.responses.create({
      model: this.model,
      input: [
        {
          role: 'system',
          content: [
            'Generate exactly one Playwright TypeScript test. Return code only — no markdown fences, no prose.',
            'Requirements:',
            "- import { test, expect } from '@playwright/test'.",
            '- Navigate using this exact pattern so the base URL and any query string (test variant) are preserved:',
            "    const target = new URL(process.env.BASE_URL ?? 'http://127.0.0.1:3000');",
            "    target.pathname = intent.route;",
            '    await page.goto(target.toString());',
            "- Prefer accessible locators: page.getByLabel(...) for inputs and page.getByRole('button', { name: ... }) for the submit button.",
            '- Fill the credentials, click the submit button, then assert both the expected URL (toHaveURL) and that the expected text is visible (getByText).',
            '- Use the route, credentials, submit text, expected path, and expected text from the provided intent. Do not remove or weaken assertions.'
          ].join('\n')
        },
        {
          role: 'user',
          content: JSON.stringify({ intent, observation }, null, 2)
        }
      ]
    });
    return response.output_text.trim() || this.fallback.generateTest(intent, observation);
  }

  async proposeRepair(input: {
    testPath: string;
    testContent: string;
    diagnosis: Diagnosis;
    runResult: RunResult;
  }): Promise<RepairProposal> {
    const fallback = await this.fallback.proposeRepair(input);
    if (!process.env.OPENAI_API_KEY || !input.diagnosis.repairable) {
      return fallback;
    }
    const response = await this.client.responses.create({
      model: this.model,
      input: [
        {
          role: 'system',
          content: [
            'You repair a Playwright test that failed due to safe UI drift, preserving the original test intent.',
            'Rules:',
            '- Return the full repaired TypeScript file content only — no markdown fences, no prose.',
            '- For copy or selector drift, replace the brittle locator with a resilient one. When a submit button label changed, use a role locator whose name matches BOTH the old and new text via a regex, e.g.',
            "    page.getByRole('button', { name: /^(Sign in|Log in)$/ })",
            '  Never hardcode only the new label — the repaired test must still pass against the original UI too.',
            '- Preserve every assertion and the expected business outcome: keep the toHaveURL check against the expected path and the visible expected text. Do not weaken or remove assertions.',
            "- Keep the navigation contract: new URL(process.env.BASE_URL ?? 'http://127.0.0.1:3000') with target.pathname, preserving the query string.",
            '- Do not change the credentials, expected path, or expected text.'
          ].join('\n')
        },
        {
          role: 'user',
          content: JSON.stringify(input, null, 2)
        }
      ]
    });
    const proposedContent = response.output_text.trim();
    if (!proposedContent || proposedContent.includes('```')) {
      return fallback;
    }
    return {
      category: input.diagnosis.category,
      reason: 'OpenAI proposed a generated-test repair for safe drift.',
      originalPath: input.testPath,
      proposedContent,
      diff: createPatch(input.testPath, input.testContent, proposedContent),
      safeToApply: true
    };
  }

  async classifyScreenshot(input: {
    screenshotPath: string;
    intent: TestIntent;
    heuristic: Diagnosis;
  }): Promise<VisionDiagnosis> {
    if (!process.env.OPENAI_API_KEY) {
      return this.fallback.classifyScreenshot(input);
    }
    const base64 = (await fs.readFile(input.screenshotPath)).toString('base64');
    const response = await this.client.responses.create({
      model: this.model,
      input: [
        {
          role: 'system',
          content:
            'You classify why a browser test failed. Use the screenshot and context to choose exactly one failure category. Return JSON only.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify({ intent: input.intent, heuristic: input.heuristic, categories: FAILURE_CATEGORIES })
            },
            { type: 'input_image', image_url: `data:image/png;base64,${base64}`, detail: 'auto' }
          ]
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'vision_diagnosis',
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['category', 'confidence', 'reason'],
            properties: {
              category: { type: 'string', enum: FAILURE_CATEGORIES },
              confidence: { type: 'number' },
              reason: { type: 'string' }
            }
          }
        }
      }
    });
    const parsed = JSON.parse(response.output_text || '{}');
    const category: FailureCategory = (FAILURE_CATEGORIES as string[]).includes(parsed.category)
      ? (parsed.category as FailureCategory)
      : 'UNKNOWN';
    return {
      category,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      reason: typeof parsed.reason === 'string' && parsed.reason ? parsed.reason : 'Vision model returned no reason.'
    };
  }
}

function createPatch(filePath: string, before: string, after: string) {
  return [
    `--- ${filePath}`,
    `+++ ${filePath} (repaired)`,
    '@@',
    ...before.split('\n').map((line) => `-${line}`),
    ...after.split('\n').map((line) => `+${line}`)
  ].join('\n');
}
