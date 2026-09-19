/* per-weapon attack beats, keyed by WEAPONS[k].type.

   scene.js used to play one lunge for every strike: step toward the
   target, step back. From the orbit camera that passed. From the cut-in
   camera a bow that lunges at range 2 is plainly wrong, so each weapon
   type now has its own beat, and the old lunge is the melee entry here
   rather than a second path.

   A beat is an async function that owns the attacker's limbs from start
   to finish. It calls ctx.onImpact() at the exact frame of contact so
   scene.js can do the hit feedback (flash, floater, sound, hp, hit-stop,
   shake) there, and the recovery plays after. ctx.hit and ctx.crit are
   known before the beat starts, so a beat can swing a brighter trail for
   a crit or send an arrow past the shoulder on a miss. While a beat runs
   the unit's anim state is "attack", which tells animUnit in scene.js to
   leave the parts alone and only keep position, offset and yaw up to
   date.

   The effects (trail, burst, flare, motes) live in effects.js. A beat
   only says when and where; the effects module owns the meshes.

   Poses are absolute part rotations, not deltas, because animUnit
   overwrites the same fields every frame in its other states. Lerping
   between whole poses also means a beat can never leave a limb somewhere
   odd: the last keyframe of every beat is NEUTRAL. */

import * as THREE from "three";
import { WEAPONS, PALS } from "../core/data.js";
import { tween, easeOutCubic, easeInOutQuad } from "./anim.js";
import { buildArrow, buildBolt } from "./meshes.js";

export const CARRY = 1.5; // weapon.rotation.x as built in meshes.js: held across the hand

/* arm/armL: rotation.x of each arm, negative swings forward and up.
   wep: weapon.rotation.x, CARRY is perpendicular to the forearm, PI is
   along it. twist: body yaw. lift: body rise. off: world-space slide
   toward the target in tiles. stance: legs scissor by this much. */
const NEUTRAL = { arm: 0, armL: 0, wep: CARRY, twist: 0, lift: 0, off: 0, stance: 0 };

/* the three melee beats are one routine with different numbers. windup
   and strike are full poses; the phase durations give each weapon its
   weight. Sword is quick both ways, lance is a straight thrust with the
   weapon rotated along the arm, axe is a long overhead windup and a
   slow recover. trail is the span of the weapon, in its own local y, that
   the ribbon follows through the strike: grip to tip, see meshes.js. */
const MELEE = {
  sword: {
    windupMs: 90, strikeMs: 110, recoverMs: 170, trail: { base: 0.05, tip: 0.47 },
    windup: { arm: -2.4, armL: 0.3, wep: CARRY, twist: -0.35, lift: 0.01, off: -0.05, stance: 0.15 },
    strike: { arm: -0.9, armL: -0.4, wep: 2.3, twist: 0.3, lift: -0.01, off: 0.34, stance: 0.35 },
  },
  lance: {
    windupMs: 120, strikeMs: 130, recoverMs: 200, trail: { base: 0.1, tip: 0.76 },
    windup: { arm: -1.2, armL: 0.2, wep: Math.PI, twist: -0.12, lift: 0, off: -0.08, stance: 0.1 },
    strike: { arm: -1.7, armL: -0.2, wep: Math.PI, twist: 0.08, lift: -0.02, off: 0.4, stance: 0.4 },
  },
  axe: {
    windupMs: 200, strikeMs: 120, recoverMs: 260, trail: { base: 0.05, tip: 0.47 },
    windup: { arm: -2.8, armL: 0.4, wep: CARRY, twist: -0.5, lift: 0.03, off: -0.06, stance: 0.1 },
    strike: { arm: -0.7, armL: -0.5, wep: 2.4, twist: 0.35, lift: -0.03, off: 0.3, stance: 0.35 },
  },
};

/* ranged poses. The weapon is always in the right hand, so for the bow
   the right arm holds and the left arm draws. */
const BOW_DRAW = { arm: -1.55, armL: -1.35, wep: CARRY, twist: -0.4, lift: 0, off: 0, stance: 0.2 };
const BOW_FULL = { arm: -1.55, armL: -1.0, wep: CARRY, twist: -0.45, lift: 0, off: -0.02, stance: 0.2 };
const BOW_LOOSE = { arm: -1.55, armL: -0.6, wep: CARRY, twist: -0.3, lift: 0, off: 0.02, stance: 0.2 };
const CAST_OPEN = { arm: -1.1, armL: -1.6, wep: CARRY, twist: 0.15, lift: 0.01, off: -0.03, stance: 0.1 };
const CAST_PUSH = { arm: -1.0, armL: -1.5, wep: CARRY, twist: 0.05, lift: 0, off: 0.06, stance: 0.15 };
const STAFF_RAISE = { arm: -2.4, armL: 0.15, wep: 2.2, twist: 0, lift: 0.02, off: 0, stance: 0 };

const GREEN = new THREE.Color(0x5fd07a);
const GOLD = new THREE.Color(0xffe08a);
const SPARK = 0xfff2dc;   // physical impact: white, warmed a touch so it sits in the palette
const EMBER = 0xff8a2a;   // anima impact and flare
const MISS_SIDESTEP = 0.3; // how far past the shoulder a missed shot passes, in tiles
const scratchCol = new THREE.Color();

export function createAttackPlayer({ scene, director, effects }) {
  const arrow = buildArrow();
  const bolt = buildBolt();
  scene.add(arrow, bolt);

  const dir = new THREE.Vector3();    // attacker to target, ground plane, unit length
  const perp = new THREE.Vector3();   // dir turned 90 degrees, for missed shots
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const contact = new THREE.Vector3();
  const cur = {};

  /* where a melee blow lands: the target's chest, pulled a little toward
     the attacker so the burst sits on the near surface */
  function contactPoint(tgt) {
    contact.copy(tgt.view.root.position).addScaledVector(dir, -0.12);
    contact.y += 0.45;
    return contact;
  }

  /* trail colour is the palette's blade colour; a crit pulls it toward
     gold and the gain lifts it, so the swing itself says crit before the
     number does */
  function trailColor(src, crit) {
    scratchCol.setHex(PALS[src.pal].blade);
    if (crit) scratchCol.lerp(GOLD, 0.6);
    return scratchCol;
  }

  /* on a miss a shot aims past the target's shoulder instead of at it,
     and the impact frame is when it draws level */
  function aimShot(tgt, lift, hit) {
    to.copy(tgt.view.root.position);
    to.y += lift;
    if (!hit) to.addScaledVector(perp, MISS_SIDESTEP);
  }

  function applyPose(u, pose) {
    const p = u.view.parts;
    p.armR.rotation.x = pose.arm;
    p.armR.rotation.z = 0;
    p.armL.rotation.x = pose.armL;
    p.weapon.rotation.x = pose.wep;
    p.body.rotation.y = pose.twist;
    p.body.position.y = pose.lift;
    p.legL.rotation.x = pose.stance;
    p.legR.rotation.x = -pose.stance;
    u.anim.offset.set(dir.x * pose.off, 0, dir.z * pose.off);
  }

  /* one tween from pose a to pose b, shaped by `ease` */
  function blend(u, a, b, ms, ease) {
    return tween(ms, (k) => {
      const t = ease(k);
      for (const key in NEUTRAL) cur[key] = a[key] + (b[key] - a[key]) * t;
      applyPose(u, cur);
    });
  }

  /* tints every lit material on a unit toward `color` by k, from the
     unit's own base emissive (the POP_EMISSIVE scene.js sets) so k = 0 is
     exactly the resting look and nothing has to be remembered. */
  function tint(u, color, k) {
    for (const m of u.view.mats) {
      if (!m.emissive) continue;
      scratchCol.setHex(m.userData.baseEmissive ?? 0).lerp(color, k);
      m.emissive.copy(scratchCol);
    }
  }

  /* a projectile flying from `from` to `to`. Height is the arc peak above
     the straight line. The director follows it so the camera pans with
     the shot, which is most of what makes a range-2 attack read. */
  async function fly(mesh, ms, arc, onFrame) {
    mesh.visible = true;
    mesh.position.copy(from);
    director.track(mesh.position);
    await tween(ms, (k) => {
      mesh.position.lerpVectors(from, to, k);
      mesh.position.y += Math.sin(k * Math.PI) * arc;
      if (onFrame) onFrame(k);
    });
    director.track(null);
    mesh.visible = false;
  }

  async function melee(src, tgt, ctx, spec) {
    await blend(src, NEUTRAL, spec.windup, spec.windupMs, easeInOutQuad);
    effects.trailBegin(src.view.parts.weapon, spec.trail.base, spec.trail.tip, trailColor(src, ctx.crit), ctx.crit ? 1.7 : 1);
    await blend(src, spec.windup, spec.strike, spec.strikeMs, easeOutCubic);
    effects.trailEnd();
    if (ctx.hit) effects.burst(contactPoint(tgt), SPARK, ctx.crit ? 0.85 : 0.55);
    ctx.onImpact();
    await blend(src, spec.strike, NEUTRAL, spec.recoverMs, easeInOutQuad);
  }

  async function bow(src, tgt, ctx) {
    await blend(src, NEUTRAL, BOW_DRAW, 150, easeOutCubic);
    await blend(src, BOW_DRAW, BOW_FULL, 160, easeInOutQuad);
    await tween(110, () => {});
    from.copy(src.view.root.position).addScaledVector(dir, 0.22);
    from.y += 0.58;
    aimShot(tgt, 0.48, ctx.hit);
    const dist = from.distanceTo(to);
    blend(src, BOW_FULL, BOW_LOOSE, 70, easeOutCubic);
    arrow.lookAt(to);
    await fly(arrow, 80 + dist * 70, 0.08 + dist * 0.03);
    if (ctx.hit) effects.burst(to, SPARK, ctx.crit ? 0.7 : 0.45);
    ctx.onImpact();
    if (!ctx.hit) {
      /* the arrow carries on past and drops out of frame under the recovery */
      from.copy(to);
      to.addScaledVector(dir, 0.9);
      to.y -= 0.3;
      arrow.lookAt(to);
      fly(arrow, 130, 0);
    }
    await blend(src, BOW_LOOSE, NEUTRAL, 220, easeInOutQuad);
  }

  async function anima(src, tgt, ctx) {
    from.copy(src.view.root.position).addScaledVector(dir, 0.26);
    from.y += 0.56;
    aimShot(tgt, 0.5, ctx.hit);
    const dist = from.distanceTo(to);
    bolt.material.opacity = 1;
    bolt.position.copy(from);
    bolt.visible = true;
    /* the bolt forms in the casting hand while the arms come up */
    await Promise.all([
      blend(src, NEUTRAL, CAST_OPEN, 220, easeOutCubic),
      tween(220, (k) => {
        bolt.scale.setScalar(0.01 + easeOutCubic(k) * 0.99);
        bolt.rotation.y += 0.25;
      }),
    ]);
    await tween(90, (k) => { bolt.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.2); bolt.rotation.y += 0.25; });
    blend(src, CAST_OPEN, CAST_PUSH, 90, easeOutCubic);
    await fly(bolt, 110 + dist * 60, 0, () => { bolt.rotation.y += 0.35; bolt.rotation.x += 0.2; });
    if (ctx.hit) {
      effects.burst(to, EMBER, ctx.crit ? 1.2 : 0.9);
      effects.flare(to, EMBER, ctx.crit ? 2.4 : 1.6);
    }
    ctx.onImpact();
    if (ctx.hit) {
      /* the bolt swells and fades at the point of contact while the
         caster recovers underneath it */
      bolt.position.copy(to);
      bolt.visible = true;
      await Promise.all([
        tween(150, (k) => {
          bolt.scale.setScalar(1 + k * 1.6);
          bolt.material.opacity = 1 - k;
        }),
        blend(src, CAST_PUSH, NEUTRAL, 240, easeInOutQuad),
      ]);
    } else {
      /* a missed bolt fizzles out past the target instead of bursting */
      from.copy(to);
      to.addScaledVector(dir, 0.8);
      to.y -= 0.2;
      await Promise.all([
        fly(bolt, 160, 0, (k) => { bolt.material.opacity = 1 - k; bolt.scale.setScalar(1 - k * 0.6); }),
        blend(src, CAST_PUSH, NEUTRAL, 240, easeInOutQuad),
      ]);
    }
    bolt.visible = false;
    bolt.scale.setScalar(1);
  }

  /* no lunge, no projectile, no shake, no burst. The staff comes up, the
     target lights green and lifts a touch while motes drift up off it,
     then everything settles. */
  async function staff(src, tgt, ctx) {
    effects.motes(tgt.view.root.position);
    await Promise.all([
      blend(src, NEUTRAL, STAFF_RAISE, 240, easeOutCubic),
      tween(240, (k) => tint(tgt, GREEN, easeOutCubic(k) * 0.55)),
    ]);
    ctx.onImpact();
    await tween(320, (k) => {
      tint(tgt, GREEN, 0.55 + Math.sin(k * Math.PI) * 0.3);
      tgt.anim.offset.y = Math.sin(k * Math.PI) * 0.05;
    });
    await Promise.all([
      blend(src, STAFF_RAISE, NEUTRAL, 260, easeInOutQuad),
      tween(260, (k) => { tint(tgt, GREEN, 0.55 * (1 - k)); tgt.anim.offset.y = 0; }),
    ]);
  }

  const BEATS = {
    sword: (s, t, c) => melee(s, t, c, MELEE.sword),
    lance: (s, t, c) => melee(s, t, c, MELEE.lance),
    axe: (s, t, c) => melee(s, t, c, MELEE.axe),
    bow,
    anima,
    staff,
  };

  /* plays the attacker's beat against the target. ctx is { hit, crit,
     onImpact }; onImpact fires once at the moment of contact. Restores
     whatever anim state the unit was in before, so a player unit that
     attacked from its ready pose lands back in it exactly as it did
     before beats existed. */
  async function play(src, tgt, ctx) {
    const type = WEAPONS[src.weaponKey].type;
    const beat = BEATS[type] || BEATS.sword;
    dir.subVectors(tgt.view.root.position, src.view.root.position);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1); else dir.normalize();
    perp.set(-dir.z, 0, dir.x);
    const was = src.anim.state;
    src.anim.state = "attack";
    try {
      /* square up first. animUnit turns the unit toward targetYaw at its
         own pace, about 150ms for a half turn, and a windup that starts
         mid-spin reads as flailing from the cut-in camera. Only waits
         when there is a real turn to make. */
      let d = src.anim.targetYaw - src.view.root.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) > 0.5) await tween(150, () => {});
      await beat(src, tgt, ctx);
    } finally {
      applyPose(src, NEUTRAL);
      src.anim.state = was === "attack" ? "idle" : was;
    }
  }

  return { play };
}
