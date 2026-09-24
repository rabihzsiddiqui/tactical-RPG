/* wind: the grass and the tree canopies sway. Everything the wind moves
   reads one uWind uniform, so it all agrees on which way the wind blows,
   and one uTime, the same seconds the other scene shaders get. Everything
   moves in the shaders. After mount the CPU writes one float a frame.

   uWind is (x, z, strength): a unit direction on the ground and a scale on
   every speed and reach in the wind GLSL, whose tunables sit at the top of
   shaders.js. It is set once. Gusts come from the sway shader, not from
   here.

   None of this adds a render pass. The tree canopies swap their shadow
   material for one that sways, and the rest is a few lines spliced into
   shaders the board already runs. */

import * as THREE from "three";
import { SWAY_VERT } from "./shaders.js";

const WIND_DIR = [1, -0.4];  // which way it blows, world x and z: left to right from the home pose, a little away from the camera
const WIND_STRENGTH = 1;     // scales every speed and reach in the wind GLSL

/* adds `add` after `at`, and fails loudly if a three upgrade has renamed
   `at`, rather than quietly shipping a board with no wind */
function splice(src, at, add) {
  if (!src.includes(at)) throw new Error(`wind.js: "${at}" is not in the shader`);
  return src.replace(at, `${at}\n${add}`);
}

/* call once the board and the units are in the scene; the props meshes.js
   flagged take the sway. Returns sway() for the outline normal material,
   and update(), once per frame with the scene shaders' time in seconds. */
export function createWind({ scene }) {
  const dir = new THREE.Vector2(...WIND_DIR).normalize();
  const uniforms = {
    uWind: { value: new THREE.Vector3(dir.x, dir.y, WIND_STRENGTH) },
    uTime: { value: 0 },
  };

  /* splices the wind into one of three's own materials. The uniforms are
     shared objects, so one write in update() reaches every material. Like
     tileFog, it stacks: any patch already on the material runs first and
     keeps its cache key. The key is extended so the variants stay apart:
     three otherwise keys a patched program on the onBeforeCompile source,
     which is this one closure for all of them. */
  function patch(m) {
    if (m.userData.wind) return;
    m.userData.wind = true;
    const prevCompile = m.onBeforeCompile;
    // read before the patch below replaces onBeforeCompile, which three's default key is made from
    const key = m.customProgramCacheKey() + "|wind-sway";
    m.customProgramCacheKey = () => key;
    m.onBeforeCompile = (sh, renderer) => {
      prevCompile.call(m, sh, renderer);
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = splice(sh.vertexShader, "#include <common>", SWAY_VERT);
      sh.vertexShader = splice(sh.vertexShader, "#include <begin_vertex>", "transformed += windSway(transformed);");
    };
    /* a mesh with no aSway buffer reads the attribute's resting value.
       WebGL starts that at 0, but it is context state, not saved per
       mesh, so three is told to write 0 whenever it sets up a mesh that
       lacks the attribute. Only the outline normal material meets such
       meshes. Nothing else in the scene writes a resting value today; a
       ShaderMaterial drawn on a geometry with no uv or color would. */
    m.defaultAttributeValues = { ...m.defaultAttributeValues, aSway: [0] };
  }

  /* the tree canopies' shadow. The tufts keep three's plain depth
     material: their shadow falls mostly under the tuft itself. */
  const swayDepth = new THREE.MeshDepthMaterial();
  patch(swayDepth);

  /* clone() does not copy customDepthMaterial, so it goes on here, after
     every tree has been cloned from its proto. A unit's head carries an
     array of materials, one per face of the box, hence the concat. */
  scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      if (!m.userData.sway) continue;
      patch(m);
      if (m.userData.swayShadow) o.customDepthMaterial = swayDepth;
    }
  });

  return {
    sway: patch,
    update(t) { uniforms.uTime.value = t; },
  };
}
