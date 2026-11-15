import { shades as shadeCard } from '../legacy.js';
import { PHOTOS, photoUrl, srcset } from '../content/photos.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SLIDE_MS = 7000;
const HERO_SIZES = '(min-width: 981px) 60vw, 100vw';

/**
 * Turn a list of [x%, y%] points into SVG path data in a 0-100 box.
 * @param {number[][]} points polygon points
 * @returns {string} a closed sub-path
 */
function pathFor(points) {
  return `M${points.map(([x, y]) => `${x} ${y}`).join('L')}Z`;
}

/**
 * Create an SVG element with attributes.
 * @param {string} tag element name
 * @param {Record<string, string>} attributes attribute map
 * @returns {SVGElement} the element
 */
function svgEl(tag, attributes) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([name, value]) => el.setAttribute(name, value));
  return el;
}

/**
 * Build one paint layer: the wall polygon filled with the current shade.
 * @param {string} clipId id of the clipPath shared by both layers
 * @param {string} className extra class for the blend mode
 * @param {SVGElement | null} defs clipPath definitions, only on the first layer
 * @returns {SVGSVGElement} the layer
 */
function paintLayer(clipId, className, defs) {
  const svg = svgEl('svg', {
    class: `hero-paint ${className}`,
    viewBox: '0 0 100 100',
    preserveAspectRatio: 'none',
    'aria-hidden': 'true',
    focusable: 'false'
  });
  if (defs) { svg.appendChild(defs); }
  svg.appendChild(svgEl('rect', { class: 'hero-paint-fill', x: '0', y: '0', width: '100', height: '100', 'clip-path': `url(#${clipId})` }));
  return svg;
}

/**
 * Add the multiply and colour layers that repaint a slide's wall.
 * @param {HTMLElement} frame the element sized exactly like the photo
 * @param {string} slot photo slot
 * @returns {boolean} true when the slide can be recoloured
 */
function addPaintLayers(frame, slot) {
  const photo = PHOTOS[slot];
  if (!photo || !photo.wallMask || frame.querySelector('.hero-paint')) { return Boolean(photo && photo.wallMask); }
  const clipId = `wall-${slot}`;
  const defs = svgEl('defs', {});
  const clip = svgEl('clipPath', { id: clipId, clipPathUnits: 'userSpaceOnUse' });
  const holes = (photo.wallHoles || []).map(pathFor).join('');
  clip.appendChild(svgEl('path', { d: pathFor(photo.wallMask) + holes, 'clip-rule': 'evenodd' }));
  defs.appendChild(clip);
  frame.appendChild(paintLayer(clipId, 'hero-paint-multiply', defs));
  frame.appendChild(paintLayer(clipId, 'hero-paint-colour', null));
  return true;
}

/**
 * Make the markup for one slide's photo.
 * @param {string} slot photo slot
 * @param {boolean} eager load straight away (first slide)
 * @returns {HTMLElement} the slide element
 */
function createSlide(slot, eager) {
  const photo = PHOTOS[slot];
  const slide = document.createElement('div');
  slide.className = 'hero-slide';
  slide.dataset.slot = slot;
  const frame = document.createElement('div');
  frame.className = 'hero-frame';
  const img = document.createElement('img');
  img.src = photoUrl(slot, 1280);
  img.srcset = srcset(slot);
  img.sizes = HERO_SIZES;
  img.width = photo.ratio[0];
  img.height = photo.ratio[1];
  img.alt = photo.alt;
  img.decoding = 'async';
  img.loading = eager ? 'eager' : 'lazy';
  frame.appendChild(img);
  slide.appendChild(frame);
  return slide;
}

/**
 * Size a slide's frame so it covers the stage like object-fit: cover, keeping the focal point.
 * @param {HTMLElement} slide the slide element
 * @param {string} slot photo slot
 */
function placeFrame(slide, slot) {
  const photo = PHOTOS[slot];
  const frame = slide.querySelector('.hero-frame');
  frame.style.setProperty('--ratio', String(photo.ratio[0] / photo.ratio[1]));
  frame.style.setProperty('--fx', String(photo.focal[0] / 100));
  frame.style.setProperty('--fy', String(photo.focal[1] / 100));
}

/**
 * Render the shade buttons.
 * @param {HTMLElement} list container for the buttons
 * @param {object[]} shades shade records from the shade card
 */
function renderShadeButtons(list, shades) {
  list.innerHTML = shades.map((shade) => (
    `<button class="hero-shade" type="button" data-code="${shade.code}" aria-pressed="false" style="--chip:${shade.hex}">` +
      `<span class="visually-hidden">${shade.name}, ${shade.code}</span>` +
    '</button>'
  )).join('');
}

/**
 * Mount the hero: cross-fading room photos whose plain wall is repainted in the
 * chosen shade, beside a panel filled with the same shade.
 * Expects inside root: [data-hero-media] (slides), [data-hero-shades] (button row),
 * [data-hero-shade-name], [data-hero-shade-code], [data-hero-shade-story] and
 * optionally [data-hero-pause].
 * @param {HTMLElement} root the hero section
 * @param {{ slides: string[], shades: string[] }} options photo slots and shade codes
 * @returns {{ setShade: (code: string) => void, destroy: () => void }} a small control API
 */
export function mountHeroRecolour(root, { slides, shades }) {
  const media = root.querySelector('[data-hero-media]');
  const list = root.querySelector('[data-hero-shades]');
  const nameEl = root.querySelector('[data-hero-shade-name]');
  const codeEl = root.querySelector('[data-hero-shade-code]');
  const storyEl = root.querySelector('[data-hero-shade-story]');
  const pauseButton = root.querySelector('[data-hero-pause]');
  const shadeList = shades.map((code) => (shadeCard ? shadeCard.get(code) : null)).filter(Boolean);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const slideEls = slides.filter((slot) => PHOTOS[slot]).map((slot, index) => {
    let slide = media.querySelector(`.hero-slide[data-slot="${slot}"]`);
    if (!slide) {
      slide = createSlide(slot, index === 0);
      media.appendChild(slide);
    }
    placeFrame(slide, slot);
    const paintable = addPaintLayers(slide.querySelector('.hero-frame'), slot);
    slide.classList.toggle('is-static', !paintable);
    return slide;
  });

  let active = Math.max(0, slideEls.findIndex((slide) => slide.classList.contains('is-active')));
  let timer = 0;
  let hovering = false;
  let focusInside = false;
  let userPaused = false;

  function showSlide(index) {
    active = (index + slideEls.length) % slideEls.length;
    slideEls.forEach((slide, i) => {
      slide.classList.toggle('is-active', i === active);
      slide.setAttribute('aria-hidden', String(i !== active));
    });
  }

  function canAdvance() {
    return slideEls.length > 1 && !reduceMotion.matches && !hovering && !focusInside && !userPaused && !document.hidden;
  }

  function schedule() {
    window.clearTimeout(timer);
    if (!canAdvance()) { return; }
    timer = window.setTimeout(() => {
      showSlide(active + 1);
      schedule();
    }, SLIDE_MS);
  }

  function setShade(code) {
    const shade = shadeList.find((item) => item.code === code);
    if (!shade) { return; }
    root.style.setProperty('--panel', shade.hex);
    root.style.setProperty('--panel-ink', shade.ink);
    root.style.setProperty('--paint', shade.hex);
    root.dataset.ink = shade.ink.toUpperCase() === '#FFFFFF' ? 'light' : 'dark';
    if (nameEl) { nameEl.textContent = shade.name; }
    if (codeEl) { codeEl.textContent = shade.code; }
    if (storyEl) { storyEl.textContent = shade.story; }
    list.querySelectorAll('[data-code]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.code === code));
    });
  }

  function onClick(event) {
    const button = event.target.closest('[data-code]');
    if (button && list.contains(button)) { setShade(button.dataset.code); }
  }

  function onPause() {
    userPaused = !userPaused;
    pauseButton.setAttribute('aria-pressed', String(userPaused));
    pauseButton.setAttribute('aria-label', userPaused ? 'Play the slideshow' : 'Pause the slideshow');
    schedule();
  }

  const listeners = [
    [list, 'click', onClick],
    [root, 'mouseenter', () => { hovering = true; schedule(); }],
    [root, 'mouseleave', () => { hovering = false; schedule(); }],
    [root, 'focusin', (event) => { focusInside = event.target.matches(':focus-visible'); schedule(); }],
    [root, 'focusout', (event) => { if (!root.contains(event.relatedTarget)) { focusInside = false; } schedule(); }],
    [document, 'visibilitychange', schedule],
    [reduceMotion, 'change', schedule]
  ];
  if (pauseButton) {
    pauseButton.hidden = slideEls.length < 2;
    listeners.push([pauseButton, 'click', onPause]);
  }

  renderShadeButtons(list, shadeList);
  listeners.forEach(([target, type, handler]) => target.addEventListener(type, handler));
  showSlide(active);
  if (shadeList.length) { setShade(shadeList[0].code); }
  root.classList.add('is-ready');
  schedule();

  return {
    setShade,
    destroy() {
      window.clearTimeout(timer);
      listeners.forEach(([target, type, handler]) => target.removeEventListener(type, handler));
    }
  };
}
