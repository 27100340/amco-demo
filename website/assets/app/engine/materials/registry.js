/**
 * Material registry: every surface in the engine asks for a material by id (`marble`, `oak-floor`,
 * `glass`, ...). Ids resolve to factories; textured ids use the procedural PBR maps. Materials are
 * cached by id + options, so kits and the compiler share them.
 * Options for every id: `{ color, roughness, metalness, repeat: [u, v] }`. `repeat` is texture
 * repeats per UV unit; without it, textures are scaled for UVs in metres.
 */
import * as THREE from 'three';
import { generateTexture, isGenerated, PROCEDURAL_IDS } from './procedural.js';

/** Roughness per paint finish. */
export const FINISH_ROUGHNESS = { matt: 0.92, silk: 0.55, gloss: 0.25 };

/** Ids whose textures carry fine detail at floor and façade scale (larger maps on high). */
const DETAILED = new Set(['marble', 'porcelain', 'oak-floor', 'stone-cladding', 'brick', 'lawn', 'carpet-tile', 'paving']);

const factories = new Map();
const cache = new Map();
const reported = new Set();
let tier = 'high';

/**
 * Sets the quality tier used to size procedural textures for materials made from now on.
 * @param {'high'|'medium'|'low'} quality
 */
export function setMaterialQuality(quality) {
  tier = quality;
}

/**
 * Texture size for an id at the current tier.
 * @param {string} id
 * @returns {number} pixels per side
 */
function textureSize(id) {
  if (tier === 'high') return DETAILED.has(id) ? 1024 : 512;
  return DETAILED.has(id) ? 512 : 256;
}

/**
 * Copies a cached map with its own repeat.
 * @param {THREE.Texture} texture
 * @param {[number, number]} repeat
 * @returns {THREE.Texture}
 */
function withRepeat(texture, repeat) {
  const copy = texture.clone();
  copy.repeat.set(repeat[0], repeat[1]);
  copy.needsUpdate = true;
  return copy;
}

/**
 * A MeshStandardMaterial using the procedural maps of `textureId`.
 * @param {string} textureId procedural id
 * @param {object} base default material parameters
 * @param {object} opts caller options
 * @returns {THREE.MeshStandardMaterial}
 */
function textured(textureId, base, opts) {
  const maps = generateTexture(textureId, textureSize(textureId));
  const repeat = Array.isArray(opts.repeat) ? opts.repeat : [1 / maps.tile[0], 1 / maps.tile[1]];
  const { normalScale = 1, ...params } = base;
  params.map = withRepeat(maps.map, repeat);
  params.normalMap = withRepeat(maps.normalMap, repeat);
  params.roughnessMap = withRepeat(maps.roughnessMap, repeat);
  const material = new THREE.MeshStandardMaterial(params);
  material.normalScale.set(normalScale, normalScale);
  return material;
}

/**
 * Applies the common options to a material.
 * @param {THREE.MeshStandardMaterial} material
 * @param {{ color?: string|number, roughness?: number, metalness?: number }} opts
 * @returns {THREE.MeshStandardMaterial}
 */
function applyOptions(material, opts) {
  if (opts.color !== undefined && material.color) material.color.set(opts.color);
  if (Number.isFinite(opts.roughness)) material.roughness = opts.roughness;
  if (Number.isFinite(opts.metalness)) material.metalness = opts.metalness;
  return material;
}

/**
 * Registers a material factory under an id, replacing any earlier one.
 * @param {string} id material id
 * @param {(opts: object) => THREE.Material} factory builds a new material for the given options
 */
export function registerMaterial(id, factory) {
  factories.set(id, factory);
  for (const key of [...cache.keys()]) {
    if (key.startsWith(`${id}|`)) cache.delete(key);
  }
}

/**
 * Paint on plaster: the shade colour, the finish's roughness and a faint plaster normal map.
 * Each call returns a new material, so every surface can change colour on its own.
 * @param {string} hex shade colour, e.g. '#2A6E89'
 * @param {'matt'|'silk'|'gloss'} [finish='matt']
 * @returns {THREE.MeshStandardMaterial}
 */
export function createPaintMaterial(hex, finish = 'matt') {
  const maps = generateTexture('plaster', textureSize('plaster'));
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex),
    roughness: FINISH_ROUGHNESS[finish] ?? FINISH_ROUGHNESS.matt,
    metalness: 0,
    normalMap: withRepeat(maps.normalMap, [1 / maps.tile[0], 1 / maps.tile[1]])
  });
  material.normalScale.set(0.12, 0.12);
  material.userData.paint = true;
  return material;
}

/**
 * Returns the material for an id, cached by id and options. Unknown ids log one error and get a
 * neutral grey material; this never throws.
 * @param {string} id material id (see `MATERIAL_IDS`)
 * @param {{ color?: string|number, roughness?: number, metalness?: number, repeat?: [number, number], finish?: string }} [opts]
 * @returns {THREE.Material}
 */
export function getMaterial(id, opts = {}) {
  const options = opts || {};
  const key = `${id}|${JSON.stringify(options)}`;
  if (cache.has(key)) return cache.get(key);
  let material;
  const factory = factories.get(id);
  try {
    if (!factory) throw new Error(`Unknown material id "${id}"`);
    material = factory(options);
  } catch (error) {
    if (!reported.has(id)) {
      reported.add(id);
      console.error(error);
    }
    material = applyOptions(new THREE.MeshStandardMaterial({ color: '#9a9a9a', roughness: 0.8 }), options);
  }
  material.name = material.name || id;
  cache.set(key, material);
  return material;
}

/**
 * Generates the procedural maps for the given ids ahead of time, yielding between maps so the
 * page stays responsive.
 * @param {string[]} ids material ids that will be needed
 * @returns {Promise<void>}
 */
export async function warmMaterials(ids) {
  const aliases = { road: 'asphalt', render: 'plaster', paint: 'plaster' };
  const wanted = [...new Set(ids.map((id) => aliases[id] || id))].filter((id) => PROCEDURAL_IDS.includes(id));
  for (const id of wanted) {
    if (isGenerated(id, textureSize(id))) continue;
    await new Promise((resolve) => setTimeout(resolve, 0));
    generateTexture(id, textureSize(id));
  }
}

/* ------------------------------------------------------------ built-in ids */

const tex = (textureId, base) => (opts) => applyOptions(textured(textureId, base, opts), opts);
const plain = (base, Kind = THREE.MeshStandardMaterial) => (opts) => applyOptions(new Kind({ ...base }), opts);

registerMaterial('paint', (opts) => createPaintMaterial(opts.color !== undefined ? new THREE.Color(opts.color).getStyle() : '#f3f5f2', opts.finish));
registerMaterial('plaster', tex('plaster', { roughness: 1, normalScale: 0.5 }));
registerMaterial('concrete', tex('concrete', { roughness: 1, normalScale: 0.8 }));
registerMaterial('marble', tex('marble', { roughness: 1, normalScale: 0.4 }));
registerMaterial('porcelain', tex('porcelain', { roughness: 1, normalScale: 0.5 }));
registerMaterial('oak-floor', tex('oak-floor', { roughness: 1, normalScale: 0.6 }));
registerMaterial('walnut', tex('walnut', { roughness: 1, normalScale: 0.3 }));
registerMaterial('stone-cladding', tex('stone-cladding', { roughness: 1, normalScale: 1 }));
registerMaterial('brick', tex('brick', { roughness: 1, normalScale: 0.9 }));
registerMaterial('fabric-linen', tex('fabric-linen', { roughness: 1, color: '#d8d2c6', normalScale: 0.6 }));
registerMaterial('leather', tex('leather', { roughness: 1, color: '#8a5a3c', normalScale: 0.5 }));
registerMaterial('lawn', tex('lawn', { roughness: 1, normalScale: 0.8 }));
registerMaterial('paving', tex('paving', { roughness: 1, normalScale: 0.8 }));
registerMaterial('asphalt', tex('asphalt', { roughness: 1, normalScale: 0.6 }));
registerMaterial('road', tex('asphalt', { roughness: 1, normalScale: 0.6 }));
registerMaterial('gravel', tex('gravel', { roughness: 1, normalScale: 1 }));
registerMaterial('brushed-steel', tex('brushed-steel', { roughness: 1, metalness: 1, normalScale: 0.2 }));
registerMaterial('carpet-tile', tex('carpet-tile', { roughness: 1, normalScale: 0.6 }));
registerMaterial('render', tex('plaster', { roughness: 1, normalScale: 0.7 }));

registerMaterial('glass', (opts) => applyOptions(new THREE.MeshPhysicalMaterial({
  color: '#dbe6e8', metalness: 0, roughness: 0.04, transmission: 0, transparent: true, opacity: 0.25,
  clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 2.2, side: THREE.DoubleSide, depthWrite: false
}), opts));
registerMaterial('glass-frosted', (opts) => applyOptions(new THREE.MeshPhysicalMaterial({
  color: '#eef2f3', metalness: 0, roughness: 0.55, transmission: 0, transparent: true, opacity: 0.72,
  clearcoat: 0.6, clearcoatRoughness: 0.3, side: THREE.DoubleSide, depthWrite: false
}), opts));
registerMaterial('chrome', plain({ color: '#f1f2f3', metalness: 1, roughness: 0.08 }));
registerMaterial('mirror', plain({ color: '#f4f5f6', metalness: 1, roughness: 0.02 }));
registerMaterial('aluminium-dark', plain({ color: '#3b3e41', metalness: 0.75, roughness: 0.42 }));
registerMaterial('acp', plain({ color: '#b8bcbf', metalness: 0.6, roughness: 0.32 }));
registerMaterial('metal-black', plain({ color: '#232527', metalness: 0.55, roughness: 0.45 }));
registerMaterial('ceramic-white', plain({ color: '#f3f2ee', metalness: 0, roughness: 0.22 }));
registerMaterial('rubber', plain({ color: '#1e1f21', metalness: 0, roughness: 0.92 }));
registerMaterial('section-cut', plain({ color: '#34373a', metalness: 0, roughness: 1 }));
registerMaterial('led', (opts) => {
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff6ea', emissiveIntensity: 1.6, roughness: 0.4 });
  if (opts.color !== undefined) material.emissive.set(opts.color);
  material.userData.lamp = true;
  return material;
});

/** Every registered id at load time. */
export const MATERIAL_IDS = [...factories.keys()];
