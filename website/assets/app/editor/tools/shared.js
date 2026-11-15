/**
 * Helpers shared by the plan editor tools: friendly fit messages and length rounding.
 */
import { add, scale, sub, normalize, distance } from '../../model/geometry.js';

/** Drawn lengths round to half an inch (imperial) or one centimetre (metric). */
const LENGTH_STEP = { imperial: 0.0127, metric: 0.01 };

/**
 * Plain-English reason an opening cannot go where the customer pointed.
 * @param {{ reason?: string, other?: { tag?: string, type?: string } }} fit from `fitOpening`
 * @param {string} noun 'door', 'window', …
 * @returns {string}
 */
export function openingFitMessage(fit, noun) {
  switch (fit.reason) {
    case 'overrun':
      return `The ${noun} doesn't fit there: it would run past the end of the wall. Slide it towards the middle.`;
    case 'junction':
      return `Another wall joins here, so the ${noun} can't go across it. Slide it along a little.`;
    case 'overlap': {
      const other = fit.other?.tag ?? fit.other?.type ?? 'another opening';
      return `That would overlap ${other}. Slide it along a little.`;
    }
    default:
      return `Point at a wall to place the ${noun}.`;
  }
}

/**
 * Plain-English reason a gate cannot go where the customer pointed.
 * @param {{ reason?: string }} fit from `fitGate`
 * @returns {string}
 */
export function gateFitMessage(fit) {
  switch (fit.reason) {
    case 'overrun':
      return 'The gate would run round a corner. Move it along the boundary or make it narrower.';
    case 'overlap':
      return 'That would overlap another gate. Move it along a little.';
    default:
      return 'Draw the plot boundary first, then add the gate on it.';
  }
}

/**
 * Rounds the length of the segment from → point to a tidy step, keeping its direction.
 * @param {[number, number]} from
 * @param {[number, number]} point
 * @param {'imperial'|'metric'} units
 * @returns {[number, number]}
 */
export function roundSegment(from, point, units) {
  const len = distance(from, point);
  if (len === 0) return point;
  const step = LENGTH_STEP[units] ?? LENGTH_STEP.metric;
  const rounded = Math.round(len / step) * step;
  return add(from, scale(normalize(sub(point, from)), rounded));
}

/**
 * Locks a direction to the nearest of east, north, west or south.
 * @param {[number, number]} dir
 * @returns {[number, number]}
 */
export function orthoDirection(dir) {
  if (Math.abs(dir[0]) >= Math.abs(dir[1])) return [Math.sign(dir[0]) || 1, 0];
  return [0, Math.sign(dir[1]) || 1];
}

/**
 * Angle of a direction in whole degrees, 0–359, anticlockwise from east.
 * @param {[number, number]} dir
 * @returns {number}
 */
export function angleOf(dir) {
  return Math.round(((Math.atan2(dir[1], dir[0]) * 180) / Math.PI + 360) % 360) % 360;
}
