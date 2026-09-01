/* small shared helpers used across core/, view/, and ui/. None of it touches three.js */

export const K = (x, y) => x + "," + y;
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const man = (a, b, c, d) => Math.abs(a - c) + Math.abs(b - d);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
