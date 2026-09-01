import { wep, triBonus } from "../core/combat.js";
import { C, MONO, SERIF } from "./theme.js";
import { Card, Eyebrow, Btn } from "./primitives.jsx";

function triLine(a, d) {
  const wa = wep(a), wd = wep(d);
  const t = triBonus(wa.type, wd && !wd.staff ? wd.type : null);
  const note = wa.magic ? " / strikes Res" : "";
  if (t > 0) return wa.name + " has the advantage over " + wd.name + note;
  if (t < 0) return wa.name + " is at a disadvantage against " + wd.name + note;
  return "No triangle bonus" + note;
}

/* name/weapon/HP gets its own row, separate from the stat grid below. Kept
   apart on purpose: this text wraps to a different number of lines on
   each side depending on name/weapon length (e.g. "Iron Axe · HP 26/26"
   vs "Iron Sword · HP 21/21"), and it used to sit directly above each
   side's DMG/HIT/CRIT/HITS numbers, so whichever side wrapped further
   pushed its numbers down out of line with the center labels and the
   other side's numbers. Splitting it into its own row means nothing
   above the stat grid can vary its height. */
function Header({ u, right }) {
  return (
    <div className={"flex-1 " + (right ? "text-right" : "text-left")}>
      <div style={{ fontFamily: SERIF, fontSize: 14 }}>{u.name}</div>
      <div style={{ fontSize: 10, color: C.inkSoft }}>
        {wep(u).name} &middot; HP {u.hp}/{u.maxHp}
      </div>
    </div>
  );
}

function StatCol({ s, right }) {
  return (
    <div className={"flex-1 flex flex-col " + (right ? "items-end" : "items-start")}>
      {[s ? s.dmg : "--", s ? s.acc : "--", s ? s.crit : "--", s ? (s.doubles ? "x2" : "x1") : "--"].map((v, i) => (
        <div key={i} style={{ height: 22, lineHeight: "22px", fontSize: 15, color: C.ink }}>{v}</div>
      ))}
    </div>
  );
}

export default function Forecast({ fc, onAttack, onCancel }) {
  return (
    <Card>
      <Eyebrow>Battle forecast</Eyebrow>

      <div className="flex items-start gap-2" style={{ fontFamily: MONO, fontSize: 12 }}>
        <Header u={fc.a} />
        <Header u={fc.d} right />
      </div>

      <div className="flex items-stretch mt-1" style={{ fontFamily: MONO, fontSize: 12 }}>
        <StatCol s={fc.f.a} />
        <div className="flex flex-col items-center px-2"
          style={{ borderLeft: "1px solid " + C.rule, borderRight: "1px solid " + C.rule, color: C.inkSoft }}>
          {["dmg", "hit", "crit", "hits"].map((l) => (
            <div key={l} className="uppercase"
              style={{ height: 22, lineHeight: "22px", fontSize: 10, letterSpacing: "0.12em" }}>{l}</div>
          ))}
        </div>
        <StatCol s={fc.f.counters ? fc.f.d : null} right />
      </div>

      <div style={{ fontFamily: MONO, fontSize: 10, color: C.inkSoft, marginTop: 6 }}>
        {triLine(fc.a, fc.d)}
      </div>
      <div className="flex gap-2 mt-2">
        <Btn light strong on={() => onAttack(fc.d.id)}>Attack</Btn>
        <Btn light on={onCancel}>Back</Btn>
      </div>
    </Card>
  );
}
