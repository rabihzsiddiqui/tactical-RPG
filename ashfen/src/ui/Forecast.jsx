/* the battle forecast. When the player picks a target it opens over that
   enemy, so Attack is a short reach from the tap that picked it: scene.js
   places it every frame, above the pair when it fits and below them when
   it does not. It speaks in the unit panel's voice (UnitHud.jsx): the dark
   panel with the gold rule inside a darker edge, names in carved capitals,
   everything else in SERIF. App.jsx hides the unit panel while it is up,
   since this shows both faces anyway.

   The two faces meet across the numbers, the attacker's on the left
   looking right and the defender's on the right looking left (portrait.js
   turns them by team, and only the player ever sees a forecast). Each
   side's damage, hit, crit and number of attacks sit either side of one
   column of labels, with dashes for a side that cannot strike back. The
   weapon triangle is an arrow after each weapon: up for the side it
   favours, down for the other.

   Each health bar pulses over the part the exchange could take from it:
   the other side's damage times its attacks, crits aside, so a bar that
   pulses to its end is a unit that could fall. A staff user's heal gets
   the same panel, with the amount it restores in place of the numbers
   and the target's bar pulsing green over what it would fill, and Heal
   in place of Attack.

   Attack or Heal turns it into the battle HUD: it hands its box to morph.js and
   drops out at once, and the HUD grows its frame out of that box
   (BattleHud.jsx), which shares Numbers and Tri from here. Back, or an
   Attack with the cut-in off, fades it out on the last pair it showed,
   like the unit panel. */

import { Fragment, useState } from "react";
import { wep } from "../core/combat.js";
import { C, SERIF, DISPLAY, rgba } from "./theme.js";
import WeaponIcon from "./WeaponIcon.jsx";
import { RuleBtn } from "./primitives.jsx";
import { MENU_CLEAR, FACE, FADE_MS, Face, Rule } from "./UnitHud.jsx";
import { handOff } from "./morph.js";

const WIDTH = 256;     // px; two faces with the numbers between, and "Mercenary" in capitals over one side
const ROW = FACE / 4;  // px per stat row, so the four rows stand exactly as tall as a face
const RISE = 6;        // px it rises as it fades in, and sinks as it fades out
const AFTER_H = 12;     // px, the row under a forecast bar that holds the HP the pulse ends on
const PULSE_MS = 650;  // one swing of the at-risk and to-be-healed parts of a bar, dim to bright or back
const LABELS = ["Dmg", "Hit", "Crit", "Atks"]; // four letters at most: a 360px phone leaves the middle column about 27px

/* the unit panel's small label */
const SMALL = { fontFamily: SERIF, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: C.rule };

/* added to App.jsx's style block next to the unit panel's. The unit
   panel's fade timing, and no fill mode on the way in for the same
   reason. scene.js writes left and top; the width leaves the 8px it keeps
   from the left edge and the Menu button's column on the right. `gone`
   is the hand-off to the HUD: out at once, no fade. The buttons are
   RuleBtn, the Menu button's dress. */
export const FORECAST_CSS = `
  .fcast { position: absolute; top: 0; left: 0; z-index: 22; box-sizing: border-box;
    width: ${WIDTH}px; max-width: calc(100% - ${8 + MENU_CLEAR}px); padding: 10px;
    background: ${rgba(C.table, 0.88)}; border: 1px solid rgba(0,0,0,0.7);
    outline: 1px solid ${rgba(C.gold, 0.7)}; outline-offset: -4px; user-select: none;
    animation: fcastIn ${FADE_MS}ms ease-out;
    transition: opacity ${FADE_MS}ms ease-out, transform ${FADE_MS}ms ease-out; }
  .fcast.off { opacity: 0; transform: translateY(${RISE}px); visibility: hidden; pointer-events: none;
    transition: opacity ${FADE_MS}ms ease-in, transform ${FADE_MS}ms ease-in, visibility 0s linear ${FADE_MS}ms; }
  .fcast.gone { transition: none; }
  @keyframes fcastIn { from { opacity: 0; transform: translateY(${RISE}px); } }
  @keyframes fcastFade { from { opacity: 0; } }
  .fcast .rbtn { flex: 1 1 0; }
  .hp-risk, .hp-mend { animation: hpPulse ${PULSE_MS}ms ease-in-out infinite alternate; }
  @keyframes hpPulse { from { opacity: 1; } to { opacity: 0.2; } }
  @media (prefers-reduced-motion: reduce) {
    .fcast { animation-name: fcastFade; }
    .fcast, .fcast.off { transform: none; }
    .hp-risk, .hp-mend { animation: none; opacity: 0.5; }
  }
`;

/* the weapon triangle for one side: +1, -1 or 0 */
export function Tri({ t }) {
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
          fontFamily: SERIF, fontSize: 10, lineHeight: "12px", letterSpacing: "0.08em", textTransform: "uppercase",
          color: C.parchDim,
        }}>{w.name}</span>
        <Tri t={tri} />
      </div>
    </div>
  );
}

const vals = (s) => [s.dmg, s.acc, s.crit, s.doubles ? "x2" : "x1"];

/* both sides' numbers either side of one column of labels. `l` and `r`
   are strikeCalc results, or null for a side that does not swing, which
   shows dashes. `heal` swaps the lot for one row, the amount on the left.
   `style` joins the grid's own, for the HUD to set its width. */
export function Numbers({ l, r, heal, style }) {
  const rows = heal
    ? [["Heal", "+" + heal, ""]]
    : LABELS.map((k, i) => [k, l ? vals(l)[i] : null, r ? vals(r)[i] : null]);
  const cell = (v, right) => (
    <div style={{
      fontFamily: SERIF, fontSize: 13, lineHeight: ROW + "px", textAlign: right ? "right" : "left",
      color: v == null ? C.rule : C.parch,
    }}>{v ?? "--"}</div>
  );
  return (
    <div className="grid" style={{ gridTemplateColumns: "1fr auto 1fr", columnGap: 6, ...style }}>
      {rows.map(([k, a, b]) => (
        <Fragment key={k}>
          {cell(a)}
          <div style={{ ...SMALL, lineHeight: ROW + "px", textAlign: "center", paddingLeft: "0.14em" }}>{k}</div>
          {cell(b, true)}
        </Fragment>
      ))}
    </div>
  );
}

/* one side's health, the bar in a bordered track draining toward the middle
   of the panel, so how much is left reads against the whole. Shared with
   the battle HUD, where `drain` lets the fill slide as each strike lands.
   The forecast adds `loss`, HP the action could take, which pulses at the
   fill's inner end, or `gain`, HP a heal would restore, which pulses green
   past it; both stop at the bar's ends. The HUD, mid-exchange, passes
   neither. When either is passed, a row under the bar holds the HP the
   pulse ends on, under that point: what is left if every swing lands, or
   what the heal brings it to. Its own copy of the HP count, hidden, keeps
   that row exactly as wide as the bar above it, so the number lands under
   the right spot on both sides. */
export function Hp({ u, right, drain, loss, gain }) {
  const hp = Math.max(0, u.hp);
  const lost = Math.min(hp, loss || 0), gained = Math.min(u.maxHp - hp, gain || 0);
  const after = lost > 0 ? hp - lost : gained > 0 ? hp + gained : null;
  const pct = (n) => (n / u.maxHp) * 100 + "%";
  const color = u.team === "player" ? C.blueLite : C.redLite;
  const kept = <div key="kept" className={drain ? "bhud-fill" : undefined} style={{ width: pct(hp - lost), background: color }} />;
  const pulse = lost > 0 ? <div key="pulse" className="hp-risk" style={{ width: pct(lost), background: color }} />
    : gained > 0 ? <div key="pulse" className="hp-mend" style={{ width: pct(gained), background: C.mend }} />
      : null;
  const row = { flexDirection: right ? "row-reverse" : "row" };
  const count = { fontFamily: SERIF, fontSize: 11, lineHeight: "14px", color: C.parch };
  /* centred under its point, but held inside the bar near either end */
  const frac = after == null ? 0 : after / u.maxHp;
  const shift = frac < 0.12 ? 0 : frac > 0.88 ? 100 : 50;
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 min-w-0" style={row}>
        <div className="flex-1 flex" style={{
          height: 6, background: C.table, border: "1px solid " + rgba(C.rule, 0.55),
          justifyContent: right ? "flex-end" : "flex-start",
        }}>
          {/* the pulsing part always sits on the side toward the middle */}
          {right ? [pulse, kept] : [kept, pulse]}
        </div>
        <span style={count}>{hp}/{u.maxHp}</span>
      </div>
      {(loss != null || gain != null) && (
        <div className="flex gap-1.5 min-w-0" style={{ ...row, height: AFTER_H, marginTop: 2 }}>
          <div className="flex-1" style={{ position: "relative" }}>
            {after != null && (
              <span aria-label={lost > 0 ? "at worst " + after : "healed to " + after} style={{
                position: "absolute", top: 0, [right ? "right" : "left"]: pct(after),
                transform: `translateX(${right ? shift : -shift}%)`,
                fontFamily: SERIF, fontSize: 10, lineHeight: AFTER_H + "px",
                color: lost > 0 ? color : C.mend,
              }}>{after}</span>
            )}
          </div>
          <span aria-hidden="true" style={{ ...count, lineHeight: AFTER_H + "px", visibility: "hidden" }}>{hp}/{u.maxHp}</span>
        </div>
      )}
    </div>
  );
}

/* HP a strikeCalc side could take over the exchange if every swing
   landed, crits aside; 0 for a side that does not swing */
const reach = (s) => (s ? s.dmg * (s.doubles ? 2 : 1) : 0);

/* `fc` is { a, d, f }: attacker, defender and forecastOf(a, d), or for a
   heal { a, d, heal }: healer, target and the amount; null to go.
   `boxRef` is the ref scene.js places. `into` is true while a cut-in is
   up, which is how a null `fc` after Attack or Heal knows the HUD has
   taken over and it should drop out rather than fade. */
export default function Forecast({ fc, boxRef, into, onAttack, onHeal, onCancel }) {
  /* the last pair shown, kept so the fade out has faces to fade. Units
     are stable objects, so a new pair is a new attacker or defender. */
  const [last, setLast] = useState(fc);
  if (fc && (!last || fc.a !== last.a || fc.d !== last.d)) setLast(fc);
  const shown = fc || last;
  if (!shown) return null;

  const { a, d, f, heal } = shown;
  const healing = heal != null;
  const tri = healing ? 0 : f.a.tri;
  return (
    <div ref={boxRef} className={"fcast" + (fc ? "" : into ? " off gone" : " off")} role="group"
      aria-label={healing ? "Heal forecast" : "Battle forecast"} aria-hidden={fc ? undefined : true}>
      <div className="flex" style={{ gap: 10 }}>
        <Head u={a} tri={tri} />
        <Head u={d} tri={-tri} right />
      </div>

      <div className="flex items-center" style={{ gap: 8, marginTop: 7 }}>
        <Face u={a} />
        {healing
          ? <Numbers heal={heal} style={{ flex: "1 1 0", minWidth: 0 }} />
          : <Numbers l={f.a} r={f.counters ? f.d : null} style={{ flex: "1 1 0", minWidth: 0 }} />}
        <Face u={d} />
      </div>

      {/* top-aligned, so the HP label sits level with the bars and not
          halfway down to the numbers under them */}
      <div className="grid items-start" style={{ gridTemplateColumns: "1fr auto 1fr", columnGap: 6, marginTop: 7 }}>
        <Hp u={a} loss={healing ? 0 : reach(f.counters ? f.d : null)} />
        <div style={{ ...SMALL, lineHeight: "14px", paddingLeft: "0.14em" }}>HP</div>
        <Hp u={d} right loss={healing ? 0 : reach(f.a)} gain={healing ? heal : 0} />
      </div>

      <Rule />
      <div className="flex" style={{ gap: 8 }}>
        <RuleBtn strong tabIndex={fc ? 0 : -1} on={() => {
          if (boxRef.current) handOff(boxRef.current.getBoundingClientRect());
          if (healing) onHeal(d.id); else onAttack(d.id);
        }}>{healing ? "Heal" : "Attack"}</RuleBtn>
        <RuleBtn tabIndex={fc ? 0 : -1} on={onCancel}>Back</RuleBtn>
      </div>
    </div>
  );
}
