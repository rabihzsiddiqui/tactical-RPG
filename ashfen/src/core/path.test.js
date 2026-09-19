import { describe, test, expect } from "vitest";
import { moveField, routeTo, standable } from "./path.js";
import { K } from "./util.js";

/* fixtures sit on map rows 5 ("............") and 6 ("..T......T..")
   around x=4..7, all Plain at cost 1, so terrain never enters the numbers
   below. Row 4 is River, impassable, which is what boxes a unit in. */
const unit = (over = {}) => ({ id: "u", team: "player", x: 4, y: 5, hp: 20, mov: 4, weaponKey: "ironSword", ...over });

describe("range is blind to allies", () => {
  test("an ally does not cost a teammate any reach", () => {
    const u = unit();
    const ally = unit({ id: "a", x: 5, y: 5 });
    const solo = moveField(u, [u]).dist;
    const crowded = moveField(u, [u, ally]).dist;
    expect(crowded.get(K(6, 5))).toBe(solo.get(K(6, 5)));
    expect([...crowded.keys()].sort()).toEqual([...solo.keys()].sort());
  });

  test("an ally's own tile stays in range, just not standable", () => {
    const u = unit();
    const ally = unit({ id: "a", x: 5, y: 5 });
    const units = [u, ally];
    const { dist } = moveField(u, units);
    expect(dist.get(K(5, 5))).toBe(1);
    expect(standable(dist, u, units)).not.toContain(K(5, 5));
  });

  test("an enemy still blocks outright", () => {
    const u = unit();
    const foe = unit({ id: "e", team: "enemy", x: 5, y: 5 });
    const { dist } = moveField(u, [u, foe]);
    expect(dist.has(K(5, 5))).toBe(false);
  });
});

describe("the walk routes around bodies", () => {
  test("a route past an ally detours instead of stepping on it", () => {
    const u = unit();
    const ally = unit({ id: "a", x: 5, y: 5 });
    const path = routeTo(moveField(u, [u, ally]), 4, 5, 6, 5);
    expect(path).toEqual([{ x: 4, y: 6 }, { x: 5, y: 6 }, { x: 6, y: 6 }, { x: 6, y: 5 }]);
  });

  test("with nobody in the way it takes the straight line", () => {
    const u = unit();
    const path = routeTo(moveField(u, [u]), 4, 5, 6, 5);
    expect(path).toEqual([{ x: 5, y: 5 }, { x: 6, y: 5 }]);
  });

  test("a dead unit is not something to walk around", () => {
    const u = unit();
    const corpse = unit({ id: "a", x: 5, y: 5, hp: 0 });
    const path = routeTo(moveField(u, [u, corpse]), 4, 5, 6, 5);
    expect(path).toEqual([{ x: 5, y: 5 }, { x: 6, y: 5 }]);
  });

  test("it walks over a teammate when the detour does not fit the budget", () => {
    /* mov 2 pays for the two straight steps but not the four-step detour */
    const u = unit({ mov: 2 });
    const ally = unit({ id: "a", x: 5, y: 5 });
    const field = moveField(u, [u, ally]);
    expect(field.dist.get(K(6, 5))).toBe(2);
    expect(routeTo(field, 4, 5, 6, 5)).toEqual([{ x: 5, y: 5 }, { x: 6, y: 5 }]);
  });

  test("a unit ringed by teammates still reaches the tiles behind them", () => {
    const u = unit({ x: 5, y: 5 });
    const units = [
      u,
      unit({ id: "a1", x: 4, y: 5 }),
      unit({ id: "a2", x: 6, y: 5 }),
      unit({ id: "a3", x: 5, y: 6 }),
    ];
    const field = moveField(u, units);
    expect(field.dist.get(K(7, 5))).toBe(2);
    expect(routeTo(field, 5, 5, 7, 5)).toEqual([{ x: 6, y: 5 }, { x: 7, y: 5 }]);
  });
});
