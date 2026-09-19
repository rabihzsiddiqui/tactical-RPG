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

/* RELIEF. The mound used to stand at 0.6 for a hill and 1.2 for the ridge
   and keep, which is most of a unit's own height: a melee swing across one
   step landed at the target's ankles, and the cut-in camera, which sits
   about 0.58 above the midpoint of the pair, ended up inside the ridge.
   Every height here is that old set halved, CLIMB included, so pathing is
   unchanged (plain to hill legal, hill to keep legal, plain to keep
   blocked) while the worst a fight straddles is 0.3 rather than 0.6.

   Halved rather than flattened on purpose. The swing pitch in attacks.js
   and the lens clamp in camera.js handle the step now, so the relief only
   has to be small enough to read well, not small enough to hide.

   The river keeps its old depth. Nothing walks in it, and what the player
   actually sees is the water surface at -0.1, a shallow dip; the bed at
   -0.35 only exists so the banks have a wall to draw. */
export const TYPES = {
  ".": { name: "Plain", h: 0, cost: 1, def: 0, avo: 0, heal: 0, top: 0x6f9a4e, side: 0x6b5a3e },
  ",": { name: "Path", h: 0, cost: 1, def: 0, avo: 0, heal: 0, top: 0xa08a5c, side: 0x6b5a3e },
  T: { name: "Wood", h: 0, cost: 2, def: 1, avo: 20, heal: 0, top: 0x5f8a46, side: 0x6b5a3e, tree: true },
  "^": { name: "Hill", h: 0.3, cost: 2, def: 1, avo: 20, heal: 0, top: 0x7ba055, side: 0x7d6b4c },
  "*": { name: "Ridge", h: 0.6, cost: 2, def: 2, avo: 30, heal: 0, top: 0x8e9270, side: 0x8a8068 },
  K: { name: "Keep", h: 0.6, cost: 2, def: 2, avo: 20, heal: 0.2, top: 0x9a9484, side: 0x8a8068, keep: true },
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
export const CLIMB = 0.35;
