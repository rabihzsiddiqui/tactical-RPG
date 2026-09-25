import { describe, test, expect } from "vitest";
import { planFor, planAuto, nextAuto } from "./ai.js";
import { man } from "./util.js";

/* fixtures on map row 5, all Plain, as in game.test.js, with the mov and
   ai fields the planners read. Equal speed everywhere, so nobody doubles. */
function unit(overrides = {}) {
  return {
    id: "u", name: "u", team: "player", x: 0, y: 5, weaponKey: "ironSword", mov: 5, ai: "charge",
    str: 10, mag: 10, skl: 10, spd: 10, lck: 10, def: 10, res: 10,
    hp: 20, maxHp: 20, lvl: 5, exp: 0, acted: false, vulnerary: 1, growths: null,
    lord: false, boss: false,
    ...overrides,
  };
}

describe("planFor", () => {
  test("an enemy still picks a player unit it can reach", () => {
    const e = unit({ id: "e", team: "enemy", x: 4, y: 5 });
    const p = unit({ id: "p", team: "player", x: 7, y: 5 });
    const plan = planFor(e, [e, p]);
    expect(plan.kind).toBe("attack");
    expect(plan.foe).toBe("p");
    expect(man(plan.x, plan.y, p.x, p.y)).toBe(1);
  });
});

describe("planAuto", () => {
  test("a fighter walks into range of an enemy and attacks it", () => {
    const u = unit({ id: "u", x: 0, y: 5 });
    const e = unit({ id: "e", team: "enemy", x: 4, y: 5 });
    const plan = planAuto(u, [u, e]);
    expect(plan.kind).toBe("attack");
    expect(plan.target).toBe("e");
    expect(man(plan.x, plan.y, e.x, e.y)).toBe(1);
  });

  test("a staff heals the ally it can do the most for", () => {
    const c = unit({ id: "c", weaponKey: "heal", x: 2, y: 5 });
    const a = unit({ id: "a", x: 4, y: 5, hp: 8 });
    const b = unit({ id: "b", x: 6, y: 5, hp: 18 });
    const e = unit({ id: "e", team: "enemy", x: 11, y: 5 });
    const plan = planAuto(c, [c, a, b, e]);
    expect(plan.kind).toBe("heal");
    expect(plan.target).toBe("a");
    expect(man(plan.x, plan.y, a.x, a.y)).toBe(1);
  });

  test("a staff never attacks, even with an enemy beside it", () => {
    const c = unit({ id: "c", weaponKey: "heal", x: 2, y: 5 });
    const a = unit({ id: "a", x: 8, y: 5 });
    const e = unit({ id: "e", team: "enemy", x: 3, y: 5 });
    expect(planAuto(c, [c, a, e]).kind).not.toBe("attack");
  });

  test("a unit low on health drinks its vulnerary when it has no kill", () => {
    const u = unit({ id: "u", x: 0, y: 5, hp: 6 });
    const e = unit({ id: "e", team: "enemy", x: 3, y: 5 });
    expect(planAuto(u, [u, e])).toEqual({ kind: "item", x: 0, y: 5 });
  });

  test("a unit low on health takes a kill over its vulnerary", () => {
    const u = unit({ id: "u", x: 0, y: 5, hp: 6 });
    const e = unit({ id: "e", team: "enemy", x: 3, y: 5, hp: 1 });
    const plan = planAuto(u, [u, e]);
    expect(plan.kind).toBe("attack");
    expect(plan.target).toBe("e");
  });

  test("a badly hurt lord turns down a fight whose counter could kill him, and holds his ground", () => {
    // counter: 25 str + 5 mt - 10 def = 20, against his 8 HP, with no vulnerary left
    const lord = unit({ id: "k", lord: true, x: 0, y: 5, hp: 8, vulnerary: 0 });
    const e = unit({ id: "e", team: "enemy", x: 3, y: 5, str: 25 });
    expect(planAuto(lord, [lord, e])).toEqual({ kind: "wait", x: 0, y: 5 });
  });

  test("a healthy lord with nobody in reach advances on the enemy", () => {
    const lord = unit({ id: "k", lord: true, x: 0, y: 5 });
    const e = unit({ id: "e", team: "enemy", x: 11, y: 5 });
    const plan = planAuto(lord, [lord, e]);
    expect(plan.kind).toBe("wait");
    expect(man(plan.x, plan.y, e.x, e.y)).toBeLessThan(man(0, 5, e.x, e.y));
  });

  test("the lord takes a fight whose counter cannot hurt him", () => {
    // counter: 5 str + 5 mt - 10 def = 0
    const lord = unit({ id: "k", lord: true, x: 0, y: 5 });
    const e = unit({ id: "e", team: "enemy", x: 3, y: 5, str: 5 });
    const plan = planAuto(lord, [lord, e]);
    expect(plan.kind).toBe("attack");
    expect(plan.target).toBe("e");
  });
});

describe("nextAuto", () => {
  test("fighters go first, then the lord, then the staff, then nobody", () => {
    const lord = unit({ id: "k", lord: true, x: 0, y: 5 });
    const fighter = unit({ id: "f", x: 1, y: 5 });
    const cleric = unit({ id: "c", weaponKey: "heal", x: 2, y: 5 });
    const foe = unit({ id: "e", team: "enemy", x: 9, y: 5 });
    const units = [cleric, lord, foe, fighter];
    const order = [];
    for (let u = nextAuto(units); u; u = nextAuto(units)) {
      order.push(u.id);
      u.acted = true;
    }
    expect(order).toEqual(["f", "k", "c"]);
  });
});
