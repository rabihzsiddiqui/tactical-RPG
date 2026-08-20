/* small shared ui fragments, used across App and the panel components */

import { C, MONO } from "./theme.js";

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
      fontFamily: MONO, fontSize: 11, letterSpacing: "0.08em", padding: "7px 13px",
      cursor: disabled ? "default" : "pointer",
      background: active ? C.gold : light && strong ? C.ink : strong ? C.gold : "transparent",
      color: active || (strong && !light) ? C.ink : light && strong ? C.parch : light ? C.ink : C.parch,
      border: "2px solid " + (light ? C.ink : C.rule),
      opacity: disabled ? 0.4 : 1,
    }}>{children}</button>
  );
}

export function Item({ label, on, disabled, muted }) {
  return (
    <button onClick={disabled ? undefined : on} disabled={disabled} style={{
      display: "block", width: "100%", textAlign: "left", fontFamily: MONO, fontSize: 12,
      padding: "7px 10px", background: "transparent",
      color: disabled ? "#a99e88" : muted ? C.inkSoft : C.ink,
      border: "none", borderBottom: "1px solid " + C.rule,
      cursor: disabled ? "default" : "pointer",
    }}>{label}</button>
  );
}
