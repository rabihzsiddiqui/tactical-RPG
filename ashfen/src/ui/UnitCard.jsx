import { cell } from "../core/map.js";
import { wep, wepBonus } from "../core/combat.js";
import { C, MONO } from "./theme.js";
import { Card } from "./primitives.jsx";

export default function UnitCard({ u }) {
  const w = wep(u);
  const t = cell(u.x, u.y);
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <div>
          <div style={{ fontSize: 19 }}>{u.name}</div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.inkSoft, letterSpacing: "0.1em" }}>
            {u.cls.toUpperCase()} &middot; LV {u.lvl} &middot; {u.team === "player" ? "ALLY" : "FOE"}
          </div>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 15, color: C.ink }}>{u.hp}/{u.maxHp}</div>
      </div>
      <div style={{ height: 6, background: C.parchDim, marginTop: 6, border: "1px solid " + C.rule }}>
        <div style={{
          width: Math.round((u.hp / u.maxHp) * 100) + "%", height: "100%",
          background: u.team === "player" ? C.blue : C.red,
        }} />
      </div>
      <div className="grid grid-cols-4 gap-x-2 gap-y-1 mt-3"
        style={{ fontFamily: MONO, fontSize: 11, color: C.ink }}>
        {[["STR", "str"], ["MAG", "mag"], ["SKL", "skl"], ["SPD", "spd"],
          ["LCK", "lck"], ["DEF", "def"], ["RES", "res"]].map(([k, s]) => (
          <div key={k}>
            <span style={{ color: C.inkSoft, fontSize: 9, letterSpacing: "0.1em" }}>{k} </span>
            <span>{u[s]}</span>
            {wepBonus(u, s) ? <span style={{ color: C.green }}>+{wepBonus(u, s)}</span> : null}
          </div>
        ))}
        <div>
          <span style={{ color: C.inkSoft, fontSize: 9, letterSpacing: "0.1em" }}>MOV </span>
          <span>{u.mov}</span>
        </div>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: C.inkSoft, marginTop: 8, lineHeight: 1.7 }}>
        <div style={{ color: w.personal ? C.ink : C.inkSoft }}>
          {w.name}{w.personal ? " (personal)" : ""} &middot; Mt {w.mt} &middot; Hit {w.hit} &middot; Crit {w.crit}
          &middot; Rng {w.rmin === w.rmax ? w.rmin : w.rmin + "-" + w.rmax}
        </div>
        <div>On {t.name}: +{t.def} Def, +{t.avo} Avoid{t.heal ? ", heals each turn" : ""}</div>
        {u.team === "player" && <div>EXP {u.exp}/100 &middot; Vulneraries {u.vulnerary}</div>}
      </div>
    </Card>
  );
}
