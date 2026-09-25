/* the unit panel: a small window in the map's top-right corner, beside the
   Menu button, for whichever unit was tapped last, ally or foe. Face, name,
   class, weapon and health. It took over from the side panel's unit card,
   which on a phone sat below the map, out of sight. It speaks in the
   menu's voice (PauseMenu.jsx): a dark panel with the gold rule inside a
   darker edge, the name in carved capitals, everything else in MONO.

   It sits level with the Menu button rather than under it. Under it, on a
   phone, the panel landed on the keep, so tapping the Sniper or Garrick
   covered the unit it was describing. Level with the button it sits over
   the ground beyond the board's far edge at the opening pose.

   It never takes a tap, so a unit standing in the corner under it can
   still be picked. App.jsx decides when it shows; it hides for the cut-in,
   where the battle HUD does the same job. On the way out it fades on the
   last unit it showed rather than going blank first. */

import { useState } from "react";
import { wep } from "../core/combat.js";
import { portraitOf } from "../view/portrait.js";
import { C, MONO, DISPLAY, rgba } from "./theme.js";
import WeaponIcon from "./WeaponIcon.jsx";

const TOP = 8;        // px from the map's top edge, level with the Menu button
const RIGHT = 92;     // px from the map's right edge: the Menu button's 8 inset and 76 width (75.1 in Cinzel), then 8 between
const WIDTH = 224;    // px, fixed, so the panel keeps its size from one unit to the next; fits "Mercenary" in capitals
const FACE = 56;      // px, the portrait's side; portrait.js renders at twice this
const FADE_MS = 160;  // the fade and slide, in and out
const SLIDE = 8;      // px the panel travels in from the right

const LABEL = { fontFamily: MONO, fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: C.rule };

/* added to App.jsx's style block, like MENU_CSS. No fill mode on the way
   in: a held keyframe would pin the opacity and the fade out would never
   run. Under reduced motion it fades in place. */
export const UNIT_HUD_CSS = `
  .uhud { position: absolute; top: ${TOP}px; right: ${RIGHT}px; z-index: 19; box-sizing: border-box;
    width: ${WIDTH}px; max-width: calc(100% - ${RIGHT + 8}px); padding: 10px 11px 10px 10px;
    display: flex; align-items: center; gap: 10px; pointer-events: none;
    background: ${rgba(C.table, 0.88)}; border: 1px solid rgba(0,0,0,0.7);
    outline: 1px solid ${rgba(C.gold, 0.7)}; outline-offset: -4px;
    animation: uhudIn ${FADE_MS}ms ease-out;
    transition: opacity ${FADE_MS}ms ease-out, transform ${FADE_MS}ms ease-out; }
  .uhud.off { opacity: 0; transform: translateX(${SLIDE}px); visibility: hidden;
    transition: opacity ${FADE_MS}ms ease-in, transform ${FADE_MS}ms ease-in, visibility 0s linear ${FADE_MS}ms; }
  @keyframes uhudIn { from { opacity: 0; transform: translateX(${SLIDE}px); } }
  @keyframes uhudFade { from { opacity: 0; } }
  .uhud-fill { height: 100%; transform-origin: left; transition: transform .22s ease-out; }
  @media (prefers-reduced-motion: reduce) {
    .uhud { animation-name: uhudFade; }
    .uhud, .uhud.off { transform: none; }
    .uhud-fill { transition: none; }
  }
`;

/* `u` is the unit to show, or null to fade out */
export default function UnitHud({ u }) {
  /* the last unit shown, kept so the fade out has a face to fade. Set
     during render, React's pattern for state that follows a prop. */
  const [last, setLast] = useState(u);
  if (u && u !== last) setLast(u);
  const shown = u || last;
  if (!shown) return null;

  const w = wep(shown);
  const ally = shown.team === "player";
  const hp = Math.max(0, shown.hp);
  const src = portraitOf(shown);
  return (
    <div className={"uhud" + (u ? "" : " off")} aria-hidden={u ? undefined : true}>
      {/* the team's colour behind the face, the way a portrait window
          says whose side a unit is on before the name does */}
      <div style={{
        width: FACE, height: FACE, flex: "0 0 auto", background: ally ? C.blue : C.red,
        border: "1px solid rgba(0,0,0,0.7)", boxSizing: "content-box", overflow: "hidden",
      }}>
        {src && <img src={src} alt="" width={FACE} height={FACE} style={{ display: "block" }} />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="truncate" style={{
          fontFamily: DISPLAY, fontWeight: 600, fontSize: 15, lineHeight: "18px", textTransform: "uppercase",
          letterSpacing: "0.14em", color: C.parch,
        }}>{shown.name}</div>
        <div className="truncate" style={{ ...LABEL, lineHeight: "14px" }}>{shown.cls}</div>

        <div className="flex items-center gap-1.5" style={{ marginTop: 3 }}>
          <WeaponIcon type={w.type} color={C.gold} />
          <span className="truncate" style={{
            fontFamily: MONO, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: C.parchDim,
          }}>{w.name}</span>
        </div>

        <div className="flex items-center gap-1.5" style={{ marginTop: 4 }}>
          <span style={{ ...LABEL, fontSize: 9, letterSpacing: "0.14em" }}>HP</span>
          <div className="flex-1" style={{ height: 6, background: C.table, border: "1px solid " + rgba(C.rule, 0.55) }}>
            {/* keyed by unit, so moving to another unit swaps the bar
                rather than sliding it from the last unit's health */}
            <div key={shown.id} className="uhud-fill" style={{
              transform: `scaleX(${hp / shown.maxHp})`, background: ally ? C.blueLite : C.redLite,
            }} />
          </div>
          <span style={{ fontFamily: MONO, fontSize: 12, color: C.parch, minWidth: 38, textAlign: "right" }}>
            {hp}/{shown.maxHp}
          </span>
        </div>
      </div>
    </div>
  );
}
