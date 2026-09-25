/* the action menu: what a unit does once it has moved. It opens beside
   the unit (scene.js places it every frame) and speaks in the map menus'
   voice: the dark panel with the gold rule inside a darker edge, commands
   in carved capitals, and the pause menu's gold bar on the row under the
   pointer or keyboard focus (PauseMenu.jsx). A staff user gets Heal in
   place of Attack; a row with nothing to act on dims. */

import { wep } from "../core/combat.js";
import { C, DISPLAY, rgba } from "./theme.js";

const ROW_H = 40;    // px per command, a thumb's height
const IN_MS = 120;   // the fade and nudge in
const NUDGE = 4;     // px it travels in from the unit's side

/* added to App.jsx's style block. It shows by display, which restarts the
   animation each time it opens. The bar is .pm-bar's look, drawn on the
   row itself rather than sliding between rows. */
export const ACTION_MENU_CSS = `
  .amenu { position: absolute; z-index: 20; box-sizing: border-box; min-width: 128px; padding: 7px;
    background: ${rgba(C.table, 0.88)}; border: 1px solid rgba(0,0,0,0.7);
    outline: 1px solid ${rgba(C.gold, 0.7)}; outline-offset: -4px;
    animation: amenuIn ${IN_MS}ms ease-out; }
  @keyframes amenuIn { from { opacity: 0; transform: translateX(-${NUDGE}px); } }
  .amenu-row { display: flex; align-items: center; width: 100%; min-height: ${ROW_H}px;
    padding: 0 calc(12px - 0.14em) 0 11px; background: transparent; border: none;
    border-left: 3px solid transparent; outline: none; text-align: left; white-space: nowrap; cursor: pointer;
    font-family: ${DISPLAY}; font-weight: 600; font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase;
    color: ${C.parchDim}; touch-action: manipulation; -webkit-tap-highlight-color: transparent; user-select: none; }
  .amenu-row.muted { color: ${C.rule}; }
  .amenu-row:not(:disabled):hover, .amenu-row:focus-visible { color: ${C.parch}; border-left-color: ${C.gold};
    background: linear-gradient(to right, ${rgba(C.gold, 0.24)}, ${rgba(C.gold, 0.05)} 75%, ${rgba(C.gold, 0)}); }
  .amenu-row:disabled { opacity: 0.35; cursor: default; }
  @media (prefers-reduced-motion: reduce) {
    @keyframes amenuIn { from { opacity: 0; } }
  }
`;

function Row({ label, on, disabled, muted }) {
  return (
    <button className={"amenu-row" + (muted ? " muted" : "")} onClick={disabled ? undefined : on} disabled={disabled}>
      {label}
    </button>
  );
}

export default function ActionMenu({ menuRef, sel, selUnit, api }) {
  return (
    <div ref={menuRef} className="amenu" role="group" aria-label="Actions"
      style={{ display: sel && sel.mode === "action" ? "block" : "none" }}>
      {selUnit && (wep(selUnit).staff ? (
        <Row label="Heal" disabled={!sel.targets?.length} on={api.chooseHeal} />
      ) : (
        <Row label="Attack" disabled={!sel.targets?.length} on={api.chooseAttack} />
      ))}
      <Row label="Vulnerary"
        disabled={!selUnit || selUnit.vulnerary <= 0 || selUnit.hp >= selUnit.maxHp}
        on={api.vulnerary} />
      <Row label="Wait" on={api.wait} />
      <Row label="Back" muted on={api.back} />
    </div>
  );
}
