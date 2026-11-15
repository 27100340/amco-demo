/**
 * Background work after a model's first frame (furniture streaming in, textures, shader
 * compiles for later views): steps run in slices of a few milliseconds and the browser gets a
 * turn between slices, so the page keeps drawing and answering input. A run stops as soon as it
 * is cancelled (a newer load, or the viewer disposed).
 */

/** Time a slice may run before the browser gets a turn (ms). */
export const SLICE_MS = 12;

/**
 * Gives the browser a turn (to draw a frame and handle input) before the work goes on.
 * @returns {Promise<void>}
 */
export function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Runs `work` on each item in order, yielding to the browser whenever a slice has used its
 * budget. One item is never split, so a slow item makes a long slice.
 * @template T
 * @param {T[]} items
 * @param {(item: T, index: number) => void} work
 * @param {{ cancelled?: () => boolean, budgetMs?: number, now?: () => number, yieldTo?: () => Promise<void> }} [options]
 *   `now` and `yieldTo` default to `performance.now` and `yieldToBrowser` (tests replace them)
 * @returns {Promise<boolean>} true when every item was done, false when cancelled first
 */
export async function runSliced(items, work, options = {}) {
  const cancelled = options.cancelled || (() => false);
  const budget = options.budgetMs ?? SLICE_MS;
  const now = options.now || (() => performance.now());
  const yieldTo = options.yieldTo || yieldToBrowser;
  let sliceStart = now();
  for (let i = 0; i < items.length; i++) {
    if (cancelled()) return false;
    work(items[i], i);
    if (i < items.length - 1 && now() - sliceStart >= budget) {
      await yieldTo();
      sliceStart = now();
    }
  }
  return !cancelled();
}
