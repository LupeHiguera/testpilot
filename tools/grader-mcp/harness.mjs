// Client side of the coder<->grader loop. Drives the grader MCP server to gather
// objective evidence (multi-viewport screenshots + axe/console checks) and to
// record grades. Usage:
//   node tools/grader-mcp/harness.mjs capture <url>        -> writes grading/evidence.json
//   node tools/grader-mcp/harness.mjs record <grade.json>  -> appends to grading/grades.jsonl
import fs from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const command = process.argv[2];
const arg = process.argv[3];

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['--import', 'tsx', 'tools/grader-mcp/index.ts']
});
const client = new Client({ name: 'loop-harness', version: '0.1.0' });
await client.connect(transport);

try {
  if (command === 'capture') {
    const url = arg ?? 'http://127.0.0.1:4000';
    const shots = {};
    // Drive a live run at EVERY viewport so the canyon is populated and the verdict
    // moment is captured responsively (1440/768/375), not just on desktop.
    for (const viewport of [1440, 768, 375]) {
      shots[String(viewport)] = pathOf(await client.callTool({ name: 'capture_ui', arguments: { url, viewport, triggerRun: true } }));
    }
    const checksResult = await client.callTool({ name: 'run_ui_checks', arguments: { url } });
    const checks = JSON.parse(textOf(checksResult));
    const evidence = { url, capturedAt: new Date().toISOString(), shots, checks };
    await fs.mkdir('grading', { recursive: true });
    await fs.writeFile('grading/evidence.json', JSON.stringify(evidence, null, 2), 'utf8');
    console.log(JSON.stringify(evidence, null, 2));
  } else if (command === 'record') {
    const grade = JSON.parse(await fs.readFile(arg, 'utf8'));
    await client.callTool({ name: 'record_grade', arguments: grade });
    console.log('recorded grade for iteration', grade.iteration, 'pass:', grade.pass);
  } else {
    throw new Error(`unknown command: ${command}`);
  }
} finally {
  await client.close();
}

function textOf(result) {
  return result.content.find((c) => c.type === 'text')?.text ?? '';
}
function pathOf(result) {
  const match = textOf(result).match(/→\s*(.+)$/);
  return match ? match[1].trim() : textOf(result);
}
