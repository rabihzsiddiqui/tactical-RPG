/* SECTION 9: react ui overlay */

import { useRef, useEffect, useReducer, useState, useCallback } from "react";
import { mountScene, newGame, RES } from "../view/scene.js";
import {
  unlockAudio, setMusicEnabled, setMusicTrack, restartAudio, playHelpOpen, playHelp,
  setMusicVolume, setSfxVolume, DEFAULT_MUSIC_VOLUME, DEFAULT_SFX_VOLUME,
  playActionSelect, playMenu,
} from "../view/audio.js";
import { forecastOf } from "../core/combat.js";
import { LEVEL_NAME } from "../core/map.js";
import { C, MONO, SERIF, DISPLAY, PHASE_BANNER_MS } from "./theme.js";
import { Card, Eyebrow, Pill, Btn } from "./primitives.jsx";
import UnitHud, { UNIT_HUD_CSS } from "./UnitHud.jsx";
import ZoomButtons, { ZOOM_CSS } from "./ZoomButtons.jsx";
import Forecast from "./Forecast.jsx";
import BattleHud from "./BattleHud.jsx";
import ActionMenu from "./ActionMenu.jsx";
import OnboardingCard from "./OnboardingCard.jsx";
import TitleCard from "./TitleCard.jsx";
import PhaseBanner from "./PhaseBanner.jsx";
import PauseMenu, { MenuButton, MENU_CSS } from "./PauseMenu.jsx";
import HelpOverlay from "./HelpOverlay.jsx";
import { hintFor } from "./hint.js";

const ONBOARD_KEY = "tactical-rpg-onboarded";
/* the attack cut-in is on unless the player has switched it off. Persisted,
   unlike the music toggles, because turning it off is as much an
   accessibility choice (camera motion) as a taste one, and it should not
   come back on every launch of the installed app. */
const CINEMATICS_KEY = "tactical-rpg-cinematics";
/* the post pass outlines. Persisted the same way: off is also the cheaper
   setting, and a phone that needs it should not lose it on relaunch. */
const OUTLINES_KEY = "tactical-rpg-outlines";
/* the orbit pose a fresh board opens on. The dev reference-pose key snaps back to it. */
const CAM_HOME = { pitch: 48, yaw: 0, fov: 30, zoom: 12 };
/* dev builds only: fixed shots for graphics work, so screenshots from one
   session line up with the next. Clear of "?" and "h" below and the
   manual's Escape. The cut-in lives in scene.js as apiRef.refCutIn. */
const DEV_KEYS = { pose: "p", cutIn: "c" };
if (import.meta.env.DEV) {
  console.info(`dev keys: "${DEV_KEYS.pose}" reference pose, "${DEV_KEYS.cutIn}" reference cut-in (press again to release)`);
}

export default function App() {
  const mountRef = useRef(null);
  const menuRef = useRef(null);
  const forecastRef = useRef(null);
  const apiRef = useRef({});
  const gs = useRef(null);
  if (!gs.current) gs.current = newGame();
  const g = gs.current;

  const [, tick] = useReducer((n) => n + 1, 0);
  const [floats, setFloats] = useState([]);
  const [cam, setCam] = useState(() => ({
    ...CAM_HOME, res: RES.length - 1, post: true, levels: 32,
    cinematics: typeof localStorage === "undefined" || localStorage.getItem(CINEMATICS_KEY) !== "0",
    outlines: typeof localStorage === "undefined" || localStorage.getItem(OUTLINES_KEY) !== "0",
  }));
  const camRef = useRef(cam);
  camRef.current = cam;
  const [resetKey, setResetKey] = useState(0);
  const [onboarded, setOnboarded] = useState(
    () => typeof localStorage !== "undefined" && localStorage.getItem(ONBOARD_KEY) === "1"
  );
  const [began, setBegan] = useState(false);
  const [bannerCleared, setBannerCleared] = useState(false);
  const [paused, setPaused] = useState(false);
  const [musicOn, setMusicOn] = useState(true);
  const [track, setTrack] = useState("prelude");
  /* mirrors of the two gain buses in audio.js, kept here only so the sliders
     have something to render. audio.js stays the source of truth for the
     level itself. */
  const [musicVol, setMusicVol] = useState(DEFAULT_MUSIC_VOLUME);
  const [sfxVol, setSfxVol] = useState(DEFAULT_SFX_VOLUME);
  /* null when closed, otherwise the tab id the manual should open on, so
     a button can drop the reader straight into the section it's about */
  const [help, setHelp] = useState(null);
  /* the open menu's key handler, see the keydown effect below */
  const menuKeys = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    return mountScene({ mount, menuRef, forecastRef, g, camRef, setCam, setFloats, tick, apiRef });
  }, [resetKey]);

  /* every way into and out of the manual routes through these two, so the
     overlay's sounds are decided in one place: HelpPage.wav on the way in,
     Help.wav on the way out (the tab switches inside it play Help.wav too,
     see HelpOverlay.jsx). Lifecycle effects were the other option, but
     StrictMode remounts them in dev and would double up the sound. */
  const openHelp = useCallback((tab = "basics") => {
    playHelpOpen();
    setHelp(tab);
  }, []);
  const closeHelp = useCallback(() => {
    playHelp();
    setHelp(null);
  }, []);
  /* the menu plays its own way out (see PauseMenu.jsx) and calls closeMenu
     when the animation is done. Stable, since the menu waits on it. */
  const openMenu = useCallback(() => {
    playMenu();
    setPaused(true);
  }, []);
  const closeMenu = useCallback(() => setPaused(false), []);

  /* the one keydown listener. "?" (or "h") toggles the manual anywhere in
     the app. Escape goes to whatever is on top: the manual closes itself
     (HelpOverlay listens for its own Escape, so this steps aside while it
     is open), then the open menu takes Escape, the arrows and Enter through
     menuKeys, and with nothing open Escape opens the menu. The map itself is
     pointer-only, so none of this collides with a game input. This reads
     `help` and `paused` and re-binds on them rather than using updaters:
     an updater is the wrong place to fire a sound, since StrictMode runs
     updaters twice in dev and the sting would double. */
  useEffect(() => {
    function onKey(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "?" || e.key === "h" || e.key === "H") {
        e.preventDefault();
        if (help) closeHelp();
        else openHelp();
        return;
      }
      if (help) return;
      if (paused) menuKeys.current?.(e);
      else if (e.key === "Escape" && !e.repeat && began && g.status === "playing") {
        e.preventDefault();
        openMenu();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [help, openHelp, closeHelp, paused, began, g, openMenu]);

  /* see DEV_KEYS. The orbit target is fixed at the board's centre, so
     restoring the four camera fields is the whole reference pose. */
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    function onKey(e) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === DEV_KEYS.pose) setCam((c) => ({ ...c, ...CAM_HOME }));
      else if (k === DEV_KEYS.cutIn) apiRef.current.refCutIn?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* mirrors onBegin below: same manual first "Player Phase" banner (the
     event stream itself only emits that banner when returning from an
     enemy phase, not for a turn-1 start), same audio reset. restartAudio
     forces the track back to prelude and replays the unlock sequence, so
     a restarted run sounds exactly like a fresh one. */
  function restart() {
    playActionSelect();
    gs.current = newGame();
    gs.current.banner = { text: "Player Phase", side: "player", n: 0 };
    setFloats([]);
    setResetKey((k) => k + 1);
    /* the menu can be open when the battle ends, since the enemy phase
       plays on behind it, and it would reopen over the new board */
    setPaused(false);
    restartAudio();
    setTrack("prelude");
  }
  function dismissOnboarding() {
    playActionSelect();
    localStorage.setItem(ONBOARD_KEY, "1");
    setOnboarded(true);
  }
  /* the onboarding card's second button. The few lines it shows are the
     short version, this is the long one. Dismisses the card too, so the
     reader lands on the board once they close the manual. */
  /* dismisses without the select sound: openHelp's own HelpPage.wav is the
     cue for this button, and playing both would stack them. */
  function openFullGuide() {
    localStorage.setItem(ONBOARD_KEY, "1");
    setOnboarded(true);
    openHelp();
  }
  function toggleMusic() {
    setMusicOn((on) => { setMusicEnabled(!on); return !on; });
  }
  /* reads `cam` from the closure rather than inside the updater so the
     localStorage write is not a side effect of a function React may call
     twice in StrictMode */
  function toggleCinematics() {
    const on = !cam.cinematics;
    localStorage.setItem(CINEMATICS_KEY, on ? "1" : "0");
    setCam((c) => ({ ...c, cinematics: on }));
  }
  function toggleOutlines() {
    const on = !cam.outlines;
    localStorage.setItem(OUTLINES_KEY, on ? "1" : "0");
    setCam((c) => ({ ...c, outlines: on }));
  }
  function changeMusicVol(v) {
    setMusicVol(v);
    setMusicVolume(v);
  }
  function changeSfxVol(v) {
    setSfxVol(v);
    setSfxVolume(v);
  }
  function chooseTrack(name) {
    setTrack(name);
    setMusicTrack(name);
  }
  /* g and tick are stable regardless of whether mountScene's effect has run
     yet, unlike apiRef.current, which this click predates (it's the very
     first interaction of the session, before any canvas tap has forced a
     re-render), so this can't route through the api object the way the
     in-game buttons do. */
  function onBegin() {
    g.banner = { text: "Player Phase", side: "player", n: g.banner.n + 1 };
    tick();
    unlockAudio();
    setBegan(true);
    // the onboarding card is a full opaque overlay above the banner
    // (z-index 40 vs 25), so hold it off until the banner's actually cleared,
    // or it would cover the very first thing this fix was meant to show
    setTimeout(() => setBannerCleared(true), PHASE_BANNER_MS);
  }

  /* ------------------------------- UI layer ------------------------------ */

  const api = apiRef.current;
  const sel = g.sel;
  const selUnit = sel ? g.units.find((u) => u.id === sel.id) : null;
  const inspected = g.inspect ? g.units.find((u) => u.id === g.inspect) : null;
  /* the unit panel's unit, while the map is the thing being looked at: not
     through a cut-in (the battle HUD has it), the menu or the end screen */
  const hudUnit = began && !paused && !g.cutIn && g.status === "playing" && inspected && inspected.hp > 0
    ? inspected : null;
  const fc = g.forecast
    ? (() => {
        const a = g.units.find((u) => u.id === g.forecast.attackerId);
        const d = g.units.find((u) => u.id === g.forecast.targetId);
        return a && d ? { a, d, f: forecastOf(a, d) } : null;
      })()
    : null;
  const foesLeft = g.units.filter((u) => u.team === "enemy" && u.hp > 0).length;
  const hint = hintFor(g);
  const nudge = g.tutorial && g.phase === "player" && g.status === "playing";

  return (
    /* installed as a PWA, index.html asks for viewport-fit=cover and a
       black-translucent status bar, which puts the page *under* the status
       bar and the home indicator rather than below them. Nothing was paying
       that back, so on an iPad the header row sat beneath the clock in both
       orientations. This is the plain 12px of the old p-3 plus whatever the
       device reserves on each edge, which is 0 on hardware without insets.
       Landscape needs the left and right values too: iPads inset those. */
    <div style={{
      background: C.table, color: C.parch, fontFamily: SERIF,
      overflowX: "hidden", minHeight: "100vh",
      paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
      paddingRight: "calc(env(safe-area-inset-right, 0px) + 12px)",
      paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
      paddingLeft: "calc(env(safe-area-inset-left, 0px) + 12px)",
    }} className="w-full ashfen">
      <style>{`
        /* height of the map viewport, shared by the canvas and every overlay
           sized to it. Phones and small tablets keep the old value so the
           cards below the map stay within a thumb's reach. From 1024px up
           the map grows with the window instead: 250px is the header, the
           hint line, the button row and the page padding, so the viewport
           takes whatever is left and the page still fits one screen. The
           62vw term is for a tall narrow window, an iPad held upright: a
           portrait map only wastes the height it gains. */
        .ashfen { --view-h: min(58vh, 430px); }
        @media (min-width: 1024px) {
          .ashfen { --view-h: clamp(430px, min(calc(100vh - 250px), 62vw), 880px); }
        }
        @keyframes bannerIn { 0%{transform:translateX(-40px) scale(0.94);opacity:0}
          100%{transform:translateX(0) scale(1);opacity:1} }
        @keyframes bannerOut { 0%{transform:translateX(0) scale(1);opacity:1}
          100%{transform:translateX(40px) scale(0.94);opacity:0} }
        @keyframes scrimIn { 0%{opacity:0} 100%{opacity:1} }
        @keyframes scrimOut { 0%{opacity:1} 100%{opacity:0} }
        @keyframes riseOut { 0%{transform:translate(-50%,0);opacity:0} 20%{transform:translate(-50%,-8px);opacity:1}
          100%{transform:translate(-50%,-34px);opacity:0} }
        @keyframes popIn { 0%{transform:scale(.9);opacity:0} 100%{transform:scale(1);opacity:1} }
        @keyframes hintPulse { 0%,100%{opacity:1} 50%{opacity:0.45} }
        @keyframes hudIn { 0%{transform:translateY(10px);opacity:0} 100%{transform:translateY(0);opacity:1} }
        .bhud { animation: hudIn .22s ease-out; transition: opacity .3s ease-in, transform .3s ease-in; }
        .bhud.closing { opacity: 0; transform: translateY(10px); }
        .bhud-fill { transition: width .22s ease-out; }
        @media (prefers-reduced-motion: reduce) {
          .bhud { animation: none; transition: none; }
          .bhud-fill { transition: none; }
        }
        ${MENU_CSS}
        ${UNIT_HUD_CSS}
        ${ZOOM_CSS}
      `}</style>

      {!began && <TitleCard onBegin={onBegin} onHelp={() => openHelp()} />}
      {help && <HelpOverlay startTab={help} onClose={closeHelp} />}

      <div className="mx-auto" style={{ maxWidth: "min(100%, 1440px)" }}>
        <div className="flex items-end justify-between flex-wrap gap-2 mb-2">
          <div>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.22em", color: C.gold }}>
              ROUT THE ENEMY COMPANY
            </div>
            <div className="flex items-baseline gap-2">
              <div style={{ fontSize: 21 }}>{LEVEL_NAME}</div>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.2em", color: C.rule }}>
                LEVEL
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2" style={{ fontFamily: MONO, fontSize: 11 }}>
            <Pill k="Turn" v={String(g.turn)} />
            <Pill k="Phase" v={g.phase === "player" ? "Player" : "Enemy"}
              tone={g.phase === "player" ? C.blueLite : C.redLite} />
            <Pill k="Foes" v={String(foesLeft)} />
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-3 items-start">
          {/* ---- viewport with html overlays ---- */}
          <div className="relative" style={{ flex: "1 1 560px", minWidth: 280 }}>
            <div
              ref={mountRef}
              style={{
                width: "100%", height: "var(--view-h)", minHeight: 220,
                border: "2px solid #2f3746", background: "#9fc3d8", overflow: "hidden", touchAction: "none",
              }}
            />

            {/* hint line: always names the next action; HTML, never inside the render buffer */}
            <div style={{
              fontFamily: MONO, fontSize: 12, letterSpacing: "0.04em", textAlign: "center",
              padding: "6px 4px", color: nudge ? C.gold : C.parchDim,
              animation: nudge ? "hintPulse 1.1s ease-in-out infinite" : "none",
            }}>
              {hint}
            </div>

            {bannerCleared && !onboarded && (
              <OnboardingCard onDismiss={dismissOnboarding} onFullGuide={openFullGuide} />
            )}

            {/* damage numbers */}
            {floats.map((f) => (
              <div key={f.id} className="absolute"
                style={{
                  left: f.x, top: f.y, fontFamily: MONO, fontSize: 15, color: f.color,
                  textShadow: "0 1px 2px #000, 0 0 7px #000", pointerEvents: "none",
                  animation: "riseOut .9s ease-out forwards", zIndex: 12,
                }}>
                {f.text}
              </div>
            ))}

            <ActionMenu menuRef={menuRef} sel={sel} selUnit={selUnit} api={api} />

            {/* battle forecast, overlaid on the map itself near the units involved,
                so finishing an attack never requires looking away from the board */}
            <div ref={forecastRef} className="absolute"
              style={{ display: fc ? "block" : "none", width: 260, zIndex: 22 }}>
              {fc && <Forecast fc={fc} onAttack={api.confirmAttack} onCancel={api.cancelForecast} />}
            </div>

            {/* battle HUD: sits along the bottom edge of the canvas for the
                length of a cut-in. Above the damage numbers, below the
                forecast and the level-up card, which can pop mid-exchange */}
            {g.cutIn && (
              <div className="absolute flex items-end justify-center"
                style={{ top: 0, left: 0, right: 0, height: "var(--view-h)", paddingBottom: 8, zIndex: 20, pointerEvents: "none" }}>
                <BattleHud cut={g.cutIn} units={g.units} />
              </div>
            )}

            {/* unit panel, top left, level with the Menu button, see UnitHud.jsx */}
            <UnitHud u={hudUnit} />

            {/* phase banner */}
            {g.banner.n >= 0 && (
              <PhaseBanner key={g.banner.n} side={g.banner.side} text={g.banner.text}
                top="calc(var(--view-h) * 0.44)" />
            )}

            {/* level up */}
            {g.levelUp && (
              <div className="absolute flex items-center justify-center"
                style={{ inset: 0, zIndex: 30, background: "rgba(10,12,18,0.5)", pointerEvents: "none" }}>
                <div style={{
                  background: C.parch, color: C.ink, border: "2px solid " + C.ink,
                  boxShadow: "4px 4px 0 rgba(0,0,0,0.5)", padding: "10px 14px",
                  minWidth: 176, animation: "popIn .18s ease-out",
                }}>
                  <div className="uppercase" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.18em" }}>
                    Level up
                  </div>
                  <div style={{ fontSize: 17, marginBottom: 4 }}>
                    {g.levelUp.name} &rarr; Lv {g.levelUp.lvl}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.inkSoft }}>
                    {Object.keys(g.levelUp.gains).length
                      ? Object.entries(g.levelUp.gains).map(([k, v]) => k + " +" + v).join("   ")
                      : "no growth this level"}
                  </div>
                </div>
              </div>
            )}

            {/* end screen */}
            {g.status !== "playing" && (
              <div className="absolute flex flex-col items-center justify-center gap-3"
                style={{ inset: 0, zIndex: 35, background: "rgba(10,12,18,0.78)" }}>
                {/* same treatment as the phase banner: Cinzel, Roman capitals,
                    tracked out. The end screen is the other moment the game
                    speaks in its own voice, so it should not be in the body
                    serif the panels use. The tracking is added after the last
                    letter as well, which would push the word a hair left of
                    centre, so it comes back off the right edge, the same
                    trick PhaseBanner uses. */}
                <div style={{
                  fontFamily: DISPLAY, fontWeight: 600, fontSize: 40, lineHeight: 1,
                  textTransform: "uppercase", letterSpacing: "0.18em", marginRight: "-0.18em",
                  color: g.status === "win" ? C.gold : C.redLite,
                }}>
                  {g.status === "win" ? "Victory" : "Defeat"}
                </div>
                <Btn light strong on={restart}>Restart</Btn>
              </div>
            )}

            {/* the menu, over the map: its button in the top-right corner and
                the overlay itself at zIndex 50, above everything else on the
                map and below the title card and the manual. See PauseMenu.jsx.
                Gated on status==="playing" so it can't get stuck open (or
                reachable) behind the end screen. */}
            {began && g.status === "playing" && !paused && <MenuButton on={openMenu} />}
            {/* zoom, bottom right. Not through a cut-in, which the director
                frames on its own and the battle HUD spans; see ZoomButtons.jsx */}
            {began && g.status === "playing" && !paused && !g.cutIn && <ZoomButtons api={api} zoom={cam.zoom} />}
            {paused && g.status === "playing" && (
              <PauseMenu
                onClosed={closeMenu} keysRef={menuKeys} helpOpen={!!help}
                api={api} g={g} cam={cam} setCam={setCam} RES={RES}
                onToggleCinematics={toggleCinematics}
                onToggleOutlines={toggleOutlines}
                musicOn={musicOn} onToggleMusic={toggleMusic}
                track={track} onSetTrack={chooseTrack}
                onHelp={() => openHelp()}
                musicVol={musicVol} onSetMusicVol={changeMusicVol}
                sfxVol={sfxVol} onSetSfxVol={changeSfxVol}
              />
            )}

            {/* the under-map row: the threat range, a quarter turn of the
                camera and the manual, each one tap from the board. End turn
                and the settings live in the menu. */}
            <div className="mt-2">
              <div className="flex flex-wrap gap-2">
                <Btn on={api.toggleDanger} active={g.danger}>
                  {g.danger ? "Hide threat" : "Show threat"}
                </Btn>
                <Btn on={() => { playActionSelect(); setCam((c) => ({ ...c, yaw: (c.yaw + 90) % 360 })); }}>
                  Rotate 90&deg;
                </Btn>
                <Btn on={() => openHelp()}>Help</Btn>
              </div>
            </div>
          </div>

          {/* ---- side panels ---- */}
          <div className="flex flex-col gap-3" style={{ flex: "0 0 268px", width: "100%", maxWidth: 300 }}>
            <Card>
              <Eyebrow>Orders</Eyebrow>
              <p style={{ color: C.inkSoft, fontSize: 13, margin: "4px 0 0" }}>
                Tap a unit to see its movement in blue and its reach in red. Tap a tile to
                move, then pick an action. Drag the map to orbit. Zoom with the buttons at its
                bottom right, or scroll.
              </p>
              <div className="mt-2">
                <Btn light on={() => openHelp()}>New here? Read the manual</Btn>
              </div>
            </Card>

            <Card>
              <Eyebrow>Weapon triangle</Eyebrow>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.ink, lineHeight: 1.8 }}>
                <div>Sword &rarr; beats &rarr; Axe</div>
                <div>Axe &rarr; beats &rarr; Lance</div>
                <div>Lance &rarr; beats &rarr; Sword</div>
                <div style={{ color: C.inkSoft, marginTop: 4 }}>
                  Advantage gives +1 damage and +15 hit. Tomes hit Res and ignore terrain cover.
                </div>
                <button onClick={() => openHelp("combat")} style={{
                  fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", marginTop: 6, padding: 0,
                  background: "transparent", color: C.inkSoft, border: "none",
                  borderBottom: "1px solid " + C.rule, cursor: "pointer",
                }}>HOW COMBAT WORKS &rarr;</button>
              </div>
            </Card>

            <Card>
              <Eyebrow>Field log</Eyebrow>
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.inkSoft, maxHeight: 110, overflowY: "auto" }}>
                {g.log.map((l, i) => (
                  <div key={i} style={{ padding: "2px 0", borderBottom: "1px dotted " + C.rule }}>{l}</div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
