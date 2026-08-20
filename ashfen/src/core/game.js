/* event-emitting core: synchronous, pure resolve functions that turn a
   player/AI decision into a new state plus a list of events describing
   what happened. src/view/scene.js is the only consumer — it plays the
   events back against the live three.js scene and animation timing.
   See CLAUDE.md and PROJECT_PLAN.md's M3 section for the design. */

import { cell } from "./map.js";
import { WEAPONS } from "./data.js";
import { simulateCombat, expFor, levelUp } from "./combat.js";
import { moveField, tracePath } from "./path.js";
import { planFor } from "./ai.js";

const cloneUnit = (u) => ({ ...u });
const cloneUnits = (units) => units.map(cloneUnit);
const find = (units, id) => units.find((u) => u.id === id);
const alive = (units, team) => units.filter((u) => u.team === team && u.hp > 0);

const pushLog = (log, line) => [line, ...log].slice(0, 40);

function faceDir(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "e" : "w") : (dy > 0 ? "s" : "n");
}

/* runs one full attacker/defender/counter/double exchange against the
   (already-cloned) units in place, returning the strike-by-strike events
   plus any log lines produced. Shared by resolveAttack and runEnemyPhase. */
function resolveCombatExchange(units, attackerId, defenderId, rng) {
  const att = find(units, attackerId), def = find(units, defenderId);
  const sim = simulateCombat(att, def, rng);
  const events = [];
  const queue = [];
  const logLines = [];

  for (const s of sim.strikes) {
    const src = s.who === "a" ? att : def;
    const tgt = s.who === "a" ? def : att;
    events.push({ type: "strike", srcId: src.id, tgtId: tgt.id, hit: s.landed, crit: s.crit, dmg: s.dmg, hpAfter: s.hpAfter });
    if (s.landed) tgt.hp = s.hpAfter;

    const killed = s.landed && tgt.hp <= 0;
    if (src.team === "player" && s.landed) {
      src.exp += expFor(src, tgt, killed);
      if (src.exp >= 100) {
        src.exp -= 100;
        const gains = levelUp(src, rng);
        queue.push({ unitId: src.id, lvl: src.lvl, gains });
      }
    }
    if (killed) {
      events.push({ type: "death", unitId: tgt.id });
      logLines.push(tgt.name + " was defeated.");
      break;
    }
  }
  for (const q of queue) events.push({ type: "levelUp", unitId: q.unitId, lvl: q.lvl, gains: q.gains });
  return { events, logLines };
}

/* internal only — appends a banner+end event and sets status/log on a
   win or loss. Called only where a kill was just possible. */
function checkEnd(state, events) {
  if (state.status !== "playing") return { state, events };
  if (!alive(state.units, "enemy").length) {
    return {
      state: { ...state, status: "win", log: pushLog(state.log, "All enemies routed.") },
      events: [...events, { type: "banner", text: "Victory", side: "player" }, { type: "end", result: "win" }],
    };
  }
  const lord = state.units.find((u) => u.lord);
  if (!alive(state.units, "player").length || (lord && lord.hp <= 0)) {
    const msg = lord && lord.hp <= 0 ? "Kaelen has fallen." : "The company is lost.";
    return {
      state: { ...state, status: "lose", log: pushLog(state.log, msg) },
      events: [...events, { type: "banner", text: "Defeat", side: "enemy" }, { type: "end", result: "lose" }],
    };
  }
  return { state, events };
}

export function resolveMove(state, unitId, path) {
  const units = cloneUnits(state.units);
  const u = find(units, unitId);
  if (path.length === 0) return { state: { ...state, units }, events: [] };
  const from = { x: u.x, y: u.y };
  const dest = path[path.length - 1];
  u.x = dest.x; u.y = dest.y;
  return { state: { ...state, units }, events: [{ type: "move", unitId, path, from }] };
}

export function resolveAttack(state, attackerId, targetId, rng = Math.random) {
  const units = cloneUnits(state.units);
  const { events, logLines } = resolveCombatExchange(units, attackerId, targetId, rng);
  find(units, attackerId).acted = true;
  let log = state.log;
  for (const line of logLines) log = pushLog(log, line);
  return checkEnd({ ...state, units, log }, events);
}

export function resolveHeal(state, healerId, targetId) {
  const units = cloneUnits(state.units);
  const u = find(units, healerId), t = find(units, targetId);
  const amt = Math.min(t.maxHp - t.hp, WEAPONS.heal.power + u.mag);
  t.hp += amt;
  const dir = faceDir(u, t);
  const events = [
    { type: "face", unitId: u.id, dir },
    { type: "heal", srcId: u.id, tgtId: t.id, amount: amt },
  ];
  let log = pushLog(state.log, u.name + " healed " + t.name + " for " + amt + ".");
  u.exp += 12;
  if (u.exp >= 100) {
    u.exp -= 100;
    const gains = levelUp(u);
    events.push({ type: "levelUp", unitId: u.id, lvl: u.lvl, gains });
  }
  u.acted = true;
  return { state: { ...state, units, log }, events };
}

export function resolveItem(state, unitId) {
  const units = cloneUnits(state.units);
  const u = find(units, unitId);
  const amt = Math.min(u.maxHp - u.hp, 10);
  u.hp += amt;
  u.vulnerary -= 1;
  u.acted = true;
  const log = pushLog(state.log, u.name + " used a vulnerary.");
  return { state: { ...state, units, log }, events: [{ type: "heal", srcId: u.id, tgtId: u.id, amount: amt, instant: true }] };
}

/* "Wait" — ends a unit's turn with no other effect. Not one of the six
   functions PROJECT_PLAN.md names, but it's the same kind of turn-ending
   bookkeeping as resolveItem, and scene.js has no other rule-free way to
   set `acted` without owning turn logic itself. */
export function resolveWait(state, unitId) {
  const units = cloneUnits(state.units);
  find(units, unitId).acted = true;
  return { state: { ...state, units }, events: [] };
}

export function endPlayerPhase(state) {
  const units = cloneUnits(state.units);
  const events = [];
  for (const u of units) {
    if (u.team !== "enemy" || u.hp <= 0) continue;
    const t = cell(u.x, u.y);
    if (t.heal && u.hp < u.maxHp) {
      const a = Math.min(u.maxHp - u.hp, Math.ceil(u.maxHp * t.heal));
      u.hp += a;
      events.push({ type: "heal", srcId: u.id, tgtId: u.id, amount: a, instant: true });
    }
  }
  events.push({ type: "banner", text: "Enemy Phase", side: "enemy" });
  return { state: { ...state, units, phase: "enemy" }, events };
}

export function runEnemyPhase(state, rng = Math.random) {
  let units = cloneUnits(state.units);
  let events = [];
  let cur = { ...state, units };

  const actingIds = alive(units, "enemy").map((u) => u.id);
  for (const eid of actingIds) {
    if (cur.status !== "playing") break;
    const e = find(cur.units, eid);
    if (!e || e.hp <= 0) continue;
    const plan = planFor(e, cur.units);
    if (!plan) continue;

    if (plan.x !== e.x || plan.y !== e.y) {
      const { prev } = moveField(e, cur.units);
      const path = tracePath(prev, e.x, e.y, plan.x, plan.y);
      if (path.length) {
        const from = { x: e.x, y: e.y };
        e.x = plan.x; e.y = plan.y;
        events.push({ type: "move", unitId: e.id, path, from });
      }
    }
    if (plan.kind === "attack") {
      const foe = find(cur.units, plan.foe);
      if (foe && foe.hp > 0) {
        const { events: cEvents, logLines } = resolveCombatExchange(cur.units, e.id, foe.id, rng);
        events.push(...cEvents);
        let log = cur.log;
        for (const line of logLines) log = pushLog(log, line);
        cur = { ...cur, log };
      }
    }
    const checked = checkEnd(cur, events);
    cur = checked.state; events = checked.events;
  }

  if (cur.status === "playing") {
    const finalUnits = cur.units.map((u) => ({ ...u, acted: false }));
    for (const u of finalUnits) {
      if (u.team !== "player" || u.hp <= 0) continue;
      const t = cell(u.x, u.y);
      if (t.heal && u.hp < u.maxHp) {
        const a = Math.min(u.maxHp - u.hp, Math.ceil(u.maxHp * t.heal));
        u.hp += a;
        events.push({ type: "heal", srcId: u.id, tgtId: u.id, amount: a, instant: true });
      }
    }
    const turn = cur.turn + 1;
    events.push({ type: "banner", text: "Player Phase", side: "player" });
    const log = pushLog(cur.log, "Turn " + turn + " begins.");
    cur = { ...cur, units: finalUnits, turn, phase: "player", log };
  }
  return { state: cur, events };
}
