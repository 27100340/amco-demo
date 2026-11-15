/**
 * Showcase property: a contemporary 10 marla family home, double storey (DHA style).
 * Plot 10.7 m × 19.8 m (35 ft × 65 ft) with the street to the south. White render with a
 * stone-clad stair tower, a timber louvre screen, cantilevered slab canopies, a glass balcony
 * rail over the car porch, a 2.1 m boundary wall with an MS sliding gate, lawn and driveway.
 *
 * Plan coordinates in metres, x east, y north. Walls are authored pre-noded (split wherever
 * another wall ends on them) so their ids stay stable. Exterior walls run anticlockwise, so
 * their L side faces into the house.
 */

/** Exterior (9 inch) and internal (4½ inch) wall thicknesses. */
const EXT = 0.23;
const INT = 0.115;

/** Clear heights. */
const GROUND_CEILING = 3.2;
const FIRST_CEILING = 3.05;

/**
 * A wall record.
 * @param {string} id wall id
 * @param {string} level level id
 * @param {number[]} a start [x, y]
 * @param {number[]} b end [x, y]
 * @param {number} thickness metres
 * @param {object[]} [openings] openings along the wall
 * @param {object} [extra] extra fields (cladding, role)
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
 * A plain walk-through opening (archway) with no infill.
 * @param {string} id opening id
 * @param {number} at centre, metres from the wall start
 * @param {number} width width
 * @returns {object} opening
 */
function arch(id, at, width) {
  return { id, type: 'opening', at, width, height: 2.4, sill: 0 };
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

/** Stone cladding on the outside (R side) of an anticlockwise exterior wall. */
const STONE = { cladding: { right: 'stone-cladding' } };

const levels = [
  { id: 'g', name: 'Ground floor', elevation: 0, height: 3.4, ceiling: GROUND_CEILING, slab: 0.2 },
  { id: 'f', name: 'First floor', elevation: 3.4, height: 3.25, ceiling: FIRST_CEILING, slab: 0.2, parapet: 1.0 }
];

const walls = [
  wall('g-s1', 'g', [0.4, 5.8], [4.6, 5.8], EXT, [win('g-win1', 2.1, 2.4, 1.8, 0.6)]),
  wall('g-s2', 'g', [4.6, 5.8], [7.4, 5.8], EXT, [door('g-door1', 1.4, 1.2, 'door.main', 2.4)]),
  wall('g-s3', 'g', [7.4, 5.8], [10.3, 5.8], EXT, [win('g-win2', 1.45, 1.0, 2.2, 0.8, 'window.fixed')], STONE),
  wall('g-e1', 'g', [10.3, 5.8], [10.3, 10.2], EXT, [], STONE),
  wall('g-e2', 'g', [10.3, 10.2], [10.3, 15.0], EXT, [win('g-win3', 2.4, 1.8, 1.5, 0.9)]),
  wall('g-e3', 'g', [10.3, 15.0], [10.3, 18.6], EXT),
  wall('g-n1', 'g', [10.3, 18.6], [5.4, 18.6], EXT, [win('g-win4', 1.6, 1.5, 1.5, 0.9)]),
  wall('g-n2', 'g', [5.4, 18.6], [0.4, 18.6], EXT),
  wall('g-w1', 'g', [0.4, 18.6], [0.4, 15.0], EXT, [win('g-win5', 1.8, 1.2, 1.2, 1.05)]),
  wall('g-w2', 'g', [0.4, 15.0], [0.4, 10.2], EXT, [win('g-win6', 3.8, 1.2, 1.5, 0.9)]),
  wall('g-w3', 'g', [0.4, 10.2], [0.4, 5.8], EXT),
  wall('g-a', 'g', [4.6, 5.8], [4.6, 10.2], INT, [door('g-door2', 3.2)]),
  wall('g-c', 'g', [7.4, 5.8], [7.4, 10.2], INT),
  wall('g-b1', 'g', [0.4, 10.2], [4.6, 10.2], INT),
  wall('g-b2', 'g', [4.6, 10.2], [7.4, 10.2], INT, [arch('g-arch1', 1.4, 1.6)]),
  wall('g-b3', 'g', [7.4, 10.2], [10.3, 10.2], INT, [arch('g-arch2', 2.0, 1.1)]),
  wall('g-k1', 'g', [0.4, 15.0], [5.4, 15.0], INT, [arch('g-arch3', 4.4, 1.0)]),
  wall('g-k2', 'g', [5.4, 15.0], [10.3, 15.0], INT, [door('g-door3', 2.0)]),
  wall('g-f', 'g', [5.4, 15.0], [5.4, 18.6], INT),

  wall('f-s1', 'f', [0.4, 5.8], [7.4, 5.8], EXT, [win('f-win1', 1.8, 1.5, 1.6, 0.8), door('f-door1', 5.0, 2.4, 'door.glass-slider', 2.4)]),
  wall('f-s2', 'f', [7.4, 5.8], [10.3, 5.8], EXT, [win('f-win2', 1.45, 1.0, 2.2, 0.4, 'window.fixed')], STONE),
  wall('f-e1', 'f', [10.3, 5.8], [10.3, 10.2], EXT, [], STONE),
  wall('f-e2', 'f', [10.3, 10.2], [10.3, 15.0], EXT, [win('f-win3', 2.4, 1.8, 1.5, 0.9)]),
  wall('f-e3', 'f', [10.3, 15.0], [10.3, 18.6], EXT, [win('f-win4', 1.8, 1.2, 1.5, 0.9)]),
  wall('f-n1', 'f', [10.3, 18.6], [5.4, 18.6], EXT, [win('f-win5', 2.45, 1.5, 1.5, 0.9)]),
  wall('f-n2', 'f', [5.4, 18.6], [0.4, 18.6], EXT, [win('f-win6', 2.5, 1.8, 1.5, 0.9)]),
  wall('f-w1', 'f', [0.4, 18.6], [0.4, 15.0], EXT),
  wall('f-w2', 'f', [0.4, 15.0], [0.4, 12.6], EXT, [win('f-win7', 1.2, 0.6, 0.6, 1.6, 'window.fixed')]),
  wall('f-w3', 'f', [0.4, 12.6], [0.4, 10.2], EXT, [win('f-win8', 1.2, 0.6, 0.6, 1.6, 'window.fixed')]),
  wall('f-w4', 'f', [0.4, 10.2], [0.4, 5.8], EXT),
  wall('f-c', 'f', [7.4, 5.8], [7.4, 10.2], INT),
  wall('f-b1', 'f', [0.4, 10.2], [3.4, 10.2], INT, [door('f-door2', 2.4, 0.8)]),
  wall('f-b2', 'f', [3.4, 10.2], [7.4, 10.2], INT, [door('f-door3', 3.3)]),
  wall('f-b3', 'f', [7.4, 10.2], [10.3, 10.2], INT, [arch('f-arch1', 0.8, 1.2)]),
  wall('f-x1', 'f', [3.4, 10.2], [3.4, 12.6], INT),
  wall('f-x2', 'f', [3.4, 12.6], [3.4, 15.0], INT, [door('f-door4', 1.2, 0.8)]),
  wall('f-m', 'f', [0.4, 12.6], [3.4, 12.6], INT),
  wall('f-k1', 'f', [0.4, 15.0], [3.4, 15.0], INT),
  wall('f-k2', 'f', [3.4, 15.0], [5.4, 15.0], INT, [door('f-door5', 1.0)]),
  wall('f-k3', 'f', [5.4, 15.0], [10.3, 15.0], INT, [door('f-door6', 0.9)]),
  wall('f-f', 'f', [5.4, 15.0], [5.4, 18.6], INT)
];

const rooms = [
  { id: 'drawing-room', level: 'g', name: 'Drawing room', use: 'drawing', at: [2.5, 8.0], floor: 'marble' },
  { id: 'hall', level: 'g', name: 'Entrance hall', use: 'hall', at: [6.0, 8.0], floor: 'marble' },
  { id: 'stair', level: 'g', name: 'Stair hall', use: 'stair', at: [8.85, 8.0], floor: 'marble' },
  { id: 'lounge', level: 'g', name: 'Lounge and dining', use: 'lounge', at: [5.3, 12.6], floor: 'marble' },
  { id: 'kitchen', level: 'g', name: 'Kitchen', use: 'kitchen', at: [2.9, 16.8], floor: 'porcelain' },
  { id: 'guest-bedroom', level: 'g', name: 'Guest bedroom', use: 'bedroom', at: [7.8, 16.8], floor: 'oak-floor' },
  { id: 'master-bedroom', level: 'f', name: 'Master bedroom', use: 'bedroom', at: [3.9, 8.0], floor: 'oak-floor' },
  { id: 'landing', level: 'f', name: 'Upper landing', use: 'hall', at: [8.85, 8.0], floor: 'marble' },
  { id: 'master-bath', level: 'f', name: 'Master bath', use: 'bath', at: [1.9, 11.4], floor: 'porcelain' },
  { id: 'kids-bath', level: 'f', name: 'Kids\' bath', use: 'bath', at: [1.9, 13.8], floor: 'porcelain' },
  { id: 'family-lounge', level: 'f', name: 'Family lounge', use: 'lounge', at: [6.8, 12.6], floor: 'marble' },
  { id: 'kids-bedroom', level: 'f', name: 'Kids\' bedroom', use: 'bedroom', at: [2.9, 16.8], floor: 'oak-floor' },
  { id: 'study', level: 'f', name: 'Study', use: 'study', at: [7.85, 16.8], floor: 'oak-floor' }
];

const g = 'g';
const f = 'f';

const fixtures = [
  /* Drawing room: formal sitting, sofa on the north wall facing the front window. */
  fx('rug.rect', g, 2.45, 8.2, 0, { w: 2.8, d: 2.2, pattern: 'persian' }),
  fx('sofa.3-seat', g, 2.45, 9.67, 180, { color: '#d8d0c2', accent: '#7d6a55' }),
  fx('armchair.lounge', g, 0.98, 8.1, 90, { color: '#8c7a64' }),
  fx('armchair.lounge', g, 3.92, 8.1, 270, { color: '#8c7a64' }),
  fx('table.coffee', g, 2.45, 8.15, 0),
  fx('table.side', g, 1.0, 9.7, 0),
  fx('table.side', g, 3.9, 9.7, 0),
  fx('lamp.table', g, 1.0, 9.7, 0, { elevation: 0.555 }),
  fx('lamp.table', g, 3.9, 9.7, 0, { elevation: 0.555 }),
  fx('art.frame', g, 2.45, 10.1425, 180, { w: 1.5, h: 0.9, y: 1.8, seed: 1 }),
  fx('art.frame', g, 0.515, 8.1, 90, { w: 0.7, h: 0.9, y: 1.75, seed: 18 }),
  fx('curtain.pair', g, 2.5, 5.915, 0, { width: 2.6, height: 3.0 }),
  fx('plant.floor', g, 0.9, 6.35, 0),
  fx('console.table', g, 4.37, 6.9, 270),
  fx('mirror.round', g, 4.5425, 6.9, 270, { d: 0.8, y: 1.6 }),
  fx('ac.split', g, 0.515, 6.7, 90, { mount: 2.5 }),

  /* Entrance hall. */
  fx('rug.rect', g, 6.0, 7.9, 0, { w: 1.6, d: 2.4, pattern: 'border' }),
  fx('console.table', g, 7.17, 7.6, 270),
  fx('mirror.round', g, 7.3425, 7.6, 270, { d: 0.8, y: 1.6 }),
  fx('plant.floor', g, 5.15, 6.42, 0, { species: 'areca' }),
  fx('art.frame', g, 4.6575, 7.2, 90, { w: 0.9, h: 1.2, y: 1.6, seed: 2 }),
  fx('lamp.pendant', g, 6.0, 8.0, 0, { ceiling: GROUND_CEILING, drop: 1.0, style: 'globe' }),

  /* Stair hall: dog-leg stair rising south to a half landing at the façade, then north. */
  fx('stair.dogleg', g, 8.82, 8.03, 0, { height: 3.4, width: 2.6, length: 4.15, clip: GROUND_CEILING }),

  /* Lounge (west half) and dining (east half). */
  fx('tv.unit', g, 0.74, 13.3, 90),
  fx('sofa.l-shape', g, 3.45, 13.3, 270, { color: '#c9c1b3', accent: '#55665a' }),
  fx('table.coffee', g, 2.05, 13.0, 90, { top: 'walnut', frame: 'black' }),
  fx('rug.rect', g, 2.2, 13.2, 90, { w: 3.0, d: 2.4, pattern: 'abstract' }),
  fx('armchair.lounge', g, 2.0, 11.0, 0, { color: '#6f7b70' }),
  fx('lamp.floor', g, 2.95, 11.0, 0),
  fx('plant.floor', g, 0.9, 14.56, 0, { seed: 4 }),
  fx('art.frame', g, 2.2, 14.9425, 180, { w: 1.2, h: 0.8, y: 1.7, seed: 3 }),
  fx('ac.split', g, 2.5, 10.2575, 0, { mount: 2.6 }),
  fx('fan.ceiling', g, 2.4, 12.8, 0, { ceiling: GROUND_CEILING }),
  fx('curtain.pair', g, 0.515, 11.2, 90, { width: 1.6, height: 3.0 }),
  fx('table.dining-6', g, 8.3, 12.6, 0),
  fx('lamp.pendant', g, 8.3, 12.6, 0, { ceiling: GROUND_CEILING, drop: 1.25, count: 3, spacing: 0.55, finish: 'brass' }),
  fx('console.table', g, 9.3, 14.77, 180),
  fx('art.frame', g, 9.3, 14.9425, 180, { w: 1.2, h: 0.9, y: 1.75, seed: 4 }),
  fx('plant.floor', g, 6.4, 14.5, 0, { seed: 8 }),
  fx('curtain.pair', g, 10.185, 12.6, 270, { width: 2.2, height: 3.0 }),
  fx('ac.split', g, 10.185, 14.4, 270, { mount: 2.6 }),

  /* Kitchen: run along the north wall, island with stools, fridge. */
  fx('kitchen.run', g, 2.4, 18.175, 180, { length: 3.6, ceiling: GROUND_CEILING }),
  fx('fridge', g, 4.75, 18.12, 180),
  fx('kitchen.island', g, 2.5, 16.37, 0, { w: 1.8, stools: 2 }),
  fx('lamp.pendant', g, 2.5, 16.37, 0, { ceiling: GROUND_CEILING, drop: 1.1, count: 2, spacing: 0.8, style: 'cone' }),
  fx('blind.roller', g, 0.515, 16.8, 90, { width: 1.2, height: 1.2, sill: 1.05 }),

  /* Guest bedroom. */
  fx('bed.king', g, 9.085, 16.8, 270, { color: '#a59a8a', accent: '#7a6a58' }),
  fx('nightstand', g, 9.975, 15.42, 270),
  fx('nightstand', g, 9.975, 18.18, 270),
  fx('rug.rect', g, 8.6, 16.8, 90, { w: 2.6, d: 1.8, pattern: 'plain', color: '#b9ab96' }),
  fx('wardrobe.3door', g, 5.7575, 17.4, 90),
  fx('dresser', g, 6.9, 18.26, 180),
  fx('art.frame', g, 10.185, 16.8, 270, { w: 1.2, h: 0.8, y: 1.75, seed: 5 }),
  fx('curtain.pair', g, 8.7, 18.485, 180, { width: 1.9, height: 2.9 }),
  fx('ac.split', g, 8.6, 15.0575, 0, { mount: 2.4 }),
  fx('fan.ceiling', g, 7.8, 16.8, 0, { ceiling: GROUND_CEILING }),

  /* Master bedroom (first floor, front). */
  fx('bed.king', f, 1.615, 8.0, 90, { color: '#8f877b', accent: '#5f6f7a' }),
  fx('nightstand', f, 0.725, 6.66, 90),
  fx('nightstand', f, 0.725, 9.34, 90),
  fx('rug.rect', f, 2.4, 8.0, 90, { w: 2.8, d: 2.0, pattern: 'border' }),
  fx('ottoman', f, 3.15, 8.0, 90, { color: '#8f877b' }),
  fx('wardrobe.3door', f, 4.0, 9.84, 180),
  fx('wardrobe.2door', f, 5.25, 9.84, 180),
  fx('tv.unit', f, 7.1175, 8.0, 270, { w: 1.6 }),
  fx('lamp.floor', f, 3.85, 6.3, 0),
  fx('plant.floor', f, 6.95, 6.3, 0, { seed: 12 }),
  fx('art.frame', f, 0.515, 8.0, 90, { w: 1.6, h: 0.9, y: 1.85, seed: 6 }),
  fx('curtain.pair', f, 5.4, 5.915, 0, { width: 2.8, height: 2.95 }),
  fx('curtain.pair', f, 2.2, 5.915, 0, { width: 1.9, height: 2.95 }),
  fx('ac.split', f, 7.3425, 9.4, 270, { mount: 2.4 }),
  fx('fan.ceiling', f, 3.9, 8.0, 0, { ceiling: FIRST_CEILING }),

  /* Upper landing. */
  fx('plant.floor', f, 9.6, 6.5, 0, { species: 'areca', seed: 6 }),
  fx('art.frame', f, 10.185, 8.0, 270, { w: 1.0, h: 1.4, y: 1.6, seed: 7 }),
  fx('ottoman', f, 9.85, 8.0, 270, { color: '#7c8a7a' }),

  /* Master bath. */
  fx('bath.vanity', f, 1.6, 12.2925, 180, { w: 1.0 }),
  fx('bath.wc', f, 2.8, 12.2625, 180),
  fx('bath.shower', f, 0.975, 10.72, 0),

  /* Kids' bath. */
  fx('bath.vanity', f, 1.6, 14.6925, 180, { w: 0.9, finish: 'lacquer' }),
  fx('bath.wc', f, 2.2, 12.9375, 0),
  fx('bath.shower', f, 0.975, 13.12, 0),

  /* Family lounge (first floor). */
  fx('tv.unit', f, 3.6825, 11.4, 90, { w: 1.6 }),
  fx('sofa.3-seat', f, 5.6, 11.4, 270, { color: '#b9b2a6', accent: '#a46b4f' }),
  fx('table.coffee', f, 4.4, 11.4, 90),
  fx('rug.rect', f, 4.6, 11.4, 90, { w: 2.4, d: 2.0, pattern: 'border', color: '#b7ad9d' }),
  fx('lamp.floor', f, 5.6, 12.85, 0),
  fx('shelving.open', f, 10.01, 14.3, 270, { w: 1.0, seed: 9 }),
  fx('plant.floor', f, 9.75, 10.7, 0, { seed: 14 }),
  fx('console.table', f, 8.4, 14.77, 180),
  fx('art.frame', f, 8.4, 14.9425, 180, { w: 1.4, h: 0.9, y: 1.6, seed: 8 }),
  fx('curtain.pair', f, 10.185, 12.6, 270, { width: 2.0, height: 2.9 }),
  fx('ac.split', f, 4.5, 10.2575, 0, { mount: 2.4 }),

  /* Kids' bedroom: twin beds. */
  fx('bed.single', f, 1.54, 16.0, 90, { color: '#9fb3c8', duvet: '#dfe7ee', accent: '#e0a458' }),
  fx('bed.single', f, 1.54, 17.6, 90, { color: '#d9b3a3', duvet: '#f1e4dc', accent: '#7aa095' }),
  fx('nightstand', f, 0.725, 16.8, 90, { color: '#f2efe9', shade: '#f6e7c8' }),
  fx('wardrobe.2door', f, 5.0425, 17.6, 270, { color: '#e9e3d6' }),
  fx('shelving.open', f, 5.1675, 16.2, 270, { w: 1.0, seed: 11 }),
  fx('rug.rect', f, 3.1, 16.8, 0, { w: 2.0, d: 1.6, pattern: 'abstract' }),
  fx('art.frame', f, 4.5, 18.485, 180, { w: 0.8, h: 1.0, y: 1.6, seed: 9 }),
  fx('curtain.pair', f, 2.9, 18.485, 180, { width: 2.2, height: 2.9, color: '#c6d2d8' }),
  fx('ac.split', f, 2.0, 15.0575, 0, { mount: 2.4 }),

  /* Study. */
  fx('desk.executive', f, 7.85, 16.6, 0),
  fx('shelving.open', f, 5.6325, 16.5, 90, { seed: 13 }),
  fx('shelving.open', f, 5.6325, 17.75, 90, { seed: 15 }),
  fx('storage.filing', f, 9.8, 18.26, 180, { finish: 'walnut' }),
  fx('plant.floor', f, 9.6, 15.65, 0, { species: 'areca', seed: 16 }),
  fx('rug.rect', f, 7.85, 16.6, 0, { w: 2.4, d: 2.0, pattern: 'border', color: '#8f8a80' }),
  fx('blind.roller', f, 7.85, 18.485, 180, { width: 1.5, height: 1.5, sill: 0.9 }),
  fx('blind.roller', f, 10.185, 16.8, 270, { width: 1.2, height: 1.5, sill: 0.9 }),

  /* Façade: porch canopy doubling as the master balcony, window canopy, roof overhang, louvres. */
  fx('canopy.slab', g, 7.2, 5.685, 180, { width: 5.8, depth: 2.6, thickness: 0.2, y: 3.4 }),
  fx('canopy.slab', g, 2.45, 5.685, 180, { width: 4.4, depth: 0.9, thickness: 0.15, y: 2.85 }),
  fx('canopy.slab', f, 5.35, 5.685, 180, { width: 10.3, depth: 0.9, thickness: 0.3, y: 3.25 }),
  fx('balcony.rail', f, 7.2, 3.13, 180, { length: 5.7 }),
  fx('balcony.rail', f, 4.34, 4.4, 90, { length: 2.5 }),
  fx('balcony.rail', f, 10.06, 4.4, 270, { length: 2.5 }),
  fx('louvre.screen', f, 2.2, 5.685, 180, { width: 2.6, height: 3.05 }),
  fx('planter.box', g, 4.95, 5.4, 180, { w: 0.6, d: 0.5, h: 0.6, finish: 'charcoal' }),

  /* Site: car in the porch, lawn planting, street light, rooftop services. The lawn tree stands in
   * the front corner so it frames the house without covering the louvres or the drawing room window. */
  fx('car.sedan', g, 7.6, 2.8, 0, { color: '#d7d8d9' }),
  fx('tree.ornamental', g, 1.4, 1.6, 0, { height: 4.6 }),
  fx('hedge', g, 2.4, 0.5, 0, { length: 4.2, height: 1.0, depth: 0.6 }),
  fx('hedge', g, 0.5, 3.1, 90, { length: 4.0, height: 1.0, depth: 0.6, seed: 23 }),
  fx('streetlight', g, 0.9, -1.0, 180),
  fx('ac.outdoor', f, 1.5, 17.6, 0, { elevation: 3.25 }),
  fx('ac.outdoor', f, 2.6, 17.6, 0, { elevation: 3.25 }),
  fx('tank.water', f, 9.0, 17.2, 0, { elevation: 3.25 })
];

/** Ceilings stay a clean white whatever the wall colours. */
const CEILINGS = Object.fromEntries(rooms.map((room) => [`${room.id}:ceiling`, 'AM-1009']));

/** @type {import('../model/schema.js').Building} */
const building = {
  schema: 'amco.building/1',
  id: 'dha-residence',
  name: 'Modern family home, 10 marla',
  kind: 'house',
  source: 'showcase',
  levels,
  walls,
  rooms,
  site: {
    boundary: [[0, 0], [10.7, 0], [10.7, 19.8], [0, 19.8]],
    boundaryWall: { height: 2.1, thickness: 0.23, gates: [{ at: [7.6, 0], width: 4.0, style: 'gate.sliding' }] },
    ground: [
      { polygon: [[0.115, 0.115], [4.9, 0.115], [4.9, 5.685], [0.115, 5.685]], material: 'lawn' },
      { polygon: [[4.9, 0.115], [10.585, 0.115], [10.585, 5.685], [4.9, 5.685]], material: 'paving' },
      { polygon: [[0.115, 18.715], [10.585, 18.715], [10.585, 19.685], [0.115, 19.685]], material: 'paving' }
    ],
    street: { side: 'south', width: 9 }
  },
  fixtures,
  views: [
    { id: 'exterior', label: 'Outside', mode: 'exterior' },
    { id: 'dollhouse', label: 'Dollhouse', mode: 'dollhouse' },
    { id: 'room:lounge', label: 'Lounge and dining', mode: 'room', level: 'g', room: 'lounge', position: [5.8, 10.55, 1.5], target: [0.8, 14.2, 1.15] },
    { id: 'room:drawing-room', label: 'Drawing room', mode: 'room', level: 'g', room: 'drawing-room', position: [2.45, 6.25, 1.45], target: [2.45, 10.2, 0.85] },
    { id: 'room:kitchen', label: 'Kitchen', mode: 'room', level: 'g', room: 'kitchen', position: [5.05, 15.25, 1.55], target: [1.81, 17.57, 1.23] },
    { id: 'room:master-bedroom', label: 'Master bedroom', mode: 'room', level: 'f', room: 'master-bedroom', position: [6.4, 7.0], target: [1.0, 8.6, 1.2] },
    { id: 'room:kids-bedroom', label: 'Kids\' bedroom', mode: 'room', level: 'f', room: 'kids-bedroom', position: [4.85, 15.4, 1.55], target: [1.61, 17.72, 1.19] }
  ],
  defaults: {
    paint: {
      '*': 'AM-1008',
      exterior: 'AM-1001',
      site: 'AM-7006',
      'room:drawing-room': 'AM-1006',
      'room:hall': 'AM-1006',
      'room:stair': 'AM-1006',
      'room:landing': 'AM-1006',
      'room:lounge': 'AM-1008',
      'room:kitchen': 'AM-1009',
      'room:guest-bedroom': 'AM-1006',
      'room:master-bedroom': 'AM-1008',
      'room:family-lounge': 'AM-1006',
      'room:kids-bedroom': 'AM-1009',
      'room:study': 'AM-1006',
      'room:master-bath': 'AM-1003',
      'room:kids-bath': 'AM-5008',
      'group:g-b1:R:drawing-room': 'AM-7004',
      'group:g-w2:L:lounge': 'AM-6003',
      'group:g-f:L:kitchen': 'AM-7006',
      'group:g-e3:L:guest-bedroom': 'AM-2003',
      'group:f-w4:L:master-bedroom': 'AM-5007',
      'group:f-x1:R:family-lounge': 'AM-2009',
      'group:f-w1:L:kids-bedroom': 'AM-5009',
      'group:f-f:R:study': 'AM-6002',
      ...CEILINGS
    },
    finish: 'matt'
  },
  meta: { address: 'Showcase: contemporary 10 marla home, DHA-style plot (fictional)' }
};

export default building;
