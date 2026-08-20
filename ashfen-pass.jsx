import React, { useRef, useEffect, useReducer, useState } from "react";
import * as THREE from "three";

/* =========================================================================
   ASHFEN PASS - playable build

   File is sectioned for a clean split when this moves into a repo:

     SECTION 1  map data + terrain rules ....... src/core/map.js
     SECTION 2  weapons, roster, palettes ...... src/core/data.js
     SECTION 3  pathfinding .................... src/core/path.js
     SECTION 4  combat math .................... src/core/combat.js
     SECTION 5  enemy ai ....................... src/core/ai.js
     SECTION 6  shaders ........................ src/view/shaders.js
     SECTION 7  mesh builders .................. src/view/meshes.js
     SECTION 8  scene, loop, game flow ......... src/view/scene.js
     SECTION 9  react ui overlay ............... src/ui/

   Sections 1 to 5 import nothing from three.js. That is deliberate: the
   rules are testable in isolation and the renderer is replaceable.
   ========================================================================= */

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const SERIF = "Georgia, 'Iowan Old Style', 'Times New Roman', serif";

const C = {
  parch: "#e9e0c8", parchDim: "#d8ccae", ink: "#221c12", inkSoft: "#5c5140",
  rule: "#b3a586", blue: "#2f5d8c", blueLite: "#7fb0e8", red: "#9d2f33",
  redLite: "#e0868a", gold: "#c8a04a", green: "#5f8a4a", table: "#0c0f16",
};

/* ============================ SECTION 1: MAP ============================= */

const MAP = [
  "TT..^^^^..TT",
  "T...^*K*^..T",
  "....^^*^^...",
  "T....^^^....",
  "~~~bb~~~bb~~",
  "............",
  "..T......T..",
  "...,,,,,....",
  "..,,....,,..",
  "T..........T",
];
const MW = 12, MH = 10;
const CX = (MW - 1) / 2, CZ = (MH - 1) / 2;

const TYPES = {
  ".": { name: "Plain", h: 0, cost: 1, def: 0, avo: 0, heal: 0, top: 0x6f9a4e, side: 0x6b5a3e },
  ",": { name: "Path", h: 0, cost: 1, def: 0, avo: 0, heal: 0, top: 0xa08a5c, side: 0x6b5a3e },
  T: { name: "Wood", h: 0, cost: 2, def: 1, avo: 20, heal: 0, top: 0x5f8a46, side: 0x6b5a3e, tree: true },
  "^": { name: "Hill", h: 0.6, cost: 2, def: 1, avo: 20, heal: 0, top: 0x7ba055, side: 0x7d6b4c },
  "*": { name: "Ridge", h: 1.2, cost: 2, def: 2, avo: 30, heal: 0, top: 0x8e9270, side: 0x8a8068 },
  K: { name: "Keep", h: 1.2, cost: 2, def: 2, avo: 20, heal: 0.2, top: 0x9a9484, side: 0x8a8068, keep: true },
  "~": { name: "River", h: -0.35, cost: 99, def: 0, avo: 0, heal: 0, top: 0x3d5a48, side: 0x4a4034, water: true, block: true },
  b: { name: "Bridge", h: -0.35, walk: 0, cost: 1, def: 0, avo: 0, heal: 0, top: 0x3d5a48, side: 0x4a4034, water: true, bridge: true },
};

const cell = (x, y) => TYPES[MAP[y][x]];
const lvlH = (x, y) => {
  const t = cell(x, y);
  return t.walk !== undefined ? t.walk : t.h;
};
const walkable = (x, y) => !cell(x, y).block;
const inB = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH;
const CLIMB = 0.7;

/* =========================== SECTION 2: DATA ============================= */

const WEAPONS = {
  ironSword: { name: "Iron Sword", type: "sword", mt: 5, hit: 90, crit: 0, rmin: 1, rmax: 1 },
  shamshir: {
    name: "Shamshir", type: "sword", mt: 9, hit: 95, crit: 25, rmin: 1, rmax: 1,
    personal: true, bonus: { spd: 2, def: 1 },
  },
  ironLance: { name: "Iron Lance", type: "lance", mt: 7, hit: 80, crit: 0, rmin: 1, rmax: 1 },
  ironAxe: { name: "Iron Axe", type: "axe", mt: 8, hit: 75, crit: 0, rmin: 1, rmax: 1 },
  steelAxe: { name: "Steel Axe", type: "axe", mt: 11, hit: 65, crit: 10, rmin: 1, rmax: 1 },
  ironBow: { name: "Iron Bow", type: "bow", mt: 6, hit: 85, crit: 0, rmin: 2, rmax: 2 },
  fire: { name: "Fire", type: "anima", mt: 5, hit: 90, crit: 0, rmin: 1, rmax: 2, magic: true },
  heal: { name: "Heal", type: "staff", mt: 0, hit: 100, crit: 0, rmin: 1, rmax: 1, magic: true, staff: true, power: 10 },
};

/* sword beats axe, axe beats lance, lance beats sword */
const BEATS = { sword: "axe", axe: "lance", lance: "sword" };

const PALS = {
  lord: { tunic: 0x3f6db5, trim: 0xd9ab45, cape: 0x2b4b86, pants: 0x3c444b, boot: 0x4a3323, skin: "#e9b88f", eye: "#241a14", hair: "#3b2a1b", helm: 0xc9cfe0, plume: 0xd9ab45, blade: 0xdfe7f2, grip: 0x6a4a34 },
  knight: { tunic: 0x8d97a8, trim: 0x5e6878, cape: 0x4d5666, pants: 0x474d55, boot: 0x3f382e, skin: "#e0ab84", eye: "#241a14", hair: "#33302c", helm: 0xb9c0ce, plume: 0x7f93b8, blade: 0xdfe7f2, grip: 0x555a63 },
  fighter: { tunic: 0xa8683a, trim: 0x6d4326, cape: 0x7d4a28, pants: 0x54483a, boot: 0x4a3323, skin: "#d9a074", eye: "#241a14", hair: "#7d3f22", helm: 0x8a5a30, plume: 0xc08a4a, blade: 0xcfd6df, grip: 0x5f4028 },
  archer: { tunic: 0x4d7a45, trim: 0xcfc089, cape: 0x385c32, pants: 0x574d38, boot: 0x4a3323, skin: "#e9b88f", eye: "#241a14", hair: "#6f4a22", helm: 0x6f5233, plume: 0x8fb45a, blade: 0xc9b083, grip: 0x7a5a34 },
  mage: { tunic: 0x6a4a9d, trim: 0xd9ab45, cape: 0x4e3676, pants: 0x413a52, boot: 0x3d3244, skin: "#efc79f", eye: "#241a14", hair: "#c2a35e", helm: 0x7d5ab0, plume: 0xd9ab45, blade: 0xd9ab45, grip: 0x5a4030 },
  cleric: { tunic: 0xd6cdb4, trim: 0x8fa8c4, cape: 0xc0b79c, pants: 0x9a927c, boot: 0x6a5f4a, skin: "#efc79f", eye: "#241a14", hair: "#8a6a3a", helm: 0xe4dcc6, plume: 0x8fa8c4, blade: 0xe8e2cf, grip: 0x9a8a6a },
  foe: { tunic: 0x9d3339, trim: 0x3a2020, cape: 0x6d2228, pants: 0x483837, boot: 0x3d2a22, skin: "#c9926c", eye: "#1b1210", hair: "#2b1a16", helm: 0x8e5b52, plume: 0xc04a44, blade: 0xd8cfc6, grip: 0x6a4a34 },
  boss: { tunic: 0x7a2228, trim: 0xc8a04a, cape: 0x4d1418, pants: 0x3d3130, boot: 0x2f211c, skin: "#b9805e", eye: "#1b1210", hair: "#1f1310", helm: 0x6d4a44, plume: 0xc8a04a, blade: 0xe4dcd2, grip: 0x4a3324 },
};

const ROSTER = [
  { name: "Kaelen", cls: "Lord", pal: "lord", team: "player", x: 4, y: 8, mov: 5, lvl: 5, weapon: "shamshir", lord: true,
    stats: { hp: 20, str: 7, mag: 0, skl: 8, spd: 9, lck: 7, def: 6, res: 2 },
    growths: { hp: 70, str: 50, mag: 5, skl: 50, spd: 55, lck: 55, def: 35, res: 25 } },
  { name: "Bram", cls: "Knight", pal: "knight", team: "player", x: 3, y: 8, mov: 4, lvl: 4, weapon: "ironLance",
    stats: { hp: 23, str: 8, mag: 0, skl: 5, spd: 4, lck: 3, def: 11, res: 1 },
    growths: { hp: 80, str: 55, mag: 5, skl: 40, spd: 25, lck: 30, def: 60, res: 20 } },
  { name: "Doran", cls: "Fighter", pal: "fighter", team: "player", x: 5, y: 8, mov: 5, lvl: 4, weapon: "ironAxe",
    stats: { hp: 26, str: 10, mag: 0, skl: 5, spd: 6, lck: 4, def: 6, res: 0 },
    growths: { hp: 85, str: 60, mag: 0, skl: 40, spd: 40, lck: 35, def: 35, res: 15 } },
  { name: "Nessa", cls: "Archer", pal: "archer", team: "player", x: 4, y: 9, mov: 5, lvl: 3, weapon: "ironBow",
    stats: { hp: 19, str: 6, mag: 0, skl: 9, spd: 10, lck: 5, def: 4, res: 2 },
    growths: { hp: 60, str: 45, mag: 5, skl: 60, spd: 60, lck: 45, def: 25, res: 20 } },
  { name: "Ilya", cls: "Mage", pal: "mage", team: "player", x: 3, y: 9, mov: 5, lvl: 3, weapon: "fire",
    stats: { hp: 17, str: 2, mag: 8, skl: 7, spd: 8, lck: 6, def: 3, res: 7 },
    growths: { hp: 55, str: 10, mag: 60, skl: 50, spd: 50, lck: 40, def: 20, res: 50 } },
  { name: "Mira", cls: "Cleric", pal: "cleric", team: "player", x: 5, y: 9, mov: 5, lvl: 3, weapon: "heal",
    stats: { hp: 16, str: 1, mag: 6, skl: 5, spd: 7, lck: 9, def: 3, res: 6 },
    growths: { hp: 55, str: 10, mag: 50, skl: 40, spd: 45, lck: 60, def: 20, res: 55 } },

  { name: "Garrick", cls: "Warlord", pal: "boss", team: "enemy", x: 6, y: 1, mov: 4, lvl: 8, weapon: "steelAxe", boss: true, ai: "guard",
    stats: { hp: 30, str: 11, mag: 0, skl: 8, spd: 6, lck: 3, def: 9, res: 3 } },
  { name: "Soldier", cls: "Soldier", pal: "foe", team: "enemy", x: 5, y: 2, mov: 4, lvl: 3, weapon: "ironLance", ai: "charge",
    stats: { hp: 19, str: 7, mag: 0, skl: 4, spd: 4, lck: 1, def: 6, res: 1 } },
  { name: "Sniper", cls: "Archer", pal: "foe", team: "enemy", x: 8, y: 2, mov: 5, lvl: 3, weapon: "ironBow", ai: "guard",
    stats: { hp: 18, str: 6, mag: 0, skl: 7, spd: 7, lck: 1, def: 4, res: 2 } },
  { name: "Brigand", cls: "Brigand", pal: "foe", team: "enemy", x: 4, y: 3, mov: 5, lvl: 3, weapon: "ironAxe", ai: "charge",
    stats: { hp: 22, str: 9, mag: 0, skl: 4, spd: 5, lck: 0, def: 5, res: 0 } },
  { name: "Brigand", cls: "Brigand", pal: "foe", team: "enemy", x: 9, y: 5, mov: 5, lvl: 3, weapon: "ironAxe", ai: "charge",
    stats: { hp: 22, str: 9, mag: 0, skl: 4, spd: 5, lck: 0, def: 5, res: 0 } },
  { name: "Mercenary", cls: "Mercenary", pal: "foe", team: "enemy", x: 6, y: 6, mov: 5, lvl: 4, weapon: "ironSword", ai: "charge",
    stats: { hp: 21, str: 7, mag: 0, skl: 8, spd: 9, lck: 2, def: 5, res: 1 } },
];

function makeUnit(d, i) {
  const s = d.stats;
  return {
    id: "u" + i, name: d.name, cls: d.cls, pal: d.pal, team: d.team,
    x: d.x, y: d.y, mov: d.mov, lvl: d.lvl, exp: 0,
    maxHp: s.hp, hp: s.hp,
    str: s.str, mag: s.mag, skl: s.skl, spd: s.spd, lck: s.lck, def: s.def, res: s.res,
    weaponKey: d.weapon, growths: d.growths || null,
    ai: d.ai || "charge", boss: !!d.boss, lord: !!d.lord,
    vulnerary: d.team === "player" ? 1 : 0,
    acted: false,
  };
}

/* ========================= SECTION 3: PATHFINDING ======================== */

const K = (x, y) => x + "," + y;
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const man = (a, b, c, d) => Math.abs(a - c) + Math.abs(b - d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (n) => Math.floor(Math.random() * n);
const roll2RN = () => (rnd(100) + rnd(100)) / 2;

function moveField(unit, units) {
  const blocked = new Set();
  units.forEach((u) => {
    if (u.hp > 0 && u.team !== unit.team) blocked.add(K(u.x, u.y));
  });
  const dist = new Map([[K(unit.x, unit.y), 0]]);
  const prev = new Map();
  const q = [[unit.x, unit.y, 0]];
  while (q.length) {
    q.sort((a, b) => a[2] - b[2]);
    const [x, y, c] = q.shift();
    if (c > (dist.get(K(x, y)) ?? 1e9)) continue;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!inB(nx, ny) || !walkable(nx, ny) || blocked.has(K(nx, ny))) continue;
      if (Math.abs(lvlH(nx, ny) - lvlH(x, y)) > CLIMB) continue;
      const nc = c + cell(nx, ny).cost;
      if (nc > unit.mov) continue;
      if (nc < (dist.get(K(nx, ny)) ?? 1e9)) {
        dist.set(K(nx, ny), nc);
        prev.set(K(nx, ny), K(x, y));
        q.push([nx, ny, nc]);
      }
    }
  }
  return { dist, prev };
}

function fieldFrom(sx, sy, unit, units) {
  const blocked = new Set();
  units.forEach((u) => {
    if (u.hp > 0 && u.team !== unit.team && !(u.x === sx && u.y === sy)) blocked.add(K(u.x, u.y));
  });
  const dist = new Map([[K(sx, sy), 0]]);
  const q = [[sx, sy, 0]];
  while (q.length) {
    q.sort((a, b) => a[2] - b[2]);
    const [x, y, c] = q.shift();
    if (c > (dist.get(K(x, y)) ?? 1e9)) continue;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!inB(nx, ny) || !walkable(nx, ny) || blocked.has(K(nx, ny))) continue;
      if (Math.abs(lvlH(nx, ny) - lvlH(x, y)) > CLIMB) continue;
      const nc = c + cell(nx, ny).cost;
      if (nc < (dist.get(K(nx, ny)) ?? 1e9)) {
        dist.set(K(nx, ny), nc);
        q.push([nx, ny, nc]);
      }
    }
  }
  return dist;
}

function standable(dist, unit, units) {
  const out = [];
  for (const k of dist.keys()) {
    const [x, y] = k.split(",").map(Number);
    if (!units.some((u) => u.hp > 0 && u.x === x && u.y === y && u.id !== unit.id)) out.push(k);
  }
  return out;
}

function reachTiles(unit, units) {
  const w = WEAPONS[unit.weaponKey];
  const { dist } = moveField(unit, units);
  const stand = standable(dist, unit, units);
  const atk = new Set();
  for (const k of stand) {
    const [x, y] = k.split(",").map(Number);
    for (let dx = -w.rmax; dx <= w.rmax; dx++) {
      for (let dy = -w.rmax; dy <= w.rmax; dy++) {
        const d = Math.abs(dx) + Math.abs(dy);
        if (d < w.rmin || d > w.rmax) continue;
        if (inB(x + dx, y + dy)) atk.add(K(x + dx, y + dy));
      }
    }
  }
  return { dist, stand: new Set(stand), atk };
}

function tracePath(prev, sx, sy, tx, ty) {
  const path = [];
  let cur = K(tx, ty);
  const start = K(sx, sy);
  let g = 0;
  while (cur !== start && g++ < 300) {
    const [x, y] = cur.split(",").map(Number);
    path.unshift({ x, y });
    const p = prev.get(cur);
    if (!p) return [];
    cur = p;
  }
  return path;
}

/* =========================== SECTION 4: COMBAT =========================== */

const wep = (u) => WEAPONS[u.weaponKey];

function eff(u, stat) {
  const w = wep(u);
  return u[stat] + (w && w.bonus ? w.bonus[stat] || 0 : 0);
}
function wepBonus(u, stat) {
  const w = wep(u);
  return w && w.bonus ? w.bonus[stat] || 0 : 0;
}

function triBonus(a, b) {
  if (!a || !b) return 0;
  if (BEATS[a] === b) return 1;
  if (BEATS[b] === a) return -1;
  return 0;
}

function strikeCalc(att, def) {
  const w = wep(att), dw = wep(def);
  const tri = triBonus(w.type, dw && !dw.staff ? dw.type : null);
  const t = cell(def.x, def.y);
  const power = (w.magic ? eff(att, "mag") : eff(att, "str")) + w.mt + tri;
  const guard = w.magic ? eff(def, "res") : eff(def, "def") + t.def;
  const dmg = Math.max(0, power - guard);
  const raw = w.hit + eff(att, "skl") * 2 + Math.floor(eff(att, "lck") / 2) + tri * 15;
  const avo = eff(def, "spd") * 2 + eff(def, "lck") + t.avo;
  return {
    dmg,
    acc: clamp(Math.round(raw - avo), 0, 100),
    crit: clamp(w.crit + Math.floor(eff(att, "skl") / 2) - eff(def, "lck"), 0, 100),
    doubles: eff(att, "spd") - eff(def, "spd") >= 4,
    tri,
  };
}

function canCounter(def, att) {
  const dw = wep(def);
  if (!dw || dw.staff) return false;
  const d = man(def.x, def.y, att.x, att.y);
  return d >= dw.rmin && d <= dw.rmax;
}

function forecastOf(att, def) {
  const a = strikeCalc(att, def);
  const counters = canCounter(def, att);
  return { a, d: counters ? strikeCalc(def, att) : null, counters };
}

function simulateCombat(att, def) {
  const { a, d, counters } = forecastOf(att, def);
  const order = ["a"];
  if (counters) order.push("d");
  if (a.doubles) order.push("a");
  else if (counters && d.doubles) order.push("d");

  let hpA = att.hp, hpD = def.hp;
  const strikes = [];
  for (const who of order) {
    if (hpA <= 0 || hpD <= 0) break;
    const st = who === "a" ? a : d;
    const landed = roll2RN() < st.acc;
    const crit = landed && rnd(100) < st.crit;
    const dmg = landed ? (crit ? st.dmg * 3 : st.dmg) : 0;
    if (who === "a") hpD = Math.max(0, hpD - dmg);
    else hpA = Math.max(0, hpA - dmg);
    strikes.push({ who, landed, crit, dmg, hpAfter: who === "a" ? hpD : hpA });
  }
  return { strikes, a, d, counters };
}

function expFor(att, def, killed) {
  const diff = def.lvl - att.lvl;
  if (killed) return clamp(20 + diff * 3 + (def.boss ? 40 : 0), 8, 100);
  return clamp(10 + diff, 1, 60);
}

const CAPS = { str: 22, mag: 22, skl: 24, spd: 24, lck: 26, def: 22, res: 22 };

function levelUp(u) {
  const g = u.growths || {};
  const gains = {};
  const hpUp = rnd(100) < (g.hp ?? 50) ? 1 + (rnd(100) < 25 ? 1 : 0) : 0;
  if (hpUp) {
    u.maxHp = Math.min(60, u.maxHp + hpUp);
    u.hp = Math.min(u.maxHp, u.hp + hpUp);
    gains.HP = hpUp;
  }
  for (const s of ["str", "mag", "skl", "spd", "lck", "def", "res"]) {
    if (rnd(100) < (g[s] ?? 30) && u[s] < CAPS[s]) {
      u[s] += 1;
      gains[s.toUpperCase()] = 1;
    }
  }
  u.lvl += 1;
  return gains;
}

/* ============================= SECTION 5: AI ============================= */

function planFor(e, units) {
  const w = wep(e);
  const foes = units.filter((u) => u.team === "player" && u.hp > 0);
  if (!foes.length) return null;

  let options;
  if (e.ai === "guard") {
    options = [K(e.x, e.y)];
  } else {
    const { dist } = moveField(e, units);
    options = standable(dist, e, units);
  }

  let best = null;
  for (const k of options) {
    const [x, y] = k.split(",").map(Number);
    const ghost = { ...e, x, y };
    const t = cell(x, y);
    for (const f of foes) {
      const d = man(x, y, f.x, f.y);
      if (d < w.rmin || d > w.rmax) continue;
      const mine = strikeCalc(ghost, f);
      const hits = mine.doubles ? 2 : 1;
      const expect = (mine.dmg * hits * mine.acc) / 100;
      const kill = mine.dmg * hits >= f.hp && mine.acc >= 55;
      const back = canCounter(f, ghost) ? strikeCalc(f, ghost) : null;
      const risk = back ? (back.dmg * (back.doubles ? 2 : 1) * back.acc) / 100 : 0;
      let score = expect * 3 - risk * 1.4 + t.def * 2 + t.avo / 10;
      if (kill) score += 120;
      if (f.lord) score += 12;
      score += (f.maxHp - f.hp) * 0.4;
      if (!best || score > best.score) best = { score, x, y, foe: f.id };
    }
  }
  if (best) return { kind: "attack", ...best };
  if (e.ai === "guard") return null;

  let near = null;
  for (const f of foes) {
    const d = man(e.x, e.y, f.x, f.y);
    if (!near || d < near.d) near = { f, d };
  }
  const field = fieldFrom(near.f.x, near.f.y, e, units);
  const { dist } = moveField(e, units);
  let step = null;
  for (const k of standable(dist, e, units)) {
    const v = field.get(k);
    if (v === undefined) continue;
    const [x, y] = k.split(",").map(Number);
    const t = cell(x, y);
    const sc = -v * 10 + t.avo / 20 + t.def;
    if (!step || sc > step.sc) step = { sc, x, y };
  }
  if (!step || (step.x === e.x && step.y === e.y)) return null;
  return { kind: "move", x: step.x, y: step.y };
}

function threatSet(units) {
  const s = new Set();
  for (const e of units.filter((u) => u.team === "enemy" && u.hp > 0)) {
    const w = wep(e);
    if (w.staff) continue;
    if (e.ai === "guard") {
      for (let dx = -w.rmax; dx <= w.rmax; dx++) {
        for (let dy = -w.rmax; dy <= w.rmax; dy++) {
          const d = Math.abs(dx) + Math.abs(dy);
          if (d >= w.rmin && d <= w.rmax && inB(e.x + dx, e.y + dy)) s.add(K(e.x + dx, e.y + dy));
        }
      }
    } else {
      reachTiles(e, units).atk.forEach((k) => s.add(k));
    }
  }
  return s;
}

/* =========================== SECTION 6: SHADERS ========================== */

const POST_VERT = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`;
const POST_FRAG = `
  precision mediump float;
  uniform sampler2D tDiffuse; uniform float uLevels; uniform float uVignette;
  varying vec2 vUv;
  void main(){
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    if (uLevels < 63.0) c = floor(c*uLevels + 0.5)/uLevels;
    c = mix(c, c*vec3(1.06,1.01,0.93), 0.5);
    vec2 d = vUv-0.5; c *= 1.0 - dot(d,d)*uVignette;
    gl_FragColor = vec4(c,1.0);
  }`;

const TILE_VERT = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const TILE_FRAG = `
  precision mediump float;
  uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
  void main(){
    vec2 p=vUv;
    float b=min(min(p.x,1.-p.x),min(p.y,1.-p.y));
    float edge=smoothstep(0.10,0.05,b);
    float pulse=0.80+sin(uTime*2.6)*0.12;
    gl_FragColor=vec4(uColor,(edge*0.75+0.26)*pulse);
  }`;

const RING_FRAG = `
  precision mediump float;
  uniform float uTime; varying vec2 vUv;
  void main(){
    float d=length(vUv-0.5)*2.0;
    float r=0.74+sin(uTime*4.5)*0.06;
    float ring=smoothstep(0.10,0.0,abs(d-r));
    float glow=smoothstep(1.0,0.15,d)*0.16;
    gl_FragColor=vec4(vec3(1.0,0.88,0.45), ring*0.95+glow);
  }`;

const WATER_VERT = `
  varying vec3 vPos;
  void main(){ vPos=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const WATER_FRAG = `
  precision mediump float;
  uniform float uTime; varying vec3 vPos;
  void main(){
    float w=sin(vPos.x*2.2+uTime*1.3)*0.5+sin(vPos.z*3.1-uTime*0.9)*0.5;
    vec3 c=mix(vec3(0.12,0.27,0.34), vec3(0.19,0.40,0.47), step(0.05,w));
    c=mix(c, vec3(0.36,0.60,0.66), step(0.80,w));
    gl_FragColor=vec4(c,1.0);
  }`;

/* =========================== SECTION 7: MESHES =========================== */

function buildTerrain() {
  const pos = [], nrm = [], col = [];
  const A = new THREE.Vector3(), B = new THREE.Vector3(), N = new THREE.Vector3();
  const c = new THREE.Color();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const UP = V(0, 1, 0);

  function addQuad(p0, p1, p2, p3, want, hex) {
    A.subVectors(p1, p0);
    B.subVectors(p2, p0);
    N.crossVectors(A, B).normalize();
    let a = p0, b = p1, d = p2, e = p3;
    if (N.dot(want) < 0) { b = p3; e = p1; N.negate(); }
    c.setHex(hex);
    for (const tri of [[a, b, d], [a, d, e]]) {
      for (const p of tri) {
        pos.push(p.x, p.y, p.z);
        nrm.push(N.x, N.y, N.z);
        col.push(c.r, c.g, c.b);
      }
    }
  }

  for (let ty = 0; ty < MH; ty++) {
    for (let tx = 0; tx < MW; tx++) {
      const t = cell(tx, ty), h = t.h;
      const x0 = tx - CX - 0.5, x1 = tx - CX + 0.5;
      const z0 = ty - CZ - 0.5, z1 = ty - CZ + 0.5;
      addQuad(V(x0, h, z1), V(x1, h, z1), V(x1, h, z0), V(x0, h, z0), UP, t.top);
      const sides = [
        { dx: 1, dy: 0, want: V(1, 0, 0), a: V(x1, h, z1), b: V(x1, h, z0) },
        { dx: -1, dy: 0, want: V(-1, 0, 0), a: V(x0, h, z0), b: V(x0, h, z1) },
        { dx: 0, dy: 1, want: V(0, 0, 1), a: V(x0, h, z1), b: V(x1, h, z1) },
        { dx: 0, dy: -1, want: V(0, 0, -1), a: V(x1, h, z0), b: V(x0, h, z0) },
      ];
      for (const s of sides) {
        const nx = tx + s.dx, ny = ty + s.dy;
        const nh = inB(nx, ny) ? cell(nx, ny).h : h - 1.6;
        if (nh >= h - 0.001) continue;
        addQuad(V(s.a.x, h, s.a.z), V(s.b.x, h, s.b.z), V(s.b.x, nh, s.b.z), V(s.a.x, nh, s.a.z), s.want, t.side);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return g;
}

function faceTexture(P) {
  const c = document.createElement("canvas");
  c.width = 32; c.height = 32;
  const x = c.getContext("2d");
  x.fillStyle = P.skin; x.fillRect(0, 0, 32, 32);
  x.fillStyle = P.hair; x.fillRect(0, 0, 32, 7); x.fillRect(5, 10, 7, 2); x.fillRect(20, 10, 7, 2);
  x.fillStyle = P.eye; x.fillRect(6, 14, 5, 7); x.fillRect(21, 14, 5, 7);
  x.fillStyle = "#ffffff"; x.fillRect(7, 15, 2, 2); x.fillRect(22, 15, 2, 2);
  x.fillStyle = "rgba(0,0,0,0.28)"; x.fillRect(14, 26, 4, 1);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  return t;
}

function buildUnitMesh(palKey, weaponKey) {
  const P = PALS[palKey];
  const mats = [];
  const M = (hex) => {
    const m = new THREE.MeshLambertMaterial({ color: hex });
    mats.push(m);
    return m;
  };
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.19), M(P.tunic));
  torso.position.y = 0.4;
  body.add(torso);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.21), M(P.trim));
  belt.position.y = 0.3;
  body.add(belt);
  const cape = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.04), M(P.cape));
  cape.position.set(0, 0.36, -0.11);
  body.add(cape);

  const legGeo = new THREE.BoxGeometry(0.1, 0.24, 0.11); legGeo.translate(0, -0.12, 0);
  const bootGeo = new THREE.BoxGeometry(0.12, 0.07, 0.15); bootGeo.translate(0, -0.255, 0.02);
  const mkLeg = (sx) => {
    const g = new THREE.Group();
    g.position.set(sx * 0.08, 0.28, 0);
    g.add(new THREE.Mesh(legGeo, M(P.pants)));
    g.add(new THREE.Mesh(bootGeo, M(P.boot)));
    body.add(g);
    return g;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);

  const armGeo = new THREE.BoxGeometry(0.085, 0.22, 0.095); armGeo.translate(0, -0.11, 0);
  const handGeo = new THREE.BoxGeometry(0.095, 0.07, 0.1); handGeo.translate(0, -0.245, 0);
  const skinHex = new THREE.Color(P.skin).getHex();
  const mkArm = (sx) => {
    const g = new THREE.Group();
    g.position.set(sx * 0.19, 0.5, 0);
    g.add(new THREE.Mesh(armGeo, M(P.tunic)));
    g.add(new THREE.Mesh(handGeo, M(skinHex)));
    body.add(g);
    return g;
  };
  const armL = mkArm(-1), armR = mkArm(1);

  // weapon shape follows the equipped type
  const w = WEAPONS[weaponKey];
  const weapon = new THREE.Group();
  weapon.position.set(0, -0.25, 0.02);
  if (w.type === "bow") {
    const limb = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.018, 5, 10, Math.PI * 1.25), M(P.grip));
    limb.rotation.z = Math.PI / 2;
    weapon.add(limb);
    const string = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.36, 0.008), M(0xe8e2cf));
    string.position.z = 0.1;
    weapon.add(string);
  } else if (w.staff) {
    const rod = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.03), M(P.grip));
    rod.position.y = 0.24;
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), M(P.plume));
    orb.position.y = 0.52;
    weapon.add(rod, orb);
  } else if (w.magic) {
    const tome = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.24, 0.06), M(P.tunic));
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 0.02), M(P.trim));
    edge.position.z = -0.03;
    weapon.add(tome, edge);
  } else if (w.type === "axe") {
    const haft = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.46, 0.035), M(P.grip));
    haft.position.y = 0.22;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.19), M(P.blade));
    head.position.set(0.06, 0.38, 0);
    weapon.add(haft, head);
  } else if (w.type === "lance") {
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.62, 0.03), M(P.grip));
    shaft.position.y = 0.3;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 4), M(P.blade));
    tip.position.y = 0.68;
    weapon.add(shaft, tip);
  } else {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.42, 0.015), M(P.blade));
    blade.position.y = 0.26;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.04), M(P.plume));
    guard.position.y = 0.05;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.04), M(P.grip));
    weapon.add(blade, guard, grip);
  }
  weapon.rotation.x = 1.5;
  armR.add(weapon);

  const headG = new THREE.Group();
  headG.position.y = 0.55;
  body.add(headG);
  const skinMat = M(skinHex);
  const hairMat = M(new THREE.Color(P.hair).getHex());
  const faceMat = new THREE.MeshLambertMaterial({ map: faceTexture(P) });
  mats.push(faceMat);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.32, 0.3),
    [skinMat, skinMat, hairMat, skinMat, faceMat, hairMat]
  );
  head.position.y = 0.16;
  headG.add(head);
  const helm = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.11, 0.33), M(P.helm));
  helm.position.y = 0.29;
  headG.add(helm);
  const plume = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.13, 0.2), M(P.plume));
  plume.position.set(0, 0.4, -0.03);
  headG.add(plume);

  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, parts: { body, headG, armL, armR, legL, legR, weapon }, mats };
}

function buildTree() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.5, 6),
    new THREE.MeshLambertMaterial({ color: 0x6b4a2c }));
  trunk.position.y = 0.25;
  g.add(trunk);
  const a = new THREE.MeshLambertMaterial({ color: 0x39662f, flatShading: true });
  const b = new THREE.MeshLambertMaterial({ color: 0x477c39, flatShading: true });
  const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.55, 7), a); c1.position.y = 0.66;
  const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.33, 0.48, 7), b); c2.position.y = 0.95; c2.rotation.y = 0.5;
  const c3 = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.38, 7), b); c3.position.y = 1.2;
  g.add(c1, c2, c3);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function buildKeep() {
  const g = new THREE.Group();
  const stone = new THREE.MeshLambertMaterial({ color: 0x9a9484, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x6e6a5e });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.46, 0.85, 8), stone);
  base.position.y = 0.42;
  g.add(base);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.16, 0.13), stone);
    m.position.set(Math.cos(a) * 0.38, 0.92, Math.sin(a) * 0.38);
    m.rotation.y = -a;
    g.add(m);
  }
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.32, 0.06), dark);
  door.position.set(0, 0.16, 0.44);
  g.add(door);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function buildBridge() {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x6b5133 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.09, 1.06), wood);
  deck.position.y = -0.045;
  g.add(deck);
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.05, 0.05), dark);
    rail.position.set(0, 0.2, s * 0.46);
    g.add(rail);
    for (const x of [-0.42, 0.42]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.06), dark);
      post.position.set(x, 0.08, s * 0.46);
      g.add(post);
    }
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/* ==================== SECTION 8 + 9: SCENE, FLOW, UI ===================== */

const RES = [
  { label: "400x240 (3DS)", h: 240 },
  { label: "640x384", h: 384 },
  { label: "960x576", h: 576 },
  { label: "native", h: 0 },
];

function newGame() {
  return {
    units: ROSTER.map(makeUnit),
    turn: 1, phase: "player", status: "playing",
    sel: null, danger: false, inspect: null, forecast: null,
    levelUp: null, banner: { text: "Player Phase", side: "player", n: 0 },
    log: ["Turn 1 begins."],
  };
}

export default function AshfenPass() {
  const mountRef = useRef(null);
  const menuRef = useRef(null);
  const apiRef = useRef({});
  const gs = useRef(null);
  if (!gs.current) gs.current = newGame();
  const g = gs.current;

  const [, tick] = useReducer((n) => n + 1, 0);
  const [floats, setFloats] = useState([]);
  const [cam, setCam] = useState({ pitch: 48, yaw: 0, fov: 30, zoom: 12, res: 0, post: true, levels: 32 });
  const camRef = useRef(cam);
  camRef.current = cam;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

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
  }, []);

  /* ------------------------------- UI layer ------------------------------ */

  const api = apiRef.current;
  const sel = g.sel;
  const selUnit = sel ? g.units.find((u) => u.id === sel.id) : null;
  const inspected = g.inspect ? g.units.find((u) => u.id === g.inspect) : null;
  const fc = g.forecast
    ? (() => {
        const a = g.units.find((u) => u.id === g.forecast.attackerId);
        const d = g.units.find((u) => u.id === g.forecast.targetId);
        return a && d ? { a, d, f: forecastOf(a, d) } : null;
      })()
    : null;
  const foesLeft = g.units.filter((u) => u.team === "enemy" && u.hp > 0).length;

  return (
    <div style={{ background: C.table, color: C.parch, fontFamily: SERIF }} className="w-full p-3">
      <style>{`
        @keyframes sweepIn { 0%{transform:translateX(-100%);opacity:0} 18%{transform:translateX(0);opacity:1}
          78%{transform:translateX(0);opacity:1} 100%{transform:translateX(100%);opacity:0} }
        @keyframes riseOut { 0%{transform:translate(-50%,0);opacity:0} 20%{transform:translate(-50%,-8px);opacity:1}
          100%{transform:translate(-50%,-34px);opacity:0} }
        @keyframes popIn { 0%{transform:scale(.9);opacity:0} 100%{transform:scale(1);opacity:1} }
      `}</style>

      <div className="mx-auto" style={{ maxWidth: 980 }}>
        <div className="flex items-end justify-between flex-wrap gap-2 mb-2">
          <div>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.22em", color: C.gold }}>
              ROUT THE ENEMY COMPANY
            </div>
            <div style={{ fontSize: 21 }}>Ashfen Pass</div>
          </div>
          <div className="flex gap-2" style={{ fontFamily: MONO, fontSize: 11 }}>
            <Pill k="Turn" v={String(g.turn)} />
            <Pill k="Phase" v={g.phase === "player" ? "Player" : "Enemy"}
              tone={g.phase === "player" ? C.blueLite : C.redLite} />
            <Pill k="Foes" v={String(foesLeft)} />
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-3 items-start">
          {/* ---- viewport with html overlays ---- */}
          <div className="relative" style={{ flex: "1 1 560px", minWidth: 280 }}>
            <div
              ref={mountRef}
              style={{ width: "100%", height: 430, border: "2px solid #2f3746", background: "#9fc3d8", overflow: "hidden" }}
            />

            {/* damage numbers */}
            {floats.map((f) => (
              <div key={f.id} className="absolute"
                style={{
                  left: f.x, top: f.y, fontFamily: MONO, fontSize: 15, color: f.color,
                  textShadow: "0 1px 2px #000, 0 0 7px #000", pointerEvents: "none",
                  animation: "riseOut .9s ease-out forwards", zIndex: 12,
                }}>
                {f.text}
              </div>
            ))}

            {/* action menu */}
            <div ref={menuRef} className="absolute"
              style={{
                display: sel && sel.mode === "action" ? "block" : "none",
                width: 108, zIndex: 20, background: C.parch,
                border: "2px solid " + C.ink, boxShadow: "3px 3px 0 rgba(0,0,0,0.45)",
              }}>
              {selUnit && (wep(selUnit).staff ? (
                <Item label="Heal" disabled={!sel.targets.length} on={api.chooseHeal} />
              ) : (
                <Item label="Attack" disabled={!sel.targets.length} on={api.chooseAttack} />
              ))}
              <Item label="Vulnerary"
                disabled={!selUnit || selUnit.vulnerary <= 0 || selUnit.hp >= selUnit.maxHp}
                on={api.vulnerary} />
              <Item label="Wait" on={api.wait} />
              <Item label="Back" muted on={api.back} />
            </div>

            {/* phase banner */}
            <div key={g.banner.n} className="absolute flex items-center justify-center"
              style={{
                left: 0, right: 0, top: 190, height: 44, zIndex: 25, pointerEvents: "none",
                background: g.banner.side === "player" ? "rgba(47,93,140,0.92)" : "rgba(157,47,51,0.92)",
                borderTop: "2px solid " + C.gold, borderBottom: "2px solid " + C.gold,
                fontSize: 20, letterSpacing: "0.12em", animation: "sweepIn 1.5s ease-in-out forwards",
              }}>
              {g.banner.text}
            </div>

            {/* level up */}
            {g.levelUp && (
              <div className="absolute flex items-center justify-center"
                style={{ inset: 0, zIndex: 30, background: "rgba(10,12,18,0.5)", pointerEvents: "none" }}>
                <div style={{
                  background: C.parch, color: C.ink, border: "2px solid " + C.ink,
                  boxShadow: "4px 4px 0 rgba(0,0,0,0.5)", padding: "10px 14px",
                  minWidth: 176, animation: "popIn .18s ease-out",
                }}>
                  <div className="uppercase" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.18em" }}>
                    Level up
                  </div>
                  <div style={{ fontSize: 17, marginBottom: 4 }}>
                    {g.levelUp.name} &rarr; Lv {g.levelUp.lvl}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.inkSoft }}>
                    {Object.keys(g.levelUp.gains).length
                      ? Object.entries(g.levelUp.gains).map(([k, v]) => k + " +" + v).join("   ")
                      : "no growth this level"}
                  </div>
                </div>
              </div>
            )}

            {/* end screen */}
            {g.status !== "playing" && (
              <div className="absolute flex flex-col items-center justify-center gap-3"
                style={{ inset: 0, zIndex: 35, background: "rgba(10,12,18,0.78)" }}>
                <div style={{ fontSize: 32, color: g.status === "win" ? C.gold : C.redLite }}>
                  {g.status === "win" ? "Victory" : "Defeat"}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: C.parchDim }}>
                  reload the artifact to fight again
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 mt-2">
              <Btn on={api.endTurn} disabled={g.phase !== "player" || g.status !== "playing"} strong>
                End turn
              </Btn>
              <Btn on={api.toggleDanger} active={g.danger}>
                {g.danger ? "Hide threat" : "Show threat"}
              </Btn>
              <Btn on={() => setCam((c) => ({ ...c, yaw: (c.yaw + 90) % 360 }))}>Rotate 90&deg;</Btn>
              <Btn on={() => setCam((c) => ({ ...c, res: (c.res + 1) % RES.length }))}>
                {RES[cam.res].label}
              </Btn>
            </div>
          </div>

          {/* ---- side panels ---- */}
          <div className="flex flex-col gap-3" style={{ flex: "0 0 268px", width: "100%", maxWidth: 300 }}>
            {fc ? (
              <Card>
                <Eyebrow>Battle forecast</Eyebrow>
                <div className="flex items-stretch" style={{ fontFamily: MONO, fontSize: 12 }}>
                  <Side u={fc.a} s={fc.f.a} />
                  <div className="flex flex-col items-center px-2"
                    style={{ borderLeft: "1px solid " + C.rule, borderRight: "1px solid " + C.rule, color: C.inkSoft }}>
                    {["dmg", "hit", "crit", "hits"].map((l) => (
                      <div key={l} className="uppercase"
                        style={{ height: 22, lineHeight: "22px", fontSize: 10, letterSpacing: "0.12em" }}>{l}</div>
                    ))}
                  </div>
                  <Side u={fc.d} s={fc.f.counters ? fc.f.d : null} right />
                </div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.inkSoft, marginTop: 6 }}>
                  {triLine(fc.a, fc.d)}
                </div>
                <div className="flex gap-2 mt-2">
                  <Btn light strong on={() => api.confirmAttack(fc.d.id)}>Attack</Btn>
                  <Btn light on={api.cancelForecast}>Back</Btn>
                </div>
              </Card>
            ) : inspected ? (
              <UnitCard u={inspected} />
            ) : (
              <Card>
                <Eyebrow>Orders</Eyebrow>
                <p style={{ color: C.inkSoft, fontSize: 13, margin: "4px 0 0" }}>
                  Tap a unit to see its movement in blue and its reach in red. Tap a tile to
                  move, then pick an action. Drag the map to orbit, scroll to zoom.
                </p>
              </Card>
            )}

            <Card>
              <Eyebrow>Weapon triangle</Eyebrow>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.ink, lineHeight: 1.8 }}>
                <div>Sword &rarr; beats &rarr; Axe</div>
                <div>Axe &rarr; beats &rarr; Lance</div>
                <div>Lance &rarr; beats &rarr; Sword</div>
                <div style={{ color: C.inkSoft, marginTop: 4 }}>
                  Advantage gives +1 damage and +15 hit. Tomes hit Res and ignore terrain cover.
                </div>
              </div>
            </Card>

            <Card>
              <Eyebrow>Field log</Eyebrow>
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.inkSoft, maxHeight: 110, overflowY: "auto" }}>
                {g.log.map((l, i) => (
                  <div key={i} style={{ padding: "2px 0", borderBottom: "1px dotted " + C.rule }}>{l}</div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ ui fragments ----------------------------- */

function triLine(a, d) {
  const wa = wep(a), wd = wep(d);
  const t = triBonus(wa.type, wd && !wd.staff ? wd.type : null);
  const note = wa.magic ? " / strikes Res" : "";
  if (t > 0) return wa.name + " has the advantage over " + wd.name + note;
  if (t < 0) return wa.name + " is at a disadvantage against " + wd.name + note;
  return "No triangle bonus" + note;
}

function Side({ u, s, right }) {
  return (
    <div className={"flex-1 flex flex-col " + (right ? "items-end" : "items-start")}>
      <div style={{ fontFamily: SERIF, fontSize: 14 }}>{u.name}</div>
      <div style={{ fontSize: 10, color: C.inkSoft, marginBottom: 4 }}>
        {wep(u).name} &middot; HP {u.hp}/{u.maxHp}
      </div>
      {[s ? s.dmg : "--", s ? s.acc : "--", s ? s.crit : "--", s ? (s.doubles ? "x2" : "x1") : "--"].map((v, i) => (
        <div key={i} style={{ height: 22, lineHeight: "22px", fontSize: 15, color: C.ink }}>{v}</div>
      ))}
    </div>
  );
}

function UnitCard({ u }) {
  const w = wep(u);
  const t = cell(u.x, u.y);
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <div>
          <div style={{ fontSize: 19 }}>{u.name}</div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.inkSoft, letterSpacing: "0.1em" }}>
            {u.cls.toUpperCase()} &middot; LV {u.lvl} &middot; {u.team === "player" ? "ALLY" : "FOE"}
          </div>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 15, color: C.ink }}>{u.hp}/{u.maxHp}</div>
      </div>
      <div style={{ height: 6, background: C.parchDim, marginTop: 6, border: "1px solid " + C.rule }}>
        <div style={{
          width: Math.round((u.hp / u.maxHp) * 100) + "%", height: "100%",
          background: u.team === "player" ? C.blue : C.red,
        }} />
      </div>
      <div className="grid grid-cols-4 gap-x-2 gap-y-1 mt-3"
        style={{ fontFamily: MONO, fontSize: 11, color: C.ink }}>
        {[["STR", "str"], ["MAG", "mag"], ["SKL", "skl"], ["SPD", "spd"],
          ["LCK", "lck"], ["DEF", "def"], ["RES", "res"]].map(([k, s]) => (
          <div key={k}>
            <span style={{ color: C.inkSoft, fontSize: 9, letterSpacing: "0.1em" }}>{k} </span>
            <span>{u[s]}</span>
            {wepBonus(u, s) ? <span style={{ color: C.green }}>+{wepBonus(u, s)}</span> : null}
          </div>
        ))}
        <div>
          <span style={{ color: C.inkSoft, fontSize: 9, letterSpacing: "0.1em" }}>MOV </span>
          <span>{u.mov}</span>
        </div>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: C.inkSoft, marginTop: 8, lineHeight: 1.7 }}>
        <div style={{ color: w.personal ? C.ink : C.inkSoft }}>
          {w.name}{w.personal ? " (personal)" : ""} &middot; Mt {w.mt} &middot; Hit {w.hit} &middot; Crit {w.crit}
          &middot; Rng {w.rmin === w.rmax ? w.rmin : w.rmin + "-" + w.rmax}
        </div>
        <div>On {t.name}: +{t.def} Def, +{t.avo} Avoid{t.heal ? ", heals each turn" : ""}</div>
        {u.team === "player" && <div>EXP {u.exp}/100 &middot; Vulneraries {u.vulnerary}</div>}
      </div>
    </Card>
  );
}

function Card({ children }) {
  return (
    <div style={{
      background: C.parch, color: C.ink, border: "2px solid " + C.ink,
      boxShadow: "3px 3px 0 rgba(0,0,0,0.4)", padding: "10px 12px",
    }}>{children}</div>
  );
}

function Eyebrow({ children }) {
  return (
    <div className="uppercase" style={{
      fontFamily: MONO, fontSize: 9, letterSpacing: "0.22em", color: C.inkSoft,
      borderBottom: "1px solid " + C.rule, paddingBottom: 4, marginBottom: 6,
    }}>{children}</div>
  );
}

function Pill({ k, v, tone }) {
  return (
    <div style={{ border: "1px solid " + C.rule, padding: "3px 8px", color: tone || C.parch }}>
      <span style={{ color: C.rule, letterSpacing: "0.14em", fontSize: 9 }}>{k.toUpperCase()} </span>{v}
    </div>
  );
}

function Btn({ children, on, disabled, active, strong, light }) {
  return (
    <button onClick={on} disabled={disabled} style={{
      fontFamily: MONO, fontSize: 11, letterSpacing: "0.08em", padding: "7px 13px",
      cursor: disabled ? "default" : "pointer",
      background: active ? C.gold : light && strong ? C.ink : strong ? C.gold : "transparent",
      color: active || (strong && !light) ? C.ink : light && strong ? C.parch : light ? C.ink : C.parch,
      border: "2px solid " + (light ? C.ink : C.rule),
      opacity: disabled ? 0.4 : 1,
    }}>{children}</button>
  );
}

function Item({ label, on, disabled, muted }) {
  return (
    <button onClick={disabled ? undefined : on} disabled={disabled} style={{
      display: "block", width: "100%", textAlign: "left", fontFamily: MONO, fontSize: 12,
      padding: "7px 10px", background: "transparent",
      color: disabled ? "#a99e88" : muted ? C.inkSoft : C.ink,
      border: "none", borderBottom: "1px solid " + C.rule,
      cursor: disabled ? "default" : "pointer",
    }}>{label}</button>
  );
}
