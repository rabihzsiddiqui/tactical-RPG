/* the sky: what stands behind the fighters in a cut-in.

   The orbit never sees above the horizon (its pitch stops at 20 degrees
   down), so at grid distance the sky is the old flat 0x9fc3d8 and nothing
   more. The cut-in drops the camera to a unit's eye line, and there the
   dome's bands give both fighters a horizon behind them.

   One draw call and no pass. The dome sits on the no-outline layer, so
   the normal pass never draws it, and a ShaderMaterial is skipped by the
   haze and the cloud shadow. */

import * as THREE from "three";
import { SKY_VERT, SKY_FRAG } from "./shaders.js";
import { NO_OUTLINE_LAYER } from "./meshes.js";

export const SKY_HORIZON = 0x9fc3d8; // the lowest band and everything below the horizon: the old flat sky, so the grid view is unchanged
const SKY_ZENITH = 0x5b8ec4;         // the top band, a deeper blue
const SKY_EDGES = [3, 8, 15, 24];    // degrees above the horizon where each band above the lowest starts; the cut-in sees up to about 30
const SKY_RADIUS = 60;               // dome radius; the far plane never comes nearer than 80

const srgb = (hex) => [(hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255];
const lerp3 = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);

/* the dome. Drawn first (renderOrder -1 in the opaque list), with no
   depth test or write, so everything else lands on top of it wherever it
   is. It rides on the camera, so it can never reach the far plane. The
   band colours are mixed in sRGB, so the steps look even.

   The layer keeps it out of the normal pass, but it is not noOutline:
   it writes 1 into rt's alpha, as the clear it replaces did. Zeroing it
   dropped ten outline texels at 400x240 along the tree silhouettes at the
   reference pose, where the old sky took a dark line, and the grid view
   is meant to come out exactly as it was. */
function buildDome() {
  const bands = SKY_EDGES.length + 1;
  const lo = srgb(SKY_HORIZON), hi = srgb(SKY_ZENITH);
  const uBand = [], uEdge = [-1];
  for (let i = 0; i < bands; i++) {
    const c = lerp3(lo, hi, i / (bands - 1));
    uBand.push(new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace));
  }
  for (const deg of SKY_EDGES) uEdge.push(Math.sin(THREE.MathUtils.degToRad(deg)));
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
    defines: { BANDS: bands },
    uniforms: { uBand: { value: uBand }, uEdge: { value: uEdge } },
    side: THREE.BackSide, depthTest: false, depthWrite: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 24, 12), mat);
  dome.renderOrder = -1;
  dome.frustumCulled = false;
  dome.layers.set(NO_OUTLINE_LAYER);
  return dome;
}

/* adds the dome to the scene. follow() goes once a frame, after the
   director has placed the camera, shake included. */
export function createSky({ scene }) {
  const dome = buildDome();
  scene.add(dome);
  return { follow(camera) { dome.position.copy(camera.position); } };
}
