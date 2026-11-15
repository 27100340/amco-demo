/**
 * SVG view for the plan editor (browser only): a world group in plan metres with y flipped so
 * north is up, a screen-space overlay group, pan and zoom about a point, and fit-to-content.
 */

const NS = 'http://www.w3.org/2000/svg';
/** Zoom limits in screen pixels per metre. */
const MIN_SCALE = 2;
const MAX_SCALE = 2000;
/** Screen padding (px) around content when fitting. */
const FIT_PADDING = 56;
/** Scale used when there is nothing to fit. */
const EMPTY_SCALE = 36;

/**
 * Creates the view inside an `<svg>` element.
 * @param {SVGSVGElement} svg
 * @param {{ onChange?: () => void }} [options] called after every pan, zoom, fit or resize
 * @returns {{
 *   svg: SVGSVGElement, world: SVGGElement, overlay: SVGGElement, layers: Object<string, SVGGElement>,
 *   wallMask: SVGMaskElement, siteMask: SVGMaskElement, wallMaskId: string, siteMaskId: string,
 *   readonly scale: number, readonly width: number, readonly height: number,
 *   toScreen(p: [number, number]): [number, number], toWorld(p: [number, number]): [number, number],
 *   clientToScreen(x: number, y: number): [number, number], metres(px: number): number,
 *   zoomAt(factor: number, at: [number, number]): void, panBy(dx: number, dy: number): void,
 *   fit(bounds: { min: [number, number], max: [number, number] } | null, inset?: { left?: number, top?: number }): void,
 *   visibleBounds(): { min: [number, number], max: [number, number] }, destroy(): void
 * }}
 */
export function createView(svg, { onChange } = {}) {
  const uid = Math.random().toString(36).slice(2, 9);
  const wallMaskId = `pe-cut-${uid}`;
  const siteMaskId = `pe-gate-${uid}`;
  svg.setAttribute('xmlns', NS);
  svg.innerHTML = `<defs><mask id="${wallMaskId}" maskUnits="userSpaceOnUse"></mask><mask id="${siteMaskId}" maskUnits="userSpaceOnUse"></mask></defs>`
    + '<g class="pe-world">'
    + '<g class="pe-l-backdrop"></g><g class="pe-l-ghost"></g><g class="pe-l-site"></g><g class="pe-l-rooms"></g>'
    + `<g class="pe-l-walls" mask="url(#${wallMaskId})"></g><g class="pe-l-openings"></g>`
    + '</g><g class="pe-overlay"></g>';
  const world = svg.querySelector('.pe-world');
  const overlay = svg.querySelector('.pe-overlay');
  const layers = {
    backdrop: svg.querySelector('.pe-l-backdrop'),
    ghost: svg.querySelector('.pe-l-ghost'),
    site: svg.querySelector('.pe-l-site'),
    rooms: svg.querySelector('.pe-l-rooms'),
    walls: svg.querySelector('.pe-l-walls'),
    openings: svg.querySelector('.pe-l-openings')
  };
  const camera = { s: EMPTY_SCALE, tx: 0, ty: 0, width: 0, height: 0, fitted: false, pendingFit: null };

  const apply = () => {
    world.setAttribute('transform', `matrix(${camera.s} 0 0 ${-camera.s} ${camera.tx} ${camera.ty})`);
    onChange?.();
  };

  const view = {
    svg,
    world,
    overlay,
    layers,
    wallMask: svg.querySelector(`#${wallMaskId}`),
    siteMask: svg.querySelector(`#${siteMaskId}`),
    wallMaskId,
    siteMaskId,
    get scale() { return camera.s; },
    get width() { return camera.width; },
    get height() { return camera.height; },
    toScreen: (p) => [p[0] * camera.s + camera.tx, camera.ty - p[1] * camera.s],
    toWorld: (p) => [(p[0] - camera.tx) / camera.s, (camera.ty - p[1]) / camera.s],
    clientToScreen(x, y) {
      const rect = svg.getBoundingClientRect();
      return [x - rect.left, y - rect.top];
    },
    metres: (px) => px / camera.s,
    zoomAt(factor, at) {
      const before = view.toWorld(at);
      camera.s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, camera.s * factor));
      camera.tx = at[0] - before[0] * camera.s;
      camera.ty = at[1] + before[1] * camera.s;
      apply();
    },
    panBy(dx, dy) {
      camera.tx += dx;
      camera.ty += dy;
      apply();
    },
    fit(bounds, inset = {}) {
      if (camera.width === 0 || camera.height === 0) {
        camera.pendingFit = { bounds, inset };
        return;
      }
      camera.fitted = true;
      camera.pendingFit = null;
      if (!bounds) {
        camera.s = EMPTY_SCALE;
        camera.tx = camera.width / 2;
        camera.ty = camera.height / 2;
        apply();
        return;
      }
      const bw = Math.max(bounds.max[0] - bounds.min[0], 1);
      const bh = Math.max(bounds.max[1] - bounds.min[1], 1);
      const left = inset.left ?? 0;
      const top = inset.top ?? 0;
      const usableW = Math.max(camera.width - left - FIT_PADDING * 2, 40);
      const usableH = Math.max(camera.height - top - FIT_PADDING * 2, 40);
      camera.s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(usableW / bw, usableH / bh)));
      const cx = (bounds.min[0] + bounds.max[0]) / 2;
      const cy = (bounds.min[1] + bounds.max[1]) / 2;
      camera.tx = left + (camera.width - left) / 2 - cx * camera.s;
      camera.ty = top + (camera.height - top) / 2 + cy * camera.s;
      apply();
    },
    visibleBounds() {
      const a = view.toWorld([0, camera.height]);
      const b = view.toWorld([camera.width, 0]);
      return { min: a, max: b };
    },
    destroy() {
      observer.disconnect();
    }
  };

  const observer = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    if (width === camera.width && height === camera.height) return;
    const centre = camera.width > 0 ? view.toWorld([camera.width / 2, camera.height / 2]) : null;
    camera.width = width;
    camera.height = height;
    if (camera.pendingFit && width > 0 && height > 0) {
      view.fit(camera.pendingFit.bounds, camera.pendingFit.inset);
      return;
    }
    if (centre) {
      camera.tx = width / 2 - centre[0] * camera.s;
      camera.ty = height / 2 + centre[1] * camera.s;
    }
    apply();
  });
  observer.observe(svg);
  apply();
  return view;
}

/**
 * Bounds of a list of points, or null when empty.
 * @param {[number, number][]} points
 * @returns {{ min: [number, number], max: [number, number] } | null}
 */
export function boundsOf(points) {
  if (!points.length) return null;
  const min = [Infinity, Infinity];
  const max = [-Infinity, -Infinity];
  for (const p of points) {
    min[0] = Math.min(min[0], p[0]);
    min[1] = Math.min(min[1], p[1]);
    max[0] = Math.max(max[0], p[0]);
    max[1] = Math.max(max[1], p[1]);
  }
  return { min, max };
}

/**
 * Union of bounds, ignoring nulls.
 * @param {({ min: [number, number], max: [number, number] } | null)[]} list
 * @returns {{ min: [number, number], max: [number, number] } | null}
 */
export function unionBounds(list) {
  const points = list.filter(Boolean).flatMap((b) => [b.min, b.max]);
  return boundsOf(points);
}
