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
import { cell, inB, CX, CZ } from "../core/map.js";
import { tween, easeOutQuart, easeInOutQuad } from "./anim.js";

const CINE_FOV = 66;       // the orbit camera sits at 30; widening is what sells the rush over a zoom
const LOOK_LIFT = 0.42;    // look target sits mid-torso above the ground midpoint
const BASE_DIST = 1.3;     // camera distance for two adjacent units, close enough that the wide fov stretches depth
const DIST_PER_TILE = 0.5; // extra distance per tile of separation, so range-2 shots still fit
const ELEVATION = 0.12;    // rise per unit of distance, about 7 degrees: a unit's eyes sit near 0.7, the camera lands just under
const FLY_IN_MS = 300;
const FLY_OUT_MS = 520;
const OVER_START = 0.5;    // fraction of the fly-in at which the overshoot hump begins; it peaks 75% in and settles by the end
const OVER_PUSH = 0.1;     // fraction of the framing distance the camera carries past the frame at the hump's peak
const OVER_FOV = 4;        // degrees of extra fov at that peak
const RUSH_PEAK = 4;       // initial slope of easeOutQuart: the fly's top speed in fly-lengths per fly-duration
const FRAME_SPREAD = 0.9;  // half-width of the cut-in frame per unit of depth, tan(CINE_FOV / 2) times a 1.4 aspect
const UNIT_RADIUS = 0.3;   // how far past the frame edge a bystander still shows a shoulder
const BACK_WEIGHT = 0.3;   // a bystander behind the fighters counts this much of one in front, fading out over a second framing distance
const TRACK_WEIGHT = 0.4;  // how far the look target leans toward a tracked projectile
const TRACK_LAG_MS = 90;   // smoothing time constant for that lean, so a spawn or despawn never pops
const KEY_INTENSITY = 1.1; // peak of the cut-in key light, reached at mix = 1; higher clips the helms white
const KEY_COLOR = 0xfff1d6;
const KEY_TWIST = 0.3;     // body yaw at the moment of contact in the melee beats, see attacks.js
const KEY_TILT = 0.36;     // lifts the aim so the light sits above the horizon, not raking up from below
const GROUND_CLEAR = 0.32; // how far above solid ground the cut-in lens has to stay
const GROUND_STEPS = 5;    // ground samples between the lens and the look target
const TERRAIN_WEIGHT = 2.5; // cost per world unit the ground would force the lens to climb; a tile-step is about one bystander

/* the top of the solid ground at a world position, for keeping the lens out
   of it. Tile tops rather than walkable heights: a bridge's deck is what a
   lens can hit, not the riverbed beneath it, so whichever is higher wins.
   Off the board reads as plain, which is only ever asked about a lens a
   fraction of a tile past the edge. */
function groundAt(wx, wz) {
  const tx = Math.round(wx + CX), ty = Math.round(wz + CZ);
  if (!inB(tx, ty)) return 0;
  const t = cell(tx, ty);
  return t.walk !== undefined && t.walk > t.h ? t.walk : t.h;
}

/* the tallest ground between a lens position and what it is looking at. One
   sample under the lens is not enough on its own: the lens can sit over
   clear plain with a ridge a third of a tile in front of it, which is the
   shape of the old clip. */
function highestGround(from, to) {
  let hi = groundAt(from.x, from.z);
  for (let i = 1; i <= GROUND_STEPS; i++) {
    const k = i / (GROUND_STEPS + 1);
    hi = Math.max(hi, groundAt(from.x + (to.x - from.x) * k, from.z + (to.z - from.z) * k));
  }
  return hi;
}

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
  let over = 0;              // overshoot hump, 0 to 1 and back, during the fly-in only
  let rush = 0;              // camera transit speed, 0 at rest, 1 at a fly-in's top speed
  let frameDist = 0;         // camera distance of the current framing, set by framePair
  let flyLen = 0;            // straight-line length of the current fly-in, set by flyIn
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
  const flyDir = new THREE.Vector3();   // unit vector along the fly-in, orbit pose to cinematic pose
  const prevPos = new THREE.Vector3();  // camera position last frame, before shake, for the rush measure
  const candPos = new THREE.Vector3();  // a candidate camera position while choosing a side
  const viewDir = new THREE.Vector3();  // candidate view direction, camera to look target
  const rel = new THREE.Vector3();      // a bystander's offset from the candidate camera

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
    frameDist = dist;
    cine.target.copy(mid);
    cine.target.y += LOOK_LIFT;

    /* with the camera this low and this close, a bystander on the near
       side of the pair is not a shoulder in the corner, it is a wall
       across a third of the frame, and rising ground is the same problem
       without a face on it. So both sides of the axis are scored and the
       orbit side only keeps its claim when the far side is no clearer.
       The far side means a longer fly, which the rush blur covers, and it
       can swap which fighter stands left; the HUD keeps the player's unit
       on the left regardless. Scored unconditionally now: the old guard
       skipped it whenever nobody else was on the board, which is exactly
       when the terrain term matters most. */
    const near = clutter(perp, dist, opts.others);
    perp.negate();
    const far = clutter(perp, dist, opts.others);
    if (far >= near) perp.negate();

    cine.pos.copy(cine.target).addScaledVector(perp, dist);
    cine.pos.y += dist * ELEVATION;
    /* and never inside the hill. The framing puts the lens a bit over half
       a unit above the midpoint of the pair, which was under the top of a
       ridge whenever a fight straddled a step: the lens ended up in solid
       ground, showing its inside faces through the near plane. Lifting is
       the right correction rather than pulling back, since backing off
       loses the tight framing the whole cut-in is for. On level ground the
       framing already clears this and the clamp does nothing. */
    cine.pos.y = Math.max(cine.pos.y, highestGround(cine.pos, cine.target) + GROUND_CLEAR);
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

  /* how much of the frame bystanders would fill from the camera on `side`.
     Each unit between the camera and the look target adds its overlap
     with the view cone, weighted toward the camera end where a unit
     looms largest. A unit behind the look target counts less, the
     fighters cover most of it, and less again the further back it
     stands, so a clean backdrop still wins a tie. */
  function clutter(side, dist, others) {
    candPos.copy(cine.target).addScaledVector(side, dist);
    candPos.y += dist * ELEVATION;
    viewDir.subVectors(cine.target, candPos);
    const len = viewDir.length();
    viewDir.divideScalar(len);
    /* ground is charged for exactly what it costs: how far the clamp in
       framePair would have to lift the lens to clear it. A side with
       nothing in the way charges zero, so the downhill side of a step
       wins by default, and the lift it saves is framing it keeps. */
    const climb = highestGround(candPos, cine.target) + GROUND_CLEAR - candPos.y;
    let score = Math.max(0, climb) * TERRAIN_WEIGHT;
    for (const p of others || []) {
      rel.subVectors(p, candPos);
      const depth = rel.dot(viewDir);
      if (depth <= 0.05 || depth >= 2 * len) continue;
      const lateral = rel.addScaledVector(viewDir, -depth).length();
      const reach = depth * FRAME_SPREAD + UNIT_RADIUS;
      if (lateral >= reach) continue;
      const overlap = 1 - lateral / reach;
      score += depth < len ? overlap * (1 - depth / len) : overlap * BACK_WEIGHT * (2 - depth / len);
    }
    return score;
  }

  /* ease-out quart on the way in: the camera starts at top speed and
     bleeds it off, which is what reads as thrown rather than driven.
     The travel is a straight lerp of the two poses, so the tail of the
     quart over a long fly still covers real ground; the overshoot is
     a separate hump on top of it in world units, along the fly line,
     scaled to the framing distance rather than the fly length. A few
     percent of a twenty-unit fly would put the lens inside a helm. It
     starts once the travel is nine tenths done, peaks three quarters
     of the way through the fly, and settles over the last quarter,
     around 75ms, as the fov eases back at the same time. */
  async function flyIn(attacker, defender, opts = {}) {
    if (!active) save();
    active = true;
    leaving = false;
    framePair(attacker.view.root.position, defender.view.root.position, opts);
    flyDir.subVectors(cine.pos, saved.pos);
    flyLen = flyDir.length();
    if (flyLen > 1e-3) flyDir.divideScalar(flyLen); else flyDir.set(0, 0, 0);
    await tween(opts.ms ?? FLY_IN_MS, (k) => {
      mix = easeOutQuart(k);
      over = k > OVER_START ? Math.sin(Math.PI * (k - OVER_START) / (1 - OVER_START)) : 0;
    });
    over = 0;
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
    rush = 0;
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
      if (over > 0) {
        /* both points move together, so the overshoot slides the frame
           rather than swinging the view */
        pos.addScaledVector(flyDir, over * OVER_PUSH * frameDist);
        target.addScaledVector(flyDir, over * OVER_PUSH * frameDist);
        camera.fov += over * OVER_FOV;
      }
      /* transit speed, measured off the actual path rather than read from
         the easing, so the settle and the fly-out blur by exactly as much
         as they move. Normalised so a fly-in's first frame reads 1 for
         any orbit zoom: speed in fly-lengths per fly-duration over the
         quart's initial slope. Taken before the shake is added, a hit
         should not smear the frame. */
      const dist = pos.distanceTo(prevPos);
      rush = flyLen > 1e-3 ? Math.min(1, (dist / Math.max(dtMs, 1)) * (FLY_IN_MS / flyLen) / RUSH_PEAK) : 0;
    } else {
      pos.copy(base.pos);
      target.copy(base.target);
      camera.fov = base.fov;
      rush = 0;
    }
    prevPos.copy(pos);
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
    /* transit speed for the post pass radial blur, 0 at rest, 1 at the
       peak of a fly-in. scene.js copies it into POST_FRAG's uRush. */
    get rush() { return rush; },
  };
}
