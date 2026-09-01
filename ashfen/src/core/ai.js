/* SECTION 5: enemy ai */

import { cell, inB } from "./map.js";
import { moveField, fieldFrom, standable, reachTiles } from "./path.js";
import { wep, strikeCalc, canCounter } from "./combat.js";
import { K, man } from "./util.js";

export function planFor(e, units) {
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

export function threatSet(units) {
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
