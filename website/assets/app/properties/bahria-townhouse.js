/**
 * Showcase property: a compact 5 marla townhouse, double storey (Bahria Town style).
 * Plot 7.6 m × 13.7 m (25 ft × 45 ft) with the street to the south. A narrow front with a
 * brick-clad stair tower and ground floor, a rendered first floor with a small glass balcony,
 * and a 2.1 m boundary wall with an MS sliding gate.
 *
 * Ground floor: a stair hall with a straight stair, an L-shaped open lounge with dining and a
 * kitchenette at the back, and a powder room. First floor: a front bedroom, a second bedroom
 * with a desk nook, a bath and the upper landing.
 *
 * Plan coordinates in metres, x east, y north. Walls are authored pre-noded so their ids stay
 * stable; exterior walls run anticlockwise (L side inside).
 */

/** Exterior (9 inch) and internal (4½ inch) wall thicknesses. */
const EXT = 0.23;
const INT = 0.115;

/** Clear heights. */
const GROUND_CEILING = 3.05;
const FIRST_CEILING = 3.0;

/**
 * A wall record.
 * @param {string} id wall id
 * @param {string} level level id
 * @param {number[]} a start [x, y]
 * @param {number[]} b end [x, y]
 * @param {number} thickness metres
 * @param {object[]} [openings] openings along the wall
 * @param {object} [extra] extra fields (cladding)
 * @returns {object} wall
 */
function wall(id, level, a, b, thickness, openings = [], extra = {}) {
  return { id, level, a, b, thickness, role: thickness >= EXT ? 'exterior' : 'interior', openings, ...extra };
}

/**
 * A door opening.
 * @param {string} id opening id
 * @param {number} at centre, metres from the wall start
 * @param {number} [width] clear width
 * @param {string} [style] infill kit
 * @param {number} [height] head height
 * @returns {object} opening
 */
function door(id, at, width = 0.9, style = 'door.panel', height = 2.1) {
  return { id, type: 'door', at, width, height, sill: 0, style };
}

/**
 * A window opening.
 * @param {string} id opening id
 * @param {number} at centre, metres from the wall start
 * @param {number} width width
 * @param {number} height height
 * @param {number} sill sill height
 * @param {string} [style] infill kit
 * @returns {object} opening
 */
function win(id, at, width, height, sill, style = 'window.casement') {
  return { id, type: 'window', at, width, height, sill, style };
}

/**
 * A fixture record. Rotation is a compass bearing: 0 faces north, 90 east, 180 south, 270 west.
 * @param {string} kit kit id
 * @param {string} level level id
 * @param {number} x plan x
 * @param {number} y plan y
 * @param {number} [rotation] degrees
 * @param {object} [params] kit parameters
 * @returns {object} fixture
 */
function fx(kit, level, x, y, rotation = 0, params) {
  return params ? { kit, level, at: [x, y], rotation, params } : { kit, level, at: [x, y], rotation };
}

/** Brick slips on the outside (R side) of an anticlockwise exterior wall. */
const BRICK = { cladding: { right: 'brick' } };

/**
 * Stair well in the first-floor slab: the stair's width from where the flight climbs above 1 m up to
 * its top step. The floor stays over the foot of the flight. Every vertex sits just inside the landing.
 */
const STAIR_WELL = [[0.45, 4.1], [1.45, 4.1], [1.45, 7.8], [0.45, 7.8]];

const levels = [
  { id: 'g', name: 'Ground floor', elevation: 0, height: 3.3, ceiling: GROUND_CEILING, slab: 0.2 },
  { id: 'f', name: 'First floor', elevation: 3.3, height: 3.2, ceiling: FIRST_CEILING, slab: 0.2, parapet: 1.0, voids: [STAIR_WELL] }
];

const walls = [
  wall('g-s1', 'g', [0.3, 2.4], [2.5, 2.4], EXT, [door('g-door1', 1.6, 0.9, 'door.main', 2.2)], BRICK),
  wall('g-s2', 'g', [2.5, 2.4], [7.3, 2.4], EXT, [win('g-win1', 2.4, 2.4, 1.6, 0.7)], BRICK),
  wall('g-e', 'g', [7.3, 2.4], [7.3, 12.9], EXT, [win('g-win2', 6.2, 1.2, 1.4, 0.9)]),
  wall('g-n', 'g', [7.3, 12.9], [0.3, 12.9], EXT, [win('g-win3', 2.0, 1.2, 1.4, 0.9)]),
  wall('g-w1', 'g', [0.3, 12.9], [0.3, 10.6], EXT),
  wall('g-w2', 'g', [0.3, 10.6], [0.3, 8.6], EXT, [win('g-win4', 1.0, 0.5, 0.5, 1.7, 'window.fixed')]),
  wall('g-w3', 'g', [0.3, 8.6], [0.3, 2.4], EXT),
  wall('g-x1', 'g', [2.5, 2.4], [2.5, 8.6], INT, [{ id: 'g-arch1', type: 'opening', at: 3.4, width: 1.0, height: 2.3, sill: 0 }]),
  wall('g-x2', 'g', [2.5, 8.6], [2.5, 10.6], INT, [door('g-door2', 1.0, 0.75)]),
  wall('g-y1', 'g', [0.3, 8.6], [2.5, 8.6], INT),
  wall('g-y2', 'g', [0.3, 10.6], [2.5, 10.6], INT),

  wall('f-s1', 'f', [0.3, 2.4], [2.5, 2.4], EXT, [win('f-win1', 1.1, 0.8, 1.8, 0.6, 'window.fixed')], BRICK),
  wall('f-s2', 'f', [2.5, 2.4], [7.3, 2.4], EXT, [door('f-door1', 2.4, 1.8, 'door.glass-slider', 2.3)]),
  wall('f-e1', 'f', [7.3, 2.4], [7.3, 7.6], EXT),
  wall('f-e2', 'f', [7.3, 7.6], [7.3, 12.9], EXT, [win('f-win2', 2.6, 1.2, 1.4, 0.9)]),
  wall('f-n', 'f', [7.3, 12.9], [0.3, 12.9], EXT, [win('f-win3', 5.8, 1.5, 1.4, 0.9)]),
  wall('f-w1', 'f', [0.3, 12.9], [0.3, 10.6], EXT),
  wall('f-w2', 'f', [0.3, 10.6], [0.3, 8.6], EXT, [win('f-win4', 1.0, 0.5, 0.5, 1.7, 'window.fixed')]),
  wall('f-w3', 'f', [0.3, 8.6], [0.3, 2.4], EXT),
  wall('f-x1', 'f', [2.5, 2.4], [2.5, 7.6], INT, [door('f-door2', 4.3)]),
  wall('f-x2', 'f', [2.5, 7.6], [2.5, 8.6], INT, [door('f-door3', 0.5, 0.8)]),
  wall('f-x3', 'f', [2.5, 8.6], [2.5, 10.6], INT),
  wall('f-y1', 'f', [0.3, 8.6], [2.5, 8.6], INT, [door('f-door4', 1.6, 0.75)]),
  wall('f-y2', 'f', [0.3, 10.6], [2.5, 10.6], INT),
  wall('f-y3', 'f', [2.5, 7.6], [7.3, 7.6], INT)
];

const rooms = [
  { id: 'stair-hall', level: 'g', name: 'Stair hall', use: 'stair', at: [1.4, 5.5], floor: 'marble' },
  { id: 'lounge', level: 'g', name: 'Lounge and kitchenette', use: 'lounge', at: [4.9, 7.6], floor: 'porcelain' },
  { id: 'powder-room', level: 'g', name: 'Powder room', use: 'bath', at: [1.4, 9.6], floor: 'porcelain' },
  { id: 'landing', level: 'f', name: 'Upper landing', use: 'hall', at: [1.9, 5.5], floor: 'marble' },
  { id: 'bedroom', level: 'f', name: 'Bedroom', use: 'bedroom', at: [4.9, 5.0], floor: 'oak-floor' },
  { id: 'bath', level: 'f', name: 'Bath', use: 'bath', at: [1.4, 9.6], floor: 'porcelain' },
  { id: 'bedroom-2', level: 'f', name: 'Second bedroom', use: 'bedroom', at: [4.9, 10.2], floor: 'oak-floor' }
];

const g = 'g';
const f = 'f';

const fixtures = [
  /* Stair hall: straight stair along the west wall, rising north from beside the front door. */
  fx('stair.straight', g, 0.915, 5.215, 180, { height: 3.3, width: 1.0 }),
  fx('console.table', g, 2.27, 4.0, 270, { w: 1.0 }),
  fx('art.frame', g, 2.4425, 4.0, 270, { w: 0.6, h: 0.8, y: 1.6, seed: 10 }),
  fx('plant.floor', g, 1.0, 8.15, 0, { height: 1.4, seed: 21 }),
  fx('lamp.pendant', g, 1.9, 3.6, 0, { ceiling: GROUND_CEILING, drop: 0.8, style: 'globe' }),

  /* Lounge: sitting at the front, dining in the middle, kitchenette along the back wall. */
  fx('tv.unit', g, 2.7825, 4.4, 90, { w: 1.6 }),
  fx('sofa.3-seat', g, 6.715, 4.4, 270, { color: '#c3b8a6', accent: '#2a6e89' }),
  fx('armchair.lounge', g, 4.9, 3.05, 0, { color: '#6d5a48' }),
  fx('table.coffee', g, 4.9, 4.4, 90),
  fx('rug.rect', g, 4.9, 4.4, 90, { w: 2.6, d: 2.0, pattern: 'persian' }),
  fx('lamp.floor', g, 6.85, 2.95, 0),
  fx('art.frame', g, 7.185, 4.4, 270, { w: 1.2, h: 0.8, y: 1.7, seed: 11 }),
  fx('curtain.pair', g, 4.9, 2.515, 0, { width: 2.6, height: 2.85 }),
  fx('ac.split', g, 2.5575, 4.4, 90, { mount: 2.5 }),
  fx('fan.ceiling', g, 4.9, 4.6, 0, { ceiling: GROUND_CEILING }),
  fx('table.dining-4', g, 4.9, 8.2, 0, { wood: 'oak', color: '#e6dccb' }),
  fx('lamp.pendant', g, 4.9, 8.2, 0, { ceiling: GROUND_CEILING, drop: 1.15, style: 'dome' }),
  fx('curtain.pair', g, 7.185, 8.6, 270, { width: 1.5, height: 2.8 }),
  fx('kitchen.run', g, 2.0, 12.475, 180, { length: 3.0, ceiling: GROUND_CEILING, color: '#9aa595', worktop: 'concrete', splash: 'tile' }),
  fx('fridge', g, 4.0, 12.42, 180),
  fx('shelving.open', g, 7.01, 11.0, 270, { w: 1.0, seed: 5 }),
  fx('plant.floor', g, 6.68, 12.28, 0, { species: 'areca', seed: 3 }),
  fx('blind.roller', g, 5.3, 12.785, 180, { width: 1.2, height: 1.4, sill: 0.9 }),

  /* Powder room. */
  fx('bath.vanity', g, 1.0, 8.9075, 0, { w: 0.8, finish: 'lacquer' }),
  fx('bath.wc', g, 1.0, 10.2625, 180),

  /* Upper landing. */
  fx('plant.floor', f, 2.0, 2.95, 0, { height: 1.4, seed: 17 }),
  fx('art.frame', f, 2.4425, 4.4, 270, { w: 0.6, h: 0.8, y: 1.6, seed: 12 }),
  fx('balcony.rail', f, 1.52, 5.95, 90, { length: 3.7 }),
  fx('balcony.rail', f, 0.95, 4.03, 0, { length: 1.0 }),

  /* Front bedroom with balcony. */
  fx('bed.king', f, 6.085, 4.8, 270, { color: '#b3a796', accent: '#7f8f84' }),
  fx('nightstand', f, 6.975, 3.48, 270),
  fx('nightstand', f, 6.975, 6.12, 270),
  fx('rug.rect', f, 5.6, 4.8, 90, { w: 2.6, d: 1.8, pattern: 'border' }),
  fx('wardrobe.3door', f, 4.4, 7.2425, 180),
  fx('dresser', f, 2.7825, 4.2, 90),
  fx('art.frame', f, 7.185, 4.8, 270, { w: 1.2, h: 0.8, y: 1.75, seed: 13 }),
  fx('curtain.pair', f, 4.9, 2.515, 0, { width: 2.2, height: 2.85 }),
  fx('ac.split', f, 5.6, 7.5425, 180, { mount: 2.35 }),
  fx('fan.ceiling', f, 4.9, 4.8, 0, { ceiling: FIRST_CEILING }),

  /* Bath. */
  fx('bath.vanity', f, 1.0, 10.2925, 180, { w: 0.8 }),
  fx('bath.wc', f, 0.695, 9.4, 90),
  fx('bath.shower', f, 2.0, 10.1, 180),

  /* Second bedroom with a desk nook. */
  fx('bed.king', f, 4.9, 11.685, 180, { color: '#c9b3a6', accent: '#b07d62', duvet: '#efe6dc' }),
  fx('nightstand', f, 3.58, 12.575, 180),
  fx('nightstand', f, 6.22, 12.575, 180),
  fx('rug.rect', f, 4.9, 10.2, 0, { w: 2.4, d: 1.6, pattern: 'plain', color: '#c2b49e' }),
  fx('wardrobe.2door', f, 2.8575, 9.6, 90),
  fx('console.table', f, 1.45, 12.61, 180, { w: 1.2 }),
  fx('chair.task', f, 1.45, 12.0, 0, { color: '#6b5d52' }),
  fx('curtain.pair', f, 7.185, 10.2, 270, { width: 1.6, height: 2.8 }),
  fx('blind.roller', f, 1.5, 12.785, 180, { width: 1.5, height: 1.4, sill: 0.9 }),
  fx('ac.split', f, 4.9, 7.6575, 0, { mount: 2.35 }),
  fx('fan.ceiling', f, 4.9, 10.2, 0, { ceiling: FIRST_CEILING }),

  /* Façade and site. The street tree and the street light stand beyond the west end of the plot so
   * that, from the default three-quarter camera, neither crosses the façade. */
  fx('canopy.slab', g, 4.9, 2.285, 180, { width: 3.2, depth: 0.7, thickness: 0.15, y: 2.65 }),
  fx('canopy.slab', f, 4.9, 2.285, 180, { width: 2.6, depth: 1.0, thickness: 0.18, y: 0 }),
  fx('balcony.rail', f, 4.9, 1.325, 180, { length: 2.5 }),
  fx('balcony.rail', f, 3.64, 1.8, 90, { length: 0.95 }),
  fx('balcony.rail', f, 6.16, 1.8, 270, { length: 0.95 }),
  fx('canopy.slab', f, 3.8, 2.285, 180, { width: 7.4, depth: 0.6, thickness: 0.25, y: 3.2 }),
  fx('planter.box', g, 0.85, 1.9, 180, { w: 0.8, d: 0.4, h: 0.5 }),
  fx('planter.box', g, 6.85, 1.9, 180, { w: 0.8, d: 0.4, h: 0.5, seed: 6 }),
  fx('tree.ornamental', g, -0.7, -1.1, 0, { height: 4.2, seed: 41 }),
  fx('streetlight', g, -2.2, -1.0, 180),
  fx('ac.outdoor', f, 2.8, 12.0, 0, { elevation: 3.2 }),
  fx('tank.water', f, 1.3, 11.6, 0, { elevation: 3.2, color: '#3b5f86' })
];

/** Ceilings stay a clean white whatever the wall colours. */
const CEILINGS = Object.fromEntries(rooms.map((room) => [`${room.id}:ceiling`, 'AM-1009']));

/** @type {import('../model/schema.js').Building} */
const building = {
  schema: 'amco.building/1',
  id: 'bahria-townhouse',
  name: 'Compact townhouse, 5 marla',
  kind: 'house',
  source: 'showcase',
  levels,
  walls,
  rooms,
  site: {
    boundary: [[0, 0], [7.6, 0], [7.6, 13.7], [0, 13.7]],
    boundaryWall: { height: 2.1, thickness: 0.23, gates: [{ at: [4.4, 0], width: 3.0, style: 'gate.sliding' }] },
    ground: [
      { polygon: [[0.115, 0.115], [7.485, 0.115], [7.485, 2.285], [0.115, 2.285]], material: 'paving' },
      { polygon: [[0.115, 13.015], [7.485, 13.015], [7.485, 13.585], [0.115, 13.585]], material: 'paving' }
    ],
    street: { side: 'south', width: 7.5 }
  },
  fixtures,
  views: [
    { id: 'exterior', label: 'Outside', mode: 'exterior' },
    { id: 'dollhouse', label: 'Dollhouse', mode: 'dollhouse' },
    { id: 'room:lounge', label: 'Lounge and kitchenette', mode: 'room', level: 'g', room: 'lounge', position: [6.27, 11.05, 1.55], target: [4.31, 7.57, 1.31] },
    { id: 'room:bedroom', label: 'Bedroom', mode: 'room', level: 'f', room: 'bedroom', position: [3.1, 6.45, 1.5], target: [7.0, 3.5, 1.0] },
    { id: 'room:stair-hall', label: 'Stair hall', mode: 'room', level: 'g', room: 'stair-hall', position: [1.95, 2.75, 1.5], target: [1.0, 8.2, 1.7] }
  ],
  defaults: {
    paint: {
      '*': 'AM-1004',
      exterior: 'AM-1008',
      site: 'AM-7006',
      'group:f-s2:R:exterior': 'AM-7006',
      'room:stair-hall': 'AM-1006',
      'room:landing': 'AM-1006',
      'room:lounge': 'AM-1004',
      'room:powder-room': 'AM-1003',
      'room:bath': 'AM-5009',
      'room:bedroom': 'AM-1008',
      'room:bedroom-2': 'AM-1004',
      'group:g-x1:R:lounge': 'AM-5006',
      'group:f-e1:L:bedroom': 'AM-6008',
      'group:f-n:L:bedroom-2': 'AM-4006',
      ...CEILINGS
    },
    finish: 'matt'
  },
  meta: { address: 'Showcase: compact 5 marla townhouse, Bahria-style plot (fictional)' }
};

export default building;
