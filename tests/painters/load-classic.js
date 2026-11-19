import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const WEBSITE = fileURLToPath(new URL('../../website/', import.meta.url));

/**
 * Run a classic (non-module) site script the way a browser would, without a DOM.
 * @param {string} relativePath path under website/, such as 'assets/js/painters-data.js'
 * @param {object} [globals] extra globals for the script; `window` is created when absent
 * @returns {object} the script's `window` object
 */
export function loadClassic(relativePath, globals = {}) {
  const context = { ...globals, window: globals.window || {} };
  vm.createContext(context);
  vm.runInContext(readFileSync(WEBSITE + relativePath, 'utf8'), context, { filename: relativePath });
  return context.window;
}
