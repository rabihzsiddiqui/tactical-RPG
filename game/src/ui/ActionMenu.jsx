import { wep } from "../core/combat.js";
import { C } from "./theme.js";
import { Item } from "./primitives.jsx";

export default function ActionMenu({ menuRef, sel, selUnit, api }) {
  return (
    <div ref={menuRef} className="absolute"
      style={{
        display: sel && sel.mode === "action" ? "block" : "none",
        width: 108, zIndex: 20, background: C.parch,
        border: "2px solid " + C.ink, boxShadow: "3px 3px 0 rgba(0,0,0,0.45)",
      }}>
      {selUnit && (wep(selUnit).staff ? (
        <Item label="Heal" disabled={!sel.targets?.length} on={api.chooseHeal} />
      ) : (
        <Item label="Attack" disabled={!sel.targets?.length} on={api.chooseAttack} />
      ))}
      <Item label="Vulnerary"
        disabled={!selUnit || selUnit.vulnerary <= 0 || selUnit.hp >= selUnit.maxHp}
        on={api.vulnerary} />
      <Item label="Wait" on={api.wait} />
      <Item label="Back" muted on={api.back} />
    </div>
  );
}
