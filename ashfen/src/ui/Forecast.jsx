/* the battle forecast. When the player picks a target it takes the unit
   panel's place in the map's top-left corner (UnitHud.jsx) and speaks in
   the same voice: the dark panel with the gold rule inside a darker edge,
   names in carved capitals, everything else in MONO. App.jsx hides the
   unit panel for as long as it is up.

   The two faces meet across the numbers, the attacker's on the left
   looking right and the defender's on the right looking left (portrait.js
   turns them by team, and only the player ever sees a forecast). Each
   side's damage, hit, crit and number of attacks sit either side of one
   column of labels, with dashes for a side that cannot strike back. The
   weapon triangle is an arrow after each weapon: up for the side it
   favours, down for the other.

   It used to be a parchment card over the board, moved every frame by
   scene.js to sit above the two units. On the way out it fades on the
   last pair it showed, like the unit panel. */

import { Fragment, useState } from "react";
import { wep } from "../core/combat.js";
import { C, MONO, DISPLAY, rgba } from "./theme.js";
import WeaponIcon from "./WeaponIcon.jsx";
import { RuleBtn } from "./primitives.jsx";
import { TOP, LEFT, MENU_CLEAR, FACE, FADE_MS, SLIDE, Face, Rule } from "./UnitHud.jsx";

const WIDTH = 256;     // px; two faces with the numbers between, and "Mercenary" in capitals over one side
const ROW = FACE / 4;  // px per stat row, so the four rows stand exactly as tall as a face
const LABELS = ["Dmg", "Hit", "Crit", "Atks"]; // four letters at most: a 360px phone leaves the middle column about 27px

/* the unit panel's small label */
const SMALL = { fontFamily: MONO, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: C.rule };

/* added to App.jsx's style block next to the unit panel's. The same
   motion as that panel, and no fill mode on the way in for the same
   reason. The buttons are RuleBtn, the Menu button's dress. */
export const FORECAST_CSS = `
  .fcast { position: absolute; top: ${TOP}px; left: ${LEFT}px; z-index: 22; box-sizing: border-box;
    width: ${WIDTH}px; max-width: calc(100% - ${LEFT + MENU_CLEAR}px); padding: 10px;
    background: ${rgba(C.table, 0.88)}; border: 1px solid rgba(0,0,0,0.7);
    outline: 1px solid ${rgba(C.gold, 0.7)}; outline-offset: -4px; user-select: none;
    animation: fcastIn ${FADE_MS}ms ease-out;
    transition: opacity ${FADE_MS}ms ease-out, transform ${FADE_MS}ms ease-out; }
  .fcast.off { opacity: 0; transform: translateX(-${SLIDE}px); visibility: hidden; pointer-events: none;
    transition: opacity ${FADE_MS}ms ease-in, transform ${FADE_MS}ms ease-in, visibility 0s linear ${FADE_MS}ms; }
  @keyframes fcastIn { from { opacity: 0; transform: translateX(-${SLIDE}px); } }
  @keyframes fcastFade { from { opacity: 0; } }
  .fcast .rbtn { flex: 1 1 0; }
  @media (prefers-reduced-motion: reduce) {
    .fcast { animation-name: fcastFade; }
    .fcast, .fcast.off { transform: none; }
  }
`;

/* the weapon triangle for one side: +1, -1 or 0 */
function Tri({ t }) {
  if (!t) return null;
  const up = t > 0;
  return (
    <svg viewBox="0 0 8 8" width={8} height={8} role="img"
      aria-label={up ? "weapon advantage" : "weapon disadvantage"}
      style={{ flex: "0 0 auto", color: up ? C.green : C.redLite }}>
      <path d={up ? "M4 1 L7.5 7 H0.5 Z" : "M4 7 L7.5 1 H0.5 Z"} fill="currentColor" />
    </svg>
  );
}

/* one side's name and weapon, mirrored on the right */
function Head({ u, tri, right }) {
  const w = wep(u);
  return (
    <div className="flex-1 min-w-0" style={{ textAlign: right ? "right" : "left" }}>
      <div className="truncate" style={{
        fontFamily: DISPLAY, fontWeight: 600, fontSize: 13, lineHeight: "17px", textTransform: "uppercase",
        letterSpacing: "0.12em", color: C.parch,
        // the tracking after the last capital, paid back so the right name ends flush with its face
        marginRight: right ? "-0.12em" : 0,
      }}>{u.name}</div>
      <div className="flex items-center gap-1" style={{ flexDirection: right ? "row-reverse" : "row", marginTop: 2 }}>
        <WeaponIcon type={w.type} size={12} color={C.gold} />
        <span className="truncate" style={{
          fontFamily: MONO, fontSize: 10, lineHeight: "12px", letterSpacing: "0.08em", textTransform: "uppercase",
          color: C.parchDim,
        }}>{w.name}</span>
        <Tri t={tri} />
      </div>
    </div>
  );
}

/* both sides' numbers either side of the labels. `f` is forecastOf's
   result; the defender's side is dashes when it cannot counter. */
function Numbers({ f }) {
  const vals = (s) => (s ? [s.dmg, s.acc, s.crit, s.doubles ? "x2" : "x1"] : null);
  const a = vals(f.a), d = vals(f.counters ? f.d : null);
  const cell = (v, right) => (
    <div style={{
      fontFamily: MONO, fontSize: 13, lineHeight: ROW + "px", textAlign: right ? "right" : "left",
      color: v == null ? C.rule : C.parch,
    }}>{v ?? "--"}</div>
  );
  return (
    <div className="flex-1 min-w-0 grid" style={{ gridTemplateColumns: "1fr auto 1fr", columnGap: 6 }}>
      {LABELS.map((k, i) => (
        <Fragment key={k}>
          {cell(a[i])}
          <div style={{ ...SMALL, lineHeight: ROW + "px", textAlign: "center", paddingLeft: "0.14em" }}>{k}</div>
          {cell(d ? d[i] : null, true)}
        </Fragment>
      ))}
    </div>
  );
}

/* one side's health, the bar draining toward the middle of the panel */
function Hp({ u, right }) {
  const hp = Math.max(0, u.hp);
  return (
    <div className="flex items-center gap-1.5 min-w-0" style={{ flexDirection: right ? "row-reverse" : "row" }}>
      <div className="flex-1 flex" style={{
        height: 6, background: C.table, border: "1px solid " + rgba(C.rule, 0.55),
        justifyContent: right ? "flex-end" : "flex-start",
      }}>
        <div style={{ width: (hp / u.maxHp) * 100 + "%", background: u.team === "player" ? C.blueLite : C.redLite }} />
      </div>
      <span style={{ fontFamily: MONO, fontSize: 11, lineHeight: "14px", color: C.parch }}>{hp}/{u.maxHp}</span>
    </div>
  );
}

/* `fc` is { a, d, f }: attacker, defender and forecastOf(a, d), or null
   to fade out */
export default function Forecast({ fc, onAttack, onCancel }) {
  /* the last pair shown, kept so the fade out has faces to fade. Units
     are stable objects, so a new pair is a new attacker or defender. */
  const [last, setLast] = useState(fc);
  if (fc && (!last || fc.a !== last.a || fc.d !== last.d)) setLast(fc);
  const shown = fc || last;
  if (!shown) return null;

  const { a, d, f } = shown;
  return (
    <div className={"fcast" + (fc ? "" : " off")} role="group" aria-label="Battle forecast"
      aria-hidden={fc ? undefined : true}>
      <div className="flex" style={{ gap: 10 }}>
        <Head u={a} tri={f.a.tri} />
        <Head u={d} tri={-f.a.tri} right />
      </div>

      <div className="flex items-center" style={{ gap: 8, marginTop: 7 }}>
        <Face u={a} />
        <Numbers f={f} />
        <Face u={d} />
      </div>

      <div className="grid items-center" style={{ gridTemplateColumns: "1fr auto 1fr", columnGap: 6, marginTop: 7 }}>
        <Hp u={a} />
        <div style={{ ...SMALL, lineHeight: "14px", paddingLeft: "0.14em" }}>HP</div>
        <Hp u={d} right />
      </div>

      <Rule />
      <div className="flex" style={{ gap: 8 }}>
        <RuleBtn strong tabIndex={fc ? 0 : -1} on={() => onAttack(d.id)}>Attack</RuleBtn>
        <RuleBtn tabIndex={fc ? 0 : -1} on={onCancel}>Back</RuleBtn>
      </div>
    </div>
  );
}
