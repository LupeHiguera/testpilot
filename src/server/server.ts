import http from 'node:http';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { projectRoot, runsDir } from '../core/config.js';
import { ModelMode } from '../core/types.js';
import { onPipelineEvent } from '../events/bus.js';
import { runDemoWithServer } from '../pipeline/demo.js';
import { startDemoServer, stopProcessTree } from '../pipeline/demoServer.js';
import { runStoryPipeline } from '../pipeline/story.js';
import { getProject, listProjects } from '../projects/store.js';
import { addStory, listStories } from '../stories/store.js';

const uiDist = path.join(projectRoot, 'ui', 'dist');

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

export function startLiveServer(port = 4000): http.Server {
  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      sendJson(res, { error: String(error) }, 500);
    });
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`testpilot live view → http://127.0.0.1:${port}`);
  });
  return server;
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const { pathname } = url;

  if (pathname === '/events') {
    return handleSse(req, res);
  }
  if (pathname === '/api/runs' && req.method === 'GET') {
    return sendJson(res, await listRuns());
  }
  if (pathname.startsWith('/api/runs/') && req.method === 'GET') {
    const id = decodeURIComponent(pathname.slice('/api/runs/'.length));
    return sendJson(res, await getRun(id));
  }
  if (pathname === '/api/run' && req.method === 'POST') {
    return triggerRun(req, res);
  }
  if (pathname === '/api/projects' && req.method === 'GET') {
    return sendJson(res, await listProjects());
  }
  if (pathname === '/api/stories' && req.method === 'GET') {
    return sendJson(res, await listStories(url.searchParams.get('projectId') ?? 'demo'));
  }
  if (pathname === '/api/stories' && req.method === 'POST') {
    return triggerStory(req, res);
  }
  if (pathname.startsWith('/artifacts/')) {
    return serveArtifact(decodeURIComponent(pathname.slice('/artifacts/'.length)), res);
  }
  return serveStatic(pathname, res);
}

function handleSse(req: http.IncomingMessage, res: http.ServerResponse) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  res.write('retry: 2000\n\n');
  const unsubscribe = onPipelineEvent((event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);
  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}

function triggerRun(req: http.IncomingMessage, res: http.ServerResponse) {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    let mode: ModelMode = 'mock';
    try {
      const parsed = body ? JSON.parse(body) : {};
      if (parsed.mode === 'openai') {
        mode = 'openai';
      }
    } catch {
      // Ignore a malformed body and fall back to mock.
    }
    // Fire-and-forget: events stream over SSE; failures surface as a decision event.
    runDemoWithServer({ mode, model: undefined, baseUrl: 'http://127.0.0.1:3000' }).catch((error) => {
      console.error('Live run failed:', error);
    });
    sendJson(res, { started: true, mode }, 202);
  });
}

function triggerStory(req: http.IncomingMessage, res: http.ServerResponse) {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', async () => {
    try {
      const parsed = body ? JSON.parse(body) : {};
      const project = await getProject(parsed.projectId);
      if (!project || !parsed.body) {
        return sendJson(res, { error: 'projectId and body are required' }, 400);
      }
      const story = await addStory({
        projectId: project.id,
        source: 'upload',
        title: parsed.title || String(parsed.body).trim().slice(0, 60),
        body: parsed.body
      });
      sendJson(res, { started: true, storyId: story.id }, 202);
      // testpilot manages the demo app; connected projects run their own dev server.
      const appServer = project.id === 'demo' ? await startDemoServer() : undefined;
      try {
        await runStoryPipeline(project, story, { mode: 'mock' });
      } catch (error) {
        console.error('Story run failed:', error);
      } finally {
        if (appServer) {
          stopProcessTree(appServer.pid);
        }
      }
    } catch (error) {
      sendJson(res, { error: String(error) }, 500);
    }
  });
}

async function listRuns() {
  const entries = await fs.readdir(runsDir, { withFileTypes: true }).catch(() => []);
  const runs = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('demo-'))
      .map(async (entry) => {
        const dir = path.join(runsDir, entry.name);
        const summary = await readJson(path.join(dir, 'demo-summary.json'));
        const stat = await fs.stat(dir).catch(() => undefined);
        return {
          runId: entry.name,
          createdAt: stat?.mtimeMs ?? 0,
          summary: summary ? summarize(summary) : undefined
        };
      })
  );
  return runs.sort((a, b) => b.createdAt - a.createdAt);
}

async function getRun(id: string) {
  const dir = path.join(runsDir, path.basename(id));
  const [report, summary] = await Promise.all([
    readJson(path.join(dir, 'report.json')),
    readJson(path.join(dir, 'demo-summary.json'))
  ]);
  return { runId: path.basename(id), report, summary };
}

function summarize(summary: Record<string, unknown>) {
  const diagnosis = summary.diagnosis as { category?: string } | undefined;
  const regression = summary.regressionDiagnosis as { category?: string } | undefined;
  return {
    repairApplied: Boolean(summary.repairApplied),
    copyChange: diagnosis?.category,
    regression: regression?.category
  };
}

async function serveArtifact(relPath: string, res: http.ServerResponse) {
  const resolved = path.resolve(projectRoot, relPath);
  // Only ever serve files inside runs/ — never escape the artifact root.
  if (resolved !== runsDir && !resolved.startsWith(runsDir + path.sep)) {
    return sendJson(res, { error: 'forbidden' }, 403);
  }
  return streamFile(resolved, res);
}

async function serveStatic(pathname: string, res: http.ServerResponse) {
  const hasBuild = await fs
    .access(path.join(uiDist, 'index.html'))
    .then(() => true)
    .catch(() => false);
  if (!hasBuild) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(placeholderPage());
    return;
  }
  const requested = pathname === '/' ? '/index.html' : pathname;
  const resolved = path.resolve(uiDist, '.' + requested);
  if (!resolved.startsWith(uiDist)) {
    return sendJson(res, { error: 'forbidden' }, 403);
  }
  const exists = await fs
    .access(resolved)
    .then(() => true)
    .catch(() => false);
  // SPA fallback: unknown routes serve index.html.
  return streamFile(exists ? resolved : path.join(uiDist, 'index.html'), res);
}

async function streamFile(filePath: string, res: http.ServerResponse) {
  const exists = await fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
  if (!exists) {
    return sendJson(res, { error: 'not found' }, 404);
  }
  res.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(filePath)] ?? 'application/octet-stream' });
  createReadStream(filePath).pipe(res);
}

async function readJson(filePath: string): Promise<Record<string, unknown> | undefined> {
  return fs
    .readFile(filePath, 'utf8')
    .then((text) => JSON.parse(text) as Record<string, unknown>)
    .catch(() => undefined);
}

function sendJson(res: http.ServerResponse, body: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(body));
}

function placeholderPage() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>testpilot live</title></head>
<body style="font-family:system-ui;background:#2E2A4A;color:#E0A96D;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center">
<h1 style="margin:0 0 .5rem">testpilot live view</h1>
<p>The dashboard is not built yet. Run <code>npm run ui:build</code>, then reload.</p>
<p>The event stream (<code>/events</code>) and API are already live.</p>
</div></body></html>`;
}
