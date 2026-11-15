/**
 * Lighting rig: image-based environment (a soft light box indoors, a physical sky outdoors, both
 * through PMREM), a shadow-casting sun, soft window light from rect-area lights and room lamps.
 * Three modes: daylight, warm bulb (2700 K) and tube light (6500 K), each with its own exposure.
 *
 * Window lights and lamps come from fixed-size pools that stay in the scene in every view and
 * mode: a change in the number of lights (or in which lights cast shadows) makes the GPU recompile
 * every shader, which takes seconds per shader on some laptops.
 */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { QUALITY } from './quality.js';
import { getMaterial } from './materials/registry.js';

/** 2700 K and 6500 K lamp tints. */
export const LAMP_WARM = '#ffb46b';
export const LAMP_COOL = '#e6f0ff';
/**
 * The warm bulb as a person standing in the room sees it: eyes (and phone cameras) partly adapt
 * to bulb light, so it reads warm and cosy rather than the raw orange of 2700 K against daylight
 * white, and a shade stays recognisable.
 */
const LAMP_WARM_SEEN = '#ffcf9f';

/**
 * Per-mode settings. Sun angles are compass degrees (0 north, 90 east) and degrees above the
 * horizon. Exposure is tuned so a matt mid-tone wall in daylight renders close to its swatch.
 */
export const LIGHT_MODES = {
  day: {
    exposure: 1.0,
    sun: { azimuth: 215, elevation: 42, color: '#fff6ea', intensity: 5 },
    sky: { turbidity: 6, rayleigh: 0.75, mieCoefficient: 0.005, mieDirectionalG: 0.8, cloudCoverage: 0.3 },
    ground: '#7c7a68',
    dome: { zenith: '#a3b8cf', horizon: '#e9eae6', ground: '#8f8a78' },
    exteriorEnv: 0.62,
    background: 0.55,
    interiorEnv: 1.0,
    bounce: 0.3,
    bounceSky: 0.3,
    interiorTint: '#ffffff',
    lamp: { color: LAMP_WARM, intensity: 0 },
    dayFill: { color: '#fff3e2', intensity: 5 },
    window: { color: '#f1f4fa', intensity: 8 },
    led: 0.35,
    fog: '#cfd7dc'
  },
  warm: {
    exposure: 1.35,
    sun: { azimuth: 250, elevation: -3, color: '#8fa6d0', intensity: 0 },
    sky: { turbidity: 4, rayleigh: 2.4, mieCoefficient: 0.006, mieDirectionalG: 0.85, cloudCoverage: 0.25 },
    ground: '#2a2c2a',
    dome: { zenith: '#3c4a66', horizon: '#6a6f7c', ground: '#2c2c2a' },
    exteriorEnv: 0.5,
    background: 0.9,
    interiorEnv: 0.3,
    bounce: 0.35,
    interiorTint: '#ffe0c0',
    lamp: { color: LAMP_WARM_SEEN, intensity: 14 },
    window: { color: '#6f86b8', intensity: 0.15 },
    led: 3,
    fog: '#3b4559'
  },
  cool: {
    exposure: 1.3,
    sun: { azimuth: 250, elevation: -3, color: '#8fa6d0', intensity: 0 },
    sky: { turbidity: 4, rayleigh: 2.4, mieCoefficient: 0.006, mieDirectionalG: 0.85, cloudCoverage: 0.25 },
    ground: '#2a2c2a',
    dome: { zenith: '#3c4a66', horizon: '#6a6f7c', ground: '#2c2c2a' },
    exteriorEnv: 0.5,
    background: 0.9,
    interiorEnv: 0.32,
    bounce: 0.35,
    interiorTint: LAMP_COOL,
    lamp: { color: LAMP_COOL, intensity: 14 },
    window: { color: '#6f86b8', intensity: 0.15 },
    led: 3,
    fog: '#3b4559'
  }
};

/** Distance haze in outdoor views (m): the open ground fades into the horizon. */
const FOG_NEAR = 70;
const FOG_FAR = 380;

/**
 * Indoors the hemisphere light stands in for light bounced off the floor and walls: it lights walls
 * and ceilings more than floors. Share of its strength that reaches upward-facing surfaces.
 */
const BOUNCE_SKY = 0.55;

/** Radiance of the indoor light box bands (see buildRoom). */
const ROOM_BOX = { floor: 0.35, wall: 0.9, ceiling: 0.7, panel: 2.4 };

/** Shadow filter radius (texels) for the soft sun shadow. */
const SHADOW_RADIUS = 4;

/** Window light a room gets at most, as glazed area per m² of floor; glassier rooms share it. */
const GLAZING_SHARE = 0.2;
/** Rooms with less glazing than this per m² of floor have their ceiling lights on in daylight. */
const DAYLIT_SHARE = 0.1;

/**
 * Unit vector pointing from the scene towards the sun.
 * @param {number} azimuth compass degrees
 * @param {number} elevation degrees above the horizon
 * @returns {THREE.Vector3}
 */
function sunDirection(azimuth, elevation) {
  const az = THREE.MathUtils.degToRad(azimuth);
  const el = THREE.MathUtils.degToRad(elevation);
  return new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)).normalize();
}

/**
 * Renders the physical sky (and a ground disc) into a cube map for the background, and a soft
 * sky-and-ground dome into a PMREM for lighting. The dome keeps the outdoor fill close to neutral,
 * so white walls in shade read grey-blue rather than navy.
 * @returns {{ background: THREE.Texture, environment: THREE.Texture, dispose: () => void }}
 */
function buildSky(renderer, pmrem, mode) {
  const scene = new THREE.Scene();
  const sky = new Sky();
  sky.scale.setScalar(1000);
  const u = sky.material.uniforms;
  u.turbidity.value = mode.sky.turbidity;
  u.rayleigh.value = mode.sky.rayleigh;
  u.mieCoefficient.value = mode.sky.mieCoefficient;
  u.mieDirectionalG.value = mode.sky.mieDirectionalG;
  if (u.cloudCoverage) u.cloudCoverage.value = mode.sky.cloudCoverage;
  if (u.showSunDisc) u.showSunDisc.value = 0;
  u.sunPosition.value.copy(sunDirection(mode.sun.azimuth, mode.sun.elevation));
  scene.add(sky);
  const haze = new THREE.SphereGeometry(900, 64, 32);
  const hazeColour = new THREE.Color(mode.fog).multiplyScalar(1 / mode.background);
  const rgba = [];
  const hp = haze.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const y = hp.getY(i) / 900;
    const t = Math.min(1, Math.max(0, (0.14 - y) / 0.16));
    rgba.push(hazeColour.r, hazeColour.g, hazeColour.b, t * t * (3 - 2 * t));
  }
  haze.setAttribute('color', new THREE.Float32BufferAttribute(rgba, 4));
  const groundMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.BackSide, depthWrite: false });
  const ground = new THREE.Mesh(haze, groundMaterial);
  ground.renderOrder = 1;
  scene.add(ground);
  const cube = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType });
  const camera = new THREE.CubeCamera(0.1, 3000, cube);
  camera.update(renderer, scene);
  sky.geometry.dispose();
  sky.material.dispose();
  ground.geometry.dispose();
  groundMaterial.dispose();

  const dome = new THREE.Scene();
  const sphere = new THREE.SphereGeometry(100, 48, 24);
  const colours = [];
  const zenith = new THREE.Color(mode.dome.zenith);
  const horizon = new THREE.Color(mode.dome.horizon);
  const below = new THREE.Color(mode.dome.ground);
  const c = new THREE.Color();
  const p = sphere.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 100;
    if (y >= 0) c.copy(horizon).lerp(zenith, Math.pow(y, 0.55));
    else c.copy(horizon).lerp(below, Math.min(1, -y * 6));
    colours.push(c.r, c.g, c.b);
  }
  sphere.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  const domeMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
  dome.add(new THREE.Mesh(sphere, domeMaterial));
  const env = pmrem.fromScene(dome, 0.02);
  sphere.dispose();
  domeMaterial.dispose();
  return {
    background: cube.texture,
    environment: env.texture,
    dispose() {
      cube.dispose();
      env.dispose();
    }
  };
}

/**
 * PMREM of a soft light box for interiors: brightest around the horizon (like daylight from windows
 * on every side), dimmer towards the ceiling and dimmest below, with four window-like panels for
 * reflections. It looks the same from every compass direction, so walls facing north, south, east
 * or west get the same fill and a shade reads the same on each of them; the window lights and
 * lamps add the direction.
 * @param {THREE.PMREMGenerator} pmrem
 * @param {{ floor: number, wall: number, ceiling: number, panel: number }} box radiance of each band
 * @param {string} tint colour of the light
 * @returns {THREE.WebGLRenderTarget}
 */
function buildRoom(pmrem, box, tint) {
  const scene = new THREE.Scene();
  const colour = new THREE.Color(tint);
  const sphere = new THREE.SphereGeometry(10, 64, 32);
  const p = sphere.attributes.position;
  const rgb = [];
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 10;
    const level = y < 0
      ? THREE.MathUtils.lerp(box.wall, box.floor, THREE.MathUtils.smoothstep(-y, 0.02, 0.35))
      : THREE.MathUtils.lerp(box.wall, box.ceiling, THREE.MathUtils.smoothstep(y, 0.15, 0.6));
    c.copy(colour).multiplyScalar(level);
    rgb.push(c.r, c.g, c.b);
  }
  sphere.setAttribute('color', new THREE.Float32BufferAttribute(rgb, 3));
  const shell = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
  scene.add(new THREE.Mesh(sphere, shell));
  const panel = new THREE.PlaneGeometry(5, 2.6);
  const glow = new THREE.MeshBasicMaterial({ color: colour.clone().multiplyScalar(box.panel), side: THREE.DoubleSide });
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    const m = new THREE.Mesh(panel, glow);
    m.position.set(Math.sin(a) * 9.4, 1.2, Math.cos(a) * 9.4);
    m.lookAt(0, 1.2, 0);
    scene.add(m);
  }
  const target = pmrem.fromScene(scene, 0.035);
  sphere.dispose();
  panel.dispose();
  shell.dispose();
  glow.dispose();
  return target;
}

/**
 * @typedef {object} WindowLight
 * @property {string} room room id the window lights
 * @property {THREE.Vector3} position centre of the window on its inside face
 * @property {THREE.Vector3} normal unit vector into the room
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {object} RoomLamp
 * @property {string} room room id
 * @property {THREE.Vector3} position lamp position
 * @property {number} area room floor area (m²), used to scale the lamp
 */

/**
 * Creates the lighting rig and adds it to the scene.
 * @param {THREE.Scene} scene
 * @param {THREE.WebGLRenderer} renderer
 * @param {'high'|'medium'|'low'} [quality='high']
 * @returns {{
 *   sun: THREE.DirectionalLight,
 *   setMode: (mode: 'day'|'warm'|'cool') => void,
 *   getMode: () => 'day'|'warm'|'cool',
 *   sunAzimuth: () => number,
 *   setContext: (context: 'interior'|'exterior', bounds: THREE.Box3, outdoor?: boolean) => void,
 *   setWindows: (windows: WindowLight[]) => void,
 *   setLamps: (lamps: RoomLamp[]) => void,
 *   setActiveRoom: (roomId: string|null) => void,
 *   setQuality: (tier: 'high'|'medium'|'low') => void,
 *   dispose: () => void
 * }}
 */
export function createLighting(scene, renderer, quality = 'high') {
  RectAreaLightUniformsLib.init();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skies = {};
  const rooms = {};
  let tier = quality;
  let mode = 'day';
  let context = 'exterior';
  let outdoorView = true;
  let windows = [];
  let lamps = [];
  let activeRoom = null;

  const sun = new THREE.DirectionalLight('#ffffff', 1);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = SHADOW_RADIUS;
  scene.add(sun);
  scene.add(sun.target);

  const windowPool = [];
  for (let i = 0; i < QUALITY.high.windowLights; i++) {
    const light = new THREE.RectAreaLight('#ffffff', 0, 1, 1);
    light.visible = i < QUALITY[tier].windowLights;
    scene.add(light);
    windowPool.push(light);
  }

  const lampPool = [];
  for (let i = 0; i < QUALITY.high.roomLights; i++) {
    const light = new THREE.PointLight('#ffffff', 0, 0, 2);
    light.visible = i < QUALITY[tier].roomLights;
    scene.add(light);
    lampPool.push(light);
  }

  const bounce = new THREE.HemisphereLight('#ffffff', '#ffffff', 0);
  scene.add(bounce);

  scene.fog = new THREE.Fog('#c9d6e2', 1500, 3000);

  /** Lazily builds the sky and room environments for a mode. */
  function envFor(name) {
    if (!skies[name]) skies[name] = buildSky(renderer, pmrem, LIGHT_MODES[name]);
    if (!rooms[name]) rooms[name] = buildRoom(pmrem, LIGHT_MODES[name].room || ROOM_BOX, LIGHT_MODES[name].interiorTint);
    return { sky: skies[name], room: rooms[name] };
  }

  /**
   * Points the window lights at the active room's largest windows. When a room is mostly glass,
   * the lights share a glazing budget so the room is not flooded.
   */
  function assignWindows() {
    const settings = LIGHT_MODES[mode];
    const limit = QUALITY[tier].windowLights;
    const list = context === 'interior'
      ? windows.filter((w) => w.room === activeRoom).sort((a, b) => b.width * b.height - a.width * a.height).slice(0, limit)
      : [];
    const glazing = list.reduce((sum, w) => sum + w.width * w.height, 0);
    const lamp = lamps.find((l) => l.room === activeRoom);
    const floor = lamp ? lamp.area : glazing / GLAZING_SHARE;
    const share = glazing > 0 ? Math.min(1, (GLAZING_SHARE * floor) / glazing) : 1;
    windowPool.forEach((light, i) => {
      const w = list[i];
      if (!w) {
        light.intensity = 0;
        return;
      }
      light.width = w.width;
      light.height = w.height;
      light.position.copy(w.position).addScaledVector(w.normal, 0.02);
      light.lookAt(light.position.clone().add(w.normal));
      light.color.set(settings.window.color);
      light.intensity = settings.window.intensity * share;
    });
  }

  /**
   * Share (0..1) of a room's ceiling light that is on in daylight: full in rooms without windows
   * (inner offices, glass meeting rooms), none in well-glazed rooms.
   * @param {RoomLamp} lamp
   * @returns {number}
   */
  function dayFill(lamp) {
    const glazing = windows.filter((w) => w.room === lamp.room).reduce((sum, w) => sum + w.width * w.height, 0);
    return 1 - Math.min(1, glazing / (DAYLIT_SHARE * Math.max(1, lamp.area)));
  }

  /**
   * Places the lamp pool: in a room view, the active room's lamp and its nearest neighbours (seen
   * through doorways, at 60 %); in the orbit views, the largest rooms. In daylight only rooms
   * short of window light have their lights on.
   */
  function assignLamps() {
    const settings = LIGHT_MODES[mode];
    const limit = QUALITY[tier].roomLights;
    const active = context === 'interior' && activeRoom ? lamps.find((l) => l.room === activeRoom) : null;
    const chosen = active
      ? [...lamps].sort((a, b) => a.position.distanceToSquared(active.position) - b.position.distanceToSquared(active.position)).slice(0, limit)
      : [...lamps].sort((a, b) => b.area - a.area).slice(0, limit);
    lampPool.forEach((light, i) => {
      const lamp = chosen[i];
      if (!lamp) {
        light.intensity = 0;
        return;
      }
      light.position.copy(lamp.position);
      const scale = Math.min(2.2, Math.max(0.7, lamp.area / 16));
      const near = !active || lamp === active ? 1 : 0.6;
      if (settings.dayFill) {
        light.color.set(settings.dayFill.color);
        light.intensity = settings.dayFill.intensity * scale * near * dayFill(lamp);
      } else {
        light.color.set(settings.lamp.color);
        light.intensity = settings.lamp.intensity * scale * near;
      }
    });
  }

  /** Applies environment, sun and exposure for the current mode and context. */
  function apply() {
    const settings = LIGHT_MODES[mode];
    const env = envFor(mode);
    scene.background = env.sky.background;
    scene.backgroundIntensity = settings.background;
    scene.environment = context === 'interior' ? env.room.texture : env.sky.environment;
    scene.environmentIntensity = context === 'interior' ? settings.interiorEnv : settings.exteriorEnv;
    renderer.toneMappingExposure = settings.exposure;
    sun.color.set(settings.sun.color);
    sun.intensity = settings.sun.intensity;
    sun.castShadow = QUALITY[tier].shadows;
    scene.fog.color.set(settings.fog);
    scene.fog.near = outdoorView ? FOG_NEAR : 1500;
    scene.fog.far = outdoorView ? FOG_FAR : 3000;
    bounce.color.set(settings.interiorTint).multiplyScalar(settings.bounceSky ?? BOUNCE_SKY);
    bounce.groundColor.set(settings.interiorTint);
    bounce.intensity = context === 'interior' ? settings.bounce : 0;
    getMaterial('led').emissiveIntensity = settings.led;
    assignWindows();
    assignLamps();
  }

  /** Aims the sun and fits its shadow camera around `bounds`. */
  function fitSun(bounds) {
    const settings = LIGHT_MODES[mode];
    const centre = bounds.getCenter(new THREE.Vector3());
    const radius = Math.max(4, bounds.getSize(new THREE.Vector3()).length() / 2);
    const dir = sunDirection(settings.sun.azimuth, Math.max(settings.sun.elevation, 20));
    sun.position.copy(centre).addScaledVector(dir, radius * 3);
    sun.target.position.copy(centre);
    const cam = sun.shadow.camera;
    cam.left = -radius;
    cam.right = radius;
    cam.top = radius;
    cam.bottom = -radius;
    cam.near = 0.5;
    cam.far = radius * 6;
    cam.updateProjectionMatrix();
    const size = QUALITY[tier].shadowMap || 1024;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
    }
    sun.shadow.needsUpdate = true;
  }

  let lastBounds = new THREE.Box3(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 6, 10));
  fitSun(lastBounds);
  apply();

  return {
    sun,
    setMode(next) {
      if (!LIGHT_MODES[next]) return;
      mode = next;
      apply();
      fitSun(lastBounds);
    },
    getMode: () => mode,
    /** @returns {number} daylight sun azimuth in compass degrees */
    sunAzimuth: () => LIGHT_MODES.day.sun.azimuth,
    setContext(next, bounds, outdoor = next !== 'interior') {
      context = next === 'interior' ? 'interior' : 'exterior';
      outdoorView = outdoor;
      if (bounds) lastBounds = bounds.clone();
      fitSun(lastBounds);
      apply();
    },
    setWindows(list) {
      windows = list || [];
      assignWindows();
      assignLamps();
    },
    setLamps(list) {
      lamps = list || [];
      assignLamps();
      assignWindows();
    },
    setActiveRoom(roomId) {
      activeRoom = roomId;
      assignWindows();
      assignLamps();
    },
    setQuality(next) {
      if (!QUALITY[next]) return;
      tier = next;
      windowPool.forEach((light, i) => {
        light.visible = i < QUALITY[tier].windowLights;
      });
      lampPool.forEach((light, i) => {
        light.visible = i < QUALITY[tier].roomLights;
      });
      fitSun(lastBounds);
      apply();
    },
    dispose() {
      Object.values(skies).forEach((s) => s.dispose());
      Object.values(rooms).forEach((r) => r.dispose());
      pmrem.dispose();
      lampPool.forEach((light) => light.dispose());
      windowPool.forEach((light) => light.dispose());
      sun.dispose();
    }
  };
}
