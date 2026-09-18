/* impact effects for the attack beats: the weapon trail, the impact
   burst, the fire flare and the staff motes.

   Each is one object built at mount and reused, hidden when idle, so
   nothing is allocated per strike and nothing draws while no beat is
   playing. attacks.js starts them at the right moment of a beat and
   scene.js calls update() once per frame after animUnit, with the same
   dt the tweens got. That ordering matters twice over: the trail samples
   the weapon where it will be drawn this frame rather than where it was
   last frame, and every effect freezes with the rest of the scene during
   a hit-stop, so the burst holds at full brightness on the frame of
   contact instead of playing out under the freeze. */

import * as THREE from "three";
import { TILE_VERT, TRAIL_FRAG, IMPACT_FRAG } from "./shaders.js";

const TRAIL_SEGS = 16;      // samples kept; at 60fps a 110ms sword strike fills about seven
const TRAIL_FADE_MS = 200;
const BURST_MS = 170;
const FLARE_MS = 240;
const MOTE_COUNT = 14;
const MOTES_MS = 900;

export function createEffects({ scene }) {
  /* ---- weapon trail ----
     a ribbon of TRAIL_SEGS - 1 quads. Vertex 2j is the weapon's base at
     sample j and vertex 2j + 1 its tip; sample 0 is the newest. uv.x runs
     along the length so the shader can fade the tail, uv.y across it. */
  const trailGeo = new THREE.BufferGeometry();
  const trailPos = new Float32Array(TRAIL_SEGS * 2 * 3);
  const trailUv = new Float32Array(TRAIL_SEGS * 2 * 2);
  const trailIdx = [];
  for (let j = 0; j < TRAIL_SEGS; j++) {
    const u = j / (TRAIL_SEGS - 1);
    trailUv.set([u, 0, u, 1], j * 4);
    if (j < TRAIL_SEGS - 1) {
      const a = j * 2, b = a + 1, c = a + 2, d = a + 3;
      trailIdx.push(a, b, c, b, d, c);
    }
  }
  trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute("uv", new THREE.BufferAttribute(trailUv, 2));
  trailGeo.setIndex(trailIdx);
  const trailMat = new THREE.ShaderMaterial({
    vertexShader: TILE_VERT, fragmentShader: TRAIL_FRAG,
    uniforms: {
      uColor: { value: new THREE.Color(0xffffff) }, uFade: { value: 1 }, uLen: { value: 1 }, uGain: { value: 1 },
    },
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
  const trailMesh = new THREE.Mesh(trailGeo, trailMat);
  trailMesh.frustumCulled = false; // its vertices are rewritten in world space every frame
  trailMesh.visible = false;
  scene.add(trailMesh);
  const trail = { weapon: null, base: new THREE.Vector3(), tip: new THREE.Vector3(), count: 0, fadeT: -1 };
  const wb = new THREE.Vector3(), wt = new THREE.Vector3();

  /* starts recording `weapon`, sampling the segment from local y = baseY
     to y = tipY each frame until trailEnd. */
  function trailBegin(weapon, baseY, tipY, color, gain = 1) {
    trail.weapon = weapon;
    trail.base.set(0, baseY, 0);
    trail.tip.set(0, tipY, 0);
    trail.count = 0;
    trail.fadeT = -1;
    trailMat.uniforms.uColor.value.set(color);
    trailMat.uniforms.uGain.value = gain;
    trailMat.uniforms.uFade.value = 1;
    trailMesh.visible = false;
  }

  /* stops recording and leaves the ribbon where it is, fading out */
  function trailEnd() {
    trail.weapon = null;
    trail.fadeT = 0;
  }

  function trailSample() {
    const w = trail.weapon;
    w.updateWorldMatrix(true, false);
    wb.copy(trail.base).applyMatrix4(w.matrixWorld);
    wt.copy(trail.tip).applyMatrix4(w.matrixWorld);
    /* shift every sample one slot toward the tail, then write the new one at 0 */
    for (let j = Math.min(trail.count, TRAIL_SEGS - 1); j > 0; j--) trailPos.copyWithin(j * 6, (j - 1) * 6, j * 6);
    trailPos.set([wb.x, wb.y, wb.z, wt.x, wt.y, wt.z], 0);
    trail.count = Math.min(trail.count + 1, TRAIL_SEGS);
    /* unused slots sit on the oldest real sample, so their quads are degenerate */
    for (let j = trail.count; j < TRAIL_SEGS; j++) trailPos.copyWithin(j * 6, (trail.count - 1) * 6, trail.count * 6);
    trailGeo.attributes.position.needsUpdate = true;
    trailMat.uniforms.uLen.value = Math.max(1, trail.count - 1) / (TRAIL_SEGS - 1);
    trailMesh.visible = trail.count > 1;
  }

  /* ---- impact burst ----
     one quad, billboarded to the camera every frame and rolled by a
     random angle per burst so two hits in a row do not look stamped.
     Depth test off: the contact point is inside the target's body more
     often than not. */
  const burstMat = new THREE.ShaderMaterial({
    vertexShader: TILE_VERT, fragmentShader: IMPACT_FRAG,
    uniforms: { uT: { value: 0 }, uColor: { value: new THREE.Color(0xffffff) } },
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  });
  const burstMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), burstMat);
  burstMesh.renderOrder = 10;
  burstMesh.visible = false;
  scene.add(burstMesh);
  const roll = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  let burstT = -1;

  function burst(pos, color, size) {
    burstMesh.position.copy(pos);
    burstMesh.scale.setScalar(size);
    roll.setFromAxisAngle(zAxis, Math.random() * Math.PI);
    burstMat.uniforms.uColor.value.set(color);
    burstMat.uniforms.uT.value = 0;
    burstMesh.visible = true;
    burstT = 0;
  }

  /* ---- flare ----
     a point light that spikes on the target when a spell lands. Added to
     the scene once at intensity 0 rather than on demand: adding a light
     recompiles every lit material, which is a hitch worth paying once at
     mount and never mid-exchange. Short range so it lights the target
     and the ground under it, not the whole field. */
  const flare = new THREE.PointLight(0xff8a3a, 0, 2.2, 2);
  scene.add(flare);
  let flareT = -1, flarePeak = 0;

  function flareAt(pos, color, peak) {
    flare.position.copy(pos);
    flare.position.y += 0.2;
    flare.color.set(color);
    flarePeak = peak;
    flareT = 0;
  }

  /* ---- motes ----
     a small cloud of points that drifts upward from a healed unit. Each
     mote has its own footing, speed and wobble phase, fixed at mount.
     Depth test off for the same reason as the burst: half the cloud
     starts inside the unit's body. */
  const moteGeo = new THREE.BufferGeometry();
  const motePos = new Float32Array(MOTE_COUNT * 3);
  moteGeo.setAttribute("position", new THREE.BufferAttribute(motePos, 3));
  const moteSeed = [];
  for (let i = 0; i < MOTE_COUNT; i++) {
    const ang = Math.random() * Math.PI * 2, rad = 0.08 + Math.random() * 0.2;
    moteSeed.push({
      rx: Math.cos(ang) * rad, rz: Math.sin(ang) * rad,
      y0: Math.random() * 0.25, rise: 0.55 + Math.random() * 0.4, phase: Math.random() * 6.28,
    });
  }
  const moteMat = new THREE.PointsMaterial({
    color: 0x9cf7ac, size: 0.1, transparent: true, opacity: 0, depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.renderOrder = 10;
  motes.frustumCulled = false;
  motes.visible = false;
  scene.add(motes);
  const moteOrigin = new THREE.Vector3();
  let moteT = -1;

  function motesAt(pos) {
    moteOrigin.copy(pos);
    moteT = 0;
    motes.visible = true;
  }

  /* dtMs is animation time, already shortened by any hit-stop. */
  function update(dtMs, camera) {
    if (trail.weapon && dtMs > 0) trailSample();
    if (trail.fadeT >= 0) {
      trail.fadeT += dtMs;
      const k = Math.min(1, trail.fadeT / TRAIL_FADE_MS);
      trailMat.uniforms.uFade.value = 1 - k;
      if (k >= 1) { trail.fadeT = -1; trailMesh.visible = false; }
    }
    if (burstT >= 0) {
      burstT += dtMs;
      const k = Math.min(1, burstT / BURST_MS);
      burstMat.uniforms.uT.value = k;
      burstMesh.quaternion.copy(camera.quaternion).multiply(roll);
      if (k >= 1) { burstT = -1; burstMesh.visible = false; }
    }
    if (flareT >= 0) {
      flareT += dtMs;
      const k = Math.min(1, flareT / FLARE_MS);
      flare.intensity = flarePeak * Math.sin(k * Math.PI);
      if (k >= 1) { flareT = -1; flare.intensity = 0; }
    }
    if (moteT >= 0) {
      moteT += dtMs;
      const k = Math.min(1, moteT / MOTES_MS);
      for (let i = 0; i < MOTE_COUNT; i++) {
        const s = moteSeed[i];
        motePos[i * 3] = moteOrigin.x + s.rx + Math.sin(k * 7 + s.phase) * 0.03;
        motePos[i * 3 + 1] = moteOrigin.y + 0.05 + s.y0 + k * s.rise;
        motePos[i * 3 + 2] = moteOrigin.z + s.rz;
      }
      moteGeo.attributes.position.needsUpdate = true;
      moteMat.opacity = Math.sin(k * Math.PI) * 0.9;
      if (k >= 1) { moteT = -1; motes.visible = false; }
    }
  }

  return { trailBegin, trailEnd, burst, flare: flareAt, motes: motesAt, update };
}
