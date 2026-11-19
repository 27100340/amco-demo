/**
 * Subset the Noto Nastaliq Urdu Arabic-script font to the characters the site uses.
 * The full font is 239 KB and loads on every page that shows Urdu, which broke the 150 KB font
 * budget on the landing page. The source font stays in node_modules; only the subset is deployed.
 *
 * Needs Python 3 with fonttools and brotli (`pip install fonttools brotli`). Set PYTHON to pick
 * the interpreter. Run through `npm run vendor`, or alone with `node tools/subset-urdu.mjs`.
 * Re-run it whenever Urdu text is added to a page or script.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'website');
const source = join(root, 'node_modules', '@fontsource-variable', 'noto-nastaliq-urdu', 'files', 'noto-nastaliq-urdu-arabic-wght-normal.woff2');
const target = join(site, 'assets', 'fonts', 'noto-nastaliq-urdu-arabic.woff2');

const SKIP_DIRS = new Set(['vendor', 'fonts', 'img', 'samples', 'node_modules', '.vercel']);
const TEXT_FILE = /\.(?:html|js|mjs|css|json)$/;
const ARABIC = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF\u200C\u200D]/g;
/** The space and no-break space are always kept, so Urdu phrases never need another face. */
const BASELINE = ' ' + String.fromCharCode(160);

/**
 * List the text files under a folder, skipping vendored and binary folders.
 * @param {string} dir absolute folder
 * @returns {string[]} absolute file paths
 */
function textFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { return SKIP_DIRS.has(name) ? [] : textFiles(full); }
    return TEXT_FILE.test(name) ? [full] : [];
  });
}

/**
 * Every distinct Arabic-script character used across the site's pages and scripts.
 * @returns {string} the characters, sorted, with the baseline set included
 */
export function usedUrduCharacters() {
  const seen = new Set(BASELINE);
  for (const file of textFiles(site)) {
    for (const ch of readFileSync(file, 'utf8').match(ARABIC) || []) { seen.add(ch); }
  }
  return [...seen].sort().join('');
}

/** Write the subset font to the deployed fonts folder. */
export function subsetUrdu() {
  const temp = mkdtempSync(join(tmpdir(), 'amco-urdu-'));
  const textFile = join(temp, 'urdu.txt');
  writeFileSync(textFile, usedUrduCharacters(), 'utf8');
  const python = process.env.PYTHON || 'python';
  const instance = join(temp, 'urdu-400.ttf');
  const steps = [
    // The site only sets Urdu at weight 400, so drop the variable weight axis.
    ['-m', 'fontTools.varLib.instancer', source, 'wght=400', '-o', instance],
    ['-m', 'fontTools.subset', instance, `--text-file=${textFile}`, `--output-file=${target}`,
      '--flavor=woff2', '--layout-features=*', '--no-hinting']
  ];
  for (const args of steps) {
    const result = spawnSync(python, args, { encoding: 'utf8' });
    if (result.status !== 0) {
      rmSync(temp, { recursive: true, force: true });
      throw new Error(`Urdu subsetting failed (install the tools with: pip install fonttools brotli)
${result.stderr || result.error}`);
    }
  }
  rmSync(temp, { recursive: true, force: true });
  process.stdout.write(`Subset Urdu font to ${statSync(target).size} bytes.\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { subsetUrdu(); }
