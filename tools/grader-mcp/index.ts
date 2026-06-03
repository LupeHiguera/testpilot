import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { captureUi, runUiChecks } from './checks.js';
import { recordGrade } from './grades.js';
import { rubricMarkdown } from './rubric.js';

const server = new McpServer({ name: 'testpilot-grader', version: '0.1.0' });

server.registerTool(
  'capture_ui',
  {
    title: 'Capture the dashboard UI',
    description:
      'Screenshot the live-view dashboard at a viewport (default 1440). Set triggerRun to start a run first so the canyon is populated. Returns the screenshot inline so you can grade what it actually looks like.',
    inputSchema: {
      url: z.string(),
      viewport: z.number().optional(),
      triggerRun: z.boolean().optional()
    }
  },
  async ({ url, viewport, triggerRun }) => {
    const result = await captureUi({ url, viewport, triggerRun });
    return {
      content: [
        { type: 'image', data: result.base64, mimeType: 'image/png' },
        { type: 'text', text: `Captured ${result.viewport}px → ${result.screenshotPath}` }
      ]
    };
  }
);

server.registerTool(
  'run_ui_checks',
  {
    title: 'Run objective UI checks',
    description: 'Run axe-core accessibility checks, capture console errors, and basic metrics against the dashboard URL.',
    inputSchema: { url: z.string() }
  },
  async ({ url }) => {
    const checks = await runUiChecks(url);
    return { content: [{ type: 'text', text: JSON.stringify(checks, null, 2) }] };
  }
);

server.registerTool(
  'record_grade',
  {
    title: 'Record a rubric grade',
    description: 'Append a grade (per-criterion scores 0-4, feedback strings, pass boolean) to grading/grades.jsonl.',
    inputSchema: {
      iteration: z.number(),
      scores: z.record(z.number()),
      feedback: z.record(z.string()),
      pass: z.boolean()
    }
  },
  async ({ iteration, scores, feedback, pass }) => {
    const file = await recordGrade({ iteration, scores, feedback, pass });
    return { content: [{ type: 'text', text: `Recorded grade for iteration ${iteration} → ${file}` }] };
  }
);

server.registerResource(
  'rubric',
  'rubric://testpilot-ui',
  { title: 'testpilot UI rubric', description: 'The 7-criterion grading rubric.', mimeType: 'text/markdown' },
  async (uri) => ({ contents: [{ uri: uri.href, text: rubricMarkdown() }] })
);

const transport = new StdioServerTransport();
await server.connect(transport);
