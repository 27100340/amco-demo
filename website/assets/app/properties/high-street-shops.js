/**
 * Showcase property: a row of three adjoining shops (high street / MM Alam Road style), each
 * about 6 m frontage × 12 m deep, single tall storey with a sign parapet. Frameless glass
 * shopfronts with rolled-up shutter boxes, fascia sign boards, awnings, rear service shutters,
 * a footpath and the street to the south. Each unit's front wall is a wall of its own, so every
 * façade can be painted separately. Business names are generic and fictional.
 *
 * Units, west to east: Noor Boutique (fully fitted), Chai Corner Café, City Pharmacy.
 *
 * Plan coordinates in metres, x east, y north. Walls are authored pre-noded so their ids stay
 * stable; exterior walls run anticlockwise (L side inside).
 */

/** Exterior and party wall thickness (9 inch). */
const EXT = 0.23;

/** Clear height inside the shops. */
const CEILING = 3.8;

/**
 * A wall record.
 * @param {string} id wall id
 * @param {number[]} a start [x, y]
 * @param {number[]} b end [x, y]
 * @param {'exterior'|'interior'} role wall role
 * @param {object[]} [openings] openings along the wall
 * @returns {object} wall
 */
function wall(id, a, b, role, openings = []) {
  return { id, level: 'g', a, b, thickness: EXT, role, openings };
}

/**
 * A full-width glass shopfront.
 * @param {string} id opening id
 * @param {number} at centre, metres from the wall start
 * @returns {object} opening
 */
function shopfront(id, at) {
  return { id, type: 'shopfront', at, width: 5.0, height: 3.3, sill: 0, style: 'shopfront.glass' };
}

/**
 * A rear goods door closed by a rolling shutter.
 * @param {string} id opening id
 * @param {number} at centre, metres from the wall start
 * @returns {object} opening
 */
function serviceShutter(id, at) {
  return { id, type: 'garage', at, width: 2.4, height: 2.7, sill: 0, style: 'shutter.rolling' };
}

/**
 * A fixture record. Rotation is a compass bearing: 0 faces north, 90 east, 180 south, 270 west.
 * @param {string} kit kit id
 * @param {number} x plan x
 * @param {number} y plan y
 * @param {number} [rotation] degrees
 * @param {object} [params] kit parameters
 * @returns {object} fixture
 */
function fx(kit, x, y, rotation = 0, params) {
  return params ? { kit, level: 'g', at: [x, y], rotation, params } : { kit, level: 'g', at: [x, y], rotation };
}

const walls = [
  wall('s1', [0, 0], [6, 0], 'exterior', [shopfront('front-boutique', 3.0)]),
  wall('s2', [6, 0], [12, 0], 'exterior', [shopfront('front-cafe', 3.0)]),
  wall('s3', [12, 0], [18, 0], 'exterior', [shopfront('front-pharmacy', 3.0)]),
  wall('e1', [18, 0], [18, 12], 'exterior'),
  wall('n1', [18, 12], [12, 12], 'exterior', [serviceShutter('rear-pharmacy', 1.6)]),
  wall('n2', [12, 12], [6, 12], 'exterior', [serviceShutter('rear-cafe', 1.4)]),
  wall('n3', [6, 12], [0, 12], 'exterior', [serviceShutter('rear-boutique', 1.6)]),
  wall('w1', [0, 12], [0, 0], 'exterior'),
  wall('p1', [6, 0], [6, 12], 'interior'),
  wall('p2', [12, 0], [12, 12], 'interior')
];

const rooms = [
  { id: 'boutique', level: 'g', name: 'Noor Boutique', use: 'shop', at: [3, 6], floor: 'oak-floor' },
  { id: 'cafe', level: 'g', name: 'Chai Corner Café', use: 'cafe', at: [9, 6], floor: 'porcelain' },
  { id: 'pharmacy', level: 'g', name: 'City Pharmacy', use: 'shop', at: [15, 6], floor: 'porcelain' }
];

const fixtures = [
  /* Boutique: window mannequins, rails along both walls, display tables, cash counter, fitting rooms. */
  fx('mannequin', 1.3, 1.0, 180, { color: '#9b5b6a' }),
  fx('mannequin', 4.7, 1.0, 180, { color: '#2f4f4f' }),
  fx('rail.clothing', 0.6, 3.9, 90, { length: 1.4, seed: 21 }),
  fx('rail.clothing', 0.6, 5.8, 90, { length: 1.4, seed: 22 }),
  fx('rail.clothing', 0.6, 7.7, 90, { length: 1.4, seed: 23 }),
  fx('rail.clothing', 5.4, 3.9, 270, { length: 1.4, seed: 24 }),
  fx('rail.clothing', 5.4, 5.8, 270, { length: 1.4, seed: 25 }),
  fx('table.display', 3.0, 4.0, 0, { seed: 5 }),
  fx('table.display', 3.0, 6.6, 180, { seed: 9 }),
  fx('counter.cash', 3.6, 9.4, 180, { finish: 'lacquer', color: '#efe8de' }),
  fx('fitting.room', 0.72, 11.27, 180, { curtain: '#4b5a52' }),
  fx('fitting.room', 1.94, 11.27, 180, { curtain: '#4b5a52' }),
  fx('mirror.full', 5.64, 8.4, 270),
  fx('mirror.full', 5.64, 7.4, 270, { frame: 'black' }),
  fx('plant.floor', 5.4, 10.9, 0, { seed: 41 }),
  fx('lamp.pendant', 3.0, 5.3, 90, { ceiling: CEILING, drop: 1.7, count: 3, spacing: 1.1, style: 'dome', finish: 'brass' }),
  fx('ac.split', 0.115, 9.2, 90, { mount: 3.1 }),
  fx('art.frame', 5.885, 5.8, 270, { w: 0.9, h: 1.2, y: 2.3, seed: 16, frame: 'brass' }),

  /* Café: counter at the back, bistro tables, back-bar shelving. */
  fx('counter.cafe', 9.0, 9.6, 180, { w: 2.6 }),
  fx('shelving.open', 7.8, 11.71, 180, { w: 1.2, seed: 27 }),
  fx('table.cafe', 7.3, 3.0, 0),
  fx('table.cafe', 10.7, 3.0, 0),
  fx('table.cafe', 7.3, 5.6, 0),
  fx('table.cafe', 10.7, 5.6, 0),
  fx('sofa.3-seat', 11.415, 7.6, 270, { color: '#7a4f3a', accent: '#d8c3a0', legs: 'black' }),
  fx('table.coffee', 10.4, 7.6, 90, { top: 'walnut', frame: 'black', w: 1.0, d: 0.55 }),
  fx('lamp.pendant', 9.0, 4.3, 90, { ceiling: CEILING, drop: 1.6, count: 3, spacing: 1.3, style: 'cone' }),
  fx('plant.floor', 6.6, 8.6, 0, { species: 'areca', seed: 42 }),
  fx('art.frame', 6.115, 4.3, 90, { w: 1.4, h: 1.0, y: 2.0, seed: 17, frame: 'oak' }),
  fx('ac.split', 11.885, 3.0, 270, { mount: 3.1 }),

  /* Pharmacy: wall shelving both sides, two central gondolas, dispensing counter. */
  fx('shelving.retail', 17.675, 3.2, 270, { seed: 13 }),
  fx('shelving.retail', 17.675, 4.42, 270, { seed: 14 }),
  fx('shelving.retail', 17.675, 5.64, 270, { seed: 15 }),
  fx('shelving.retail', 17.675, 6.86, 270, { seed: 16 }),
  fx('shelving.retail', 12.325, 3.2, 90, { seed: 17 }),
  fx('shelving.retail', 12.325, 4.42, 90, { seed: 18 }),
  fx('shelving.retail', 12.325, 5.64, 90, { seed: 19 }),
  fx('shelving.retail', 12.325, 6.86, 90, { seed: 20 }),
  fx('shelving.retail', 17.675, 1.98, 270, { seed: 25 }),
  fx('shelving.retail', 12.325, 1.98, 90, { seed: 26 }),
  fx('shelving.retail', 15.0, 4.29, 180, { seed: 21 }),
  fx('shelving.retail', 15.0, 4.71, 0, { seed: 22 }),
  fx('shelving.retail', 15.0, 6.69, 180, { seed: 27 }),
  fx('shelving.retail', 15.0, 7.11, 0, { seed: 28 }),
  fx('counter.cash', 15.0, 9.2, 180, { finish: 'lacquer', color: '#f3f2ef' }),
  fx('shelving.retail', 13.4, 11.675, 180, { seed: 23 }),
  fx('shelving.retail', 14.6, 11.675, 180, { seed: 24 }),
  fx('ac.split', 12.115, 9.0, 90, { mount: 3.1 }),

  /* Street front: fascia signs, awnings, café terrace, planters, street lights and a parked car.
   * Street lights and trees stand at the ends of the row so that, seen from the default
   * three-quarter camera (south-east, sun behind it), none of them crosses a sign or shopfront. */
  fx('sign.fascia', 3.0, -0.115, 180, { text: 'Noor Boutique', style: 'boutique', width: 5.0, height: 0.85, y: 3.45 }),
  fx('sign.fascia', 9.0, -0.115, 180, { text: 'Chai Corner Café', style: 'cafe', width: 5.0, height: 0.85, y: 3.45 }),
  fx('sign.fascia', 15.0, -0.115, 180, { text: 'City Pharmacy', style: 'pharmacy', width: 5.0, height: 0.85, y: 3.45 }),
  fx('awning', 3.0, -0.115, 180, { width: 5.0, depth: 1.0, y: 3.38, color: '#2a2a2c' }),
  fx('awning', 9.0, -0.115, 180, { width: 5.0, depth: 1.1, y: 3.38, stripes: ['#23443a', '#efe6d2'] }),
  fx('canopy.slab', 15.0, -0.115, 180, { width: 5.2, depth: 0.8, thickness: 0.12, y: 3.38, color: '#f4f5f2' }),
  fx('table.cafe', 8.0, -1.5, 0),
  fx('table.cafe', 10.2, -1.5, 0),
  fx('planter.box', 1.0, -0.6, 0, { w: 1.0, d: 0.45, h: 0.55, finish: 'charcoal', seed: 7 }),
  fx('planter.box', 5.0, -0.6, 0, { w: 1.0, d: 0.45, h: 0.55, finish: 'charcoal', seed: 8 }),
  fx('streetlight', 1.0, -2.65, 180),
  fx('streetlight', 20.5, -2.65, 180),
  fx('tree.ornamental', -1.6, -1.35, 0, { height: 4.5, seed: 62 }),
  fx('tree.ornamental', 19.9, -1.2, 0, { height: 4.5, seed: 61 }),
  fx('car.sedan', 5.6, -4.6, 270, { color: '#8b2f2a' }),
  fx('ac.outdoor', 2.5, 10.8, 0, { elevation: 4.05 }),
  fx('ac.outdoor', 8.5, 10.8, 0, { elevation: 4.05 }),
  fx('ac.outdoor', 14.5, 10.8, 0, { elevation: 4.05 }),
  fx('tank.water', 16.6, 10.6, 0, { elevation: 4.05 })
];

/** Ceilings stay a clean white whatever the wall colours. */
const CEILINGS = Object.fromEntries(rooms.map((room) => [`${room.id}:ceiling`, 'AM-1001']));

/** @type {import('../model/schema.js').Building} */
const building = {
  schema: 'amco.building/1',
  id: 'high-street-shops',
  name: 'Shop row and boutique',
  kind: 'shop',
  source: 'showcase',
  levels: [{ id: 'g', name: 'Shop floor', elevation: 0, height: 4.2, ceiling: CEILING, slab: 0.25, parapet: 1.4 }],
  walls,
  rooms,
  site: {
    boundary: [[-3, -3], [21, -3], [21, 12.5], [-3, 12.5]],
    ground: [
      { polygon: [[-3, -3], [21, -3], [21, -0.115], [-3, -0.115]], material: 'paving' },
      { polygon: [[-3, 12.115], [21, 12.115], [21, 12.5], [-3, 12.5]], material: 'paving' }
    ],
    street: { side: 'south', width: 10 }
  },
  fixtures,
  views: [
    { id: 'exterior', label: 'Outside', mode: 'exterior' },
    { id: 'dollhouse', label: 'Dollhouse', mode: 'dollhouse' },
    { id: 'room:boutique', label: 'Boutique', mode: 'room', level: 'g', room: 'boutique', position: [5.1, 10.2, 1.55], target: [3.3, 6.64, 1.39] },
    { id: 'room:cafe', label: 'Café', mode: 'room', level: 'g', room: 'cafe', position: [11.58, 0.84, 1.55], target: [9.78, 4.4, 1.39] },
    { id: 'room:pharmacy', label: 'Pharmacy', mode: 'room', level: 'g', room: 'pharmacy', position: [13.2, 1.0], target: [16.0, 11.5, 1.6] }
  ],
  defaults: {
    paint: {
      '*': 'AM-1001',
      exterior: 'AM-1006',
      'group:s1:R:exterior': 'AM-7008',
      'group:s2:R:exterior': 'AM-2001',
      'group:s3:R:exterior': 'AM-1001',
      'room:boutique': 'AM-1007',
      'room:cafe': 'AM-1005',
      'room:pharmacy': 'AM-1001',
      'group:n3:L:boutique': 'AM-4006',
      'group:p1:R:cafe': 'AM-6002',
      'group:n1:L:pharmacy': 'AM-6007',
      ...CEILINGS
    },
    finish: 'matt'
  },
  meta: { address: 'Showcase: high-street shop row (fictional businesses)' }
};

export default building;
