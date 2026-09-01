import { LEVEL_NAME } from "../core/map.js";
import { GAME_TITLE, TAGLINE } from "./meta.js";
import { C, MONO, SERIF } from "./theme.js";
import { Btn } from "./primitives.jsx";

/* the very first thing a visitor sees — also the deliberate user gesture
   that unlocks audio (audio.js's global pointerdown listener fires on this
   click, since nothing on the page is interactive before it).

   Title and level are separate lines on purpose: the game is the big name,
   Ashfen Pass is the map it currently ships with, and more levels are
   planned under the same title. */
export default function TitleCard({ onBegin, onHelp }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 60, background: C.table }}>
      <div className="flex flex-col items-center text-center" style={{ padding: "0 24px", maxWidth: 420 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.28em", color: C.gold, marginBottom: 10 }}>
          ROUT THE ENEMY COMPANY
        </div>
        <div style={{ fontFamily: SERIF, fontSize: 44, color: C.parch, lineHeight: 1.1 }}>
          {GAME_TITLE}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 13, color: C.parchDim, marginTop: 14 }}>
          {TAGLINE}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.18em", color: C.rule, marginTop: 18, marginBottom: 26 }}>
          LEVEL &middot; {LEVEL_NAME.toUpperCase()}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Btn strong on={onBegin}>Begin</Btn>
          {/* offered before the first click on purpose: someone who has never
              played a grid tactics game should be able to read the rules
              without first committing to a battle they can't yet follow */}
          <Btn on={onHelp}>How to play</Btn>
        </div>
      </div>
    </div>
  );
}
