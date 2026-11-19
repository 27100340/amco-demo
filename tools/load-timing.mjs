/**
 * Load-time harness for the 3D visualiser. Drives headless Chrome over the DevTools protocol and
 * reads the engine's `amco:*` User Timing entries (see website/assets/app/engine/load-timing.js).
 *
 * Usage:
 *   node tools/load-timing.mjs [--flow load|sample|switch|frames] [--property <id>[,<id>...]]
 *     [--tier high,medium|auto] [--runs 3] [--port 8767] [--width 1440] [--height 900]
 *     [--swiftshader] [--warm] [--network broadband] [--json <file>] [--timeline]
 *     [--profile <file>] [--pause <ms>]
 *
 * Flows:
 *   load    (default) opens visualiser.html?property=<id>&quality=<tier>#studio and times every load
 *           step: module load, property data, renderer and lighting set-up, procedural textures,
 *           building compile (walls, floors, slabs, kits, site; textures made inside each step are
 *           counted under textures; textures drawn in the texture workers are a separate column,
 *           the sum of their worker times, which overlap the page's work), shader compile (with the texture uploads and the one-pixel
 *           warm-up that draws the shadow map and the sky), the first frame's shadow map (when the
 *           warm-up did not draw it), the first frame on screen, furniture streamed in after it, and
 *           full ready (all background work done).
 *           `--tier auto` lets the engine choose.
 *   sample  my-property.html: Load the sample project, Build, then Paint in 3D, timed to the first
 *           frame of the 3D step (quality chosen by the engine).
 *   switch  tools/dev/engine.html with the studio: as soon as the model is shown, switches to the
 *           dollhouse and then to a room, and reports each switch's longest frame gap (a stall)
 *           and how long until the picture settles.
 *   frames  tools/dev/engine.html: steady frame time (one render plus a 1-pixel read-back, which
 *           waits for the GPU) in the exterior, dollhouse and first room views, median of 30.
 *
 * Every run starts a fresh Chrome with an empty profile (no HTTP or GPU program cache), on the
 * real GPU unless `--swiftshader`; `--warm` reuses one Chrome for all runs of a property and tier,
 * like a returning visitor. `--network broadband` throttles to 20 ms latency and 25/5 Mbit/s.
 * Tables of medians are printed; `--json` also writes every run; `--timeline` prints each load run's
 * `amco:` entries in start order (start and duration in ms), to see what sits before the first frame;
 * `--pause <ms>` waits that long before each run, so the CPU is back at its resting clock (one visitor
 * loading one page, rather than back-to-back loads that use up a laptop's turbo budget);
 * `--profile <file>` saves a CPU profile of each load run's page thread up to its first frame
 * (`<file>` with the run number added; open it in the DevTools Performance panel). The server is
 * `node tools/serve.mjs <port>`, started here when nothing answers on the port.
 * Run one harness (one Chrome) at a time.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const START_TIMEOUT_MS = 20000;
const LOAD_TIMEOUT_MS = 180000;
const SETTLE_MS = 1500;
const POLL_MS = 100;
const SWITCH_WATCH_MS = 4000;
const FRAME_SAMPLES = 30;
/** my-property: the page finishes starting (storage) after its buttons show; a click before that does nothing. */
const SAMPLE_SETTLE_MS = 1500;
const SAMPLE_ATTEMPTS = 3;
const SAMPLE_TIMEOUT_MS = 30000;
const BROADBAND = { offline: false, latency: 20, downloadThroughput: (25 * 1024 * 1024) / 8, uploadThroughput: (5 * 1024 * 1024) / 8 };

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * Reads `--name value` pairs and `--flag` switches.
 * @param {string[]} argv
 * @returns {object} options
 */
function parseArgs(argv) {
  const value = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
  };
  return {
    flow: value('flow', 'load'),
    properties: value('property', '') ? value('property', '').split(',') : null,
    tiers: value('tier', 'high,medium').split(','),
    runs: Number(value('runs', 3)) || 3,
    port: Number(value('port', 8767)) || 8767,
    width: Number(value('width', 1440)) || 1440,
    height: Number(value('height', 900)) || 900,
    gpu: !argv.includes('--swiftshader'),
    warm: argv.includes('--warm'),
    network: value('network', null),
    json: value('json', null),
    timeline: argv.includes('--timeline'),
    profile: value('profile', null),
    pause: Number(value('pause', 0)) || 0
  };
}

/**
 * Starts `tools/serve.mjs` on the port unless something already answers there.
 * @param {number} port
 * @returns {Promise<() => void>} stops the server when this harness started it
 */
async function ensureServer(port) {
  const up = async () => {
    try {
      return (await fetch(`http://127.0.0.1:${port}/website/visualiser.html`, { method: 'HEAD' })).ok;
    } catch {
      return false;
    }
  };
  if (await up()) return () => {};
  const server = spawn(process.execPath, [join(ROOT, 'tools', 'serve.mjs'), String(port)], { stdio: 'ignore' });
  for (let i = 0; i < 50 && !(await up()); i++) await sleep(100);
  return () => server.kill();
}

/**
 * Starts headless Chrome with an empty profile and connects to its page.
 * @param {{ width: number, height: number, gpu: boolean, network: string|null }} options
 * @returns {Promise<{ send: Function, evaluate: Function, close: () => Promise<void> }>}
 */
async function launch({ width, height, gpu, network }) {
  const profile = mkdtempSync(join(tmpdir(), 'amco-timing-'));
  const flags = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--hide-scrollbars',
    `--window-size=${width},${height}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu-shader-disk-cache',
    // A new profile's own background work (updates, sync, extensions) would compete with the page.
    '--disable-background-networking', '--disable-component-update', '--disable-extensions', '--disable-sync',
    '--disable-default-apps', '--metrics-recording-only'];
  if (!gpu) flags.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  const chrome = spawn(CHROME, [...flags, 'about:blank'], { stdio: 'ignore' });
  const portFile = join(profile, 'DevToolsActivePort');
  let port = 0;
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (!port && Date.now() < deadline) {
    try {
      if (existsSync(portFile)) port = Number(readFileSync(portFile, 'utf8').split('\n')[0]) || 0;
    } catch {
      port = 0;
    }
    if (!port) await sleep(100);
  }
  if (!port) throw new Error('Chrome did not start');
  let page = null;
  while (!page && Date.now() < deadline) {
    try {
      page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page') || null;
    } catch {
      await sleep(100);
    }
  }
  if (!page) throw new Error('No page target');
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
      const details = msg.params.exceptionDetails;
      process.stderr.write(`  page error: ${details.exception?.description || details.text}\n`);
    }
  });
  const send = (method, params = {}) => new Promise((ok, fail) => {
    id += 1;
    pending.set(id, { ok, fail });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  if (network === 'broadband') await send('Network.emulateNetworkConditions', BROADBAND);
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  return {
    send,
    evaluate,
    async close() {
      ws.close();
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' });
      else chrome.kill();
      await sleep(1500);
      try {
        rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
      } catch {
        process.stderr.write(`Could not remove the temporary profile ${profile}\n`);
      }
    }
  };
}

/**
 * Polls a page expression until it is truthy.
 * @returns {Promise<void>}
 */
async function waitFor(evaluate, expression, timeout = LOAD_TIMEOUT_MS) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(expression).catch(() => false)) return;
    await sleep(POLL_MS);
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

/** Page expression: the `amco:` entries, the navigation timing and the GPU in use. */
const COLLECT = `(() => {
  const entries = performance.getEntries().filter((e) => e.name.startsWith('amco:')).map((e) => ({
    name: e.name.slice(5), type: e.entryType, start: e.startTime, duration: e.duration, detail: e.detail ?? null
  }));
  const nav = performance.getEntriesByType('navigation')[0];
  const gl = document.createElement('canvas').getContext('webgl2');
  const info = gl && gl.getExtension('WEBGL_debug_renderer_info');
  return {
    entries,
    domContentLoaded: nav ? nav.domContentLoadedEventEnd : null,
    gpu: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null
  };
})()`;

/** Page expression: true once a mark exists. */
const hasMark = (name) => `performance.getEntriesByName('amco:${name}').length > 0`;

/**
 * Turns the collected entries into one row of step times (ms).
 * Compile steps are exclusive of the procedural textures generated inside them.
 * @param {{ entries: object[] }} data
 * @param {number} [origin=0] time the timed flow started (page time)
 * @returns {object}
 */
function summarise(data, origin = 0) {
  const all = data.entries;
  const firstLoad = all.filter((e) => e.name === 'load-start').map((e) => e.start).find((t) => t >= origin) ?? origin;
  const entries = all.filter((e) => e.start >= Math.min(origin, firstLoad) - 1);
  const mark = (name) => {
    const found = entries.find((e) => e.name === name && e.type === 'mark' && e.start >= origin);
    return found ? found.start - origin : null;
  };
  const textures = entries.filter((e) => e.name.startsWith('texture:'));
  const workerTextures = entries.filter((e) => e.name.startsWith('texture-worker:') && e.start < (mark('first-frame') ?? Infinity) + origin);
  const inside = (span) => textures.filter((t) => t.start >= span.start && t.start + t.duration <= span.start + span.duration + 0.01)
    .reduce((sum, t) => sum + t.duration, 0);
  const total = (name, exclusive = false) => {
    const spans = entries.filter((e) => e.name === name && e.type === 'measure');
    if (!spans.length) return null;
    return spans.reduce((sum, span) => sum + span.duration - (exclusive ? inside(span) : 0), 0);
  };
  const shadow = entries.find((e) => e.name === 'shadow-map');
  const loadStart = entries.find((e) => e.name === 'load-start');
  const fullReady = mark('full-ready');
  return {
    tier: loadStart && loadStart.detail ? loadStart.detail.tier : null,
    modules: mark('page-modules'),
    propertyData: mark('property-data'),
    renderer: total('renderer'),
    lighting: total('lighting'),
    loadStart: mark('load-start'),
    textures: textures.reduce((sum, t) => sum + t.duration, 0),
    textureCount: textures.length,
    workerTextures: workerTextures.length ? workerTextures.reduce((sum, t) => sum + t.duration, 0) : null,
    compile: total('compile', true),
    surfaces: total('compile:surfaces', true),
    walls: total('compile:walls', true),
    floors: total('compile:floors', true),
    slabs: total('compile:slabs', true),
    kits: total('compile:kits', true),
    site: total('compile:site', true),
    shaderCompile: total('shader-compile'),
    shadowMap: shadow ? shadow.duration : null,
    warmUp: total('warm-up'),
    firstRender: total('first-render'),
    firstFrame: mark('first-frame'),
    studioReady: mark('studio-ready'),
    streamed: total('stream-fixtures'),
    fullReady
  };
}

/** Median of the finite numbers in a list (null when none). */
function median(values) {
  const list = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!list.length) return null;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
}

/**
 * Prints a markdown table of medians: one row per group, one column per key.
 * @param {string} title
 * @param {{ label: string, runs: object[] }[]} groups
 * @param {[string, string][]} columns key and heading
 */
function printTable(title, groups, columns) {
  const cell = (v) => (v === null || v === undefined ? '–' : typeof v === 'number' ? String(Math.round(v)) : String(v));
  const lines = [`\n${title}`, `| run | ${columns.map(([, h]) => h).join(' | ')} |`, `|---|${columns.map(() => '---:').join('|')}|`];
  for (const group of groups) {
    const row = columns.map(([key]) => {
      const values = group.runs.map((r) => r[key]);
      return typeof values[0] === 'string' ? values[0] : cell(median(values));
    });
    lines.push(`| ${group.label} (n=${group.runs.length}) | ${row.join(' | ')} |`);
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}

const LOAD_COLUMNS = [
  ['tier', 'tier'], ['modules', 'modules'], ['propertyData', 'property data'], ['renderer', 'renderer'], ['lighting', 'lighting'],
  ['textures', 'textures'], ['workerTextures', 'textures in workers (before first frame)'], ['compile', 'compile'], ['walls', 'walls'], ['floors', 'floors'], ['slabs', 'slabs'], ['kits', 'kits'],
  ['site', 'site'], ['shaderCompile', 'shader compile'], ['warmUp', 'warm-up (shadow map, sky)'], ['shadowMap', 'shadow map (CPU)'], ['firstRender', 'first render (CPU)'],
  ['firstFrame', 'first frame'], ['streamed', 'furniture streaming (after)'], ['fullReady', 'full ready']
];

/**
 * Times a visualiser load (and profiles it up to the first frame when `profile` names a file).
 * @returns {Promise<object>} the row for this run
 */
async function loadRun(chrome, base, property, tier, profile = null) {
  const query = new URLSearchParams({ property });
  if (tier !== 'auto') query.set('quality', tier);
  if (profile) {
    await chrome.send('Profiler.enable');
    await chrome.send('Profiler.setSamplingInterval', { interval: 200 });
    await chrome.send('Profiler.start');
  }
  await chrome.send('Page.navigate', { url: `${base}/website/visualiser.html?${query}#studio` });
  await sleep(200);
  await waitFor(chrome.evaluate, hasMark('first-frame'));
  if (profile) writeFileSync(resolve(profile), JSON.stringify((await chrome.send('Profiler.stop')).profile));
  await waitFor(chrome.evaluate, `${hasMark('studio-ready')} && ${hasMark('full-ready')}`);
  await sleep(SETTLE_MS);
  const data = await chrome.evaluate(COLLECT);
  return { property, gpu: data.gpu, entries: data.entries, ...summarise(data) };
}

/**
 * Prints a run's entries in start order.
 * @param {object[]} entries
 */
function printTimeline(entries) {
  const lines = [...entries].sort((a, b) => a.start - b.start)
    .map((e) => `  ${String(Math.round(e.start)).padStart(6)} ${e.type === 'measure' ? `+${Math.round(e.duration)}`.padStart(6) : '      '} ${e.name}`);
  process.stdout.write(`${lines.join('\n')}\n`);
}

/**
 * Times the my-property sample flow: Load the sample project, Build, Paint in 3D.
 * @returns {Promise<object>} the row for this run
 */
async function sampleRun(chrome, base) {
  const now = () => chrome.evaluate('performance.now()');
  await chrome.send('Page.navigate', { url: `${base}/website/my-property.html` });
  await waitFor(chrome.evaluate, `(() => { const b = document.querySelector('[data-load-sample]'); return b && !b.disabled && b.offsetParent !== null; })()`);
  await sleep(SAMPLE_SETTLE_MS);
  const buildReady = `(() => { const b = document.querySelector('[data-build]'); return b && !b.disabled && b.offsetParent !== null; })()`;
  let t0 = 0;
  for (let attempt = 0; attempt < SAMPLE_ATTEMPTS; attempt++) {
    t0 = await now();
    await chrome.evaluate(`document.querySelector('[data-load-sample]').click(), true`);
    try {
      await waitFor(chrome.evaluate, buildReady, SAMPLE_TIMEOUT_MS);
      break;
    } catch (error) {
      if (attempt === SAMPLE_ATTEMPTS - 1) throw error;
    }
  }
  const t1 = await now();
  await chrome.evaluate(`document.querySelector('[data-build]').click(), true`);
  const paintButton = `[...document.querySelectorAll('[data-step="review"] [data-go="paint"]')].find((b) => b.offsetParent !== null)`;
  await waitFor(chrome.evaluate, `Boolean(${paintButton}) && !document.querySelector('[data-build]').closest('[aria-busy="true"]')`);
  const t2 = await now();
  await chrome.evaluate(`${paintButton}.click(), true`);
  await waitFor(chrome.evaluate, hasMark('first-frame'));
  await waitFor(chrome.evaluate, hasMark('studio-ready'));
  await sleep(SETTLE_MS);
  const data = await chrome.evaluate(COLLECT);
  const steps = summarise(data, t2);
  return {
    property: 'sample house',
    gpu: data.gpu,
    tier: steps.tier,
    sampleLoaded: t1 - t0,
    built: t2 - t1,
    paintToFirstFrame: steps.firstFrame,
    paintToFullReady: steps.fullReady,
    textures: steps.textures,
    compile: steps.compile,
    shaderCompile: steps.shaderCompile,
    total: t2 - t0 + (steps.firstFrame ?? 0)
  };
}

const SAMPLE_COLUMNS = [
  ['tier', 'tier'], ['sampleLoaded', 'load sample → Build enabled'], ['built', 'Build → review'], ['textures', 'textures'],
  ['compile', 'compile'], ['shaderCompile', 'shader compile'], ['paintToFirstFrame', 'Paint → first frame'],
  ['paintToFullReady', 'Paint → full ready'], ['total', 'total to first frame']
];

/** Page expression that switches view and watches frames: longest rAF gap and time to settle. */
const watchSwitch = (view) => `new Promise((done) => {
  const viewer = window.__viewer;
  const { renderer } = viewer.internals();
  const start = performance.now();
  let last = start;
  let gap = 0;
  let settled = start;
  let frames = renderer.info.render.frame;
  const tick = (now) => {
    gap = Math.max(gap, now - last);
    last = now;
    if (renderer.info.render.frame !== frames) {
      frames = renderer.info.render.frame;
      settled = now;
    }
    if (now - start < ${SWITCH_WATCH_MS}) requestAnimationFrame(tick);
    else done({ view: '${view}', longestGap: gap, settle: settled - start, mode: viewer.getView().mode });
  };
  viewer.setView('${view}');
  requestAnimationFrame(tick);
})`;

/**
 * First switches to the dollhouse and a room, as soon as the model is shown.
 * @returns {Promise<object>} the row for this run
 */
async function switchRun(chrome, base, property, tier) {
  await chrome.send('Page.navigate', { url: `${base}/tools/dev/engine.html?property=${property}&studio=1&quality=${tier === 'auto' ? 'high' : tier}&clean=1` });
  await waitFor(chrome.evaluate, 'Boolean(window.__viewer)');
  const shownAt = await chrome.evaluate(`performance.getEntriesByName('amco:first-frame')[0]?.startTime ?? null`);
  const exposedAt = await chrome.evaluate('performance.now()');
  const room = await chrome.evaluate(`(() => { const b = document.querySelector('[data-view^="room:"]'); return b ? b.dataset.view : null; })()`);
  const doll = await chrome.evaluate(watchSwitch('dollhouse'));
  const inRoom = room ? await chrome.evaluate(watchSwitch(room)) : null;
  return {
    property,
    tier,
    clickAfterFirstFrame: shownAt === null ? null : exposedAt - shownAt,
    dollhouseGap: doll.longestGap,
    dollhouseSettle: doll.settle,
    room,
    roomGap: inRoom ? inRoom.longestGap : null,
    roomSettle: inRoom ? inRoom.settle : null
  };
}

const SWITCH_COLUMNS = [
  ['tier', 'tier'], ['clickAfterFirstFrame', 'first click after first frame'], ['dollhouseGap', 'dollhouse: longest frame gap'],
  ['dollhouseSettle', 'dollhouse: settled'], ['room', 'room'], ['roomGap', 'room: longest frame gap'], ['roomSettle', 'room: settled']
];

/** Page expression: median GPU-synchronised frame time of the current view. */
const FRAME_PROBE = `(async () => {
  const viewer = window.__viewer;
  const { renderer, render } = viewer.internals();
  const gl = renderer.getContext();
  const pixel = new Uint8Array(4);
  await new Promise((done) => setTimeout(done, 2500));
  await viewer.rendered();
  const times = [];
  for (let i = 0; i < ${FRAME_SAMPLES}; i++) {
    await new Promise((done) => requestAnimationFrame(done));
    const t = performance.now();
    render();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
})()`;

/**
 * Steady frame times in the exterior, dollhouse and first room views.
 * @returns {Promise<object>} the row for this run
 */
async function framesRun(chrome, base, property, tier) {
  await chrome.send('Page.navigate', { url: `${base}/tools/dev/engine.html?property=${property}&studio=1&quality=${tier === 'auto' ? 'high' : tier}&clean=1` });
  await waitFor(chrome.evaluate, 'Boolean(window.__viewer)');
  await waitFor(chrome.evaluate, hasMark('full-ready'));
  await sleep(SETTLE_MS);
  const room = await chrome.evaluate(`(() => { const b = document.querySelector('[data-view^="room:"]'); return b ? b.dataset.view : null; })()`);
  const row = { property, tier, room };
  for (const [key, view] of [['exterior', 'exterior'], ['dollhouse', 'dollhouse'], ['roomFrame', room]]) {
    if (!view) continue;
    await chrome.evaluate(`window.__viewer.setView('${view}'), true`);
    row[key] = await chrome.evaluate(FRAME_PROBE);
  }
  row.quality = await chrome.evaluate('window.__viewer.getQuality()');
  return row;
}

const FRAME_COLUMNS = [['quality', 'tier in use'], ['exterior', 'exterior ms'], ['dollhouse', 'dollhouse ms'], ['room', 'room'], ['roomFrame', 'room ms']];

/** Runs the chosen flow and prints its table. */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { CATALOGUE } = await import(pathToFileURL(join(ROOT, 'website', 'assets', 'app', 'properties', 'index.js')).href);
  const properties = args.properties || CATALOGUE.map((entry) => entry.id);
  const stopServer = await ensureServer(args.port);
  const base = `http://127.0.0.1:${args.port}`;
  const groups = [];
  try {
    const plan = args.flow === 'sample' ? [{ label: 'sample house', property: null, tier: 'auto' }]
      : properties.flatMap((property) => args.tiers.map((tier) => ({ label: `${property} ${tier}`, property, tier })));
    for (const item of plan) {
      const group = { label: item.label, runs: [] };
      groups.push(group);
      let chrome = null;
      for (let run = 0; run < args.runs; run++) {
        if (args.pause) await sleep(args.pause);
        if (!chrome || !args.warm) {
          if (chrome) await chrome.close();
          chrome = await launch(args);
        }
        try {
          let row;
          if (args.flow === 'sample') row = await sampleRun(chrome, base);
          else if (args.flow === 'switch') row = await switchRun(chrome, base, item.property, item.tier);
          else if (args.flow === 'frames') row = await framesRun(chrome, base, item.property, item.tier);
          else row = await loadRun(chrome, base, item.property, item.tier, args.profile && args.profile.replace(/(\.cpuprofile)?$/, `-${groups.length}-${run + 1}.cpuprofile`));
          const { entries, ...summary } = row;
          row = summary;
          group.runs.push(row);
          if (args.timeline && entries) printTimeline(entries);
          process.stdout.write(`${item.label} run ${run + 1}: ${JSON.stringify(row, (k, v) => (typeof v === 'number' ? Math.round(v) : v))}\n`);
        } catch (error) {
          process.stderr.write(`${item.label} run ${run + 1} failed: ${error.message}\n`);
        }
      }
      if (chrome) await chrome.close();
    }
  } finally {
    stopServer();
  }
  const columns = { sample: SAMPLE_COLUMNS, switch: SWITCH_COLUMNS, frames: FRAME_COLUMNS }[args.flow] || LOAD_COLUMNS;
  const gpu = groups.flatMap((g) => g.runs).map((r) => r.gpu).find(Boolean);
  printTable(`Medians (ms from navigation start unless a duration; GPU: ${gpu || 'see the frames flow'})`, groups.filter((g) => g.runs.length), columns);
  if (args.json) writeFileSync(resolve(args.json), JSON.stringify({ args, groups }, null, 2));
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exit(1);
});
