// HTML builders for the painters page. Pure: each takes an `escape` function
// for every interpolated text and returns an HTML string. No DOM.

import { initials } from './directory.js';

/**
 * @typedef {(text: string) => string} Escape
 */

function findById(list, id) {
  return list.find((item) => item.id === id);
}

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

function avatarHtml(painter, escape) {
  const inner = painter.photo
    ? `<img src="${escape(painter.photo)}" alt="" width="96" height="96" loading="lazy" decoding="async">`
    : escape(initials(painter.name));
  return `<span class="painter-avatar" aria-hidden="true">${inner}</span>`;
}

function tagsHtml(painter, data, escape) {
  return painter.specialities
    .map((id) => findById(data.specialities, id))
    .filter(Boolean)
    .map((speciality) => `<li class="tag">${escape(speciality.label)}</li>`)
    .join('');
}

/**
 * One painter's directory card.
 * @param {object} painter a painter from AmcoPainters.painters
 * @param {object} data the AmcoPainters data
 * @param {{ escape: Escape, whatsappHref: string }} options whatsappHref = the enquiry link to Amco
 * @returns {string} the card's HTML
 */
export function cardHtml(painter, data, { escape, whatsappHref }) {
  const tier = findById(data.tiers, painter.tier);
  const tierName = tier ? tier.name : painter.tier;
  const placeholder = painter.sample ? ' data-placeholder="sample painter"' : '';
  const sampleTag = painter.sample ? '<span class="tag painter-sample">Sample listing</span>' : '';
  const verified = painter.verified ? '<p class="painter-verified">Verified by Amco</p>' : '';
  return '' +
    `<article class="painter-card panel" data-tier="${escape(painter.tier)}"${placeholder}>` +
      '<div class="painter-top">' +
        avatarHtml(painter, escape) +
        '<div class="painter-who">' +
          `<h3>${escape(painter.name)}</h3>` +
          `<p class="small muted">${escape(painter.city)}: ${escape(painter.areas.join(', '))}</p>` +
        '</div>' +
      '</div>' +
      '<div class="painter-badges">' +
        `<span class="tier-badge" data-tier="${escape(painter.tier)}">${escape(tierName)}</span>` +
        sampleTag +
      '</div>' +
      `<ul class="painter-tags" aria-label="Work">${tagsHtml(painter, data, escape)}</ul>` +
      '<p class="small painter-facts">' +
        `<span>${escape(plural(painter.years, 'year', 'years'))} painting</span>` +
        `<span>${escape(plural(painter.jobs, 'job', 'jobs'))} with Amco</span>` +
      '</p>' +
      verified +
      '<div class="painter-actions">' +
        `<a class="btn btn-wa btn-sm" target="_blank" rel="noopener" href="${escape(whatsappHref)}">WhatsApp</a>` +
        `<button class="btn btn-sm" type="button" data-book="${escape(painter.id)}">Book</button>` +
      '</div>' +
    '</article>';
}

/**
 * The directory's empty state.
 * @param {string} message what the visitor looked for, in a sentence, such as "Nobody for texture work in Multan."
 * @param {{ escape: Escape, whatsappHref: string }} options whatsappHref = the no-match link to Amco
 * @returns {string} the empty state's HTML
 */
export function emptyHtml(message, { escape, whatsappHref }) {
  return '' +
    '<div class="panel stack painter-empty">' +
      `<p>No listed painter matches yet. ${escape(message)} WhatsApp us and we will suggest one.</p>` +
      `<p><a class="btn btn-wa" target="_blank" rel="noopener" href="${escape(whatsappHref)}">Ask Amco on WhatsApp</a></p>` +
    '</div>';
}
