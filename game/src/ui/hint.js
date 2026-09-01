/* one line of text that always names the next action, driven by game
   state. Never returns empty. See PROJECT_PLAN.md's P1 section for the
   state-to-text mapping this implements. */
export function hintFor(g) {
  if (g.status !== "playing") {
    return g.status === "win"
      ? "Victory. Press Restart to play again."
      : "Defeat. Press Restart to try again.";
  }
  if (g.phase === "enemy") return "Enemy phase.";
  if (g.forecast) return "Attack to commit, or Back to reconsider.";
  if (g.sel) {
    if (g.sel.mode === "target") return "Tap a red enemy to see the forecast.";
    if (g.sel.mode === "targetHeal") return "Tap an ally to heal them.";
    if (g.sel.mode === "action") return "Choose an action.";
    return "Tap a blue tile to move there.";
  }
  const allActed = g.units
    .filter((u) => u.team === "player" && u.hp > 0)
    .every((u) => u.acted);
  return allActed ? "Press End Turn." : "Tap one of your blue units.";
}
