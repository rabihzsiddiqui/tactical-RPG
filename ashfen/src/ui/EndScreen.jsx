/* the end of the battle, over the map: Victory or Defeat. The board
   darkens toward its edges and one panel comes up in the map panels'
   dress, gold for a win and red for a loss: the level's name, the result
   in carved capitals, a rule with a diamond at its middle, one line on
   what happened, the tally (turns, the company still standing, the foes
   routed) and the button to go again, which takes keyboard focus so
   Enter goes again too. The victory and defeat stingers play from the
   "end" event in scene.js, not from here. */

import { LEVEL_NAME } from "../core/map.js";
import { C, SERIF, DISPLAY, SCRIM_RGB, rgba } from "./theme.js";
import { RuleBtn } from "./primitives.jsx";

const IN_MS = 420;       // the panel's rise
const DELAY_MS = 120;    // after the board starts to darken
const TITLE_MS = 640;    // the title settling from a touch large
const RISE = 12;         // px the panel rises as it comes in

/* added to App.jsx's style block. Sized to the map, like the pause menu,
   so the panel centres on the board rather than on the board and the row
   under it. The accent is a custom property, so one set of rules serves
   both results. Under reduced motion it fades. */
export const END_CSS = `
  .end { position: absolute; top: 0; left: 0; right: 0; height: var(--view-h); z-index: 35; box-sizing: border-box;
    display: flex; align-items: center; justify-content: center; padding: 16px;
    background: radial-gradient(ellipse at center, rgba(${SCRIM_RGB},0.55), rgba(${SCRIM_RGB},0.9));
    animation: scrimIn 400ms ease-out both; }
  .end-panel { box-sizing: border-box; width: min(100%, 360px); padding: 20px 20px 18px; text-align: center;
    background: ${rgba(C.table, 0.9)}; border: 1px solid rgba(0,0,0,0.7);
    outline: 1px solid var(--end-accent); outline-offset: -5px;
    animation: endIn ${IN_MS}ms cubic-bezier(.22,.85,.32,1) ${DELAY_MS}ms both; }
  .end-title { animation: endTitle ${TITLE_MS}ms cubic-bezier(.22,.85,.32,1) ${DELAY_MS + 80}ms both; }
  .end-rule { display: flex; align-items: center; gap: 8px; margin: 14px 12px 12px; }
  .end-rule::before, .end-rule::after { content: ""; flex: 1; height: 1px; background: var(--end-accent); }
  .end-rule i { width: 6px; height: 6px; transform: rotate(45deg); background: var(--end-accent); }
  @keyframes endIn { from { opacity: 0; transform: translateY(${RISE}px); } }
  @keyframes endTitle { from { opacity: 0; transform: scale(1.1); } }
  @media (prefers-reduced-motion: reduce) {
    .end-panel { animation: scrimIn ${IN_MS}ms ease-out both; }
    .end-title { animation: none; }
  }
`;

const SMALL = { fontFamily: SERIF, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: C.rule };

function Tally({ k, v }) {
  return (
    <div style={{ flex: "1 1 0" }}>
      <div style={SMALL}>{k}</div>
      <div style={{ fontFamily: SERIF, fontSize: 20, lineHeight: "26px", color: C.parch }}>{v}</div>
    </div>
  );
}

/* `g` is the game ref, read once the status is no longer "playing" */
export default function EndScreen({ g, onRestart }) {
  const win = g.status === "win";
  const side = (team) => g.units.filter((u) => u.team === team);
  const standing = (team) => side(team).filter((u) => u.hp > 0).length;
  const lord = g.units.find((u) => u.lord);
  /* the same reasons checkEnd in core/game.js gives the field log */
  const line = win ? "Every enemy is routed. The pass is yours."
    : lord && lord.hp <= 0 ? "Kaelen has fallen." : "The company is lost.";
  const accent = win ? C.gold : C.redLite;
  return (
    <div className="end" role="dialog" aria-label={win ? "Victory" : "Defeat"}>
      <div className="end-panel" style={{ "--end-accent": rgba(accent, 0.75) }}>
        <div style={{ ...SMALL, fontSize: 10, letterSpacing: "0.24em", color: accent }}>{LEVEL_NAME}</div>
        {/* the tracking is added after the last letter too, so it comes
            back off the right edge to sit centred, as in PhaseBanner */}
        <div className="end-title" style={{
          fontFamily: DISPLAY, fontWeight: 600, fontSize: "clamp(34px, calc(var(--view-h) * 0.1), 52px)",
          lineHeight: 1.05, letterSpacing: "0.18em", marginRight: "-0.18em", marginTop: 6,
          textTransform: "uppercase", color: accent,
        }}>{win ? "Victory" : "Defeat"}</div>
        <div className="end-rule"><i /></div>
        <div style={{ fontFamily: SERIF, fontSize: 15, lineHeight: 1.4, color: C.parchDim, textWrap: "balance" }}>{line}</div>
        <div className="flex" style={{ gap: 8, margin: "16px 0 18px" }}>
          <Tally k="Turns" v={g.turn} />
          <Tally k="Company" v={`${standing("player")}/${side("player").length}`} />
          <Tally k="Foes routed" v={`${side("enemy").length - standing("enemy")}/${side("enemy").length}`} />
        </div>
        <RuleBtn strong autoFocus on={onRestart} style={{ minWidth: 160 }}>{win ? "Play again" : "Try again"}</RuleBtn>
      </div>
    </div>
  );
}
