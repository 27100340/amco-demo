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
 * A kit builder for one model load: each distinct kit and parameter set is built once and every
 * placement gets a copy. Copies share the first build's geometry and materials, so they look the
 * same and cost a fraction of a build (a row of identical windows, a set of dining chairs). The
 * first build is kept aside, so later copies never inherit changes made to a placed copy.
 * @param {KitContext} ctx build context
 * @returns {(id: string, params?: object) => import('three').Object3D} builds or copies a kit; throws like `buildKit`
 */
export function createKitBuilder(ctx) {
  const templates = new Map();
  return (id, params = {}) => {
    const key = `${id}|${JSON.stringify(params)}`;
    if (!templates.has(key)) templates.set(key, buildKit(id, params, ctx));
    return templates.get(key).clone();
  };
}

/**
 * List registered kit ids.
 * @returns {string[]} kit ids
 */
export function listKits() { return [...kits.keys()]; }
