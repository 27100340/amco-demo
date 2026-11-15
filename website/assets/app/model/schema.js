/**
 * Building Model schema `amco.building/1`: type definitions, constructor, validation and
 * room-use guessing. Units are metres; plan coordinates are `[x, y]` with x east and y north,
 * mapping to world space as `(x, elevation, -y)`.
 * Pure module: no DOM, no three.js.
 */
import { distance } from './geometry.js';
import { roomPolygons } from './surfaces.js';

/**
 * @typedef {[number, number]} Point plan coordinates in metres (x east, y north)
 */

/**
 * @typedef {object} Building
 * @property {'amco.building/1'} schema
 * @property {string} id
 * @property {string} name
 * @property {'house'|'office'|'shop'|'mixed'} kind
 * @property {'showcase'|'dxf'|'trace'} source
 * @property {Level[]} levels
 * @property {Wall[]} walls
 * @property {Room[]} rooms
 * @property {Site} [site]
 * @property {Fixture[]} [fixtures]
 * @property {View[]} [views]
 * @property {{ paint: Object<string, string>, finish: 'matt'|'silk'|'gloss' }} [defaults]
 *   paint maps a selector (see `resolveSelector`) to a shade code
 * @property {{ address?: string, drawings?: object[], warnings?: string[] }} [meta]
 */

/**
 * @typedef {object} Level
 * @property {string} id
 * @property {string} name
 * @property {number} elevation finished floor level
 * @property {number} height floor to floor
 * @property {number} ceiling clear height; the default wall height
 * @property {number} slab slab thickness
 * @property {number} [parapet] parapet height, top level only
 */

/**
 * @typedef {object} Wall
 * @property {string} id
 * @property {string} level level id
 * @property {Point} a start of the centreline
 * @property {Point} b end of the centreline; side L is to the left of a→b, R to the right
 * @property {number} thickness
 * @property {number} [height] defaults to the level's ceiling
 * @property {'exterior'|'interior'|'partition'|'glass'} [role]
 * @property {Opening[]} openings
 * @property {{ left?: string, right?: string }} [cladding] non-paint material id on a side
 */

/**
 * @typedef {object} Opening
 * @property {string} id
 * @property {'door'|'window'|'opening'|'shopfront'|'garage'} type
 * @property {number} at centre, metres from the wall's a end
 * @property {number} width
 * @property {number} height
 * @property {number} sill height of the bottom above the floor (0 for doors)
 * @property {string} [tag] schedule tag such as 'D1'
 * @property {string} [style] kit id for the infill
 */

/**
 * @typedef {object} Room
 * @property {string} id
 * @property {string} level level id
 * @property {string} name
 * @property {string} use one of ROOM_USES
 * @property {Point} [at] label point; the room outline is the wall-graph face containing it
 * @property {Point[]} [polygon] explicit outline, used instead of `at` when present
 * @property {string} [floor] floor material id
 * @property {string} [ceiling] ceiling material id
 */

/**
 * @typedef {object} Site
 * @property {Point[]} boundary plot boundary polygon
 * @property {{ height: number, thickness: number, gates: { at: Point, width: number, style?: string }[] }} [boundaryWall]
 * @property {{ polygon: Point[], material: 'lawn'|'paving'|'road'|'gravel' }[]} ground
 * @property {{ side: string, width: number }} [street]
 */

/**
 * @typedef {object} Fixture
 * @property {string} kit registered kit id
 * @property {string} level level id
 * @property {Point} at
 * @property {number} rotation degrees
 * @property {object} [params]
 */

/**
 * @typedef {object} View
 * @property {string} id
 * @property {string} label
 * @property {'exterior'|'dollhouse'|'room'} mode
 * @property {string} [level]
 * @property {string} [room]
 * @property {number[]} [position]
 * @property {number[]} [target]
 */

/**
 * @typedef {object} SurfaceOpening
 * @property {string} id opening id (gates on the boundary wall are 'gate-1', 'gate-2', …)
 * @property {number} start metres along the face, same coordinate as t0/t1
 * @property {number} end
 * @property {number} sill bottom above the floor
 * @property {number} head top above the floor
 */

/**
 * @typedef {object} Surface a paintable face, derived by `deriveSurfaces` and never stored
 * @property {string} id `${wallId}:L`, `${wallId}:R`, `${roomId}:ceiling`, 'site:inner' or 'site:outer'
 * @property {string} group paint group: `${baseWallId}:${side}:${room}` for wall faces (base id =
 *   wall id without its `~N` suffix, so split pieces facing one room share a group); equals `id`
 *   for ceilings and site surfaces. Select it with `'group:<group>'`.
 * @property {string | null} wallId noded wall id (may be `${id}~2` for split walls); null for ceilings and site
 * @property {'L'|'R'|'C'|'inner'|'outer'} side 'C' marks a ceiling
 * @property {string | null} level level id; null for the site
 * @property {string} room room id, 'exterior' or 'site'
 * @property {string} label e.g. "Lounge, north wall", "Outside, east-facing wall"
 * @property {number | null} t0 face start, metres along the wall from its a end (null for ceilings)
 * @property {number | null} t1 face end
 * @property {number | null} height face height
 * @property {number} grossArea m² before openings
 * @property {number} area m² net of openings
 * @property {SurfaceOpening[]} openings clipped to the face
 * @property {string} [cladding] material id when the face is clad rather than painted
 */

/** Schema identifier written into every building. */
export const SCHEMA = 'amco.building/1';

/** Every allowed `room.use`. */
export const ROOM_USES = ['living', 'drawing', 'lounge', 'dining', 'kitchen', 'bedroom', 'bath', 'study', 'hall', 'stair', 'store', 'porch', 'balcony', 'office', 'reception', 'meeting', 'pantry', 'shop', 'cafe', 'fitting', 'corridor', 'other'];

/** Room ids that would collide with the `room` value of exterior and site surfaces. */
const RESERVED_ROOM_IDS = ['exterior', 'site'];
/** Wall ids whose surface ids would read as a selector (`room:…`, `group:…`, `site:…`). */
const RESERVED_WALL_IDS = ['room', 'group', 'site'];

/** Slack (m) allowed when checking openings against wall lengths and heights. */
const LENGTH_TOLERANCE = 1e-6;

/** Room-name keywords, checked in order; the first match wins. */
const ROOM_USE_RULES = [
  ['bath', /\b(?:bath|toilet|wash|powder|w\.?c\b)/],
  ['shop', /\b(?:shop|store\s*front)/],
  ['bedroom', /\b(?:bed|master)/],
  ['lounge', /\b(?:lounge|tv|family)/],
  ['living', /\b(?:living|sitting)/],
  ['drawing', /\bdrawing/],
  ['dining', /\bdining/],
  ['kitchen', /\bkitchen/],
  ['store', /\bstore/],
  ['stair', /\bstair/],
  ['porch', /\b(?:porch|car\b)/],
  ['balcony', /\b(?:balcon|terrace)/],
  ['office', /\b(?:office|work)/],
  ['reception', /\b(?:reception|lobby)/],
  ['meeting', /\b(?:meeting|conference|board)/],
  ['pantry', /\bpantry/],
  ['cafe', /\bcafe/],
  ['fitting', /\b(?:fitting|changing)/],
  ['corridor', /\b(?:corridor|passage)/],
  ['hall', /\bhall/],
  ['study', /\bstudy/],
  ['bedroom', /\bguest/]
];

/**
 * Creates an empty building.
 * @param {{ id?: string, name?: string, kind?: Building['kind'], source?: Building['source'] }} [init]
 * @returns {Building} with empty levels, walls, rooms, fixtures and views
 */
export function createBuilding({ id, name, kind, source } = {}) {
  return {
    schema: SCHEMA,
    id,
    name,
    kind: kind ?? 'house',
    source: source ?? 'trace',
    levels: [],
    walls: [],
    rooms: [],
    fixtures: [],
    views: []
  };
}

/**
 * True when `p` is an `[x, y]` pair of finite numbers.
 * @param {unknown} p
 * @returns {boolean}
 */
function isPoint(p) {
  return Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
}

/**
 * Formats metres for messages.
 * @param {number} value
 * @returns {string}
 */
function metres(value) {
  return value.toFixed(2);
}

/**
 * Records missing and duplicate ids for one kind of item.
 * @param {object[]} items
 * @param {string} kind
 * @param {string[]} errors
 * @param {(item: object, index: number) => string} [describe] how to name an item without an id
 * @returns {Map<string, object>} items by id
 */
function indexIds(items, kind, errors, describe = (_, i) => `${kind} ${i + 1}`) {
  const byId = new Map();
  items.forEach((item, i) => {
    const id = item?.id;
    if (id === undefined || id === null || id === '') {
      errors.push(`${describe(item, i)} has no id`);
    } else if (byId.has(id)) {
      errors.push(`duplicate ${kind} id "${id}"`);
    } else {
      byId.set(id, item);
    }
  });
  return byId;
}

/**
 * Checks one wall and its openings.
 * @param {Wall} wall
 * @param {Map<string, Level>} levels
 * @param {string[]} errors
 * @param {string[]} warnings
 */
function checkWall(wall, levels, errors, warnings) {
  const name = `wall "${wall.id}"`;
  if (RESERVED_WALL_IDS.includes(wall.id)) errors.push(`wall id "${wall.id}" is reserved`);
  if (typeof wall.id === 'string' && wall.id.includes(':')) errors.push(`wall id "${wall.id}" must not contain ":"`);
  const level = levels.get(wall.level);
  if (!level) errors.push(`${name} is on unknown level "${wall.level}"`);
  if (!(Number.isFinite(wall.thickness) && wall.thickness > 0)) errors.push(`${name} must have a thickness above zero`);
  if (wall.height !== undefined && !(Number.isFinite(wall.height) && wall.height > 0)) {
    errors.push(`${name} must have a height above zero`);
  }
  if (wall.openings !== undefined && !Array.isArray(wall.openings)) errors.push(`${name} openings must be a list`);
  if (!isPoint(wall.a) || !isPoint(wall.b)) {
    errors.push(`${name} needs two end points`);
    return;
  }
  const len = distance(wall.a, wall.b);
  if (len < LENGTH_TOLERANCE) errors.push(`${name} has zero length`);
  const wallHeight = wall.height ?? level?.ceiling;
  const spans = [];
  for (const o of Array.isArray(wall.openings) ? wall.openings : []) {
    const label = `opening "${o?.id}"`;
    if (!(Number.isFinite(o?.width) && o.width > 0 && Number.isFinite(o.height) && o.height > 0)) {
      errors.push(`${label} on ${name} needs a width and height above zero`);
      continue;
    }
    if (!Number.isFinite(o.at)) {
      errors.push(`${label} on ${name} has no position`);
      continue;
    }
    const start = o.at - o.width / 2;
    const end = o.at + o.width / 2;
    if (start < -LENGTH_TOLERANCE || end > len + LENGTH_TOLERANCE) {
      errors.push(`${label} overruns ${name} (${metres(start)} to ${metres(end)} m on a ${metres(len)} m wall)`);
    }
    const top = (o.sill ?? 0) + o.height;
    if (Number.isFinite(wallHeight) && top > wallHeight + LENGTH_TOLERANCE) {
      warnings.push(`${label} on ${name} is taller than the wall (top at ${metres(top)} m, wall ${metres(wallHeight)} m)`);
    }
    spans.push({ id: o.id, start, end });
  }
  spans.sort((x, y) => x.start - y.start);
  let reach = null;
  for (const span of spans) {
    if (reach && span.start < reach.end - LENGTH_TOLERANCE) {
      errors.push(`openings "${reach.id}" and "${span.id}" overlap on ${name}`);
    }
    if (!reach || span.end > reach.end) reach = span;
  }
}

/**
 * Validates a building: references between items, degenerate walls, openings that overrun their
 * wall or overlap each other, rooms that cannot be given a shape, and reserved ids (rooms may not be
 * called 'exterior' or 'site'; walls may not be called 'room', 'group' or 'site', or contain ':').
 * @param {Building} building
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }} `ok` is true when there are no errors
 */
export function validateBuilding(building) {
  const errors = [];
  const warnings = [];
  if (!building || typeof building !== 'object') {
    return { ok: false, errors: ['the building must be an object'], warnings };
  }
  if (building.schema !== SCHEMA) errors.push(`schema must be "${SCHEMA}"`);
  if (building.id === undefined || building.id === null || building.id === '') errors.push('building has no id');
  for (const key of ['levels', 'walls', 'rooms']) {
    if (!Array.isArray(building[key])) errors.push(`building.${key} must be a list`);
  }
  for (const key of ['fixtures', 'views']) {
    if (building[key] !== undefined && !Array.isArray(building[key])) errors.push(`building.${key} must be a list`);
  }
  const list = (key) => (Array.isArray(building[key]) ? building[key] : []);
  const walls = list('walls');
  const rooms = list('rooms');

  const levels = indexIds(list('levels'), 'level', errors);
  for (const level of levels.values()) {
    if (!(Number.isFinite(level.ceiling) && level.ceiling > 0)) errors.push(`level "${level.id}" needs a ceiling height above zero`);
  }
  indexIds(walls, 'wall', errors);
  indexIds(rooms, 'room', errors);
  const openings = walls.flatMap((wall) => (Array.isArray(wall?.openings) ? wall.openings.map((o) => ({ o, wall })) : []));
  indexIds(openings.map(({ o }) => o), 'opening', errors, (_, i) => `opening ${i + 1} on wall "${openings[i].wall.id}"`);

  for (const wall of walls) checkWall(wall, levels, errors, warnings);

  for (const room of rooms) {
    if (RESERVED_ROOM_IDS.includes(room.id)) errors.push(`room id "${room.id}" is reserved`);
    if (!levels.has(room.level)) errors.push(`room "${room.id}" is on unknown level "${room.level}"`);
    if (!ROOM_USES.includes(room.use)) warnings.push(`room "${room.id}" has an unknown use "${room.use}"`);
    const hasPolygon = Array.isArray(room.polygon) && room.polygon.length >= 3;
    if (!hasPolygon && !isPoint(room.at)) warnings.push(`room "${room.id}" has neither a polygon nor a label point`);
  }

  list('fixtures').forEach((fixture, i) => {
    if (!levels.has(fixture?.level)) errors.push(`fixture ${i + 1} (${fixture?.kit}) is on unknown level "${fixture?.level}"`);
  });

  if (errors.length === 0) {
    const shaped = roomPolygons(building);
    for (const room of rooms) {
      if (isPoint(room.at) && !shaped.has(room.id)) {
        warnings.push(`room "${room.id}" label point is not inside a closed loop of walls`);
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Guesses a room use from its name, e.g. 'Master Bedroom' -> 'bedroom', 'TV Lounge' -> 'lounge',
 * 'Car Porch' -> 'porch'.
 * @param {string} name
 * @returns {string} one of ROOM_USES ('other' when nothing matches)
 */
export function guessRoomUse(name) {
  if (typeof name !== 'string') return 'other';
  const text = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const rule = ROOM_USE_RULES.find(([, pattern]) => pattern.test(text));
  return rule ? rule[0] : 'other';
}
