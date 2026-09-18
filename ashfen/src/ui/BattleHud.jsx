/* the battle HUD: a Fire Emblem style panel shown along the bottom of the
   viewport while the camera is in on an exchange. It replaces the world
   health bars for the duration (animUnit hides them, see scene.js) and
   shows both sides' forecast next to a live HP bar.

   The numbers come from `cut.f`, the forecast scene.js took the moment the
   cut-in began, so they do not move while strikes land. The HP comes from
   the live unit: each strike writes hpAfter to the target at the frame of
   contact and ticks, so the bar drains in step with the hit. The player's
   unit always sits on the left, whichever side is attacking, so blue is
   left and red is right every time the panel appears. */

import { wep } from "../core/combat.js";
import { C, MONO, SERIF } from "./theme.js";

const LABEL = { fontFamily: MONO, fontSize: 9, letterSpacing: "0.14em", color: C.inkSoft };

function Stat({ k, v }) {
  return (
    <div style={{ minWidth: 26, textAlign: "center" }}>
      <div className="uppercase" style={LABEL}>{k}</div>
      <div style={{ fontFamily: MONO, fontSize: 13, color: C.ink, lineHeight: "16px" }}>{v}</div>
    </div>
  );
}

/* the stat row under one side. `s` is that side's strikeCalc, or null when
   the side never swings. `heal` puts the amount where the damage would go;
   `quiet` leaves the row empty but the same height, for the target of a
   heal, who has nothing to say. */
function Stats({ s, heal, quiet, right }) {
  const cls = "flex gap-2 mt-1 " + (right ? "justify-end" : "justify-start");
  const note = (text) => (
    <div className={cls} style={{ ...LABEL, lineHeight: "16px", paddingTop: 12, minHeight: 28 }}>{text}</div>
  );
  if (heal) return <div className={cls}><Stat k="heal" v={"+" + heal} /></div>;
  if (quiet) return note("");
  if (!s) return note("no counter");
  return (
    <div className={cls}>
      <Stat k="dmg" v={s.dmg} />
      <Stat k="hit" v={s.acc} />
      <Stat k="crit" v={s.crit} />
      <Stat k="hits" v={s.doubles ? "x2" : "x1"} />
    </div>
  );
}

function Side({ u, s, heal, quiet, right }) {
  const pct = Math.round(Math.max(0, u.hp) / u.maxHp * 100);
  const tone = u.team === "player" ? C.blue : C.red;
  return (
    <div className="flex-1 min-w-0" style={{ textAlign: right ? "right" : "left" }}>
      <div className="truncate" style={{ fontFamily: SERIF, fontSize: 15, lineHeight: "18px" }}>{u.name}</div>
      <div className="truncate uppercase" style={LABEL}>
        {right ? wep(u).name + " · " + u.cls : u.cls + " · " + wep(u).name}
      </div>
      <div className="flex items-center gap-2 mt-1" style={{ flexDirection: right ? "row-reverse" : "row" }}>
        <div style={{ flex: 1, height: 7, background: C.parchDim, border: "1px solid " + C.rule }}>
          {/* the fill hangs off the side its own unit is on, so both bars
              drain toward the middle of the panel */}
          <div className="bhud-fill" style={{
            width: pct + "%", height: "100%", background: tone,
            marginLeft: right ? "auto" : 0,
          }} />
        </div>
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.ink, minWidth: 42, textAlign: right ? "left" : "right" }}>
          {Math.max(0, u.hp)}/{u.maxHp}
        </div>
      </div>
      <Stats s={s} heal={heal} quiet={quiet} right={right} />
    </div>
  );
}

export default function BattleHud({ cut, units }) {
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
    if (u === src) return f.a;
    return f.counters ? f.d : null;
  };
  const healFor = (u) => (cut.kind === "heal" && u === src ? cut.amount : 0);
  const quietFor = (u) => cut.kind === "heal" && u === tgt;
  return (
    <div className={"bhud" + (cut.closing ? " closing" : "")} style={{
      background: C.parch, color: C.ink, border: "2px solid " + C.ink,
      boxShadow: "3px 3px 0 rgba(0,0,0,0.4)", padding: "8px 12px 9px",
      width: "min(100% - 16px, 520px)", pointerEvents: "none",
    }}>
      <div className="flex items-start gap-3">
        <Side u={left} s={statFor(left)} heal={healFor(left)} quiet={quietFor(left)} />
        <div style={{ width: 1, alignSelf: "stretch", background: C.rule, margin: "2px 0" }} />
        <Side u={right} s={statFor(right)} heal={healFor(right)} quiet={quietFor(right)} right />
      </div>
    </div>
  );
}
