/* wind: the grass and the tree canopies sway, cloud shadows drift over the
   board, ash falls through it, and smoke leans off the volcano to the
   north. All of them read one uWind uniform, so they agree on which way
   the wind blows, and one uTime, the same seconds
   the other scene shaders get. Everything moves in the shaders. After
   mount the CPU writes one float a frame.

   uWind is (x, z, strength): a unit direction on the ground and a scale on
   every speed and reach in the wind GLSL, whose tunables sit at the top of
   shaders.js. Motion there is speed times time, so changing uWind at
   runtime would jump every cloud and flake to wherever the new speed puts
   them. It is set once. Gusts come from the sway shader, not from here.

   None of this adds a render pass. The ash is one draw call and so is the
   smoke, the tree canopies swap their shadow material for one that sways,
   and the rest is a few lines spliced into shaders the board already
   runs. */

import * as THREE from "three";
import { MW, MH } from "../core/map.js";
import { SWAY_VERT, CLOUD_VERT, CLOUD_FRAG, ASH_VERT, ASH_FRAG, PLUME_VERT, PLUME_FRAG } from "./shaders.js";
import { noOutline } from "./meshes.js";

const WIND_DIR = [1, -0.4];  // which way it blows, world x and z: left to right from the home pose, a little away from the camera
const WIND_STRENGTH = 1;     // scales every speed and reach in the wind GLSL
const CLOUD_TEX = 64;        // noise texture size, texels per side
const CLOUD_CELLS = 8;       // value noise cells across the texture; the second octave has twice as many
const ASH_COUNT = 240;       // flakes in the whole volume; ASH_NORTH_BIAS in shaders.js crowds most of them north, so the board itself has far fewer than the old 320
const ASH_FLOOR = -0.4;      // bottom of the ash volume, just under the river bed
const ASH_CEIL = 3.2;        // top of the ash volume, well above anything standing on the board
const ASH_MARGIN = 0.5;      // how far the volume reaches past the board's south edge
const ASH_SIDE = 2.5;        // how far it reaches past the east and west edges, out over the range's flanks
const ASH_NORTH = 5.5;       // how far it reaches past the north edge, over the ash apron to the foothills
const PLUME_COUNT = 56;      // puffs in the volcano's smoke
const PLUME_DARK = 0x2b2826; // a new puff, near the vent
const PLUME_PALE = 0x8d8781; // an old puff, thinning downwind
const ASH_GREY = 0xc9c6bf;   // most flakes
const ASH_EMBER = 0xff8a3c;  // the ember share, ASH_EMBERS in shaders.js

/* an integer hash in place of Math.random, so the sky and the ash are the
   same every launch, and a harness that seeds Math.random for pixel diffs
   sees every other random draw land exactly where it did before. sky.js
   lays out the ridges with it for the same reason. */
export function hash(i, j, k) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* tileable value noise, two octaves. Wrapping the lattice index at the
   cell count is what makes the texture tile. Linear filtering and no
   mipmaps: CLOUD_FRAG thresholds it, and the bilinear contour is what
   gives the cloud edge its shape. */
function cloudTexture() {
  const N = CLOUD_TEX, data = new Uint8Array(N * N);
  const octave = (x, y, cells, seed) => {
    const gx = (x / N) * cells, gy = (y / N) * cells;
    const i = Math.floor(gx), j = Math.floor(gy);
    const fx = gx - i, fy = gy - j;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const v = (a, b) => hash(a % cells, b % cells, seed);
    const top = v(i, j) + (v(i + 1, j) - v(i, j)) * sx;
    const bot = v(i, j + 1) + (v(i + 1, j + 1) - v(i, j + 1)) * sx;
    return top + (bot - top) * sy;
  };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const n = octave(x, y, CLOUD_CELLS, 1) * 0.7 + octave(x, y, CLOUD_CELLS * 2, 2) * 0.3;
      data[y * N + x] = Math.round(n * 255);
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/* adds `add` after `at`, and fails loudly if a three upgrade has renamed
   `at`, rather than quietly shipping a board with no wind. sky.js patches
   the lowland's haze in with it too. */
export function splice(src, at, add) {
  if (!src.includes(at)) throw new Error(`shader patch: "${at}" is not in the shader`);
  return src.replace(at, `${at}\n${add}`);
}

/* three's own light loop with two additions: the cloud is read once, and
   multiplied into the shadow-casting directional light, which is the sun.
   three sorts shadow casters to the front, and the sun is the only one on
   the board. Built at import, so a renamed chunk throws on load. */
const SUN_LINE = "getDirectionalLightInfo( directionalLight, directLight );";
const LIGHTS_WITH_CLOUD = "float cloud = cloudSun();\n" + splice(
  THREE.ShaderChunk.lights_fragment_begin, SUN_LINE,
  "#if UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS\n  directLight.color *= cloud;\n#endif"
);

/* see ASH_VERT. Transparent so it draws after the solids: it writes no
   depth, and in the opaque pass anything drawn after a flake would paint
   straight over it. renderOrder 1 puts it after the units too, which
   live in the transparent pass for their fades, so a flake in front of a
   fighter in a cut-in stays in front. The health bars and bursts sit at
   10 and up, over it. noOutline keeps the flakes out of the normal pass
   and zeroes the outline mask under each one. */
function buildAsh(uniforms) {
  const pos = new Float32Array(ASH_COUNT * 3), seed = new Float32Array(ASH_COUNT);
  for (let i = 0; i < ASH_COUNT; i++) {
    pos.set([hash(i, 1, 7), hash(i, 2, 7), hash(i, 3, 7)], i * 3);
    seed[i] = hash(i, 4, 7);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const w = MW + ASH_SIDE * 2, d = MH + ASH_MARGIN + ASH_NORTH;
  const mat = new THREE.ShaderMaterial({
    vertexShader: ASH_VERT, fragmentShader: ASH_FRAG,
    uniforms: {
      uWind: uniforms.uWind, uTime: uniforms.uTime,
      uBoxMin: { value: new THREE.Vector3(-w / 2, ASH_FLOOR, -MH / 2 - ASH_NORTH) },
      uBoxSize: { value: new THREE.Vector3(w, ASH_CEIL - ASH_FLOOR, d) },
      uGrey: { value: new THREE.Color(ASH_GREY) },
      uEmber: { value: new THREE.Color(ASH_EMBER) },
    },
    transparent: true, depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; // the stored positions are seeds, not places
  pts.renderOrder = 1;
  return noOutline(pts);
}

/* the volcano's smoke, see PLUME_VERT. Puffs start out of step with each
   other by their seed, so the column is always full. Transparent for its
   thinning puffs, and like the ash it writes no depth and takes no lines.
   uViewH is read off whatever target it is drawn into, just before it is
   drawn, since the post pass renders at a lower resolution than the
   canvas and a puff's width is in world units. */
function buildPlume(uniforms, vent) {
  const pos = new Float32Array(PLUME_COUNT * 3), seed = new Float32Array(PLUME_COUNT);
  for (let i = 0; i < PLUME_COUNT; i++) {
    pos.set([hash(i, 1, 11) * 2 - 1, 0, hash(i, 3, 11) * 2 - 1], i * 3);
    seed[i] = (i + hash(i, 4, 11) * 0.5) / PLUME_COUNT;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: PLUME_VERT, fragmentShader: PLUME_FRAG,
    uniforms: {
      uWind: uniforms.uWind, uTime: uniforms.uTime,
      uVent: { value: vent.clone() },
      uViewH: { value: 240 },
      uDark: { value: new THREE.Color(PLUME_DARK) },
      uPale: { value: new THREE.Color(PLUME_PALE) },
    },
    transparent: true, depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; // the stored positions are offsets from the vent, not places
  pts.renderOrder = 1;
  const size = new THREE.Vector2();
  pts.onBeforeRender = (renderer) => {
    const t = renderer.getRenderTarget();
    mat.uniforms.uViewH.value = t ? t.height : renderer.getDrawingBufferSize(size).y;
  };
  return noOutline(pts);
}

/* call once the board and the units are in the scene. Every lit solid in
   it takes the cloud shadow, and the props meshes.js flagged take the
   sway. Returns sway() for the outline normal material, cloud() for a lit
   solid built later, and update(), once per frame with the scene shaders'
   time in seconds. */
export function createWind({ scene, sun }) {
  const dir = new THREE.Vector2(...WIND_DIR).normalize();
  const uniforms = {
    uWind: { value: new THREE.Vector3(dir.x, dir.y, WIND_STRENGTH) },
    uTime: { value: 0 },
    uCloud: { value: cloudTexture() },
    uSunDir: { value: sun.position.clone().normalize() },
  };

  /* splices the wind into one of three's own materials. The uniforms are
     shared objects, so one write in update() reaches every material. Like
     tileFog, it stacks: any patch already on the material runs first and
     keeps its cache key. The key is extended so the variants stay apart:
     three otherwise keys a patched program on the onBeforeCompile source,
     which is this one closure for all of them, and a plain prop could be
     handed a swaying program. */
  function patch(m, sway, cloud) {
    if (m.userData.wind) return;
    m.userData.wind = true;
    const prevCompile = m.onBeforeCompile;
    // read before the patch below replaces onBeforeCompile, which three's default key is made from
    const key = m.customProgramCacheKey() + `|wind${sway ? "-sway" : ""}${cloud ? "-cloud" : ""}`;
    m.customProgramCacheKey = () => key;
    m.onBeforeCompile = (sh, renderer) => {
      prevCompile.call(m, sh, renderer);
      Object.assign(sh.uniforms, uniforms);
      let v = sh.vertexShader, f = sh.fragmentShader;
      if (sway) {
        v = splice(v, "#include <common>", SWAY_VERT);
        v = splice(v, "#include <begin_vertex>", "transformed += windSway(transformed);");
      }
      if (cloud) {
        v = splice(v, "#include <common>", CLOUD_VERT);
        v = splice(v, "#include <project_vertex>", "vCloudW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
        f = splice(f, "#include <common>", CLOUD_FRAG);
        f = f.replace("#include <lights_fragment_begin>", LIGHTS_WITH_CLOUD);
      }
      sh.vertexShader = v;
      sh.fragmentShader = f;
    };
    /* a mesh with no aSway buffer reads the attribute's resting value.
       WebGL starts that at 0, but it is context state, not saved per
       mesh, so three is told to write 0 whenever it sets up a mesh that
       lacks the attribute. Only the outline normal material meets such
       meshes. Nothing else in the scene writes a resting value today; a
       ShaderMaterial drawn on a geometry with no uv or color would. */
    if (sway) m.defaultAttributeValues = { ...m.defaultAttributeValues, aSway: [0] };
  }

  /* the tree canopies' shadow. The tufts keep three's plain depth
     material: their shadow falls mostly under the tuft itself. */
  const swayDepth = new THREE.MeshDepthMaterial();
  patch(swayDepth, true, false);

  /* the same set tileFog hazes: the terrain, the props and the units.
     Overlays sit on the no-outline layer alone and are skipped, as are
     the water and the falls, which light themselves. clone() does not
     copy customDepthMaterial, so it goes on here, after every tree has
     been cloned from its proto. A unit's head carries an array of
     materials, one per face of the box, hence the concat. */
  scene.traverse((o) => {
    if (!o.isMesh || !o.layers.isEnabled(0)) return;
    for (const m of [].concat(o.material)) {
      if (!m.isMeshLambertMaterial && !m.isMeshStandardMaterial) continue;
      patch(m, !!m.userData.sway, true);
      if (m.userData.swayShadow) o.customDepthMaterial = swayDepth;
    }
  });

  // after the traverse, which has no business with the flakes
  scene.add(buildAsh(uniforms));

  return {
    sway: (m) => patch(m, true, false),
    // for a lit solid added after the traverse above: sky.js's lowland
    cloud: (m) => patch(m, false, true),
    // the volcano's smoke, rising from `vent`, a world position; sky.js calls it, last, for the seeded draws
    plume: (vent) => scene.add(buildPlume(uniforms, vent)),
    update(t) { uniforms.uTime.value = t; },
  };
}
