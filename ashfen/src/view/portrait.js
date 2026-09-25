/* unit portraits for the html layer. Each unit is built fresh from its own
   palette and class, lit by a small rig of its own, rendered once into an
   sRGB target on the board's renderer and kept as a data url for the unit
   panel (ui/UnitHud.jsx) and the forecast (ui/Forecast.jsx). Nothing here
   runs per frame, and there is no extra pass to switch off: the panels
   only ever read the cache.

   Players face right and enemies face left, so the forecast, which puts
   the player on the left, has the two looking at each other. The light
   rig mirrors with the turn, so the lit side is always the face.

   Keyed by palette, class and facing, which is everything buildUnitMesh
   draws above the belt plus the turn, so the two brigands share one
   render and a restart reuses the lot. The weapon is hidden: at rest a
   lance or a staff rises past the face, and the panels show the weapon on
   a row of their own.

   A dark rim is traced round the figure after the render, because a unit
   can wear its own team's colour: Kaelen's blue tunic ran straight into
   the blue behind his face. */

import * as THREE from "three";
import { buildUnitMesh } from "./meshes.js";

const PORTRAIT_PX = 112;     // rendered side, square; the panel shows it at 56 css px, so a 2x screen gets a pixel each
const PORTRAIT_FOV = 18;     // degrees; a long lens keeps the head box from bulging toward the camera
const PORTRAIT_AIM_Y = 0.72; // height the camera looks level at, in the unit's frame: the eyes sit at 0.66 to 0.73
const PORTRAIT_SPAN = 0.6;   // world units of height in frame at the unit, chest to just over a plume
const PORTRAIT_YAW = 0.45;   // radians the unit turns off the lens, toward screen right for a player and screen left for an enemy
const PORTRAIT_LIGHTS = {
  ambient: { color: 0x93a9c6, intensity: 1.55 },               // the board's ambient fill, so a face keeps the palette it has on the map
  key: { color: 0xfff0d4, intensity: 1.8, pos: [-1.5, 2, 3] }, // the sun's colour, brought round in front and to the lit side of the face; x as for a face turned left
  rim: { color: 0x86a4d8, intensity: 0.8, pos: [2, 1, -2] },   // the bounce light's colour, from behind on the shaded side; x as for a face turned left
};

const PORTRAIT_RIM = 3;                   // px of dark rim round the figure in the 112px render, 1.5 css px in the panel
const PORTRAIT_RIM_RGBA = [8, 10, 15, 235]; // the rim's colour: near C.table, near opaque, as dark as the panels' own edges

const cache = new Map();
const facesRight = (u) => u.team === "player";

/* every offset within PORTRAIT_RIM of a pixel, as [dx, dy], nearest first
   so a rim pixel usually finds the figure on its first few looks */
const RIM_REACH = [];
for (let dy = -PORTRAIT_RIM; dy <= PORTRAIT_RIM; dy++) {
  for (let dx = -PORTRAIT_RIM; dx <= PORTRAIT_RIM; dx++) {
    const d2 = dx * dx + dy * dy;
    if (d2 > 0 && d2 <= PORTRAIT_RIM * PORTRAIT_RIM) RIM_REACH.push([dx, dy, d2]);
  }
}
RIM_REACH.sort((a, b) => a[2] - b[2]);

/* paints the rim into `data`, a PORTRAIT_PX square of RGBA: every clear
   pixel within reach of the figure. The render has no antialiasing, so
   each pixel is either figure or clear, and the mask is read before any
   rim is painted so the rim never grows off itself. Runs once per
   portrait, at mount. */
function traceRim(data) {
  const N = PORTRAIT_PX;
  const solid = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) solid[i] = data[i * 4 + 3] > 0 ? 1 : 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (solid[y * N + x]) continue;
      for (const [dx, dy] of RIM_REACH) {
        const X = x + dx, Y = y + dy;
        if (X >= 0 && X < N && Y >= 0 && Y < N && solid[Y * N + X]) {
          data.set(PORTRAIT_RIM_RGBA, (y * N + x) * 4);
          break;
        }
      }
    }
  }
}
const keyOf = (u) => u.pal + "|" + u.cls + "|" + (facesRight(u) ? "r" : "l");

/* the portrait for a unit, or null if renderPortraits has not reached it */
export function portraitOf(u) {
  return cache.get(keyOf(u)) || null;
}

/* renders every unit in `units` that has no portrait yet. scene.js calls
   this once, last thing before its loop starts: three draws Math.random
   for every uuid, and building these any earlier would move the seeded
   draws the pixel-diff harness depends on. The renderer's target and
   clear colour are put back as they were. */
export function renderPortraits(renderer, units) {
  const todo = units.filter((u) => !cache.has(keyOf(u)));
  if (!todo.length) return;

  const scene = new THREE.Scene();
  const L = PORTRAIT_LIGHTS;
  scene.add(new THREE.AmbientLight(L.ambient.color, L.ambient.intensity));
  const lights = [L.key, L.rim].map((l) => {
    const d = new THREE.DirectionalLight(l.color, l.intensity);
    scene.add(d);
    return { d, pos: l.pos };
  });
  const cam = new THREE.PerspectiveCamera(PORTRAIT_FOV, 1, 0.1, 10);
  cam.position.set(0, PORTRAIT_AIM_Y, PORTRAIT_SPAN / 2 / Math.tan(THREE.MathUtils.degToRad(PORTRAIT_FOV) / 2));
  cam.lookAt(0, PORTRAIT_AIM_Y, 0);

  /* render targets always come out in linear light, but an sRGB one is
     stored as SRGB8_ALPHA8, so the GPU encodes on write and the bytes read
     back are already what a canvas expects. The board's own rt works the
     same way. */
  const rt = new THREE.WebGLRenderTarget(PORTRAIT_PX, PORTRAIT_PX, { colorSpace: THREE.SRGBColorSpace });
  const px = new Uint8Array(PORTRAIT_PX * PORTRAIT_PX * 4);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = PORTRAIT_PX;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(PORTRAIT_PX, PORTRAIT_PX);
  const row = PORTRAIT_PX * 4;

  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  for (const u of todo) {
    const key = keyOf(u);
    if (cache.has(key)) continue;
    const v = buildUnitMesh(u.pal, u.weaponKey, u.cls);
    v.parts.weapon.visible = false;
    // +1 turns the face toward screen right, and the lights come round with it
    const side = facesRight(u) ? 1 : -1;
    v.root.rotation.y = side * PORTRAIT_YAW;
    for (const { d, pos } of lights) d.position.set(-side * pos[0], pos[1], pos[2]);
    scene.add(v.root);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, PORTRAIT_PX, PORTRAIT_PX, px);
    // gl rows run bottom up, a canvas's top down
    for (let y = 0; y < PORTRAIT_PX; y++) {
      img.data.set(px.subarray(y * row, (y + 1) * row), (PORTRAIT_PX - 1 - y) * row);
    }
    traceRim(img.data);
    ctx.putImageData(img, 0, 0);
    cache.set(key, canvas.toDataURL());
    scene.remove(v.root);
    v.root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    for (const m of v.mats) { m.map?.dispose(); m.dispose(); }
  }
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  rt.dispose();
}
