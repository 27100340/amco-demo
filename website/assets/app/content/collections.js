/* Curated shade lists for the landing page. Codes refer to the shade card in
   assets/js/shades.js, whose names and colours are still proposals until they
   are matched to Amco's printed card. */

/** Shades offered in the hero to repaint the photographed wall, in display order. */
export const HERO_SHADES = ['AM-5006', 'AM-6002', 'AM-2005', 'AM-4007', 'AM-2001', 'AM-5008', 'AM-7005', 'AM-1005'];

/** Photo slots that cross-fade in the hero; each needs a wallMask in content/photos.js to be recoloured. */
export const HERO_SLIDES = ['hero-living-1', 'hero-living-2', 'hero-living-3'];

/** The Rang-e-Pakistan collection feature: five shades that tell the story of the card. */
export const COLLECTION = {
  name: 'Rang-e-Pakistan',
  urdu: 'رنگِ پاکستان',
  shades: ['AM-5001', 'AM-3005', 'AM-7001', 'AM-2006', 'AM-6003']
};
