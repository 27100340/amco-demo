/** Every registered kit id by family, as pure lists (no three.js) so Node tests can check
 *  property fixtures. Keep in sync with the registerKit calls in the family files. */
export const KIT_FAMILIES = {
  seating: ['sofa.3-seat', 'sofa.2-seat', 'sofa.l-shape', 'armchair.lounge', 'ottoman', 'chair.dining', 'stool.bar'],
  tables: ['table.coffee', 'table.side', 'table.dining-6', 'table.dining-4', 'console.table', 'rug.rect', 'tv.unit'],
  beds: ['bed.king', 'bed.single', 'nightstand'],
  storage: ['wardrobe.2door', 'wardrobe.3door', 'dresser', 'shelving.open'],
  decor: ['plant.floor', 'plant.small', 'art.frame', 'books.row', 'vase', 'mirror.round', 'curtain.pair', 'blind.roller'],
  lighting: ['lamp.table', 'lamp.floor', 'lamp.pendant', 'lamp.linear', 'fan.ceiling'],
  kitchen: ['kitchen.run', 'kitchen.island', 'fridge', 'bath.vanity', 'bath.wc', 'bath.shower'],
  office: ['chair.task', 'chair.meeting', 'chair.executive', 'desk.workstation-pod', 'table.meeting', 'desk.reception', 'desk.executive', 'storage.filing'],
  retail: ['rail.clothing', 'table.display', 'counter.cash', 'counter.cafe', 'table.cafe', 'mannequin', 'mirror.full', 'fitting.room', 'shelving.retail', 'sign.fascia', 'awning'],
  exterior: ['hedge', 'tree.ornamental', 'planter.box', 'streetlight', 'car.sedan', 'gate.sliding', 'louvre.screen', 'acp.band', 'canopy.slab', 'balcony.rail', 'stair.dogleg', 'stair.straight', 'ac.split', 'ac.outdoor', 'tank.water'],
  openings: ['door.panel', 'door.main', 'door.glass', 'door.glass-slider', 'window.casement', 'window.fixed', 'shutter.rolling', 'shopfront.glass', 'curtainwall', 'garage.door']
};

/** Every registered kit id. */
export const KIT_IDS = Object.values(KIT_FAMILIES).flat();
