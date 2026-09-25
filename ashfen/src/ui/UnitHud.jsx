/* the unit panel: a small window in the map's top-left corner for whichever
   unit was tapped last, ally or foe. Face, name, class, weapon and health,
   and a tap on the panel opens the rest: the stat grid, the weapon's
   numbers, level, EXP, vulneraries and the tile underfoot. It took over
   from the side panel's unit card, which on a phone sat below the map, out
   of sight. It speaks in the menu's voice (PauseMenu.jsx): a dark panel
   with the gold rule inside a darker edge, the name in carved capitals,
   everything else in MONO.

   It stays in the strip above the board's far edge at the opening pose,
   level with the Menu button. The first cut hung under that button and,
   on a phone, landed on the keep, covering the Sniper or Garrick when
   either was tapped. Opened, it does cover the board; that is the reader's
   call, and a second tap folds it away.

   App.jsx decides when it shows; it hides for the cut-in, where the
   battle HUD does the same job, and for the forecast, which shows both
   faces anyway. On the way out it fades on the last unit it showed rather
   than going blank first. */

import { useState } from "react";
import { wep, wepBonus } from "../core/combat.js";
import { cell } from "../core/map.js";
import { portraitOf } from "../view/portrait.js";
import { playDrag } from "../view/audio.js";
import { C, MONO, DISPLAY, rgba } from "./theme.js";
import WeaponIcon from "./WeaponIcon.jsx";

/* the Menu button's clearance, the face and the fade timing are shared
   with the forecast (Forecast.jsx), and the face with the battle HUD */
const TOP = 8;                 // px from the map's top edge, level with the Menu button
const LEFT = 8;                // px from the map's left edge, the Menu button's own inset mirrored
export const MENU_CLEAR = 92;  // px kept free at the right for the Menu button: its 76 width (75.1 in Cinzel), its 8 inset and 8 between
const WIDTH = 224;             // px, fixed, so the panel keeps its size from one unit to the next; fits "Mercenary" in capitals
export const FACE = 56;        // px, the portrait's side; portrait.js renders at twice this
export const FADE_MS = 160;    // the fade and slide, in and out, and the chevron's turn
const SLIDE = 8;               // px the panel travels in from the left

const LABEL = { fontFamily: MONO, fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: C.rule };
const SMALL = { ...LABEL, fontSize: 9, letterSpacing: "0.14em" };
const STATS = [["Str", "str"], ["Mag", "mag"], ["Skl", "skl"], ["Spd", "spd"],
  ["Lck", "lck"], ["Def", "def"], ["Res", "res"]];

/* added to App.jsx's style block, like MENU_CSS. No fill mode on the way
   in: a held keyframe would pin the opacity and the fade out would never
   run. Hover and focus light the gold rule the way they do on the Menu
   button. Under reduced motion it fades in place. */
export const UNIT_HUD_CSS = `
  .uhud { position: absolute; top: ${TOP}px; left: ${LEFT}px; z-index: 19; box-sizing: border-box;
    width: ${WIDTH}px; max-width: calc(100% - ${LEFT + MENU_CLEAR}px); padding: 10px 11px 10px 10px;
    background: ${rgba(C.table, 0.88)}; border: 1px solid rgba(0,0,0,0.7);
    outline: 1px solid ${rgba(C.gold, 0.7)}; outline-offset: -4px;
    cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent; user-select: none;
    animation: uhudIn ${FADE_MS}ms ease-out;
    transition: opacity ${FADE_MS}ms ease-out, transform ${FADE_MS}ms ease-out; }
  .uhud:hover, .uhud:focus-visible { outline-color: ${C.gold}; }
  .uhud.off { opacity: 0; transform: translateX(-${SLIDE}px); visibility: hidden;
    transition: opacity ${FADE_MS}ms ease-in, transform ${FADE_MS}ms ease-in, visibility 0s linear ${FADE_MS}ms; }
  @keyframes uhudIn { from { opacity: 0; transform: translateX(-${SLIDE}px); } }
  @keyframes uhudFade { from { opacity: 0; } }
  .uhud-more { animation: uhudFade ${FADE_MS}ms ease-out; }
  .uhud-chev { transition: transform ${FADE_MS}ms ease-out; }
  .uhud.open .uhud-chev { transform: rotate(180deg); }
  .uhud-fill { height: 100%; transform-origin: left; transition: transform .22s ease-out; }
  @media (prefers-reduced-motion: reduce) {
    .uhud { animation-name: uhudFade; }
    .uhud, .uhud.off { transform: none; }
    .uhud-chev, .uhud-fill { transition: none; }
  }
`;

/* a stat: small label over its value, as in the battle HUD. `bonus` is
   what the weapon adds, shown after the base value in gold. */
function Cell({ k, v, bonus }) {
  return (
    <div>
      <div style={{ ...SMALL, lineHeight: "12px" }}>{k}</div>
      <div style={{ fontFamily: MONO, fontSize: 13, lineHeight: "16px", color: C.parch }}>
        {v}{bonus ? <span style={{ color: C.gold }}>+{bonus}</span> : null}
      </div>
    </div>
  );
}

/* a label and value on one row, as in the menu's status panel */
function Line({ k, v }) {
  return (
    <div className="flex items-baseline justify-between gap-3" style={{ lineHeight: "17px" }}>
      <span style={SMALL}>{k}</span>
      <span className="truncate" style={{
        fontFamily: MONO, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: C.parch,
      }}>{v}</span>
    </div>
  );
}

/* the unit's portrait, with the team's colour behind the face, the way a
   portrait window says whose side a unit is on before the name does.
   `children` lie over it, for the battle HUD's health gauge. */
export function Face({ u, children }) {
  const src = portraitOf(u);
  return (
    <div style={{
      position: "relative", width: FACE, height: FACE, flex: "0 0 auto",
      background: u.team === "player" ? C.blue : C.red,
      border: "1px solid rgba(0,0,0,0.7)", boxSizing: "content-box", overflow: "hidden",
    }}>
      {src && <img src={src} alt="" width={FACE} height={FACE} style={{ display: "block" }} draggable={false} />}
      {children}
    </div>
  );
}

export function Rule({ faint }) {
  return <div style={faint
    ? { height: 1, margin: "6px 0", background: C.rule, opacity: 0.25 }
    : { height: 1, margin: "9px 0 7px", background: C.gold, opacity: 0.85 }} />;
}

/* everything the collapsed panel leaves out */
function Details({ u }) {
  const w = wep(u);
  const t = cell(u.x, u.y);
  const ally = u.team === "player";
  return (
    <div className="uhud-more">
      <Rule />
      <div className="grid grid-cols-4 gap-y-1.5">
        {STATS.map(([k, s]) => <Cell key={k} k={k} v={u[s]} bonus={wepBonus(u, s)} />)}
        <Cell k="Mov" v={u.mov} />
      </div>
      <Rule faint />
      <div className="grid grid-cols-4">
        <Cell k="Mt" v={w.mt} />
        <Cell k="Hit" v={w.hit} />
        <Cell k="Crit" v={w.crit} />
        <Cell k="Rng" v={w.rmin === w.rmax ? w.rmin : w.rmin + "-" + w.rmax} />
      </div>
      <Rule faint />
      <Line k="Level" v={u.lvl} />
      {ally && <Line k="Exp" v={u.exp + "/100"} />}
      {ally && <Line k="Vulneraries" v={u.vulnerary} />}
      <Line k="Terrain" v={t.name + (t.heal ? ", heals" : "")} />
      <Line k="Cover" v={`+${t.def} Def  +${t.avo} Avo`} />
    </div>
  );
}

/* `u` is the unit to show, or null to fade out */
export default function UnitHud({ u }) {
  /* the last unit shown, kept so the fade out has a face to fade. Set
     during render, React's pattern for state that follows a prop. */
  const [last, setLast] = useState(u);
  if (u && u !== last) setLast(u);
  /* stays open from one unit to the next, so two units can be compared
     tap by tap */
  const [open, setOpen] = useState(false);
  const shown = u || last;
  if (!shown) return null;

  function toggle() {
    playDrag();
    setOpen((o) => !o);
  }
  const w = wep(shown);
  const ally = shown.team === "player";
  const hp = Math.max(0, shown.hp);
  return (
    <div className={"uhud" + (u ? "" : " off") + (open ? " open" : "")}
      role="button" tabIndex={u ? 0 : -1} aria-expanded={open} aria-hidden={u ? undefined : true}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        if (!e.repeat) toggle();
      }}>
      <div className="flex items-center" style={{ gap: 10 }}>
        <Face u={shown} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="truncate flex-1" style={{
              fontFamily: DISPLAY, fontWeight: 600, fontSize: 15, lineHeight: "18px", textTransform: "uppercase",
              letterSpacing: "0.14em", color: C.parch,
            }}>{shown.name}</div>
            <svg className="uhud-chev" viewBox="0 0 10 10" width={10} height={10} aria-hidden="true"
              style={{ flex: "0 0 auto", color: C.rule }}>
              <path d="M2 3.5 L5 6.5 L8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>
          <div className="truncate" style={{ ...LABEL, lineHeight: "14px" }}>{shown.cls}</div>

          <div className="flex items-center gap-1.5" style={{ marginTop: 3 }}>
            <WeaponIcon type={w.type} color={C.gold} />
            <span className="truncate" style={{
              fontFamily: MONO, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: C.parchDim,
            }}>{w.name}</span>
          </div>

          <div className="flex items-center gap-1.5" style={{ marginTop: 4 }}>
            <span style={SMALL}>HP</span>
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

      {open && <Details u={shown} />}
    </div>
  );
}
