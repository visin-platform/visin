import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// Run after building frontend-core and shell-front. Uses only local fake APIs.
const dist = fileURLToPath(new URL('../apps/frontend/shell-front/dist', import.meta.url));
let webOrigin, apiOrigin;
const payloads = [];
const traceparents = new Map();
const api = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', webOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'traceparent,tracestate,content-type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  traceparents.set(req.url, req.headers.traceparent);
  res.setHeader('Content-Type', 'application/json');
  res.end('{"ok":true}');
});
const web = createServer(async (req, res) => {
  if (req.url === '/collect') {
    let body = '';
    for await (const chunk of req) body += chunk;
    payloads.push(JSON.parse(body));
    res.writeHead(202);
    res.end();
    return;
  }
  if (req.url === '/config.json') {
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        FARO_COLLECTOR_URL: `${webOrigin}/collect`,
        VISION_API_URL: `${apiOrigin}/api`
      })
    );
    return;
  }
  try {
    const path = req.url.split('?')[0];
    const file = path === '/' || path === '/monitoring-smoke' ? 'index.html' : path;
    const target = resolve(join(dist, file));
    if (!target.startsWith(dist + '/')) {
      res.writeHead(404);
      res.end();
      return;
    }
    const bytes = await readFile(target);
    res.setHeader(
      'Content-Type',
      extname(file) === '.js' ? 'application/javascript' : extname(file) === '.css' ? 'text/css' : 'text/html'
    );
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => web.listen(0, '127.0.0.1', r));
await new Promise((r) => api.listen(0, '127.0.0.1', r));
webOrigin = `http://127.0.0.1:${web.address().port}`;
apiOrigin = `http://127.0.0.1:${api.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto(`${webOrigin}/monitoring-smoke`);
  await page.waitForFunction(() => window.__visinObservabilityV1?.faro);
  await page.evaluate(async (url) => {
    const res = await fetch(url);
    await res.json();
  }, `${apiOrigin}/api/projects/private?token=secret`);
  await page.evaluate(
    (url) =>
      new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url);
        xhr.onload = resolve;
        xhr.onerror = reject;
        xhr.send();
      }),
    `${apiOrigin}/api/datasets/private?token=secret`
  );
  // An uncaught error: its message must arrive readable but scrubbed, with frames for the maps.
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error("Project 'secret-plan' failed at https://x.test/p?token=secret");
    });
  });
  await page.waitForTimeout(4500);
  const events = payloads.flatMap((x) => x.events ?? []);
  const event = events.find((e) => e.name === 'api_request' && e.attributes.operation === '/api/projects/:id');
  if (!event) throw new Error('No API event: ' + JSON.stringify(payloads));
  const traceparent = traceparents.get('/api/projects/private?token=secret');
  if (!traceparent || traceparent.split('-')[1] !== event.trace.trace_id)
    throw new Error('Browser/header trace IDs differ: ' + JSON.stringify({ traceparent, event }));
  const xhrEvent = events.find((e) => e.name === 'api_request' && e.attributes.operation === '/api/datasets/:id');
  const xhrParent = traceparents.get('/api/datasets/private?token=secret');
  if (!xhrEvent || !xhrParent || xhrParent.split('-')[1] !== xhrEvent.trace.trace_id)
    throw new Error('XHR measurement or trace propagation missing');
  if (event.attributes.method !== 'GET') throw new Error('Incorrect HTTP method');
  if (!events.some((e) => e.name === 'page_view')) throw new Error('No page view');
  if (events.some((e) => e.name.startsWith('faro.tracing.'))) throw new Error('Span-mirror events were sent');
  const exception = payloads.flatMap((x) => x.exceptions ?? [])[0];
  if (exception?.value !== "Project '<str>' failed at <url>")
    throw new Error('Exception message not scrubbed as expected: ' + JSON.stringify(exception));
  if (!exception.stacktrace?.frames?.some((f) => f.lineno && f.colno))
    throw new Error('Exception has no frame positions for source maps');
  const spans = payloads
    .flatMap((x) => x.traces?.resourceSpans ?? [])
    .flatMap((x) => x.scopeSpans ?? [])
    .flatMap((x) => x.spans ?? []);
  if (!spans.length) throw new Error('No exported trace spans');
  const raw = JSON.stringify(payloads);
  const leak = raw.search(/secret-plan|token=secret|\/projects\/private|\/datasets\/private/);
  if (leak >= 0) throw new Error('Private text leaked: ' + raw.slice(Math.max(0, leak - 200), leak + 100));
  console.log(
    'PASS: Chromium fetch/XHR emit API duration, page view and spans; propagated trace ID matches API event; raw URLs are redacted; an uncaught error arrives scrubbed with frame positions.'
  );
} finally {
  await browser?.close();
  await new Promise((r) => web.close(r));
  await new Promise((r) => api.close(r));
}
