/* SECTION 1: map data + terrain rules */

/* the name of the level this map is, shown on the title card and in the
   HUD. It names the level, not the game; the game's own title lives in
   ui/meta.js. A second level lands here as a second map plus a name. */
export const LEVEL_NAME = "Ashfen Pass";

export const MAP = [
  "TT..^^^^..TT",
  "T...^*K*^..T",
  "....^^*^^...",
  "T....^^^....",
  "~~~bb~~~bb~~",
  "............",
  "..T......T..",
  "...,,,,,....",
  "..,,....,,..",
  "T..........T",
];
export const MW = 12, MH = 10;
export const CX = (MW - 1) / 2, CZ = (MH - 1) / 2;

export const TYPES = {
  ".": { name: "Plain", h: 0, cost: 1, def: 0, avo: 0, heal: 0, top: 0x6f9a4e, side: 0x6b5a3e },
  ",": { name: "Path", h: 0, cost: 1, def: 0, avo: 0, heal: 0, top: 0xa08a5c, side: 0x6b5a3e },
  T: { name: "Wood", h: 0, cost: 2, def: 1, avo: 20, heal: 0, top: 0x5f8a46, side: 0x6b5a3e, tree: true },
  "^": { name: "Hill", h: 0.6, cost: 2, def: 1, avo: 20, heal: 0, top: 0x7ba055, side: 0x7d6b4c },
  "*": { name: "Ridge", h: 1.2, cost: 2, def: 2, avo: 30, heal: 0, top: 0x8e9270, side: 0x8a8068 },
  K: { name: "Keep", h: 1.2, cost: 2, def: 2, avo: 20, heal: 0.2, top: 0x9a9484, side: 0x8a8068, keep: true },
  "~": { name: "River", h: -0.35, cost: 99, def: 0, avo: 0, heal: 0, top: 0x3d5a48, side: 0x4a4034, water: true, block: true },
  b: { name: "Bridge", h: -0.35, walk: 0, cost: 1, def: 0, avo: 0, heal: 0, top: 0x3d5a48, side: 0x4a4034, water: true, bridge: true },
};

export const cell = (x, y) => TYPES[MAP[y][x]];
export const lvlH = (x, y) => {
  const t = cell(x, y);
  return t.walk !== undefined ? t.walk : t.h;
};
export const walkable = (x, y) => !cell(x, y).block;
export const inB = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH;
export const CLIMB = 0.7;
