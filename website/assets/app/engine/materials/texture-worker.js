/**
 * Texture worker (module worker, started by `texture-pool.js`): draws one procedural pattern per
 * message, `{ job, id, size }`, and posts back `{ job, map, normalMap, roughnessMap, mean, ms }`
 * with the pixel buffers transferred, or `{ job, error }`.
 */
import { drawPixels } from './patterns.js';

self.addEventListener('message', (event) => {
  const { job, id, size } = event.data;
  try {
    const start = performance.now();
    const pixels = drawPixels(id, size);
    self.postMessage({ job, ...pixels, ms: performance.now() - start },
      [pixels.map.buffer, pixels.normalMap.buffer, pixels.roughnessMap.buffer]);
  } catch (error) {
    self.postMessage({ job, error: String(error && error.message ? error.message : error) });
  }
});
