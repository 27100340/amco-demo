import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const MOBILE_MAX_WIDTH = 800;
const MOBILE_SCALE = 2;
const DEFAULT_WAIT_MS = 2500;
const MAX_FULL_HEIGHT = 16000;
const START_TIMEOUT_MS = 15000;
const LOAD_TIMEOUT_MS = 30000;

const USAGE = 'Usage: node tools/screenshot.mjs <url> <out.png> [width=1440] [height=900] [--full] [--wait=ms] [--eval=js]\n';

/**
 * Parse CLI arguments.
 * @param {string[]} argv arguments after the script name
 * @returns {{ url: string, out: string, width: number, height: number, full: boolean, wait: number, evalJs: string|null } | null} options, or null when arguments are missing
 */
function parseArgs(argv) {
  const flags = argv.filter((arg) => arg.startsWith('--'));
  const [url, out, width, height] = argv.filter((arg) => !arg.startsWith('--'));
  if (!url || !out) { return null; }
  const flag = (name) => {
    const found = flags.find((arg) => arg.startsWith(`--${name}=`));
    return found ? found.slice(name.length + 3) : null;
  };
  const wait = flag('wait');
  return {
    url,
    out: resolve(out),
    width: Number(width) || 1440,
    height: Number(height) || 900,
    full: flags.includes('--full'),
    wait: wait === null ? DEFAULT_WAIT_MS : Number(wait),
    evalJs: flag('eval')
  };
}

/**
 * Resolve after a delay.
 * @param {number} ms milliseconds
 * @returns {Promise<void>} resolves after the delay
 */
function sleep(ms) { return new Promise((done) => setTimeout(done, ms)); }

/**
 * Wait for Chrome to write its DevToolsActivePort file and return the port.
 * @param {string} profile user data dir
 * @returns {Promise<number>} the debugging port
 */
async function waitForPort(profile) {
  const file = join(profile, 'DevToolsActivePort');
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (existsSync(file)) {
      const port = Number(readFileSync(file, 'utf8').split('\n')[0]);
      if (port) { return port; }
    }
    await sleep(100);
  }
  throw new Error('Chrome did not start');
}

/**
 * Open a CDP session on the first page target.
 * @param {number} port debugging port
 * @returns {Promise<{ send: (method: string, params?: object) => Promise<object>, once: (method: string) => Promise<void>, close: () => void }>} session helpers
 */
async function connect(port) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find((target) => target.type === 'page');
  if (!page) { throw new Error('No page target'); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((done, fail) => {
    ws.addEventListener('open', done);
    ws.addEventListener('error', () => fail(new Error('WebSocket failed')));
  });
  let nextId = 0;
  const pending = new Map();
  const waiters = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve: done, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) { reject(new Error(msg.error.message)); } else { done(msg.result); }
    } else if (msg.method && waiters.has(msg.method)) {
      waiters.get(msg.method)();
      waiters.delete(msg.method);
    }
  });
  return {
    send: (method, params = {}) => new Promise((done, reject) => {
      nextId += 1;
      pending.set(nextId, { resolve: done, reject });
      ws.send(JSON.stringify({ id: nextId, method, params }));
    }),
    once: (method) => new Promise((done, reject) => {
      waiters.set(method, done);
      setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), LOAD_TIMEOUT_MS);
    }),
    close: () => ws.close()
  };
}

/**
 * Drive Chrome and write the screenshot.
 * @param {NonNullable<ReturnType<typeof parseArgs>>} options parsed options
 * @param {string} profile user data dir
 * @returns {Promise<void>} resolves once the PNG is written
 */
async function capture(options, profile) {
  const session = await connect(await waitForPort(profile));
  const { send } = session;
  const mobile = options.width < MOBILE_MAX_WIDTH;
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: options.width,
    height: options.height,
    deviceScaleFactor: mobile ? MOBILE_SCALE : 1,
    mobile
  });
  if (mobile) { await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); }
  const loaded = session.once('Page.loadEventFired');
  const nav = await send('Page.navigate', { url: options.url });
  if (nav.errorText) { throw new Error(`Navigation failed: ${nav.errorText}`); }
  await loaded;
  await sleep(options.wait);
  if (options.evalJs) {
    const result = await send('Runtime.evaluate', { expression: options.evalJs, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) { throw new Error(`--eval failed: ${result.exceptionDetails.text}`); }
    await sleep(options.wait);
  }
  const metrics = await send('Runtime.evaluate', {
    expression: 'JSON.stringify({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight })',
    returnByValue: true
  });
  const size = JSON.parse(metrics.result.value);
  process.stdout.write(`scrollWidth=${size.w} scrollHeight=${size.h}\n`);
  const params = { format: 'png' };
  if (options.full) {
    const layout = await send('Page.getLayoutMetrics');
    const content = layout.cssContentSize || layout.contentSize;
    params.captureBeyondViewport = true;
    params.clip = { x: 0, y: 0, width: options.width, height: Math.min(Math.ceil(content.height), MAX_FULL_HEIGHT), scale: 1 };
  }
  const image = await send('Page.captureScreenshot', params);
  writeFileSync(options.out, Buffer.from(image.data, 'base64'));
  session.close();
}

/**
 * Run the tool.
 * @returns {Promise<number>} process exit code
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options) {
    process.stderr.write(USAGE);
    return 2;
  }
  rmSync(options.out, { force: true });
  const profile = mkdtempSync(join(tmpdir(), 'amco-shot-'));
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--hide-scrollbars',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    `--window-size=${options.width},${options.height}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ], { stdio: 'ignore' });
  let code = 0;
  try {
    await capture(options, profile);
  } catch (error) {
    process.stderr.write(`Screenshot failed: ${error.message}\n`);
    code = 1;
  }
  spawnSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' });
  await sleep(1500);
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (error) {
    process.stderr.write(`Could not remove temp profile ${profile}: ${error.code}
`);
  }
  if (code === 0 && !existsSync(options.out)) { code = 1; }
  if (code === 0) { process.stdout.write(`${options.out}\n`); }
  return code;
}

process.exit(await main());
