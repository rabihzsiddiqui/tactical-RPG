/* the sky and the ridges: what stands behind the fighters in a cut-in.

   The orbit never sees above the horizon (its pitch stops at 20 degrees
   down), so at grid distance the sky is the old flat 0x9fc3d8 and nothing
   more. The cut-in drops the camera to a unit's eye line, and there the
   dome's bands and the two ridge rings give both fighters a horizon
   behind them from whichever side the director picks.

   The rings sit further out than the board strictly needs. fitDist lets
   the orbit back off to 38.6 units from the centre on a portrait phone at
   the lowest pitch, and the camera has to stay inside both rings from
   every pose, or it would sit on a ridge or look down its far side. The
   far plane is the orbit distance plus 80 and no ridge point is more
   than about 64 from the centre, so the far ring stays at least 16 units
   inside it.

   Two draw calls and no pass: the dome, and both rings in one mesh, each
   draw once in the colour pass. Both sit on the no-outline layer, so the
   normal pass never draws them, and the ridges take no lines. Neither is
   lit by three: MeshBasicMaterial and a ShaderMaterial are skipped by the
   haze and the cloud shadow, and the ridges carry their shading baked
   into vertex colours, one flat colour per face. */

import * as THREE from "three";
import { SKY_VERT, SKY_FRAG } from "./shaders.js";
import { noOutline, NO_OUTLINE_LAYER } from "./meshes.js";
import { hash } from "./wind.js";

export const SKY_HORIZON = 0x9fc3d8; // the lowest band and everything below the horizon: the old flat sky, so the grid view is unchanged
const SKY_ZENITH = 0x5b8ec4;         // the top band, a deeper blue
const SKY_EDGES = [3, 8, 15, 24];    // degrees above the horizon where each band above the lowest starts; the cut-in sees up to about 30
const SKY_RADIUS = 60;               // dome radius; the far plane never comes nearer than 80

const RIDGE_FOOT = -12;              // height of each ring's inner foot, deep enough that the board hides it from the cut-in
const RIDGE_LIT = 0x7d9a86;          // a ridge face turned full to the sun, before mist
const RIDGE_SHADE = 0x4c6470;        // a ridge face turned away from it, before mist
const RIDGE_HAZE_Y = -1;             // the haze line: the break between each ring's two rows of facets, a little under the board's top
const RIDGE_HAZE_JITTER = 0.6;       // how far the haze line wanders up and down between columns
const RIDGE_VALLEY = 1;              // mist on the row under the haze line; 1 is the horizon colour exactly, so the orbit sees the old flat sky there
/* one entry per ring. radius: the ridge line from the board centre.
   depth: how far in the foot sits from it. count: columns around the
   ring, alternating peak and saddle. low and high: the range of ridge
   heights. mist: how far every face is mixed toward SKY_HORIZON. */
const RIDGES = [
  { radius: 46, depth: 6.5, count: 48, low: 1.8, high: 4.4, mist: 0.3 }, // near: darker and more saturated
  { radius: 62, depth: 9, count: 40, low: 4.0, high: 8.6, mist: 0.6 },   // far: paler, rises over the near one
];

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

/* both rings in one mesh. Each ring is a band of columns: a foot on the
   inside, a shoulder on the haze line, and the ridge line on top, peaks
   and saddles in turn with a slower swell over them so the skyline does
   not read as a saw. Only the inner face is built: from anywhere the
   orbit can go, the ridge line hides the outer one.

   Each triangle gets one colour, from how squarely it faces the sun,
   mixed toward the horizon by the ring's mist. Every face points up, so
   a triangle whose normal comes out pointing down is flipped, which also
   fixes its winding for front-face culling.

   The row under the haze line is mixed all the way to the horizon
   colour. From the lowest orbit the camera looks down onto the inner
   faces, and at full colour they stood behind the board as a wall of
   facets taller than the board itself. In the cut-in that row is below
   the horizon and mostly behind the board, so only the peaks rising out
   of the haze show there. */
function buildRidges(sunDir) {
  const pos = [], col = [];
  const lit = srgb(RIDGE_LIT), shade = srgb(RIDGE_SHADE), sky = srgb(SKY_HORIZON);
  const n = new THREE.Vector3(), e = new THREE.Vector3(), out = new THREE.Color();
  const tri = (p, q, r, mist) => {
    n.subVectors(q, p).cross(e.subVectors(r, p)).normalize();
    if (n.y < 0) { [q, r] = [r, q]; n.negate(); }
    const c = lerp3(lerp3(shade, lit, THREE.MathUtils.clamp(n.dot(sunDir), 0, 1)), sky, mist);
    out.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
    for (const v of [p, q, r]) { pos.push(v.x, v.y, v.z); col.push(out.r, out.g, out.b); }
  };

  RIDGES.forEach((ring, seed) => {
    const { radius, depth, count, low, high, mist } = ring;
    const cells = Math.max(3, Math.round(count / 6));
    const swell = (i) => {
      const u = (i / count) * cells, k = Math.floor(u), f = u - k, s = f * f * (3 - 2 * f);
      const a = hash(k % cells, 5, seed), b = hash((k + 1) % cells, 5, seed);
      return a + (b - a) * s;
    };
    const foot = [], shoulder = [], ridge = [];
    for (let i = 0; i < count; i++) {
      const ang = ((i + (hash(i, 1, seed) - 0.5) * 0.6) / count) * Math.PI * 2;
      const h = hash(i, 2, seed);
      const bump = i % 2 === 0 ? 0.55 + 0.45 * h : 0.35 * h;
      const top = low + (high - low) * (0.6 * swell(i) + 0.4 * bump);
      const r = radius + (hash(i, 3, seed) - 0.5) * depth * 0.3;
      const ys = RIDGE_HAZE_Y + (hash(i, 6, seed) - 0.5) * 2 * RIDGE_HAZE_JITTER;
      const up = (ys - RIDGE_FOOT) / (top - RIDGE_FOOT);
      const rs = r - depth * (1 - up) + (hash(i, 4, seed) - 0.5) * depth * 0.2;
      const x = Math.cos(ang), z = Math.sin(ang);
      foot.push(new THREE.Vector3(x * (r - depth), RIDGE_FOOT, z * (r - depth)));
      shoulder.push(new THREE.Vector3(x * rs, ys, z * rs));
      ridge.push(new THREE.Vector3(x * r, top, z * r));
    }
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      tri(foot[i], foot[j], shoulder[j], RIDGE_VALLEY);
      tri(foot[i], shoulder[j], shoulder[i], RIDGE_VALLEY);
      if (i % 2 === 0) {
        tri(shoulder[i], shoulder[j], ridge[j], mist);
        tri(shoulder[i], ridge[j], ridge[i], mist);
      } else {
        tri(shoulder[i], shoulder[j], ridge[i], mist);
        tri(shoulder[j], ridge[j], ridge[i], mist);
      }
    }
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return noOutline(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true })));
}

/* adds the dome and the ridges to the scene. follow() goes once a frame,
   after the director has placed the camera, shake included. */
export function createSky({ scene, sun }) {
  const dome = buildDome();
  scene.add(dome, buildRidges(sun.position.clone().normalize()));
  return { follow(camera) { dome.position.copy(camera.position); } };
}
