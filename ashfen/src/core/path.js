/* SECTION 3: pathfinding */

import { cell, lvlH, walkable, inB, CLIMB } from "./map.js";
import { WEAPONS } from "./data.js";
import { K, DIRS } from "./util.js";

/* tiles nobody can walk onto: the mover's enemies, who really do bar the
   way. Allies never land here, they stay passable so a crowded formation
   can never shrink anyone's range. `skip` leaves one tile open, since
   fieldFrom measures from a target's own occupied tile. */
function blockedTiles(unit, units, skip) {
  const blocked = new Set();
  for (const u of units) {
    if (u.hp <= 0 || u.team === unit.team) continue;
    if (skip && u.x === skip.x && u.y === skip.y) continue;
    blocked.add(K(u.x, u.y));
  }
  return blocked;
}

/* tiles a walk should route around if it can: every other living unit,
   teammates included. Only ever a preference, never a wall. */
function occupiedTiles(unit, units) {
  const taken = new Set();
  for (const u of units) {
    if (u.hp > 0 && u.id !== unit.id) taken.add(K(u.x, u.y));
  }
  return taken;
}

/* priced high enough that any way around a body wins over stepping on it,
   yet only ever added to the ordering cost. The movement budget is checked
   against the real terrain cost, so a detour price can push a route around
   someone but can never put a tile out of reach. */
const BODY_DETOUR = 100;

/* one Dijkstra, shared by both fields moveField returns. `avoid` tiles
   still cost their real terrain cost toward `mov`; they just sort last. */
function search(unit, blocked, avoid) {
  const here = K(unit.x, unit.y);
  const order = new Map([[here, 0]]);
  const dist = new Map([[here, 0]]);
  const prev = new Map();
  const q = [[unit.x, unit.y, 0]];
  while (q.length) {
    q.sort((a, b) => a[2] - b[2]);
    const [x, y, c] = q.shift();
    if (c > (order.get(K(x, y)) ?? 1e9)) continue;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!inB(nx, ny) || !walkable(nx, ny) || blocked.has(K(nx, ny))) continue;
      if (Math.abs(lvlH(nx, ny) - lvlH(x, y)) > CLIMB) continue;
      const nd = dist.get(K(x, y)) + cell(nx, ny).cost;
      if (nd > unit.mov) continue;
      const nc = c + cell(nx, ny).cost + (avoid.has(K(nx, ny)) ? BODY_DETOUR : 0);
      if (nc < (order.get(K(nx, ny)) ?? 1e9)) {
        order.set(K(nx, ny), nc);
        dist.set(K(nx, ny), nd);
        prev.set(K(nx, ny), K(x, y));
        q.push([nx, ny, nc]);
      }
    }
  }
  return { dist, prev };
}

/* `dist`/`prev` are the plain shortest routes: terrain and enemies only,
   which is what the move overlay and every reachability test read.
   `prevAround` is the same field re-run with a detour price on occupied
   tiles, and it is only ever used to pick which way the walk animates.
   It can cover fewer tiles than `dist` (a tile whose only affordable
   approach is over a teammate has no way around), which is exactly what
   routeTo's fallback is for. */
export function moveField(unit, units) {
  const blocked = blockedTiles(unit, units);
  const none = new Set();
  const { dist, prev } = search(unit, blocked, none);
  const { prev: prevAround } = search(unit, blocked, occupiedTiles(unit, units));
  return { dist, prev, prevAround };
}

export function fieldFrom(sx, sy, unit, units) {
  const blocked = blockedTiles(unit, units, { x: sx, y: sy });
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

export function standable(dist, unit, units) {
  const out = [];
  for (const k of dist.keys()) {
    const [x, y] = k.split(",").map(Number);
    if (!units.some((u) => u.hp > 0 && u.x === x && u.y === y && u.id !== unit.id)) out.push(k);
  }
  return out;
}

export function reachTiles(unit, units) {
  const w = WEAPONS[unit.weaponKey];
  const { dist, prev, prevAround } = moveField(unit, units);
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
  return { dist, prev, prevAround, stand: new Set(stand), atk };
}

export function tracePath(prev, sx, sy, tx, ty) {
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

/* the route to actually walk, given a field from moveField or reachTiles.
   Prefers the way around other units and falls back to the plain shortest
   route, which is the only one that reaches a tile whose cheapest
   approach is straight over somebody. */
export function routeTo(field, sx, sy, tx, ty) {
  const around = tracePath(field.prevAround, sx, sy, tx, ty);
  return around.length ? around : tracePath(field.prev, sx, sy, tx, ty);
}
