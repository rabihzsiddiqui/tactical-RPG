import { describe, test, expect } from "vitest";
import { ROSTER, makeUnit } from "./data.js";
import { strikeCalc, canCounter, triBonus, simulateCombat } from "./combat.js";
import { makeRng } from "./rng.js";

/* minimal synthetic units for isolating one formula at a time. The
   golden tests below use the real roster instead */
function unit(overrides = {}) {
  return {
    id: "t", name: "t", x: 0, y: 5, weaponKey: "ironSword",
    str: 10, mag: 10, skl: 10, spd: 10, lck: 10, def: 10, res: 10,
    hp: 20, maxHp: 20,
    ...overrides,
  };
}

const rosterUnit = (name) => makeUnit(ROSTER.find((r) => r.name === name), 0);

describe("formula: weapon triangle", () => {
  test("advantage gives exactly +1 damage and +15 hit", () => {
    const att = unit({ weaponKey: "ironSword" });
    const withAdvantage = strikeCalc(att, unit({ weaponKey: "ironAxe" })); // sword beats axe
    const neutral = strikeCalc(att, unit({ weaponKey: "ironBow" })); // no relation
    expect(withAdvantage.dmg - neutral.dmg).toBe(1);
    expect(withAdvantage.acc - neutral.acc).toBe(15);
  });

  test("disadvantage gives exactly -1 damage and -15 hit", () => {
    const att = unit({ weaponKey: "ironAxe" });
    const atDisadvantage = strikeCalc(att, unit({ weaponKey: "ironSword" })); // axe loses to sword
    const neutral = strikeCalc(att, unit({ weaponKey: "ironBow" }));
    expect(atDisadvantage.dmg - neutral.dmg).toBe(-1);
    expect(atDisadvantage.acc - neutral.acc).toBe(-15);
  });

  test("bow gets 0 triangle either direction", () => {
    expect(triBonus("bow", "sword")).toBe(0);
    expect(triBonus("sword", "bow")).toBe(0);
  });

  test("tomes get 0 triangle either direction", () => {
    expect(triBonus("anima", "lance")).toBe(0);
    expect(triBonus("lance", "anima")).toBe(0);
  });

  test("staff defenders never trigger a triangle bonus", () => {
    const att = unit({ weaponKey: "ironSword" });
    const staffDef = unit({ weaponKey: "heal" });
    expect(strikeCalc(att, staffDef).tri).toBe(0);
  });
});

describe("formula: damage", () => {
  test("floors at 0, never negative", () => {
    const att = unit({ weaponKey: "ironSword", str: 1 });
    const tank = unit({ weaponKey: "ironSword", def: 100 });
    expect(strikeCalc(att, tank).dmg).toBe(0);
  });

  test("terrain Def applies to physical only; a tome ignores it", () => {
    const ridgeDef = unit({ weaponKey: "ironSword", def: 10, res: 10, x: 5, y: 1 }); // Ridge, +2 def
    const plainDef = unit({ weaponKey: "ironSword", def: 10, res: 10, x: 0, y: 5 }); // Plain, +0 def

    const physicalAtt = unit({ weaponKey: "ironSword", str: 10 });
    const physicalOnRidge = strikeCalc(physicalAtt, ridgeDef).dmg;
    const physicalOnPlain = strikeCalc(physicalAtt, plainDef).dmg;
    expect(physicalOnPlain - physicalOnRidge).toBe(2); // exactly the Ridge's +2 def

    const magicAtt = unit({ weaponKey: "fire", mag: 10 });
    const magicOnRidge = strikeCalc(magicAtt, ridgeDef).dmg;
    const magicOnPlain = strikeCalc(magicAtt, plainDef).dmg;
    expect(magicOnRidge).toBe(magicOnPlain); // terrain def ignored entirely
  });

  test("terrain Avoid applies to both physical and magic", () => {
    const ridgeDef = unit({ x: 5, y: 1 }); // Ridge, +30 avoid
    const plainDef = unit({ x: 0, y: 5 }); // Plain, +0 avoid

    const physicalAtt = unit({ weaponKey: "ironSword" });
    const physicalDiff = strikeCalc(physicalAtt, plainDef).acc - strikeCalc(physicalAtt, ridgeDef).acc;
    expect(physicalDiff).toBe(30);

    const magicAtt = unit({ weaponKey: "fire" });
    const magicDiff = strikeCalc(magicAtt, plainDef).acc - strikeCalc(magicAtt, ridgeDef).acc;
    expect(magicDiff).toBe(30);
  });
});

describe("formula: speed and crit", () => {
  test("doubling triggers at exactly 4 effective Spd, not 3", () => {
    const def = unit({ spd: 10 });
    expect(strikeCalc(unit({ spd: 14 }), def).doubles).toBe(true); // +4
    expect(strikeCalc(unit({ spd: 13 }), def).doubles).toBe(false); // +3
  });

  test("crit multiplies damage by 3", () => {
    // steelAxe has a nonzero crit chance; defender wields a staff so it
    // never counters, and low attacker spd keeps this to a single strike
    const att = unit({ weaponKey: "steelAxe", str: 10, skl: 10, spd: 3, lck: 10 });
    const def = unit({ weaponKey: "heal", def: 0, res: 0, spd: 0, lck: 0, hp: 999, maxHp: 999 });
    const base = strikeCalc(att, def);
    expect(base.crit).toBeGreaterThan(0);

    const alwaysMin = () => 0; // forces every roll to land and every crit check to succeed
    const { strikes } = simulateCombat(att, def, alwaysMin);
    expect(strikes).toHaveLength(1);
    expect(strikes[0].crit).toBe(true);
    expect(strikes[0].dmg).toBe(base.dmg * 3);
  });
});

describe("formula: countering", () => {
  test("a bow cannot counter at range 1", () => {
    const bowDef = unit({ weaponKey: "ironBow", x: 0, y: 5 });
    const adjacentAtt = unit({ weaponKey: "ironSword", x: 1, y: 5 });
    expect(canCounter(bowDef, adjacentAtt)).toBe(false);
  });

  test("a staff user never counters", () => {
    const staffDef = unit({ weaponKey: "heal", x: 0, y: 5 });
    const adjacentAtt = unit({ weaponKey: "ironSword", x: 1, y: 5 });
    expect(canCounter(staffDef, adjacentAtt)).toBe(false);
  });
});

describe("formula: strike sequencing", () => {
  test("strike order is attacker, counter, then the doubler", () => {
    const att = unit({ weaponKey: "ironSword", spd: 20, x: 0, y: 5, hp: 999, maxHp: 999 });
    const def = unit({ weaponKey: "ironSword", spd: 0, x: 1, y: 5, hp: 999, maxHp: 999 });
    const missAll = () => 1; // roll2RN saturates at 100, always >= any acc, so nothing lands and hp never changes
    const { strikes } = simulateCombat(att, def, missAll);
    expect(strikes.map((s) => s.who)).toEqual(["a", "d", "a"]);
  });

  test("combat stops the moment someone reaches 0 HP", () => {
    const att = unit({ weaponKey: "ironSword", str: 20, spd: 20, x: 0, y: 5 });
    const def = unit({ weaponKey: "ironSword", def: 0, spd: 0, hp: 5, maxHp: 5, x: 1, y: 5 });
    // lethal on the first hit; order would otherwise be a, d, a
    const alwaysLand = () => 0;
    const { strikes } = simulateCombat(att, def, alwaysLand);
    expect(strikes).toHaveLength(1);
    expect(strikes[0].hpAfter).toBe(0);
  });
});

describe("golden: real roster matchups", () => {
  test("Kaelen (Shamshir) vs Garrick on the Keep: 6 damage, and doubles", () => {
    const kaelen = rosterUnit("Kaelen");
    const garrick = rosterUnit("Garrick"); // roster position (6,1) is the Keep
    const strike = strikeCalc(kaelen, garrick);
    expect(strike.dmg).toBe(6);
    expect(strike.doubles).toBe(true);
  });

  test("Garrick's counter: Kaelen takes 14, not 15, since the Shamshir's +1 Def applies on defence too", () => {
    const kaelen = rosterUnit("Kaelen"); // roster position (4,8) is Plain
    const garrick = rosterUnit("Garrick");
    const counter = strikeCalc(garrick, kaelen);
    expect(counter.dmg).toBe(14);
  });

  test("Ilya (Fire) vs Garrick on the Keep: 10 damage, hitting Res so the Keep's +2 Def does nothing", () => {
    const ilya = rosterUnit("Ilya");
    const garrick = rosterUnit("Garrick");
    const strike = strikeCalc(ilya, garrick);
    expect(strike.dmg).toBe(10);
  });

  test("Doran (Iron Axe) vs the lance Soldier: 13 damage from the triangle", () => {
    const doran = rosterUnit("Doran");
    const soldier = rosterUnit("Soldier");
    soldier.x = 0; soldier.y = 5; // Plain, which isolates the triangle math from terrain
    const strike = strikeCalc(doran, soldier);
    expect(strike.dmg).toBe(13);
  });

  test("Doran vs the Soldier on his actual opening tile (5,2), a Hill: 12 damage, no one-round", () => {
    const doran = rosterUnit("Doran");
    const soldier = rosterUnit("Soldier"); // roster position (5,2) is a Hill, +1 Def
    const strike = strikeCalc(doran, soldier);
    expect(strike.dmg).toBe(12);
    expect(strike.doubles).toBe(false); // Doran's Spd 6 vs Soldier's 4 is only a 2 point gap
    expect(soldier.hp - strike.dmg).toBe(7); // Soldier survives the opening exchange
  });

  test("Nessa firing from range 2 at a sword user: no counter", () => {
    const nessa = rosterUnit("Nessa");
    const mercenary = rosterUnit("Mercenary"); // ironSword, range 1
    nessa.x = 0; nessa.y = 5;
    mercenary.x = 2; mercenary.y = 5; // exactly 2 tiles away
    expect(canCounter(mercenary, nessa)).toBe(false);
  });
});

describe("2RN statistical behavior", () => {
  test("a displayed 80 hit lands between 89 and 93 percent over 10,000 rolls", () => {
    const rng = makeRng(12345);
    let landed = 0;
    const trials = 10000;
    for (let i = 0; i < trials; i++) {
      const a = Math.floor(rng() * 100);
      const b = Math.floor(rng() * 100);
      if ((a + b) / 2 < 80) landed++;
    }
    const pct = (landed / trials) * 100;
    expect(pct).toBeGreaterThanOrEqual(89);
    expect(pct).toBeLessThanOrEqual(93);
  });
});
