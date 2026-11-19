/**
 * Procedural PBR textures: colour, normal (from a height field via a Sobel filter) and roughness
 * maps for the patterns in `patterns.js`. Every pattern tiles seamlessly, covers a known
 * real-world size (`tile`, metres) and is generated once per id and size, then cached. A set can
 * be reserved first (blank maps, so materials and shaders can be made at once): its pixels are
 * then drawn by the texture workers in parallel, off the page's thread, or on the page's thread
 * where workers are not available.
 */
import * as THREE from 'three';
import { measureLoad } from '../load-timing.js';
import { runSliced } from '../load-scheduler.js';
import { drawPixels, hasPattern, patternTile } from './patterns.js';
import { createTexturePool } from './texture-pool.js';

export { PROCEDURAL_IDS } from './patterns.js';

/** Texture sets by `<id>@<size>`; keys of the sets whose maps are still blank; copies made of each map. */
const cache = new Map();
const blank = new Set();
const copies = new WeakMap();
/** The map each copy was made from. */
const originals = new WeakMap();
/** Worker draws still running, by key. */
const jobs = new Map();
/**
 * The texture workers (null where workers are not available), started on first use and kept for
 * the page's lifetime: every page that uses them shows one viewer until it is closed.
 */
let pool;

/**
 * A repeating, mipmapped RGBA texture of `size` pixels, blank (never uploaded) until its pixels
 * are drawn. The pixels are uploaded straight from memory, which is several times quicker than
 * from a canvas; rows are stored bottom first, as a canvas upload would flip them.
 * @param {number} size
 * @param {boolean} srgb true for colour maps
 * @returns {THREE.DataTexture}
 */
function blankTexture(size, srgb) {
  const texture = new THREE.DataTexture(null, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.unpackAlignment = 4;
  texture.anisotropy = 8;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * The texture worker pool, started on first use.
 * @returns {ReturnType<typeof createTexturePool>}
 */
function texturePool() {
  if (pool === undefined) pool = createTexturePool(new URL('./texture-worker.js', import.meta.url));
  return pool;
}

/**
 * Puts drawn pixels into a set's maps and flags them, and every copy made with `textureCopy`, for
 * upload. Does nothing when the set was drawn already.
 * @param {string} key cache key `<id>@<size>`
 * @param {{ map: Uint8Array, normalMap: Uint8Array, roughnessMap: Uint8Array, mean: number[] }} pixels
 * @returns {boolean} true when the pixels were used
 */
function apply(key, pixels) {
  if (!blank.has(key)) return false;
  const set = cache.get(key);
  for (const name of ['map', 'normalMap', 'roughnessMap']) {
    const texture = set[name];
    texture.image.data = pixels[name];
    for (const flagged of [texture, ...(copies.get(texture) || [])]) flagged.needsUpdate = true;
  }
  set.map.userData.mean = pixels.mean;
  blank.delete(key);
  return true;
}

/**
 * Draws a texture set's maps on this thread.
 * @param {string} key cache key `<id>@<size>`
 */
function draw(key) {
  const [id, size] = key.split('@');
  const start = performance.now();
  apply(key, drawPixels(id, Number(size)));
  measureLoad(`texture:${key}`, start);
}

/**
 * Hands a blank set to the texture workers. When a worker fails, the set stays blank and
 * `drawPendingTextures` draws it on this thread.
 * @param {string} key cache key `<id>@<size>`
 */
function drawInWorker(key) {
  const workers = texturePool();
  if (!workers || jobs.has(key)) return;
  const [id, size] = key.split('@');
  const job = workers.draw(id, Number(size))
    .then((pixels) => {
      if (apply(key, pixels)) measureLoad(`texture-worker:${key}`, performance.now() - pixels.ms);
    })
    .catch(() => {})
    .finally(() => jobs.delete(key));
  jobs.set(key, job);
}

/**
 * The cached set for a key, made blank when new.
 * @param {string} id
 * @param {number} size
 * @returns {object|null}
 */
function reserveSet(id, size) {
  const key = `${id}@${size}`;
  if (cache.has(key)) return cache.get(key);
  if (!hasPattern(id)) return null;
  cache.set(key, { map: blankTexture(size, true), normalMap: blankTexture(size, false), roughnessMap: blankTexture(size, false), tile: patternTile(id) });
  blank.add(key);
  return cache.get(key);
}

/**
 * Starts the texture workers ahead of the first reservation, so they are running by the time a
 * model's textures are reserved. Does nothing where workers are not available.
 */
export function startTextureWorkers() {
  const workers = texturePool();
  if (workers) workers.warm();
}

/**
 * The PBR maps for a procedural id, cached per id and size. When new, the maps are blank until
 * drawn: at once by `generateTexture`, or by the texture workers (started here), which
 * `drawPendingTextures` waits for. Use it to make materials ahead of the pixels (shaders do not
 * need them), and finish the pixels before the first render.
 * @param {string} id one of PROCEDURAL_IDS
 * @param {number} [size=512] pixels per side (256, 512 or 1024)
 * @returns {{ map: THREE.DataTexture, normalMap: THREE.DataTexture, roughnessMap: THREE.DataTexture, tile: [number, number] } | null}
 *   `tile` is the real-world size (metres) one repeat covers; once drawn, `map.userData.mean` is the
 *   average sRGB colour (0..1 channels); null for unknown ids
 */
export function reserveTexture(id, size = 512) {
  const set = reserveSet(id, size);
  if (set && blank.has(`${id}@${size}`)) drawInWorker(`${id}@${size}`);
  return set;
}

/**
 * Generates (or returns the cached) PBR maps for a procedural id, drawn on this thread.
 * @param {string} id one of PROCEDURAL_IDS
 * @param {number} [size=512] pixels per side (256, 512 or 1024)
 * @returns {ReturnType<typeof reserveTexture>} see `reserveTexture`; null for unknown ids
 */
export function generateTexture(id, size = 512) {
  const set = reserveSet(id, size);
  if (set && blank.has(`${id}@${size}`)) draw(`${id}@${size}`);
  return set;
}

/**
 * A copy of one of the maps with its own repeat (materials scale the same pixels differently).
 * Copies of a map that is still blank are flagged for upload when it is drawn.
 * @param {THREE.Texture} texture a map from `reserveTexture` or `generateTexture`
 * @param {[number, number]} repeat
 * @returns {THREE.Texture}
 */
export function textureCopy(texture, repeat) {
  const copy = texture.clone();
  copy.repeat.set(repeat[0], repeat[1]);
  copy.needsUpdate = true;
  if (!copies.has(texture)) copies.set(texture, []);
  copies.get(texture).push(copy);
  originals.set(copy, texture);
  return copy;
}

/**
 * Lets go of a copy made with `textureCopy` once its material is gone: the cached map stops
 * tracking it and its GPU upload is freed. Anything else is left alone.
 * @param {THREE.Texture|null|undefined} texture
 * @returns {boolean} true when it was a copy and has been released
 */
export function releaseTextureCopy(texture) {
  const original = texture ? originals.get(texture) : undefined;
  if (!original) return false;
  const list = copies.get(original) || [];
  const index = list.indexOf(texture);
  if (index !== -1) list.splice(index, 1);
  originals.delete(texture);
  texture.dispose();
  return true;
}

/**
 * Whether any reserved texture is still blank.
 * @returns {boolean}
 */
export function hasPendingTextures() {
  return blank.size > 0;
}

/**
 * Finishes every texture that is still blank: waits for the texture workers, then draws whatever
 * they could not, one per slice so the page stays responsive.
 * @param {{ cancelled?: () => boolean }} [options] stops early when `cancelled()` turns true
 * @returns {Promise<boolean>} true when none is left blank
 */
export async function drawPendingTextures(options = {}) {
  const cancelled = options.cancelled || (() => false);
  while (jobs.size && !cancelled()) await Promise.all([...jobs.values()]);
  await runSliced([...blank], (key) => {
    if (blank.has(key)) draw(key);
  }, { cancelled, budgetMs: 0 });
  return blank.size === 0;
}
