/* small shared ui fragments, used across App and the panel components */

import { C, MONO, DISPLAY, rgba } from "./theme.js";

export function Card({ children }) {
  return (
    <div style={{
      background: C.parch, color: C.ink, border: "2px solid " + C.ink,
      boxShadow: "3px 3px 0 rgba(0,0,0,0.4)", padding: "10px 12px",
    }}>{children}</div>
  );
}

export function Eyebrow({ children }) {
  return (
    <div className="uppercase" style={{
      fontFamily: MONO, fontSize: 9, letterSpacing: "0.22em", color: C.inkSoft,
      borderBottom: "1px solid " + C.rule, paddingBottom: 4, marginBottom: 6,
    }}>{children}</div>
  );
}

export function Pill({ k, v, tone }) {
  return (
    <div style={{ border: "1px solid " + C.rule, padding: "3px 8px", color: tone || C.parch }}>
      <span style={{ color: C.rule, letterSpacing: "0.14em", fontSize: 9 }}>{k.toUpperCase()} </span>{v}
    </div>
  );
}

export function Btn({ children, on, disabled, active, strong, light }) {
  return (
    <button onClick={on} disabled={disabled} style={{
      fontFamily: MONO, fontSize: 11, letterSpacing: "0.08em", padding: "10px 14px",
      minHeight: 40, cursor: disabled ? "default" : "pointer",
      background: active ? C.gold : light && strong ? C.ink : strong ? C.gold : "transparent",
      color: active || (strong && !light) ? C.ink : light && strong ? C.parch : light ? C.ink : C.parch,
      border: "2px solid " + (light ? C.ink : C.rule),
      opacity: disabled ? 0.4 : 1,
      touchAction: "manipulation", WebkitTapHighlightColor: "transparent", userSelect: "none",
    }}>{children}</button>
  );
}

/* a button in the map's own dress, the Menu button's (PauseMenu.jsx): a
   dark panel with the gold rule inside a darker edge and the label in
   carved capitals. The row under the map and the forecast use it.
   `strong` tints it gold for the button to press, and `active` does the
   same for a toggle that is on. RULE_BTN_CSS goes into App's style block. */
export const RULE_BTN_CSS = `
  .rbtn { min-height: 44px; padding: 0 calc(14px - 0.18em) 0 14px;
    background: ${rgba(C.table, 0.82)}; border: 1px solid rgba(0,0,0,0.7);
    outline: 1px solid ${rgba(C.gold, 0.7)}; outline-offset: -4px;
    font-family: ${DISPLAY}; font-weight: 600; font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase;
    color: ${C.parch}; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent;
    user-select: none; }
  .rbtn:hover, .rbtn:focus-visible { outline-color: ${C.gold}; }
  .rbtn.strong, .rbtn[aria-pressed="true"] { background: ${rgba(C.gold, 0.22)}; }
`;

export function RuleBtn({ children, on, strong, active, ...rest }) {
  return (
    <button className={"rbtn" + (strong ? " strong" : "")} onClick={on} aria-pressed={active} {...rest}>
      {children}
    </button>
  );
}

/* a labelled 0-to-1 slider, used for the volume rows in the pause menu.
   `on` fires on every drag step, since the whole point is hearing the level
   change as you move it. The percentage readout is there because the track
   alone gives no sense of where you are once the sound stops. Set for the
   menu's dark panels; thumb and track styling lives in index.css under
   .vol, out of reach of inline styles. Extra props land on the input. */
export function Slider({ label, value, on, onGrab, ...rest }) {
  return (
    <label style={{ display: "block" }}>
      <div className="flex items-center justify-between" style={{
        fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: C.rule,
      }}>
        <span className="uppercase">{label}</span>
        <span style={{ color: C.parch }}>{Math.round(value * 100)}%</span>
      </div>
      {/* onGrab fires once when the drag starts, not on every step. The
          sample runs about half a second, so a tick per pointer move would
          stack dozens of overlapping copies. Keyboard users get the same
          single cue from left and right. Up and down move the menu's
          highlight instead, so they change nothing here and stay silent. */}
      <input className="vol" type="range" min={0} max={1} step={0.01} value={value}
        aria-label={label}
        {...rest}
        onPointerDown={onGrab}
        onKeyDown={(e) => {
          if (onGrab && !e.repeat && (e.key === "ArrowLeft" || e.key === "ArrowRight")) onGrab();
        }}
        onChange={(e) => on(Number(e.target.value))} />
    </label>
  );
}

export function Item({ label, on, disabled, muted }) {
  return (
    <button onClick={disabled ? undefined : on} disabled={disabled} style={{
      display: "block", width: "100%", textAlign: "left", fontFamily: MONO, fontSize: 12,
      padding: "11px 10px", minHeight: 40, background: "transparent",
      color: disabled ? "#a99e88" : muted ? C.inkSoft : C.ink,
      border: "none", borderBottom: "1px solid " + C.rule,
      cursor: disabled ? "default" : "pointer",
      touchAction: "manipulation", WebkitTapHighlightColor: "transparent", userSelect: "none",
    }}>{label}</button>
  );
}
