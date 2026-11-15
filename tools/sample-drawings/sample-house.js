/**
 * The sample drawing set's house, defined once as a Building Model: "Sample House, 10 Marla,
 * DHA Lahore" (fictional). A 35′ × 65′ plot, double storey, 9″ exterior and main walls, 4½″
 * partitions. Coordinates are plot coordinates in metres (x east, y north, origin at the plot's
 * south-west corner; the road is on the south). Everything is laid out in feet and inches first.
 *
 * Ground floor: car porch (open to the front), drawing room, TV lounge with dining, kitchen,
 * guest bedroom with bath, powder room, stair hall.
 * First floor: master bedroom with bath, bedroom 2 with bath, family lounge, front balcony
 * (over the porch, behind a 3′-6″ parapet), stair hall. The rear of the ground floor is roof.
 */
import { guessRoomUse } from '../../website/assets/app/model/schema.js';

/** Metres per foot. */
export const FT = 0.3048;
/** Feet (decimal) to metres. */
export const ft = (feet) => feet * FT;
/** A plot point from feet. */
const pt = (x, y) => [ft(x), ft(y)];

/** 9″ and 4½″ walls. */
export const NINE_INCH = ft(0.75);
export const FOUR_HALF_INCH = ft(0.375);

/** Plot size (35′ × 65′). */
export const PLOT = { width: ft(35), depth: ft(65) };
/** The floor plans are drawn with this plot point (the house's south-west outer corner) at 0,0. */
export const PLAN_ORIGIN = pt(3, 10);
/** Natural ground level below the ground floor (1′-6″ plinth). */
export const PLINTH = ft(1.5);

/** Door and window schedule (metres). `label` and `qty` are printed on the working drawings. */
export const SAMPLE_SCHEDULE = {
  D1: { type: 'door', label: 'MAIN DOOR', width: ft(3.5), height: ft(7), sill: null, material: 'TEAK WOOD' },
  D2: { type: 'door', label: 'INTERNAL DOOR', width: ft(3), height: ft(7), sill: null, material: 'DEODAR WOOD' },
  D3: { type: 'door', label: 'BATH DOOR', width: ft(2.5), height: ft(7), sill: null, material: 'PVC' },
  W1: { type: 'window', label: 'WINDOW', width: ft(6), height: ft(4), sill: ft(3), material: 'ALUMINIUM' },
  W2: { type: 'window', label: 'WINDOW', width: ft(4), height: ft(4), sill: ft(3), material: 'ALUMINIUM' },
  W3: { type: 'window', label: 'WINDOW', width: ft(3), height: ft(3), sill: ft(4), material: 'ALUMINIUM' },
  V1: { type: 'ventilator', label: 'VENTILATOR', width: ft(2), height: ft(1.5), sill: ft(5.5), material: 'ALUMINIUM' }
};

/** Section cuts marked on both plans: A-A looks west along x = 20′, B-B looks north along y = 38′. */
export const SECTION_CUTS = {
  A: { label: 'A', axis: 'x', at: ft(20), look: 'west', title: 'SECTION A-A' },
  B: { label: 'B', axis: 'y', at: ft(38), look: 'north', title: 'SECTION B-B' }
};

/**
 * Walls per level in feet: [id, a, b, thickness ('9' | '4.5'), openings [tag, centre coordinate
 * along the wall axis in feet][], extra]. Door swings: `side` is the face the door opens to
 * ('L' or 'R' of a→b), `hinge` the jamb nearer a ('a') or b ('b').
 */
const WALLS = {
  ground: [
    ['g-front', [15.125, 10.375], [31.625, 10.375], '9', [['W1', 23.375]]],
    ['g-east', [31.625, 10.375], [31.625, 59.625], '9', [['W2', 17.75], ['V1', 30.0], ['W1', 38.25], ['D2', 49.5, { side: 'L', hinge: 'b' }]]],
    ['g-rear', [31.625, 59.625], [3.375, 59.625], '9', [['W3', 24.5], ['V1', 14.5], ['W2', 7.75]]],
    ['g-west', [3.375, 59.625], [3.375, 10.0], '9', [['W2', 53.0], ['W3', 38.75]]],
    ['g-porch-east', [15.125, 28.375], [15.125, 10.375], '9', [['D1', 13.5, { side: 'L', hinge: 'b' }]]],
    ['g-porch-rear', [3.375, 28.375], [15.125, 28.375], '9', [['D1', 7.5, { side: 'L', hinge: 'a' }]]],
    ['g-stair-east', [11.625, 28.375], [11.625, 46.375], '9', [['D2', 31.0, { side: 'R', hinge: 'a' }]]],
    ['g-drawing-rear', [15.125, 25.125], [31.625, 25.125], '9', [['D2', 18.25, { side: 'R', hinge: 'a' }]]],
    ['g-rear-rooms', [3.375, 46.375], [31.625, 46.375], '9', [['D2', 14.5, { side: 'L', hinge: 'b' }], ['D2', 21.0, { side: 'L', hinge: 'a' }]]],
    ['g-kitchen-west', [17.375, 46.375], [17.375, 59.625], '9', []],
    ['g-powder-west', [26.0625, 25.125], [26.0625, 31.6875], '4.5', [['D3', 27.0, { side: 'R', hinge: 'a' }]]],
    ['g-powder-rear', [26.0625, 31.6875], [31.625, 31.6875], '4.5', []],
    ['g-bath-west', [11.8125, 51.0625], [11.8125, 59.625], '4.5', []],
    ['g-bath-front', [11.8125, 51.0625], [17.375, 51.0625], '4.5', [['D3', 14.5, { side: 'L', hinge: 'b' }]]]
  ],
  first: [
    ['f-balcony-parapet', [3.375, 10.375], [15.125, 10.375], '9', [], { partial: true }],
    ['f-front', [15.125, 10.375], [31.625, 10.375], '9', [['W1', 23.375]]],
    ['f-east', [31.625, 10.375], [31.625, 46.375], '9', [['W2', 17.75], ['V1', 29.5], ['W1', 39.75]]],
    ['f-rear', [31.625, 46.375], [3.375, 46.375], '9', [['W2', 21.5]]],
    ['f-west', [3.375, 46.375], [3.375, 10.375], '9', [['W3', 38.75], ['W3', 26.0], ['V1', 19.75]]],
    ['f-master-west', [15.125, 10.375], [15.125, 28.375], '9', []],
    ['f-bed2-front', [3.375, 15.625], [15.125, 15.625], '9', [['D2', 11.875, { side: 'L', hinge: 'b' }]]],
    ['f-bed2-rear', [3.375, 28.375], [15.125, 28.375], '9', [['D2', 7.0, { side: 'R', hinge: 'a' }]]],
    ['f-stair-east', [11.625, 28.375], [11.625, 46.375], '9', [['D2', 31.0, { side: 'R', hinge: 'a' }]]],
    ['f-master-rear', [15.125, 25.125], [31.625, 25.125], '9', [['D2', 18.25, { side: 'R', hinge: 'a' }], ['D3', 28.75, { side: 'L', hinge: 'b' }]]],
    ['f-bath2-east', [8.9375, 15.625], [8.9375, 23.6875], '4.5', [['D3', 19.75, { side: 'L', hinge: 'a' }]]],
    ['f-bath2-rear', [3.375, 23.6875], [8.9375, 23.6875], '4.5', []],
    ['f-mbath-west', [26.0625, 25.125], [26.0625, 33.1875], '4.5', []],
    ['f-mbath-rear', [26.0625, 33.1875], [31.625, 33.1875], '4.5', []]
  ]
};

/**
 * Rooms per level: [id, name, label point in feet, clear size printed under the name (or null),
 * label lines when the name is split over two lines in a small room].
 */
const ROOMS = {
  ground: [
    ['drawing-room', 'Drawing Room', [23.375, 19.6], '15\'-9" x 14\'-0"'],
    ['tv-lounge-dining', 'TV Lounge / Dining', [19.5, 42.2], '19\'-3" x 20\'-6"'],
    ['powder-room', 'Powder Room', [28.0, 30.6], '5\'-0" x 6\'-0"', ['POWDER', 'ROOM']],
    ['stair-hall', 'Stair Hall', [7.5, 33.9], '7\'-6" x 17\'-3"'],
    ['guest-bedroom', 'Guest Bedroom', [8.0, 51.4], '13\'-3" x 12\'-6"'],
    ['guest-bath', 'Guest Bath', [15.3, 55.6], null, ['GUEST', 'BATH']],
    ['kitchen', 'Kitchen', [24.5, 53.0], '13\'-6" x 12\'-6"']
  ],
  first: [
    ['front-balcony', 'Front Balcony', [9.25, 13.4], '11\'-0" x 4\'-6"'],
    ['bath-2', 'Bath 2', [5.0, 20.0], null, ['BATH 2']],
    ['bedroom-2', 'Bedroom 2', [11.875, 22.25], '11\'-0" x 12\'-0"'],
    ['master-bedroom', 'Master Bedroom', [23.375, 15.2], '15\'-9" x 14\'-0"'],
    ['master-bath', 'Master Bath', [29.9, 29.95], null, ['MASTER', 'BATH']],
    ['family-lounge', 'Family Lounge', [19.5, 41.5], '19\'-3" x 20\'-6"'],
    ['stair-hall-2', 'Stair Hall', [7.5, 33.9], '7\'-6" x 17\'-3"']
  ]
};

/** Labels shown on the plans for spaces that are not rooms (outside the wall loops). */
export const PLAN_LABELS = {
  ground: [['CAR PORCH', [9.25, 19.0], '11\'-0" x 18\'-0"']],
  first: [['ROOF OF GROUND FLOOR', [17.5, 53.0], null]]
};

const LEVELS = [
  { id: 'ground', name: 'Ground floor', elevation: 0, height: ft(11), ceiling: ft(10.5), slab: ft(0.5) },
  { id: 'first', name: 'First floor', elevation: ft(11), height: ft(11), ceiling: ft(10.5), slab: ft(0.5), parapet: ft(3.5) }
];

/** Ventilators are built as windows; everything else keeps its type. */
const BUILD_TYPE = { door: 'door', window: 'window', ventilator: 'window' };

/**
 * Builds the wall list for one level.
 * @returns {object[]}
 */
function buildWalls(levelId) {
  return WALLS[levelId].map(([id, a, b, thick, openings, extra = {}]) => {
    const horizontal = a[1] === b[1];
    const along = (v) => Math.abs(v - (horizontal ? a[0] : a[1]));
    const wall = {
      id,
      level: levelId,
      a: pt(a[0], a[1]),
      b: pt(b[0], b[1]),
      thickness: thick === '9' ? NINE_INCH : FOUR_HALF_INCH,
      role: 'interior',
      openings: openings.map(([tag, centre, swing], k) => {
        const entry = SAMPLE_SCHEDULE[tag];
        const opening = {
          id: `${id}-${tag.toLowerCase()}-${k + 1}`,
          type: BUILD_TYPE[entry.type],
          at: ft(along(centre)),
          width: entry.width,
          height: entry.height,
          sill: entry.sill ?? 0,
          tag
        };
        if (swing) opening.swing = swing;
        return opening;
      })
    };
    if (extra.partial) wall.height = LEVELS[LEVELS.length - 1].parapet;
    return wall;
  });
}

/** Wall roles as the importer derives them (exterior when a side faces outside). */
const ROLES = {
  exterior: ['g-front', 'g-east', 'g-rear', 'g-west', 'g-porch-east', 'g-porch-rear',
    'f-balcony-parapet', 'f-front', 'f-east', 'f-rear', 'f-west'],
  partition: ['g-powder-west', 'g-powder-rear', 'g-bath-west', 'g-bath-front', 'f-bath2-east', 'f-bath2-rear', 'f-mbath-west', 'f-mbath-rear']
};

/**
 * The sample house as a Building Model (metres, plot coordinates).
 * Door openings carry a drawing-only `swing` hint used by the plan generator.
 * @returns {import('../../website/assets/app/model/schema.js').Building}
 */
export function sampleHouse() {
  const walls = [...buildWalls('ground'), ...buildWalls('first')];
  for (const wall of walls) {
    if (ROLES.exterior.includes(wall.id)) wall.role = 'exterior';
    else if (ROLES.partition.includes(wall.id)) wall.role = 'partition';
  }
  const rooms = Object.entries(ROOMS).flatMap(([level, list]) => list.map(([id, name, at]) => ({
    id, level, name, use: guessRoomUse(name), at: pt(at[0], at[1])
  })));
  return {
    schema: 'amco.building/1',
    id: 'sample-house',
    name: 'Sample House, 10 Marla, DHA Lahore',
    kind: 'house',
    source: 'showcase',
    levels: LEVELS.map((l) => ({ ...l })),
    walls,
    rooms,
    site: {
      boundary: [pt(0, 0), pt(35, 0), pt(35, 65), pt(0, 65)],
      boundaryWall: { height: ft(7), thickness: NINE_INCH, gates: [{ at: pt(9.25, 0), width: ft(12) }] },
      ground: [
        { polygon: [pt(16, 0.375), pt(34.625, 0.375), pt(34.625, 9), pt(16, 9)], material: 'lawn' },
        { polygon: [pt(3.25, 0), pt(15.25, 0), pt(15.25, 10), pt(3.25, 10)], material: 'paving' },
        { polygon: [pt(-10, -35), pt(45, -35), pt(45, -5), pt(-10, -5)], material: 'road' }
      ],
      street: { side: 'south', width: ft(30) }
    },
    fixtures: [],
    views: [],
    meta: { address: 'Sample House, 10 Marla, DHA Lahore (fictional, for testing)' }
  };
}

/**
 * Room details printed on the plans by room id: the label lines (upper case), the clear size
 * (null for small rooms) and whether the room is small (smaller text).
 * @returns {Map<string, { lines: string[], size: string | null, small: boolean }>}
 */
export function roomLabels() {
  return new Map(Object.values(ROOMS).flat().map(([id, name, , size, lines]) => [id, {
    lines: lines ?? [name.toUpperCase()],
    size,
    small: Boolean(lines)
  }]));
}
