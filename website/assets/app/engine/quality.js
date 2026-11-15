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
 * Integrated and software GPUs, by the renderer string WebGL reports (WEBGL_debug_renderer_info,
 * or the plain RENDERER where that is masked): Intel graphics other than discrete Arc A-series
 * cards, AMD APUs ("Radeon Graphics", "Radeon Vega 8 Graphics", "Radeon 780M Graphics"), Apple
 * silicon, phone GPUs and software rasterisers.
 */
const INTEGRATED_GPU = /intel|apple|mali|adreno|powervr|radeon(\(tm\))?\s+(vega\s+\d+\s+|\d{3}m\s+)?graphics|swiftshader|llvmpipe|basic render/i;
const DISCRETE_INTEL = /arc(\(tm\))?\s+a\d{3}/i;

/**
 * Whether a WebGL renderer string names an integrated or software GPU.
 * @param {string|null|undefined} renderer e.g. 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 ...)'
 * @returns {boolean} true for integrated and software GPUs; false for discrete or unknown ones
 */
export function isIntegratedGpu(renderer) {
  if (!renderer) return false;
  return INTEGRATED_GPU.test(renderer) && !DISCRETE_INTEL.test(renderer);
}

/**
 * The tier a device starts at. Phones and tablets, and integrated or software GPUs, start at
 * medium (the spec lets an integrated GPU drop to medium); everything else starts at high. The
 * frame governor can still step either down at run time.
 * @param {{ mobile?: boolean, coarsePointer?: boolean, gpu?: string|null }} device
 *   `gpu` is the WebGL renderer string (unknown counts as discrete)
 * @returns {'high'|'medium'} the tier
 */
export function startingTier(device) {
  if (device.mobile || device.coarsePointer || isIntegratedGpu(device.gpu)) return 'medium';
  return 'high';
}

/**
 * Probes WebGL2 with a throwaway context: whether it is available and the GPU it runs on. The
 * context is released straight away.
 * @returns {{ webgl2: boolean, gpu: string|null }}
 */
function probeGpu() {
  try {
    const canvas = document.createElement('canvas');
    const gl = window.WebGL2RenderingContext ? canvas.getContext('webgl2') : null;
    if (!gl) return { webgl2: false, gpu: null };
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '') || null;
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return { webgl2: true, gpu };
  } catch (error) {
    console.error(error);
    return { webgl2: false, gpu: null };
  }
}

/**
 * Whether the browser can create a WebGL2 context.
 * @returns {boolean} true when WebGL2 is available
 */
export function hasWebGL2() {
  return probeGpu().webgl2;
}

/**
 * Picks a starting tier for this device (see `startingTier`).
 * @returns {'high'|'medium'} the tier
 * @throws {Error} when WebGL2 is not available
 */
export function pickQuality() {
  const probe = probeGpu();
  if (!probe.webgl2) throw new Error('WebGL2 is not available in this browser.');
  return startingTier({
    mobile: /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || ''),
    coarsePointer: typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
    gpu: probe.gpu
  });
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
