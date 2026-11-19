// Painters page: the trusted-painter directory, the booking form and the
// Ustad Club (tables, calculator, referral link, points check).
// Every WhatsApp link goes to Amco's own number (amco.whatsappLink).

import { amco, painters as data } from '../legacy.js';
import {
  ALL, orderPainters, filterPainters, readParams, painterLabel,
  enquiryMessage, noMatchMessage, shareLink, tidyRef
} from '../painters/directory.js';
import { calculate, parseTins } from '../painters/club.js';
import {
  cardHtml, emptyHtml, tiersTableHtml, earnTableHtml, calcResultHtml
} from '../painters/render.js';

const escape = amco.escapeHtml;
const formatPkr = amco.formatPkr;
const DEFAULT_SIZE = 'gallon';
const EXAMPLE_CODE = 'USTAD-LHR-014';
const ANNOUNCE_DELAY_MS = 600;
const POINTS_MESSAGE = 'Assalam o alaikum, I would like to check my Ustad Club points. My code: ';

function byId(id) {
  return document.getElementById(id);
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function segHtml(attribute, options, active) {
  return options.map((option) =>
    `<button type="button" ${attribute}="${escape(option.value)}" aria-pressed="${option.value === active}">${escape(option.label)}</button>`
  ).join('');
}

function setPressed(groupEl, button) {
  Array.prototype.forEach.call(groupEl.children, (other) => {
    other.setAttribute('aria-pressed', String(other === button));
  });
}

function specialityLabel(id) {
  if (id === ALL) { return ALL; }
  const found = data.specialities.find((speciality) => speciality.id === id);
  return found ? found.label : ALL;
}

// "8 painters listed", "3 painters in Lahore", "1 painter for texture work in Karachi".
function countText(count, filters) {
  if (!count) { return 'No painters found'; }
  const noun = count === 1 ? 'painter' : 'painters';
  const work = filters.speciality === ALL ? '' : ` for ${specialityLabel(filters.speciality).toLowerCase()} work`;
  const place = filters.city === ALL ? '' : ` in ${filters.city}`;
  return work || place ? `${count} ${noun}${work}${place}` : `${count} ${noun} listed`;
}

// "You looked for texture work in Multan."
function lookedFor(filters) {
  const work = filters.speciality === ALL ? 'a painter' : `${specialityLabel(filters.speciality).toLowerCase()} work`;
  const place = filters.city === ALL ? '' : ` in ${filters.city}`;
  return `You looked for ${work}${place}.`;
}

function initDirectory(ordered, onBook) {
  const cityEl = byId('painter-city');
  const specialityEl = byId('painter-speciality');
  const countEl = byId('painter-count');
  const listEl = byId('painter-list');
  const filters = { city: ALL, speciality: ALL };
  const cities = data.cities.filter((city) => ordered.some((painter) => painter.city === city.name));

  function renderList() {
    const found = filterPainters(ordered, filters);
    countEl.textContent = countText(found.length, filters);
    listEl.innerHTML = found.length
      ? found.map((painter) => cardHtml(painter, data, { escape, whatsappHref: amco.whatsappLink(enquiryMessage(painter)) })).join('')
      : emptyHtml(lookedFor(filters), {
        escape,
        whatsappHref: amco.whatsappLink(noMatchMessage(filters.city, specialityLabel(filters.speciality)))
      });
  }

  cityEl.innerHTML = segHtml('data-city',
    [{ value: ALL, label: 'All cities' }].concat(cities.map((city) => ({ value: city.name, label: city.name }))), ALL);
  specialityEl.innerHTML = segHtml('data-speciality',
    [{ value: ALL, label: 'All work' }].concat(data.specialities.map((speciality) => ({ value: speciality.id, label: speciality.label }))), ALL);

  cityEl.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-city]');
    if (!button) { return; }
    filters.city = button.getAttribute('data-city');
    setPressed(cityEl, button);
    renderList();
  });
  specialityEl.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-speciality]');
    if (!button) { return; }
    filters.speciality = button.getAttribute('data-speciality');
    setPressed(specialityEl, button);
    renderList();
  });
  listEl.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-book]');
    if (button) { onBook(button.getAttribute('data-book')); }
  });

  renderList();
}

function initBooking(ordered) {
  const painterEl = byId('book-painter');
  const refEl = byId('book-ref');
  const bookEl = byId('book');
  const params = readParams(window.location.search, ordered);

  ordered.forEach((painter) => {
    const option = document.createElement('option');
    option.value = painterLabel(painter);
    option.textContent = painterLabel(painter);
    painterEl.appendChild(option);
  });
  if (params.painter) { painterEl.value = painterLabel(params.painter); }
  if (params.ref) { refEl.value = params.ref; }
  if (params.painter || params.ref) {
    // A shared link lands on the form. Scroll again once images have settled the layout.
    const toForm = () => bookEl.scrollIntoView({ behavior: 'auto' });
    toForm();
    window.addEventListener('load', toForm, { once: true });
  }

  // Capture phase, so the code is tidied before whatsapp-forms.js builds the message.
  const tidy = () => { refEl.value = tidyRef(refEl.value); };
  refEl.addEventListener('change', tidy);
  refEl.form.addEventListener('submit', tidy, true);

  return function book(id) {
    const painter = ordered.find((candidate) => candidate.id === id);
    if (!painter) { return; }
    painterEl.value = painterLabel(painter);
    bookEl.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    painterEl.focus({ preventScroll: true });
  };
}

function initClubTables() {
  byId('club-earn').innerHTML = earnTableHtml(data, { escape });
  byId('club-tiers').innerHTML = tiersTableHtml(data, { escape, formatPkr });
}

function initCalculator() {
  const formEl = byId('calc-form');
  const tinsEl = byId('calc-tins');
  const sizeEl = byId('calc-size');
  const resultEl = byId('calc-result');
  const statusEl = byId('calc-status');
  let announceTimer = 0;

  sizeEl.innerHTML = data.sizes.map((size) =>
    `<option value="${escape(size.id)}"${size.id === DEFAULT_SIZE ? ' selected' : ''}>${escape(size.label)}</option>`).join('');

  function update() {
    const size = data.sizes.find((candidate) => candidate.id === sizeEl.value);
    const tins = parseTins(tinsEl.value);
    const result = tins === null ? null : calculate(tins, sizeEl.value, data);
    resultEl.innerHTML = calcResultHtml(result, size ? size.label : '', { escape, formatPkr });
    // Announce only the headline, once typing pauses, not the whole result per keystroke.
    window.clearTimeout(announceTimer);
    announceTimer = window.setTimeout(() => {
      statusEl.textContent = resultEl.firstElementChild.firstElementChild
        ? resultEl.firstElementChild.firstElementChild.textContent
        : resultEl.textContent;
    }, ANNOUNCE_DELAY_MS);
  }

  formEl.addEventListener('input', update);
  formEl.addEventListener('change', update);
  formEl.addEventListener('submit', (event) => { event.preventDefault(); });
  update();
}

// The site address up to the folder this page is in, so the example link works locally and live.
function pageFolder() {
  return window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
}

function initReferral() {
  const link = shareLink(EXAMPLE_CODE, pageFolder());
  const exampleEl = byId('ref-example');
  exampleEl.href = link;
  exampleEl.textContent = link;
  document.querySelectorAll('[data-referral-bonus]').forEach((el) => {
    el.textContent = `${data.referral.bonusPoints} bonus points`;
  });
  document.querySelectorAll('[data-points-link]').forEach((el) => {
    el.href = amco.whatsappLink(POINTS_MESSAGE);
    el.target = '_blank';
    el.rel = 'noopener';
  });
}

/** Wire the painters page to the DOM. */
export function initPaintersPage() {
  const ordered = orderPainters(data.painters, data.tiers);
  initDirectory(ordered, initBooking(ordered));
  initClubTables();
  initCalculator();
  initReferral();
}

initPaintersPage();
