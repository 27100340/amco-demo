/* Photography for the landing page: the single place to swap in Amco's own shoot.
   Every slot points at assets/img/photos/<slot>-<width>.webp. Credits and licences
   are listed in assets/img/photos/CREDITS.md. Placeholder stock photography. */

const PHOTO_DIR = 'assets/img/photos/';
const SIZES = [640, 1280, 1920];

/**
 * Photo slots. `ratio` is the image's width and height in pixels at 1920 wide.
 * `focal` is the point to keep in view when cropped, as [x%, y%].
 * `wallMask` traces the plain wall as [x%, y%] points (hero photos only), and
 * `wallHoles` lists smaller polygons inside it to leave unpainted, such as a socket.
 */
export const PHOTOS = {
  'hero-living-1': {
    alt: 'A tan leather sofa against a plain wall, with afternoon sun and leaf shadows falling across it',
    credit: 'Martin Péchy on Unsplash',
    sizes: SIZES,
    ratio: [1920, 1440],
    focal: [52, 46],
    wallMask: [
      [0, 0], [100, 0], [100, 66.2], [89, 66.2], [89.2, 60], [89.3, 56], [89.6, 54.6], [89.2, 54],
      [81.5, 50], [78.7, 48.7], [79, 45.5], [78.4, 44.6], [51.6, 44.3], [50.8, 44.8], [50, 44.3],
      [24.9, 44.8], [24.4, 45.6], [24.6, 49.3], [23, 49.7], [20, 50.8], [17, 52], [13.3, 53.7], [12.9, 55],
      [13.3, 58], [13.6, 66], [6, 66], [4.5, 64.1], [3.5, 64.1], [2.4, 66], [0, 66]
    ]
  },
  'hero-living-2': {
    alt: 'A deep green velvet sofa in front of a plain light wall above a pale wooden floor',
    credit: 'Phillip Goldsberry on Unsplash',
    sizes: SIZES,
    ratio: [1920, 1280],
    focal: [50, 48],
    wallMask: [
      [0, 0], [100, 0], [100, 72.2], [89.9, 72.2], [89.9, 49.6], [89.4, 49.2], [85, 48.8], [80.7, 48.4],
      [80.4, 41], [80.1, 40.2], [79.3, 39.4], [75, 39.1], [70, 39], [65, 38.9], [60, 38.7], [55, 38.1],
      [51.5, 37.7], [50.6, 37.9], [50.2, 39.5], [49.8, 39.5], [49.5, 38.5], [48.5, 38.4], [45, 38.7],
      [41, 39.2], [37, 39.6], [33, 39.9], [28, 39.9], [24, 39.6], [21.2, 39.4], [20.6, 40], [20.3, 48],
      [11.8, 48.2], [11.1, 48.9], [11.3, 70.8], [0, 70.8]
    ],
    wallHoles: [
      [[1.9, 54.8], [4, 54.8], [4, 59.6], [1.9, 59.6]]
    ]
  },
  'hero-living-3': {
    alt: 'A pale grey sofa with cushions and a flowering plant beneath a wide plain wall',
    credit: 'dada design on Unsplash',
    sizes: SIZES,
    ratio: [1920, 1080],
    focal: [62, 50],
    wallMask: [
      [0, 0], [100, 0], [100, 90.2], [64.4, 90.2], [64.4, 84.4], [61, 84.4], [61, 90.2], [16.6, 90.2],
      [16.6, 84.4], [7.2, 84.4], [7.2, 90.2], [5.2, 90.2], [5.2, 84.4], [3.7, 84.4], [3.7, 90.2],
      [2.1, 90.2], [2.1, 84.4], [0.3, 84.4], [0.3, 90.2], [0, 90.2], [0, 84], [68.5, 84], [69.6, 83],
      [70, 79], [70.2, 70], [70.4, 60], [70.1, 56], [69.8, 51.5], [69.3, 48.7], [66.5, 48.4], [65.8, 46.5],
      [65.2, 45.6], [0, 45.6]
    ]
  },
  'space-living': {
    alt: 'A bright living room with a pale sofa, lamps on side tables, abstract art and a glass coffee table',
    credit: 'Lotus Design N Print on Unsplash',
    sizes: SIZES,
    ratio: [1920, 1280],
    focal: [45, 55]
  },
  'space-bedroom': {
    alt: 'A bright bedroom with warm greige walls, a white bed, a desk and an arched window',
    credit: 'Clay Banks on Unsplash',
    sizes: SIZES,
    ratio: [1920, 1280],
    focal: [62, 55]
  },
  'space-kitchen': {
    alt: 'A modern kitchen with pale cabinets, a stone worktop and a large window onto palm trees',
    credit: 'Cat Han on Unsplash',
    sizes: SIZES,
    ratio: [1920, 1280],
    focal: [40, 50]
  },
  'space-exterior': {
    alt: 'A contemporary two-storey house with white rendered walls, timber panels and a pool',
    credit: 'Ярослав Алексеенко on Unsplash',
    sizes: SIZES,
    ratio: [1920, 1440],
    focal: [45, 45]
  },
  'space-office': {
    alt: 'A bright open-plan office lounge with plants, timber floors and green armchairs',
    credit: 'Copernico on Unsplash',
    sizes: SIZES,
    ratio: [1920, 1280],
    focal: [50, 55]
  },
  'space-retail': {
    alt: 'A calm clothing boutique with white shelves, linen garments on a rail and a sculptural bench',
    credit: 'Caroline Badran on Unsplash',
    sizes: SIZES,
    ratio: [1920, 2880],
    focal: [50, 45]
  },
  painter: {
    alt: 'A painter in a red work suit rolling yellow paint onto a white wall',
    credit: 'Ali Mkumbwa on Unsplash',
    sizes: SIZES,
    ratio: [1920, 1179],
    focal: [40, 50]
  },
  palette: {
    alt: 'Soft paint colour cards scattered across a dark wooden table',
    credit: 'Solstice Hannan on Unsplash',
    sizes: SIZES,
    ratio: [1920, 1199],
    focal: [50, 50]
  }
};

/**
 * Path of one photo file.
 * @param {string} slot photo slot, such as 'hero-living-1'
 * @param {number} width one of the slot's sizes
 * @returns {string} relative URL of the webp file
 */
export function photoUrl(slot, width) {
  return `${PHOTO_DIR}${slot}-${width}.webp`;
}

/**
 * Build the srcset attribute for a photo slot.
 * @param {string} slot photo slot, such as 'space-kitchen'
 * @returns {string} srcset listing every width, or '' for an unknown slot
 */
export function srcset(slot) {
  const photo = PHOTOS[slot];
  if (!photo) { return ''; }
  return photo.sizes.map((width) => `${photoUrl(slot, width)} ${width}w`).join(', ');
}
