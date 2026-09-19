import { describe, test, expect } from "vitest";
import { moveField, tracePath, standable } from "./path.js";
import { K } from "./util.js";

/* all fixtures sit on map rows 5 ("............") and 6 ("..T......T..")
   around x=4..7, where every tile is Plain at cost 1, so terrain never
   enters the numbers below. */
const unit = (over = {}) => ({ id: "u", team: "player", x: 4, y: 5, hp: 20, mov: 4, weaponKey: "ironSword", ...over });

describe("moveField blocking", () => {
  test("an ally's tile is not reachable", () => {
    const u = unit();
    const ally = unit({ id: "a", x: 5, y: 5 });
    const { dist } = moveField(u, [u, ally]);
    expect(dist.has(K(5, 5))).toBe(false);
  });

  test("an enemy's tile is not reachable", () => {
    const u = unit();
    const foe = unit({ id: "e", team: "enemy", x: 5, y: 5 });
    const { dist } = moveField(u, [u, foe]);
    expect(dist.has(K(5, 5))).toBe(false);
  });

  test("a dead unit stops blocking", () => {
    const u = unit();
    const corpse = unit({ id: "a", x: 5, y: 5, hp: 0 });
    const { dist } = moveField(u, [u, corpse]);
    expect(dist.get(K(5, 5))).toBe(1);
  });

  test("a tile past an ally costs the detour, not the straight line", () => {
    const u = unit();
    const ally = unit({ id: "a", x: 5, y: 5 });
    const { dist } = moveField(u, [u, ally]);
    expect(dist.get(K(6, 5))).toBe(4);
  });

  test("the traced path walks around an ally instead of through it", () => {
    const u = unit();
    const ally = unit({ id: "a", x: 5, y: 5 });
    const { prev } = moveField(u, [u, ally]);
    const path = tracePath(prev, 4, 5, 6, 5);
    expect(path).toEqual([{ x: 4, y: 6 }, { x: 5, y: 6 }, { x: 6, y: 6 }, { x: 6, y: 5 }]);
    expect(path.some((p) => p.x === ally.x && p.y === ally.y)).toBe(false);
  });

  test("a unit walled in by its own team can only stand where it already is", () => {
    const u = unit({ x: 5, y: 5 });
    const wall = [
      unit({ id: "a1", x: 4, y: 5 }),
      unit({ id: "a2", x: 6, y: 5 }),
      unit({ id: "a3", x: 5, y: 6 }),
    ];
    /* (5,4) is River, impassable on its own, so the three allies close the box */
    const units = [u, ...wall];
    const { dist } = moveField(u, units);
    expect(standable(dist, u, units)).toEqual([K(5, 5)]);
  });
});
