/**
 * Renders still images of the showcase properties for the gallery and the landing page.
 *
 * For each property in the catalogue it renders the exterior and the first two room views (the
 * stills the gallery and the landing page use): it opens
 * `visualiser.html?property=<id>&view=<view>&still=1` in headless Chrome, waits for
 * `window.__amcoReady`, and saves a 1600×1000 WebP to
 * `website/assets/img/stills/<property>-<view with ':' replaced by '-'>.webp`.
 *
 * Usage: node tools/render-stills.mjs [--property <id>] [--view <id>] [--all] [--light day|warm|cool]
 *                                     [--width 1600] [--height 1000] [--gpu] [--out <dir>]
 * `--all` renders every view of each property (dollhouse and every room); `--view` renders one.
 * `--out` writes the stills to another folder (for trial renders) instead of the site's stills folder.
 * The script serves the repository itself on a free local port. Without --gpu Chrome renders
 * with SwiftShader, which is slow (about a minute per still) but works on any machine.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile, rm, mkdtemp } from 'node:fs/promises';
import { join, extname, normalize, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT_DIR = join(ROOT, 'website', 'assets', 'img', 'stills');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const READY_TIMEOUT_MS = 6 * 60 * 1000;

/**
 * Reads `--name value` pairs and `--flag` switches.
 * @param {string[]} argv
 * @returns {{ property: string|null, view: string|null, all: boolean, light: string|null, width: number, height: number, gpu: boolean, out: string }}
 */
function parseArgs(argv) {
  const value = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
  };
  return {
    property: value('property'),
    view: value('view'),
    all: argv.includes('--all'),
    light: value('light'),
    width: Number(value('width')) || 1600,
    height: Number(value('height')) || 1000,
    gpu: argv.includes('--gpu'),
    out: value('out') ? resolve(value('out')) : OUT_DIR
  };
}

/**
 * Serves the repository root over HTTP on a free port.
 * @returns {Promise<{ port: number, close: () => void }>}
 */
function serve() {
  const server = createServer(async (req, res) => {
    try {
      let file = normalize(join(ROOT, decodeURIComponent(new URL(req.url, 'http://localhost').pathname)));
      if (!file.startsWith(ROOT)) throw new Error('outside root');
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  return new Promise((done) => {
    server.listen({ port: 0, host: '127.0.0.1', backlog: 1024 }, () => done({ port: server.address().port, close: () => server.close() }));
  });
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * Starts headless Chrome and connects to its first page over the DevTools protocol.
 * @returns {Promise<{ send: (method: string, params?: object) => Promise<object>, close: () => Promise<void> }>}
 */
async function launch(width, height, gpu) {
  const port = 9400 + Math.floor(Math.random() * 400);
  const profile = await mkdtemp(join(tmpdir(), 'amco-stills-'));
  const flags = ['--headless=new', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`, '--no-first-run', '--no-default-browser-check'];
  if (!gpu) flags.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  const chrome = spawn(CHROME, [...flags, 'about:blank'], { stdio: 'ignore' });
  let page = null;
  for (let i = 0; i < 100 && !page; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      page = list.find((t) => t.type === 'page') || null;
    } catch {
      await sleep(200);
    }
  }
  if (!page) throw new Error('Chrome did not start');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((done) => ws.addEventListener('open', done, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { ok, fail } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) fail(new Error(msg.error.message));
      else ok(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      process.stderr.write(`  page error: ${msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text}\n`);
    }
  });
  const send = (method, params = {}) => new Promise((ok, fail) => {
    id += 1;
    pending.set(id, { ok, fail });
    ws.send(JSON.stringify({ id, method, params }));
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  return {
    send,
    async close() {
      ws.close();
      chrome.kill();
      await sleep(500);
      await rm(profile, { recursive: true, force: true }).catch(() => {});
    }
  };
}

/**
 * Evaluates an expression in the page and returns its value.
 */
async function evaluate(send, expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}

/** Room views rendered by default for each property. */
const DEFAULT_ROOMS = 2;

/**
 * View ids to render for a catalogue entry: one view, every view, or the exterior and the first
 * two rooms.
 * @param {{ views?: { id: string }[] }} entry
 * @param {{ view: string|null, all: boolean }} args
 * @returns {string[]}
 */
function viewsFor(entry, args) {
  const ids = (entry.views || []).map((v) => v.id);
  if (args.view) return ids.filter((id) => id === args.view);
  if (args.all) return ids;
  return [...ids.filter((id) => id === 'exterior'), ...ids.filter((id) => id.startsWith('room:')).slice(0, DEFAULT_ROOMS)];
}

/**
 * Renders every requested still.
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { CATALOGUE } = await import(pathToFileURL(join(ROOT, 'website', 'assets', 'app', 'properties', 'index.js')).href);
  const properties = CATALOGUE.filter((entry) => !args.property || entry.id === args.property);
  if (!properties.length) {
    process.stderr.write(args.property ? `No property "${args.property}" in the catalogue.\n` : 'The catalogue is empty.\n');
    process.exit(1);
  }
  await mkdir(args.out, { recursive: true });
  const server = await serve();
  const chrome = await launch(args.width, args.height, args.gpu);
  let failures = 0;
  let attempt = 0;
  try {
    for (const entry of properties) {
      const views = viewsFor(entry, args);
      for (const view of views) {
        attempt += 1;
        const query = new URLSearchParams({ property: entry.id, view, still: '1', shot: String(attempt) });
        if (args.light) query.set('light', args.light);
        const url = `http://127.0.0.1:${server.port}/website/visualiser.html?${query}`;
        const started = Date.now();
        await chrome.send('Page.navigate', { url });
        const check = `window.__amcoReady === true && new URLSearchParams(location.search).get('shot') === '${attempt}'`;
        let ready = false;
        while (!ready && Date.now() - started < READY_TIMEOUT_MS) {
          await sleep(500);
          ready = await evaluate(chrome.send, check).catch(() => false);
        }
        const error = ready ? await evaluate(chrome.send, 'window.__amcoError || null') : 'timed out';
        if (error) {
          failures += 1;
          process.stderr.write(`✗ ${entry.id} ${view}: ${error}\n`);
          continue;
        }
        const shot = await chrome.send('Page.captureScreenshot', { format: 'webp', quality: 88 });
        const name = `${entry.id}-${view.replace(/:/g, '-')}.webp`;
        await writeFile(join(args.out, name), Buffer.from(shot.data, 'base64'));
        process.stdout.write(`✓ ${name} (${Math.round((Date.now() - started) / 1000)} s)\n`);
      }
    }
  } finally {
    await chrome.close();
    server.close();
  }
  if (failures) process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exit(1);
});
