/**
 * Test fixture: a single-storey house, 8 m x 5 m on wall centrelines, split
 * into two rooms by a partition at x = 4.
 *
 *   (0,5) ---north-w--- (4,5) ---north-e--- (8,5)
 *     |                   |                   |
 *   west     Lounge   partition   Bedroom   east
 *     |                   |                   |
 *   (0,0) ---south-w--- (4,0) ---south-e--- (8,0)
 *
 * Exterior walls run anticlockwise, so their left (L) side faces into the
 * house. The partition runs south to north, so its L side faces the lounge.
 */
export const twoRoomHouse = {
  schema: 'amco.building/1',
  id: 'two-room-house',
  name: 'Two-room test house',
  kind: 'house',
  source: 'showcase',
  levels: [
    { id: 'g', name: 'Ground floor', elevation: 0, height: 3.35, ceiling: 3.05, slab: 0.15, parapet: 1.07 }
  ],
  walls: [
    { id: 'south-w', level: 'g', a: [0, 0], b: [4, 0], thickness: 0.23, role: 'exterior', openings: [] },
    { id: 'south-e', level: 'g', a: [4, 0], b: [8, 0], thickness: 0.23, role: 'exterior', openings: [] },
    {
      id: 'east', level: 'g', a: [8, 0], b: [8, 5], thickness: 0.23, role: 'exterior',
      openings: [
        { id: 'win-bedroom', type: 'window', at: 2.5, width: 1.2, height: 1.2, sill: 0.9, tag: 'W2' }
      ]
    },
    { id: 'north-e', level: 'g', a: [8, 5], b: [4, 5], thickness: 0.23, role: 'exterior', openings: [] },
    {
      id: 'north-w', level: 'g', a: [4, 5], b: [0, 5], thickness: 0.23, role: 'exterior',
      openings: [
        { id: 'win-lounge', type: 'window', at: 2.0, width: 1.5, height: 1.2, sill: 0.9, tag: 'W1' }
      ]
    },
    { id: 'west', level: 'g', a: [0, 5], b: [0, 0], thickness: 0.23, role: 'exterior', openings: [] },
    {
      id: 'partition', level: 'g', a: [4, 0], b: [4, 5], thickness: 0.115, role: 'partition',
      openings: [
        { id: 'door-1', type: 'door', at: 1.0, width: 0.9, height: 2.1, sill: 0, tag: 'D1' }
      ]
    }
  ],
  rooms: [
    { id: 'lounge', level: 'g', name: 'Lounge', use: 'lounge', at: [2, 2.5] },
    { id: 'bedroom', level: 'g', name: 'Bedroom', use: 'bedroom', at: [6, 2.5] }
  ],
  fixtures: [],
  views: [
    { id: 'outside', label: 'Outside', mode: 'exterior' },
    { id: 'dollhouse', label: 'Dollhouse', mode: 'dollhouse' },
    { id: 'lounge', label: 'Lounge', mode: 'room', level: 'g', room: 'lounge' }
  ]
};

export default twoRoomHouse;
