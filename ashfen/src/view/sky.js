/* the world past the board's edge: the sky, the lowland, the river's run
   out across it, the ridges, and the northern range with its volcano.

   The lowland is flush with the map's edge tiles, so the board is a piece
   of the land rather than something set on it, and it runs out under two
   rings of ridges. What makes the map the subject is fog: the lowland and
   the ridges haze by distance from the board's edge, at one rate, so the
   land recedes toward the hills with nothing going flat on the way (see
   GROUND_FOG_PARS in shaders.js). The board stays clear in the middle,
   and the ridges hide the lowland's rim from every pose. The orbit never
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
   shading baked into vertex colours, one flat colour per face. The dome
   takes no fog or cloud; the ridges take no cloud, and the fog round the
   map at their own distance, like the plain in front of them.

   The northern range is a fifth draw call and the volcano's smoke a sixth
   (wind.js owns the smoke, for its wind). The range starts at the board's
   north edge as an apron of settled ash, climbs through foothills to a
   ridge line, and bends south past the board's corners. The volcano
   stands out of it behind the keep's left, the reason for the ash. It is
   built like the ridges, one flat colour per face, and it keeps clear of
   every lens: the cut-in camera never goes more than about 2.3 units
   from the pair it frames, and the apron stays under it that far out. */

import * as THREE from "three";
import { MAP, MW, MH, CX, CZ, cell } from "../core/map.js";
import { SKY_VERT, skyFrag, WATER_VERT, WATER_FRAG, GROUND_FOG_PARS } from "./shaders.js";
import { noOutline, NO_OUTLINE_LAYER, SCORCH } from "./meshes.js";
import { hash, splice } from "./wind.js";

export const SKY_HORIZON = 0x9fc3d8; // the lowest band and everything under the horizon; also the clear colour the outline pass keeps
const SKY_ZENITH = 0x5b8ec4;         // the top band, a deeper blue
const SKY_EDGES = [2, 5, 9, 14];     // degrees above the horizon where each band above the lowest starts; the cut-in sees up to about 30
const SKY_RADIUS = 60;               // dome radius; the far plane never comes nearer than 80

const GROUND_Y = 0;                  // the lowland's height: flush with the map's edge tiles
const GROUND_RADIUS = 72;            // out past the far ring's ridge line, so every look below the ridges lands on ground
const GROUND = 0x6b8f4a;             // the lowland's grass, a little darker and duller than the board's plain so the board stays first
const GROUND_TUCK = 0.25;            // how far the lowland reaches in under the board's edge tiles, so no crack opens along the seam

const RIVER_REACH = 44;              // how far the river runs out from the board centre along its own axis: deep in the full fog, so its end is never seen
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
   mist: how far every face is mixed toward SKY_HORIZON before the fog round
   the map adds its own haze for the ring's distance. */
const RIDGES = [
  { radius: 46, wobble: 2, lean: 5, count: 48, low: 1.8, high: 4.4, mist: 0 },   // near: its distance gives it all the haze it needs
  { radius: 62, wobble: 2.7, lean: 8, count: 40, low: 4.0, high: 8.6, mist: 0.2 }, // far: a little more than its distance gives, so it sits back behind the near one
];

/* the northern range. It wraps the board's northern half: up the west
   side from just north of the river, round the north edge, and down the
   east side to the river again, so the river still runs out both ways.
   Its front is that edge of the board; columns stand along it, and each
   has a point at every entry of RANGE_ROWS, set that far out from the
   board along the edge's outward normal, fanning round the two corners.
   Heights are jittered per column between lo and hi, with a slow swell
   along the range so the skyline does not read as a saw, and they fall
   to the ground over the last RANGE_TAPER at each river end.

   The home view looks down at 48 degrees, so what it shows past the
   north edge is the apron and the foot of the slopes; the peaks and the
   volcano are for the cut-in and a zoomed-in look. On a wide screen the
   flanks beside the board stand in full view. */
const RANGE_STEP = 1;             // world units between columns along the straight edges
const RANGE_CORNER = 7;           // columns round each northern corner
const RANGE_RIVER = 1.2;          // how far north of the river's north bank the flanks end
const RANGE_TAPER = 3;            // world units along the front over which each flank falls to the ground at its river end
const RANGE_ROWS = [              // distance out from the board's edge, and the height range of that row
  { d: 0, lo: 0.02, hi: 0.02 },   // the front, on the board's edge, just over the lowland
  { d: 2.3, lo: 0.08, hi: 0.22 }, // the back of the ash apron, under any cut-in lens: the lens never gets 2.3 past the edge
  { d: 3.2, lo: 0.6, hi: 1.4 },   // the foot of the slopes
  { d: 4.4, lo: 1.4, hi: 2.5 },   // foothills
  { d: 6, lo: 2.1, hi: 3.5 },     // shoulders
  { d: 8, lo: 2.9, hi: 4.6 },     // upper slopes
  { d: 10.5, lo: 3.5, hi: 6 },    // the ridge line
];
/* ash and burnt earth spilled off each flank's river end. Every row of a
   flank stopped on the same line a little north of the river, rock and
   ash above it and a strip of green below, and from the home view that
   line ran straight across the frame on both sides of the board. Now the
   spill runs on from it toward the river bank in tongues, further here
   and shorter there, in patches of the apron's ash and the tiles' scorch,
   so the brown frays into the green instead of stopping on a rule. It
   lies flat, one colour per face, just over the lowland like the apron's
   front row. */
const SPILL_OUT = 10;             // world units out from the board's edge it runs, inside the flank's ridge line so its north edge stays under the rock
const SPILL_STEP = 0.5;           // world units between points along its ragged south edge
const SPILL_PATCH = 2.5;          // world units between the noise knots that shape its tongues and pick its colours
const SPILL_MIN = 0.15;           // the least share of the way to the bank it reaches; its tongues reach nearly all of it
const SPILL_Y = 0.01;             // its height over the lowland, under the apron front row's 0.02
const SPILL_BANK = 3;             // how far south it may run on a flank whose side has no river to stop it
/* and a few drifts of the same ash across the river on its south bank,
   beside the board, with green between them, so the river is not a
   second rule with brown on one side and green on the other */
const DRIFT_FROM = 0.8;           // world units out from the board's edge the drifts start, so green shows between them and the board's own green tiles
const DRIFT_OUT = 8;              // world units out from the board's edge the drifts run
const DRIFT_MAX = 3.5;            // world units south of the bank the longest drift reaches
const DRIFT_COVER = 0.45;         // share of the bank the drifts start from; the rest stays green
const SCORCH_SHADE = 0x4a3120;    // the spill's scorched patches turned from the sun, a shade under SCORCH
const ROCK_LIT = 0x5b554f;        // basalt turned full to the sun
const ROCK_SHADE = 0x2d2b2f;      // basalt turned away from it
const APRON_LIT = 0x625f59;       // settled ash turned to the sun, a shade under ASHFALL on the tiles in meshes.js
const APRON_SHADE = 0x46443f;     // settled ash turned away
/* the volcano: a cone of rings from its buried base to the crater rim,
   then the crater's inner wall down to its floor. It smokes and nothing
   more (the smoke is wind.js's); glowing lava runs down its face read
   badly and went, and so did the lava pool. */
const VOLCANO = { x: -3.5, z: -16, segs: 16 };  // its centre on the ground, behind the ridge line and left of the keep, and faces around it
const VOLCANO_RINGS = [           // radius and height of each ring, base first, then the rim and the floor's edge; the rim clears the ridge line's 6
  [6.5, 1.5], [4.4, 4.2], [2.6, 6.4], [1.5, 7.6], [1, 7],
];
const VOLCANO_LIT = 0x4f4945;     // its flanks turned to the sun, a little darker than the range
const VOLCANO_SHADE = 0x262325;   // turned away
const CRATER = 0x1d1a1b;          // the inside of the rim and the floor, which the sun never reaches

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
  // linear rgb per band; skyFrag writes them into the shader as literals
  const band = [];
  for (let i = 0; i < bands; i++) {
    const c = lerp3(lo, hi, i / (bands - 1));
    const lin = new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
    band.push([lin.r, lin.g, lin.b]);
  }
  const edge = SKY_EDGES.map((deg) => Math.sin(THREE.MathUtils.degToRad(deg)));
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: skyFrag(band, edge),
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

/* the fog round the map, spliced into one of three's lit materials the
   way tilefog.js splices its haze, for when post is off. With post on,
   uFogInShader is 0 and POST_FRAG fogs these pixels after the quantiser
   instead. `fog` holds the uniforms. Any patch already on the material
   runs first and keeps its cache key. */
function groundFog(m, fog) {
  const prevCompile = m.onBeforeCompile;
  // read before the patch below replaces onBeforeCompile, which three's default key is made from
  const key = m.customProgramCacheKey() + "|groundfog";
  m.onBeforeCompile = (sh, renderer) => {
    prevCompile.call(m, sh, renderer);
    Object.assign(sh.uniforms, fog);
    sh.vertexShader = splice(splice(sh.vertexShader, "#include <common>", "varying vec3 vFogP;"),
      "#include <fog_vertex>", "vFogP = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = splice(sh.fragmentShader, "#include <common>",
      `uniform vec3 uHazeColor; uniform float uFogInShader;\n${GROUND_FOG_PARS}\nvarying vec3 vFogP;`)
      .replace("#include <tonemapping_fragment>",
        "gl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeColor, uFogInShader * groundFog(vFogP));\n#include <tonemapping_fragment>");
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
   draw the rectangle the fog is meant to soften. The fog round the map
   also fades the clouds out with distance, where on a flat plain at one
   haze they made blotches all round the board. It stays on the outline
   layer: its channel walls take lines like the river's banks inside the
   board, and the flat disk has no creases. */
function buildGround(arms, fog, wind) {
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
  const mat = groundFog(new THREE.MeshLambertMaterial({
    vertexColors: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  }), fog);
  wind.cloud(mat);
  const ground = new THREE.Mesh(geo, mat);
  ground.receiveShadow = true;
  return ground;
}

/* the river's run out of the map: a strip of water down each arm, on the
   board's own water shader with GROUND_FOG defined, so it fogs out with
   the lowland. The uniforms are the board water's own objects, so uTime
   moves with it. Each strip starts on the board's edge with six cells a
   unit across, as a water tile has, so the two meet vertex for vertex.

   It is on the no-outline layer, off the normal pass like the board's
   water, but not noOutline: POST_FRAG fogs a pixel by rt's alpha, and
   noOutline would zero it and leave the river bright through the fog.
   Its alpha of 1 takes no stray lines: against its banks the water is
   the far side of every depth step, and water beside water has one
   normal, the normal pass's clear colour. */
function buildRiver(arms, water, fog) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: WATER_VERT, fragmentShader: WATER_FRAG,
    defines: { GROUND_FOG: 1 },
    uniforms: { ...water.uniforms, ...fog },
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
  const river = new THREE.Mesh(geo, mat);
  river.layers.set(NO_OUTLINE_LAYER);
  return river;
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
   fixes its winding for front-face culling. On top of that the fog round
   the map hazes each ridge for its distance, as it does the plain, so a
   ridge's foot matches the ground it stands on: POST_FRAG draws it after
   the quantiser, or with post off the material draws it itself. */
function buildRidges(sunDir, fog) {
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
  return noOutline(new THREE.Mesh(geo, groundFog(new THREE.MeshBasicMaterial({ vertexColors: true }), fog)));
}

/* the northern range and the volcano in one mesh, like the ridges: flat
   colours baked per face from how squarely each faces the sun, no lines,
   and the fog round the map at their distance. Only the south faces are
   built; the ridge line hides the rest from every lens. Returns the mesh
   and the crater's vent, for the smoke. */
function buildRange(sunDir, fog, arms) {
  const pos = [], col = [];
  const n = new THREE.Vector3(), e = new THREE.Vector3(), out = new THREE.Color();
  const face = (p, q, r, lit, shade) => {
    n.subVectors(q, p).cross(e.subVectors(r, p)).normalize();
    if (n.y < 0) { [q, r] = [r, q]; n.negate(); }
    const c = lerp3(srgb(shade), srgb(lit), THREE.MathUtils.clamp(n.dot(sunDir), 0, 1));
    out.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
    for (const v of [p, q, r]) { pos.push(v.x, v.y, v.z); col.push(out.r, out.g, out.b); }
  };
  // one colour whatever the sun, for the crater's inside; wound upward like the rest
  const flat = (p, q, r, hex) => {
    n.subVectors(q, p).cross(e.subVectors(r, p));
    if (n.y < 0) [q, r] = [r, q];
    out.set(hex);
    for (const v of [p, q, r]) { pos.push(v.x, v.y, v.z); col.push(out.r, out.g, out.b); }
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  /* the front: the board's edge from the west flank's river end, round
     the north, to the east flank's, as points with their outward normals
     and their distance along it */
  const hx = MW / 2, hz = MH / 2;
  const riverNorth = MAP.findIndex((row) => row.includes("~")) - CZ - 0.5;
  const southEnd = riverNorth - RANGE_RIVER;
  const front = [];
  const put = (x, z, nx, nz) => front.push({ x, z, nx, nz });
  const run = (x0, z0, x1, z1, nx, nz) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / RANGE_STEP));
    for (let i = 0; i < n; i++) put(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n, nx, nz);
  };
  const corner = (x, z, a0, a1) => {
    for (let i = 0; i < RANGE_CORNER; i++) {
      const a = a0 + (a1 - a0) * i / RANGE_CORNER;
      put(x, z, Math.cos(a), Math.sin(a));
    }
  };
  run(-hx, southEnd, -hx, -hz, -1, 0);
  corner(-hx, -hz, Math.PI, Math.PI * 1.5);
  run(-hx, -hz, hx, -hz, 0, -1);
  corner(hx, -hz, Math.PI * 1.5, Math.PI * 2);
  run(hx, -hz, hx, southEnd, 1, 0);
  put(hx, southEnd, 1, 0);
  let along = 0;
  front.forEach((f, i) => {
    if (i) along += Math.hypot(f.x - front[i - 1].x, f.z - front[i - 1].z) || 0.4;
    f.along = along;
  });

  // the range: a grid of columns by rows, two faces per cell, split on alternate diagonals
  const cols = front.length - 1;
  const cells = 9;
  const swell = (i) => {
    const u = (i / cols) * cells, k = Math.floor(u), f = u - k, s2 = f * f * (3 - 2 * f);
    const a = hash(k, 5, 21), b = hash(k + 1, 5, 21);
    return a + (b - a) * s2;
  };
  const grid = front.map((f, i) => {
    const taper = Math.min(1, f.along / RANGE_TAPER, (along - f.along) / RANGE_TAPER);
    return RANGE_ROWS.map((row, k) => {
      const t = k === 0 ? 0 : 0.55 * swell(i) + 0.45 * hash(i, 2 + k, 21);
      const peak = k === RANGE_ROWS.length - 1 && i % 2 === 0 ? 1 : 0.8;
      const y = k === 0 ? row.lo : row.lo * taper + (row.hi - row.lo) * t * peak * taper;
      const d = row.d + (k === 0 ? 0 : (hash(i, 9 + k, 21) - 0.5) * 0.5);
      return V(f.x + f.nx * d, y, f.z + f.nz * d);
    });
  });
  for (let i = 0; i < cols; i++) {
    for (let k = 0; k < RANGE_ROWS.length - 1; k++) {
      const a = grid[i][k], b = grid[i + 1][k], c = grid[i + 1][k + 1], d = grid[i][k + 1];
      const [lit, shade] = k === 0 ? [APRON_LIT, APRON_SHADE] : [ROCK_LIT, ROCK_SHADE];
      if ((i + k) % 2) { face(a, b, d, lit, shade); face(b, c, d, lit, shade); }
      else { face(a, b, c, lit, shade); face(a, c, d, lit, shade); }
    }
  }

  /* a frayed strip of ash lying south from the line z0, on side sx, from
     `from` to `out` along x beyond the board's edge. `reach(u, smooth, i)` says how far
     south it runs at u out from the board, and smooth is noise that rises
     and falls every SPILL_PATCH; a reach of 0 leaves green. Patches of it
     take the apron's ash or the tiles' scorch, also by the noise. */
  const fray = (sx, z0, from, out, seed, reach) => {
    const smooth = (u, j) => {
      const t = u / SPILL_PATCH, k = Math.floor(t), f = t - k, e = f * f * (3 - 2 * f);
      return hash(k, j, seed) + (hash(k + 1, j, seed) - hash(k, j, seed)) * e;
    };
    const n = Math.round((out - from) / SPILL_STEP);
    const edge = [];
    for (let i = 0; i <= n; i++) {
      const u = from + (out - from) * i / n;
      edge.push({ x: sx * (hx + u), z: z0 + reach(u, smooth, i), u });
    }
    for (let i = 0; i < n; i++) {
      const a = edge[i], b = edge[i + 1];
      if (a.z - z0 < 0.01 && b.z - z0 < 0.01) continue;
      const [lit, shade] = smooth((a.u + b.u) / 2, 34) < 0.5 ? [APRON_LIT, APRON_SHADE] : [SCORCH, SCORCH_SHADE];
      const p = V(a.x, SPILL_Y, z0), q = V(b.x, SPILL_Y, z0);
      face(p, q, V(b.x, SPILL_Y, b.z), lit, shade);
      face(p, V(b.x, SPILL_Y, b.z), V(a.x, SPILL_Y, a.z), lit, shade);
    }
  };
  for (const sx of [-1, 1]) {
    const arm = arms.find((m) => m.along === "x" && m.sign === sx);
    const seed = sx < 0 ? 41 : 43;
    // the spill, from the line the flank stops on toward the river's north bank
    const gap = (arm ? arm.lo : southEnd + SPILL_BANK) - southEnd;
    if (gap > 0.1) {
      fray(sx, southEnd, 0.02, SPILL_OUT, seed, (u, smooth, i) => {
        const share = SPILL_MIN + (1 - SPILL_MIN) * smooth(u, 31) + (hash(i, 32, seed) - 0.5) * 0.2;
        return gap * THREE.MathUtils.clamp(share, 0.08, 0.98) * Math.min(1, (SPILL_OUT - u) / 2 + 0.1);
      });
    }
    // the drifts, from the river's south bank on, with green between them
    if (arm) {
      fray(sx, arm.hi, DRIFT_FROM, DRIFT_OUT, seed + 1, (u, smooth) => {
        const share = (smooth(u, 36) - (1 - DRIFT_COVER)) / DRIFT_COVER;
        const ends = Math.min(1, (DRIFT_OUT - u) / 2, (u - DRIFT_FROM) / 1.5);
        return DRIFT_MAX * THREE.MathUtils.clamp(share, 0, 1) * ends;
      });
    }
  }

  // the volcano: rings of points around its centre, each jittered a little
  const { x: cx, z: cz, segs } = VOLCANO;
  const ring = VOLCANO_RINGS.map(([r, y], k) => Array.from({ length: segs }, (_, j) => {
    const ang = ((j + (hash(j, k, 23) - 0.5) * 0.3) / segs) * Math.PI * 2;
    const rr = r * (1 + (hash(j, k + 7, 23) - 0.5) * 0.12);
    return V(cx + Math.cos(ang) * rr, y + (k < 3 ? (hash(j, k + 14, 23) - 0.5) * 0.5 : 0), cz + Math.sin(ang) * rr);
  }));
  const RIM = 3, FLOOR = 4;
  for (let k = 0; k < RIM; k++) {
    for (let j = 0; j < segs; j++) {
      const j2 = (j + 1) % segs;
      face(ring[k][j], ring[k][j2], ring[k + 1][j2], VOLCANO_LIT, VOLCANO_SHADE);
      face(ring[k][j], ring[k + 1][j2], ring[k + 1][j], VOLCANO_LIT, VOLCANO_SHADE);
    }
  }
  const vent = V(cx, VOLCANO_RINGS[FLOOR][1], cz);
  for (let j = 0; j < segs; j++) {
    const j2 = (j + 1) % segs;
    flat(ring[RIM][j], ring[RIM][j2], ring[FLOOR][j2], CRATER);
    flat(ring[RIM][j], ring[FLOOR][j2], ring[FLOOR][j], CRATER);
    flat(vent, ring[FLOOR][j2], ring[FLOOR][j], CRATER);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const mesh = noOutline(new THREE.Mesh(geo, groundFog(new THREE.MeshBasicMaterial({ vertexColors: true }), fog)));
  return { mesh, vent };
}

/* adds the dome, the lowland, the river's run out and the ridges to the
   scene. `haze` is the board's tile fog uniforms, for its colour; `wind`
   the board's wind, for the lowland's cloud; `water` the board's water
   material, for the river. follow() goes once a frame, after the
   director has placed the camera, shake included; `post` says whether
   POST_FRAG is on to fog the lowland, or the lowland fogs itself. */
export function createSky({ scene, sun, haze, wind, water }) {
  const fog = {
    uHazeColor: haze.uHazeColor,
    uGroundHalf: { value: new THREE.Vector2(MW / 2, MH / 2) },
    uFogInShader: { value: 0 },
  };
  const arms = riverArms();
  const dome = buildDome();
  const sunDir = sun.position.clone().normalize();
  const range = buildRange(sunDir, fog, arms);
  scene.add(dome, buildGround(arms, fog, wind), buildRiver(arms, water, fog), buildRidges(sunDir, fog), range.mesh);
  wind.plume(range.vent);
  return {
    follow(camera, post) {
      dome.position.copy(camera.position);
      fog.uFogInShader.value = post ? 0 : 1;
    },
  };
}
