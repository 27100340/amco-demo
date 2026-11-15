/**
 * Camera rig: orbit for the exterior and dollhouse views, first-person for rooms (eye height
 * 1.55 m, drag to look, WASD / arrow keys to walk with collisions, click the floor to glide), and
 * eased 600 ms flights between views.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** Eye height above the floor in room view (m). */
export const EYE_HEIGHT = 1.55;
/** Length of an eased camera flight (ms). */
export const FLIGHT_MS = 600;

const WALK_SPEED = 1.6;
const TURN_SPEED = 1.6;
const LOOK_SPEED = 0.0042;
const PITCH_LIMIT = 1.25;
const GLIDE_SPEED = 2.2;

/** Cubic ease in-out. */
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Yaw and pitch that look from `from` towards `to` (camera rotation order YXZ).
 * @param {THREE.Vector3} from
 * @param {THREE.Vector3} to
 * @returns {{ yaw: number, pitch: number }}
 */
export function lookAngles(from, to) {
  const d = new THREE.Vector3().subVectors(to, from);
  return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) };
}

/**
 * Creates the rig.
 * @param {THREE.PerspectiveCamera} camera
 * @param {HTMLElement} dom element receiving pointer and key events (focusable)
 * @param {{ collide: (from: THREE.Vector3, to: THREE.Vector3) => THREE.Vector3, onChange?: () => void, reducedMotion?: boolean }} hooks
 * @returns {object} rig API (see return statement)
 */
export function createCameraRig(camera, dom, hooks) {
  camera.rotation.order = 'YXZ';
  const orbit = new OrbitControls(camera, dom);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.08;
  orbit.rotateSpeed = 0.7;
  orbit.zoomSpeed = 0.8;
  orbit.screenSpacePanning = false;
  orbit.keys = {};

  let mode = 'exterior';
  let yaw = 0;
  let pitch = 0;
  let flight = null;
  let glide = null;
  let panBounds = null;
  const keys = new Set();
  let drag = null;
  const changed = () => hooks.onChange && hooks.onChange();
  orbit.addEventListener('change', changed);

  function applyLook() {
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }

  function onPointerDown(event) {
    if (mode !== 'room' || flight) return;
    if (event.button !== undefined && event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    dom.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    yaw += dx * LOOK_SPEED;
    pitch = THREE.MathUtils.clamp(pitch + dy * LOOK_SPEED, -PITCH_LIMIT, PITCH_LIMIT);
    glide = null;
    applyLook();
    changed();
  }
  function onPointerUp(event) {
    if (drag && event.pointerId === drag.id) {
      if (dom.hasPointerCapture(event.pointerId)) dom.releasePointerCapture(event.pointerId);
      drag = null;
    }
  }
  const WALK_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  function onKeyDown(event) {
    if (mode !== 'room' || !WALK_KEYS.has(event.code)) return;
    event.preventDefault();
    keys.add(event.code);
    glide = null;
  }
  function onKeyUp(event) {
    keys.delete(event.code);
  }
  function onBlur() {
    keys.clear();
  }
  dom.addEventListener('pointerdown', onPointerDown);
  dom.addEventListener('pointermove', onPointerMove);
  dom.addEventListener('pointerup', onPointerUp);
  dom.addEventListener('pointercancel', onPointerUp);
  dom.addEventListener('keydown', onKeyDown);
  dom.addEventListener('keyup', onKeyUp);
  dom.addEventListener('blur', onBlur);

  /** Moves the eye by a horizontal step, sliding along obstacles. */
  function step(dx, dz) {
    const from = camera.position.clone();
    const to = from.clone().add(new THREE.Vector3(dx, 0, dz));
    const result = hooks.collide(from, to);
    camera.position.copy(result);
    return result.distanceToSquared(from) > 1e-8;
  }

  /**
   * Starts an eased flight of position and look target.
   * @param {THREE.Vector3} toPos
   * @param {THREE.Vector3} toTarget
   * @param {() => void} [done]
   */
  function fly(toPos, toTarget, done) {
    const fromPos = camera.position.clone();
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const fromTarget = mode === 'room' ? camera.position.clone().add(dir.multiplyScalar(3)) : orbit.target.clone();
    if (hooks.reducedMotion) {
      camera.position.copy(toPos);
      camera.lookAt(toTarget);
      if (done) done();
      changed();
      return;
    }
    flight = { fromPos, fromTarget, toPos: toPos.clone(), toTarget: toTarget.clone(), start: performance.now(), done };
  }

  return {
    orbit,
    /** @returns {'exterior'|'dollhouse'|'room'} */
    getMode: () => mode,
    /**
     * Switches to an orbit view.
     * @param {'exterior'|'dollhouse'} next
     * @param {{ position: THREE.Vector3, target: THREE.Vector3, minDistance: number, maxDistance: number, minPolar: number, maxPolar: number, bounds?: THREE.Box3, animate?: boolean }} view
     */
    setOrbit(next, view) {
      mode = next;
      glide = null;
      keys.clear();
      panBounds = view.bounds ? view.bounds.clone() : null;
      orbit.enabled = false;
      const finish = () => {
        orbit.target.copy(view.target);
        orbit.minDistance = view.minDistance;
        orbit.maxDistance = view.maxDistance;
        orbit.minPolarAngle = view.minPolar;
        orbit.maxPolarAngle = view.maxPolar;
        orbit.enabled = true;
        orbit.update();
        changed();
      };
      if (view.animate === false) {
        camera.position.copy(view.position);
        camera.lookAt(view.target);
        finish();
        return;
      }
      fly(view.position, view.target, finish);
    },
    /**
     * Switches to the first-person room view.
     * @param {{ position: THREE.Vector3, yaw: number, pitch: number, animate?: boolean }} view eye position
     */
    setRoom(view) {
      const wasRoom = mode === 'room';
      mode = 'room';
      orbit.enabled = false;
      glide = null;
      keys.clear();
      const finish = () => {
        yaw = view.yaw;
        pitch = view.pitch;
        camera.position.copy(view.position);
        applyLook();
        changed();
      };
      if (view.animate === false || !wasRoom) {
        flight = null;
        finish();
        return;
      }
      const target = view.position.clone().add(new THREE.Vector3(-Math.sin(view.yaw) * Math.cos(view.pitch), Math.sin(view.pitch), -Math.cos(view.yaw) * Math.cos(view.pitch)).multiplyScalar(3));
      fly(view.position, target, finish);
    },
    /**
     * Glides the eye to a floor point (room view).
     * @param {THREE.Vector3} point world point on the floor
     */
    glideTo(point) {
      if (mode !== 'room') return;
      glide = new THREE.Vector3(point.x, camera.position.y, point.z);
    },
    /** Current look angles in room view. */
    getLook: () => ({ yaw, pitch }),
    /**
     * Advances flights, damping, walking and gliding.
     * @param {number} dt seconds since the last frame
     * @returns {boolean} true while the camera is moving under its own power
     */
    update(dt) {
      let busy = false;
      if (flight) {
        const t = Math.min(1, (performance.now() - flight.start) / FLIGHT_MS);
        const k = ease(t);
        camera.position.lerpVectors(flight.fromPos, flight.toPos, k);
        const target = new THREE.Vector3().lerpVectors(flight.fromTarget, flight.toTarget, k);
        camera.lookAt(target);
        busy = true;
        if (t >= 1) {
          const done = flight.done;
          flight = null;
          if (done) done();
        }
        changed();
        return busy;
      }
      if (mode === 'room') {
        let forward = 0;
        let strafe = 0;
        let turn = 0;
        if (keys.has('KeyW') || keys.has('ArrowUp')) forward += 1;
        if (keys.has('KeyS') || keys.has('ArrowDown')) forward -= 1;
        if (keys.has('KeyA')) strafe -= 1;
        if (keys.has('KeyD')) strafe += 1;
        if (keys.has('ArrowLeft')) turn += 1;
        if (keys.has('ArrowRight')) turn -= 1;
        if (turn) {
          yaw += turn * TURN_SPEED * dt;
          applyLook();
          busy = true;
        }
        if (forward || strafe) {
          const fx = -Math.sin(yaw);
          const fz = -Math.cos(yaw);
          const dist = WALK_SPEED * dt;
          step((fx * forward + -fz * strafe) * dist, (fz * forward + fx * strafe) * dist);
          busy = true;
        }
        if (glide) {
          const delta = new THREE.Vector3().subVectors(glide, camera.position);
          delta.y = 0;
          const remaining = delta.length();
          if (remaining < 0.04) {
            glide = null;
          } else {
            const move = Math.min(remaining, Math.max(0.6, remaining * 3) * dt * GLIDE_SPEED * 0.5);
            delta.normalize().multiplyScalar(move);
            if (!step(delta.x, delta.z)) glide = null;
            busy = true;
          }
        }
        if (busy) changed();
        return busy;
      }
      if (orbit.enabled) {
        const moved = orbit.update(dt);
        if (panBounds) {
          const clamped = orbit.target.clone().clamp(panBounds.min, panBounds.max);
          if (!clamped.equals(orbit.target)) {
            const shift = clamped.sub(orbit.target);
            orbit.target.add(shift);
            camera.position.add(shift);
          }
        }
        return moved;
      }
      return false;
    },
    /** @returns {boolean} true during a flight */
    isFlying: () => Boolean(flight),
    dispose() {
      orbit.removeEventListener('change', changed);
      orbit.dispose();
      dom.removeEventListener('pointerdown', onPointerDown);
      dom.removeEventListener('pointermove', onPointerMove);
      dom.removeEventListener('pointerup', onPointerUp);
      dom.removeEventListener('pointercancel', onPointerUp);
      dom.removeEventListener('keydown', onKeyDown);
      dom.removeEventListener('keyup', onKeyUp);
      dom.removeEventListener('blur', onBlur);
    }
  };
}
