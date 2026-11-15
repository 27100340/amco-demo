export const shades = window.AmcoShades;
export const amco = window.Amco;
export const data = window.AmcoData;

/**
 * Look up a paint shade from the legacy shade card.
 * @param {string} code shade code such as 'AM-5006'
 * @returns {{ code: string, name: string, hex: string, ink: string, family: string } | null} the shade, or null when unknown
 */
export function shade(code) {
  const found = shades ? shades.get(code) : null;
  if (!found) { return null; }
  return { code: found.code, name: found.name, hex: found.hex, ink: found.ink, family: found.family };
}
