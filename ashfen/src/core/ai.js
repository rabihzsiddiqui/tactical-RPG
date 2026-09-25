/* SECTION 5: enemy ai, and the auto battle's picks for the player's side */

import { cell, inB } from "./map.js";
import { moveField, fieldFrom, standable, reachTiles } from "./path.js";
import { wep, strikeCalc, canCounter } from "./combat.js";
import { K, man } from "./util.js";

/* the auto battle's tunables (planAuto below) */
const AUTO_LOW_HP = 0.4;   // share of max HP at or under which a unit with a vulnerary drinks it, unless it has a kill to take; a lord this hurt with none left holds back

/* a unit's best move and attack against the other side. `safe` drops any
   fight whose counter could kill the unit outright; it is for the auto
   battle's lord, and an enemy never sets it. An attack plan says whether
   it expects a kill. */
export function planFor(e, units, { safe = false } = {}) {
  const w = wep(e);
  const foes = units.filter((u) => u.team !== e.team && u.hp > 0);
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
      if (safe && back && back.dmg * (back.doubles ? 2 : 1) >= e.hp) continue;
      const risk = back ? (back.dmg * (back.doubles ? 2 : 1) * back.acc) / 100 : 0;
      let score = expect * 3 - risk * 1.4 + t.def * 2 + t.avo / 10;
      if (kill) score += 120;
      if (f.lord) score += 12;
      score += (f.maxHp - f.hp) * 0.4;
      if (!best || score > best.score) best = { score, x, y, foe: f.id, kill };
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

/* the auto battle's pick for one of the player's units: where to stand
   and what to do there, as { kind, x, y, target }. kind is attack, heal,
   item or wait, and x and y are the unit's own tile when it stays put, so
   a wait somewhere else is a move and then a wait.

   Fighters take planFor, the enemy's own reckoning turned on the enemy.
   Two things only the player's side has: a staff heals the ally it can do
   the most for, and a unit at AUTO_LOW_HP or under with a vulnerary drinks
   it, unless it has a kill to take.

   The lord fights and advances like everyone else, since a battle where he
   stands at the back goes stale, with two limits because losing him loses
   the battle: he turns down a fight whose counter could kill him outright,
   and at AUTO_LOW_HP or under with no vulnerary left he holds his ground
   rather than walk up to the enemy. The first cut held him back whenever
   he had no safe fight, and he spent most battles doing nothing. */
export function planAuto(u, units) {
  const stay = { kind: "wait", x: u.x, y: u.y };
  const staff = wep(u).staff;
  const plan = staff ? null : planFor(u, units, u.lord ? { safe: true } : undefined);
  const low = u.vulnerary > 0 && u.hp < u.maxHp && u.hp <= u.maxHp * AUTO_LOW_HP;
  if (low && !(plan && plan.kind === "attack" && plan.kill)) return { kind: "item", x: u.x, y: u.y };
  if (staff) return planHeal(u, units) || planFollow(u, units) || stay;
  if (plan && plan.kind === "attack") return { kind: "attack", x: plan.x, y: plan.y, target: plan.foe };
  const holdBack = u.lord && u.hp <= u.maxHp * AUTO_LOW_HP;
  if (plan && plan.kind === "move" && !holdBack) return { kind: "wait", x: plan.x, y: plan.y };
  return stay;
}

/* the staff's pick: the ally it can do the most for, from any tile it can
   reach. A heal gives what the ally is missing up to the staff's power
   plus the healer's magic (resolveHeal), so the most hurt ally in reach
   wins, the lord on a tie, then the better cover to heal from. */
function planHeal(u, units) {
  const w = wep(u);
  const power = w.power + u.mag;
  const hurt = units.filter((a) => a.team === u.team && a.id !== u.id && a.hp > 0 && a.hp < a.maxHp);
  if (!hurt.length) return null;
  const { dist } = moveField(u, units);
  let best = null;
  for (const k of standable(dist, u, units)) {
    const [x, y] = k.split(",").map(Number);
    const t = cell(x, y);
    for (const a of hurt) {
      const d = man(x, y, a.x, a.y);
      if (d < w.rmin || d > w.rmax) continue;
      const score = Math.min(a.maxHp - a.hp, power) * 10 + (a.lord ? 5 : 0) + t.def * 2 + t.avo / 10;
      if (!best || score > best.score) best = { score, x, y, target: a.id };
    }
  }
  return best && { kind: "heal", x: best.x, y: best.y, target: best.target };
}

/* a staff with nobody to heal keeps up with the company: it steps toward
   the lord, or the nearest ally once he is gone, and keeps off any tile
   an enemy could reach next phase when it can */
function planFollow(u, units) {
  const allies = units.filter((a) => a.team === u.team && a.id !== u.id && a.hp > 0);
  if (!allies.length) return null;
  const near = (a) => man(u.x, u.y, a.x, a.y);
  const lead = allies.find((a) => a.lord) || allies.reduce((n, a) => (near(a) < near(n) ? a : n));
  const field = fieldFrom(lead.x, lead.y, u, units);
  const danger = threatSet(units);
  const { dist } = moveField(u, units);
  let step = null;
  for (const k of standable(dist, u, units)) {
    const v = field.get(k);
    if (v === undefined) continue;
    const [x, y] = k.split(",").map(Number);
    const sc = -v * 10 - (danger.has(k) ? 60 : 0) + cell(x, y).def;
    if (!step || sc > step.sc) step = { sc, x, y };
  }
  return step && { kind: "wait", x: step.x, y: step.y };
}

/* which of the player's units the auto battle moves next: fighters in
   roster order, then the lord, then anyone with a staff, so the healer
   sees what the others took on their counters. Null once all have acted. */
export function nextAuto(units) {
  const rank = (u) => (wep(u).staff ? 2 : u.lord ? 1 : 0);
  const ready = units.filter((u) => u.team === "player" && u.hp > 0 && !u.acted);
  let best = null;
  for (const u of ready) if (!best || rank(u) < rank(best)) best = u;
  return best;
}
