import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LEVEL_NAME } from "../core/map.js";
import { playActionSelect, playBack, playDrag } from "../view/audio.js";
import { C, MONO, DISPLAY, SCRIM_RGB, SCRIM_RAMP as RAMP } from "./theme.js";
import { Slider } from "./primitives.jsx";

/* the map menu. It opens over the battlefield, the way the map menu does
   in Three Houses or Engage: a command list on the left, chapter status on
   the right, the board still visible between them. It used to render in
   normal flow under the map so it never covered the scene, but once the
   map took the whole window that slot sat below the fold and had to be
   scrolled to. It is sized to the map viewport like every other map
   overlay, at zIndex 50, and does the job the old input blocker did: while
   it is up, nothing reaches the board. The title card (60) and the field
   manual (70) stay above it, so the manual opens on top and hands back.

   It speaks in the phase banner's voice: a dark scrim ramped the same way,
   thin gold rules, parchment text, headings in DISPLAY and labels in MONO.
   No backdrop blur: the render loop keeps running behind it, and a blur
   over a live WebGL canvas is expensive on a phone.

   When the map is narrow the panels stack: status folds into a strip over a
   full-width command list. Options takes the list's place and the strip's
   too. A phone in Safari leaves the map about 320px, which holds the strip
   and the list, or Options, but not the strip and Options together. The
   switch is a container query on the map's own width, not the window's:
   from 640 to 1023px of window the map is only 430 wide, and side by side
   the panels did not fit it.

   There is one cursor, and it is DOM focus. Hover, a tap, Tab and the
   arrow keys all move focus, the focused row lights up and the gold bar
   slides to it, so Enter and Space activate through the button's own
   click. App.jsx owns the only keydown listener and forwards to onKey
   below through keysRef; it only has to handle Enter itself when focus is
   outside the menu, which happens when the manual closes over it. */

const OPEN_MS = 180;      // scrim fade and panel slide on the way in
const CLOSE_MS = 140;     // the same in reverse on the way out, a touch quicker
const BAR_MS = 120;       // the gold bar sliding between rows
const SLIDE = 14;         // px the panels travel in from their sides
const NARROW = 599;       // px of map width at or below which the panels stack (a phone, or any window from 640 to 1023, where the map is 430 wide)
const SCRIM_EDGE = 0.82;  // scrim alpha behind the panels
const SCRIM_FLOOR = 0.36; // scrim alpha in the gap between them, where the board shows through

/* a theme colour at some alpha, so every tint here is one of C's */
const rgba = (hex, a) =>
  `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;

/* sized off the map viewport, like the phase banner, so the rows grow with
   the board and still fit the smallest one */
const VH = "var(--view-h, 430px)";
const CMD_ROW = `clamp(44px, calc(${VH} * 0.105), 54px)`;
const CMD_FONT = `clamp(15px, calc(${VH} * 0.04), 21px)`;
const HEAD_FONT = `clamp(15px, calc(${VH} * 0.042), 22px)`;
const TRACK = "0.14em";

/* PhaseBanner's ramp, from SCRIM_EDGE at the panels down to SCRIM_FLOOR.
   Side by side, it comes in from both edges and bottoms out mid-screen.
   Stacked, the list covers most of the view, so it runs top to bottom. */
const level = (a) => `rgba(${SCRIM_RGB},${(SCRIM_FLOOR + (SCRIM_EDGE - SCRIM_FLOOR) * a).toFixed(3)})`;
const WIDE_SCRIM = "linear-gradient(to right, "
  + RAMP.map(([k, a]) => `${level(a)} ${((1 - k) * 50).toFixed(1)}%`)
    .concat([...RAMP].reverse().map(([k, a]) => `${level(a)} ${(50 + k * 50).toFixed(1)}%`))
    .join(", ") + ")";
const NARROW_SCRIM = "linear-gradient(to bottom, "
  + RAMP.map(([k, a]) => `${level(a)} ${((1 - k) * 100).toFixed(1)}%`).join(", ") + ")";

/* App.jsx adds this to its own style block, so the map's Menu button has
   it too. Panels are near C.table and a little translucent; the darker
   outer edge and the gold rule 4px inside it read as a double rule.
   Motion is opacity and transform, and fade only under reduced motion. */
export const MENU_CSS = `
  .pm { position: absolute; top: 0; left: 0; right: 0; height: var(--view-h); z-index: 50; overflow: hidden;
    container-type: inline-size; }
  .pm-scrim { position: absolute; inset: 0; background-image: var(--pm-scrim-wide);
    animation: scrimIn ${OPEN_MS}ms ease-out both; }
  .pm-layout { position: absolute; inset: 0; display: flex; align-items: center; justify-content: space-between;
    gap: 16px; padding: clamp(10px, calc(var(--view-h) * 0.05), 28px); }
  .pm-panel { position: relative; box-sizing: border-box; max-height: 100%; overflow-y: auto; padding: 7px;
    background: ${rgba(C.table, 0.88)}; border: 1px solid rgba(0,0,0,0.7);
    outline: 1px solid ${rgba(C.gold, 0.7)}; outline-offset: -4px;
    animation: pmIn ${OPEN_MS}ms cubic-bezier(.22,.85,.32,1) both; }
  .pm-cmds { --pm-dx: -${SLIDE}px; min-width: min(40%, 240px); max-width: 50%; }
  .pm-side { --pm-dx: ${SLIDE}px; width: min(48%, 340px); }
  .pm.closing .pm-scrim { animation: scrimOut ${CLOSE_MS}ms ease-in both; }
  .pm.closing .pm-panel { animation: pmOut ${CLOSE_MS}ms ease-in both; }
  @keyframes pmIn { from { transform: translate(var(--pm-dx, 0px), var(--pm-dy, 0px)); opacity: 0; } }
  @keyframes pmOut { to { transform: translate(var(--pm-dx, 0px), var(--pm-dy, 0px)); opacity: 0; } }
  .pm-row { position: relative; z-index: 1; outline: none; }
  .pm-bar { position: absolute; left: 0; top: 0; pointer-events: none;
    border-left: 3px solid ${C.gold};
    background: linear-gradient(to right, ${rgba(C.gold, 0.24)}, ${rgba(C.gold, 0.05)} 75%, ${rgba(C.gold, 0)});
    transition: transform ${BAR_MS}ms ease-out, width ${BAR_MS}ms ease-out, height ${BAR_MS}ms ease-out,
      opacity ${BAR_MS}ms ease-out; }
  .pm-head { padding: 7px 16px 6px; }
  .pm-stat { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 6px 16px; }
  .pm-obj-inline { display: none; }
  .pm-open { position: absolute; top: 8px; right: 8px; z-index: 32; min-height: 44px;
    padding: 0 calc(14px - 0.18em) 0 14px; background: ${rgba(C.table, 0.82)}; border: 1px solid rgba(0,0,0,0.7);
    outline: 1px solid ${rgba(C.gold, 0.7)}; outline-offset: -4px;
    font-family: ${DISPLAY}; font-weight: 600; font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase;
    color: ${C.parch}; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent;
    user-select: none; }
  .pm-open:hover, .pm-open:focus-visible { outline-color: ${C.gold}; }
  @container (min-width: ${NARROW + 1}px) {
    .pm-hide-wide { display: none; }
  }
  @container (max-width: ${NARROW}px) {
    .pm-scrim { background-image: var(--pm-scrim-narrow); }
    .pm-layout { flex-direction: column; align-items: stretch; justify-content: flex-start; gap: 6px; padding: 8px; }
    .pm-cmds, .pm-side { width: auto; min-width: 0; max-width: none; flex: 0 1 auto; min-height: 0;
      --pm-dx: 0px; --pm-dy: ${SLIDE}px; }
    .pm-status { order: -1; flex: 0 0 auto; --pm-dy: -${SLIDE}px; }
    .pm-hide-narrow { display: none; }
    .pm-opts .pm-head, .pm-opts .pm-rule, .pm-status .pm-rule, .pm-stat-obj { display: none; }
    .pm-status .pm-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
      padding: 3px 10px 0; }
    .pm-obj-inline { display: inline; }
    .pm-stats { display: flex; flex-wrap: wrap; gap: 2px 14px; padding: 2px 10px 3px; }
    .pm-stat { padding: 0; gap: 6px; justify-content: flex-start; }
  }
  @media (prefers-reduced-motion: reduce) {
    .pm .pm-panel { --pm-dx: 0px; --pm-dy: 0px; }
    .pm-bar { transition: none; }
  }
`;

/* the Menu button that sits on the map, top right. The root's padding
   already pays back the safe-area insets, so the map's own corner is clear
   of them. Hidden while the menu is open. */
export function MenuButton({ on }) {
  return <button className="pm-open" onClick={on} aria-label="Open the menu">Menu</button>;
}

/* the navigable rows of a group, in order: enabled, and actually on screen,
   since the stacked layout hides a whole panel with CSS */
const rowsIn = (root, group) => {
  const panel = root.querySelector(`[data-pm-group="${group}"]`);
  if (!panel || !panel.getClientRects().length) return [];
  return [...panel.querySelectorAll("[data-pm-row]")].filter((r) => !r.disabled);
};
/* a row is a button, or a wrapper around a slider. `quiet` is for hover:
   the row is already in view, so the panel should not scroll under it. */
const focusRow = (row, quiet) => {
  const t = row.matches("button, input") ? row : row.querySelector("input, button");
  t?.focus({ preventScroll: !!quiet });
};

function Bar({ b, dim }) {
  return (
    <span className="pm-bar" style={{
      transform: `translate(${b.x}px, ${b.y}px)`, width: b.w, height: b.h, opacity: dim ? 0.35 : 1,
    }} />
  );
}

/* a command: carved capitals, with an optional MONO value on the right */
function Cmd({ id, lit, label, value, valueOn, on, disabled }) {
  return (
    <button className="pm-row" data-pm-row={id} data-lit={lit ? "" : undefined} onClick={on} disabled={disabled}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%",
        minHeight: CMD_ROW, padding: "0 14px 0 16px", background: "transparent", border: "none",
        textAlign: "left", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.35 : 1,
        touchAction: "manipulation", WebkitTapHighlightColor: "transparent", userSelect: "none",
      }}>
      <span style={{
        fontFamily: DISPLAY, fontWeight: 600, fontSize: CMD_FONT, lineHeight: 1, textTransform: "uppercase",
        letterSpacing: TRACK, whiteSpace: "nowrap", color: lit ? C.parch : C.parchDim,
      }}>{label}</span>
      {value != null && (
        <span style={{
          fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase",
          minWidth: "2.3em", textAlign: "right", color: valueOn ? C.gold : C.rule,
        }}>
          {value}
        </span>
      )}
    </button>
  );
}

/* a setting: MONO label and value, the way labels read everywhere else */
function Opt({ id, lit, label, value, valueOn, on, half }) {
  return (
    <button className="pm-row" data-pm-row={id} data-lit={lit ? "" : undefined} onClick={on}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
        flex: half ? "1 1 0" : undefined, width: half ? undefined : "100%", minWidth: 0,
        minHeight: 44, padding: "0 12px 0 16px", background: "transparent", border: "none",
        textAlign: "left", cursor: "pointer",
        fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase",
        touchAction: "manipulation", WebkitTapHighlightColor: "transparent", userSelect: "none",
      }}>
      <span style={{ color: lit ? C.parch : C.parchDim }}>{label}</span>
      <span style={{ color: valueOn ? C.gold : C.rule, whiteSpace: "nowrap" }}>{value}</span>
    </button>
  );
}

/* `aside` only shows in the stacked layout, where the status panel is a
   one-line strip and the objective rides beside the level name */
const SLIDER_CELL = { flex: "1 1 0", minWidth: 0, minHeight: 44, padding: "5px 10px 4px 12px" };

function Heading({ children, aside }) {
  return (
    <div className="pm-head">
      <span style={{
        fontFamily: DISPLAY, fontWeight: 600, fontSize: HEAD_FONT, lineHeight: 1.1, textTransform: "uppercase",
        letterSpacing: TRACK, color: C.parch,
      }}>{children}</span>
      {aside && (
        <span className="pm-obj-inline" style={{ fontFamily: MONO, fontSize: 11, color: C.parchDim }}>{aside}</span>
      )}
    </div>
  );
}

function Rule() {
  return <div className="pm-rule" style={{ height: 1, margin: "0 16px 6px", background: C.gold, opacity: 0.85 }} />;
}

function GroupLabel({ children }) {
  return (
    <div style={{
      fontFamily: DISPLAY, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.22em",
      color: C.gold, padding: "6px 16px 0",
    }}>{children}</div>
  );
}

function Stat({ k, v, className = "" }) {
  return (
    <div className={"pm-stat " + className} style={{ fontFamily: MONO }}>
      <span style={{ fontSize: 10, letterSpacing: "0.2em", color: C.rule, textTransform: "uppercase" }}>{k}</span>
      <span style={{ fontSize: 13, color: C.parch }}>{v}</span>
    </div>
  );
}

export default function PauseMenu({
  onClosed, keysRef, helpOpen, api, g, cam, setCam, RES,
  onToggleCinematics, onToggleOutlines, musicOn, onToggleMusic, track, onSetTrack, onHelp,
  musicVol, onSetMusicVol, sfxVol, onSetSfxVol,
}) {
  const rootRef = useRef(null);
  const [view, setView] = useState("main");     // "main" shows status, "options" swaps it out
  const [closing, setClosing] = useState(false);
  const [cur, setCur] = useState({ cmds: "resume", opts: "res" }); // the lit row in each group
  const [active, setActive] = useState("cmds");  // the group focus is in; the other group's bar dims
  const [bars, setBars] = useState({ cmds: null, opts: null });

  /* every way out: Resume, Escape, and End turn, which has its own sound */
  function close(sound = true) {
    if (closing) return;
    if (sound) playBack();
    setClosing(true);
  }
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(onClosed, CLOSE_MS);
    return () => clearTimeout(t);
  }, [closing, onClosed]);

  function openOptions() {
    playActionSelect();
    setView("options");
  }
  function back() {
    playBack();
    setView("main");
  }

  /* the forwarded keys. Escape backs out of Options before it closes the
     menu. Up and down move focus within the group that has it, wrapping at
     the ends; with focus outside the menu the first press just lands on the
     lit row. Enter only needs handling here when focus is outside the menu,
     otherwise the focused row's own click already fires. */
  function onKey(e) {
    const root = rootRef.current;
    if (closing || !root) return;
    const inMenu = root.contains(document.activeElement);
    const home = view === "options" ? "opts" : "cmds";
    if (e.key === "Escape") {
      if (e.repeat) return;
      e.preventDefault();
      if (view === "options") back();
      else close();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const group = (inMenu && document.activeElement.closest("[data-pm-group]")?.dataset.pmGroup) || home;
      const rows = rowsIn(root, group);
      if (!rows.length) return;
      const i = rows.findIndex((r) => r.dataset.pmRow === cur[group]);
      const step = e.key === "ArrowDown" ? 1 : -1;
      focusRow(inMenu && i >= 0 ? rows[(i + step + rows.length) % rows.length] : rows[Math.max(0, i)]);
    } else if (e.key === "Enter" && !inMenu) {
      e.preventDefault();
      const row = rowsIn(root, home).find((r) => r.dataset.pmRow === cur[home]);
      if (!row) return;
      focusRow(row);
      if (row.tagName === "BUTTON") row.click();
    }
  }
  useEffect(() => {
    keysRef.current = onKey;
    return () => { keysRef.current = null; };
  });

  /* focus lands on the lit row when the menu opens, when Options opens or
     closes, and when the manual hands back. While the manual is up nothing
     in here keeps focus, or Enter would press the row hidden behind it. */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (helpOpen) {
      if (root.contains(document.activeElement)) document.activeElement.blur();
      return;
    }
    const group = view === "options" ? "opts" : "cmds";
    const rows = rowsIn(root, group);
    const lit = root.querySelector(`[data-pm-group="${group}"] [data-lit]`);
    const row = view === "options" ? rows[0] : rows.find((r) => r === lit) || rows[0];
    if (row) focusRow(row);
  }, [view, helpOpen]);

  /* the cursor follows focus, from any source */
  const onFocusIn = (group) => (e) => {
    const row = e.target.closest("[data-pm-row]");
    if (!row) return;
    const id = row.dataset.pmRow;
    setCur((c) => (c[group] === id ? c : { ...c, [group]: id }));
    setActive(group);
  };
  /* and hover or a tap moves focus. Safari does not focus a button on a
     click, so without the pointerdown half a tap would leave the bar
     behind on the old row. */
  const onPointer = (e) => {
    const row = e.target.closest("[data-pm-row]");
    if (!row || row.disabled || row.contains(document.activeElement)) return;
    focusRow(row, true);
  };

  /* the bar is one element per panel, placed over the lit row, so moving
     it is a transform transition rather than a row fading in and out */
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    function measure() {
      const next = {};
      for (const group of ["cmds", "opts"]) {
        const row = root.querySelector(`[data-pm-group="${group}"] [data-lit]`);
        next[group] = row && row.getClientRects().length
          ? { x: row.offsetLeft, y: row.offsetTop, w: row.offsetWidth, h: row.offsetHeight }
          : null;
      }
      setBars(next);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [cur, view]);

  const groupProps = (group) => ({
    "data-pm-group": group, onFocus: onFocusIn(group), onPointerMove: onPointer, onPointerDown: onPointer,
  });
  const lit = (group, id) => cur[group] === id;
  const onOff = (on) => (on ? "On" : "Off");
  const left = (team) => g.units.filter((u) => u.team === team && u.hp > 0).length;
  const all = (team) => g.units.filter((u) => u.team === team).length;

  return (
    <div ref={rootRef} className={"pm" + (closing ? " closing" : "")} role="dialog" aria-modal="true" aria-label="Menu">
      <div className="pm-scrim" style={{ "--pm-scrim-wide": WIDE_SCRIM, "--pm-scrim-narrow": NARROW_SCRIM }} />
      <div className="pm-layout">
        <div className={"pm-panel pm-cmds" + (view === "options" ? " pm-hide-narrow" : "")} {...groupProps("cmds")}>
          {bars.cmds && <Bar b={bars.cmds} dim={active !== "cmds"} />}
          <Cmd id="resume" lit={lit("cmds", "resume")} label="Resume" on={() => close()} />
          {/* ending the turn kicks off the enemy phase, which needs the map
              visible, so this closes the menu on the way out. No back sound:
              api.endTurn already voices it. */}
          <Cmd id="end" lit={lit("cmds", "end")} label="End turn"
            disabled={g.phase !== "player" || g.status !== "playing"}
            on={() => { api.endTurn(); close(false); }} />
          {/* api.toggleDanger and openHelp voice themselves, see scene.js
              and App.jsx; a select sound here would double them up */}
          <Cmd id="threat" lit={lit("cmds", "threat")} label="Threat range"
            value={onOff(g.danger)} valueOn={g.danger} on={api.toggleDanger} />
          <Cmd id="manual" lit={lit("cmds", "manual")} label="Field manual" on={onHelp} />
          <Cmd id="options" lit={lit("cmds", "options")} label="Options"
            on={view === "options" ? undefined : openOptions} />
        </div>

        {view === "options" ? (
          <div className="pm-panel pm-side pm-opts" {...groupProps("opts")}>
            {bars.opts && <Bar b={bars.opts} dim={active !== "opts"} />}
            <Heading>Options</Heading>
            <Rule />
            <GroupLabel>Display</GroupLabel>
            <Opt id="res" lit={lit("opts", "res")} label="Resolution" value={RES[cam.res].label}
              on={() => { playActionSelect(); setCam((c) => ({ ...c, res: (c.res + 1) % RES.length })); }} />
            <div className="flex">
              {/* the attack cut-in. Off plays every strike from the orbit
                  camera, exactly as it did before the camera director existed. */}
              <Opt id="cine" half lit={lit("opts", "cine")} label="Cinematics"
                value={onOff(cam.cinematics)} valueOn={cam.cinematics}
                on={() => { playActionSelect(); onToggleCinematics(); }} />
              {/* the edge lines drawn in the post pass. Off drops their extra
                  render pass entirely and is the look from before they existed. */}
              <Opt id="outlines" half lit={lit("opts", "outlines")} label="Outlines"
                value={onOff(cam.outlines)} valueOn={cam.outlines}
                on={() => { playActionSelect(); onToggleOutlines(); }} />
            </div>
            <GroupLabel>Sound</GroupLabel>
            <div className="flex">
              <Opt id="music" half lit={lit("opts", "music")} label="Music" value={onOff(musicOn)} valueOn={musicOn}
                on={() => { playActionSelect(); onToggleMusic(); }} />
              <Opt id="track" half lit={lit("opts", "track")} label="Track" value={track} valueOn
                on={() => { playActionSelect(); onSetTrack(track === "prelude" ? "conquest" : "prelude"); }} />
            </div>
            {/* side by side, which is what lets Options fit a phone and an
                upright iPad without scrolling. The music slider stays usable
                while music is off: it sets the level the track comes back at. */}
            <div className="flex">
              <div className="pm-row" data-pm-row="mvol" data-lit={lit("opts", "mvol") ? "" : undefined}
                style={SLIDER_CELL}>
                <Slider label="Music volume" value={musicVol} on={onSetMusicVol} onGrab={playDrag} />
              </div>
              <div className="pm-row" data-pm-row="svol" data-lit={lit("opts", "svol") ? "" : undefined}
                style={SLIDER_CELL}>
                <Slider label="Effects volume" value={sfxVol} on={onSetSfxVol} onGrab={playDrag} />
              </div>
            </div>
            <Cmd id="back" lit={lit("opts", "back")} label="Back" on={back} />
          </div>
        ) : (
          <div className="pm-panel pm-side pm-status">
            <Heading aside="Rout the enemy">{LEVEL_NAME}</Heading>
            <Rule />
            <div className="pm-stats">
              <Stat className="pm-stat-obj" k="Objective" v="Rout the enemy" />
              <Stat k="Turn" v={g.turn} />
              <Stat k="Company" v={`${left("player")} / ${all("player")}`} />
              <Stat k="Foes" v={`${left("enemy")} / ${all("enemy")}`} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
