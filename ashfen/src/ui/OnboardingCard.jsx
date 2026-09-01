import { LEVEL_NAME } from "../core/map.js";
import { C, MONO } from "./theme.js";
import { Btn } from "./primitives.jsx";

export default function OnboardingCard({ onDismiss, onFullGuide }) {
  return (
    <div className="absolute flex items-center justify-center"
      style={{ inset: 0, zIndex: 40, background: "rgba(10,12,18,0.78)" }}>
      <div style={{
        background: C.parch, color: C.ink, border: "2px solid " + C.ink,
        boxShadow: "4px 4px 0 rgba(0,0,0,0.5)", padding: "16px 18px",
        maxWidth: 320, width: "88%",
      }}>
        <div className="uppercase" style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.22em", color: C.inkSoft }}>
          Level
        </div>
        <div style={{ fontSize: 19, marginBottom: 8 }}>{LEVEL_NAME}</div>
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.ink, lineHeight: 1.7 }}>
          <div>Defeat every enemy unit to win.</div>
          <div>Tap a unit, tap a tile to move, then choose an action.</div>
          <div>Drag to orbit the camera. Scroll or pinch to zoom.</div>
          <div>Sword beats Axe &middot; Axe beats Lance &middot; Lance beats Sword.</div>
          <div>Lose Kaelen and the battle is lost.</div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <Btn strong on={onDismiss}>Got it</Btn>
          {/* the lines above are the whole game in shorthand; anyone who
              needs the terms explained goes here instead */}
          <Btn light on={onFullGuide}>How to play</Btn>
        </div>
      </div>
    </div>
  );
}
