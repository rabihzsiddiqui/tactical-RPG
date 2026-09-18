/* camera director for the attack cut-in.

   scene.js computes the orbit camera the player controls (pitch, yaw, zoom
   from the cam state) every frame and hands it to apply(). When no cut-in
   is running, apply() just places the camera there. During one, it blends
   between that orbit pose and a cinematic pose framing the two fighters,
   by a 0..1 mix that flyIn and flyOut tween. Shake is a separate additive
   offset with its own tween, so it composes with a fly instead of fighting
   it for the position.

   Poses are { pos, target, fov }. lookAt(target) each frame rather than
   storing a quaternion keeps the blend readable: a straight lerp of two
   points plus a lerp of fov. */

import * as THREE from "three";
import { tween, easeOutCubic, easeInOutQuad } from "./anim.js";

const CINE_FOV = 50;       // the orbit camera sits at 30; widening is what sells the rush over a zoom
const LOOK_LIFT = 0.42;    // look target sits mid-torso above the ground midpoint
const BASE_DIST = 2.0;     // camera distance for two adjacent units
const DIST_PER_TILE = 0.6; // extra distance per tile of separation, so range-2 shots still fit
const ELEVATION = 0.28;    // rise per unit of distance, roughly 16 degrees, versus the orbit's 48
const FLY_IN_MS = 340;
const FLY_OUT_MS = 520;
const TRACK_WEIGHT = 0.4;  // how far the look target leans toward a tracked projectile
const TRACK_LAG_MS = 90;   // smoothing time constant for that lean, so a spawn or despawn never pops
const KEY_INTENSITY = 1.1; // peak of the cut-in key light, reached at mix = 1; higher clips the helms white
const KEY_COLOR = 0xfff1d6;
const KEY_TWIST = 0.3;     // body yaw at the moment of contact in the melee beats, see attacks.js
const KEY_TILT = 0.36;     // lifts the aim so the light sits above the horizon, not raking up from below

const makePose = () => ({ pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: CINE_FOV });
const copyPose = (dst, src) => { dst.pos.copy(src.pos); dst.target.copy(src.target); dst.fov = src.fov; };

/* `isEnabled` is read on every flyIn rather than captured once, so the pause
   menu toggle takes effect on the very next attack.

   The director also owns the cut-in key light: a directional light that
   fades up with the fly and back down with the release, so the metal
   parts (see MeshStandardMaterial in meshes.js) have something to catch
   through a swing. It is added to `scene` once at intensity 0 rather than
   on fly-in, for the same reason as the flare in effects.js: adding a
   light recompiles every lit material, a hitch worth paying at mount and
   never mid-exchange. No shadow, that would be a second shadow pass. */
export function createDirector({ isEnabled, scene }) {
  const key = new THREE.DirectionalLight(KEY_COLOR, 0);
  scene.add(key, key.target);
  const base = makePose();   // the orbit pose from the most recent apply()
  const saved = makePose();  // the orbit pose at the moment the cut-in began
  const cine = makePose();   // where flyIn wants the camera
  let mix = 0;               // 0 = fully orbit, 1 = fully cinematic
  let active = false;
  let leaving = false;
  let shakeAmp = 0;
  let tracked = null;        // a live Vector3 the look target leans toward, or null

  const axis = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const perp = new THREE.Vector3();
  const toCam = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const target = new THREE.Vector3();
  const jitter = new THREE.Vector3();
  const lean = new THREE.Vector3();     // current smoothed lean of the look target
  const keyN = new THREE.Vector3();     // surface normal the key light is aimed to glint off
  const keyV = new THREE.Vector3();     // unit vector from the framed pair to the camera
  const wantLean = new THREE.Vector3(); // where the lean is heading this frame

  function save() {
    copyPose(saved, base);
  }

  /* framing: midpoint of the pair, camera pushed out perpendicular to the
     attack axis so neither unit hides the other, on whichever side the
     orbit camera already favours so the rush never swings the long way
     round. Distance grows with separation so a bow shot at range 2 fits
     the same frame as a sword at range 1. */
  function framePair(aPos, dPos, opts) {
    axis.subVectors(dPos, aPos);
    axis.y = 0;
    const sep = axis.length();
    if (sep < 1e-3) axis.set(0, 0, 1); else axis.normalize();
    mid.addVectors(aPos, dPos).multiplyScalar(0.5);

    perp.set(-axis.z, 0, axis.x);
    toCam.subVectors(base.pos, mid);
    if (perp.dot(toCam) < 0) perp.negate();

    const dist = (opts.dist ?? BASE_DIST) + sep * DIST_PER_TILE;
    cine.target.copy(mid);
    cine.target.y += LOOK_LIFT;
    cine.pos.copy(cine.target).addScaledVector(perp, dist);
    cine.pos.y += dist * ELEVATION;
    cine.fov = opts.fov ?? CINE_FOV;

    /* key light aim. From this camera a blade is seen edge-on: its wide
       faces sweep the vertical plane of the swing, and the face turned to
       the lens is the narrow side, whose normal is `perp` turned by the
       body's yaw. The melee beats end their strike with the torso twisted
       about KEY_TWIST toward the swing, so the light goes where a mirror
       on that face would show the camera at the moment of contact: the
       blade brightens as it arrives and dims as it leaves. Standard
       mirror formula, L = 2(N.V)N - V. The normal is tilted up a little
       so the light lands above the horizon rather than lighting the
       undersides of everything. A directional light only reads the
       vector from position to target, so the 3 is arbitrary. */
    keyN.set(perp.z, 0, -perp.x).multiplyScalar(Math.sin(KEY_TWIST)).addScaledVector(perp, Math.cos(KEY_TWIST));
    keyN.y += KEY_TILT;
    keyN.normalize();
    keyV.subVectors(cine.pos, cine.target).normalize();
    key.position.copy(keyN).multiplyScalar(2 * keyN.dot(keyV)).sub(keyV).multiplyScalar(3).add(cine.target);
    key.target.position.copy(cine.target);
  }

  /* ease-out on the way in: most of the travel happens in the first third,
     which is what reads as a rush rather than a drift */
  async function flyIn(attacker, defender, opts = {}) {
    if (!active) save();
    active = true;
    leaving = false;
    framePair(attacker.view.root.position, defender.view.root.position, opts);
    await tween(opts.ms ?? FLY_IN_MS, (k) => { mix = easeOutCubic(k); });
  }

  /* the return blends toward the live orbit pose, not the saved one, so a
     Rotate 90 pressed mid-exchange lands without a pop at the end */
  async function flyOut(opts = {}) {
    if (!active) return;
    leaving = true;
    await tween(opts.ms ?? FLY_OUT_MS, (k) => { mix = 1 - easeInOutQuad(k); });
    active = false;
    leaving = false;
    mix = 0;
  }

  /* random per-frame offset that decays linearly over ms. Translates the
     camera and its target together, so it reads as the screen jolting
     rather than the view swinging. */
  function shake(intensity, ms) {
    return tween(ms, (k) => { shakeAmp = intensity * (1 - k); });
  }

  /* leans the look target toward a moving point, a projectile in flight,
     for as long as `point` is set. Pass the object's own position vector
     rather than a copy: it is read live every frame. null releases it and
     the lean eases back out. Only has an effect during a cut-in. */
  function track(point) {
    tracked = point;
  }

  function apply(camera, orbit, dtMs = 16) {
    copyPose(base, orbit);
    if (active) {
      const from = leaving ? base : saved;
      pos.lerpVectors(from.pos, cine.pos, mix);
      target.lerpVectors(from.target, cine.target, mix);
      camera.fov = from.fov + (cine.fov - from.fov) * mix;
    } else {
      pos.copy(base.pos);
      target.copy(base.target);
      camera.fov = base.fov;
    }
    /* exponential smoothing toward the tracked point, framerate independent:
       the lean covers 1 - e^-1 of the remaining gap every TRACK_LAG_MS */
    if (tracked && active) wantLean.subVectors(tracked, cine.target).multiplyScalar(TRACK_WEIGHT * mix);
    else wantLean.set(0, 0, 0);
    lean.lerp(wantLean, 1 - Math.exp(-dtMs / TRACK_LAG_MS));
    target.add(lean);
    if (shakeAmp > 0) {
      jitter.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(shakeAmp * 2);
      pos.add(jitter);
      target.add(jitter);
    }
    camera.position.copy(pos);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    key.intensity = KEY_INTENSITY * mix;
  }

  return {
    save, flyIn, flyOut, shake, track, apply,
    get enabled() { return isEnabled(); },
    get active() { return active; },
    /* 0 on the grid, 1 fully in the cut-in, eased in between. scene.js
       reads it to relax the posteriser while the camera is close. */
    get mix() { return mix; },
  };
}
