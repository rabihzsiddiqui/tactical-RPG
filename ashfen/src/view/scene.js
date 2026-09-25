/* SECTION 8: scene, loop, game flow

   M3: the rules (turn state, combat resolution, enemy AI orchestration)
   now live in ../core/game.js as synchronous functions that return
   { state, events }. This module is the *player* of those events: it
   applies the returned state to `g` and animates each event against the
   live three.js scene. See applyResolve/playEvents below. */

import * as THREE from "three";
import { MW, MH, CX, CZ, cell, lvlH, walkable } from "../core/map.js";
import { ROSTER, makeUnit } from "../core/data.js";
import { routeTo, reachTiles } from "../core/path.js";
import { wep, forecastOf } from "../core/combat.js";
import { threatSet } from "../core/ai.js";
import { K, man, clamp, sleep } from "../core/util.js";
import {
  resolveMove, resolveAttack, resolveHeal, resolveItem, resolveWait,
  endPlayerPhase, runEnemyPhase,
} from "../core/game.js";
import {
  buildTerrain, buildUnitMesh, buildTree, buildBush, buildKeep, buildBridge, buildHealthBar, buildShoreField, HP_BAR_W,
  NO_OUTLINE_LAYER, noOutline, outlineBlend, fadeOutline,
} from "./meshes.js";
import {
  POST_VERT, POST_FRAG, TILE_VERT, TILE_FRAG, RING_FRAG, WATER_VERT, WATER_FRAG,
} from "./shaders.js";
import { tween, stepTweens, resetTweens, hitStop, easeOutCubic, easeInOutQuad } from "./anim.js";
import { createDirector } from "./camera.js";
import { createAttackPlayer, CARRY } from "./attacks.js";
import { createEffects } from "./effects.js";
import { createTileFog, updateTileFog, tileFog, tileFogProp } from "./tilefog.js";
import { createWind } from "./wind.js";
import { createSky, SKY_HORIZON } from "./sky.js";
import { renderPortraits } from "./portrait.js";
import { C } from "../ui/theme.js";
import {
  playUnitSelect, playActionSelect, playBack, playCritHit, playMiss, playNoDamage, playDeath,
  playFinalHit, playLevelUp, playAttackHit, playHeal, playPlayerPhase, playEnemyPhase as playEnemyPhaseSfx,
  playVictory, playThreatCheck, playZoomIn, playDefeat, stopMusic,
} from "./audio.js";

/* the ready stance's weapon.rotation.x. CARRY holds the weapon across the
   hand; this cants it forward off the knuckles so the blade, haft or
   staff rises in front of the shoulder rather than over it. */
const READY_WEP = 1.05;

/* orbit zoom, in world units of vertical frame coverage: the map is 10
   tiles deep, so 22 sees the whole field with room to spare and 4.5 is
   about two tiles, close enough to read a unit's face. The wheel and the
   pinch both scale the current value rather than adding to it, so a notch
   moves the same apparent amount whether the camera is near or far. */
const ZOOM_MIN = 4.5, ZOOM_MAX = 22, ZOOM_STEP = 1.18;

/* the board's bounding box, in world units around the orbit target, with a
   little padding for the health bars and rings that hang off a unit. The
   floor of the river is -0.35 and a unit standing on the keep tops out
   near 1.7, the keep's own 0.6 plus a body. fitDist() below keeps this box
   inside the frame; a yHi left at the old mound's 2.5 just pushed the
   default zoom out over empty sky. */
const BOARD = { x: MW / 2 + 0.3, z: MH / 2 + 0.3, yLo: -0.6, yHi: 1.9 };

/* every light on the board, tuned for this map specifically. If a second
   map ever ships, this becomes a per-map parameter handed to mountScene
   rather than a shared constant.
   The cut-in key light and the impact flare belong to camera.js and
   effects.js and are not in here. */
const LIGHTS = {
  ambient: { color: 0x93a9c6, intensity: 1.55 },                  // flat fill, the same on every face whichever way it points
  sun: { color: 0xfff0d4, intensity: 1.55, pos: [7, 12, 6] },     // the key light and the only shadow caster
  bounce: { color: 0x86a4d8, intensity: 0.8, pos: [-6, 3, -7] },  // cool fill on the faces turned away from the sun
  shadowType: THREE.PCFShadowMap,                                 // filtering for the sun's shadow map
  shadowMapSize: 1024,                                            // shadow map resolution, square
  shadowExtent: 11,                                               // half-width of the sun's shadow camera, enough to cover the board
  shadowNear: 1, shadowFar: 40,                                   // depth range of the sun's shadow camera
  shadowBias: -0.0012, shadowNormalBias: 0.02,                    // acne against peter-panning on flat-shaded faces
};

export const RES = [
  { label: "400x240 (3DS)", h: 240 },
  { label: "640x384", h: 384 },
  { label: "960x576", h: 576 },
  { label: "native", h: 0 },
];

export function newGame() {
  return {
    units: ROSTER.map(makeUnit),
    turn: 1, phase: "player", status: "playing",
    sel: null, danger: false, inspect: null, forecast: null,
    /* the attack cut-in in progress, or null. { srcId, tgtId, kind, f,
       closing }: `f` is the forecast at the moment the camera flew in,
       `closing` flips true for the fly-out so the HUD can fade while the
       world bars come back. See playEvents. */
    cutIn: null,
    /* n:-1 is a sentinel meaning "no banner shown yet". App.jsx sets the
       real first banner from the title card's Begin button, in the same
       click that unlocks audio, so the sting and the banner's entrance
       animation land together instead of the banner having already played
       out silently behind the title card before the player ever sees it. */
    levelUp: null, banner: { text: "", side: "player", n: -1 },
    log: ["Turn 1 begins."],
    tutorial: true, // cleared on first selection (or turn 1 ending, whichever first); see select()/startEnemyPhase()
  };
}

/* mounts the three.js scene into `mount`, wires input and the game flow,
   and returns a cleanup function. `menuRef`, `forecastRef` and `apiRef` are
   React refs so the frame loop and the api object stay live across renders. */
export function mountScene({ mount, menuRef, forecastRef, g, camRef, setCam, setFloats, tick, apiRef }) {
  /* ---- renderer ---- */
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = LIGHTS.shadowType;
  mount.appendChild(renderer.domElement);
  const cv = renderer.domElement;
  Object.assign(cv.style, {
    width: "100%", height: "100%", display: "block",
    imageRendering: "pixelated", cursor: "grab", touchAction: "none",
  });

  const scene = new THREE.Scene();
  /* no scene.background: the sky dome (sky.js) paints every pixel of the
     colour pass. The outline normal pass does not draw the dome, and it
     still clears to the old flat sky, which the crease test in POST_FRAG
     was written against. */
  renderer.setClearColor(SKY_HORIZON);
  /* no distance fog, and the board is darker for it. A linear fog ramps
     every ground pixel toward the sky colour by camera distance, and the
     posteriser downstream cut that ramp into contour bands lying straight
     across the board, holding still while you orbited because they belong
     to the camera and not to the map. Removing the ramp is the only fix
     that leaves no trace; dithering the quantiser also works but lays a
     chequer over every flat surface.

     Do not read this as the fog having been decorative. Fog(0x9fc3d8,
     16, 40) mixes toward the *sky*, which is far brighter than any
     terrain tone, so it was working as a brightener more than as a haze:
     it lifted the back of the board from about 37 to 64 out of 255 and
     the middle from 29 to 43, and that front-to-back ramp was most of
     what read as depth. The near edge barely moved. So the board now
     sits darker and flatter than it used to, deliberately.

     If that wants correcting, correct it in the palette, not here. Tile
     colour is constant per face, so lightening TYPES in core/map.js (or
     giving it a per-row ramp) cannot band. Ambient is a weak lever by
     comparison: 1.55 to 2.2 moves the far band only 37 to 40, because
     what was lost is a gradient and ambient lifts everything evenly.

     All of those numbers were measured before POST_FRAG had an sRGB
     encode, when the canvas showed linear light and the board sat far
     darker than its palette. The encode lifted it; the palette was never
     as dark as this comment used to say.

     The front-to-back depth is back as haze stepped per tile, which the
     quantiser cannot band: one value per tile, so one per face, with
     every step on a tile edge. See tilefog.js. */
  const camera = new THREE.PerspectiveCamera(30, 1.6, 0.5, 120);
  /* overlays live on their own layer so the outline normal pass can leave
     them out by switching it off; see noOutline in meshes.js */
  camera.layers.enable(NO_OUTLINE_LAYER);

  /* the lights; values in LIGHTS at the top of this file */
  scene.add(new THREE.AmbientLight(LIGHTS.ambient.color, LIGHTS.ambient.intensity));
  const sun = new THREE.DirectionalLight(LIGHTS.sun.color, LIGHTS.sun.intensity);
  sun.position.set(...LIGHTS.sun.pos);
  sun.castShadow = true;
  sun.shadow.mapSize.set(LIGHTS.shadowMapSize, LIGHTS.shadowMapSize);
  const ext = LIGHTS.shadowExtent;
  Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: LIGHTS.shadowNear, far: LIGHTS.shadowFar });
  sun.shadow.bias = LIGHTS.shadowBias;
  sun.shadow.normalBias = LIGHTS.shadowNormalBias;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);
  const bounce = new THREE.DirectionalLight(LIGHTS.bounce.color, LIGHTS.bounce.intensity);
  bounce.position.set(...LIGHTS.bounce.pos);
  scene.add(bounce);

  /* ---- world ---- */
  /* the haze uniforms every solid shares: the terrain, the props and the
     units. Water and the overlays stay clear of it. */
  const haze = createTileFog();
  const ground = new THREE.Mesh(buildTerrain(), tileFog(new THREE.MeshLambertMaterial({ vertexColors: true }), haze));
  ground.receiveShadow = true;
  ground.castShadow = true;
  scene.add(ground);

  /* the water. WATER_FRAG places its foam by reading the shore field, a
     distance-to-land texture over the map, so uOrigin/uSize are what turn
     a world position back into a lookup into it. The surface rolls in the
     vertex stage, hence the subdivided tile plane: a flat quad would only
     move at its corners. */
  const shore = buildShoreField();
  const waterMat = new THREE.ShaderMaterial({
    vertexShader: WATER_VERT, fragmentShader: WATER_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uShore: { value: shore.tex },
      uOrigin: { value: new THREE.Vector2(CX + 0.5, CZ + 0.5) },
      uSize: { value: new THREE.Vector2(MW, MH) },
      uRange: { value: shore.range },
      uSun: { value: sun.position.clone().normalize() },
    },
  });
  const waterGeo = new THREE.PlaneGeometry(1, 1, 6, 6);

  const pickGeo = new THREE.PlaneGeometry(1, 1);
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });
  const pickables = [];
  const treeProto = buildTree();
  const bushProto = buildBush();

  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      const t = cell(x, y);
      if (t.water) {
        const wp = new THREE.Mesh(waterGeo, waterMat);
        wp.rotation.x = -Math.PI / 2;
        wp.position.set(x - CX, -0.1, y - CZ);
        /* off the normal pass: the override material cannot reproduce
           the swell, and the shoreline reads from depth alone */
        scene.add(noOutline(wp));
      }
      if (t.bridge && (x === 0 || !cell(x - 1, y).bridge)) {
        // build one span covering the whole run of adjacent bridge tiles in
        // this row, rather than one independently-railed deck per tile
        let w = 1;
        while (x + w < MW && cell(x + w, y).bridge) w++;
        const b = buildBridge(w);
        b.position.set(x - CX + (w - 1) / 2, 0, y - CZ);
        scene.add(tileFogProp(b, haze));
      }
      if (t.tree || t.bush) {
        /* same jitter for both, so neither sits dead centre on its tile.
           The bush takes a smaller offset: it is low and wide enough that
           a big one would hang over the tile edge onto plain ground. */
        const proto = t.tree ? treeProto : bushProto;
        const off = t.tree ? 0.2 : 0.08;
        const tr = proto.clone(true);
        tr.position.set(x - CX + (Math.random() - 0.5) * off, t.h, y - CZ + (Math.random() - 0.5) * off);
        tr.rotation.y = Math.random() * 6.28;
        tr.scale.setScalar(0.85 + Math.random() * 0.3);
        scene.add(tileFogProp(tr, haze));
      }
      if (t.keep) {
        const k = buildKeep();
        k.position.set(x - CX, t.h, y - CZ);
        scene.add(tileFogProp(k, haze));
      }
      if (walkable(x, y)) {
        const p = new THREE.Mesh(pickGeo, pickMat);
        p.rotation.x = -Math.PI / 2;
        p.position.set(x - CX, lvlH(x, y) + 0.01, y - CZ);
        p.userData.tile = { x, y };
        scene.add(p);
        pickables.push(p);
      }
    }
  }

  /* ---- overlays ---- */
  const mkTileMat = (hex) => outlineBlend(new THREE.ShaderMaterial({
    vertexShader: TILE_VERT, fragmentShader: TILE_FRAG,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(hex) } },
    transparent: true, depthWrite: false,
  }));
  const matMove = mkTileMat(0x5ea8ff);
  const matAtk = mkTileMat(0xff6b60);
  const matHeal = mkTileMat(0x5fc25a);
  const matThreat = mkTileMat(0xd8484f);
  const hlGeo = new THREE.PlaneGeometry(0.99, 0.99);
  const pool = [];
  for (let i = 0; i < MW * MH * 2; i++) {
    const m = new THREE.Mesh(hlGeo, matMove);
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    scene.add(noOutline(m));
    pool.push(m);
  }
  let poolUsed = 0;
  const claim = (x, y, mat, lift) => {
    const m = pool[poolUsed++];
    if (!m) return;
    m.visible = true;
    m.material = mat;
    m.position.set(x - CX, lvlH(x, y) + (lift || 0.03), y - CZ);
  };
  const releaseAll = () => {
    pool.forEach((m) => (m.visible = false));
    poolUsed = 0;
  };

  const ringMat = new THREE.ShaderMaterial({
    vertexShader: TILE_VERT, fragmentShader: RING_FRAG,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xffe073) } }, transparent: true, depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(noOutline(ring));

  /* blue "hasn't acted yet" ring, one per unit, shown/hidden by
     syncUnitVisuals, distinct from the single reused gold selection ring */
  const readyRingMat = new THREE.ShaderMaterial({
    vertexShader: TILE_VERT, fragmentShader: RING_FRAG,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x5ea8ff) } }, transparent: true, depthWrite: false,
  });

  /* a small self-illumination so units read distinctly against the terrain
     regardless of light angle. The map stays unlit-by-this, only characters
     get it. flash() restores to this instead of black. */
  const POP_EMISSIVE = 0x1c1a16;

  /* ---- unit views ---- */
  for (const u of g.units) {
    const v = buildUnitMesh(u.pal, u.weaponKey, u.cls);
    v.root.position.set(u.x - CX, lvlH(u.x, u.y), u.y - CZ);
    /* everyone starts facing south, toward the camera. Yaw 0 is south and
       Math.PI is north, the same mapping the "face" event uses below.
       Enemies used to spawn at Math.PI, which pointed them off the top of
       the board, away from the company they are there to fight. */
    v.root.rotation.y = 0;
    scene.add(v.root);
    u.view = v;
    u.anim = { state: "idle", phase: Math.random() * 6.28, targetYaw: v.root.rotation.y, walk: null, offset: new THREE.Vector3() };
    /* 0..1, how much of this unit the cut-in is letting you see. Only the
       veil tween in playEvents moves it; everything else reads it. */
    v.veil = 1;
    /* units live in the transparent pass from the start, at full opacity.
       three.js bakes `transparent` into the compiled shader program, so a
       material switched to transparent after it has compiled keeps writing
       alpha 1 and every later opacity change silently does nothing: that
       is why the death fade and the cut-in veil never actually showed.
       Flipping it at runtime instead would mean a recompile per material
       in the middle of an exchange, the same hitch the cut-in key light is
       added at mount to avoid. Setting it here, before the first render,
       costs nothing and every fade afterwards is one uniform. */
    v.mats.forEach((m) => { m.transparent = true; fadeOutline(m); });
    /* one haze anchor for the whole unit, weapon included, copied from the
       root every frame, so it steps as the unit crosses a tile edge */
    v.haze = { value: new THREE.Vector3() };
    v.mats.forEach((m) => tileFog(m, haze, v.haze));
    v.mats.forEach((m) => {
      if (!m.emissive) return;
      m.emissive.setHex(POP_EMISSIVE);
      m.userData.baseEmissive = POP_EMISSIVE;
    });

    /* green for the company, red for whoever is shooting at it, so a
       glance at the board tells you whose bar is whose */
    const hpBar = buildHealthBar(u.team === "player" ? 0x5fc25a : 0xd94f45);
    scene.add(hpBar.group);
    u.view.hpBar = hpBar;

    const readyRing = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.05), readyRingMat);
    readyRing.rotation.x = -Math.PI / 2;
    readyRing.visible = false;
    scene.add(noOutline(readyRing));
    u.view.readyRing = readyRing;
  }

  /* ---- wind ----
     see wind.js. Created here, after the board and the units, because it
     patches materials already in the scene, on top of the haze. The sun
     sets the angle cloud shadows fall at. */
  const wind = createWind({ scene, sun });

  /* ---- post ---- */
  /* the depth texture feeds the outlines in POST_FRAG. It is the same 24
     bits the plain depth buffer was, so nothing z-fights differently.
     setSize disposes the target and three reallocates the depth texture at
     the new size on the next render.

     The colour is stored sRGB encoded: the GPU encodes on write and decodes
     on read, so every shader on either side still sees linear light, but the
     8 bits are spent where the eye can tell them apart. Linear light in a
     plain 8-bit target bands the darks as soon as the posteriser lets go in
     the cut-in. Alpha, the outline mask, is not encoded. */
  const rt = new THREE.WebGLRenderTarget(400, 240, {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat, colorSpace: THREE.SRGBColorSpace,
    depthBuffer: true, depthTexture: new THREE.DepthTexture(400, 240),
  });
  /* the outline normal pass: the solids again, each drawn as its view-space
     normal. Flat shaded so a crease is a crease: the trees, bushes and keep
     are flat shaded in colour but carry smooth vertex normals. Only
     rendered while outlines are on, and released when they go off. */
  const normalRT = new THREE.WebGLRenderTarget(400, 240, {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true,
  });
  const normalMat = new THREE.MeshNormalMaterial({ flatShading: true });
  /* the grass and canopies sway in the colour pass, so they sway here too.
     Otherwise the depth edges would follow the blades and the creases
     would stay where the blades were. */
  wind.sway(normalMat);
  const sunDir = sun.position.clone().normalize();
  let lastOutlines = false;
  const postScene = new THREE.Scene();
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const postMat = new THREE.ShaderMaterial({
    vertexShader: POST_VERT, fragmentShader: POST_FRAG,
    uniforms: {
      tDiffuse: { value: rt.texture }, uLevels: { value: 32 }, uVignette: { value: 0.04 }, uRush: { value: 0 },
      uOutline: { value: 0 }, tDepth: { value: rt.depthTexture }, tNormal: { value: normalRT.texture },
      uTexel: { value: new THREE.Vector2(1 / 400, 1 / 240) }, uTan: { value: new THREE.Vector2(1, 1) },
      uNear: { value: 0.5 }, uFar: { value: 120 }, uSun: { value: new THREE.Vector3() },
      /* the map's outline and the fog round it: the camera's world matrix
         to work world positions back from depth, the board's half size,
         and the haze colour the fog ends at */
      uCamWorld: { value: new THREE.Matrix4() }, uGroundHalf: { value: new THREE.Vector2(MW / 2, MH / 2) },
      uFogColor: haze.uHazeColor,
    },
    depthTest: false,
  });
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));

  let VW = 640, VH = 420, lastRes = -1;
  function applyRes() {
    const p = RES[camRef.current.res];
    lastRes = camRef.current.res;
    const h = p.h === 0 ? VH : p.h;
    const w = Math.max(64, Math.round(h * (VW / VH))), rh = Math.max(48, h);
    rt.setSize(w, rh);
    normalRT.setSize(w, rh);
    postMat.uniforms.uTexel.value.set(1 / w, 1 / rh);
  }
  function resize() {
    const r = mount.getBoundingClientRect();
    VW = Math.max(240, Math.floor(r.width));
    VH = Math.max(220, Math.floor(r.height));
    renderer.setSize(VW, VH, false);
    applyRes();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(mount);
  resize();

  /* ---- camera director ----
     tween() itself lives in anim.js now, shared with camera.js. The
     director owns final camera placement: frame() computes the orbit pose
     from the cam state into `orbit` every tick and hands it over, and the
     director either passes it straight through or blends it toward the
     attack cut-in. See playEvents for when a cut-in starts. */
  const director = createDirector({ isEnabled: () => camRef.current.cinematics !== false, scene });

  /* ---- attack beats and their effects ----
     one beat per weapon type, see attacks.js. The player adds its two
     projectile meshes to the scene once and reuses them. effects.js owns
     the trail, burst, flare and motes the same way; frame() steps them
     after animUnit so they see this frame's poses. */
  const effects = createEffects({ scene });
  const attacks = createAttackPlayer({ scene, director, effects });
  const orbit = { pos: new THREE.Vector3(), target: new THREE.Vector3(0, 0.4, 0), fov: 30 };

  /* ---- screen projection ---- */
  const tmp = new THREE.Vector3();
  function project(u, lift) {
    tmp.set(u.view.root.position.x, u.view.root.position.y + (lift ?? 1.0), u.view.root.position.z);
    tmp.project(camera);
    return { x: ((tmp.x + 1) / 2) * VW, y: ((-tmp.y + 1) / 2) * VH };
  }

  let floatId = 0;
  function floater(u, text, color) {
    const p = project(u, 1.1);
    const id = ++floatId;
    setFloats((f) => [...f, { id, ...p, text, color }]);
    setTimeout(() => setFloats((f) => f.filter((z) => z.id !== id)), 900);
  }

  /* ---- unit animation ---- */
  function animUnit(u, dt) {
    const a = u.anim, p = u.view.parts, root = u.view.root;
    if (u.hp <= 0) {
      u.view.hpBar.group.visible = false;
      u.view.readyRing.visible = false;
      return;
    }

    if (a.state === "walk" && a.walk) {
      a.phase += dt * 9.5;
      const s = Math.sin(a.phase);
      p.legL.rotation.x = s * 0.8;
      p.legR.rotation.x = -s * 0.8;
      p.armL.rotation.x = -s * 0.55;
      p.armR.rotation.x = s * 0.55;
      p.armR.rotation.z = 0;
      p.weapon.rotation.x = CARRY;
      p.body.position.y = Math.abs(Math.cos(a.phase)) * 0.035;

      const W = a.walk;
      W.t += dt * 3.6;
      const k = Math.min(1, W.t);
      const h0 = lvlH(W.from.x, W.from.y), h1 = lvlH(W.to.x, W.to.y);
      /* a step up or down onto a hill gets a small hop over it. The
         threshold tracks the shallowest real step in map.js, a hill at
         0.3, so it has to sit under that rather than on it. */
      const arc = Math.abs(h1 - h0) > 0.1 ? Math.sin(k * Math.PI) * 0.09 : 0;
      root.position.set(
        W.from.x + (W.to.x - W.from.x) * k - CX,
        h0 + (h1 - h0) * k + arc,
        W.from.y + (W.to.y - W.from.y) * k - CZ
      );
      const dx = W.to.x - W.from.x, dy = W.to.y - W.from.y;
      a.targetYaw = dx > 0 ? Math.PI / 2 : dx < 0 ? -Math.PI / 2 : dy > 0 ? 0 : Math.PI;
      if (k >= 1) {
        u.x = W.to.x; u.y = W.to.y;
        W.path.shift();
        if (W.path.length) {
          W.from = { x: u.x, y: u.y };
          W.to = W.path[0];
          W.t = 0;
        } else {
          const done = W.done;
          a.walk = null;
          a.state = "idle";
          done && done();
        }
      }
    } else if (a.state === "attack") {
      /* attacks.js owns every part while a beat plays; only position,
         offset and yaw below are still ours */
    } else if (a.state === "ready") {
      /* guard stance. The old pose swung the arm up and across the chest
         (rotation.x -2.15, rotation.z -0.3), which parked the blade
         inside the unit's own head: the hand ended up at head height and
         inboard of the shoulder, and anything long in the hand went up
         through the skull. Now the elbow goes out instead of up, the
         weapon is canted forward off the hand, and the whole span sits
         forward of the face at every length from a sword to a lance. */
      a.phase += dt * 3;
      p.legL.rotation.x = 0.16;
      p.legR.rotation.x = -0.16;
      p.armR.rotation.x = -0.45 + Math.sin(a.phase) * 0.04;
      p.armR.rotation.z = 0.26;
      p.armL.rotation.x = 0.22;
      p.weapon.rotation.x = READY_WEP;
      p.body.position.y = 0.015 + Math.sin(a.phase) * 0.01;
    } else {
      a.phase += dt * 1.9;
      const s = Math.sin(a.phase);
      p.legL.rotation.x = 0;
      p.legR.rotation.x = 0;
      p.armL.rotation.x = s * 0.07;
      p.armR.rotation.x = -s * 0.07;
      p.armR.rotation.z = 0;
      p.weapon.rotation.x = CARRY;
      p.body.position.y = s * 0.014;
    }

    if (a.state !== "walk") {
      root.position.set(u.x - CX, lvlH(u.x, u.y), u.y - CZ);
    }
    root.position.add(a.offset);

    let d = a.targetYaw - root.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    root.rotation.y += d * Math.min(1, dt * 12);

    /* the bar is a billboard: it copies the camera's rotation so its face
       is always square to the lens, then slides down its own local y,
       which is screen-down, so it sits under the feet on screen from any
       orbit angle. A world offset would drift out from under the unit as
       the camera turned. Hidden during a cut-in, where the battle HUD
       shows the same numbers, and back the moment the camera lets go. */
    const bar = u.view.hpBar.group;
    bar.visible = (!g.cutIn || g.cutIn.closing) && u.view.veil > 0.5;
    bar.position.set(root.position.x, lvlH(u.x, u.y) + 0.12, root.position.z);
    bar.quaternion.copy(camera.quaternion);
    bar.translateY(-0.34);
    u.view.hpBar.fill.scale.x = Math.max(0.001, HP_BAR_W * (u.hp / u.maxHp));
    u.view.readyRing.position.set(root.position.x, lvlH(u.x, u.y) + 0.05, root.position.z);
    if (g.tutorial && u.lord) {
      const pulse = 1 + Math.sin(performance.now() / 260) * 0.22;
      u.view.readyRing.scale.setScalar(pulse);
    } else {
      u.view.readyRing.scale.setScalar(1);
    }
  }

  function faceToward(u, t) {
    const dx = t.x - u.x, dy = t.y - u.y;
    u.anim.targetYaw = Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? Math.PI / 2 : -Math.PI / 2)
      : (dy > 0 ? 0 : Math.PI);
  }

  function walkPath(u, path, from = { x: u.x, y: u.y }) {
    return new Promise((res) => {
      u.anim.state = "walk";
      u.anim.walk = { path: path.slice(), from, to: path[0], t: 0, done: res };
    });
  }

  function flash(u, crit) {
    const hex = crit ? 0xffd45a : 0xff5a5a;
    u.view.mats.forEach((m) => m.emissive && m.emissive.setHex(hex));
    setTimeout(() => u.view.mats.forEach((m) => m.emissive && m.emissive.setHex(m.userData.baseEmissive ?? 0)), crit ? 260 : 160);
  }

  /* slides a unit `amount` tiles along (dx, dz) and eases it back: out in
     the first quarter, home over the rest. Recoil on a hit, a lean away
     on a miss. It is a tween, so one queued at the frame of contact waits
     out the hit-stop and starts the moment the freeze lifts. Skipped on
     any frame the unit's own beat owns its offset, which can happen when
     a counter starts while the recoil is still settling. */
  function nudge(u, dx, dz, amount, ms) {
    return tween(ms, (k) => {
      if (u.anim.state === "attack") return;
      const s = k < 0.25 ? easeOutCubic(k / 0.25) : 1 - easeInOutQuad((k - 0.25) / 0.75);
      u.anim.offset.set(dx * amount * s, 0, dz * amount * s);
    });
  }

  async function die(u) {
    await tween(420, (k) => {
      u.view.root.position.y = lvlH(u.x, u.y) - k * 0.5;
      u.view.mats.forEach((m) => (m.opacity = 1 - k));
    });
    u.view.root.visible = false;
  }

  /* ---- selection helpers ---- */
  function paintSel() {
    releaseAll();
    const s = g.sel;
    if (g.danger) {
      for (const k of threatSet(g.units)) {
        const [x, y] = k.split(",").map(Number);
        claim(x, y, matThreat, 0.025);
      }
    }
    if (!s) { ring.visible = false; return; }
    const u = g.units.find((z) => z.id === s.id);
    const isHealer = wep(u).staff;
    if (s.mode === "move") {
      const rangeMat = isHealer ? matHeal : matAtk;
      for (const k of s.atk) {
        if (s.stand.has(k)) continue;
        const [x, y] = k.split(",").map(Number);
        claim(x, y, rangeMat, 0.032);
      }
      for (const k of s.stand) {
        const [x, y] = k.split(",").map(Number);
        claim(x, y, matMove, 0.035);
      }
    } else if (s.mode === "target" || s.mode === "targetHeal") {
      for (const id of s.targets) {
        const t = g.units.find((z) => z.id === id);
        if (t) claim(t.x, t.y, s.mode === "target" ? matAtk : matHeal, 0.04);
      }
    }
    ring.visible = true;
    ring.position.set(u.x - CX, lvlH(u.x, u.y) + 0.05, u.y - CZ);
  }

  function validTargets(u) {
    const w = wep(u);
    const out = [];
    for (const o of g.units) {
      if (o.hp <= 0) continue;
      const d = man(u.x, u.y, o.x, o.y);
      if (d < w.rmin || d > w.rmax) continue;
      if (w.staff) {
        if (o.team === u.team && o.id !== u.id && o.hp < o.maxHp) out.push(o.id);
      } else if (o.team !== u.team) out.push(o.id);
    }
    return out;
  }

  /* the type check validTargets applies per-candidate, split out so the
     click-to-engage bypass below can test a single unit before it moves */
  function isValidTargetType(u, o) {
    if (o.hp <= 0) return false;
    const w = wep(u);
    return w.staff ? o.team === u.team && o.id !== u.id && o.hp < o.maxHp : o.team !== u.team;
  }

  /* cheapest stand tile (by move cost) that's within weapon range of `target`,
     so a direct click on an enemy/ally can move-then-engage in one step */
  function findEngageTile(u, s, target) {
    if (!isValidTargetType(u, target)) return null;
    const w = wep(u);
    let best = null;
    for (const k of s.stand) {
      const [sx, sy] = k.split(",").map(Number);
      const d = man(sx, sy, target.x, target.y);
      if (d < w.rmin || d > w.rmax) continue;
      const cost = s.dist.get(k) ?? Infinity;
      if (!best || cost < best.cost) best = { x: sx, y: sy, cost };
    }
    return best;
  }

  const alive = (t) => g.units.filter((u) => u.team === t && u.hp > 0);

  /* reconstructs the exact core-owned state slice from `g` on every call,
     so core/game.js never sees sel/inspect/forecast/danger/banner/levelUp */
  const coreState = () => ({ units: g.units, turn: g.turn, phase: g.phase, status: g.status, log: g.log });

  /* a unit's on-screen alpha is the cut-in veil and nothing else. Having
     acted used to drop a player unit to 0.55 as well, but a translucent
     soldier reads as a ghost or a rendering fault rather than as a turn
     already spent, and it fought with the veil for the same channel. The
     blue ring below already carries that state: it is lit under everyone
     who can still move, so its absence is what marks a unit as done. */
  function applyUnitAlpha(u) {
    const a = u.view.veil;
    u.view.mats.forEach((m) => { m.opacity = a; });
    /* the blue "hasn't acted" ring is its own mesh on the ground, so it
       would otherwise stay lit under a unit that has faded out. It is
       restored by the syncUnitVisuals call after the veil comes back. */
    if (u.view.veil < 1) u.view.readyRing.visible = false;
  }

  /* replaces the per-unit dim (acted) / restore (fresh turn) and the blue
     "hasn't acted yet" ring, both driven off the same acted flag */
  function syncUnitVisuals() {
    for (const u of g.units) {
      if (u.hp <= 0) continue;
      applyUnitAlpha(u);

      const isSelected = g.sel && g.sel.id === u.id;
      u.view.readyRing.visible = g.phase === "player" && g.status === "playing"
        && u.team === "player" && !u.acted && !isSelected;
    }
  }

  /* applies a { state, events } result from core/game.js. Every unit field
     except hp/x/y lands immediately; those are held back to their
     pre-resolve values and written by whichever move/strike/heal event
     actually reveals them, so the HP bar drains and units walk
     progressively instead of jumping to the end state. `status` is held
     back until every event has finished playing, so a win/lose overlay
     never covers a still-animating death.

     x/y needs the same treatment as hp for the same reason: runEnemyPhase
     resolves the *entire* enemy phase in one synchronous pass, so
     state.units already holds every acting enemy's final tile before
     playEvents has animated so much as the first one's move. Without
     holding position back, animUnit's idle-pose branch (which snaps
     straight to u.x/u.y every frame) renders every later-acting enemy at
     its destination for the frame(s) before its own "move" event reaches
     walkPath, a visible teleport-then-walk-back. */
  async function applyResolve({ state, events }) {
    const prev = new Map(g.units.map((u) => [u.id, { hp: u.hp, x: u.x, y: u.y }]));
    g.units = state.units.map((u) => {
      const p = prev.get(u.id);
      return p ? { ...u, hp: p.hp, x: p.x, y: p.y } : u;
    });
    await playEvents(events);
    g.turn = state.turn;
    g.phase = state.phase;
    g.status = state.status;
    g.log = state.log;
    syncUnitVisuals();
    tick();
  }

  /* an exchange arrives as a flat run of strike events (attack, counter,
     double), and flying the camera in and out per strike would be
     unwatchable. So this scans ahead for the contiguous run, flies in once
     before it, plays the whole run inside the cut-in, and flies out once
     after. A death or levelUp directly after the run stays inside it so a
     kill lands on camera.

     The run is also bounded by the pair of units involved. runEnemyPhase
     concatenates every enemy's events, so if two enemies were already
     adjacent to their targets their strikes would sit back to back with no
     move event between them, and one cut-in framing the first pair would
     hold through the second pair's exchange off camera.

     A staff heal gets the same treatment as a one-event run, so the staff
     beat plays from the cut-in camera like every other weapon. Instant
     heals (vulnerary, terrain) stay out: nothing animates for them. */
  function exchangeEnd(events, i) {
    const first = events[i];
    const isStrike = first.type === "strike";
    if (!isStrike && !(first.type === "heal" && !first.instant)) return i;
    const pair = new Set([first.srcId, first.tgtId]);
    let j = i + 1;
    while (j < events.length) {
      const e = events[j];
      if (isStrike && e.type === "strike" && pair.has(e.srcId) && pair.has(e.tgtId)) j++;
      else if (e.type === "death" && pair.has(e.unitId)) j++;
      else if (e.type === "levelUp" && pair.has(e.unitId)) j++;
      else break;
    }
    return j;
  }

  const VEIL_RADIUS = 0.55;  // tiles from the shot line before a unit counts as in the way
  const VEIL_END = 0.15;     // keeps the two fighters themselves out of the test
  const VEIL_OUT_MS = 220;   // finishes inside the 300ms fly-in
  const VEIL_IN_MS = 260;

  /* the units standing on the line a projectile is about to fly down.
     Measured flat, since a projectile's arc is vertical and only its
     ground track can run into a bystander, and against tile coordinates
     rather than live mesh positions, which are mid-animation here.

     There is no check for whether the weapon is ranged: a melee exchange
     happens between neighbouring tiles, so there is no room between them
     for anyone to stand and this comes back empty on its own. */
  function inTheWay(src, tgt) {
    const dx = tgt.x - src.x, dz = tgt.y - src.y;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-6) return [];
    return g.units.filter((u) => {
      if (u === src || u === tgt || u.hp <= 0 || !u.view) return false;
      const t = ((u.x - src.x) * dx + (u.y - src.y) * dz) / len2;
      if (t <= VEIL_END || t >= 1 - VEIL_END) return false;
      const ox = src.x + dx * t - u.x, oz = src.y + dz * t - u.y;
      return ox * ox + oz * oz < VEIL_RADIUS * VEIL_RADIUS;
    });
  }

  /* fades a set of units to `to` over `ms`. Runs alongside the camera fly
     rather than before it, so the bystanders clear the shot on the way in
     and are back by the time the board is on screen again. */
  function veilTo(units, to, ms) {
    if (!units.length) return Promise.resolve();
    const from = units.map((u) => u.view.veil);
    return tween(ms, (k) => {
      units.forEach((u, i) => {
        u.view.veil = from[i] + (to - from[i]) * k;
        applyUnitAlpha(u);
      });
    });
  }

  async function playEvents(events) {
    let i = 0;
    while (i < events.length) {
      const end = exchangeEnd(events, i);
      if (end > i && director.enabled) {
        const first = events[i];
        const src = g.units.find((z) => z.id === first.srcId);
        const tgt = g.units.find((z) => z.id === first.tgtId);
        /* the battle HUD reads this. The forecast is taken once, here,
           before any strike lands: the numbers on the panel are the odds
           the exchange was rolled against, and they stay put while the
           HP drains under them. A heal has no forecast, the panel shows
           the amount instead. */
        g.cutIn = {
          srcId: src.id, tgtId: tgt.id, kind: first.type, closing: false,
          f: first.type === "strike" ? forecastOf(src, tgt) : null,
          amount: first.type === "heal" ? first.amount : 0,
        };
        tick();
        /* the rush of the camera getting there. Fired beside flyIn rather
           than inside it, so camera.js stays camera work only, and from
           inside this branch so the cinematics toggle silences the sound
           along with the move it belongs to. The sample outlasts the 300ms
           fly on purpose: it carries its tail over the first strikes. */
        playZoomIn();
        /* who stands on the left of the frame. A heal reads as the healer
           acting on someone, so the staff user takes the left; a strike
           reads from the company's side, so the player's unit takes it,
           whether it is the one swinging or the one being swung at. Two
           enemies never fight each other, so the last term is only ever a
           fallback. */
        const leftIsSource = first.type === "heal" || src.team === "player" || tgt.team !== "player";
        const blocked = inTheWay(src, tgt);
        await Promise.all([
          director.flyIn(src, tgt, { leftIsSource }),
          veilTo(blocked, 0, VEIL_OUT_MS),
        ]);
        let crit = false;
        for (; i < end; i++) {
          crit = crit || (events[i].type === "strike" && events[i].hit && events[i].crit);
          await playEvent(events[i]);
        }
        /* a crit earns a held beat before the camera lets go */
        if (crit) await sleep(280);
        g.cutIn.closing = true;
        tick();
        await Promise.all([director.flyOut(), veilTo(blocked, 1, VEIL_IN_MS)]);
        /* the veil is back at 1, so this is what relights the ready rings
           applyUnitAlpha put out */
        if (blocked.length) syncUnitVisuals();
        g.cutIn = null;
        tick();
      } else {
        await playEvent(events[i++]);
      }
    }
  }

  async function playEvent(e) {
    switch (e.type) {
      case "move": {
        const u = g.units.find((z) => z.id === e.unitId);
        if (e.path.length) await walkPath(u, e.path, e.from);
        break;
      }
      case "face": {
        const u = g.units.find((z) => z.id === e.unitId);
        u.anim.targetYaw = { e: Math.PI / 2, w: -Math.PI / 2, s: 0, n: Math.PI }[e.dir];
        break;
      }
      case "strike": {
        const src = g.units.find((z) => z.id === e.srcId);
        const tgt = g.units.find((z) => z.id === e.tgtId);
        faceToward(src, tgt);
        const crit = e.hit && e.crit;
        const mt = wep(src).mt;
        /* attacker-to-target on the ground, for the recoil and the dodge */
        const ddx = tgt.x - src.x, ddz = tgt.y - src.y;
        const dl = Math.hypot(ddx, ddz) || 1;
        /* the beat owns the attacker from windup to recovery and fires
           onImpact at the frame of contact, so the feedback below lands
           on the hit rather than after the whole motion */
        await attacks.play(src, tgt, {
          hit: e.hit, crit,
          onImpact: () => {
            if (!e.hit) {
              floater(tgt, "miss", C.parchDim);
              playMiss();
              nudge(tgt, ddx / dl, ddz / dl, 0.16, 260);
            } else {
              tgt.hp = e.hpAfter;
              flash(tgt, crit);
              floater(tgt, e.dmg + (crit ? "!" : ""), crit ? C.gold : C.redLite);
              /* impact, in the order the eye reads it: the scene holds on
                 the frame of contact, then the screen jolts and the target
                 recoils together. Shake scales with weapon might, so an
                 axe lands harder than a sword and a staff not at all. It
                 follows the cinematics toggle because it is camera motion. */
              hitStop(crit ? 120 : 70);
              if (director.enabled) director.shake(mt * 0.005 * (crit ? 1.8 : 1), 120 + mt * 14);
              nudge(tgt, ddx / dl, ddz / dl, crit ? 0.22 : 0.12, 220);
              // crit always gets its own sound, even on a killing or 0-damage
              // blow. finalHit is for a *non-crit* kill specifically; a
              // crit that also kills still gets Death.wav right after, from
              // the "death" event below
              if (crit) playCritHit();
              else if (e.hpAfter <= 0) playFinalHit();
              else if (e.dmg === 0) playNoDamage();
              else playAttackHit();
            }
            tick();
          },
        });
        /* the recovery already sits between impact and here, so this is
           shorter than the old post-lunge pause and the pacing per strike
           comes out about the same */
        await sleep(crit ? 240 : 100);
        break;
      }
      case "death": {
        const u = g.units.find((z) => z.id === e.unitId);
        playDeath();
        await die(u);
        break;
      }
      case "heal": {
        const tgt = g.units.find((z) => z.id === e.tgtId);
        if (e.instant) {
          tgt.hp += e.amount;
          floater(tgt, "+" + e.amount, C.green);
          tick();
          break;
        }
        /* a staff heal is the sixth beat: the caster raises the staff and
           the target glows. The number and sound land at its peak. */
        const src = g.units.find((z) => z.id === e.srcId);
        await attacks.play(src, tgt, {
          hit: true, crit: false,
          onImpact: () => {
            tgt.hp += e.amount;
            floater(tgt, "+" + e.amount, C.green);
            playHeal();
            tick();
          },
        });
        await sleep(120);
        break;
      }
      case "levelUp": {
        const u = g.units.find((z) => z.id === e.unitId);
        playLevelUp();
        g.levelUp = { name: u.name, lvl: e.lvl, gains: e.gains };
        tick();
        await sleep(1700);
        g.levelUp = null;
        tick();
        break;
      }
      case "banner": {
        // only "Player Phase"/"Enemy Phase" reach here. Victory/Defeat
        // don't get a banner event at all, see game.js's checkEnd
        g.banner = { text: e.text, side: e.side, n: g.banner.n + 1 };
        if (e.text === "Player Phase") playPlayerPhase();
        else playEnemyPhaseSfx();
        tick();
        break;
      }
      case "end":
        // status itself is applied by applyResolve once every event above
        // has played; this just fires the win/lose sound and cuts the music
        if (e.result === "win") playVictory();
        else playDefeat();
        stopMusic();
        break;
    }
  }

  /* the ready stance belongs to the selection, so exactly one unit can be
     in it. Every path that changes who is selected goes through here,
     including `setReady(null)` for nobody: tapping empty ground, tapping
     straight onto a different unit (which never touched the old one's
     pose and left it standing guard all turn), and finishing an action.
     Sweeping the roster rather than tracking the last one means a future
     path that forgets to call this can only fail by leaving the stance
     off, never by stranding it on. */
  function setReady(u) {
    for (const z of g.units) {
      if (z !== u && z.anim.state === "ready") z.anim.state = "idle";
    }
    if (u) u.anim.state = "ready";
  }

  function select(u) {
    playUnitSelect();
    const { stand, atk, dist, prev, prevAround } = reachTiles(u, g.units);
    g.sel = { id: u.id, ox: u.x, oy: u.y, stand, atk, dist, prev, prevAround, mode: "move", targets: null };
    g.inspect = u.id;
    g.forecast = null;
    g.tutorial = false;
    setReady(u);
    paintSel();
    syncUnitVisuals();
    tick();
  }

  function clearSel() {
    setReady(null);
    g.sel = null;
    g.forecast = null;
    paintSel();
    syncUnitVisuals();
    tick();
  }

  /* undoes whatever the current selection has done so far, including a
     click-to-engage bypass's auto-move, and drops back to "move" mode so
     the player can choose a different tile or action from scratch. Shared
     by the action menu's Back and the forecast's Back, so backing out of
     a target pick can't strand the player mid-decision with no way out. */
  function backToMove() {
    playBack();
    const u = g.units.find((z) => z.id === g.sel.id);
    u.x = g.sel.ox; u.y = g.sel.oy;
    u.view.root.position.set(u.x - CX, lvlH(u.x, u.y), u.y - CZ);
    g.sel.mode = "move";
    g.forecast = null;
    paintSel();
    tick();
  }

  let busy = false;

  function scheduleEnemyPhaseIfDone() {
    if (g.status === "playing" && alive("player").every((p) => p.acted)) {
      setTimeout(startEnemyPhase, 420);
    }
  }

  /* shared by commitMove and the click-to-engage bypasses below: walks the
     unit to (tx,ty), showing the path arrow for the duration, and leaves
     sel/mode/targets untouched for the caller to set afterward */
  async function moveUnitTo(u, tx, ty) {
    const unitId = u.id;
    busy = true;
    const path = routeTo(g.sel, g.sel.ox, g.sel.oy, tx, ty);
    releaseAll();
    ring.visible = false;
    tick();
    await applyResolve(resolveMove(coreState(), unitId, path));
    busy = false;
    return g.units.find((z) => z.id === unitId);
  }

  async function commitMove(u, tx, ty) {
    playActionSelect();
    const nu = await moveUnitTo(u, tx, ty);
    setReady(nu);
    g.sel.mode = "action";
    g.sel.targets = validTargets(nu);
    paintSel();
    tick();
  }

  /* click-to-engage bypass: select a character, click an enemy/ally already
     in range, and skip straight past "move here, then choose Attack/Heal" */
  async function engageAttack(u, tile, target) {
    playActionSelect();
    const nu = await moveUnitTo(u, tile.x, tile.y);
    setReady(nu);
    g.sel.mode = "target";
    g.sel.targets = validTargets(nu);
    g.forecast = { attackerId: nu.id, targetId: target.id };
    paintSel();
    tick();
  }

  async function engageHeal(u, tile, target) {
    playActionSelect();
    const nu = await moveUnitTo(u, tile.x, tile.y);
    setReady(nu);
    g.sel.mode = "targetHeal";
    g.sel.targets = validTargets(nu);
    paintSel();
    tick();
    await doHeal(target.id);
  }

  function finishGlue() {
    /* the unit that just acted goes back to its idle breathing. Its own
       attack beat restores whatever state it started the beat in, which
       is "ready", so without this it holds the guard pose for the rest of
       the turn (and through the enemy phase) with nothing selected. */
    setReady(null);
    g.sel = null;
    g.forecast = null;
    paintSel();
    tick();
    scheduleEnemyPhaseIfDone();
  }

  /* ---- player actions ----
     each one closes the unit panel as it commits, not when it finishes:
     after an attack the cut-in closes before the level-up and EXP beats,
     and a panel cleared in finishGlue came back for those and went again */
  async function doAttack(targetId) {
    playActionSelect();
    const attackerId = g.sel.id;
    g.forecast = null;
    g.inspect = null;
    releaseAll();
    ring.visible = false;
    busy = true;
    tick();
    await applyResolve(resolveAttack(coreState(), attackerId, targetId, Math.random));
    busy = false;
    finishGlue();
  }

  async function doHeal(targetId) {
    const healerId = g.sel.id;
    g.inspect = null;
    busy = true;
    tick();
    await applyResolve(resolveHeal(coreState(), healerId, targetId));
    busy = false;
    finishGlue();
  }

  async function doVulnerary() {
    playActionSelect();
    playHeal();
    const unitId = g.sel.id;
    g.inspect = null;
    busy = true;
    tick();
    await applyResolve(resolveItem(coreState(), unitId));
    busy = false;
    finishGlue();
  }

  async function doWait() {
    playActionSelect();
    const unitId = g.sel.id;
    g.inspect = null;
    busy = true;
    tick();
    await applyResolve(resolveWait(coreState(), unitId));
    busy = false;
    finishGlue();
  }

  /* ---- enemy phase ---- */
  async function startEnemyPhase() {
    g.tutorial = false; // safety net: stop the turn-1 nudge even if End Turn was hit with nobody ever selected
    await applyResolve(endPlayerPhase(coreState()));
    clearSel();
    await playEnemyPhase();
  }

  let phaseToken = 0;
  async function playEnemyPhase() {
    const my = ++phaseToken;
    busy = true;
    await sleep(800);
    await applyResolve(runEnemyPhase(coreState(), Math.random));
    if (my !== phaseToken) return;
    busy = false;
  }

  /* ---- input ----
     pointer events cover mouse and touch alike: one finger drags to orbit
     and taps to select/act, two fingers pinch to zoom. `pinched` latches for
     the whole gesture so releasing the first finger after a pinch never
     reads as a tap from the second. Touch gets a wider drag threshold than
     mouse, since real fingers wobble more than a mouse does. */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pointers = new Map();
  let dragging = false, dragged = 0, lastX = 0, lastY = 0, dragThreshold = 6;
  let pinchDist = 0, pinched = false;

  const pinchDistance = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  function onDown(e) {
    try { cv.setPointerCapture(e.pointerId); } catch { /* pointer already gone: a fast tap-and-lift */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) {
      dragging = false;
      pinched = true;
      pinchDist = pinchDistance();
      return;
    }
    dragging = true; dragged = 0;
    lastX = e.clientX; lastY = e.clientY;
    dragThreshold = e.pointerType === "touch" ? 10 : 6;
    cv.style.cursor = "grabbing";
  }
  function onMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size >= 2) {
      const d = pinchDistance();
      if (pinchDist > 0) {
        setCam((c) => ({ ...c, zoom: clamp(c.zoom * (pinchDist / Math.max(d, 1)), ZOOM_MIN, ZOOM_MAX) }));
      }
      pinchDist = d;
      return;
    }
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    dragged += Math.abs(dx) + Math.abs(dy);
    if (dragged > dragThreshold) {
      setCam((c) => ({
        ...c,
        yaw: (c.yaw - dx * 0.4 + 360) % 360,
        pitch: clamp(c.pitch + dy * 0.25, 20, 78),
      }));
    }
  }
  function endPointer(e) {
    const wasSingle = pointers.size === 1 && !pinched;
    pointers.delete(e.pointerId);
    cv.style.cursor = "grab";
    if (pointers.size < 2) pinchDist = 0;
    if (pointers.size === 0) pinched = false;

    if (e.type === "pointercancel" || !wasSingle) { dragging = false; return; }
    dragging = false;
    if (dragged > dragThreshold) return;
    const r = cv.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    if (hit) onTile(hit.object.userData.tile.x, hit.object.userData.tile.y);
  }
  function onWheel(e) {
    e.preventDefault();
    const k = e.deltaY > 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    setCam((c) => ({ ...c, zoom: clamp(c.zoom * k, ZOOM_MIN, ZOOM_MAX) }));
  }
  cv.addEventListener("pointerdown", onDown);
  cv.addEventListener("pointermove", onMove);
  cv.addEventListener("pointerup", endPointer);
  cv.addEventListener("pointercancel", endPointer);
  cv.addEventListener("wheel", onWheel, { passive: false });

  function onTile(x, y) {
    if (busy || g.status !== "playing" || g.phase !== "player") return;
    const here = g.units.find((u) => u.hp > 0 && u.x === x && u.y === y);
    const s = g.sel;

    if (!s) {
      if (here) {
        g.inspect = here.id;
        if (here.team === "player" && !here.acted) select(here);
        else tick();
      } else {
        g.inspect = null;
        tick();
      }
      return;
    }
    const u = g.units.find((z) => z.id === s.id);

    if (s.mode === "move") {
      if ((here && here.id === u.id) || s.stand.has(K(x, y))) return void commitMove(u, x, y);
      if (here && here.team === "player" && !here.acted) return void select(here);
      if (here) {
        const eng = findEngageTile(u, s, here);
        if (eng) return void (wep(u).staff ? engageHeal(u, eng, here) : engageAttack(u, eng, here));
        g.inspect = here.id;
        tick();
        return;
      }
      // open ground: the unit panel goes with the selection
      g.inspect = null;
      clearSel();
      return;
    }
    if (s.mode === "target" && here && s.targets.includes(here.id)) {
      g.forecast = { attackerId: u.id, targetId: here.id };
      tick();
      return;
    }
    if (s.mode === "targetHeal" && here && s.targets.includes(here.id)) {
      doHeal(here.id);
    }
  }

  /* ---- api for the html layer ---- */
  apiRef.current = {
    endTurn: () => { if (!busy && g.phase === "player" && g.status === "playing") { playActionSelect(); startEnemyPhase(); } },
    // both the under-map row and the pause menu route here, so the toggle
    // sounds the same wherever it was pressed, and in both directions
    toggleDanger: () => { g.danger = !g.danger; playThreatCheck(); paintSel(); tick(); },
    chooseAttack: () => { playActionSelect(); g.sel.mode = "target"; paintSel(); tick(); },
    chooseHeal: () => { playActionSelect(); g.sel.mode = "targetHeal"; paintSel(); tick(); },
    vulnerary: doVulnerary,
    wait: doWait,
    back: backToMove,
    confirmAttack: (id) => doAttack(id),
    cancelForecast: backToMove,
    isBusy: () => busy,
  };

  /* dev builds only: the reference cut-in, a fixed shot for judging the look
     between sessions. It frames the closest player and enemy by ROSTER start
     position, so a fresh board gives the same pair every time, and shows
     what a real cut-in shows (the HUD, the world bars hidden, bystanders
     veiled, the player unit squared up as the first strike would turn it)
     without playing a strike or resolving anything. Holds, with the board
     locked, until called again, then puts the facing back. Vite drops the
     block from the build. */
  if (import.meta.env.DEV) {
    let held = null;    // { src, yaw, blocked } while the shot holds, null when released
    let moving = false; // a press during the fly in or out is ignored
    apiRef.current.refCutIn = async () => {
      if (moving || (!held && (busy || director.active))) return;
      moving = true;
      if (held) {
        g.cutIn.closing = true;
        tick();
        held.src.anim.targetYaw = held.yaw;
        await Promise.all([director.flyOut(), veilTo(held.blocked, 1, VEIL_IN_MS)]);
        if (held.blocked.length) syncUnitVisuals();
        g.cutIn = null;
        held = null;
        busy = false;
        tick();
      } else {
        let pair = null, best = Infinity;
        ROSTER.forEach((a, i) => ROSTER.forEach((b, j) => {
          const d = man(a.x, a.y, b.x, b.y);
          if (a.team === "player" && b.team === "enemy" && d < best) { best = d; pair = ["u" + i, "u" + j]; }
        }));
        const [src, tgt] = pair.map((id) => g.units.find((u) => u.id === id));
        if (src.hp > 0 && tgt.hp > 0) {
          busy = true;
          g.cutIn = { srcId: src.id, tgtId: tgt.id, kind: "strike", closing: false, f: forecastOf(src, tgt), amount: 0 };
          tick();
          held = { src, yaw: src.anim.targetYaw, blocked: inTheWay(src, tgt) };
          faceToward(src, tgt);
          await Promise.all([director.flyIn(src, tgt, { leftIsSource: true }), veilTo(held.blocked, 0, VEIL_OUT_MS)]);
        }
      }
      moving = false;
    };
  }

  /* ---- sky ----
     see sky.js. Built last on purpose: three draws Math.random for every
     mesh, material and geometry's uuid, and building these before the
     grass, the trees, the units and the effects would move every seeded
     random draw they make, which the pixel-diff harness depends on. The
     sun decides which ridge faces are lit; the lowland takes the board's
     haze colour and wind, and the river runs on out of the map on the
     board's water material. */
  const sky = createSky({ scene, sun, haze, wind, water: waterMat });

  /* ---- loop ---- */
  let raf = 0, prevT = performance.now();
  /* the orbit distance at which BOARD exactly fills the frame.

     The camera always looks at `orbit.target`, so work in the camera's own
     axes around that point: `dir` points from the target out to the camera,
     `right` and `up` span the screen. A corner at camera-space (x, y) and
     depth d is inside the frustum when |y| <= d*tanV and |x| <= d*tanH, and
     d is the orbit distance minus how far the corner already lies along
     `dir`. Solving each of those for the distance and taking the largest
     over the eight corners is the closed-form fit: no iteration, and it
     tracks a pitch drag or a Rotate 90 on the frame it happens. */
  function fitDist(pit, yaw, fov, aspect) {
    const sy = Math.sin(yaw), cy = Math.cos(yaw), sp = Math.sin(pit), cp = Math.cos(pit);
    const dir = [cp * sy, sp, cp * cy];
    const right = [cy, 0, -sy];
    const up = [-sp * sy, cp, -sp * cy];
    const tanV = Math.tan(THREE.MathUtils.degToRad(fov) / 2), tanH = tanV * aspect;
    let need = 0;
    for (const cx of [-BOARD.x, BOARD.x]) {
      for (const cz of [-BOARD.z, BOARD.z]) {
        for (const cyv of [BOARD.yLo - orbit.target.y, BOARD.yHi - orbit.target.y]) {
          const along = cx * dir[0] + cyv * dir[1] + cz * dir[2];
          const sx = Math.abs(cx * right[0] + cyv * right[1] + cz * right[2]);
          const sv = Math.abs(cx * up[0] + cyv * up[1] + cz * up[2]);
          need = Math.max(need, along + Math.max(sv / tanV, sx / tanH));
        }
      }
    }
    return need;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - prevT) / 1000);
    prevT = now;
    const o = camRef.current;
    if (o.res !== lastRes) applyRes();

    /* animation time: equals dt except while a hit-stop drains, when it
       is zero. Units and effects run on it; the camera keeps real time */
    const animDt = stepTweens(dt * 1000) / 1000;

    const pit = THREE.MathUtils.degToRad(o.pitch);
    const yaw = THREE.MathUtils.degToRad(o.yaw);
    camera.aspect = VW / VH;
    /* `zoom` is how much of the field the player asked to see, measured in
       world units of frame height. A wide canvas fits the board sideways
       long before it fills that height, and the surplus was sky, so the
       ask is capped at the distance that just frames the board. Pulling
       back further only shrinks the map, never shows more of it. */
    const dist = Math.min(
      (o.zoom / 2) / Math.tan(THREE.MathUtils.degToRad(o.fov) / 2),
      fitDist(pit, yaw, o.fov, camera.aspect)
    );
    camera.far = dist + 80;
    orbit.pos.set(
      Math.cos(pit) * Math.sin(yaw) * dist,
      Math.sin(pit) * dist + 0.4,
      Math.cos(pit) * Math.cos(yaw) * dist
    );
    orbit.fov = o.fov;
    director.apply(camera, orbit, dt * 1000);
    updateTileFog(haze, camera.position.distanceTo(director.target), director.mix);

    const t = now / 1000;
    matMove.uniforms.uTime.value = t;
    matAtk.uniforms.uTime.value = t;
    matHeal.uniforms.uTime.value = t;
    matThreat.uniforms.uTime.value = t;
    ringMat.uniforms.uTime.value = t;
    readyRingMat.uniforms.uTime.value = t;
    waterMat.uniforms.uTime.value = t;
    wind.update(t);
    /* posterisation eases off during a cut-in. POST_FRAG quantises the
       frame to uLevels steps and skips the step entirely at 63 and above.
       At grid distance the banding is the look; at cut-in distance it
       cuts the new specular highlights into hard rings, so the level
       count rides the director's mix from the setting up to 64. The
       blend is gradual on purpose: bands get finer as the camera closes
       in, rather than snapping off on the first frame of the fly. */
    postMat.uniforms.uLevels.value = o.levels < 63 ? o.levels + (64 - o.levels) * director.mix : o.levels;
    /* radial blur while the camera is in transit, see POST_FRAG */
    postMat.uniforms.uRush.value = director.rush;

    g.units.forEach((u) => animUnit(u, animDt));
    g.units.forEach((u) => u.view.haze.value.copy(u.view.root.position));
    effects.update(animDt * 1000, camera);

    if (g.sel) {
      const u = g.units.find((z) => z.id === g.sel.id);
      if (u && ring.visible) {
        ring.position.set(u.view.root.position.x, u.view.root.position.y + 0.05, u.view.root.position.z);
      }
      if (menuRef.current && g.sel.mode === "action") {
        const p = project(u, 1.15);
        menuRef.current.style.left = clamp(p.x + 18, 4, VW - 116) + "px";
        menuRef.current.style.top = clamp(p.y - 20, 4, VH - 150) + "px";
      }
    }
    if (forecastRef.current && g.forecast) {
      const a = g.units.find((z) => z.id === g.forecast.attackerId);
      const d = g.units.find((z) => z.id === g.forecast.targetId);
      if (a && d) {
        const pa = project(a, 1.15), pd = project(d, 1.15);
        const cx = (pa.x + pd.x) / 2;
        const topY = Math.min(pa.y, pd.y);
        const w = forecastRef.current.offsetWidth || 260;
        const h = forecastRef.current.offsetHeight || 210;
        forecastRef.current.style.left = clamp(cx - w / 2, 4, VW - w - 4) + "px";
        forecastRef.current.style.top = clamp(topY - h - 20, 4, VH - h - 4) + "px";
      }
    }

    sky.follow(camera, o.post);
    if (o.post) {
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      /* depth back to view and world space, for the outlines, the map's
         outline and the fog round it */
      const pu = postMat.uniforms;
      const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      pu.uTan.value.set(tanY * camera.aspect, tanY);
      pu.uNear.value = camera.near;
      pu.uFar.value = camera.far;
      pu.uCamWorld.value.copy(camera.matrixWorld);
      const outlines = o.outlines !== false;
      if (outlines !== lastOutlines) {
        lastOutlines = outlines;
        postMat.uniforms.uOutline.value = outlines ? 1 : 0;
        if (!outlines) normalRT.dispose();
      }
      if (outlines) {
        /* the normal pass. The shadow map and every world matrix are
           already current from the pass above, so neither is redone. */
        camera.layers.disable(NO_OUTLINE_LAYER);
        scene.overrideMaterial = normalMat;
        renderer.shadowMap.autoUpdate = false;
        scene.matrixWorldAutoUpdate = false;
        renderer.setRenderTarget(normalRT);
        renderer.render(scene, camera);
        scene.matrixWorldAutoUpdate = true;
        renderer.shadowMap.autoUpdate = true;
        scene.overrideMaterial = null;
        camera.layers.enable(NO_OUTLINE_LAYER);
        pu.uSun.value.copy(sunDir).transformDirection(camera.matrixWorldInverse);
      }
      renderer.setRenderTarget(null);
      renderer.render(postScene, postCam);
    } else {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    }
  }
  syncUnitVisuals();
  /* last, for the same seeded-draw reason as the sky: see portrait.js */
  renderPortraits(renderer, g.units);
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    phaseToken++;
    resetTweens();
    ro.disconnect();
    cv.removeEventListener("pointerdown", onDown);
    cv.removeEventListener("pointermove", onMove);
    cv.removeEventListener("pointerup", endPointer);
    cv.removeEventListener("pointercancel", endPointer);
    cv.removeEventListener("wheel", onWheel);
    rt.dispose();
    normalRT.dispose();
    renderer.dispose();
    if (cv.parentNode) cv.parentNode.removeChild(cv);
  };
}
