/* the sky and the ridges: what stands behind the fighters in a cut-in.

   The orbit never sees above the horizon (its pitch stops at 20 degrees
   down), so at grid distance the dome is far-off green country under the
   board and the sky never shows. The cut-in drops the camera to a unit's
   eye line, and there the dome's bands and the two ridge rings give both
   fighters a horizon behind them from whichever side the director picks.

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

export const SKY_HORIZON = 0x9fc3d8; // the haze band either side of the horizon, where the ridges stand; also the clear colour the outline pass keeps
const SKY_ZENITH = 0x5b8ec4;         // the top band, a deeper blue
const SKY_EDGES = [2, 5, 9, 14];     // degrees above the horizon where each band over the haze starts, stepping to SKY_ZENITH
const GROUND = 0x8aad7e;             // the deepest band under the horizon: far-off country, paler than the board's grass so the board stays first
const GROUND_EDGES = [4, 8, 14];     // degrees below the horizon where each band under the haze starts, stepping to GROUND
const SKY_RADIUS = 60;               // dome radius; the far plane never comes nearer than 80

const RIDGE_LIT = 0x7d9a86;          // a ridge face turned full to the sun, before mist
const RIDGE_SHADE = 0x4c6470;        // a ridge face turned away from it, before mist
const RIDGE_HAZE_Y = -1;             // the haze line: where each ring's faces stop, a little under the board's top
const RIDGE_HAZE_JITTER = 0.6;       // how far the haze line wanders up and down between columns
/* one entry per ring. radius: the ridge line from the board centre, and
   wobble: how far it wanders in and out. lean: how far in from the ridge
   line the faces meet the haze line. count: columns around the ring,
   alternating peak and saddle. low and high: the range of ridge heights.
   mist: how far every face is mixed toward SKY_HORIZON. */
const RIDGES = [
  { radius: 46, wobble: 2, lean: 1.8, count: 48, low: 1.8, high: 4.4, mist: 0.15 },  // near: darker and more saturated
  { radius: 62, wobble: 2.7, lean: 3.6, count: 40, low: 4.0, high: 8.6, mist: 0.45 }, // far: paler, rises over the near one
];

const srgb = (hex) => [(hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255];
const lerp3 = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);

/* the dome. Drawn first (renderOrder -1 in the opaque list), with no
   depth test or write, so everything else lands on top of it wherever it
   is. It rides on the camera, so it can never reach the far plane.

   One run of bands from the ground up: GROUND at the bottom, stepping
   through to the haze colour just under the horizon, the haze band
   across it, and the sky stepping on up to SKY_ZENITH. Colours are mixed
   in sRGB, so the steps look even. Under the horizon is all the orbit
   ever sees, so at grid distance the board sits over far-off green
   country rather than floating in sky.

   The layer keeps it out of the normal pass, but it is not noOutline:
   it writes 1 into rt's alpha, as the clear it replaces did. Zeroing it
   dropped ten outline texels at 400x240 along the tree silhouettes at the
   reference pose, where the old sky took a dark line. */
function buildDome() {
  const haze = srgb(SKY_HORIZON), zenith = srgb(SKY_ZENITH), ground = srgb(GROUND);
  const band = (c, deg) => ({ c, s: Math.sin(THREE.MathUtils.degToRad(deg)) });
  const G = GROUND_EDGES.length, S = SKY_EDGES.length;
  // lowest first: each band's colour and the elevation it starts at
  const bands = [band(ground, -90)];
  for (let k = G - 1; k >= 1; k--) bands.push(band(lerp3(haze, ground, k / G), -GROUND_EDGES[k]));
  bands.push(band(haze, -GROUND_EDGES[0]));
  SKY_EDGES.forEach((deg, j) => bands.push(band(lerp3(haze, zenith, (j + 1) / S), deg)));
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
    defines: { BANDS: bands.length },
    uniforms: {
      uBand: { value: bands.map((b) => new THREE.Color().setRGB(b.c[0], b.c[1], b.c[2], THREE.SRGBColorSpace)) },
      uEdge: { value: bands.map((b) => b.s) },
    },
    side: THREE.BackSide, depthTest: false, depthWrite: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 24, 12), mat);
  dome.renderOrder = -1;
  dome.frustumCulled = false;
  dome.layers.set(NO_OUTLINE_LAYER);
  return dome;
}

/* both rings in one mesh. Each ring is a band of columns: a base on the
   haze line and the ridge line above it, peaks and saddles in turn with a
   slower swell over them so the skyline does not read as a saw. Only the
   inner face is built: from anywhere the orbit can go, the ridge line
   hides the outer one.

   Each triangle gets one colour, from how squarely it faces the sun,
   mixed toward the horizon by the ring's mist. Every face points up, so
   a triangle whose normal comes out pointing down is flipped, which also
   fixes its winding for front-face culling.

   The faces stop at the haze line, and the dome's haze and green show
   under them. Carried on down, they stood behind the board as a wall of
   facets taller than the board itself from the lowest orbit, and painted
   out in the haze colour they hid the dome's green. In the cut-in the
   haze line sits just under the horizon, inside the dome's haze band, so
   the peaks rise out of mist. */
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
    const { radius, wobble, lean, count, low, high, mist } = ring;
    const cells = Math.max(3, Math.round(count / 6));
    const swell = (i) => {
      const u = (i / count) * cells, k = Math.floor(u), f = u - k, s = f * f * (3 - 2 * f);
      const a = hash(k % cells, 5, seed), b = hash((k + 1) % cells, 5, seed);
      return a + (b - a) * s;
    };
    const base = [], ridge = [];
    for (let i = 0; i < count; i++) {
      const ang = ((i + (hash(i, 1, seed) - 0.5) * 0.6) / count) * Math.PI * 2;
      const h = hash(i, 2, seed);
      const bump = i % 2 === 0 ? 0.55 + 0.45 * h : 0.35 * h;
      const top = low + (high - low) * (0.6 * swell(i) + 0.4 * bump);
      const r = radius + (hash(i, 3, seed) - 0.5) * wobble;
      const rb = r - lean + (hash(i, 4, seed) - 0.5) * lean * 0.4;
      const yb = RIDGE_HAZE_Y + (hash(i, 6, seed) - 0.5) * 2 * RIDGE_HAZE_JITTER;
      const x = Math.cos(ang), z = Math.sin(ang);
      base.push(new THREE.Vector3(x * rb, yb, z * rb));
      ridge.push(new THREE.Vector3(x * r, top, z * r));
    }
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      if (i % 2 === 0) {
        tri(base[i], base[j], ridge[j], mist);
        tri(base[i], ridge[j], ridge[i], mist);
      } else {
        tri(base[i], base[j], ridge[i], mist);
        tri(base[j], ridge[j], ridge[i], mist);
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
