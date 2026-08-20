import { describe, test, expect } from "vitest";
import { resolveMove, resolveAttack, resolveWait, runEnemyPhase, endPlayerPhase } from "./game.js";

/* local fixture helper — distinct from combat.test.js's `unit()`, which
   deliberately omits team/acted/exp/lvl/vulnerary/growths since it never
   needs them. All fixtures below sit on map row 5 ("............"), all
   Plain, so terrain never enters the numbers. */
function unit(overrides = {}) {
  return {
    id: "u", name: "u", team: "player", x: 0, y: 5, weaponKey: "ironSword",
    str: 10, mag: 10, skl: 10, spd: 10, lck: 10, def: 10, res: 10,
    hp: 20, maxHp: 20, lvl: 5, exp: 0, acted: false, vulnerary: 1, growths: null,
    ...overrides,
  };
}

const state = (units, over = {}) => ({ units, turn: 1, phase: "player", status: "playing", log: [], ...over });

describe("resolveMove", () => {
  test("an empty path (unit taps its own tile) emits no events and leaves position unchanged", () => {
    const u = unit({ id: "u", x: 3, y: 5 });
    const { state: next, events } = resolveMove(state([u]), "u", []);
    expect(events).toEqual([]);
    const nu = next.units.find((z) => z.id === "u");
    expect(nu.x).toBe(3);
    expect(nu.y).toBe(5);
  });

  test("a real path moves the unit to the destination and carries the origin as `from`", () => {
    const u = unit({ id: "u", x: 0, y: 5 });
    const path = [{ x: 1, y: 5 }, { x: 2, y: 5 }];
    const { state: next, events } = resolveMove(state([u]), "u", path);
    expect(events).toEqual([{ type: "move", unitId: "u", path, from: { x: 0, y: 5 } }]);
    const nu = next.units.find((z) => z.id === "u");
    expect(nu.x).toBe(2);
    expect(nu.y).toBe(5);
  });
});

describe("resolveWait", () => {
  test("ends the unit's turn with no events", () => {
    const u = unit({ id: "u", acted: false });
    const { state: next, events } = resolveWait(state([u]), "u");
    expect(events).toEqual([]);
    expect(next.units.find((z) => z.id === "u").acted).toBe(true);
  });
});

describe("resolveAttack: event order", () => {
  test("a normal exchange with a counter: two strikes, both land, no crit, no double", () => {
    const att = unit({ id: "att", team: "player", x: 0, y: 5, weaponKey: "ironSword" });
    const def = unit({ id: "def", team: "enemy", x: 1, y: 5, weaponKey: "ironSword" });
    // identical stats/weapon: tri is 0 either direction, so ironSword's 0
    // crit chance stays exactly 0 regardless of rng, and equal Spd means
    // neither side doubles — order is exactly [attacker, counter].
    const alwaysLand = () => 0; // roll2RN saturates low: every landed check passes
    const { state: next, events } = resolveAttack(state([att, def]), "att", "def", alwaysLand);

    expect(events).toEqual([
      { type: "strike", srcId: "att", tgtId: "def", hit: true, crit: false, dmg: 5, hpAfter: 15 },
      { type: "strike", srcId: "def", tgtId: "att", hit: true, crit: false, dmg: 5, hpAfter: 15 },
    ]);
    expect(next.units.find((u) => u.id === "att").hp).toBe(15);
    expect(next.units.find((u) => u.id === "def").hp).toBe(15);
    expect(next.units.find((u) => u.id === "att").acted).toBe(true);
    expect(next.status).toBe("playing");
  });

  test("a doubled attack that kills: strike, counter, doubled strike, death", () => {
    const att = unit({ id: "att", team: "player", x: 0, y: 5, weaponKey: "ironSword", spd: 14 });
    const def = unit({ id: "def", team: "enemy", x: 1, y: 5, weaponKey: "ironSword", spd: 10, hp: 8, maxHp: 8 });
    const filler = unit({ id: "filler", team: "enemy", x: 11, y: 9 }); // keeps the enemy team alive so this kill doesn't also trigger a win
    // +4 Spd gap doubles the attacker; def's counter lands once before the
    // second attacker strike (5 dmg) finishes it off (8 -> 3 -> 0).
    const alwaysLand = () => 0;
    const { events } = resolveAttack(state([att, def, filler]), "att", "def", alwaysLand);

    expect(events).toEqual([
      { type: "strike", srcId: "att", tgtId: "def", hit: true, crit: false, dmg: 5, hpAfter: 3 },
      { type: "strike", srcId: "def", tgtId: "att", hit: true, crit: false, dmg: 5, hpAfter: 15 },
      { type: "strike", srcId: "att", tgtId: "def", hit: true, crit: false, dmg: 5, hpAfter: 0 },
      { type: "death", unitId: "def" },
    ]);
  });

  test("a kill that cuts the exchange short: the counter never happens", () => {
    const att = unit({ id: "att", team: "player", x: 0, y: 5, weaponKey: "ironSword", str: 100 });
    const def = unit({ id: "def", team: "enemy", x: 1, y: 5, weaponKey: "ironSword", hp: 20, maxHp: 20 });
    const filler = unit({ id: "filler", team: "enemy", x: 11, y: 9 }); // keeps the enemy team alive so this kill doesn't also trigger a win
    // no doubling either side, so the precomputed order is [a, d] — but
    // the first strike alone is lethal (100+5-10=95 dmg vs 20 hp), so the
    // counter must never fire.
    const alwaysLand = () => 0;
    const { events } = resolveAttack(state([att, def, filler]), "att", "def", alwaysLand);

    expect(events).toEqual([
      { type: "strike", srcId: "att", tgtId: "def", hit: true, crit: false, dmg: 95, hpAfter: 0 },
      { type: "death", unitId: "def" },
    ]);
    expect(events.filter((e) => e.type === "strike")).toHaveLength(1);
  });

  test("a level up: kill grants exactly 100 exp in one hit and rolls the pinned growths", () => {
    const att = unit({
      id: "att", team: "player", x: 0, y: 5, weaponKey: "ironSword", lvl: 1,
      growths: { hp: 50, str: 50, skl: 50, mag: 0, spd: 0, lck: 0, def: 0, res: 0 },
    });
    const def = unit({
      id: "def", team: "enemy", x: 1, y: 5, weaponKey: "ironSword",
      hp: 5, maxHp: 5, lvl: 15, boss: true,
    });
    const filler = unit({ id: "filler", team: "enemy", x: 11, y: 9 }); // keeps the enemy team alive so this kill doesn't also trigger a win
    // dmg = str10+mt5+tri0 - (def10+terrain0) = 5, exactly lethal.
    // expFor(killed): 20 + diff(14)*3=42 + boss 40 = 102, clamped to 100.
    const alwaysMin = () => 0; // every strike lands, every growth/bonus roll succeeds
    const { state: next, events } = resolveAttack(state([att, def, filler]), "att", "def", alwaysMin);

    expect(events).toEqual([
      { type: "strike", srcId: "att", tgtId: "def", hit: true, crit: false, dmg: 5, hpAfter: 0 },
      { type: "death", unitId: "def" },
      { type: "levelUp", unitId: "att", lvl: 2, gains: { HP: 2, STR: 1, SKL: 1 } },
    ]);
    expect(next.units.find((u) => u.id === "att").exp).toBe(0);
  });
});

describe("runEnemyPhase / endPlayerPhase", () => {
  test("a full phase-boundary round trip advances the turn and resets acted", () => {
    const player = unit({ id: "p", team: "player", x: 0, y: 5, acted: true });
    const enemy = unit({ id: "e", team: "enemy", x: 11, y: 0, weaponKey: "ironSword" }); // far away, no reachable target

    const afterPlayerPhase = endPlayerPhase(state([player, enemy], { turn: 1, phase: "player" }));
    expect(afterPlayerPhase.state.phase).toBe("enemy");
    expect(afterPlayerPhase.events.at(-1)).toEqual({ type: "banner", text: "Enemy Phase", side: "enemy" });

    const { state: next, events } = runEnemyPhase(afterPlayerPhase.state, () => 0);
    expect(next.turn).toBe(2);
    expect(next.phase).toBe("player");
    expect(next.units.every((u) => u.acted === false)).toBe(true);
    expect(events.some((e) => e.type === "banner" && e.text === "Player Phase")).toBe(true);
  });
});
