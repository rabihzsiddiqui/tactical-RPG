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

const makePose = () => ({ pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: CINE_FOV });
const copyPose = (dst, src) => { dst.pos.copy(src.pos); dst.target.copy(src.target); dst.fov = src.fov; };

/* `isEnabled` is read on every flyIn rather than captured once, so the pause
   menu toggle takes effect on the very next attack. */
export function createDirector({ isEnabled }) {
  const base = makePose();   // the orbit pose from the most recent apply()
  const saved = makePose();  // the orbit pose at the moment the cut-in began
  const cine = makePose();   // where flyIn wants the camera
  let mix = 0;               // 0 = fully orbit, 1 = fully cinematic
  let active = false;
  let leaving = false;
  let shakeAmp = 0;

  const axis = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const perp = new THREE.Vector3();
  const toCam = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const target = new THREE.Vector3();
  const jitter = new THREE.Vector3();

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

  function apply(camera, orbit) {
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
    if (shakeAmp > 0) {
      jitter.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(shakeAmp * 2);
      pos.add(jitter);
      target.add(jitter);
    }
    camera.position.copy(pos);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }

  return {
    save, flyIn, flyOut, shake, apply,
    get enabled() { return isEnabled(); },
    get active() { return active; },
  };
}
