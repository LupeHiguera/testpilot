import http from 'node:http';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { projectRoot, runsDir } from '../core/config.js';
import { ModelMode } from '../core/types.js';
import { buildDocsModel, generateDocs } from '../docs/generateDocs.js';
import { onPipelineEvent } from '../events/bus.js';
import { runDemoWithServer } from '../pipeline/demo.js';
import { startDemoServer, stopProcessTree } from '../pipeline/demoServer.js';
import { runStoryPipeline } from '../pipeline/story.js';
import { getProject, listProjects } from '../projects/store.js';
import { addStory, isValidProjectId, listStories } from '../stories/store.js';

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
    const projectId = url.searchParams.get('projectId') ?? 'demo';
    // A non-slug id would walk the stories dir join out of the registry root.
    if (!isValidProjectId(projectId)) {
      return sendJson(res, { error: 'invalid projectId' }, 400);
    }
    return sendJson(res, await listStories(projectId));
  }
  if (pathname === '/api/stories' && req.method === 'POST') {
    return triggerStory(req, res);
  }
  if (pathname === '/api/docs' && req.method === 'GET') {
    const project = await getProject(url.searchParams.get('projectId') ?? 'demo');
    return project ? sendJson(res, await buildDocsModel(project)) : sendJson(res, { error: 'unknown project' }, 404);
  }
  if (pathname === '/api/docs' && req.method === 'POST') {
    return triggerDocs(req, res);
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

// Cap on a request body. The server is a local dev tool, but an unbounded
// `body += chunk` would let any client (or a runaway script) buffer the process
// out of memory; 1 MB is far more than any control payload needs.
const MAX_BODY_BYTES = 1_000_000;

/**
 * CSRF guard for the mutating endpoints. The server binds to 127.0.0.1, but a web
 * page you have open in a browser can still fire a cross-origin POST at it (a
 * "simple" request needs no preflight), which would spawn the demo app + a real
 * run on your machine. So a POST that carries an `Origin` is only accepted when
 * that origin is localhost. Non-browser callers (the CLI, curl) send no Origin and
 * are unaffected.
 */
function originIsLocal(req: http.IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) {
    return true; // no browser origin → not a cross-site request
  }
  try {
    const host = new URL(origin).hostname;
    return host === '127.0.0.1' || host === 'localhost' || host === '::1';
  } catch {
    return false;
  }
}

/** Read a request body to a string, rejecting once it exceeds MAX_BODY_BYTES. */
function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    let done = false;
    req.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        done = true;
        reject(new Error('BODY_TOO_LARGE'));
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      if (!done) resolve(body);
    });
    req.on('error', (error) => {
      if (!done) {
        done = true;
        reject(error);
      }
    });
  });
}

/** Shared preamble for the POST handlers: reject foreign origins (403) and
 *  oversized bodies (413), otherwise return the parsed JSON (or null on bad JSON). */
async function readMutation(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<Record<string, unknown> | undefined> {
  if (!originIsLocal(req)) {
    sendJson(res, { error: 'forbidden' }, 403);
    return undefined;
  }
  let body: string;
  try {
    body = await readBody(req);
  } catch {
    sendJson(res, { error: 'request body too large' }, 413);
    return undefined;
  }
  try {
    return body ? (JSON.parse(body) as Record<string, unknown>) : {};
  } catch {
    return {}; // malformed JSON → treat as empty; handlers apply their own defaults
  }
}

async function triggerRun(req: http.IncomingMessage, res: http.ServerResponse) {
  const parsed = await readMutation(req, res);
  if (!parsed) return;
  const mode: ModelMode = parsed.mode === 'openai' ? 'openai' : 'mock';
  // Fire-and-forget: events stream over SSE; failures surface as a decision event.
  runDemoWithServer({ mode, model: undefined, baseUrl: 'http://127.0.0.1:3000' }).catch((error) => {
    console.error('Live run failed:', error);
  });
  sendJson(res, { started: true, mode }, 202);
}

async function triggerStory(req: http.IncomingMessage, res: http.ServerResponse) {
  const parsed = await readMutation(req, res);
  if (!parsed) return;
  try {
    const project = await getProject(parsed.projectId as string);
    if (!project || !parsed.body) {
      return sendJson(res, { error: 'projectId and body are required' }, 400);
    }
    const story = await addStory({
      projectId: project.id,
      source: 'upload',
      title: (parsed.title as string) || String(parsed.body).trim().slice(0, 60),
      body: parsed.body as string
    });
    sendJson(res, { started: true, storyId: story.id }, 202);
    // The 202 is sent: from here on a failure (e.g. the demo server not coming
    // up) must only be logged — attempting another response would throw on the
    // finished stream and crash the process.
    try {
      // testpilot manages the demo app; connected projects run their own dev server.
      const appServer = project.id === 'demo' ? await startDemoServer() : undefined;
      try {
        await runStoryPipeline(project, story, { mode: 'mock' });
      } finally {
        if (appServer) {
          stopProcessTree(appServer.pid);
        }
      }
    } catch (error) {
      console.error('Story run failed:', error);
    }
  } catch (error) {
    sendJson(res, { error: String(error) }, 500);
  }
}

async function triggerDocs(req: http.IncomingMessage, res: http.ServerResponse) {
  const parsed = await readMutation(req, res);
  if (!parsed) return;
  try {
    const project = await getProject(parsed.projectId as string);
    if (!project) {
      return sendJson(res, { error: 'unknown project' }, 400);
    }
    const result = await generateDocs(project);
    sendJson(res, result);
  } catch (error) {
    sendJson(res, { error: String(error) }, 500);
  }
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
  // Boundary check with a trailing separator so a sibling dir that merely shares
  // the prefix (e.g. `ui/dist-evil`) cannot satisfy it.
  if (resolved !== uiDist && !resolved.startsWith(uiDist + path.sep)) {
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
  if (res.headersSent) {
    // The response already went out (e.g. an error surfaced after a 202);
    // writing headers again would throw — and, from the server's top-level
    // catch, become an unhandled rejection that kills the process.
    return;
  }
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
