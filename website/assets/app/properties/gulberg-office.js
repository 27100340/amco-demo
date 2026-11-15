/**
 * Showcase property: a corporate office floor (Gulberg boulevard style), about 24 m × 16 m.
 * Curtain-wall glazing on the street (south) and east façades under an ACP cladding band,
 * solid party walls to the west and north.
 *
 * Inside: a reception with a feature wall, an open-plan office of workstation pods with a
 * breakout lounge, a glass-walled meeting room, a glass manager's cabin and a pantry.
 * Carpet tile in the working areas, polished concrete in the reception and pantry.
 *
 * Plan coordinates in metres, x east, y north. Walls are authored pre-noded so their ids stay
 * stable; exterior walls run anticlockwise (L side inside). Glass partitions use role 'glass'.
 */

/** Exterior, internal and glass-partition wall thicknesses. */
const EXT = 0.23;
const INT = 0.115;
const GLASS = 0.1;

/** Clear height to the ceiling grid. */
const CEILING = 3.2;

/** Curtain-wall glazing height (a 0.3 m band runs above it to the slab). */
const GLAZING = 2.9;

/**
 * A wall record.
 * @param {string} id wall id
 * @param {number[]} a start [x, y]
 * @param {number[]} b end [x, y]
 * @param {number} thickness metres
 * @param {object[]} [openings] openings along the wall
 * @returns {object} wall
 */
function wall(id, a, b, thickness, openings = []) {
  const role = thickness >= EXT ? 'exterior' : thickness <= GLASS ? 'glass' : 'interior';
  return { id, level: 'l1', a, b, thickness, role, openings };
}

/**
 * A curtain-wall bay from floor to the glazing head.
 * @param {string} id opening id
 * @param {number} at centre, metres from the wall start
 * @param {number} width bay width
 * @returns {object} opening
 */
function glazing(id, at, width) {
  return { id, type: 'window', at, width, height: GLAZING, sill: 0, style: 'curtainwall' };
}

/**
 * A door opening.
 * @param {string} id opening id
 * @param {number} at centre, metres from the wall start
 * @param {number} width clear width
 * @param {string} style infill kit
 * @param {number} [height] head height
 * @returns {object} opening
 */
function door(id, at, width, style, height = 2.4) {
  return { id, type: 'door', at, width, height, sill: 0, style };
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
  return params ? { kit, level: 'l1', at: [x, y], rotation, params } : { kit, level: 'l1', at: [x, y], rotation };
}

const walls = [
  wall('s1', [0, 0], [6.5, 0], EXT, [glazing('cw1', 1.55, 2.9), door('entrance', 3.95, 1.7, 'door.glass', GLAZING), glazing('cw2', 5.6, 1.6)]),
  wall('s2', [6.5, 0], [24, 0], EXT, [glazing('cw3', 3.0, 5.6), glazing('cw4', 8.75, 5.6), glazing('cw5', 14.5, 5.6)]),
  wall('e1', [24, 0], [24, 10.5], EXT, [glazing('cw6', 2.65, 5.1), glazing('cw7', 7.85, 5.1)]),
  wall('e2', [24, 10.5], [24, 16], EXT, [glazing('cw8', 2.75, 5.2)]),
  wall('n1', [24, 16], [18, 16], EXT),
  wall('n2', [18, 16], [6.5, 16], EXT, [
    { id: 'win1', type: 'window', at: 2.5, width: 2.4, height: 1.6, sill: 0.9, style: 'window.fixed' },
    { id: 'win2', type: 'window', at: 9.5, width: 2.4, height: 1.6, sill: 0.9, style: 'window.fixed' }
  ]),
  wall('n3', [6.5, 16], [0, 16], EXT, [{ id: 'win3', type: 'window', at: 3.25, width: 1.5, height: 1.2, sill: 1.0, style: 'window.casement' }]),
  wall('w1', [0, 16], [0, 11.5], EXT),
  wall('w2', [0, 11.5], [0, 7], EXT),
  wall('w3', [0, 7], [0, 0], EXT),
  wall('i1', [6.5, 0], [6.5, 7], INT, [door('lobby-door', 4.5, 1.6, 'door.glass')]),
  wall('i2', [6.5, 7], [6.5, 11.5], GLASS, [door('meeting-door', 3.6, 0.9, 'door.glass')]),
  wall('i3', [6.5, 11.5], [6.5, 16], INT, [{ id: 'pantry-way', type: 'opening', at: 1.2, width: 1.4, height: 2.4, sill: 0 }]),
  wall('i4', [0, 7], [6.5, 7], INT),
  wall('i5', [0, 11.5], [6.5, 11.5], INT),
  wall('i6', [18, 10.5], [24, 10.5], GLASS, [door('cabin-door', 1.2, 0.9, 'door.glass')]),
  wall('i7', [18, 10.5], [18, 16], GLASS)
];

const rooms = [
  { id: 'reception', level: 'l1', name: 'Reception', use: 'reception', at: [3.25, 3.5], floor: 'concrete' },
  { id: 'open-plan', level: 'l1', name: 'Open-plan office', use: 'office', at: [12, 5], floor: 'carpet-tile' },
  { id: 'meeting-room', level: 'l1', name: 'Meeting room', use: 'meeting', at: [3.25, 9.25], floor: 'carpet-tile' },
  { id: 'manager-cabin', level: 'l1', name: 'Manager\'s cabin', use: 'office', at: [21, 13.25], floor: 'carpet-tile' },
  { id: 'pantry', level: 'l1', name: 'Pantry and breakout', use: 'pantry', at: [3.25, 13.75], floor: 'concrete' }
];

/** Workstation pod centres: three bays of two rows, plus one pod by the east glazing (the
 *  south-east corner stays open as the standing point for the open-plan view). */
const PODS = [[9.6, 3.2], [13.4, 3.2], [17.2, 3.2], [9.6, 7.2], [13.4, 7.2], [17.2, 7.2], [21.3, 7.2]];

const fixtures = [
  /* Reception: desk facing the entrance, logo on the feature wall, waiting lounge. */
  fx('desk.reception', 3.4, 5.15, 180, { w: 2.6, color: '#f1eee8' }),
  fx('sign.fascia', 3.4, 6.9425, 180, { text: 'Meridian Partners', style: 'plain', width: 2.6, height: 0.5, y: 1.95 }),
  fx('lamp.pendant', 3.4, 4.6, 0, { ceiling: CEILING, drop: 1.0, count: 3, spacing: 0.75, style: 'globe' }),
  fx('sofa.2-seat', 0.6, 2.3, 90, { color: '#4b4f54', accent: '#b88a4a' }),
  fx('armchair.lounge', 2.3, 1.0, 0, { color: '#8a6e55' }),
  fx('table.coffee', 1.75, 2.3, 90, { top: 'walnut', frame: 'black' }),
  fx('rug.rect', 1.7, 2.1, 90, { w: 2.4, d: 1.8, pattern: 'abstract' }),
  fx('plant.floor', 0.5, 4.0, 0, { seed: 31 }),
  fx('plant.floor', 5.92, 6.42, 0, { species: 'areca', seed: 32 }),
  fx('art.frame', 0.115, 4.9, 90, { w: 1.0, h: 1.3, y: 1.6, seed: 14, frame: 'oak' }),

  /* Open-plan office: seven workstation pods with linear pendants. */
  ...PODS.map(([x, y]) => fx('desk.workstation-pod', x, y, 0, { screen: '#5f6f73' })),
  ...PODS.map(([x, y]) => fx('lamp.linear', x, y, 0, { ceiling: CEILING, drop: 0.9, length: 2.4 })),
  fx('plant.floor', 7.2, 0.7, 0, { species: 'areca', seed: 33 }),
  fx('plant.floor', 23.3, 9.8, 0, { seed: 34 }),
  fx('plant.floor', 19.25, 5.1, 0, { species: 'areca', seed: 35 }),
  fx('plant.floor', 23.3, 0.7, 0, { seed: 48 }),

  /* Breakout lounge and storage along the north side. */
  fx('sofa.l-shape', 10.6, 12.6, 0, { color: '#6c7a72', accent: '#d39b5b' }),
  fx('table.coffee', 10.6, 13.9, 0),
  fx('rug.rect', 10.6, 13.6, 0, { w: 3.0, d: 2.2, pattern: 'border', color: '#9aa39b' }),
  fx('armchair.lounge', 12.85, 13.9, 270, { color: '#b5895f' }),
  fx('lamp.floor', 8.6, 12.0, 0),
  fx('storage.filing', 12.6, 15.66, 180, { w: 2.4 }),
  fx('plant.floor', 17.4, 15.4, 0, { species: 'areca', seed: 39 }),
  fx('plant.floor', 7.2, 15.3, 0, { seed: 36 }),
  fx('table.meeting', 15.4, 12.3, 90, { seats: 4 }),

  /* Glass meeting room. */
  fx('table.meeting', 3.2, 9.25, 0, { seats: 8 }),
  fx('tv.unit', 0.34, 9.25, 90, { w: 1.8 }),
  fx('lamp.linear', 3.2, 9.25, 0, { ceiling: CEILING, drop: 1.0, length: 2.4 }),
  fx('plant.floor', 5.9, 7.6, 0, { seed: 37 }),
  fx('plant.floor', 0.62, 10.92, 0, { species: 'areca', seed: 44 }),
  fx('plant.floor', 0.62, 7.58, 0, { species: 'areca', seed: 47 }),

  /* Pantry and breakout. */
  fx('kitchen.run', 0.425, 13.7, 90, { length: 2.4, ceiling: CEILING, color: '#7f8c7c', worktop: 'concrete' }),
  fx('fridge', 0.505, 15.4, 90),
  fx('table.cafe', 2.9, 12.8, 0),
  fx('table.cafe', 4.9, 12.8, 0),
  fx('table.cafe', 2.9, 14.75, 0),
  fx('table.cafe', 4.9, 14.75, 0),
  fx('lamp.pendant', 3.95, 13.8, 0, { ceiling: CEILING, drop: 1.0, count: 2, spacing: 2.1, style: 'cone' }),
  fx('plant.floor', 6.0, 15.45, 0, { seed: 45 }),

  /* Manager's cabin. */
  fx('desk.executive', 21.6, 13.6, 270),
  fx('rug.rect', 21.4, 13.6, 90, { w: 3.0, d: 2.2, pattern: 'border', color: '#7d7466' }),
  fx('sofa.2-seat', 20.0, 15.4, 180, { color: '#3e4246', accent: '#a46b4f' }),
  fx('table.side', 19.6, 14.3, 0, { top: 'walnut' }),
  fx('storage.filing', 22.6, 15.66, 180, { w: 1.6, finish: 'walnut' }),
  fx('plant.floor', 23.4, 11.1, 0, { seed: 38 }),
  fx('art.frame', 20.0, 15.885, 180, { w: 1.2, h: 0.8, y: 1.75, seed: 15 }),
  fx('plant.floor', 18.55, 15.4, 0, { species: 'areca', seed: 46 }),

  /* Façade: ACP band over the glazing, entrance canopy and sign, street planting and cars. The tree
   * and the street light stand beyond the ends of the glazing so they never cross the façade. */
  fx('acp.band', 12, -0.115, 180, { width: 24.46, height: 1.85, y: GLAZING }),
  fx('acp.band', 24.115, 8, 90, { width: 16.46, height: 1.85, y: GLAZING }),
  fx('sign.fascia', 3.95, -0.17, 180, { text: 'Meridian Partners', style: 'plain', width: 3.6, height: 0.6, y: 3.55 }),
  fx('canopy.slab', 3.95, -0.115, 180, { width: 3.2, depth: 1.6, thickness: 0.2, y: GLAZING + 0.05, color: '#2f3336' }),
  fx('planter.box', 1.6, -1.0, 0, { w: 2.4, d: 0.6, h: 0.6, finish: 'charcoal', seed: 4 }),
  fx('planter.box', 7.4, -1.0, 0, { w: 2.4, d: 0.6, h: 0.6, finish: 'charcoal', seed: 5 }),
  fx('tree.ornamental', -1.8, -0.9, 0, { height: 5.0, seed: 51 }),
  fx('streetlight', 26.7, -1.8, 180),
  fx('car.sedan', 13.4, -4.6, 90, { color: '#2b2e33' }),
  fx('car.sedan', 18.6, -4.6, 90, { color: '#a7acb1' }),
  fx('ac.outdoor', 8.0, 14.6, 0, { elevation: 3.5 }),
  fx('ac.outdoor', 9.0, 14.6, 0, { elevation: 3.5 }),
  fx('ac.outdoor', 10.0, 14.6, 0, { elevation: 3.5 })
];

/** Ceilings stay a clean white whatever the wall colours. */
const CEILINGS = Object.fromEntries(rooms.map((room) => [`${room.id}:ceiling`, 'AM-1001']));

/** @type {import('../model/schema.js').Building} */
const building = {
  schema: 'amco.building/1',
  id: 'gulberg-office',
  name: 'Corporate office floor',
  kind: 'office',
  source: 'showcase',
  levels: [{ id: 'l1', name: 'Office floor', elevation: 0, height: 3.6, ceiling: CEILING, slab: 0.3, parapet: 1.2 }],
  walls,
  rooms,
  site: {
    boundary: [[-3, -2], [27, -2], [27, 19], [-3, 19]],
    ground: [{ polygon: [[-3, -2], [27, -2], [27, 19], [-3, 19]], material: 'paving' }],
    street: { side: 'south', width: 12 }
  },
  fixtures,
  views: [
    { id: 'exterior', label: 'Outside', mode: 'exterior' },
    { id: 'dollhouse', label: 'Dollhouse', mode: 'dollhouse' },
    { id: 'room:reception', label: 'Reception', mode: 'room', level: 'l1', room: 'reception', position: [5.4, 0.9], target: [2.2, 6.9, 1.6] },
    { id: 'room:open-plan', label: 'Open-plan office', mode: 'room', level: 'l1', room: 'open-plan', position: [12.58, 14.69, 1.55], target: [13.58, 10.81, 1.43] },
    { id: 'room:meeting-room', label: 'Meeting room', mode: 'room', level: 'l1', room: 'meeting-room', position: [6.04, 11.19, 1.55], target: [2.76, 8.91, 1.31] },
    { id: 'room:manager-cabin', label: 'Manager\'s cabin', mode: 'room', level: 'l1', room: 'manager-cabin', position: [18.9, 13.25, 1.55], target: [22.9, 13.25, 1.15] },
    { id: 'room:pantry', label: 'Pantry and breakout', mode: 'room', level: 'l1', room: 'pantry', position: [5.9, 12.1, 1.5], target: [0.4, 15.2, 1.1] }
  ],
  defaults: {
    paint: {
      '*': 'AM-1001',
      exterior: 'AM-7009',
      'room:reception': 'AM-1001',
      'room:open-plan': 'AM-1002',
      'room:meeting-room': 'AM-1001',
      'room:manager-cabin': 'AM-1008',
      'room:pantry': 'AM-1009',
      'group:i4:R:reception': 'AM-5005',
      'group:n2:L:open-plan': 'AM-6003',
      'group:w2:L:meeting-room': 'AM-7005',
      'group:n1:L:manager-cabin': 'AM-2009',
      'group:n3:L:pantry': 'AM-2004',
      ...CEILINGS
    },
    finish: 'matt'
  },
  meta: { address: 'Showcase: corporate office floor, Gulberg-style boulevard (fictional business names)' }
};

export default building;
