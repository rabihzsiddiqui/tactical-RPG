/* SECTION 3: pathfinding */

import { cell, lvlH, walkable, inB, CLIMB } from "./map.js";
import { WEAPONS } from "./data.js";
import { K, DIRS } from "./util.js";

export function moveField(unit, units) {
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

export function fieldFrom(sx, sy, unit, units) {
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
