/* the world past the board's edge: the sky, the lowland, the river's run
   out across it, and the ridges.

   The lowland is flush with the map's edge tiles, so the board is a piece
   of the land rather than something set on it, and it runs out under two
   rings of ridges. What makes the map the subject is haze: the lowland
   steps paler in rings by distance from the board's edge, and reaches the
   sky's own haze colour before the ridges. The board stays clear in the
   middle, and nothing out at the rim ever shows an edge. The orbit never
   sees above the horizon (its pitch stops at 20 degrees down); the cut-in
   drops the camera to a unit's eye line, and there the lowland runs back
   to the ridges and the dome's bands rise over them, behind both fighters
   from whichever side the director picks.

   The rings sit further out than the board strictly needs. fitDist lets
   the orbit back off to 38.6 units from the centre on a portrait phone at
   the lowest pitch, and the camera has to stay inside both rings from
   every pose, or it would sit on a ridge or look down its far side. The
   far plane is the orbit distance plus 80, and nothing here is more than
   GROUND_RADIUS from the centre, so all of it stays inside the far plane.

   Four draw calls and no pass: the dome, the lowland with its river
   banks, the river, and both ridge rings in one mesh. The dome, the river
   and the ridges sit on the no-outline layer, so the normal pass never
   draws them, and the ridges take no lines. The ridges carry their
   shading baked into vertex colours, one flat colour per face; the dome
   and the ridges take no haze or cloud. */

import * as THREE from "three";
import { MW, MH, CX, CZ, cell } from "../core/map.js";
import { SKY_VERT, SKY_FRAG, WATER_VERT, WATER_FRAG, RING_HAZE_PARS } from "./shaders.js";
import { noOutline, NO_OUTLINE_LAYER } from "./meshes.js";
import { hash, splice } from "./wind.js";

export const SKY_HORIZON = 0x9fc3d8; // the lowest band and everything under the horizon; also the clear colour the outline pass keeps
const SKY_ZENITH = 0x5b8ec4;         // the top band, a deeper blue
const SKY_EDGES = [2, 5, 9, 14];     // degrees above the horizon where each band above the lowest starts; the cut-in sees up to about 30
const SKY_RADIUS = 60;               // dome radius; the far plane never comes nearer than 80

const GROUND_Y = 0;                  // the lowland's height: flush with the map's edge tiles
const GROUND_RADIUS = 72;            // out past the far ring's ridge line, so every look below the ridges lands on ground
const GROUND = 0x6b8f4a;             // the lowland's grass, a little darker and duller than the board's plain so the board stays first
const GROUND_TUCK = 0.25;            // how far the lowland reaches in under the board's edge tiles, so no crack opens along the seam
/* the haze rings round the map: [distance from the board's edge, amount
   mixed toward the haze colour]. The last is 1, the sky's own haze, so
   the lowland meets the dome with no edge, reached well before the near
   ridges. */
const HAZE_RINGS = [[0, 0.25], [2, 0.4], [5, 0.55], [9, 0.7], [15, 0.85], [24, 1]];

const RIVER_REACH = 44;              // how far the river runs out from the board centre along its own axis: deep in the full haze, so its end is never seen
const RIVER_Y = -0.1;                // the river's surface, where scene.js lays the water tiles
const RIVER_SEGS = 2;                // water grid cells per unit along the river, enough for the swell in WATER_VERT; across it is 6, as on a water tile

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
   horizon it is the haze colour, which the lowland fades into.

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

/* where the river leaves the map: one arm per run of water tiles along an
   edge. along is the axis the arm runs out on, sign which way; lo and hi
   bound the run across the arm, in world units; bed is the water tiles'
   floor, and sideLo and sideHi the bank colours either side, taken from
   the edge tiles beside the run as the board's own walls take them. */
function riverArms() {
  const arms = [];
  const scan = (along, sign, count, at) => {
    const mid = along === "x" ? CZ : CX, half = (along === "x" ? MH : MW) / 2 - GROUND_TUCK;
    const side = (j, i) => (j >= 0 && j < count && !at(j).water ? at(j) : at(i)).side;
    for (let i = 0; i < count; i++) {
      if (!at(i).water || (i > 0 && at(i - 1).water)) continue;
      let len = 1;
      while (i + len < count && at(i + len).water) len++;
      arms.push({
        along, sign, bed: at(i).h, sideLo: side(i - 1, i), sideHi: side(i + len, i),
        lo: Math.max(i - mid - 0.5, -half), hi: Math.min(i + len - 1 - mid + 0.5, half),
      });
    }
  };
  scan("x", -1, MH, (y) => cell(0, y));
  scan("x", 1, MH, (y) => cell(MW - 1, y));
  scan("z", -1, MW, (x) => cell(x, 0));
  scan("z", 1, MW, (x) => cell(x, MH - 1));
  return arms;
}

/* haze by distance from the board's edge, spliced into one of three's
   lit materials the way tilefog.js splices its own. `ring` holds the
   uniforms RING_HAZE_PARS reads. Any patch already on the material runs
   first and keeps its cache key. */
function ringHaze(m, ring) {
  const prevCompile = m.onBeforeCompile;
  // read before the patch below replaces onBeforeCompile, which three's default key is made from
  const key = m.customProgramCacheKey() + "|ringhaze";
  m.onBeforeCompile = (sh, renderer) => {
    prevCompile.call(m, sh, renderer);
    Object.assign(sh.uniforms, ring);
    sh.vertexShader = splice(splice(sh.vertexShader, "#include <common>", "varying vec3 vRingP;"),
      "#include <fog_vertex>", "vRingP = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = splice(sh.fragmentShader, "#include <common>",
      `#define RING_STEPS ${HAZE_RINGS.length}\n${RING_HAZE_PARS}\nvarying vec3 vRingP;`)
      .replace("#include <tonemapping_fragment>",
        "gl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeColor, ringHaze(vRingP.xz));\n#include <tonemapping_fragment>");
  };
  m.customProgramCacheKey = () => key;
  return m;
}

/* the lowland: a disk flush with the edge tiles, with the board cut out
   of it and a channel wherever the river leaves the map, walled down to
   the river bed like the banks inside the board. The cut is tucked
   GROUND_TUCK in under the board's edge, so the two overlap rather than
   meet on a line that could open a crack, and polygon offset keeps the
   board on top in the overlap. The channel's walls reach in the same way
   and the offset hands the board its own walls there too.

   Lit like the board and under the same cloud, so light and cloud run
   straight across the seam; clouds stopping dead at the map's edge would
   draw the rectangle the haze is meant to soften. Hazed in rings from the
   board's edge, which also fades the clouds out with distance, where on
   a flat plain at one haze they made blotches all round the board. It
   stays on the outline layer: its channel walls take lines like the
   river's banks inside the board, and the flat disk has no creases. */
function buildGround(arms, ring, wind) {
  const a = MW / 2 - GROUND_TUCK, b = MH / 2 - GROUND_TUCK, R = RIVER_REACH;
  const on = (along, sign) => arms.filter((m) => m.along === along && m.sign === sign);
  // the hole, walked round the board's rim with a notch out along each arm; shape y is world -z
  const hole = [];
  const P = (x, z) => hole.push(new THREE.Vector2(x, -z));
  P(-a, -b);
  for (const m of on("z", -1).sort((p, q) => p.lo - q.lo)) { P(m.lo, -b); P(m.lo, -R); P(m.hi, -R); P(m.hi, -b); }
  P(a, -b);
  for (const m of on("x", 1).sort((p, q) => p.lo - q.lo)) { P(a, m.lo); P(R, m.lo); P(R, m.hi); P(a, m.hi); }
  P(a, b);
  for (const m of on("z", 1).sort((p, q) => q.lo - p.lo)) { P(m.hi, b); P(m.hi, R); P(m.lo, R); P(m.lo, b); }
  P(-a, b);
  for (const m of on("x", -1).sort((p, q) => q.lo - p.lo)) { P(-a, m.hi); P(-R, m.hi); P(-R, m.lo); P(-a, m.lo); }
  const shape = new THREE.Shape().absarc(0, 0, GROUND_RADIUS, 0, Math.PI * 2, false);
  shape.holes.push(new THREE.Path(hole));
  const disk = new THREE.ShapeGeometry(shape, 32).rotateX(-Math.PI / 2).toNonIndexed();

  const pos = Array.from(disk.attributes.position.array);
  const nrm = Array.from(disk.attributes.normal.array);
  const col = [];
  const grass = new THREE.Color(GROUND);
  for (let i = 0; i < pos.length; i += 3) col.push(grass.r, grass.g, grass.b);

  // the channel walls: two triangles each side of every arm, wound to face into the channel
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), c = new THREE.Color();
  const tri = (p, q, r, n, hex) => {
    if (e1.subVectors(q, p).cross(e2.subVectors(r, p)).dot(n) < 0) [q, r] = [r, q];
    c.set(hex);
    for (const v of [p, q, r]) { pos.push(v.x, v.y, v.z); nrm.push(n.x, n.y, n.z); col.push(c.r, c.g, c.b); }
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  for (const m of arms) {
    for (const [across, n, hex] of [[m.lo, 1, m.sideLo], [m.hi, -1, m.sideHi]]) {
      const [p0, p1, q0, q1, dir] = m.along === "x"
        ? [V(m.sign * a, GROUND_Y, across), V(m.sign * R, GROUND_Y, across), V(m.sign * a, m.bed, across), V(m.sign * R, m.bed, across), V(0, 0, n)]
        : [V(across, GROUND_Y, m.sign * b), V(across, GROUND_Y, m.sign * R), V(across, m.bed, m.sign * b), V(across, m.bed, m.sign * R), V(n, 0, 0)];
      tri(p0, p1, q1, dir, hex);
      tri(p0, q1, q0, dir, hex);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const mat = ringHaze(new THREE.MeshLambertMaterial({
    vertexColors: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  }), ring);
  wind.cloud(mat);
  const ground = new THREE.Mesh(geo, mat);
  ground.receiveShadow = true;
  return ground;
}

/* the river's run out of the map: a strip of water down each arm, on the
   board's own water shader with RING_HAZE defined, so it hazes out with
   the lowland. The uniforms are the board water's own objects, so uTime
   moves with it. Each strip starts on the board's edge with six cells a
   unit across, as a water tile has, so the two meet vertex for vertex. */
function buildRiver(arms, water, ring) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: WATER_VERT, fragmentShader: WATER_FRAG,
    defines: { RING_HAZE: 1, RING_STEPS: HAZE_RINGS.length },
    uniforms: { ...water.uniforms, ...ring },
  });
  const pos = [], idx = [];
  for (const m of arms) {
    const edge = (m.along === "x" ? MW : MH) / 2, len = RIVER_REACH - edge, wid = m.hi - m.lo;
    const g = m.along === "x"
      ? new THREE.PlaneGeometry(len, wid, Math.ceil(len * RIVER_SEGS), Math.round(wid * 6))
      : new THREE.PlaneGeometry(wid, len, Math.round(wid * 6), Math.ceil(len * RIVER_SEGS));
    g.rotateX(-Math.PI / 2);
    const mid = m.sign * (edge + len / 2), across = (m.lo + m.hi) / 2;
    g.translate(m.along === "x" ? mid : across, RIVER_Y, m.along === "x" ? across : mid);
    const base = pos.length / 3;
    pos.push(...g.attributes.position.array);
    for (const i of g.index.array) idx.push(base + i);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return noOutline(new THREE.Mesh(geo, mat));
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

/* adds the dome, the lowland, the river's run out and the ridges to the
   scene. `haze` is the board's tile fog uniforms, for its colour; `wind`
   the board's wind, for the lowland's cloud; `water` the board's water
   material, for the river. follow() goes once a frame, after the
   director has placed the camera, shake included. */
export function createSky({ scene, sun, haze, wind, water }) {
  const ring = {
    uHazeColor: haze.uHazeColor,
    uRingHalf: { value: new THREE.Vector2(MW / 2, MH / 2) },
    uRingEdge: { value: HAZE_RINGS.map((r) => r[0]) },
    uRingHaze: { value: HAZE_RINGS.map((r) => r[1]) },
  };
  const arms = riverArms();
  const dome = buildDome();
  scene.add(dome, buildGround(arms, ring, wind), buildRiver(arms, water, ring), buildRidges(sun.position.clone().normalize()));
  return { follow(camera) { dome.position.copy(camera.position); } };
}
