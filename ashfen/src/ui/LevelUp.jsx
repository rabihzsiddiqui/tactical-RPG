/* the level-up card: it comes up over the map when a unit gains a level,
   for as long as scene.js holds the levelUp event (1.7s), and dims the
   board behind it. In the map panels' dress (UnitHud.jsx, Forecast.jsx):
   the dark panel with the gold rule, the face and name in carved
   capitals, and every stat at its new value. The ones that grew carry a
   gold +1, which come in one after another the way the genre counts a
   level up; the rest are dimmed. */

import { C, SERIF, DISPLAY, rgba } from "./theme.js";
import { Face, Rule } from "./UnitHud.jsx";

const IN_MS = 200;     // the card's pop in
const TICK_MS = 90;    // between one gain's +1 and the next
const WIDTH = 252;     // px; four stats across under a face and a name

/* label, the unit's field, and the key levelUp in core/combat.js files
   its gain under */
const STATS = [["HP", "maxHp", "HP"], ["Str", "str", "STR"], ["Mag", "mag", "MAG"], ["Skl", "skl", "SKL"],
  ["Spd", "spd", "SPD"], ["Lck", "lck", "LCK"], ["Def", "def", "DEF"], ["Res", "res", "RES"]];

const SMALL = { fontFamily: SERIF, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: C.rule };

/* added to App.jsx's style block. Under reduced motion the card and its
   gains simply appear. */
export const LEVEL_UP_CSS = `
  .lvup-dim { position: absolute; inset: 0; z-index: 30; display: flex; align-items: center; justify-content: center;
    background: rgba(10,12,18,0.5); pointer-events: none; animation: scrimIn ${IN_MS}ms ease-out; }
  .lvup { box-sizing: border-box; width: ${WIDTH}px; max-width: calc(100% - 16px); padding: 12px 13px 12px 12px;
    background: ${rgba(C.table, 0.92)}; border: 1px solid rgba(0,0,0,0.7);
    outline: 1px solid ${rgba(C.gold, 0.7)}; outline-offset: -4px;
    animation: lvupIn ${IN_MS}ms cubic-bezier(.22,.85,.32,1); }
  @keyframes lvupIn { from { opacity: 0; transform: scale(0.94); } }
  .lvup-gain { display: inline-block; color: ${C.gold}; animation: lvupGain 160ms ease-out both; }
  @keyframes lvupGain { from { opacity: 0; transform: translateY(3px); } }
  @media (prefers-reduced-motion: reduce) {
    .lvup-dim, .lvup, .lvup-gain { animation: none; }
  }
`;

/* `lv` is scene.js's g.levelUp, { id, name, lvl, gains }, or null */
export default function LevelUp({ lv, units }) {
  if (!lv) return null;
  const u = units.find((z) => z.id === lv.id);
  if (!u) return null;
  let order = 0;
  const grew = Object.keys(lv.gains).length > 0;
  return (
    <div className="lvup-dim">
      <div className="lvup" role="status" aria-label={`${u.name} reached level ${lv.lvl}`}>
        <div className="flex items-center" style={{ gap: 10 }}>
          <Face u={u} />
          <div className="min-w-0">
            <div style={{
              fontFamily: DISPLAY, fontWeight: 600, fontSize: 11, lineHeight: "14px", letterSpacing: "0.22em",
              textTransform: "uppercase", color: C.gold,
            }}>Level up</div>
            <div className="truncate" style={{
              fontFamily: DISPLAY, fontWeight: 600, fontSize: 17, lineHeight: "22px", letterSpacing: "0.14em",
              textTransform: "uppercase", color: C.parch,
            }}>{u.name}</div>
            <div style={{ fontFamily: SERIF, fontSize: 13, color: C.parchDim }}>
              Lv {lv.lvl - 1} <span style={{ color: C.rule }}>&rarr;</span> <span style={{ color: C.parch }}>{lv.lvl}</span>
            </div>
          </div>
        </div>

        <Rule />
        <div className="grid grid-cols-4" style={{ rowGap: 6 }}>
          {STATS.map(([k, field, key]) => {
            const gain = lv.gains[key];
            const delay = gain ? order++ * TICK_MS + IN_MS : 0;
            return (
              <div key={k} style={{ opacity: gain || !grew ? 1 : 0.45 }}>
                <div style={{ ...SMALL, lineHeight: "12px" }}>{k}</div>
                <div style={{ fontFamily: SERIF, fontSize: 15, lineHeight: "19px", color: C.parch }}>
                  {u[field]}
                  {gain ? <span className="lvup-gain" style={{ fontSize: 12, marginLeft: 2, animationDelay: delay + "ms" }}>+{gain}</span> : null}
                </div>
              </div>
            );
          })}
        </div>
        {!grew && (
          <div style={{ fontFamily: SERIF, fontSize: 12, color: C.parchDim, marginTop: 8 }}>No growth this level.</div>
        )}
      </div>
    </div>
  );
}
