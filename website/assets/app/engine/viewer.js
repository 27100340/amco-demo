/**
 * The 3D viewer: the only public 3D API. Compiles a Building Model, renders it realistically and
 * lets the visitor look around, pick walls and paint them.
 *
 * @typedef {'matt'|'silk'|'gloss'} Finish
 * @typedef {{ [surfaceId: string]: { code: string, finish: Finish } }} PaintState
 * @typedef {string|{ mode: 'exterior'|'dollhouse'|'room', level?: string, room?: string, position?: number[], target?: number[], focus?: string }} ViewSpec
 *   a string is a building view id, 'exterior', 'dollhouse' or 'room:<roomId>'; `focus` is a surface id the camera faces
 * @typedef {object} SurfaceInfo a Surface plus its paint:
 *   `{ ...Surface, roomName, code, finish, hex, shadeName, groupIds, groupArea }`
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createRenderer } from './renderer.js';
import { pickQuality, createFrameGovernor, lowerTier, QUALITY } from './quality.js';
import { createLighting } from './lighting.js';
import { getMaterial, setMaterialQuality, setDeferredTextures } from './materials/registry.js';
import { drawPendingTextures, startTextureWorkers } from './materials/procedural.js';
import { compileBuilding, buildPendingFixture, addPendingFixtures } from './compile/building.js';
import { runSliced, yieldToBrowser } from './load-scheduler.js';
import { createCameraRig, EYE_HEIGHT, lookAngles } from './cameras.js';
import { createPicker, isShown } from './picking.js';
import { createPaintAnimator } from './paint.js';
import { applyPaint, applyFinish, defaultPaintState, scopeSurfaceIds, paintGroups, FINISHES } from './paint-state.js';
import { estimateLitres } from './estimate.js';
import { validateBuilding } from '../model/schema.js';
import { pointInPolygon, polygonCentroid, projectOnSegment, distance } from '../model/geometry.js';
import { shade, data } from '../legacy.js';
import { markLoad, measureLoad, timeLoad } from './load-timing.js';

/** Colour of unpainted surfaces. */
const UNPAINTED = '#efede8';
/** Camera radius used for collisions in room view (m). */
const BODY_RADIUS = 0.24;
/** Movement (px) that still counts as a click rather than a drag. */
const CLICK_SLOP = 6;
const FADE_MS = 220;
const ROOM_FOV = 60;
const ORBIT_FOV = 36;
/** Share of the frame the building fills in the exterior and dollhouse views. */
const EXTERIOR_FILL = 0.8;
const DOLLHOUSE_FILL = 0.9;
/** Orbit angles from the vertical (radians) for the opening exterior and dollhouse shots. */
const EXTERIOR_POLAR = 1.3;
const DOLLHOUSE_POLAR = 0.86;
const UP = new THREE.Vector3(0, 1, 0);
/** Room views: furniture taller than this (m) blocks the view; rays fanned across the frame (degrees). */
const SIGHT_BLOCK_HEIGHT = 1.4;
const SIGHT_FAN = [-34, -20, -8, 0, 8, 20, 34];
/** Room views: lights hanging lower than this above the floor (m) crowd the eye; room kept around the eye (m). */
const HANGING_BELOW = 2.6;
const HEAD_ROOM = 0.9;
/** Room views: tall furniture (floor lamps, plants, shelves) closer than this to the eye (m) fills the frame. */
const ELBOW_ROOM = 0.7;
/** Facing a wall in a room: furthest and nearest standing distance from it (m). */
const FOCUS_BACK = 4.6;
const FOCUS_MIN = 1.2;
/** Facing an outside wall: the camera swings this far (degrees) off square for a three-quarter view. */
const FOCUS_TURN = 24;
/** Dollhouse: outdoor fixtures at least this tall (m) hide when they stand in front of the building. */
const OCCLUDER_HEIGHT = 2.2;
/** A surface whose area-weighted normal points up or down by more than this share is a ceiling. */
const VERTICAL_SHARE = 0.7;
/** Looking up at a ceiling: least plan distance (m) to the point looked at, so the pitch stays moderate. */
const CEILING_REACH = 1.5;

/**
 * Vertical field of view that keeps at least `minH` degrees across on narrow screens.
 * @returns {number}
 */
function fovFor(vertical, minHorizontal, aspect) {
  const rad = THREE.MathUtils.degToRad;
  const horizontal = 2 * Math.atan(Math.tan(rad(vertical) / 2) * aspect);
  if (horizontal >= rad(minHorizontal)) return vertical;
  return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(rad(minHorizontal) / 2) / aspect));
}

/**
 * Camera distance from `target` along `dir` at which every corner of `box` fits the frame.
 * @param {THREE.Box3} box
 * @param {THREE.Vector3} target look-at point
 * @param {THREE.Vector3} dir unit vector from the target towards the camera
 * @param {number} tanV tangent of half the vertical field of view, times the fill
 * @param {number} tanH tangent of half the horizontal field of view, times the fill
 * @returns {number}
 */
function fitDistance(box, target, dir, tanV, tanH) {
  const right = new THREE.Vector3().crossVectors(UP, dir).normalize();
  const up = new THREE.Vector3().crossVectors(dir, right);
  const q = new THREE.Vector3();
  let best = 0;
  for (let i = 0; i < 8; i++) {
    q.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(target);
    const along = q.dot(dir);
    best = Math.max(best, along + Math.abs(q.dot(right)) / tanH, along + Math.abs(q.dot(up)) / tanV);
  }
  return best;
}

/**
 * Camera position and target that frame a box from a direction, centred on screen.
 * @param {THREE.Box3} box
 * @param {THREE.Vector3} dir unit vector from the box towards the camera
 * @param {number} vertical vertical field of view (radians)
 * @param {number} aspect width / height
 * @param {number} fill share of the frame the box may fill
 * @returns {{ position: THREE.Vector3, target: THREE.Vector3, distance: number }}
 */
function frameBox(box, dir, vertical, aspect, fill) {
  const tanV = Math.tan(vertical / 2);
  const tanH = tanV * aspect;
  const target = box.getCenter(new THREE.Vector3());
  const right = new THREE.Vector3().crossVectors(UP, dir).normalize();
  const up = new THREE.Vector3().crossVectors(dir, right);
  const q = new THREE.Vector3();
  let distance = fitDistance(box, target, dir, tanV * fill, tanH * fill);
  for (let pass = 0; pass < 2; pass++) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < 8; i++) {
      q.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(target);
      const depth = Math.max(0.1, distance - q.dot(dir));
      const x = q.dot(right) / (depth * tanH);
      const y = q.dot(up) / (depth * tanV);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    target.addScaledVector(right, ((minX + maxX) / 2) * distance * tanH).addScaledVector(up, ((minY + maxY) / 2) * distance * tanV);
    distance = fitDistance(box, target, dir, tanV * fill, tanH * fill);
  }
  return { position: target.clone().addScaledVector(dir, distance), target, distance };
}

/**
 * Creates a viewer inside a container.
 * @param {HTMLElement} container element the canvas fills (should be position: relative)
 * @param {{ quality?: 'auto'|'high'|'medium'|'low', interactive?: boolean, onSelect?: (surface: SurfaceInfo|null) => void,
 *   onHover?: (surface: SurfaceInfo|null) => void, onChange?: (state: PaintState) => void,
 *   onView?: (view: { mode: string, level: string|null, room: string|null }) => void }} [options]
 * @returns {object} the viewer API (see the methods below)
 * @throws {Error} when WebGL2 is not available
 */
export function createViewer(container, options = {}) {
  const auto = !options.quality || options.quality === 'auto';
  let tier = auto ? pickQuality() : options.quality;
  if (!QUALITY[tier]) tier = 'high';
  const interactive = options.interactive !== false;
  const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** View changes jump instead of flying: reduced motion, or a viewer nobody drives (still renders). */
  const instant = reducedMotion || !interactive;

  startTextureWorkers();
  const view3d = timeLoad('renderer', () => createRenderer(container, tier));
  const { renderer, canvas } = view3d;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(ORBIT_FOV, 1, 0.3, 2500);
  camera.position.set(15, 8, 15);
  view3d.attach(scene, camera);
  const lighting = timeLoad('lighting', () => createLighting(scene, renderer, tier));
  renderer.shadowMap.autoUpdate = false;
  setMaterialQuality(tier);
  setDeferredTextures(true);

  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', '3D model. Drag to look around, click a wall to select it. In a room, use the arrow keys or W, A, S and D to walk.');
  const fade = document.createElement('div');
  fade.setAttribute('aria-hidden', 'true');
  Object.assign(fade.style, { position: 'absolute', inset: '0', background: '#101214', opacity: '0', pointerEvents: 'none', transition: reducedMotion ? 'none' : `opacity ${FADE_MS}ms ease` });
  container.appendChild(fade);

  /**
   * Rounded boxes made during the current load, by size: kits and openings ask for the same boxes
   * over and over, and a copy costs far less than a new one. Emptied once the load is complete.
   */
  let roundedBoxes = new Map();
  const kitCtx = {
    THREE,
    mat: getMaterial,
    rounded(w, h, d, r, seg = 4) {
      const radius = Math.max(0.0005, Math.min(r, w / 2, h / 2, d / 2));
      const key = `${w}|${h}|${d}|${radius}|${seg}`;
      if (!roundedBoxes.has(key)) roundedBoxes.set(key, new THREE.BufferGeometry().copy(new RoundedBoxGeometry(w, h, d, seg, radius)));
      return roundedBoxes.get(key).clone();
    },
    quality: tier
  };

  let compiled = null;
  let building = null;
  let surfaces = [];
  let surfaceById = new Map();
  let paintState = {};
  let selected = null;
  let hoveredGroup = null;
  let finish = 'matt';
  let view = { mode: 'exterior', level: null, room: null };
  let dollLevel = null;
  /** Outdoor fixtures hidden because they stand between the dollhouse camera and the building. */
  let occluders = new Set();
  const scratch = new THREE.Vector3();
  let dirty = true;
  let disposed = false;
  let loadToken = 0;
  /** Load token whose shaders are compiling in the background (0 when none); no frame is drawn meanwhile. */
  let compiling = 0;
  /** Load timing: the next drawn frame is the load's first (`amco:first-render`), then it is on screen (`amco:first-frame`). */
  let firstFramePending = false;
  let firstFrameDrawn = false;
  /** Callbacks waiting until the load's first frame is on screen, or until the viewer is off-screen (no frame comes). */
  const shownWaiters = [];
  /**
   * Interactive viewers show a model as soon as its opening view is ready and stream the rest in
   * afterwards (see finishLoad); still renders build everything before the first frame.
   */
  const streamFurniture = interactive;
  /** Load token whose furniture is streaming in (0 when none): the frame governor does not judge those frames. */
  let streaming = 0;
  /** The current load's background work; resolves when it is done or cancelled. */
  let completion = Promise.resolve();
  /** Timer of the fade between a room and another view (0 when none), and the token of that fade. */
  let fadeTimer = 0;
  let fadeToken = 0;
  const waiters = [];
  const animator = createPaintAnimator();

  /** Requests a redraw. */
  const invalidate = () => {
    dirty = true;
  };
  view3d.onInvalidate(() => {
    camera.fov = view.mode === 'room' ? fovFor(ROOM_FOV, 72, camera.aspect) : fovFor(ORBIT_FOV, 50, camera.aspect);
    camera.updateProjectionMatrix();
    invalidate();
  });

  const rig = createCameraRig(camera, canvas, { collide, onChange: invalidate, reducedMotion: instant });
  const picker = createPicker(camera, canvas);
  const governor = createFrameGovernor(() => {
    const next = lowerTier(tier);
    if (!next) return;
    tier = next;
    view3d.setQuality(tier);
    shadowsDirty();
    lighting.setQuality(tier);
    applyView(false);
  });

  /* ------------------------------------------------------------ surfaces & paint */

  /** Room display name. */
  function roomName(roomId) {
    if (roomId === 'exterior') return 'Outside walls';
    if (roomId === 'site') return 'Boundary wall';
    const room = compiled && compiled.rooms.get(roomId);
    if (room) return room.name;
    const record = building && (building.rooms || []).find((r) => r.id === roomId);
    return record ? record.name || record.id : roomId;
  }

  /** Surfaces of the paint group of `id`. */
  function groupIds(id) {
    return scopeSurfaceIds(surfaces, id, 'surface');
  }

  /**
   * SurfaceInfo for one surface id.
   * @param {string} id
   * @returns {SurfaceInfo|null}
   */
  function info(id) {
    const s = surfaceById.get(id);
    if (!s) return null;
    const paint = paintState[id];
    const found = paint ? shade(paint.code) : null;
    const ids = groupIds(id);
    return {
      ...s,
      roomName: roomName(s.room),
      code: paint ? paint.code : null,
      finish: paint ? paint.finish : null,
      hex: found ? found.hex : null,
      shadeName: found ? found.name : null,
      groupIds: ids,
      groupArea: Math.round(ids.reduce((sum, k) => sum + (surfaceById.get(k).area || 0), 0) * 100) / 100
    };
  }

  /** Writes the paint of the given surfaces onto their materials. */
  function paintMaterials(ids, animate) {
    if (!compiled) return;
    for (const id of ids) {
      const material = compiled.surfaceMaterials.get(id);
      if (!material) continue;
      const paint = paintState[id];
      const found = paint ? shade(paint.code) : null;
      animator.apply(material, found ? found.hex : UNPAINTED, paint ? paint.finish : 'matt', animate && !reducedMotion);
    }
    invalidate();
  }

  /** Keeps only paint for known surfaces and known shades. */
  function cleanState(state) {
    const clean = {};
    for (const [id, paint] of Object.entries(state || {})) {
      if (!surfaceById.has(id) || !paint || !shade(paint.code)) continue;
      clean[id] = { code: paint.code, finish: FINISHES.includes(paint.finish) ? paint.finish : 'matt' };
    }
    return clean;
  }

  const emitChange = () => options.onChange && options.onChange(getPaintState());
  const getPaintState = () => JSON.parse(JSON.stringify(paintState));

  /* ------------------------------------------------------------ collisions */

  /** True when a plan point is free for the camera body on a level. */
  function free(level, x, y) {
    for (const seg of compiled.wallSegments) {
      if (seg.level !== level) continue;
      const hit = projectOnSegment([x, y], seg.a, seg.b);
      const t = Math.min(1, Math.max(0, hit.t));
      const px = seg.a[0] + (seg.b[0] - seg.a[0]) * t;
      const py = seg.a[1] + (seg.b[1] - seg.a[1]) * t;
      if (Math.hypot(x - px, y - py) < seg.half + BODY_RADIUS) return false;
    }
    for (const c of compiled.colliders) {
      if (c.level !== level) continue;
      const b = c.box;
      if (x > b.min.x - BODY_RADIUS && x < b.max.x + BODY_RADIUS && -y > b.min.y - BODY_RADIUS && -y < b.max.y + BODY_RADIUS) return false;
    }
    return true;
  }

  /** Moves from `from` to `to` in room view, sliding along walls and furniture. */
  function collide(from, to) {
    if (!compiled || view.mode !== 'room') return to;
    const level = view.level;
    if (free(level, to.x, -to.z)) return to;
    if (free(level, to.x, -from.z)) return new THREE.Vector3(to.x, to.y, from.z);
    if (free(level, from.x, -to.z)) return new THREE.Vector3(from.x, to.y, to.z);
    return from.clone();
  }

  /* ------------------------------------------------------------ views */

  /** Normalises a view argument into a spec. */
  function resolveView(arg) {
    if (!arg) return { mode: 'exterior' };
    if (typeof arg === 'object') return { ...arg };
    const found = building && (building.views || []).find((v) => v.id === arg);
    if (found) return { ...found };
    if (arg === 'exterior' || arg === 'dollhouse') return { mode: arg };
    if (arg.startsWith('room:')) return { mode: 'room', room: arg.slice(5) };
    if (compiled && compiled.rooms.has(arg)) return { mode: 'room', room: arg };
    return null;
  }

  /** Levels sorted by elevation. */
  const sortedLevels = () => [...(building ? building.levels : [])].sort((a, b) => a.elevation - b.elevation);

  /** The highest level the dollhouse shows (the chosen level, or the top one). */
  function dollTop() {
    const levels = sortedLevels();
    return (dollLevel && levels.find((l) => l.id === dollLevel)) || levels[levels.length - 1] || null;
  }

  /** World height of the dollhouse section cut: where the walls of the shown top level end. */
  function cutHeight() {
    const top = dollTop();
    if (!top) return Infinity;
    return compiled.levelTops.get(top.id) ?? top.elevation + (top.ceiling || 3);
  }

  /**
   * True when a fixture stands over the building and is mostly above the section cut (roof tanks,
   * roof overhangs, the slab of the level above), so the dollhouse hides it.
   * @param {THREE.Box3} box world bounds of the fixture
   * @param {number} cut section height
   * @returns {boolean}
   */
  function aboveCut(box, cut) {
    const s = compiled.structureBounds;
    if (box.max.x <= s.min.x || box.min.x >= s.max.x || box.max.z <= s.min.z || box.min.z >= s.max.z) return false;
    if (box.min.y >= cut - 0.02) return true;
    return box.max.y > cut + 0.05 && box.max.y - cut > (box.max.y - box.min.y) / 2;
  }

  /** Hides fixtures above the dollhouse cut, those mounted on cut-away façades and tall outdoor ones in front. */
  function applyFixtureVisibility() {
    const doll = view.mode === 'dollhouse';
    const cut = doll ? cutHeight() : Infinity;
    const onCutWalls = new Set();
    if (doll) {
      for (const group of compiled.wallGroups) {
        if (group.userData.cut) for (const object of group.userData.attached || []) onCutWalls.add(object);
      }
    }
    for (const fixture of compiled.fixtures) {
      fixture.object.visible = !doll || (!onCutWalls.has(fixture.object) && !aboveCut(fixture.box, cut) && !occluders.has(fixture.object));
    }
  }

  /** Screen rectangle (NDC) of a box seen by the camera. */
  function screenRect(box) {
    const rect = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    for (let i = 0; i < 8; i++) {
      scratch.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera);
      rect.minX = Math.min(rect.minX, scratch.x);
      rect.maxX = Math.max(rect.maxX, scratch.x);
      rect.minY = Math.min(rect.minY, scratch.y);
      rect.maxY = Math.max(rect.maxY, scratch.y);
    }
    return rect;
  }

  /**
   * Dollhouse: tall outdoor fixtures (trees, street lights) standing between the camera and the
   * building, which would otherwise cover the rooms.
   * @returns {Set<THREE.Object3D>}
   */
  function findOccluders() {
    const found = new Set();
    if (view.mode !== 'dollhouse') return found;
    const s = compiled.structureBounds;
    const shown = s.clone();
    shown.max.y = Math.min(shown.max.y, cutHeight());
    const buildingRect = screenRect(shown);
    const depth = camera.position.distanceTo(shown.getCenter(scratch));
    for (const fixture of compiled.fixtures) {
      const { box } = fixture;
      if (box.max.y - box.min.y < OCCLUDER_HEIGHT) continue;
      const x = (box.min.x + box.max.x) / 2;
      const z = (box.min.z + box.max.z) / 2;
      if (x > s.min.x && x < s.max.x && z > s.min.z && z < s.max.z) continue;
      const r = screenRect(box);
      if (r.maxX <= buildingRect.minX || r.minX >= buildingRect.maxX || r.maxY <= buildingRect.minY || r.minY >= buildingRect.maxY) continue;
      if (camera.position.distanceTo(box.getCenter(scratch)) < depth) found.add(fixture.object);
    }
    return found;
  }

  /** Shows or hides parts of the model for the current view. */
  function applyVisibility() {
    if (!compiled) return;
    const doll = view.mode === 'dollhouse';
    const levels = sortedLevels();
    const limit = doll && dollLevel ? levels.find((l) => l.id === dollLevel) : null;
    for (const level of levels) {
      const group = compiled.levelGroups.get(level.id);
      if (group) group.visible = !limit || level.elevation <= limit.elevation;
    }
    if (compiled.roof) compiled.roof.visible = !doll;
    for (const group of compiled.ceilingGroups) group.visible = !doll;
    for (const face of compiled.exteriorFaces) face.visible = !doll;
    for (const cap of compiled.topCaps) cap.visible = doll;
    if (!doll) for (const group of compiled.wallGroups) setCut(group, false);
    updateCutaway(true);
    applyFixtureVisibility();
    shadowsDirty();
    invalidate();
  }

  /**
   * Cuts a wall away in the dollhouse. Cut walls are hidden outright, so they neither block the
   * view nor cast shadows into the rooms they no longer enclose.
   * @returns {boolean} true when the wall changed state
   */
  function setCut(group, cut) {
    if (Boolean(group.userData.cut) === cut) return false;
    group.userData.cut = cut;
    group.visible = !cut;
    return true;
  }

  /** Re-renders the sun's shadow map on the next frame (the scene is static otherwise). */
  function shadowsDirty() {
    renderer.shadowMap.needsUpdate = true;
    invalidate();
  }

  const lastCutaway = new THREE.Vector3(Infinity, 0, 0);
  /**
   * In dollhouse view, hides the outside walls standing between the camera and the rooms, and the
   * trees and street lights in front of the building.
   */
  function updateCutaway(force) {
    if (!compiled) return;
    if (view.mode !== 'dollhouse') {
      occluders = new Set();
      return;
    }
    if (!force && lastCutaway.distanceToSquared(camera.position) < 1e-6) return;
    lastCutaway.copy(camera.position);
    camera.updateMatrixWorld();
    const toCamera = new THREE.Vector3();
    let changed = false;
    for (const group of compiled.wallGroups) {
      const cut = group.userData.cutaway;
      if (!cut) continue;
      toCamera.subVectors(camera.position, cut.point);
      toCamera.y = 0;
      changed = setCut(group, toCamera.dot(cut.normal) > 0) || changed;
    }
    const next = findOccluders();
    if (next.size !== occluders.size || [...next].some((o) => !occluders.has(o))) changed = true;
    occluders = next;
    if (changed && !force) {
      applyFixtureVisibility();
      shadowsDirty();
    }
  }

  /** Orbit framing for the exterior and dollhouse views. */
  function orbitFor(mode, spec) {
    const doll = mode === 'dollhouse';
    const box = compiled.structureBounds.clone();
    if (doll) {
      box.max.y = Math.min(box.max.y, cutHeight());
    } else {
      const s = compiled.structureBounds;
      for (const { box: f } of compiled.fixtures) {
        const x = (f.min.x + f.max.x) / 2;
        const z = (f.min.z + f.max.z) / 2;
        if (x > s.min.x && x < s.max.x && z > s.min.z && z < s.max.z) box.union(f);
      }
    }
    if (!doll && building.site && building.site.boundaryWall && Array.isArray(building.site.boundary)) {
      const wall = building.site.boundaryWall.height || 2.1;
      for (const p of building.site.boundary) {
        box.expandByPoint(new THREE.Vector3(p[0], 0, -p[1]));
        box.expandByPoint(new THREE.Vector3(p[0], wall, -p[1]));
      }
    }
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(3, Math.hypot(size.x, size.z) / 2, size.y / 2);
    camera.fov = fovFor(ORBIT_FOV, 50, camera.aspect || 1.5);
    camera.near = 0.3;
    camera.far = 2500;
    camera.updateProjectionMatrix();
    const street = building.site && building.site.street ? building.site.street.side : 'south';
    const base = { south: 0, east: 90, north: 180, west: 270 }[street] ?? 0;
    const sunSide = lighting.sunAzimuth() - 180 - base;
    const toward = ((sunSide % 360) + 540) % 360 - 180 > 0 ? 1 : -1;
    const framing = spec.focus ? surfaceFrame(spec.focus) : null;
    const facing = framing && !framing.vertical ? framing : null;
    let azimuth = THREE.MathUtils.degToRad(base + toward * (doll ? 32 : 30));
    let polar = doll ? DOLLHOUSE_POLAR : EXTERIOR_POLAR;
    if (facing) {
      azimuth = Math.atan2(facing.normal.x, facing.normal.z) + (doll ? 0 : THREE.MathUtils.degToRad(FOCUS_TURN));
    } else if ((spec.keepAngle || framing) && rig.getMode() === mode) {
      const offset = new THREE.Vector3().subVectors(camera.position, rig.orbit.target);
      azimuth = Math.atan2(offset.x, offset.z);
      polar = THREE.MathUtils.clamp(Math.acos(THREE.MathUtils.clamp(offset.y / Math.max(offset.length(), 1e-6), -1, 1)), doll ? 0.35 : 0.2, doll ? 1.05 : 1.45);
    }
    const dir = new THREE.Vector3(Math.sin(azimuth) * Math.sin(polar), Math.cos(polar), Math.cos(azimuth) * Math.sin(polar));
    const framed = frameBox(box, dir, THREE.MathUtils.degToRad(camera.fov), camera.aspect || 1.5, doll ? DOLLHOUSE_FILL : EXTERIOR_FILL);
    const target = framed.target;
    let position = framed.position;
    if (Array.isArray(spec.position)) {
      position = spec.position.length >= 3 ? new THREE.Vector3(spec.position[0], spec.position[2], -spec.position[1]) : new THREE.Vector3(spec.position[0], target.y + radius * 0.6, -spec.position[1]);
    }
    if (Array.isArray(spec.target)) target.set(spec.target[0], spec.target.length >= 3 ? spec.target[2] : target.y, -spec.target[1]);
    const site = compiled.siteBounds.clone().expandByScalar(4);
    return {
      position,
      target,
      minDistance: Math.max(2.5, radius * 0.5),
      maxDistance: Math.max(radius * 4, framed.distance * 1.8, 25),
      minPolar: doll ? 0.35 : 0.2,
      maxPolar: doll ? 1.05 : 1.45,
      bounds: site
    };
  }

  /**
   * How far the eye can see along a plan direction before a wall or a tall piece of furniture
   * (wardrobes, shelving, fridges) blocks the view. Low furniture and things hanging above eye
   * height (pendants, fans) do not block the view.
   * @returns {number} metres, at most `max`
   */
  function sightDistance(room, p, dir, max) {
    const tall = compiled.fixtures.filter((f) => f.level === room.level && f.box.max.y - room.elevation > SIGHT_BLOCK_HEIGHT && f.box.min.y - room.elevation < EYE_HEIGHT);
    const walls = compiled.wallSegments.filter((seg) => seg.level === room.level);
    for (let t = 0.15; t < max; t += 0.1) {
      const x = p[0] + dir[0] * t;
      const y = p[1] + dir[1] * t;
      for (const seg of walls) {
        const hit = projectOnSegment([x, y], seg.a, seg.b);
        const k = Math.min(1, Math.max(0, hit.t));
        if (Math.hypot(x - (seg.a[0] + (seg.b[0] - seg.a[0]) * k), y - (seg.a[1] + (seg.b[1] - seg.a[1]) * k)) < seg.half) return t;
      }
      for (const f of tall) {
        if (x > f.box.min.x && x < f.box.max.x && -y > f.box.min.z && -y < f.box.max.z) return t;
      }
    }
    return max;
  }

  /**
   * How cluttered the view from a standing point is: lights hanging just above the eye (pendants,
   * fans) and furniture right in front of it fill the frame.
   * @returns {number} penalty in score units
   */
  function clutter(room, p, heading) {
    const ahead = [p[0] + Math.cos(heading) * HEAD_ROOM, p[1] + Math.sin(heading) * HEAD_ROOM];
    let penalty = 0;
    for (const f of compiled.fixtures) {
      if (f.level !== room.level) continue;
      const bottom = f.box.min.y - room.elevation;
      const near = (q, reach) => q[0] > f.box.min.x - reach && q[0] < f.box.max.x + reach && -q[1] > f.box.min.z - reach && -q[1] < f.box.max.z + reach;
      const top = f.box.max.y - room.elevation;
      if (bottom > EYE_HEIGHT - 0.4 && bottom < HANGING_BELOW && near(p, HEAD_ROOM)) penalty += 2.5;
      else if (bottom < 0.3 && top > 1 && near(p, ELBOW_ROOM)) penalty += 1.5;
      else if (bottom < 0.3 && top > 0.35 && near(ahead, 0.1)) penalty += 1;
    }
    return penalty;
  }

  /**
   * Centre and facing of a paint group: the area-weighted normal of its faces, made horizontal
   * (for parapets, whose faces cancel out, the direction away from the middle of the building).
   * `vertical` marks a surface that mostly faces up or down (a ceiling).
   * @param {string} id surface id
   * @returns {{ centre: THREE.Vector3, normal: THREE.Vector3, box: THREE.Box3, vertical: boolean }|null}
   */
  function surfaceFrame(id) {
    if (!surfaceById.has(id)) return null;
    const box = new THREE.Box3();
    const normal = new THREE.Vector3();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (const sid of groupIds(id)) {
      for (const m of compiled.surfaceMeshes.get(sid) || []) {
        m.updateWorldMatrix(true, false);
        const g = m.geometry;
        if (!g.boundingBox) g.computeBoundingBox();
        box.union(g.boundingBox.clone().applyMatrix4(m.matrixWorld));
        const pos = g.attributes.position;
        const normals = g.attributes.normal;
        if (!normals) continue;
        const count = g.index ? g.index.count : pos.count;
        const local = new THREE.Vector3();
        for (let i = 0; i + 2 < count; i += 3) {
          const i0 = g.index ? g.index.getX(i) : i;
          const i1 = g.index ? g.index.getX(i + 1) : i + 1;
          const i2 = g.index ? g.index.getX(i + 2) : i + 2;
          a.fromBufferAttribute(pos, i0);
          b.fromBufferAttribute(pos, i1);
          c.fromBufferAttribute(pos, i2);
          const area = n.subVectors(b, a).cross(c.sub(a)).length();
          local.add(n.fromBufferAttribute(normals, i0).multiplyScalar(area));
        }
        const weight = local.length();
        if (weight > 0) normal.add(local.transformDirection(m.matrixWorld).multiplyScalar(weight));
      }
    }
    if (box.isEmpty()) return null;
    const centre = box.getCenter(new THREE.Vector3());
    const vertical = Math.abs(normal.y) > VERTICAL_SHARE * normal.length();
    normal.y = 0;
    if (normal.lengthSq() < 1e-6) normal.subVectors(centre, compiled.structureBounds.getCenter(new THREE.Vector3())).setY(0);
    if (normal.lengthSq() < 1e-6) normal.set(0, 0, 1);
    return { centre, normal: normal.normalize(), box, vertical };
  }

  /**
   * Looking up at a ceiling: from where the visitor stands when already in the room (otherwise
   * the room's usual standing point), keeping the heading and pitching up to the ceiling.
   * @param {object} room compiled room
   * @param {THREE.Vector3} centre centre of the ceiling
   * @returns {{ eye: THREE.Vector3, look: THREE.Vector3 }}
   */
  function ceilingEye(room, centre) {
    const here = view.mode === 'room' && view.room === room.id && rig.getMode() === 'room';
    const eye = here ? camera.position.clone() : roomEye(room, {}).eye;
    const heading = here ? rig.getLook().yaw : lookAngles(eye, centre).yaw;
    const reach = Math.max(CEILING_REACH, Math.hypot(centre.x - eye.x, centre.z - eye.z));
    return { eye, look: new THREE.Vector3(eye.x - Math.sin(heading) * reach, centre.y, eye.z - Math.cos(heading) * reach) };
  }

  /**
   * Standing point that faces a wall of a room: as far back from the wall as the room allows
   * (up to a few metres), looking at its middle.
   * @returns {{ eye: THREE.Vector3, look: THREE.Vector3 }|null}
   */
  function focusEye(room, surfaceId) {
    const facing = surfaceFrame(surfaceId);
    if (!facing) return null;
    if (facing.vertical) return ceilingEye(room, facing.centre);
    const { centre, normal, box } = facing;
    const start = [centre.x, -centre.z];
    const out = [normal.x, -normal.z];
    const along = [-out[1], out[0]];
    const width = Math.abs((box.max.x - box.min.x) * along[0]) + Math.abs((box.max.z - box.min.z) * along[1]);
    let best = null;
    for (let d = FOCUS_MIN; d <= FOCUS_BACK + 1e-6; d += 0.3) {
      for (const shift of [0, -0.25, 0.25]) {
        const u = shift * width;
        const p = [start[0] + out[0] * d + along[0] * u, start[1] + out[1] * d + along[1] * u];
        if (!pointInPolygon(p, room.polygon) || !free(room.level, p[0], p[1])) continue;
        let clear = 0;
        for (const end of [0, -0.35, 0.35]) {
          const q = [start[0] + along[0] * end * width, start[1] + along[1] * end * width];
          const span = distance(p, q);
          const seen = sightDistance(room, p, [(q[0] - p[0]) / span, (q[1] - p[1]) / span], span);
          if (seen >= span - 0.3) clear += end === 0 ? 2 : 1;
        }
        const heading = Math.atan2(start[1] - p[1], start[0] - p[0]);
        const score = clear * 1.5 + Math.min(d, FOCUS_BACK) - Math.abs(shift) - clutter(room, p, heading);
        if (!best || score > best.score) best = { p, score };
      }
    }
    if (!best) return null;
    return {
      eye: new THREE.Vector3(best.p[0], room.elevation + EYE_HEIGHT, -best.p[1]),
      look: new THREE.Vector3(centre.x, room.elevation + Math.min(1.3, centre.y - room.elevation), centre.z)
    };
  }

  /**
   * A good standing point and look target for a room: from points near its corners and walls,
   * the one with the deepest, widest view towards the middle of the room. A spec with `focus`
   * (a surface id) faces that wall instead.
   */
  function roomEye(room, spec) {
    const polygon = room.polygon;
    const floorY = room.elevation;
    if (Array.isArray(spec.position)) {
      const eye = new THREE.Vector3(spec.position[0], floorY + (spec.position[2] ?? EYE_HEIGHT), -spec.position[1]);
      const t = Array.isArray(spec.target) ? spec.target : room.centroid;
      const look = new THREE.Vector3(t[0], floorY + (t[2] ?? 1.3), -t[1]);
      return { eye, look };
    }
    if (spec.focus) {
      const facing = focusEye(room, spec.focus);
      if (facing) return facing;
    }
    const c = polygonCentroid(polygon);
    const candidates = [];
    polygon.forEach((v, i) => {
      const next = polygon[(i + 1) % polygon.length];
      for (const k of [0.14, 0.22, 0.3, 0.38]) candidates.push([v[0] + (c[0] - v[0]) * k, v[1] + (c[1] - v[1]) * k]);
      const mid = [(v[0] + next[0]) / 2, (v[1] + next[1]) / 2];
      for (const k of [0.15, 0.3]) candidates.push([mid[0] + (c[0] - mid[0]) * k, mid[1] + (c[1] - mid[1]) * k]);
    });
    const reach = Math.min(12, Math.max(4, Math.sqrt(room.area || 16) * 2));
    let best = null;
    for (const p of candidates) {
      if (!pointInPolygon(p, polygon) || !free(room.level, p[0], p[1])) continue;
      const toCentre = distance(p, c);
      if (toCentre < 0.6) continue;
      const heading = Math.atan2(c[1] - p[1], c[0] - p[0]);
      let sum = 0;
      let narrowest = Infinity;
      for (const spread of SIGHT_FAN) {
        const a = heading + THREE.MathUtils.degToRad(spread);
        const seen = sightDistance(room, p, [Math.cos(a), Math.sin(a)], reach);
        sum += seen;
        narrowest = Math.min(narrowest, seen);
      }
      const score = sum / SIGHT_FAN.length + Math.min(narrowest, 2.5) + toCentre * 0.35 - clutter(room, p, heading);
      if (!best || score > best.score) best = { p, score };
    }
    const p = best ? best.p : c;
    const target = best ? [c[0] + (c[0] - p[0]) * 0.7, c[1] + (c[1] - p[1]) * 0.7] : [c[0] + 1, c[1]];
    return {
      eye: new THREE.Vector3(p[0], floorY + EYE_HEIGHT, -p[1]),
      look: new THREE.Vector3(target[0], floorY + 1.2, -target[1])
    };
  }

  /** Room containing a world point on a level, or null. */
  function roomAt(levelId, x, z) {
    if (!compiled) return null;
    for (const room of compiled.rooms.values()) {
      if (room.level === levelId && pointInPolygon([x, -z], room.polygon)) return room;
    }
    return null;
  }

  /** Points the lighting at the current view. */
  function lightForView() {
    shadowsDirty();
    if (view.mode === 'room') {
      const room = compiled.rooms.get(view.room);
      const box = room ? room.bounds.clone().expandByScalar(3) : compiled.bounds;
      lighting.setActiveRoom(view.room);
      lighting.setContext('interior', box);
    } else {
      lighting.setActiveRoom(null);
      lighting.setContext(view.mode === 'dollhouse' ? 'interior' : 'exterior', compiled.siteBounds.clone().union(compiled.bounds), true);
    }
  }

  const emitView = () => options.onView && options.onView({ mode: view.mode, level: view.level, room: view.room });

  /**
   * Cancels the fade in progress: its pending step never runs and the screen is uncovered (a
   * following fade covers it again in the same frame, so nothing flickers).
   */
  function cancelFade() {
    window.clearTimeout(fadeTimer);
    fadeTimer = 0;
    fadeToken += 1;
    fade.style.opacity = '0';
  }

  /**
   * Fades to dark, runs `step` (the camera jump) and fades back in. A newer view, a new building
   * or disposal cancels it; a step that is late for any reason still bails out when it is stale.
   * @param {() => void} step
   */
  function fadeThrough(step) {
    cancelFade();
    const token = fadeToken;
    const model = compiled;
    fade.style.opacity = '1';
    fadeTimer = window.setTimeout(() => {
      if (token !== fadeToken || disposed || compiled !== model) return;
      step();
      invalidate();
      fadeTimer = window.setTimeout(() => {
        fadeTimer = 0;
        if (token === fadeToken) fade.style.opacity = '0';
      }, 60);
    }, FADE_MS);
  }

  /** Applies the current view (after a quality change or a level change). */
  function applyView() {
    if (!compiled) return;
    applyVisibility();
    lightForView();
    invalidate();
  }

  /**
   * Moves to a view.
   * @param {ViewSpec} arg
   * @param {boolean} [animate=true]
   * @returns {boolean} false when the view is unknown
   */
  function setView(arg, animate = true) {
    if (!compiled) return false;
    const spec = resolveView(arg);
    if (!spec) return false;
    const room = spec.mode === 'room' ? compiled.rooms.get(spec.room) : null;
    if (spec.mode === 'room' ? !room : spec.mode !== 'exterior' && spec.mode !== 'dollhouse') return false;
    cancelFade();
    if (room) {
      const { eye, look } = roomEye(room, spec);
      const angles = lookAngles(eye, look);
      const enter = () => {
        view = { mode: 'room', level: room.level, room: room.id };
        camera.fov = fovFor(ROOM_FOV, 72, camera.aspect || 1.5);
        camera.near = 0.05;
        camera.far = 800;
        camera.updateProjectionMatrix();
        rig.setRoom({ position: eye, yaw: angles.yaw, pitch: angles.pitch, animate: false });
        applyVisibility();
        lightForView();
        emitView();
      };
      if (!animate || instant) {
        enter();
        return true;
      }
      if (view.mode === 'room' && view.room === room.id) {
        rig.setRoom({ position: eye, yaw: angles.yaw, pitch: angles.pitch, animate: true });
        return true;
      }
      fadeThrough(enter);
      return true;
    }
    if (spec.mode === 'dollhouse' && spec.level !== undefined) dollLevel = spec.level;
    const wasRoom = view.mode === 'room' || rig.getMode() === 'room';
    view = { mode: spec.mode, level: spec.mode === 'dollhouse' ? dollLevel : null, room: null };
    const frame = orbitFor(spec.mode, spec);
    applyVisibility();
    lightForView();
    if (wasRoom && animate && !instant) {
      fadeThrough(() => {
        rig.setOrbit(spec.mode, { ...frame, animate: false });
        updateCutaway(true);
      });
    } else {
      rig.setOrbit(spec.mode, { ...frame, animate: animate && !instant });
    }
    emitView();
    return true;
  }

  /* ------------------------------------------------------------ pointer */

  let down = null;
  let hoverAt = null;
  function onPointerDown(event) {
    down = { x: event.clientX, y: event.clientY, t: performance.now() };
    canvas.focus({ preventScroll: true });
  }
  function onPointerUp(event) {
    if (!down) return;
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    const quick = performance.now() - down.t < 700;
    down = null;
    if (moved > CLICK_SLOP || !quick || !compiled) return;
    const hit = picker.pick(event.clientX, event.clientY);
    if (!hit) return;
    if (hit.surfaceId && surfaceById.has(hit.surfaceId)) {
      api.select(hit.surfaceId);
      return;
    }
    if (hit.floor && view.mode === 'room') rig.glideTo(hit.point);
  }
  function onPointerMove(event) {
    if (event.pointerType !== 'mouse' || event.buttons) return;
    hoverAt = { x: event.clientX, y: event.clientY };
  }
  function onPointerLeave() {
    hoverAt = null;
    setHover(null);
  }
  /** Updates the hover group. */
  function setHover(id) {
    const group = id ? (surfaceById.get(id).group || id) : null;
    if (group === hoveredGroup) return;
    hoveredGroup = group;
    picker.hover(id ? groupIds(id) : []);
    canvas.style.cursor = id ? 'pointer' : '';
    invalidate();
    if (options.onHover) options.onHover(id ? info(id) : null);
  }
  if (interactive) {
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);
  }

  /* ------------------------------------------------------------ loop */

  let raf = 0;
  let last = performance.now();
  let lastRender = 0;
  let renderedLastFrame = false;
  const lastMatrix = new THREE.Matrix4();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (firstFrameDrawn) {
      firstFrameDrawn = false;
      markLoad('first-frame');
    }
    if (shownWaiters.length && ((!firstFramePending && !firstFrameDrawn && !compiling) || !view3d.isActive())) {
      while (shownWaiters.length) shownWaiters.shift()();
    }
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    if (!view3d.isActive()) {
      renderedLastFrame = false;
      return;
    }
    let busy = rig.update(dt);
    busy = picker.update() || busy;
    busy = animator.update() || busy;
    if (hoverAt && compiled && !rig.isFlying()) {
      const hit = picker.pick(hoverAt.x, hoverAt.y);
      setHover(hit && hit.surfaceId && surfaceById.has(hit.surfaceId) ? hit.surfaceId : null);
      hoverAt = null;
    }
    camera.updateMatrixWorld();
    const moved = !lastMatrix.equals(camera.matrixWorld);
    if (moved) {
      lastMatrix.copy(camera.matrixWorld);
      if (view.mode === 'dollhouse') updateCutaway(false);
      if (view.mode === 'room' && !rig.isFlying()) trackRoom();
    }
    if (!(busy || moved || dirty) || !compiled || compiling) {
      renderedLastFrame = false;
      return;
    }
    if (firstFramePending) {
      firstFramePending = false;
      firstFrameDrawn = true;
      timeLoad('first-render', () => view3d.render(true));
    } else {
      view3d.render();
    }
    dirty = false;
    if (auto && renderedLastFrame && streaming !== loadToken) governor.sample(now - lastRender);
    lastRender = now;
    renderedLastFrame = true;
    while (waiters.length) waiters.shift()();
  }
  raf = requestAnimationFrame(frame);

  /** Notices when the visitor walks into another room. */
  function trackRoom() {
    const room = roomAt(view.level, camera.position.x, camera.position.z);
    if (room && room.id !== view.room) {
      view = { mode: 'room', level: room.level, room: room.id };
      lightForView();
      emitView();
    }
  }

  /* ------------------------------------------------------------ disposal */

  /** Frees the GPU resources of the current building. */
  function unload() {
    cancelFade();
    if (!compiled) return;
    scene.remove(compiled.root);
    const geometries = new Set();
    compiled.root.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      if (o.userData.ownMaterial && o.material) o.material.dispose();
    });
    geometries.forEach((g) => g.dispose());
    for (const material of compiled.surfaceMaterials.values()) material.dispose();
    animator.clear();
    compiled = null;
  }

  /**
   * Resolves once the load's first frame is on screen, or at once while the viewer is off-screen
   * (no frame comes then, and the background work may as well go ahead).
   * @returns {Promise<void>}
   */
  function firstFrameShown() {
    return new Promise((resolve) => shownWaiters.push(resolve));
  }

  /**
   * Compiles, in the background, the shaders of everything the current view hides (section caps,
   * ceilings, cut-away walls and fixtures), so that a later switch to a view showing them does not
   * stall. Hidden objects are shown only for the synchronous start of the compile.
   * @returns {Promise<void>}
   */
  function compileHidden() {
    const hidden = [];
    compiled.root.traverse((object) => {
      if (object.visible) return;
      object.visible = true;
      hidden.push(object);
    });
    const ready = view3d.compile();
    for (const object of hidden) object.visible = false;
    return ready;
  }

  /**
   * A load's background work after its first frame: shaders for the views the opening view hides,
   * the interior light box, then the fixtures left for later, batch by batch (each built in slices,
   * its textures drawn and its shaders compiled before any of it is shown, so no frame stalls on
   * it; the sun is refitted to the grown bounds). Every step stops when a newer load or disposal
   * makes it stale.
   * @param {number} token load token
   * @returns {Promise<void>}
   */
  async function finishLoad(token) {
    const stale = () => token !== loadToken || disposed;
    await firstFrameShown();
    if (stale()) return;
    const hiddenReady = compileHidden().catch((error) => console.error(error));
    await yieldToBrowser();
    if (stale()) return;
    lighting.prepare();
    const model = compiled;
    const start = performance.now();
    let count = 0;
    streaming = token;
    while (model.pendingFixtures.length) {
      const built = [];
      const done = await runSliced(model.pendingFixtures[0], (fixture) => {
        const item = buildPendingFixture(model, fixture);
        if (item) built.push(item);
      }, { cancelled: stale });
      if (done) await drawPendingTextures({ cancelled: stale });
      if (stale()) return;
      const staging = new THREE.Group();
      for (const item of built) staging.add(item.object);
      const shaders = view3d.compile(staging);
      view3d.uploadTextures(staging);
      try {
        await shaders;
      } catch (error) {
        console.error(error);
      }
      if (stale()) return;
      addPendingFixtures(model, built);
      model.pendingFixtures.shift();
      picker.setTargets(model.surfaceMeshes, [...model.floors, ...model.blockers]);
      applyVisibility();
      lightForView();
      count += built.length;
    }
    if (count) measureLoad('stream-fixtures', start, { count });
    streaming = 0;
    governor.reset();
    roundedBoxes = new Map();
    await hiddenReady;
    if (stale()) return;
    markLoad('full-ready');
  }

  /* ------------------------------------------------------------ API */

  const api = {
    /**
     * Compiles a Building Model into the scene, applies paint (the given state, or the building's
     * defaults) and opens a view. Resolves when the opening view is ready to draw: in an
     * interactive viewer, furniture the opening view does not show and shaders for other views
     * then follow in the background (see `whenComplete`).
     * @param {object} next Building Model (amco.building/1)
     * @param {PaintState} [state]
     * @param {ViewSpec} [openingView] view to open (default: the building's first view, else the exterior)
     * @returns {Promise<void>}
     */
    async load(next, state, openingView) {
      const token = ++loadToken;
      markLoad('load-start', { tier });
      const check = validateBuilding(next);
      if (!check.ok) throw new Error(`This building cannot be shown: ${check.errors.join('; ')}`);
      setMaterialQuality(tier);
      unload();
      building = next;
      kitCtx.quality = tier;
      roundedBoxes = new Map();
      const first = (next.views || [])[0];
      const fallback = first ? first.id : 'exterior';
      const opening = resolveView(openingView || fallback) || { mode: 'exterior' };
      let shellShaders = Promise.resolve();
      compiled = timeLoad('compile', () => compileBuilding(next, {
        quality: tier,
        mat: getMaterial,
        kitCtx,
        opening: streamFurniture ? opening : null,
        onShell: (root) => {
          shellShaders = view3d.compile(root);
        }
      }));
      scene.add(compiled.root);
      surfaces = compiled.surfaces;
      surfaceById = new Map(surfaces.map((s) => [s.id, s]));
      selected = null;
      hoveredGroup = null;
      dollLevel = null;
      lighting.setWindows(compiled.windowLights);
      lighting.setLamps(compiled.lamps);
      picker.setTargets(compiled.surfaceMeshes, [...compiled.floors, ...compiled.blockers]);
      paintState = state ? cleanState(state) : defaultPaintState(next, surfaces);
      paintMaterials(surfaces.map((s) => s.id), false);
      if (!(openingView && setView(openingView, false))) setView(fallback, false);
      compiling = token;
      const stale = () => token !== loadToken || disposed;
      const compileStart = performance.now();
      const marked = (promise, name) => promise.then(() => markLoad(name));
      const shaders = Promise.all([marked(shellShaders, 'shaders:shell'), marked(view3d.compile(), 'shaders:scene'), marked(view3d.compilePasses(), 'shaders:passes')]);
      await drawPendingTextures({ cancelled: stale });
      markLoad('textures-ready');
      if (!stale()) {
        timeLoad('upload-textures', () => view3d.uploadTextures());
        timeLoad('warm-up', () => view3d.warmUp());
      }
      try {
        await shaders;
      } catch (error) {
        console.error(error);
      }
      measureLoad('shader-compile', compileStart);
      if (compiling === token) compiling = 0;
      if (stale()) return;
      firstFramePending = true;
      invalidate();
      markLoad('load-done');
      completion = finishLoad(token);
    },
    /**
     * Resolves when the current load's background work is done: furniture streamed in and the
     * shaders of every view compiled (at once for a still render). Also resolves when a newer
     * load or disposal cancels that work.
     * @returns {Promise<void>}
     */
    whenComplete: () => completion,
    /**
     * Moves the camera to a view: a building view id, 'exterior', 'dollhouse', 'room:<id>' or a spec.
     * @param {ViewSpec} viewArg
     * @returns {boolean} false when the view is unknown
     */
    setView(viewArg) {
      return setView(viewArg, true);
    },
    /**
     * Turns the camera to face a surface: a room wall from inside its room (or across the dollhouse
     * when that is the current view), a ceiling by looking up at it from inside its room (the
     * dollhouse keeps its angle, as ceilings are cut away there), an outside wall from the street
     * side. Boundary wall faces keep the current view.
     * @param {string} surfaceId
     * @returns {boolean} false when the surface is unknown or the view stays
     */
    focus(surfaceId) {
      const surface = surfaceById.get(surfaceId);
      if (!surface || !compiled || surface.room === 'site') return false;
      const room = compiled.rooms.get(surface.room);
      if (room && view.mode === 'dollhouse') {
        const levels = sortedLevels();
        const shown = dollTop();
        const above = shown && levels.findIndex((l) => l.id === room.level) > levels.findIndex((l) => l.id === shown.id);
        return setView({ mode: 'dollhouse', level: above ? room.level : dollLevel, focus: surfaceId }, true);
      }
      if (room) return setView({ mode: 'room', room: room.id, focus: surfaceId }, true);
      return setView({ mode: 'exterior', focus: surfaceId }, true);
    },
    /**
     * Dollhouse: hide the levels above this one (null shows every level).
     * @param {string|null} levelId
     */
    setLevel(levelId) {
      dollLevel = levelId && sortedLevels().some((l) => l.id === levelId) ? levelId : null;
      if (view.mode === 'dollhouse') setView({ mode: 'dollhouse', level: dollLevel, keepAngle: true }, true);
    },
    /**
     * Selects a surface (its whole paint group pulses) or clears the selection.
     * @param {string|null} surfaceId
     */
    select(surfaceId) {
      selected = surfaceId && surfaceById.has(surfaceId) ? surfaceId : null;
      picker.pulse(selected ? groupIds(selected) : [], reducedMotion);
      invalidate();
      if (options.onSelect) options.onSelect(selected ? info(selected) : null);
    },
    /** @returns {SurfaceInfo|null} the selected surface */
    getSelected: () => (selected ? info(selected) : null),
    /**
     * Paints with a shade.
     * @param {string} code shade code
     * @param {{ scope?: 'surface'|'room'|'exterior'|'all', finish?: Finish }} [opts]
     * @returns {boolean} false when nothing was painted (no selection for this scope, unknown shade)
     */
    paint(code, opts = {}) {
      if (!shade(code)) return false;
      const scope = opts.scope || 'surface';
      let anchor = selected;
      if (!anchor && scope === 'room' && view.mode === 'room') {
        const wall = surfaces.find((s) => s.room === view.room && s.side !== 'C');
        anchor = wall ? wall.id : null;
      }
      const ids = scopeSurfaceIds(surfaces, anchor, scope);
      if (!ids.length) return false;
      const useFinish = FINISHES.includes(opts.finish) ? opts.finish : finish;
      paintState = applyPaint(paintState, ids, code, useFinish);
      paintMaterials(ids, true);
      emitChange();
      if (selected && options.onSelect) options.onSelect(info(selected));
      return true;
    },
    /**
     * Switches the lighting.
     * @param {'day'|'warm'|'cool'} mode daylight, warm bulb (2700 K) or tube light (6500 K)
     */
    setLight(mode) {
      lighting.setMode(mode);
      shadowsDirty();
      lightForView();
      invalidate();
    },
    /** @returns {'day'|'warm'|'cool'} */
    getLight: () => lighting.getMode(),
    /**
     * Sets the finish for later paint and re-finishes the selected wall (everything when nothing is selected).
     * @param {Finish} next
     */
    setFinish(next) {
      if (!FINISHES.includes(next)) return;
      finish = next;
      const ids = selected ? groupIds(selected) : Object.keys(paintState);
      paintState = applyFinish(paintState, ids, next);
      paintMaterials(ids, false);
      emitChange();
      if (selected && options.onSelect) options.onSelect(info(selected));
    },
    /** @returns {Finish} the finish used for new paint */
    getFinish: () => finish,
    /** @returns {SurfaceInfo[]} every paintable surface with its paint */
    getSurfaces: () => surfaces.map((s) => info(s.id)),
    /**
     * One row per paint group (a wall side facing one room), area summed, labels unique.
     * @returns {object[]}
     */
    getGroups() {
      return paintGroups(surfaces, paintState).map((row) => {
        const found = row.code ? shade(row.code) : null;
        return { ...row, roomName: roomName(row.room), hex: found ? found.hex : null, shadeName: found ? found.name : null };
      });
    },
    /** @returns {PaintState} a copy of the paint state */
    getPaintState,
    /**
     * Replaces the paint state (unknown surfaces and shades are dropped).
     * @param {PaintState} state
     */
    setPaintState(state) {
      paintState = cleanState(state);
      paintMaterials(surfaces.map((s) => s.id), true);
      emitChange();
      if (selected && options.onSelect) options.onSelect(info(selected));
    },
    /** Restores the building's default paint. */
    resetPaint() {
      api.setPaintState(building ? defaultPaintState(building, surfaces) : {});
    },
    /**
     * Litres for two coats of a product, per room and in total, with suggested tins.
     * @param {string} productId product id from the product data
     * @returns {{ rows: { room: string, label: string, area: number, litres: number }[], totalArea: number, totalLitres: number, tins: { pack: object, count: number }[] }}
     */
    estimate(productId) {
      const product = data && data.product ? data.product(productId) : null;
      const result = estimateLitres(api.getSurfaces(), paintState, product, 2);
      const tins = data && data.packsFor ? data.packsFor(result.totalLitres) : [];
      return { ...result, tins };
    },
    /**
     * Renders one frame at the given size and returns it as a WebP image.
     * @param {{ width: number, height: number }} size
     * @returns {Promise<Blob>}
     */
    async snapshot({ width, height }) {
      const restore = view3d.withSize(width, height, 1);
      const fov = camera.fov;
      if (view.mode === 'room') camera.fov = fovFor(ROOM_FOV, 72, width / height);
      camera.updateProjectionMatrix();
      view3d.render();
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.92));
      camera.fov = fov;
      restore();
      invalidate();
      return blob;
    },
    /** @returns {{ mode: string, level: string|null, room: string|null }} the current view */
    getView: () => ({ ...view }),
    /** @returns {{ id: string, name: string, elevation: number }[]} levels, lowest first */
    getLevels: () => sortedLevels().map((l) => ({ id: l.id, name: l.name || l.id, elevation: l.elevation })),
    /** @returns {{ id: string, name: string, level: string }[]} rooms with a shape */
    getRooms: () => (compiled ? [...compiled.rooms.values()].map((r) => ({ id: r.id, name: r.name, level: r.level })) : []),
    /** @returns {'high'|'medium'|'low'} the quality tier in use */
    getQuality: () => tier,
    /**
     * Resolves after the next frame has been drawn (shadows and ambient occlusion included).
     * @returns {Promise<void>}
     */
    rendered() {
      invalidate();
      return new Promise((resolve) => waiters.push(resolve));
    },
    /**
     * Internals for development tools (colour probe, screenshots). Not for page code.
     * @returns {{ renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, compiled: object, render: () => void, isShown: Function }}
     */
    internals: () => ({ renderer, scene, camera, compiled, render: () => view3d.render(), isShown, lighting, passes: view3d.passes() }),
    /** Releases the renderer, listeners and GPU resources. */
    dispose() {
      disposed = true;
      cancelFade();
      cancelAnimationFrame(raf);
      while (shownWaiters.length) shownWaiters.shift()();
      if (interactive) {
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerleave', onPointerLeave);
      }
      unload();
      rig.dispose();
      picker.dispose();
      lighting.dispose();
      view3d.dispose();
      fade.remove();
    }
  };
  return api;
}
