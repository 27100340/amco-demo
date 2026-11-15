import { shades as shadeCard, amco } from '../legacy.js';
import { PHOTOS, photoUrl, srcset } from '../content/photos.js';
import { HERO_SHADES, HERO_SLIDES, COLLECTION } from '../content/collections.js';
import { mountHeroRecolour } from './hero-recolour.js';

const DEFAULT_SIZES = '(min-width: 981px) 33vw, 50vw';

/**
 * Fill every <figure data-photo="slot"> with its responsive image from content/photos.js.
 * @param {ParentNode} scope where to look for photo placeholders
 */
export function fillPhotos(scope) {
  scope.querySelectorAll('[data-photo]').forEach((figure) => {
    const slot = figure.dataset.photo;
    const photo = PHOTOS[slot];
    if (!photo || figure.querySelector('img')) { return; }
    const img = document.createElement('img');
    img.src = photoUrl(slot, 1280);
    img.srcset = srcset(slot);
    img.sizes = figure.dataset.sizes || DEFAULT_SIZES;
    img.width = photo.ratio[0];
    img.height = photo.ratio[1];
    img.alt = photo.alt;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.style.objectPosition = `${photo.focal[0]}% ${photo.focal[1]}%`;
    figure.appendChild(img);
  });
}

/**
 * Render the collection feature's swatches as links into the shade card.
 * @param {HTMLElement | null} list the <ul data-collection> element
 */
function renderCollection(list) {
  if (!list || !shadeCard) { return; }
  const escape = amco ? amco.escapeHtml : (text) => text;
  list.innerHTML = COLLECTION.shades.map((code) => shadeCard.get(code)).filter(Boolean).map((shade) => (
    `<li><a class="swatch" href="colours.html?shade=${shade.code}" style="--chip:${shade.hex}">` +
      '<span class="swatch-colour"></span>' +
      `<span class="swatch-name">${escape(shade.name)}</span>` +
      `<span class="swatch-code">${shade.code}</span>` +
    '</a></li>'
  )).join('');
}

/**
 * Start the landing page: hero recolour, photo cards and the collection chips.
 */
export function initHomePage() {
  const hero = document.querySelector('[data-hero]');
  if (hero) {
    try {
      mountHeroRecolour(hero, { slides: HERO_SLIDES, shades: HERO_SHADES });
    } catch (error) {
      console.error(error);
    }
  }
  fillPhotos(document);
  renderCollection(document.querySelector('[data-collection]'));
}

initHomePage();
