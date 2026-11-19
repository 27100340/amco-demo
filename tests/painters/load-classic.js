import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const WEBSITE = fileURLToPath(new URL('../../website/', import.meta.url));

/**
 * Run a classic (non-module) site script the way a browser would, without a DOM.
 * The script runs in this realm (wrapped in a function whose parameters are the
 * globals), so the arrays and objects it builds compare with assert.deepEqual.
 * @param {string} relativePath path under website/, such as 'assets/js/painters-data.js'
 * @param {object} [globals] extra globals for the script; `window` is created when absent
 * @returns {object} the script's `window` object
 */
export function loadClassic(relativePath, globals = {}) {
  const context = { ...globals, window: globals.window || {} };
  const names = Object.keys(context);
  const source = readFileSync(WEBSITE + relativePath, 'utf8');
  const run = vm.runInThisContext(`(function (${names.join(', ')}) {\n${source}\n})`, { filename: relativePath });
  run(...names.map((name) => context[name]));
  return context.window;
}
