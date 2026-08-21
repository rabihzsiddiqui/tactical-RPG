/* SECTION 8: scene, loop, game flow

   M3: the rules (turn state, combat resolution, enemy AI orchestration)
   now live in ../core/game.js as synchronous functions that return
   { state, events }. This module is the *player* of those events — it
   applies the returned state to `g` and animates each event against the
   live three.js scene. See applyResolve/playEvents below, and
   PROJECT_PLAN.md's M3 section / CLAUDE.md for the design. */

import * as THREE from "three";
import { MW, MH, CX, CZ, cell, lvlH, walkable } from "../core/map.js";
import { ROSTER, makeUnit } from "../core/data.js";
import { tracePath, reachTiles } from "../core/path.js";
import { wep } from "../core/combat.js";
import { threatSet } from "../core/ai.js";
import { K, man, clamp, sleep } from "../core/util.js";
import {
  resolveMove, resolveAttack, resolveHeal, resolveItem, resolveWait,
  endPlayerPhase, runEnemyPhase,
} from "../core/game.js";
import { buildTerrain, buildUnitMesh, buildTree, buildKeep, buildBridge, buildHealthBar, HP_BAR_W } from "./meshes.js";
import {
  POST_VERT, POST_FRAG, TILE_VERT, TILE_FRAG, RING_FRAG, WATER_VERT, WATER_FRAG,
} from "./shaders.js";
import { C } from "../ui/theme.js";
import { playSheath } from "./audio.js";

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
    levelUp: null, banner: { text: "Player Phase", side: "player", n: 0 },
    log: ["Turn 1 begins."],
    tutorial: true, // cleared on first selection (or turn 1 ending, whichever first) — see select()/startEnemyPhase()
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
  renderer.shadowMap.type = THREE.PCFShadowMap;
  mount.appendChild(renderer.domElement);
  const cv = renderer.domElement;
  Object.assign(cv.style, {
    width: "100%", height: "100%", display: "block",
    imageRendering: "pixelated", cursor: "grab", touchAction: "none",
  });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fc3d8);
  scene.fog = new THREE.Fog(0x9fc3d8, 16, 40);
  const camera = new THREE.PerspectiveCamera(30, 1.6, 0.5, 120);

  scene.add(new THREE.AmbientLight(0x93a9c6, 0.85));
  const sun = new THREE.DirectionalLight(0xfff0d4, 1.15);
  sun.position.set(7, 12, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 40 });
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 0.02;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);
  const bounce = new THREE.DirectionalLight(0x86a4d8, 0.4);
  bounce.position.set(-6, 3, -7);
  scene.add(bounce);

  /* ---- world ---- */
  const ground = new THREE.Mesh(buildTerrain(), new THREE.MeshLambertMaterial({ vertexColors: true }));
  ground.receiveShadow = true;
  ground.castShadow = true;
  scene.add(ground);

  const waterMat = new THREE.ShaderMaterial({
    vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, uniforms: { uTime: { value: 0 } },
  });

  const pickGeo = new THREE.PlaneGeometry(1, 1);
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });
  const pickables = [];
  const treeProto = buildTree();

  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      const t = cell(x, y);
      if (t.water) {
        const wp = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), waterMat);
        wp.rotation.x = -Math.PI / 2;
        wp.position.set(x - CX, -0.1, y - CZ);
        wp.receiveShadow = true;
        scene.add(wp);
      }
      if (t.bridge) {
        const b = buildBridge();
        b.position.set(x - CX, 0, y - CZ);
        scene.add(b);
      }
      if (t.tree) {
        const tr = treeProto.clone(true);
        tr.position.set(x - CX + (Math.random() - 0.5) * 0.2, t.h, y - CZ + (Math.random() - 0.5) * 0.2);
        tr.rotation.y = Math.random() * 6.28;
        tr.scale.setScalar(0.85 + Math.random() * 0.3);
        scene.add(tr);
      }
      if (t.keep) {
        const k = buildKeep();
        k.position.set(x - CX, t.h, y - CZ);
        scene.add(k);
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
  const mkTileMat = (hex) => new THREE.ShaderMaterial({
    vertexShader: TILE_VERT, fragmentShader: TILE_FRAG,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(hex) } },
    transparent: true, depthWrite: false,
  });
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
    scene.add(m);
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
  scene.add(ring);

  /* blue "hasn't acted yet" ring — one per unit, shown/hidden by
     syncUnitVisuals, distinct from the single reused gold selection ring */
  const readyRingMat = new THREE.ShaderMaterial({
    vertexShader: TILE_VERT, fragmentShader: RING_FRAG,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x5ea8ff) } }, transparent: true, depthWrite: false,
  });

  /* a small self-illumination so units read distinctly against the terrain
     regardless of light angle — the map stays unlit-by-this, only characters
     get it. flash() restores to this instead of black. */
  const POP_EMISSIVE = 0x1c1a16;

  /* ---- unit views ---- */
  for (const u of g.units) {
    const v = buildUnitMesh(u.pal, u.weaponKey);
    v.root.position.set(u.x - CX, lvlH(u.x, u.y), u.y - CZ);
    v.root.rotation.y = u.team === "player" ? 0 : Math.PI;
    scene.add(v.root);
    u.view = v;
    u.anim = { state: "idle", phase: Math.random() * 6.28, targetYaw: v.root.rotation.y, walk: null, offset: new THREE.Vector3() };
    v.mats.forEach((m) => {
      if (!m.emissive) return;
      m.emissive.setHex(POP_EMISSIVE);
      m.userData.baseEmissive = POP_EMISSIVE;
    });

    const hpBar = buildHealthBar(0x5fc25a);
    scene.add(hpBar.group);
    u.view.hpBar = hpBar;

    const readyRing = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.05), readyRingMat);
    readyRing.rotation.x = -Math.PI / 2;
    readyRing.visible = false;
    scene.add(readyRing);
    u.view.readyRing = readyRing;
  }

  /* ---- post ---- */
  const rt = new THREE.WebGLRenderTarget(400, 240, {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat, depthBuffer: true,
  });
  const postScene = new THREE.Scene();
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const postMat = new THREE.ShaderMaterial({
    vertexShader: POST_VERT, fragmentShader: POST_FRAG,
    uniforms: { tDiffuse: { value: rt.texture }, uLevels: { value: 32 }, uVignette: { value: 0.16 } },
    depthTest: false,
  });
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));

  let VW = 640, VH = 420, lastRes = -1;
  function applyRes() {
    const p = RES[camRef.current.res];
    lastRes = camRef.current.res;
    const h = p.h === 0 ? VH : p.h;
    rt.setSize(Math.max(64, Math.round(h * (VW / VH))), Math.max(48, h));
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

  /* ---- tween helper ---- */
  const tweens = [];
  const tween = (ms, fn) => new Promise((res) => tweens.push({ t: 0, ms, fn, res }));

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
      p.body.position.y = Math.abs(Math.cos(a.phase)) * 0.035;

      const W = a.walk;
      W.t += dt * 3.6;
      const k = Math.min(1, W.t);
      const h0 = lvlH(W.from.x, W.from.y), h1 = lvlH(W.to.x, W.to.y);
      const arc = Math.abs(h1 - h0) > 0.2 ? Math.sin(k * Math.PI) * 0.12 : 0;
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
    } else if (a.state === "ready") {
      a.phase += dt * 3;
      p.legL.rotation.x = 0.16;
      p.legR.rotation.x = -0.16;
      p.armR.rotation.x = -2.15 + Math.sin(a.phase) * 0.05;
      p.armR.rotation.z = -0.3;
      p.armL.rotation.x = 0.25;
      p.body.position.y = 0.015 + Math.sin(a.phase) * 0.01;
    } else {
      a.phase += dt * 1.9;
      const s = Math.sin(a.phase);
      p.legL.rotation.x = 0;
      p.legR.rotation.x = 0;
      p.armL.rotation.x = s * 0.07;
      p.armR.rotation.x = -s * 0.07;
      p.armR.rotation.z = 0;
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

    u.view.hpBar.group.visible = true;
    u.view.hpBar.group.position.set(root.position.x, lvlH(u.x, u.y) + 0.12, root.position.z + 0.62);
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

  async function lunge(src, tgt) {
    faceToward(src, tgt);
    const dx = Math.sign(tgt.x - src.x) * 0.34;
    const dz = Math.sign(tgt.y - src.y) * 0.34;
    const ranged = man(src.x, src.y, tgt.x, tgt.y) > 1;
    const amt = ranged ? 0.1 : 1;
    await tween(120, (k) => src.anim.offset.set(dx * k * amt, 0, dz * k * amt));
    await tween(180, (k) => src.anim.offset.set(dx * (1 - k) * amt, 0, dz * (1 - k) * amt));
  }

  function flash(u, crit) {
    const hex = crit ? 0xffd45a : 0xff5a5a;
    u.view.mats.forEach((m) => m.emissive && m.emissive.setHex(hex));
    setTimeout(() => u.view.mats.forEach((m) => m.emissive && m.emissive.setHex(m.userData.baseEmissive ?? 0)), crit ? 260 : 160);
  }

  async function die(u) {
    u.view.mats.forEach((m) => { m.transparent = true; });
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

  /* replaces the per-unit dim (acted) / restore (fresh turn) and the blue
     "hasn't acted yet" ring, both driven off the same acted flag */
  function syncUnitVisuals() {
    for (const u of g.units) {
      if (u.hp <= 0) continue;
      const dim = u.team === "player" && u.acted;
      u.view.mats.forEach((m) => { m.transparent = dim; m.opacity = dim ? 0.55 : 1; });

      const isSelected = g.sel && g.sel.id === u.id;
      u.view.readyRing.visible = g.phase === "player" && g.status === "playing"
        && u.team === "player" && !u.acted && !isSelected;
    }
  }

  /* applies a { state, events } result from core/game.js. Every unit
     field except hp lands immediately; hp is held back to its pre-resolve
     value and written by whichever strike/heal event actually reveals it,
     so the HP bar drains progressively instead of jumping to the end
     state. `status` is held back until every event has finished playing,
     so a win/lose overlay never covers a still-animating death. */
  async function applyResolve({ state, events }) {
    const prevHp = new Map(g.units.map((u) => [u.id, u.hp]));
    g.units = state.units.map((u) => ({ ...u, hp: prevHp.has(u.id) ? prevHp.get(u.id) : u.hp }));
    await playEvents(events);
    g.turn = state.turn;
    g.phase = state.phase;
    g.status = state.status;
    g.log = state.log;
    syncUnitVisuals();
    tick();
  }

  async function playEvents(events) {
    for (const e of events) {
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
          await lunge(src, tgt);
          if (!e.hit) {
            floater(tgt, "miss", C.parchDim);
          } else {
            tgt.hp = e.hpAfter;
            flash(tgt, e.crit);
            floater(tgt, (e.crit ? "!" : "") + e.dmg, e.crit ? C.gold : C.redLite);
          }
          tick();
          await sleep(e.crit ? 380 : 260);
          break;
        }
        case "death": {
          const u = g.units.find((z) => z.id === e.unitId);
          await die(u);
          break;
        }
        case "heal": {
          const tgt = g.units.find((z) => z.id === e.tgtId);
          tgt.hp += e.amount;
          floater(tgt, "+" + e.amount, C.green);
          tick();
          if (!e.instant) await sleep(600);
          break;
        }
        case "levelUp": {
          const u = g.units.find((z) => z.id === e.unitId);
          g.levelUp = { name: u.name, lvl: e.lvl, gains: e.gains };
          tick();
          await sleep(1700);
          g.levelUp = null;
          tick();
          break;
        }
        case "banner": {
          g.banner = { text: e.text, side: e.side, n: g.banner.n + 1 };
          playSheath();
          tick();
          break;
        }
        case "end":
          break; // status is applied by applyResolve once every event above has played
      }
    }
  }

  function select(u) {
    const { stand, atk, dist, prev } = reachTiles(u, g.units);
    g.sel = { id: u.id, ox: u.x, oy: u.y, stand, atk, dist, prev, mode: "move", targets: null };
    g.inspect = u.id;
    g.forecast = null;
    g.tutorial = false;
    u.anim.state = "ready";
    paintSel();
    syncUnitVisuals();
    tick();
  }

  function clearSel() {
    if (g.sel) {
      const u = g.units.find((z) => z.id === g.sel.id);
      if (u && u.anim.state === "ready") u.anim.state = "idle";
    }
    g.sel = null;
    g.forecast = null;
    paintSel();
    syncUnitVisuals();
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
    const path = tracePath(g.sel.prev, g.sel.ox, g.sel.oy, tx, ty);
    releaseAll();
    ring.visible = false;
    tick();
    await applyResolve(resolveMove(coreState(), unitId, path));
    busy = false;
    return g.units.find((z) => z.id === unitId);
  }

  async function commitMove(u, tx, ty) {
    const nu = await moveUnitTo(u, tx, ty);
    nu.anim.state = "ready";
    g.sel.mode = "action";
    g.sel.targets = validTargets(nu);
    paintSel();
    tick();
  }

  /* click-to-engage bypass: select a character, click an enemy/ally already
     in range, and skip straight past "move here, then choose Attack/Heal" */
  async function engageAttack(u, tile, target) {
    const nu = await moveUnitTo(u, tile.x, tile.y);
    nu.anim.state = "ready";
    g.sel.mode = "target";
    g.sel.targets = validTargets(nu);
    g.forecast = { attackerId: nu.id, targetId: target.id };
    paintSel();
    tick();
  }

  async function engageHeal(u, tile, target) {
    const nu = await moveUnitTo(u, tile.x, tile.y);
    nu.anim.state = "ready";
    g.sel.mode = "targetHeal";
    g.sel.targets = validTargets(nu);
    paintSel();
    tick();
    await doHeal(target.id);
  }

  function finishGlue() {
    g.sel = null;
    g.forecast = null;
    paintSel();
    tick();
    scheduleEnemyPhaseIfDone();
  }

  /* ---- player actions ---- */
  async function doAttack(targetId) {
    const attackerId = g.sel.id;
    g.forecast = null;
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
    busy = true;
    tick();
    await applyResolve(resolveHeal(coreState(), healerId, targetId));
    busy = false;
    finishGlue();
  }

  async function doVulnerary() {
    const unitId = g.sel.id;
    busy = true;
    tick();
    await applyResolve(resolveItem(coreState(), unitId));
    busy = false;
    finishGlue();
  }

  async function doWait() {
    const unitId = g.sel.id;
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

  /* ---- input ---- */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let dragging = false, dragged = 0, lastX = 0, lastY = 0;

  function onDown(e) {
    dragging = true; dragged = 0;
    lastX = e.clientX; lastY = e.clientY;
    cv.setPointerCapture(e.pointerId);
    cv.style.cursor = "grabbing";
  }
  function onMove(e) {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    dragged += Math.abs(dx) + Math.abs(dy);
    if (dragged > 6) {
      setCam((c) => ({
        ...c,
        yaw: (c.yaw - dx * 0.4 + 360) % 360,
        pitch: clamp(c.pitch + dy * 0.25, 20, 78),
      }));
    }
  }
  function onUp(e) {
    cv.style.cursor = "grab";
    if (!dragging) return;
    dragging = false;
    if (dragged > 6) return;
    const r = cv.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    if (hit) onTile(hit.object.userData.tile.x, hit.object.userData.tile.y);
  }
  function onWheel(e) {
    e.preventDefault();
    setCam((c) => ({ ...c, zoom: clamp(c.zoom + Math.sign(e.deltaY) * 0.7, 6, 22) }));
  }
  cv.addEventListener("pointerdown", onDown);
  cv.addEventListener("pointermove", onMove);
  cv.addEventListener("pointerup", onUp);
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
    endTurn: () => { if (!busy && g.phase === "player" && g.status === "playing") startEnemyPhase(); },
    toggleDanger: () => { g.danger = !g.danger; paintSel(); tick(); },
    chooseAttack: () => { g.sel.mode = "target"; paintSel(); tick(); },
    chooseHeal: () => { g.sel.mode = "targetHeal"; paintSel(); tick(); },
    vulnerary: doVulnerary,
    wait: doWait,
    back: () => {
      const u = g.units.find((z) => z.id === g.sel.id);
      u.x = g.sel.ox; u.y = g.sel.oy;
      u.view.root.position.set(u.x - CX, lvlH(u.x, u.y), u.y - CZ);
      g.sel.mode = "move";
      g.forecast = null;
      paintSel();
      tick();
    },
    confirmAttack: (id) => doAttack(id),
    cancelForecast: () => { g.forecast = null; tick(); },
    isBusy: () => busy,
  };

  /* ---- loop ---- */
  let raf = 0, prevT = performance.now();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - prevT) / 1000);
    prevT = now;
    const o = camRef.current;
    if (o.res !== lastRes) applyRes();

    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t += dt * 1000;
      const k = Math.min(1, tw.t / tw.ms);
      tw.fn(k);
      if (k >= 1) { tweens.splice(i, 1); tw.res(); }
    }

    const pit = THREE.MathUtils.degToRad(o.pitch);
    const yaw = THREE.MathUtils.degToRad(o.yaw);
    const dist = (o.zoom / 2) / Math.tan(THREE.MathUtils.degToRad(o.fov) / 2);
    camera.fov = o.fov;
    camera.aspect = VW / VH;
    camera.far = dist + 80;
    camera.position.set(
      Math.cos(pit) * Math.sin(yaw) * dist,
      Math.sin(pit) * dist + 0.4,
      Math.cos(pit) * Math.cos(yaw) * dist
    );
    camera.lookAt(0, 0.4, 0);
    camera.updateProjectionMatrix();

    const t = now / 1000;
    matMove.uniforms.uTime.value = t;
    matAtk.uniforms.uTime.value = t;
    matHeal.uniforms.uTime.value = t;
    matThreat.uniforms.uTime.value = t;
    ringMat.uniforms.uTime.value = t;
    readyRingMat.uniforms.uTime.value = t;
    waterMat.uniforms.uTime.value = t;
    postMat.uniforms.uLevels.value = o.levels;

    g.units.forEach((u) => animUnit(u, dt));

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

    if (o.post) {
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(postScene, postCam);
    } else {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    }
  }
  syncUnitVisuals();
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    phaseToken++;
    ro.disconnect();
    cv.removeEventListener("pointerdown", onDown);
    cv.removeEventListener("pointermove", onMove);
    cv.removeEventListener("pointerup", onUp);
    cv.removeEventListener("wheel", onWheel);
    renderer.dispose();
    if (cv.parentNode) cv.parentNode.removeChild(cv);
  };
}
