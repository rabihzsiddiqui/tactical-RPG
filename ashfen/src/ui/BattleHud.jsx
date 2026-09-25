/* the battle HUD: the panel along the bottom of the viewport while the
   camera is in on an exchange. It replaces the world health bars for the
   duration (animUnit hides them, see scene.js). It is the forecast in a
   wider cut (Forecast.jsx): the same dark panel with the gold rule, the
   two faces on the outer edges, the numbers and their labels between
   them. It keeps the old parchment HUD's size, the full width to 520px
   and about 100px tall, so it covers no more of the fight than that did.
   To fit, each side's HP rides in the names row, either side of an HP
   label over the numbers' labels, and its bar lies along the foot of the
   face. From WIDE up there is room for each weapon beside its name.

   The numbers come from `cut.f`, the forecast scene.js took the moment the
   cut-in began, so they do not move while strikes land. The HP comes from
   the live unit: each strike writes hpAfter to the target at the frame of
   contact and ticks, so the bar drains in step with the hit. The player's
   unit always sits on the left, whichever side is attacking, so blue is
   left and red is right every time the panel appears.

   When the exchange comes from the forecast's Attack, the forecast hands
   over its box (morph.js) and this HUD's frame grows out of it: the panel
   drops from over the enemy to the bottom edge and takes its new size,
   and the contents fade in once it has landed. The frame moves by
   transform alone; the contents never scale. Any other exchange rises in
   from just below, as before. */

import { useLayoutEffect, useRef, useState } from "react";
import { wep } from "../core/combat.js";
import { C, MONO, DISPLAY, rgba } from "./theme.js";
import WeaponIcon from "./WeaponIcon.jsx";
import { Face } from "./UnitHud.jsx";
import { Numbers, Tri } from "./Forecast.jsx";
import { takeOver } from "./morph.js";

const MORPH_MS = 240;   // the frame's flight from the forecast's box to its own
const BODY_DELAY = 150; // ms into that flight before the contents start to fade in
const BODY_MS = 160;    // the contents' fade
const WIDE = 420;       // px of content width from which each name carries its weapon
const GAUGE = 5;        // px, the health bar's height along the foot of a face

const SMALL = { fontFamily: MONO, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: C.rule };

/* added to App.jsx's style block. No fill mode on the rise in: a held
   keyframe would pin the transform and the closing drop would never run.
   The container query is on the HUD's own width. */
export const BATTLE_HUD_CSS = `
  .bhud { position: relative; box-sizing: border-box; width: min(100% - 16px, 520px); padding: 10px;
    container-type: inline-size; pointer-events: none;
    animation: hudIn .22s ease-out; transition: opacity .3s ease-in, transform .3s ease-in; }
  .bhud.closing { opacity: 0; transform: translateY(10px); }
  .bhud-frame { position: absolute; inset: 0; transform-origin: 0 0;
    background: ${rgba(C.table, 0.88)}; border: 1px solid rgba(0,0,0,0.7);
    outline: 1px solid ${rgba(C.gold, 0.7)}; outline-offset: -4px; }
  .bhud-body { position: relative; }
  .bhud.morph { animation: none; }
  .bhud.morph .bhud-body { animation: bhudBody ${BODY_MS}ms ease-out ${BODY_DELAY}ms both; }
  @keyframes hudIn { from { transform: translateY(10px); opacity: 0; } }
  @keyframes bhudBody { from { opacity: 0; } }
  .bhud-fill { height: 100%; transition: width .22s ease-out; }
  .bhud-wep { display: none; }
  @container (min-width: ${WIDE}px) { .bhud-wep { display: flex; } }
  @media (prefers-reduced-motion: reduce) {
    .bhud, .bhud.morph .bhud-body { animation: none; }
    .bhud, .bhud-fill { transition: none; }
  }
`;

/* one side's name, weapon (when there is room) and HP, mirrored on the
   right so the HP sits toward the middle. A size down from the forecast's
   names, so "Mercenary" and its HP share a side of a 320px HUD. The
   weapon only takes what the name and HP leave, so it is the one that
   gives way. */
function Side({ u, tri, right }) {
  const w = wep(u);
  return (
    <div className="flex items-center min-w-0" style={{ gap: 6, flexDirection: right ? "row-reverse" : "row" }}>
      <div className="truncate" style={{
        fontFamily: DISPLAY, fontWeight: 600, fontSize: 12, lineHeight: "17px", textTransform: "uppercase",
        letterSpacing: "0.1em", color: C.parch, marginRight: right ? "-0.1em" : 0,
      }}>{u.name}</div>
      <div className="bhud-wep items-center gap-1" style={{ flexDirection: right ? "row-reverse" : "row", flex: "1 1 0", minWidth: 0 }}>
        <WeaponIcon type={w.type} size={12} color={C.gold} />
        <span className="truncate" style={{
          fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: C.parchDim,
        }}>{w.name}</span>
        <Tri t={tri} />
      </div>
      <span style={{
        flex: "0 0 auto", fontFamily: MONO, fontSize: 11, lineHeight: "17px", color: C.parch,
        [right ? "marginRight" : "marginLeft"]: "auto",
      }}>{Math.max(0, u.hp)}/{u.maxHp}</span>
    </div>
  );
}

/* the health bar along the foot of a face, draining toward the middle of
   the panel */
function Gauge({ u, right }) {
  return (
    <div className="flex" style={{
      position: "absolute", left: 0, right: 0, bottom: 0, height: GAUGE,
      background: rgba(C.table, 0.85), justifyContent: right ? "flex-end" : "flex-start",
    }}>
      <div className="bhud-fill" style={{
        width: (Math.max(0, u.hp) / u.maxHp) * 100 + "%",
        background: u.team === "player" ? C.blueLite : C.redLite,
      }} />
    </div>
  );
}

export default function BattleHud({ cut, units }) {
  const frameRef = useRef(null);
  /* the forecast's box when this exchange came from its Attack. Read in
     the initialiser so the first paint already has the right class. */
  const [from] = useState(takeOver);

  /* the frame's flight, first-last-invert-play: put it where the forecast
     was with a transform, then let the transform go. Cleared first, so
     StrictMode's second run measures the real box, not the first run's
     flight in progress. */
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!from || !el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.style.transition = "none";
    el.style.transform = "none";
    const to = el.getBoundingClientRect();
    el.style.transform = `translate(${from.left - to.left}px, ${from.top - to.top}px) `
      + `scale(${from.width / to.width}, ${from.height / to.height})`;
    el.getBoundingClientRect(); // commit the start before the transition is set
    el.style.transition = `transform ${MORPH_MS}ms cubic-bezier(.22,.85,.32,1)`;
    el.style.transform = "none";
  }, [from]);

  const src = units.find((u) => u.id === cut.srcId);
  const tgt = units.find((u) => u.id === cut.tgtId);
  if (!src || !tgt) return null;
  /* player on the left. When both are the same team (a heal) the caster
     takes the left. */
  const flip = src.team !== "player" && tgt.team === "player";
  const left = flip ? tgt : src, right = flip ? src : tgt;
  const f = cut.f;
  const statFor = (u) => {
    if (!f) return null;
    if (u.id === src.id) return f.a;
    return f.counters ? f.d : null;
  };
  const triFor = (u) => (!f ? 0 : u.id === src.id ? f.a.tri : -f.a.tri);
  const heal = cut.kind === "heal" ? cut.amount : 0;
  return (
    <div className={"bhud" + (from ? " morph" : "") + (cut.closing ? " closing" : "")}>
      <div ref={frameRef} className="bhud-frame" />
      <div className="bhud-body">
        <div className="grid items-center" style={{ gridTemplateColumns: "1fr auto 1fr", columnGap: 6 }}>
          <Side u={left} tri={triFor(left)} />
          <div style={{ ...SMALL, lineHeight: "17px", paddingLeft: "0.14em" }}>HP</div>
          <Side u={right} tri={triFor(right)} right />
        </div>
        <div className="flex items-center justify-between" style={{ gap: 8, marginTop: 6 }}>
          <Face u={left}><Gauge u={left} /></Face>
          <Numbers l={statFor(left)} r={statFor(right)} heal={heal} style={{ flex: "0 1 170px", minWidth: 0 }} />
          <Face u={right}><Gauge u={right} right /></Face>
        </div>
      </div>
    </div>
  );
}
