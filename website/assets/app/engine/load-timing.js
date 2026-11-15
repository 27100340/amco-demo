/**
 * Load-time marks: User Timing entries (`performance.mark` and `performance.measure`) named
 * `amco:<step>`, read by `tools/load-timing.mjs` to break a load down into its steps. Nothing is
 * logged. Every step happens once per load (or once per page for cached work such as procedural
 * textures), so the entries stay few.
 */

/** Prefix of every entry name. */
export const TIMING_PREFIX = 'amco:';

/** True where the User Timing API is available (browsers, Node). */
const available = typeof performance !== 'undefined' && typeof performance.mark === 'function' && typeof performance.measure === 'function';

/**
 * Records a point in time.
 * @param {string} name step name, without the prefix
 * @param {object} [detail] extra data stored on the entry
 */
export function markLoad(name, detail) {
  if (available) performance.mark(TIMING_PREFIX + name, detail === undefined ? undefined : { detail });
}

/**
 * Records a span that started at `start` (a `performance.now()` time) and ends now.
 * @param {string} name step name, without the prefix
 * @param {number} start start time
 * @param {object} [detail] extra data stored on the entry
 */
export function measureLoad(name, start, detail) {
  if (available) performance.measure(TIMING_PREFIX + name, detail === undefined ? { start, end: performance.now() } : { start, end: performance.now(), detail });
}

/**
 * Runs a synchronous step and records how long it took.
 * @template T
 * @param {string} name step name, without the prefix
 * @param {() => T} step
 * @returns {T} what the step returned
 */
export function timeLoad(name, step) {
  const start = performance.now();
  try {
    return step();
  } finally {
    measureLoad(name, start);
  }
}
