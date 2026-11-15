/**
 * Quality tiers for the 3D engine and the frame governor that steps a tier down when the
 * device cannot keep up.
 */

/**
 * Settings per tier. `windowLights` and `roomLights` are the sizes of the light pools: every
 * light in a pool stays in the scene whatever the view, because each change in the number of
 * lights makes the GPU recompile every shader (seconds per shader on some laptops).
 */
export const QUALITY = {
  high: { pixelRatio: 2, shadowMap: 4096, shadows: true, ao: true, smaa: true, windowLights: 4, roomLights: 4, textureSize: 1024 },
  medium: { pixelRatio: 1.5, shadowMap: 2048, shadows: true, ao: false, smaa: false, windowLights: 2, roomLights: 0, textureSize: 512 },
  low: { pixelRatio: 1, shadowMap: 0, shadows: false, ao: false, smaa: false, windowLights: 0, roomLights: 0, textureSize: 512 }
};

/** Tiers from best to cheapest. */
export const TIERS = ['high', 'medium', 'low'];

/** Average frame time (ms) over the sampling window that triggers a step down. */
const SLOW_FRAME_MS = 33;
/** Length of the sampling window (ms). */
const WINDOW_MS = 2000;
/** Gaps longer than this (ms) are idle time, not slow frames. */
const IDLE_GAP_MS = 250;

/**
 * Whether the browser can create a WebGL2 context.
 * @returns {boolean} true when WebGL2 is available
 */
export function hasWebGL2() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(window.WebGL2RenderingContext && canvas.getContext('webgl2'));
  } catch (error) {
    console.error(error);
    return false;
  }
}

/**
 * Picks a starting tier for this device: phones and tablets get medium, everything else high.
 * @returns {'high'|'medium'} the tier
 * @throws {Error} when WebGL2 is not available
 */
export function pickQuality() {
  if (!hasWebGL2()) throw new Error('WebGL2 is not available in this browser.');
  const mobileAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  return mobileAgent || coarse ? 'medium' : 'high';
}

/**
 * The next cheaper tier, or null at the bottom.
 * @param {'high'|'medium'|'low'} tier
 * @returns {'medium'|'low'|null}
 */
export function lowerTier(tier) {
  const index = TIERS.indexOf(tier);
  return index === -1 || index === TIERS.length - 1 ? null : TIERS[index + 1];
}

/**
 * Watches frame times and calls `onDowngrade` when the average over a 2 s window is above 33 ms.
 * Feed it the time between consecutive rendered frames; idle gaps are ignored.
 * @param {() => void} onDowngrade called once per slow window
 * @returns {{ sample: (deltaMs: number) => void, reset: () => void }} the governor
 */
export function createFrameGovernor(onDowngrade) {
  let total = 0;
  let frames = 0;
  return {
    sample(deltaMs) {
      if (!(deltaMs > 0) || deltaMs > IDLE_GAP_MS) return;
      total += deltaMs;
      frames += 1;
      if (total < WINDOW_MS) return;
      const average = total / frames;
      total = 0;
      frames = 0;
      if (average > SLOW_FRAME_MS) onDowngrade();
    },
    reset() {
      total = 0;
      frames = 0;
    }
  };
}
