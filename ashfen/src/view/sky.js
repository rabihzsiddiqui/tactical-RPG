/* the world past the board's edge: the sky, the lowland and the ridges.

   The board stands as a low plateau in a lowland that runs out under two
   rings of ridges, so the map is part of a place rather than an island in
   the sky. The lowland takes the same light and haze as the board, but
   stays one flat colour a step down, so the board stays the thing you
   look at. The orbit never sees
   above the horizon (its pitch stops at 20 degrees down); the cut-in
   drops the camera to a unit's eye line, and there the lowland runs back
   to the ridges and the dome's bands rise over them, behind both fighters
   from whichever side the director picks.

   The rings sit further out than the board strictly needs. fitDist lets
   the orbit back off to 38.6 units from the centre on a portrait phone at
   the lowest pitch, and the camera has to stay inside both rings from
   every pose, or it would sit on a ridge or look down its far side. The
   far plane is the orbit distance plus 80, and nothing here is more than
   GROUND_RADIUS from the centre, so all of it stays inside the far plane.

   Three draw calls and no pass: the dome, the lowland, and both rings in
   one mesh. The dome and the ridges sit on the no-outline layer, so the
   normal pass never draws them, and the ridges take no lines. Neither is
   lit by three: MeshBasicMaterial and a ShaderMaterial are skipped by the
   haze and the cloud shadow, and the ridges carry their shading baked
   into vertex colours, one flat colour per face. */

import * as THREE from "three";
import { SKY_VERT, SKY_FRAG } from "./shaders.js";
import { noOutline, NO_OUTLINE_LAYER } from "./meshes.js";
import { tileFog } from "./tilefog.js";
import { hash } from "./wind.js";

export const SKY_HORIZON = 0x9fc3d8; // the lowest band and everything under the horizon; also the clear colour the outline pass keeps
const SKY_ZENITH = 0x5b8ec4;         // the top band, a deeper blue
const SKY_EDGES = [2, 5, 9, 14];     // degrees above the horizon where each band above the lowest starts; the cut-in sees up to about 30
const SKY_RADIUS = 60;               // dome radius; the far plane never comes nearer than 80

const GROUND_Y = -1.25;              // the lowland's height: just over the highest bottom of the board's edge walls (-1.3), so no gap opens under the board
const GROUND_RADIUS = 72;            // out past the far ring's ridge line, so every look below the ridges lands on ground
const GROUND = 0x6b8f4a;             // the lowland's grass, a little darker and duller than the board's plain so the board stays first
const GROUND_HAZE = 0.2;             // how far the lowland is mixed toward the board's haze colour, everywhere; the board's far row takes 0.35
const GROUND_HAZE_AT = 1000;         // where the lowland's haze anchor sits: far enough out that it always takes GROUND_HAZE in full

const RIDGE_LIT = 0x7d9a86;          // a ridge face turned full to the sun, before mist
const RIDGE_SHADE = 0x4c6470;        // a ridge face turned away from it, before mist
const RIDGE_BASE_Y = GROUND_Y - 0.5; // where each ring's faces start, under the lowland, so the ridges rise straight out of it
const RIDGE_MID = 0.45;              // how far up each face the break between its two rows of facets sits
/* one entry per ring. radius: the ridge line from the board centre, and
   wobble: how far it wanders in and out. lean: how far in from the ridge
   line the faces meet the lowland. count: columns around the ring,
   alternating peak and saddle. low and high: the range of ridge heights.
   mist: how far every face is mixed toward SKY_HORIZON. */
const RIDGES = [
  { radius: 46, wobble: 2, lean: 5, count: 48, low: 1.8, high: 4.4, mist: 0.15 },   // near: darker and more saturated
  { radius: 62, wobble: 2.7, lean: 8, count: 40, low: 4.0, high: 8.6, mist: 0.45 }, // far: paler, rises over the near one
];

const srgb = (hex) => [(hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255];
const lerp3 = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);

/* the dome. Drawn first (renderOrder -1 in the opaque list), with no
   depth test or write, so everything else lands on top of it wherever it
   is. It rides on the camera, so it can never reach the far plane. The
   band colours are mixed in sRGB, so the steps look even. Under the
   horizon it is the haze colour, and the lowland and the ridges cover it
   there from everywhere the orbit can go.

   The layer keeps it out of the normal pass, but it is not noOutline:
   it writes 1 into rt's alpha, as the clear it replaces did. Zeroing it
   dropped ten outline texels at 400x240 along the tree silhouettes at the
   reference pose, where the old sky took a dark line. */
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

/* the lowland: one flat disk, lit like the board, so it is one colour
   except where the board's shadow falls on it. It takes the board's haze
   through an anchor far out, which pins it at GROUND_HAZE from any
   camera; graded by distance like a tile, it would step in tile-sized
   squares beside the board and read as more board. At the board's full
   0.35 the blue haze turned the grass teal, (114,143,137) on screen, and
   lighter than the board's own front rows. No cloud shadow either: over
   a flat plain this size the clouds were blotches all round the board.
   It stays on the outline layer: the depth edge where the board's rim
   meets it is a line worth drawing, and a flat disk has no creases. */
function buildGround(haze) {
  const anchor = { value: new THREE.Vector3(GROUND_HAZE_AT, 0, GROUND_HAZE_AT) };
  const fog = { ...haze, uHazeMax: { value: GROUND_HAZE } };
  const mat = tileFog(new THREE.MeshLambertMaterial({ color: GROUND }), fog, anchor);
  const geo = new THREE.CircleGeometry(GROUND_RADIUS, 64);
  geo.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(geo, mat);
  ground.position.y = GROUND_Y;
  ground.receiveShadow = true;
  return ground;
}

/* both rings in one mesh. Each ring is a band of columns: a base under
   the lowland, a shoulder partway up, and the ridge line on top, peaks
   and saddles in turn with a slower swell over them so the skyline does
   not read as a saw. The shoulder wanders in and out so each face breaks
   into facets. Only the inner face is built: from anywhere the orbit can
   go, the ridge line hides the outer one.

   Each triangle gets one colour, from how squarely it faces the sun,
   mixed toward the horizon by the ring's mist. Every face points up, so
   a triangle whose normal comes out pointing down is flipped, which also
   fixes its winding for front-face culling. */
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
  // two triangles across a quad, split on alternate diagonals column to column
  const quad = (a, b, c, d, flip, mist) => {
    if (flip) { tri(a, b, d, mist); tri(b, c, d, mist); } else { tri(a, b, c, mist); tri(a, c, d, mist); }
  };

  RIDGES.forEach((ring, seed) => {
    const { radius, wobble, lean, count, low, high, mist } = ring;
    const cells = Math.max(3, Math.round(count / 6));
    const swell = (i) => {
      const u = (i / count) * cells, k = Math.floor(u), f = u - k, s = f * f * (3 - 2 * f);
      const a = hash(k % cells, 5, seed), b = hash((k + 1) % cells, 5, seed);
      return a + (b - a) * s;
    };
    const base = [], mid = [], ridge = [];
    for (let i = 0; i < count; i++) {
      const ang = ((i + (hash(i, 1, seed) - 0.5) * 0.6) / count) * Math.PI * 2;
      const h = hash(i, 2, seed);
      const bump = i % 2 === 0 ? 0.55 + 0.45 * h : 0.35 * h;
      const top = low + (high - low) * (0.6 * swell(i) + 0.4 * bump);
      const r = radius + (hash(i, 3, seed) - 0.5) * wobble;
      const rb = r - lean + (hash(i, 4, seed) - 0.5) * lean * 0.2;
      const t = RIDGE_MID + (hash(i, 6, seed) - 0.5) * 0.2;
      const rm = rb + (r - rb) * t + (hash(i, 7, seed) - 0.5) * lean * 0.25;
      const x = Math.cos(ang), z = Math.sin(ang);
      base.push(new THREE.Vector3(x * rb, RIDGE_BASE_Y, z * rb));
      mid.push(new THREE.Vector3(x * rm, RIDGE_BASE_Y + (top - RIDGE_BASE_Y) * t, z * rm));
      ridge.push(new THREE.Vector3(x * r, top, z * r));
    }
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      quad(base[i], base[j], mid[j], mid[i], i % 2 === 1, mist);
      quad(mid[i], mid[j], ridge[j], ridge[i], i % 2 === 0, mist);
    }
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return noOutline(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true })));
}

/* adds the dome, the lowland and the ridges to the scene. `haze` is the
   board's tile fog uniforms, so the lowland hazes toward the same colour.
   follow() goes once a frame, after the director has placed the camera,
   shake included. */
export function createSky({ scene, sun, haze }) {
  const dome = buildDome();
  scene.add(dome, buildGround(haze), buildRidges(sun.position.clone().normalize()));
  return { follow(camera) { dome.position.copy(camera.position); } };
}
