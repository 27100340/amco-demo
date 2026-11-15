/**
 * @typedef {object} KitContext
 * @property {typeof import('three')} THREE the three namespace
 * @property {(id: string, opts?: object) => import('three').Material} mat material factory
 * @property {(w: number, h: number, d: number, r: number, seg?: number) => import('three').BufferGeometry} rounded rounded box geometry factory
 * @property {'high'|'medium'|'low'} quality current quality tier
 */

/**
 * @typedef {object} KitDefinition
 * @property {(params: object, ctx: KitContext) => import('three').Object3D} build creates the kit's object
 * @property {[number, number]} [footprint] width and depth in metres
 */

const kits = new Map();

/**
 * Register a kit under an id, replacing any earlier one.
 * @param {string} id kit id
 * @param {KitDefinition} def kit definition
 */
export function registerKit(id, def) { kits.set(id, def); }

/**
 * Whether a kit id has been registered.
 * @param {string} id kit id
 * @returns {boolean} true when registered
 */
export function hasKit(id) { return kits.has(id); }

/**
 * Build a registered kit.
 * @param {string} id kit id
 * @param {object} [params] kit parameters
 * @param {KitContext} ctx build context
 * @returns {import('three').Object3D} the built object
 */
export function buildKit(id, params, ctx) {
  const kit = kits.get(id);
  if (!kit) { throw new Error(`Unknown kit ${id}`); }
  return kit.build(params || {}, ctx);
}

/**
 * List registered kit ids.
 * @returns {string[]} kit ids
 */
export function listKits() { return [...kits.keys()]; }
