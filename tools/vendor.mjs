import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';
import { subsetUrdu } from './subset-urdu.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modules = join(root, 'node_modules');
const out = join(root, 'website', 'assets', 'vendor');
const fonts = join(root, 'website', 'assets', 'fonts');

const threeBuild = join(modules, 'three', 'build');
const addonsRoot = join(modules, 'three', 'examples', 'jsm');
const addonEntries = [
  'controls/OrbitControls.js',
  'environments/RoomEnvironment.js',
  'geometries/RoundedBoxGeometry.js',
  'utils/BufferGeometryUtils.js',
  'postprocessing/EffectComposer.js',
  'postprocessing/RenderPass.js',
  'postprocessing/GTAOPass.js',
  'postprocessing/SMAAPass.js',
  'postprocessing/OutputPass.js',
  'lights/RectAreaLightUniformsLib.js',
  'objects/Sky.js',
  'math/SimplexNoise.js'
];

const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]|import\s*['"](\.[^'"]+)['"]/g;

/**
 * Collect an addon file and every file it reaches through relative imports.
 * @param {string} file absolute path inside examples/jsm
 * @param {Set<string>} seen accumulator of absolute paths
 */
function collect(file, seen) {
  if (seen.has(file)) { return; }
  seen.add(file);
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(IMPORT_RE)) {
    collect(resolve(dirname(file), match[1] || match[2]), seen);
  }
}

/**
 * Minify a JS file in place, keeping it an ES module.
 * @param {string} file absolute path
 */
function minify(file) {
  const result = transformSync(readFileSync(file, 'utf8'), { minify: true, format: 'esm', legalComments: 'inline' });
  writeFileSync(file, result.code);
}

/**
 * Copy a file, creating parent folders.
 * @param {string} from absolute source
 * @param {string} to absolute destination
 */
function copy(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
}

/**
 * Recursively list files under a folder.
 * @param {string} dir absolute folder
 * @returns {string[]} absolute file paths
 */
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const threeOut = join(out, 'three');
rmSync(threeOut, { recursive: true, force: true });
rmSync(join(out, 'pdfjs'), { recursive: true, force: true });

for (const name of ['three.module.js', 'three.core.js']) {
  copy(join(threeBuild, name), join(threeOut, name));
}

const files = new Set();
for (const entry of addonEntries) { collect(join(addonsRoot, entry), files); }
for (const file of files) {
  copy(file, join(threeOut, 'addons', relative(addonsRoot, file)));
}
for (const file of walk(threeOut)) { minify(file); }

const pdfjsRoot = join(modules, 'pdfjs-dist');
for (const name of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
  copy(join(pdfjsRoot, 'build', name), join(out, 'pdfjs', name));
}
for (const folder of ['standard_fonts', 'iccs']) {
  for (const file of walk(join(pdfjsRoot, folder))) {
    copy(file, join(out, 'pdfjs', folder, relative(join(pdfjsRoot, folder), file)));
  }
}
const PDF_WASM_FILES = /^(?:openjpeg|jbig2|qcms)|^LICENSE_(?:PDFJS_)?(?:OPENJPEG|JBIG2|QCMS)$/;
for (const name of readdirSync(join(pdfjsRoot, 'wasm')).filter((n) => PDF_WASM_FILES.test(n))) {
  copy(join(pdfjsRoot, 'wasm', name), join(out, 'pdfjs', 'wasm', name));
}

const subsets = ['latin', 'latin-ext'];
for (const subset of subsets) {
  for (const style of ['normal', 'italic']) {
    copy(
      join(modules, '@fontsource', 'instrument-serif', 'files', `instrument-serif-${subset}-400-${style}.woff2`),
      join(fonts, `instrument-serif-${subset}-400-${style}.woff2`)
    );
  }
  copy(
    join(modules, '@fontsource-variable', 'instrument-sans', 'files', `instrument-sans-${subset}-wght-normal.woff2`),
    join(fonts, `instrument-sans-${subset}-wght-normal.woff2`)
  );
}

subsetUrdu();
for (const [scope, family] of [['@fontsource', 'instrument-serif'], ['@fontsource-variable', 'instrument-sans'], ['@fontsource-variable', 'noto-nastaliq-urdu']]) {
  copy(join(modules, scope, family, 'LICENSE'), join(fonts, `OFL-${family}.txt`));
}

process.stdout.write(`Vendored three (${files.size} addon files), pdfjs (with standard fonts, ICC profile and image decoders) and fonts.\n`);
