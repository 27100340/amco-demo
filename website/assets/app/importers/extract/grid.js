/**
 * A uniform grid over axis-aligned boxes, so nearby items are found without testing every pair.
 * Pure module: no DOM.
 */

/** Boxes covering more cells than this are kept in one list that every query returns. */
const MAX_CELLS_PER_BOX = 4096;

/**
 * The bounding box of points, grown by `margin` on every side.
 * @param {[number, number][]} points
 * @param {number} [margin]
 * @returns {{ min: [number, number], max: [number, number] }}
 */
export function boxOf(points, margin = 0) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of points) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { min: [x0 - margin, y0 - margin], max: [x1 + margin, y1 + margin] };
}

/**
 * Creates a grid index of numbered items. `insert(index, box)` files an item under every cell
 * its box touches; `query(box)` returns the indices of every item whose box may touch `box`,
 * each once and in ascending order, so callers keep the same tie-breaks as a full scan.
 * `query(box, { sorted: false })` skips the sort, for callers whose result does not depend on
 * the order (grouping, counting). `forEachCell(fn)` calls `fn(indices)` with the items of each
 * cell, so items whose boxes overlap meet in at least one call; items too wide for the grid come
 * in one last call with every item.
 * @param {number} cellSize in the same units as the boxes
 * @returns {{ insert: (index: number, box: { min: [number, number], max: [number, number] }) => void,
 *   query: (box: { min: [number, number], max: [number, number] }, options?: { sorted?: boolean }) => number[],
 *   forEachCell: (fn: (indices: number[]) => void) => void }}
 */
export function createGrid(cellSize) {
  const cells = new Map();
  const wide = [];
  const span = (box) => [
    Math.floor(box.min[0] / cellSize), Math.floor(box.max[0] / cellSize),
    Math.floor(box.min[1] / cellSize), Math.floor(box.max[1] / cellSize)
  ];
  const usable = (box) => [box.min[0], box.min[1], box.max[0], box.max[1]].every(Number.isFinite);
  return {
    insert(index, box) {
      if (!usable(box)) {
        wide.push(index);
        return;
      }
      const [i0, i1, j0, j1] = span(box);
      if ((i1 - i0 + 1) * (j1 - j0 + 1) > MAX_CELLS_PER_BOX) {
        wide.push(index);
        return;
      }
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const key = `${i},${j}`;
          const list = cells.get(key);
          if (list) list.push(index);
          else cells.set(key, [index]);
        }
      }
    },
    query(box, { sorted = true } = {}) {
      const found = new Set(wide);
      if (usable(box)) {
        const [i0, i1, j0, j1] = span(box);
        if ((i1 - i0 + 1) * (j1 - j0 + 1) > MAX_CELLS_PER_BOX) {
          for (const list of cells.values()) for (const index of list) found.add(index);
        } else {
          for (let i = i0; i <= i1; i++) {
            for (let j = j0; j <= j1; j++) {
              for (const index of cells.get(`${i},${j}`) ?? []) found.add(index);
            }
          }
        }
      }
      const list = [...found];
      return sorted ? list.sort((p, q) => p - q) : list;
    },
    forEachCell(fn) {
      for (const list of cells.values()) fn(list);
      if (wide.length > 0) {
        const all = new Set(wide);
        for (const list of cells.values()) for (const index of list) all.add(index);
        fn([...all]);
      }
    }
  };
}
