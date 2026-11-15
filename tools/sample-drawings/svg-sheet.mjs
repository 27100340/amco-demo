/**
 * Renders a sample-set sheet (drawings.mjs) as an A3 landscape SVG with architectural line
 * weights, poché and clipped vector hatching (kept as vectors so the printed PDFs stay small),
 * and wraps it in a print-ready HTML page for headless Chrome.
 */
import { LAYERS, PAPER } from './drawings.mjs';

/** Dash patterns on paper (mm). */
const DASHES = { DASHED: '2.4 1.2', HIDDEN: '1.2 0.6', CENTER: '7 1.2 1.2 1.2', PHANTOM: '7 1.2 1.2 1.2 1.2 1.2' };
/** Pen colours: drawings print in black; furniture, dimensions and site areas in greys and a green. */
const INK = { 'A-FURN': '#6f6f6f', 'A-FLOR-PFIX': '#6f6f6f', 'A-FLOR-STRS': '#2b2b2b', 'A-FLOR-OTLN': '#7a7a7a', 'A-ANNO-DIMS': '#2b2b2b', 'A-SECT-MBND': '#555', 'L-PLNT': '#4e7a35', 'C-ROAD': '#666', 'C-ROAD-CNTR': '#888', 'A-SITE-PAVE': '#555' };
/** Flat tones for filled areas (paper colours). */
const FILLS = {
  poche: '#2e2e2e',
  'poche-low': '#7d7d7d',
  hatch: '#ffffff',
  concrete: '#d5d5d1',
  earth: '#f1ece2',
  lawn: '#e5eed8',
  paving: '#ecebe6',
  road: '#e2e1dc',
  shade: '#efeee9',
  render: '#f7f5f0',
  glass: '#e4edf1',
  shadow: '#d9d8d3'
};
/** Fills that also get diagonal hatching: [spacing mm, pen mm, colour]. */
const HATCH = { hatch: [1.0, 0.13, '#222'], earth: [2.0, 0.12, '#a0937c'], lawn: [2.6, 0.1, '#7d9b61'] };

/**
 * Diagonal hatch lines covering a polygon's bounding box, clipped to the polygon by the caller.
 * @param {[number, number][]} paper polygon in paper millimetres
 * @param {[number, number, string]} style spacing, pen width and colour
 * @returns {string}
 */
function hatchLines(paper, [spacing, pen, colour]) {
  const xs = paper.map((p) => p[0]);
  const ys = paper.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const out = [];
  for (let c = x0 - (y1 - y0); c <= x1; c += spacing) {
    out.push(`M${c.toFixed(2)} ${y1.toFixed(2)}L${(c + (y1 - y0)).toFixed(2)} ${y0.toFixed(2)}`);
  }
  return `<path d="${out.join('')}" stroke="${colour}" stroke-width="${pen}" fill="none"/>`;
}

/**
 * Escapes text for SVG.
 * @param {string} text
 * @returns {string}
 */
function esc(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * The SVG for one sheet (A3 landscape, millimetre user units).
 * @param {{ scale: number, origin: number[], items: object[], title: string }} sheet framed by drawings.mjs
 * @returns {string}
 */
export function sheetToSvg(sheet) {
  const k = sheet.scale;
  const [ox, oy] = sheet.origin;
  const x = (p) => ((p[0] - ox) / k).toFixed(3);
  const y = (p) => (PAPER.height - (p[1] - oy) / k).toFixed(3);
  const pts = (list) => list.map((p) => `${x(p)},${y(p)}`).join(' ');
  const stroke = (layer) => {
    const style = LAYERS[layer] ?? { weight: 0.18, linetype: 'CONTINUOUS' };
    const dash = DASHES[style.linetype] ? ` stroke-dasharray="${DASHES[style.linetype]}"` : '';
    return `stroke="${INK[layer] ?? '#111'}" stroke-width="${style.weight}"${dash}`;
  };
  const fills = [];
  const clips = [];
  const lines = [];
  const texts = [];
  for (const it of sheet.items) {
    switch (it.kind) {
      case 'fill': {
        fills.push(`<polygon points="${pts(it.points)}" fill="${FILLS[it.style] ?? '#eee'}" stroke="none"/>`);
        if (HATCH[it.style]) {
          const id = `h${clips.length}`;
          const paper = it.points.map((p) => [Number(x(p)), Number(y(p))]);
          clips.push(`<clipPath id="${id}"><polygon points="${pts(it.points)}"/></clipPath>`);
          fills.push(`<g clip-path="url(#${id})">${hatchLines(paper, HATCH[it.style])}</g>`);
        }
        break;
      }
      case 'line':
        lines.push(`<line x1="${x(it.a)}" y1="${y(it.a)}" x2="${x(it.b)}" y2="${y(it.b)}" ${stroke(it.layer)}/>`);
        break;
      case 'poly':
        lines.push(`<${it.closed ? 'polygon' : 'polyline'} points="${pts(it.points)}" fill="none" ${stroke(it.layer)}/>`);
        break;
      case 'circle':
        lines.push(`<circle cx="${x(it.center)}" cy="${y(it.center)}" r="${(it.radius / k).toFixed(3)}" fill="none" ${stroke(it.layer)}/>`);
        break;
      case 'arc': {
        const rad = (deg) => (deg * Math.PI) / 180;
        const p0 = [it.center[0] + it.radius * Math.cos(rad(it.startDeg)), it.center[1] + it.radius * Math.sin(rad(it.startDeg))];
        const p1 = [it.center[0] + it.radius * Math.cos(rad(it.endDeg)), it.center[1] + it.radius * Math.sin(rad(it.endDeg))];
        const sweep = (((it.endDeg - it.startDeg) % 360) + 360) % 360;
        const r = (it.radius / k).toFixed(3);
        lines.push(`<path d="M${x(p0)} ${y(p0)} A${r} ${r} 0 ${sweep > 180 ? 1 : 0} 0 ${x(p1)} ${y(p1)}" fill="none" ${stroke(it.layer)}/>`);
        break;
      }
      case 'text': {
        const anchor = { left: 'start', center: 'middle', right: 'end' }[it.align?.h ?? 'left'];
        const baseline = { baseline: 'alphabetic', bottom: 'alphabetic', middle: 'central', top: 'hanging' }[it.align?.v ?? 'baseline'];
        const size = (it.height / k).toFixed(3);
        const rotate = it.rotationDeg ? ` transform="rotate(${(-it.rotationDeg).toFixed(2)} ${x(it.at)} ${y(it.at)})"` : '';
        const weight = it.layer === 'A-ANNO-TTLB' && it.height / k >= 4 ? ' font-weight="700"' : '';
        texts.push(`<text x="${x(it.at)}" y="${y(it.at)}" font-size="${size}" text-anchor="${anchor}" dominant-baseline="${baseline}" fill="${INK[it.layer] ?? '#111'}"${weight}${rotate}>${esc(it.text)}</text>`);
        break;
      }
      default:
        break;
    }
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PAPER.width}mm" height="${PAPER.height}mm" viewBox="0 0 ${PAPER.width} ${PAPER.height}">`,
    `<title>${esc(sheet.title)}</title>`,
    `<defs>${clips.join('')}</defs>`,
    `<rect width="${PAPER.width}" height="${PAPER.height}" fill="#fff"/>`,
    `<g stroke-linecap="square" stroke-linejoin="miter">${fills.join('')}</g>`,
    `<g stroke-linecap="round" stroke-linejoin="round">${lines.join('')}</g>`,
    `<g font-family="'Arial Narrow', Arial, Helvetica, sans-serif" letter-spacing="0.02">${texts.join('')}</g>`,
    '</svg>'
  ].join('\n');
}

/**
 * A print-ready HTML page holding the sheet's SVG at A3 landscape with no margins.
 * @param {object} sheet
 * @returns {string}
 */
export function sheetToHtml(sheet) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(sheet.title)}</title>
<style>@page { size: A3 landscape; margin: 0 } html, body { margin: 0; padding: 0; background: #fff } svg { display: block; width: 420mm; height: 297mm }</style>
</head><body>
${sheetToSvg(sheet)}
</body></html>
`;
}
