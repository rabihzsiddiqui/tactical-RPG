/* the forecast turns into the battle HUD when Attack is pressed. The
   forecast hands over its box here as it goes, and the HUD, mounting in
   the same render, grows its frame out of that box (BattleHud.jsx). Kept
   out of React state: it is read once, as the HUD mounts. */

const FRESH_MS = 600; // older than this, a box belongs to no HUD: Attack with the cut-in off hands one over too

let box = null, at = 0;

/* `rect` is the forecast's getBoundingClientRect() */
export function handOff(rect) {
  box = rect;
  at = performance.now();
}

/* the box a HUD mounting now should grow from, or null. Reads only, so
   StrictMode's second render gets the same answer. */
export function takeOver() {
  return box && performance.now() - at < FRESH_MS ? box : null;
}
