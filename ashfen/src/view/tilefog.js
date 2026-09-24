/* tile-stepped haze. The distance fog came out because its per-pixel ramp
   met the posteriser in POST_FRAG and left contour bands lying across the
   board (see the fog comment in scene.js). This brings the depth back in a
   form the quantiser cannot band: every surface takes one haze amount from
   how far the camera is from the centre of the tile it belongs to. One
   value per tile is one value per face, and every step lands on a tile
   edge.

   Two ways to find the tile. The terrain works it out per fragment, from
   the fragment's world position nudged a hundredth inward along the face
   normal, so a wall resolves to the tile it hangs from and not the lower
   neighbour it faces. Everything else passes an anchor, one world position
   shared by all of an object's materials: a prop's origin, set once, or a
   unit's root, copied in every frame. The shader snaps the anchor to its
   tile, so a whole unit, weapon included, takes one value and steps when
   its root crosses a tile edge.

   The tile centre is taken at ground level, y 0, whatever the tile's
   height. It only has to be the same point for everything on that tile.

   The mix goes in before three's output encode, in linear light like the
   lighting itself, so post on and post off agree. Three's own fog mixes
   after the encode, which is one more reason not to reuse it. */

import * as THREE from "three";
import { CX, CZ } from "../core/map.js";

const HAZE_COLOR = 0x9fc3d8; // what the far board mixes toward: the sky, so distance reads as sinking into it
const HAZE_MAX = 0.15;       // the most any tile is mixed toward it, reached at HAZE_FAR and beyond; light, since the fog round the map does the framing
const HAZE_NEAR = -2.4;      // haze starts this far nearer than the look target: the near row at the reference pose
const HAZE_FAR = 4.1;        // and peaks this far past it: the far row at the reference pose
const HAZE_CINE_NEAR = 0.5;  // in a cut-in it starts this far past the look target instead, just behind the fighters' tiles
const HAZE_NUDGE = 0.01;     // how far a terrain fragment steps in along its normal before it picks a tile

/* the uniforms every hazed material shares. scene.js keeps one of these and
   moves near and far with updateTileFog every frame. */
export function createTileFog() {
  return {
    uHazeColor: { value: new THREE.Color(HAZE_COLOR) },
    uHazeNear: { value: 0 },
    uHazeFar: { value: 1 },
    uHazeMax: { value: HAZE_MAX },
    uHazeOffset: { value: new THREE.Vector2(CX, CZ) },
  };
}

/* near and far are measured from the camera's distance to what it is
   looking at, not fixed in world units. From the orbit that is the board
   centre, so the haze spans the board at any zoom and any window shape.
   In a cut-in it is the fighters, a couple of units away, so the board
   behind them reaches full haze within a few tiles. Fixed values would
   leave the whole board clear in a cut-in, since every tile is nearer
   than the orbit's near row.

   The near edge moves with the director's mix. From the orbit it sits in
   front of the look target, so the near half of the board grades too. In
   a cut-in the look target is the fighters, and the same offset hazed
   them as much as the board centre, so there it moves just behind them. */
export function updateTileFog(fog, lookDist, mix) {
  fog.uHazeNear.value = lookDist + HAZE_NEAR + (HAZE_CINE_NEAR - HAZE_NEAR) * mix;
  fog.uHazeFar.value = lookDist + HAZE_FAR;
}

const PARS = /* glsl */ `
uniform vec3 uHazeColor;
uniform float uHazeNear;
uniform float uHazeFar;
uniform float uHazeMax;
uniform vec2 uHazeOffset;
`;

/* patches a Lambert or Standard material in place and returns it. With no
   anchor it is the terrain's per-fragment version; with one, `anchor` is a
   { value: Vector3 } uniform in world space. Call before the first render.
   Any patch already on the material runs first and keeps its cache key,
   so this stacks with other shader patches rather than replacing them. */
export function tileFog(material, fog, anchor = null) {
  const prevCompile = material.onBeforeCompile;
  // read before the patch below replaces onBeforeCompile, which three's default key is made from
  const key = material.customProgramCacheKey() + (anchor ? "|tilefog-anchor" : "|tilefog-tile");
  material.onBeforeCompile = (shader, renderer) => {
    prevCompile.call(material, shader, renderer);
    Object.assign(shader.uniforms, fog);
    if (anchor) shader.uniforms.uHazeAnchor = anchor;
    else {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vHazeP;")
        .replace("#include <fog_vertex>", `#include <fog_vertex>
          vHazeP = (modelMatrix * vec4(transformed - ${HAZE_NUDGE.toFixed(3)} * objectNormal, 1.0)).xyz;`);
    }
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>${PARS}${anchor ? "uniform vec3 uHazeAnchor;" : "varying vec3 vHazeP;"}`)
      .replace("#include <tonemapping_fragment>", `{
          vec2 hazeTile = floor(${anchor ? "uHazeAnchor" : "vHazeP"}.xz + uHazeOffset + 0.5) - uHazeOffset;
          float hazeD = distance(cameraPosition, vec3(hazeTile.x, 0.0, hazeTile.y));
          float hazeK = clamp((hazeD - uHazeNear) / (uHazeFar - uHazeNear), 0.0, 1.0);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeColor, uHazeMax * hazeK);
        }
        #include <tonemapping_fragment>`);
  };
  // the two versions compile differently, and three would otherwise key them both on the same function source
  material.customProgramCacheKey = () => key;
  return material;
}

/* a prop: a tree, a bush, the keep, a bridge. Their protos share materials
   between every copy, so each prop gets its own clones, all reading one
   anchor at the prop's origin. Anchoring each mesh at its own origin
   instead would split a prop: a bridge's rails sit on the tile edges past
   its deck, and a bush's outer blades hang off tufts near the rim. Call
   after the prop is positioned, as a direct child of the scene. */
export function tileFogProp(obj, fog) {
  const anchor = { value: obj.position.clone() };
  const clones = new Map();
  obj.traverse((o) => {
    if (!o.isMesh) return;
    if (!clones.has(o.material)) {
      // clone() copies userData but not a shader patch, so carry any over
      const c = o.material.clone();
      c.onBeforeCompile = o.material.onBeforeCompile;
      c.customProgramCacheKey = o.material.customProgramCacheKey;
      clones.set(o.material, tileFog(c, fog, anchor));
    }
    o.material = clones.get(o.material);
  });
  return obj;
}
