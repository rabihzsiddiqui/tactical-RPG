/* SECTION 4: combat math */

import { cell } from "./map.js";
import { WEAPONS, BEATS } from "./data.js";
import { man, clamp } from "./util.js";
import { rnd, roll2RN } from "./rng.js";

export const wep = (u) => WEAPONS[u.weaponKey];

export function eff(u, stat) {
  const w = wep(u);
  return u[stat] + (w && w.bonus ? w.bonus[stat] || 0 : 0);
}
export function wepBonus(u, stat) {
  const w = wep(u);
  return w && w.bonus ? w.bonus[stat] || 0 : 0;
}

export function triBonus(a, b) {
  if (!a || !b) return 0;
  if (BEATS[a] === b) return 1;
  if (BEATS[b] === a) return -1;
  return 0;
}

export function strikeCalc(att, def) {
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

export function canCounter(def, att) {
  const dw = wep(def);
  if (!dw || dw.staff) return false;
  const d = man(def.x, def.y, att.x, att.y);
  return d >= dw.rmin && d <= dw.rmax;
}

export function forecastOf(att, def) {
  const a = strikeCalc(att, def);
  const counters = canCounter(def, att);
  return { a, d: counters ? strikeCalc(def, att) : null, counters };
}

export function simulateCombat(att, def, rng = Math.random) {
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
    const landed = roll2RN(rng) < st.acc;
    const crit = landed && rnd(100, rng) < st.crit;
    const dmg = landed ? (crit ? st.dmg * 3 : st.dmg) : 0;
    if (who === "a") hpD = Math.max(0, hpD - dmg);
    else hpA = Math.max(0, hpA - dmg);
    strikes.push({ who, landed, crit, dmg, hpAfter: who === "a" ? hpD : hpA });
  }
  return { strikes, a, d, counters };
}

export function expFor(att, def, killed) {
  const diff = def.lvl - att.lvl;
  if (killed) return clamp(20 + diff * 3 + (def.boss ? 40 : 0), 8, 100);
  return clamp(10 + diff, 1, 60);
}

export const CAPS = { str: 22, mag: 22, skl: 24, spd: 24, lck: 26, def: 22, res: 22 };

export function levelUp(u, rng = Math.random) {
  const g = u.growths || {};
  const gains = {};
  const hpUp = rnd(100, rng) < (g.hp ?? 50) ? 1 + (rnd(100, rng) < 25 ? 1 : 0) : 0;
  if (hpUp) {
    u.maxHp = Math.min(60, u.maxHp + hpUp);
    u.hp = Math.min(u.maxHp, u.hp + hpUp);
    gains.HP = hpUp;
  }
  for (const s of ["str", "mag", "skl", "spd", "lck", "def", "res"]) {
    if (rnd(100, rng) < (g[s] ?? 30) && u[s] < CAPS[s]) {
      u[s] += 1;
      gains[s.toUpperCase()] = 1;
    }
  }
  u.lvl += 1;
  return gains;
}
