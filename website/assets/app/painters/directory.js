// Painter directory: order, filters, URL parameters and WhatsApp messages.
// Pure functions over the AmcoPainters data; no DOM.

/**
 * @typedef {{ id: string, code: string, name: string, city: string, areas: string[], years: number,
 *   specialities: string[], tier: string, jobs: number, verified: boolean, photo: string | null, sample: boolean }} Painter
 */

/** The filter value that matches every painter. */
export const ALL = 'all';

/** An Ustad Club code, such as USTAD-LHR-014. */
export const CODE_PATTERN = /^USTAD-[A-Z]{3}-\d{3}$/;

const GREETING = 'Assalam o alaikum, ';
const PAGE_PATH = 'painters.html';

/**
 * @param {string} text a code as typed or taken from a link
 * @returns {string | null} the code in capitals, or null when it is not a code
 */
export function normaliseCode(text) {
  const code = String(text).trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

/**
 * Directory order: higher tier first, then more jobs with Amco, then name.
 * @param {Painter[]} painters
 * @param {{ id: string }[]} tiers lowest first
 * @returns {Painter[]} a new array
 */
export function orderPainters(painters, tiers) {
  const rank = (painter) => tiers.findIndex((tier) => tier.id === painter.tier);
  return [...painters].sort((a, b) => rank(b) - rank(a) || b.jobs - a.jobs || a.name.localeCompare(b.name));
}

/**
 * @param {Painter[]} painters
 * @param {{ city: string, speciality: string }} filters city name and speciality id, or ALL
 * @returns {Painter[]} the matching painters, in the order given
 */
export function filterPainters(painters, { city, speciality }) {
  return painters.filter((painter) =>
    (city === ALL || painter.city === city) &&
    (speciality === ALL || painter.specialities.includes(speciality)));
}

/**
 * Reads ?painter= and ?ref= from the page address. Anything that is not a
 * well-formed code is dropped.
 * @param {string} search location.search
 * @param {Painter[]} painters
 * @returns {{ painter: Painter | null, ref: string | null }}
 */
export function readParams(search, painters) {
  const params = new URLSearchParams(search);
  const wanted = normaliseCode(params.get('painter') || '');
  return {
    painter: (wanted && painters.find((painter) => painter.code === wanted)) || null,
    ref: normaliseCode(params.get('ref') || '')
  };
}

/**
 * @param {Painter} painter
 * @returns {string} "Name (CODE)", used in the booking form and messages
 */
export function painterLabel(painter) {
  return `${painter.name} (${painter.code})`;
}

/**
 * @param {Painter} painter
 * @returns {string} the WhatsApp message to Amco about this painter
 */
export function enquiryMessage(painter) {
  return `${GREETING}I found ${painterLabel(painter)} on the Amco website. Please put me in touch about a painting job in ${painter.city}.`;
}

/**
 * @param {string} cityName a city name, or ALL
 * @param {string} specialityLabel a speciality label, or ALL
 * @returns {string} the WhatsApp message when no listed painter matches
 */
export function noMatchMessage(cityName, specialityLabel) {
  const work = specialityLabel === ALL ? '' : ` for ${specialityLabel.toLowerCase()} work`;
  const place = cityName === ALL ? '' : ` in ${cityName}`;
  return `${GREETING}I am looking for an Amco painter${work}${place}.`;
}

/**
 * @param {string} name such as "Akram B."
 * @returns {string} the first letters of the first two words, such as "AB"
 */
export function initials(name) {
  return String(name).trim().split(/\s+/).slice(0, 2).map((word) => word.charAt(0)).join('').toUpperCase();
}

/**
 * @param {string} code the painter's Ustad code
 * @param {string} origin the site address up to the website folder
 * @returns {string} the painter's referral link
 */
export function shareLink(code, origin) {
  return `${origin.replace(/\/+$/, '')}/${PAGE_PATH}?ref=${code}`;
}
