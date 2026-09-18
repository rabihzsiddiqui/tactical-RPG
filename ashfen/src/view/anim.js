/* the one animation primitive in use. A tween is a callback fed a 0..1
   progress value once per frame until it reaches 1, wrapped in a promise
   that resolves on that last call, so `await tween(ms, fn)` reads as a
   timed step in an async sequence.

   The queue is module-level rather than owned by scene.js so camera.js can
   schedule tweens without importing the scene. scene.js still drives it:
   frame() calls stepTweens every tick and the unmount cleanup resets it. */

const tweens = [];
let frozenMs = 0;

export const tween = (ms, fn) => new Promise((res) => tweens.push({ t: 0, ms, fn, res }));

/* hit-stop. Holds animation time still for `ms` of real time, then lets
   it run again. Everything driven by stepTweens freezes, and the frame
   loop feeds the dt this returns to the unit animator and the effects
   too, so the whole scene holds on the frame of contact. A shake or
   recoil queued during the freeze simply starts when it lifts, which is
   the order the plan wants: freeze, then recoil. Overlapping calls keep
   the longer hold rather than adding up. */
export function hitStop(ms) {
  frozenMs = Math.max(frozenMs, ms);
}

/* advances every live tween by dtMs and resolves the ones that finished.
   Returns the animation time that actually elapsed, which is less than
   dtMs while a hit-stop is draining. Walks backwards so splicing a
   finished entry never skips its neighbour. */
export function stepTweens(dtMs) {
  if (frozenMs > 0) {
    const held = Math.min(frozenMs, dtMs);
    frozenMs -= held;
    dtMs -= held;
    if (dtMs <= 0) return 0;
  }
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dtMs;
    const k = Math.min(1, tw.t / tw.ms);
    tw.fn(k);
    if (k >= 1) { tweens.splice(i, 1); tw.res(); }
  }
  return dtMs;
}

/* drops everything pending. Their promises never resolve, which matches
   what the old per-scene array did when the frame loop was cancelled. */
export function resetTweens() {
  tweens.length = 0;
  frozenMs = 0;
}

/* easings. tween() hands out linear progress and the caller shapes it,
   which keeps the primitive dumb and lets one tween drive two curves. */
export const easeOutCubic = (k) => 1 - Math.pow(1 - k, 3);
export const easeInOutQuad = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
