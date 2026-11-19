// Ustad Club rules: tiers from yearly points, and the "what would you earn?"
// calculator. Pure functions over the AmcoPainters data; no DOM.

/**
 * @typedef {{ id: string, name: string, minPoints: number, cashBack: Record<string, number>, rewards: string[] }} Tier
 * @typedef {{ id: string, label: string, points: number }} Size
 */

/** The most tins a month the calculator accepts. */
export const MAX_TINS_PER_MONTH = 500;

const MONTHS_A_YEAR = 12;
const WHOLE_NUMBER = /^\d+$/;

/**
 * The highest tier a year's points reach.
 * @param {number} points points earned in a calendar year
 * @param {Tier[]} tiers lowest first
 * @returns {Tier} the tier
 */
export function tierForPoints(points, tiers) {
  return tiers.reduce((found, tier) => (points >= tier.minPoints ? tier : found), tiers[0]);
}

/**
 * Reads the calculator's "tins a month" box.
 * @param {string} text what the visitor typed
 * @returns {number | null} a whole number from 1 to MAX_TINS_PER_MONTH, or null
 */
export function parseTins(text) {
  const trimmed = String(text).trim();
  if (!WHOLE_NUMBER.test(trimmed)) { return null; }
  const tins = Number(trimmed);
  return tins >= 1 && tins <= MAX_TINS_PER_MONTH ? tins : null;
}

/**
 * A year's points, tier and cash-back for a painter's usual buying.
 * @param {number} tinsPerMonth tins bought in a month
 * @param {string} sizeId 'quarter', 'gallon' or 'drum'
 * @param {{ tiers: Tier[], sizes: Size[] }} data the AmcoPainters data
 * @returns {{ pointsPerYear: number, tier: Tier, cashBackPerYear: number, next: { tier: Tier, pointsShort: number } | null } | null}
 *   the result, or null when the input cannot be used
 */
export function calculate(tinsPerMonth, sizeId, data) {
  const size = data.sizes.find((candidate) => candidate.id === sizeId);
  if (!size || !Number.isInteger(tinsPerMonth) || tinsPerMonth < 1 || tinsPerMonth > MAX_TINS_PER_MONTH) { return null; }
  const tinsPerYear = tinsPerMonth * MONTHS_A_YEAR;
  const pointsPerYear = tinsPerYear * size.points;
  const tier = tierForPoints(pointsPerYear, data.tiers);
  const nextTier = data.tiers[data.tiers.indexOf(tier) + 1];
  return {
    pointsPerYear,
    tier,
    cashBackPerYear: tinsPerYear * tier.cashBack[sizeId],
    next: nextTier ? { tier: nextTier, pointsShort: nextTier.minPoints - pointsPerYear } : null
  };
}
