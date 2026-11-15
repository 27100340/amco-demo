/**
 * Showcase property catalogue. Each entry describes one property module (a Building Model with
 * fixtures, views and default paint) and loads it on demand. Business names are fictional.
 */

/**
 * @typedef {object} CatalogueEntry
 * @property {string} id property id, used in `visualiser.html?property=<id>`
 * @property {string} name display name
 * @property {'house'|'office'|'shop'} kind gallery filter
 * @property {string} blurb one-line description
 * @property {string} still exterior still render, relative to the site root
 * @property {{ id: string, label: string }[]} views view ids (`exterior`, `dollhouse`, `room:<roomId>`)
 * @property {() => Promise<import('../model/schema.js').Building>} load imports the Building Model
 */

/** @type {CatalogueEntry[]} */
export const CATALOGUE = [
  {
    id: 'dha-residence',
    name: 'Modern family home, 10 marla',
    kind: 'house',
    blurb: 'A double-storey contemporary house with a stone-clad stair tower, timber louvres, a car porch and a front lawn.',
    still: 'assets/img/stills/dha-residence-exterior.webp',
    views: [
      { id: 'exterior', label: 'Outside' },
      { id: 'dollhouse', label: 'Dollhouse' },
      { id: 'room:lounge', label: 'Lounge and dining' },
      { id: 'room:drawing-room', label: 'Drawing room' },
      { id: 'room:kitchen', label: 'Kitchen' },
      { id: 'room:master-bedroom', label: 'Master bedroom' },
      { id: 'room:kids-bedroom', label: 'Kids\' bedroom' }
    ],
    load: () => import('./dha-residence.js').then((m) => m.default)
  },
  {
    id: 'bahria-townhouse',
    name: 'Compact townhouse, 5 marla',
    kind: 'house',
    blurb: 'A narrow-front double-storey townhouse in brick and render, with a lounge and kitchenette, a bedroom and a stair hall.',
    still: 'assets/img/stills/bahria-townhouse-exterior.webp',
    views: [
      { id: 'exterior', label: 'Outside' },
      { id: 'dollhouse', label: 'Dollhouse' },
      { id: 'room:lounge', label: 'Lounge and kitchenette' },
      { id: 'room:bedroom', label: 'Bedroom' },
      { id: 'room:stair-hall', label: 'Stair hall' }
    ],
    load: () => import('./bahria-townhouse.js').then((m) => m.default)
  },
  {
    id: 'gulberg-office',
    name: 'Corporate office floor',
    kind: 'office',
    blurb: 'A glass and ACP office floor with a reception, open-plan workstations, a glass meeting room, a manager\'s cabin and a pantry.',
    still: 'assets/img/stills/gulberg-office-exterior.webp',
    views: [
      { id: 'exterior', label: 'Outside' },
      { id: 'dollhouse', label: 'Dollhouse' },
      { id: 'room:reception', label: 'Reception' },
      { id: 'room:open-plan', label: 'Open-plan office' },
      { id: 'room:meeting-room', label: 'Meeting room' },
      { id: 'room:manager-cabin', label: 'Manager\'s cabin' },
      { id: 'room:pantry', label: 'Pantry and breakout' }
    ],
    load: () => import('./gulberg-office.js').then((m) => m.default)
  },
  {
    id: 'high-street-shops',
    name: 'Shop row and boutique',
    kind: 'shop',
    blurb: 'Three shopfronts with signage, awnings and shutters: a boutique, a café and a pharmacy, each façade paintable on its own.',
    still: 'assets/img/stills/high-street-shops-exterior.webp',
    views: [
      { id: 'exterior', label: 'Outside' },
      { id: 'dollhouse', label: 'Dollhouse' },
      { id: 'room:boutique', label: 'Boutique' },
      { id: 'room:cafe', label: 'Café' },
      { id: 'room:pharmacy', label: 'Pharmacy' }
    ],
    load: () => import('./high-street-shops.js').then((m) => m.default)
  }
];

/**
 * Finds a catalogue entry by property id.
 * @param {string} id property id
 * @returns {CatalogueEntry|null} the entry, or null when there is none
 */
export function findProperty(id) {
  return CATALOGUE.find((entry) => entry.id === id) || null;
}
