/* SECTION 2: weapons, roster, palettes */

export const WEAPONS = {
  ironSword: { name: "Iron Sword", type: "sword", mt: 5, hit: 90, crit: 0, rmin: 1, rmax: 1 },
  shamshir: {
    name: "Shamshir", type: "sword", mt: 9, hit: 95, crit: 25, rmin: 1, rmax: 1,
    personal: true, bonus: { spd: 2, def: 1 },
  },
  ironLance: { name: "Iron Lance", type: "lance", mt: 7, hit: 80, crit: 0, rmin: 1, rmax: 1 },
  ironAxe: { name: "Iron Axe", type: "axe", mt: 8, hit: 75, crit: 0, rmin: 1, rmax: 1 },
  steelAxe: { name: "Steel Axe", type: "axe", mt: 11, hit: 65, crit: 10, rmin: 1, rmax: 1 },
  ironBow: { name: "Iron Bow", type: "bow", mt: 6, hit: 85, crit: 0, rmin: 2, rmax: 2 },
  fire: { name: "Fire", type: "anima", mt: 5, hit: 90, crit: 0, rmin: 1, rmax: 2, magic: true },
  heal: { name: "Heal", type: "staff", mt: 0, hit: 100, crit: 0, rmin: 1, rmax: 1, magic: true, staff: true, power: 10 },
};

/* sword beats axe, axe beats lance, lance beats sword */
export const BEATS = { sword: "axe", axe: "lance", lance: "sword" };

export const PALS = {
  lord: { tunic: 0x3f6db5, trim: 0xd9ab45, cape: 0x2b4b86, pants: 0x3c444b, boot: 0x4a3323, skin: "#e9b88f", eye: "#241a14", hair: "#3b2a1b", helm: 0xc9cfe0, plume: 0xd9ab45, blade: 0xdfe7f2, grip: 0x6a4a34 },
  knight: { tunic: 0x8d97a8, trim: 0x5e6878, cape: 0x4d5666, pants: 0x474d55, boot: 0x3f382e, skin: "#e0ab84", eye: "#241a14", hair: "#33302c", helm: 0xb9c0ce, plume: 0x7f93b8, blade: 0xdfe7f2, grip: 0x555a63 },
  fighter: { tunic: 0xa8683a, trim: 0x6d4326, cape: 0x7d4a28, pants: 0x54483a, boot: 0x4a3323, skin: "#d9a074", eye: "#241a14", hair: "#7d3f22", helm: 0x8a5a30, plume: 0xc08a4a, blade: 0xcfd6df, grip: 0x5f4028 },
  archer: { tunic: 0x4d7a45, trim: 0xcfc089, cape: 0x385c32, pants: 0x574d38, boot: 0x4a3323, skin: "#e9b88f", eye: "#241a14", hair: "#6f4a22", helm: 0x6f5233, plume: 0x8fb45a, blade: 0xc9b083, grip: 0x7a5a34 },
  mage: { tunic: 0x6a4a9d, trim: 0xd9ab45, cape: 0x4e3676, pants: 0x413a52, boot: 0x3d3244, skin: "#efc79f", eye: "#241a14", hair: "#c2a35e", helm: 0x7d5ab0, plume: 0xd9ab45, blade: 0xd9ab45, grip: 0x5a4030 },
  cleric: { tunic: 0xd6cdb4, trim: 0x8fa8c4, cape: 0xc0b79c, pants: 0x9a927c, boot: 0x6a5f4a, skin: "#efc79f", eye: "#241a14", hair: "#8a6a3a", helm: 0xe4dcc6, plume: 0x8fa8c4, blade: 0xe8e2cf, grip: 0x9a8a6a },
  foe: { tunic: 0x9d3339, trim: 0x3a2020, cape: 0x6d2228, pants: 0x483837, boot: 0x3d2a22, skin: "#c9926c", eye: "#1b1210", hair: "#2b1a16", helm: 0x8e5b52, plume: 0xc04a44, blade: 0xd8cfc6, grip: 0x6a4a34 },
  boss: { tunic: 0x7a2228, trim: 0xc8a04a, cape: 0x4d1418, pants: 0x3d3130, boot: 0x2f211c, skin: "#b9805e", eye: "#1b1210", hair: "#1f1310", helm: 0x6d4a44, plume: 0xc8a04a, blade: 0xe4dcd2, grip: 0x4a3324 },
};

export const ROSTER = [
  { name: "Kaelen", cls: "Lord", pal: "lord", team: "player", x: 4, y: 8, mov: 5, lvl: 5, weapon: "shamshir", lord: true,
    stats: { hp: 20, str: 7, mag: 0, skl: 8, spd: 9, lck: 7, def: 6, res: 2 },
    growths: { hp: 70, str: 50, mag: 5, skl: 50, spd: 55, lck: 55, def: 35, res: 25 } },
  { name: "Bram", cls: "Knight", pal: "knight", team: "player", x: 3, y: 8, mov: 4, lvl: 4, weapon: "ironLance",
    stats: { hp: 23, str: 8, mag: 0, skl: 5, spd: 4, lck: 3, def: 11, res: 1 },
    growths: { hp: 80, str: 55, mag: 5, skl: 40, spd: 25, lck: 30, def: 60, res: 20 } },
  { name: "Doran", cls: "Fighter", pal: "fighter", team: "player", x: 5, y: 8, mov: 5, lvl: 4, weapon: "ironAxe",
    stats: { hp: 26, str: 10, mag: 0, skl: 5, spd: 6, lck: 4, def: 6, res: 0 },
    growths: { hp: 85, str: 60, mag: 0, skl: 40, spd: 40, lck: 35, def: 35, res: 15 } },
  { name: "Nessa", cls: "Archer", pal: "archer", team: "player", x: 4, y: 9, mov: 5, lvl: 3, weapon: "ironBow",
    stats: { hp: 19, str: 6, mag: 0, skl: 9, spd: 10, lck: 5, def: 4, res: 2 },
    growths: { hp: 60, str: 45, mag: 5, skl: 60, spd: 60, lck: 45, def: 25, res: 20 } },
  { name: "Ilya", cls: "Mage", pal: "mage", team: "player", x: 3, y: 9, mov: 5, lvl: 3, weapon: "fire",
    stats: { hp: 17, str: 2, mag: 8, skl: 7, spd: 8, lck: 6, def: 3, res: 7 },
    growths: { hp: 55, str: 10, mag: 60, skl: 50, spd: 50, lck: 40, def: 20, res: 50 } },
  { name: "Mira", cls: "Cleric", pal: "cleric", team: "player", x: 5, y: 9, mov: 5, lvl: 3, weapon: "heal",
    stats: { hp: 16, str: 1, mag: 6, skl: 5, spd: 7, lck: 9, def: 3, res: 6 },
    growths: { hp: 55, str: 10, mag: 50, skl: 40, spd: 45, lck: 60, def: 20, res: 55 } },

  { name: "Garrick", cls: "Warlord", pal: "boss", team: "enemy", x: 6, y: 1, mov: 4, lvl: 8, weapon: "steelAxe", boss: true, ai: "guard",
    stats: { hp: 30, str: 11, mag: 0, skl: 8, spd: 6, lck: 3, def: 9, res: 3 } },
  { name: "Soldier", cls: "Soldier", pal: "foe", team: "enemy", x: 5, y: 2, mov: 4, lvl: 3, weapon: "ironLance", ai: "charge",
    stats: { hp: 19, str: 7, mag: 0, skl: 4, spd: 4, lck: 1, def: 6, res: 1 } },
  { name: "Sniper", cls: "Archer", pal: "foe", team: "enemy", x: 8, y: 2, mov: 5, lvl: 3, weapon: "ironBow", ai: "guard",
    stats: { hp: 18, str: 6, mag: 0, skl: 7, spd: 7, lck: 1, def: 4, res: 2 } },
  { name: "Brigand", cls: "Brigand", pal: "foe", team: "enemy", x: 4, y: 3, mov: 5, lvl: 3, weapon: "ironAxe", ai: "charge",
    stats: { hp: 22, str: 9, mag: 0, skl: 4, spd: 5, lck: 0, def: 5, res: 0 } },
  { name: "Brigand", cls: "Brigand", pal: "foe", team: "enemy", x: 9, y: 5, mov: 5, lvl: 3, weapon: "ironAxe", ai: "charge",
    stats: { hp: 22, str: 9, mag: 0, skl: 4, spd: 5, lck: 0, def: 5, res: 0 } },
  { name: "Mercenary", cls: "Mercenary", pal: "foe", team: "enemy", x: 6, y: 6, mov: 5, lvl: 4, weapon: "ironSword", ai: "charge",
    stats: { hp: 21, str: 7, mag: 0, skl: 8, spd: 9, lck: 2, def: 5, res: 1 } },
];

export function makeUnit(d, i) {
  const s = d.stats;
  return {
    id: "u" + i, name: d.name, cls: d.cls, pal: d.pal, team: d.team,
    x: d.x, y: d.y, mov: d.mov, lvl: d.lvl, exp: 0,
    maxHp: s.hp, hp: s.hp,
    str: s.str, mag: s.mag, skl: s.skl, spd: s.spd, lck: s.lck, def: s.def, res: s.res,
    weaponKey: d.weapon, growths: d.growths || null,
    ai: d.ai || "charge", boss: !!d.boss, lord: !!d.lord,
    vulnerary: d.team === "player" ? 1 : 0,
    acted: false,
  };
}
