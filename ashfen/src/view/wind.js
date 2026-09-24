/* wind: the grass and the tree canopies sway, and cloud shadows drift
   over the board. Everything the wind moves reads one uWind uniform, so it
   all agrees on which way the wind blows, and one uTime, the same seconds
   the other scene shaders get. Everything moves in the shaders. After
   mount the CPU writes one float a frame.

   uWind is (x, z, strength): a unit direction on the ground and a scale on
   every speed and reach in the wind GLSL, whose tunables sit at the top of
   shaders.js. Motion there is speed times time, so changing uWind at
   runtime would jump every cloud to wherever the new speed puts it. It is
   set once. Gusts come from the sway shader, not from here.

   None of this adds a render pass. The tree canopies swap their shadow
   material for one that sways, and the rest is a few lines spliced into
   shaders the board already runs. */

import * as THREE from "three";
import { SWAY_VERT, CLOUD_VERT, CLOUD_FRAG } from "./shaders.js";

const WIND_DIR = [1, -0.4];  // which way it blows, world x and z: left to right from the home pose, a little away from the camera
const WIND_STRENGTH = 1;     // scales every speed and reach in the wind GLSL
const CLOUD_TEX = 64;        // noise texture size, texels per side
const CLOUD_CELLS = 8;       // value noise cells across the texture; the second octave has twice as many

/* an integer hash in place of Math.random, so the sky is the same every
   launch, and a harness that seeds Math.random for pixel diffs sees every
   other random draw land exactly where it did before */
function hash(i, j, k) {
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
   `at`, rather than quietly shipping a board with no wind */
function splice(src, at, add) {
  if (!src.includes(at)) throw new Error(`wind.js: "${at}" is not in the shader`);
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

/* call once the board and the units are in the scene. Every lit solid in
   it takes the cloud shadow, and the props meshes.js flagged take the
   sway. Returns sway() for the outline normal material, and update(), once
   per frame with the scene shaders' time in seconds. */
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

  return {
    sway: (m) => patch(m, true, false),
    update(t) { uniforms.uTime.value = t; },
  };
}
