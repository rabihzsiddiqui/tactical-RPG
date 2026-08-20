/* SECTION 8: scene, loop, game flow

   Kept as one module on purpose: the flow functions below (commitMove,
   runCombat, doAttack, startEnemyPhase, ...) are async and awaiting
   three.js animation calls (walkPath, lunge, flash, die, tween) inline.
   Splitting a three.js-free "phase machine" out of this would mean
   designing a view-callback interface that doesn't exist yet, which is a
   design change, not a refactor. Deferred until the combat core has
   tests and the flow is rewritten to emit events instead of awaiting
   animation directly. See CLAUDE.md. */

import * as THREE from "three";
import { MW, MH, CX, CZ, cell, lvlH, walkable } from "../core/map.js";
import { WEAPONS, ROSTER, makeUnit } from "../core/data.js";
import { moveField, tracePath, reachTiles } from "../core/path.js";
import { wep, simulateCombat, expFor, levelUp } from "../core/combat.js";
import { planFor, threatSet } from "../core/ai.js";
import { K, man, clamp, sleep } from "../core/util.js";
import { buildTerrain, buildUnitMesh, buildTree, buildKeep, buildBridge } from "./meshes.js";
import {
  POST_VERT, POST_FRAG, TILE_VERT, TILE_FRAG, RING_FRAG, WATER_VERT, WATER_FRAG,
} from "./shaders.js";
import { C } from "../ui/theme.js";

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
  };
}

/* mounts the three.js scene into `mount`, wires input and the game flow,
   and returns a cleanup function. `menuRef` and `apiRef` are React refs so
   the frame loop and the api object stay live across renders. */
export function mountScene({ mount, menuRef, g, camRef, setCam, setFloats, tick, apiRef }) {
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

  scene.add(new THREE.AmbientLight(0x93a9c6, 0.66));
  const sun = new THREE.DirectionalLight(0xfff0d4, 1.0);
  sun.position.set(7, 12, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 40 });
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 0.02;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);
  const bounce = new THREE.DirectionalLight(0x86a4d8, 0.25);
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
    uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);

  /* ---- unit views ---- */
  for (const u of g.units) {
    const v = buildUnitMesh(u.pal, u.weaponKey);
    v.root.position.set(u.x - CX, lvlH(u.x, u.y), u.y - CZ);
    v.root.rotation.y = u.team === "player" ? 0 : Math.PI;
    scene.add(v.root);
    u.view = v;
    u.anim = { state: "idle", phase: Math.random() * 6.28, targetYaw: v.root.rotation.y, walk: null, offset: new THREE.Vector3() };
    v.mats.forEach((m) => (m.userData.baseEmissive = m.emissive ? m.emissive.getHex() : 0));
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
    uniforms: { tDiffuse: { value: rt.texture }, uLevels: { value: 32 }, uVignette: { value: 0.3 } },
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
    if (u.hp <= 0) return;

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
  }

  function faceToward(u, t) {
    const dx = t.x - u.x, dy = t.y - u.y;
    u.anim.targetYaw = Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? Math.PI / 2 : -Math.PI / 2)
      : (dy > 0 ? 0 : Math.PI);
  }

  function walkPath(u, path) {
    return new Promise((res) => {
      u.anim.state = "walk";
      u.anim.walk = { path: path.slice(), from: { x: u.x, y: u.y }, to: path[0], t: 0, done: res };
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
    setTimeout(() => u.view.mats.forEach((m) => m.emissive && m.emissive.setHex(0x000000)), crit ? 260 : 160);
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
    if (s.mode === "move") {
      for (const k of s.atk) {
        if (s.stand.has(k)) continue;
        const [x, y] = k.split(",").map(Number);
        claim(x, y, matAtk, 0.032);
      }
      for (const k of s.stand) {
        const [x, y] = k.split(",").map(Number);
        claim(x, y, matMove, 0.035);
      }
    } else if (s.mode === "target" || s.mode === "targetHeal") {
      for (const id of s.targets) {
        const t = g.units.find((z) => z.id === id);
        if (t) claim(t.x, t.y, s.mode === "target" ? matAtk : matMove, 0.04);
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

  const alive = (t) => g.units.filter((u) => u.team === t && u.hp > 0);
  const say = (s) => { g.log = [s, ...g.log].slice(0, 40); };

  function select(u) {
    const { stand, atk } = reachTiles(u, g.units);
    g.sel = { id: u.id, ox: u.x, oy: u.y, stand, atk, mode: "move", targets: null };
    g.inspect = u.id;
    g.forecast = null;
    u.anim.state = "ready";
    paintSel();
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
    tick();
  }

  let busy = false;

  async function commitMove(u, tx, ty) {
    busy = true;
    const { prev } = moveField(u, g.units);
    const path = tracePath(prev, g.sel.ox, g.sel.oy, tx, ty);
    releaseAll();
    ring.visible = false;
    tick();
    if (path.length) await walkPath(u, path);
    u.anim.state = "ready";
    g.sel.mode = "action";
    g.sel.targets = validTargets(u);
    busy = false;
    paintSel();
    tick();
  }

  function finishUnit(u) {
    u.acted = true;
    u.anim.state = "idle";
    u.view.mats.forEach((m) => { m.transparent = true; m.opacity = 0.55; });
    g.sel = null;
    g.forecast = null;
    paintSel();
    tick();
    checkEnd();
    if (g.status === "playing" && alive("player").every((p) => p.acted)) {
      setTimeout(startEnemyPhase, 420);
    }
  }

  async function runCombat(att, def) {
    const sim = simulateCombat(att, def);
    const queue = [];
    for (const s of sim.strikes) {
      const src = s.who === "a" ? att : def;
      const tgt = s.who === "a" ? def : att;
      await lunge(src, tgt);
      if (!s.landed) {
        floater(tgt, "miss", C.parchDim);
      } else {
        tgt.hp = s.hpAfter;
        flash(tgt, s.crit);
        floater(tgt, (s.crit ? "!" : "") + s.dmg, s.crit ? C.gold : C.redLite);
      }
      tick();
      await sleep(s.crit ? 380 : 260);

      const killed = s.landed && tgt.hp <= 0;
      if (src.team === "player" && s.landed) {
        src.exp += expFor(src, tgt, killed);
        if (src.exp >= 100) {
          src.exp -= 100;
          queue.push({ u: src, gains: levelUp(src) });
        }
      }
      if (killed) {
        say(tgt.name + " was defeated.");
        await die(tgt);
        break;
      }
    }
    for (const q of queue) {
      g.levelUp = { name: q.u.name, lvl: q.u.lvl, gains: q.gains };
      tick();
      await sleep(1700);
      g.levelUp = null;
      tick();
    }
  }

  /* ---- player actions ---- */
  async function doAttack(targetId) {
    const u = g.units.find((z) => z.id === g.sel.id);
    const t = g.units.find((z) => z.id === targetId);
    g.forecast = null;
    releaseAll();
    ring.visible = false;
    busy = true;
    tick();
    await runCombat(u, t);
    busy = false;
    if (u.hp <= 0) {
      g.sel = null;
      paintSel();
      tick();
      checkEnd();
      if (g.status === "playing" && alive("player").every((p) => p.acted)) startEnemyPhase();
      return;
    }
    finishUnit(u);
  }

  async function doHeal(targetId) {
    const u = g.units.find((z) => z.id === g.sel.id);
    const t = g.units.find((z) => z.id === targetId);
    const amt = Math.min(t.maxHp - t.hp, WEAPONS.heal.power + u.mag);
    t.hp += amt;
    faceToward(u, t);
    floater(t, "+" + amt, C.green);
    say(u.name + " healed " + t.name + " for " + amt + ".");
    u.exp += 12;
    busy = true;
    tick();
    await sleep(600);
    if (u.exp >= 100) {
      u.exp -= 100;
      const gains = levelUp(u);
      g.levelUp = { name: u.name, lvl: u.lvl, gains };
      tick();
      await sleep(1700);
      g.levelUp = null;
    }
    busy = false;
    finishUnit(u);
  }

  function doVulnerary() {
    const u = g.units.find((z) => z.id === g.sel.id);
    const amt = Math.min(u.maxHp - u.hp, 10);
    u.hp += amt;
    u.vulnerary -= 1;
    floater(u, "+" + amt, C.green);
    say(u.name + " used a vulnerary.");
    finishUnit(u);
  }

  /* ---- enemy phase ---- */
  function startEnemyPhase() {
    g.phase = "enemy";
    g.banner = { text: "Enemy Phase", side: "enemy", n: g.banner.n + 1 };
    for (const u of alive("enemy")) {
      const t = cell(u.x, u.y);
      if (t.heal && u.hp < u.maxHp) {
        const a = Math.min(u.maxHp - u.hp, Math.ceil(u.maxHp * t.heal));
        u.hp += a;
        floater(u, "+" + a, C.green);
      }
    }
    clearSel();
    tick();
    runEnemyPhase();
  }

  let phaseToken = 0;
  async function runEnemyPhase() {
    const my = ++phaseToken;
    busy = true;
    await sleep(800);
    for (const e of alive("enemy").slice()) {
      if (my !== phaseToken || g.status !== "playing") break;
      if (e.hp <= 0) continue;
      const plan = planFor(e, g.units);
      if (!plan) continue;
      g.inspect = e.id;
      tick();
      await sleep(200);
      if (plan.x !== e.x || plan.y !== e.y) {
        const { prev } = moveField(e, g.units);
        const path = tracePath(prev, e.x, e.y, plan.x, plan.y);
        if (path.length) await walkPath(e, path);
      }
      if (plan.kind === "attack") {
        const foe = g.units.find((u) => u.id === plan.foe);
        if (foe && foe.hp > 0) {
          await sleep(150);
          await runCombat(e, foe);
        }
      }
      checkEnd();
      await sleep(160);
    }
    if (my !== phaseToken) return;
    busy = false;
    if (g.status === "playing") endEnemyPhase();
  }

  function endEnemyPhase() {
    g.turn += 1;
    g.phase = "player";
    g.units.forEach((u) => {
      u.acted = false;
      if (u.hp > 0) u.view.mats.forEach((m) => (m.opacity = 1));
    });
    for (const u of alive("player")) {
      const t = cell(u.x, u.y);
      if (t.heal && u.hp < u.maxHp) {
        const a = Math.min(u.maxHp - u.hp, Math.ceil(u.maxHp * t.heal));
        u.hp += a;
        floater(u, "+" + a, C.green);
      }
    }
    g.banner = { text: "Player Phase", side: "player", n: g.banner.n + 1 };
    say("Turn " + g.turn + " begins.");
    tick();
  }

  function checkEnd() {
    if (g.status !== "playing") return;
    if (!alive("enemy").length) {
      g.status = "win";
      g.banner = { text: "Victory", side: "player", n: g.banner.n + 1 };
      say("All enemies routed.");
    } else {
      const lord = g.units.find((u) => u.lord);
      if (!alive("player").length || (lord && lord.hp <= 0)) {
        g.status = "lose";
        g.banner = { text: "Defeat", side: "enemy", n: g.banner.n + 1 };
        say(lord && lord.hp <= 0 ? "Kaelen has fallen." : "The company is lost.");
      }
    }
    tick();
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
      if (here) { g.inspect = here.id; tick(); return; }
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
    wait: () => finishUnit(g.units.find((z) => z.id === g.sel.id)),
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
    matThreat.uniforms.uTime.value = t;
    ringMat.uniforms.uTime.value = t;
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
