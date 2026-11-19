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

function formatCount(number) {
  return Number(number).toLocaleString('en-PK');
}

/**
 * Tiers and rewards: one column per tier.
 * @param {object} data the AmcoPainters data
 * @param {{ escape: Escape, formatPkr: (amount: number) => string }} options
 * @returns {string} a scrolling table's HTML
 */
export function tiersTableHtml(data, { escape, formatPkr }) {
  const head = data.tiers.map((tier) =>
    `<th scope="col"><span class="tier-badge" data-tier="${escape(tier.id)}">${escape(tier.name)}</span></th>`).join('');
  const reach = data.tiers.map((tier) =>
    `<td>${tier.minPoints ? `${escape(formatCount(tier.minPoints))} points` : 'From the first tin'}</td>`).join('');
  const cashBack = data.tiers.map((tier) =>
    `<td>${data.sizes.map((size) => escape(formatPkr(tier.cashBack[size.id]))).join(' / ')}</td>`).join('');
  const rewards = data.tiers.map((tier, index) => {
    const inherited = index ? `<p class="small muted">Everything in ${escape(data.tiers[index - 1].name)}, plus</p>` : '';
    const items = tier.rewards.map((reward) => `<li>${escape(reward)}</li>`).join('');
    return `<td>${inherited}<ul class="list-check">${items}</ul></td>`;
  }).join('');
  const sizeNames = data.sizes.map((size) => size.label.toLowerCase()).join(' / ');
  return '' +
    '<div class="table-scroll" tabindex="0" role="region" aria-label="Ustad Club tiers and rewards">' +
      '<table class="table club-table">' +
        `<thead><tr><th scope="col"><span class="visually-hidden">Tier</span></th>${head}</tr></thead>` +
        '<tbody>' +
          `<tr><th scope="row">Points a year to reach it</th>${reach}</tr>` +
          `<tr><th scope="row">Cash-back per ${escape(sizeNames)}</th>${cashBack}</tr>` +
          `<tr><th scope="row">Rewards</th>${rewards}</tr>` +
        '</tbody>' +
      '</table>' +
    '</div>';
}

/**
 * How points are earned: tin size and points per tin.
 * @param {object} data the AmcoPainters data
 * @param {{ escape: Escape }} options
 * @returns {string} a table's HTML
 */
export function earnTableHtml(data, { escape }) {
  const rows = data.sizes.map((size) =>
    `<tr><th scope="row">${escape(size.label)}</th><td class="num">${escape(String(size.points))}</td></tr>`).join('');
  return '' +
    '<table class="table earn-table">' +
      '<thead><tr><th scope="col">Tin size</th><th scope="col">Points per tin</th></tr></thead>' +
      `<tbody>${rows}</tbody>` +
    '</table>';
}

/**
 * The calculator's answer, or a prompt when the input could not be used.
 * @param {{ pointsPerYear: number, tier: object, cashBackPerYear: number, next: { tier: object, pointsShort: number } | null } | null} result from club.calculate
 * @param {string} sizeLabel the chosen tin size, such as "Drum"
 * @param {{ escape: Escape, formatPkr: (amount: number) => string }} options
 * @returns {string} the result's HTML
 */
export function calcResultHtml(result, sizeLabel, { escape, formatPkr }) {
  if (!result) {
    return '<p class="calc-prompt">Enter how many tins you use in a month, a whole number from 1 to 500.</p>';
  }
  const tierName = escape(result.tier.name);
  const rewards = result.tier.rewards.map((reward) => `<li>${escape(reward)}</li>`).join('');
  const next = result.next
    ? `<p>${escape(formatCount(result.next.pointsShort))} more points a year reaches ${escape(result.next.tier.name)}.</p>`
    : '<p>That is the top tier.</p>';
  return '' +
    '<div class="stack stack-sm">' +
      `<p class="calc-headline">About ${escape(formatCount(result.pointsPerYear))} points a year puts you in <span class="tier-badge" data-tier="${escape(result.tier.id)}">${tierName}</span> from next January.</p>` +
      `<p>Cash-back at ${tierName}: about ${escape(formatPkr(result.cashBackPerYear))} a year on ${escape(sizeLabel.toLowerCase())} tins.</p>` +
      `<p class="small muted">${tierName} adds:</p>` +
      `<ul class="list-check">${rewards}</ul>` +
      next +
    '</div>';
}
