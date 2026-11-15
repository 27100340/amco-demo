/* Renders placeholder paint-tin packshots for the landing page with three.js in
   headless Chrome, one per product category, and saves them as transparent webp
   files in website/assets/img/products/. Swap these for real packshots later.

   Usage: node tools/render-tins.mjs
   Needs Chrome at the path below and Python 3 with Pillow for the webp step. */
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'website', 'assets', 'img', 'products');
const PAGE_DIR = join(ROOT, 'tools', '.render-tins');
const VIEW = 800;
const SCALE = 2;
const OUTPUT_SIZE = 800;
const WEBP_QUALITY = 82;
const CHROME_TIMEOUT_MS = 120000;

const TINS = [
  { file: 'interior-emulsion', product: 'Interior Emulsion', line: 'Smooth matt walls that wipe clean', band: '#2A6E89', ink: '#FFFFFF' },
  { file: 'exterior-weather-coat', product: 'Weather Coat', line: 'For sun, damp and monsoon rain', band: '#B4663E', ink: '#FFFFFF' },
  { file: 'enamel', product: 'Synthetic Enamel', line: 'High gloss for wood and metal', band: '#2E5C45', ink: '#FFFFFF' },
  { file: 'primer-putty', product: 'Wall Primer', line: 'Seals new plaster before you paint', band: '#5E696F', ink: '#FFFFFF' }
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2'
};

/**
 * Serve the repository root over HTTP so the page can import the vendored three.js.
 * @returns {Promise<{ port: number, close: () => void }>} the running server
 */
function serveRoot() {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(ROOT, `.${path}`);
    if (!file.startsWith(ROOT + sep) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    response.end(readFileSync(file));
  });
  return new Promise((done) => {
    server.listen(0, '127.0.0.1', () => done({ port: server.address().port, close: () => server.close() }));
  });
}

/**
 * The page that builds one tin from the query string and renders it once.
 * @returns {string} HTML source
 */
function pageSource() {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>tin</title>
<style>
@font-face { font-family: 'Instrument Serif'; src: url(/website/assets/fonts/instrument-serif-latin-400-normal.woff2) format('woff2'); }
@font-face { font-family: 'Instrument Sans'; font-weight: 400 700; src: url(/website/assets/fonts/instrument-sans-latin-wght-normal.woff2) format('woff2'); }
html, body { margin: 0; background: transparent; overflow: hidden; }
canvas { display: block; }
</style>
<script type="importmap">{ "imports": { "three": "/website/assets/vendor/three/three.module.js", "three/addons/": "/website/assets/vendor/three/addons/" } }</script>
</head><body>
<script type="module">
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const params = new URLSearchParams(location.search);
const tin = JSON.parse(params.get('tin'));
await Promise.all([
  document.fonts.load('400 120px "Instrument Serif"'),
  document.fonts.load('600 60px "Instrument Sans"'),
  document.fonts.load('400 40px "Instrument Sans"')
]);

const R = 0.83;
const H = 1.9;
const LABEL_BOTTOM = 0.2;
const LABEL_TOP = H - 0.24;

function labelTexture() {
  const w = 4096;
  const h = Math.round(w * (LABEL_TOP - LABEL_BOTTOM) / (2 * Math.PI * R));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#F7F5F1';
  ctx.fillRect(0, 0, w, h);

  const bandTop = Math.round(h * 0.64);
  ctx.fillStyle = tin.band;
  ctx.fillRect(0, bandTop, w, h - bandTop);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(0, bandTop, w, 6);

  const cx = w / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = '#C8202A';
  ctx.fillRect(cx - 34, h * 0.09, 68, 68);
  ctx.fillStyle = '#fff';
  ctx.fillRect(cx - 34, h * 0.09 + 45, 68, 8);

  ctx.fillStyle = '#1D2023';
  ctx.font = '600 150px "Instrument Sans"';
  ctx.letterSpacing = '26px';
  ctx.fillText('COVER UP', cx + 13, h * 0.33);

  ctx.letterSpacing = '0px';
  ctx.font = '400 128px "Instrument Serif"';
  ctx.fillText(tin.product, cx, h * 0.48);

  ctx.font = '400 46px "Instrument Sans"';
  ctx.fillStyle = '#5F656B';
  ctx.fillText(tin.line, cx, h * 0.56);

  ctx.fillStyle = tin.ink;
  ctx.font = '600 80px "Instrument Sans"';
  ctx.fillText('4 L', cx, bandTop + (h - bandTop) * 0.5);
  ctx.font = '400 40px "Instrument Sans"';
  ctx.letterSpacing = '6px';
  ctx.fillText('AMCO PAINTS  \\u00B7  LAHORE', cx, bandTop + (h - bandTop) * 0.8);
  ctx.letterSpacing = '0px';

  ctx.fillStyle = 'rgba(29,32,35,0.35)';
  for (let i = 0; i < 9; i += 1) {
    ctx.fillRect(w * 0.06, h * (0.2 + i * 0.045), w * 0.16, 7);
    ctx.fillRect(w * 0.78, h * (0.2 + i * 0.045), w * 0.16, 7);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function bodyProfile() {
  const p = [];
  p.push(new THREE.Vector2(0.0, 0.035));
  p.push(new THREE.Vector2(R - 0.06, 0.035));
  p.push(new THREE.Vector2(R - 0.035, 0.0));
  p.push(new THREE.Vector2(R + 0.012, 0.0));
  p.push(new THREE.Vector2(R + 0.026, 0.02));
  p.push(new THREE.Vector2(R + 0.026, 0.07));
  p.push(new THREE.Vector2(R + 0.006, 0.095));
  p.push(new THREE.Vector2(R, 0.13));
  p.push(new THREE.Vector2(R + 0.008, 0.15));
  p.push(new THREE.Vector2(R, 0.17));
  p.push(new THREE.Vector2(R, H - 0.2));
  p.push(new THREE.Vector2(R + 0.008, H - 0.18));
  p.push(new THREE.Vector2(R, H - 0.16));
  p.push(new THREE.Vector2(R, H - 0.1));
  p.push(new THREE.Vector2(R + 0.028, H - 0.075));
  p.push(new THREE.Vector2(R + 0.034, H - 0.035));
  p.push(new THREE.Vector2(R + 0.02, H));
  p.push(new THREE.Vector2(R - 0.03, H + 0.004));
  p.push(new THREE.Vector2(R - 0.05, H - 0.02));
  p.push(new THREE.Vector2(R - 0.07, H - 0.03));
  return p;
}

function lidProfile() {
  const p = [];
  p.push(new THREE.Vector2(0.0, H - 0.012));
  p.push(new THREE.Vector2(R * 0.35, H - 0.012));
  p.push(new THREE.Vector2(R * 0.37, H - 0.004));
  p.push(new THREE.Vector2(R * 0.39, H - 0.012));
  p.push(new THREE.Vector2(R * 0.62, H - 0.012));
  p.push(new THREE.Vector2(R * 0.64, H - 0.022));
  p.push(new THREE.Vector2(R * 0.66, H - 0.012));
  p.push(new THREE.Vector2(R - 0.11, H - 0.012));
  p.push(new THREE.Vector2(R - 0.09, H - 0.035));
  p.push(new THREE.Vector2(R - 0.07, H - 0.03));
  return p;
}

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.85;

const metal = new THREE.MeshPhysicalMaterial({ color: 0xd9dbdc, metalness: 1, roughness: 0.32, clearcoat: 0.3, clearcoatRoughness: 0.4 });
const lidMetal = new THREE.MeshPhysicalMaterial({ color: 0xd4d6d7, metalness: 1, roughness: 0.26, anisotropy: 0.6, clearcoat: 0.2 });
const wire = new THREE.MeshStandardMaterial({ color: 0xbfc2c4, metalness: 1, roughness: 0.3 });
const label = new THREE.MeshPhysicalMaterial({ map: labelTexture(), roughness: 0.42, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25 });

const group = new THREE.Group();
const body = new THREE.Mesh(new THREE.LatheGeometry(bodyProfile(), 160), metal);
body.castShadow = true;
group.add(body);
const lid = new THREE.Mesh(new THREE.LatheGeometry(lidProfile(), 160), lidMetal);
group.add(lid);
const labelMesh = new THREE.Mesh(
  new THREE.CylinderGeometry(R + 0.003, R + 0.003, LABEL_TOP - LABEL_BOTTOM, 200, 1, true, Math.PI, Math.PI * 2),
  label
);
labelMesh.position.y = (LABEL_TOP + LABEL_BOTTOM) / 2;
group.add(labelMesh);

const fittings = new THREE.Group();
const earGeo = new THREE.BoxGeometry(0.05, 0.16, 0.12);
[-1, 1].forEach((side) => {
  const ear = new THREE.Mesh(earGeo, metal);
  ear.position.set(side * (R + 0.02), H - 0.3, 0);
  fittings.add(ear);
});
const handlePoints = [];
for (let i = 0; i <= 64; i += 1) {
  const t = Math.PI * (i / 64);
  handlePoints.push(new THREE.Vector3(-Math.cos(t) * (R + 0.05), Math.sin(t) * 0.62, 0));
}
const handle = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(handlePoints), 128, 0.014, 12), wire);
handle.position.y = H - 0.3;
handle.rotation.x = -0.42;
handle.castShadow = true;
fittings.add(handle);
fittings.rotation.y = -0.55;
group.add(fittings);
scene.add(group);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: 0.13 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(-2.4, 7.5, 3.4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.radius = 9;
key.shadow.blurSamples = 24;
key.shadow.camera.left = -3;
key.shadow.camera.right = 3;
key.shadow.camera.top = 3;
key.shadow.camera.bottom = -3;
scene.add(key);
const rim = new THREE.DirectionalLight(0xfff4e8, 0.9);
rim.position.set(4, 3, -3);
scene.add(rim);

const camera = new THREE.PerspectiveCamera(26, window.innerWidth / window.innerHeight, 0.1, 50);
camera.position.set(0, 2.15, 6.1);
camera.lookAt(0, 0.98, 0);

renderer.render(scene, camera);
document.title = 'ready';
</script></body></html>`;
}

/**
 * Screenshot one tin with a transparent background. Runs Chrome asynchronously
 * so this process can keep serving the page while Chrome loads it.
 * @param {number} port local server port
 * @param {object} tin tin description
 * @param {string} out PNG path
 * @returns {Promise<void>} resolves once the PNG exists
 */
function shoot(port, tin, out) {
  const url = `http://127.0.0.1:${port}/tools/.render-tins/tin.html?tin=${encodeURIComponent(JSON.stringify(tin))}`;
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--hide-scrollbars',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--default-background-color=00000000',
    `--force-device-scale-factor=${SCALE}`,
    '--virtual-time-budget=15000',
    `--window-size=${VIEW},${VIEW}`,
    `--screenshot=${out}`,
    url
  ], { stdio: 'ignore' });
  return new Promise((done, fail) => {
    const timer = setTimeout(() => chrome.kill(), CHROME_TIMEOUT_MS);
    chrome.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0 && existsSync(out)) { done(); } else { fail(new Error(`Chrome could not render ${tin.file}`)); }
    });
  });
}

/**
 * Convert the PNG renders to webp at the output size.
 * @param {{ png: string, webp: string }[]} jobs files to convert
 */
function toWebp(jobs) {
  const script = [
    'import sys, json',
    'from PIL import Image',
    'for job in json.loads(sys.argv[1]):',
    '    im = Image.open(job["png"]).convert("RGBA")',
    `    im = im.resize((${OUTPUT_SIZE}, ${OUTPUT_SIZE}), Image.LANCZOS)`,
    `    im.save(job["webp"], "WEBP", quality=${WEBP_QUALITY}, method=6)`
  ].join('\n');
  const result = spawnSync('python', ['-I', '-c', script, JSON.stringify(jobs)], { stdio: 'inherit' });
  if (result.status !== 0) { throw new Error('Pillow could not write the webp files'); }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(PAGE_DIR, { recursive: true });
  writeFileSync(join(PAGE_DIR, 'tin.html'), pageSource());
  const temp = mkdtempSync(join(tmpdir(), 'amco-tins-'));
  const server = await serveRoot();
  try {
    const jobs = [];
    for (const tin of TINS) {
      const png = join(temp, `${tin.file}.png`);
      await shoot(server.port, tin, png);
      jobs.push({ png, webp: join(OUT_DIR, `${tin.file}.webp`) });
    }
    toWebp(jobs);
    jobs.forEach((job) => process.stdout.write(`${job.webp}\n`));
  } finally {
    server.close();
    rmSync(PAGE_DIR, { recursive: true, force: true });
    rmSync(temp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
