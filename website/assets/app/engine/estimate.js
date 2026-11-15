/**
 * Paint quantity estimate from painted surfaces and a product's coverage.
 * Pure module: no DOM, no three.js.
 */

/**
 * Rounds to two decimals.
 * @param {number} value
 * @returns {number}
 */
function round2(value) {
  return Math.round(value * 100) / 100;
}

/**
 * The room part of a surface label: "Lounge, north wall" -> "Lounge".
 * @param {{ label?: string, roomName?: string, room: string }} surface
 * @returns {string}
 */
function roomLabel(surface) {
  if (surface.roomName) return surface.roomName;
  if (surface.room === 'exterior') return 'Outside walls';
  if (surface.room === 'site') return 'Boundary wall';
  const label = String(surface.label || surface.room);
  const comma = label.indexOf(',');
  return comma === -1 ? label : label.slice(0, comma);
}

/**
 * Litres of paint for the painted surfaces, per room and in total.
 * Surfaces with cladding and surfaces without paint are left out.
 * Litres = area × coats ÷ coverage (m² per litre per coat), rounded to two decimals.
 * @param {{ id: string, room: string, label?: string, roomName?: string, area: number, cladding?: string }[]} surfaces
 * @param {Object<string, { code: string, finish: string }>} paintState paint by surface id
 * @param {{ coverage: number }} product a product from the product data (coverage in m² per litre per coat)
 * @param {number} [coats=2] number of coats
 * @returns {{ rows: { room: string, label: string, area: number, litres: number }[], totalArea: number, totalLitres: number }}
 */
export function estimateLitres(surfaces, paintState, product, coats = 2) {
  const coverage = product && product.coverage > 0 ? product.coverage : null;
  const byRoom = new Map();
  let totalArea = 0;
  for (const surface of surfaces || []) {
    if (surface.cladding || !paintState || !paintState[surface.id]) continue;
    const area = Math.max(0, surface.area || 0);
    if (!byRoom.has(surface.room)) byRoom.set(surface.room, { room: surface.room, label: roomLabel(surface), area: 0 });
    byRoom.get(surface.room).area += area;
    totalArea += area;
  }
  const litresFor = (area) => (coverage ? (area * coats) / coverage : 0);
  const rows = [...byRoom.values()].map((row) => ({
    room: row.room,
    label: row.label,
    area: round2(row.area),
    litres: round2(litresFor(row.area))
  }));
  return { rows, totalArea: round2(totalArea), totalLitres: round2(litresFor(totalArea)) };
}
