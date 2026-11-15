/**
 * Picking and highlighting of paintable surfaces. Rays hit visible surface meshes and floors;
 * furniture in front of a wall blocks the pick. Hover shows a faint veil over the whole paint group;
 * selection pulses briefly and then leaves the true colour untouched.
 */
import * as THREE from 'three';

const PULSE_MS = 900;
const HOVER_OPACITY = 0.1;
const PULSE_OPACITY = 0.32;

/**
 * True when the object and all its ancestors are visible.
 * @param {THREE.Object3D} object
 * @returns {boolean}
 */
export function isShown(object) {
  for (let o = object; o; o = o.parent) {
    if (!o.visible) return false;
  }
  return true;
}

/**
 * True when every material of a mesh is see-through (glass).
 * @param {THREE.Mesh} object
 * @returns {boolean}
 */
function seeThrough(object) {
  const list = Array.isArray(object.material) ? object.material : [object.material];
  return list.every((m) => m && m.transparent && m.opacity < 0.9);
}

/**
 * Creates the picker.
 * @param {THREE.PerspectiveCamera} camera
 * @param {HTMLElement} dom element the pointer coordinates are relative to
 * @returns {object} picker API
 */
export function createPicker(camera, dom) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let targets = [];
  let blockers = [];
  let meshesById = new Map();
  const overlays = new Map();
  let hovered = new Set();
  let pulsing = new Set();
  let pulseStart = 0;

  const veil = new THREE.MeshBasicMaterial({
    color: '#ffffff', transparent: true, opacity: HOVER_OPACITY, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, toneMapped: false
  });
  const pulseVeil = veil.clone();
  pulseVeil.opacity = 0;

  /** Overlay meshes for a surface (created on first use, sharing the surface geometry). */
  function overlaysFor(id) {
    if (overlays.has(id)) return overlays.get(id);
    const list = (meshesById.get(id) || []).map((m) => {
      const o = new THREE.Mesh(m.geometry, veil);
      o.userData.overlay = true;
      o.visible = false;
      o.castShadow = false;
      o.receiveShadow = false;
      o.raycast = () => {};
      m.add(o);
      return o;
    });
    overlays.set(id, list);
    return list;
  }

  /** Shows each overlay according to the hover and pulse sets. */
  function refresh(ids) {
    for (const id of ids) {
      for (const o of overlaysFor(id)) {
        if (pulsing.has(id)) {
          o.material = pulseVeil;
          o.visible = true;
        } else {
          o.material = veil;
          o.visible = hovered.has(id);
        }
      }
    }
  }

  return {
    /**
     * Sets what can be picked.
     * @param {Map<string, THREE.Mesh[]>} surfaceMeshes meshes per surface id
     * @param {THREE.Object3D[]} floorsAndBlockers floors (userData.floor) and furniture that block picks
     */
    setTargets(surfaceMeshes, floorsAndBlockers) {
      meshesById = surfaceMeshes;
      targets = [...surfaceMeshes.values()].flat();
      blockers = floorsAndBlockers;
      overlays.clear();
      hovered = new Set();
      pulsing = new Set();
    },
    /**
     * Finds what is under a pointer position.
     * @param {number} clientX
     * @param {number} clientY
     * @returns {{ surfaceId: string|null, floor: string|null, point: THREE.Vector3 } | null}
     */
    pick(clientX, clientY) {
      const rect = dom.getBoundingClientRect();
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects([...targets, ...blockers], true)
        .filter((hit) => hit.object.isMesh && !hit.object.userData.overlay && isShown(hit.object) && !seeThrough(hit.object));
      if (!hits.length) return null;
      const first = hits[0];
      let surfaceId = null;
      let floor = null;
      for (let o = first.object; o; o = o.parent) {
        if (o.userData.surfaceId) {
          surfaceId = o.userData.surfaceId;
          break;
        }
        if (o.userData.floor) {
          floor = o.userData.floor;
          break;
        }
      }
      return { surfaceId, floor, point: first.point };
    },
    /**
     * Shows the hover veil over a set of surfaces (one paint group); an empty list clears it.
     * @param {string[]} ids
     */
    hover(ids) {
      const before = [...hovered];
      hovered = new Set(ids || []);
      refresh([...before, ...hovered]);
    },
    /**
     * Starts the selection pulse on a set of surfaces.
     * @param {string[]} ids
     * @param {boolean} [reducedMotion]
     */
    pulse(ids, reducedMotion = false) {
      const before = [...pulsing];
      pulsing = reducedMotion ? new Set() : new Set(ids || []);
      pulseStart = performance.now();
      refresh([...before, ...pulsing]);
    },
    /**
     * Animates the pulse.
     * @returns {boolean} true while the pulse is running
     */
    update() {
      if (!pulsing.size) return false;
      const t = (performance.now() - pulseStart) / PULSE_MS;
      if (t >= 1) {
        const ended = [...pulsing];
        pulsing = new Set();
        refresh(ended);
        return true;
      }
      pulseVeil.opacity = PULSE_OPACITY * Math.sin(t * Math.PI * 2) ** 2 * (1 - t * 0.5);
      return true;
    },
    dispose() {
      veil.dispose();
      pulseVeil.dispose();
    }
  };
}
