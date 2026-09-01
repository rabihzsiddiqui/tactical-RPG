/* SECTION 9: react ui overlay */

import { useRef, useEffect, useReducer, useState, useCallback } from "react";
import { mountScene, newGame, RES } from "../view/scene.js";
import { unlockAudio, setMusicEnabled, setMusicTrack, restartAudio } from "../view/audio.js";
import { forecastOf } from "../core/combat.js";
import { LEVEL_NAME } from "../core/map.js";
import { C, MONO, SERIF, PHASE_BANNER_MS } from "./theme.js";
import { Card, Eyebrow, Pill, Btn } from "./primitives.jsx";
import UnitCard from "./UnitCard.jsx";
import Forecast from "./Forecast.jsx";
import ActionMenu from "./ActionMenu.jsx";
import OnboardingCard from "./OnboardingCard.jsx";
import TitleCard from "./TitleCard.jsx";
import PhaseBanner from "./PhaseBanner.jsx";
import PauseMenu from "./PauseMenu.jsx";
import HelpOverlay from "./HelpOverlay.jsx";
import { hintFor } from "./hint.js";

const ONBOARD_KEY = "tactical-rpg-onboarded";

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
  const [cam, setCam] = useState({
    pitch: 48, yaw: 0, fov: 30, zoom: 12, res: RES.length - 1, post: true, levels: 32,
  });
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
  /* null when closed, otherwise the tab id the manual should open on — so
     a button can drop the reader straight into the section it's about */
  const [help, setHelp] = useState(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    return mountScene({ mount, menuRef, forecastRef, g, camRef, setCam, setFloats, tick, apiRef });
  }, [resetKey]);

  const closeHelp = useCallback(() => setHelp(null), []);

  /* "?" (or "h") toggles the manual anywhere in the app — the map itself is
     pointer-only, so no keystroke here can collide with a game input */
  useEffect(() => {
    function onKey(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "?" || e.key === "h" || e.key === "H") {
        e.preventDefault();
        setHelp((cur) => (cur ? null : "basics"));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* mirrors onBegin below: same manual first "Player Phase" banner (the
     event stream itself only emits that banner when returning from an
     enemy phase, not for a turn-1 start), same audio reset — restartAudio
     forces the track back to prelude and replays the unlock sequence, so
     a restarted run sounds exactly like a fresh one. */
  function restart() {
    gs.current = newGame();
    gs.current.banner = { text: "Player Phase", side: "player", n: 0 };
    setFloats([]);
    setResetKey((k) => k + 1);
    restartAudio();
    setTrack("prelude");
  }
  function dismissOnboarding() {
    localStorage.setItem(ONBOARD_KEY, "1");
    setOnboarded(true);
  }
  /* the onboarding card's second button — the few lines it shows are the
     short version, this is the long one. Dismisses the card too, so the
     reader lands on the board once they close the manual. */
  function openFullGuide() {
    dismissOnboarding();
    setHelp("basics");
  }
  function toggleMusic() {
    setMusicOn((on) => { setMusicEnabled(!on); return !on; });
  }
  function chooseTrack(name) {
    setTrack(name);
    setMusicTrack(name);
  }
  /* g and tick are stable regardless of whether mountScene's effect has run
     yet — unlike apiRef.current, which this click predates (it's the very
     first interaction of the session, before any canvas tap has forced a
     re-render), so this can't route through the api object the way the
     in-game buttons do. */
  function onBegin() {
    g.banner = { text: "Player Phase", side: "player", n: g.banner.n + 1 };
    tick();
    unlockAudio();
    setBegan(true);
    // the onboarding card is a full opaque overlay above the banner
    // (z-index 40 vs 25) — hold it off until the banner's actually cleared,
    // or it would cover the very first thing this fix was meant to show
    setTimeout(() => setBannerCleared(true), PHASE_BANNER_MS);
  }

  /* ------------------------------- UI layer ------------------------------ */

  const api = apiRef.current;
  const sel = g.sel;
  const selUnit = sel ? g.units.find((u) => u.id === sel.id) : null;
  const inspected = g.inspect ? g.units.find((u) => u.id === g.inspect) : null;
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
    <div style={{ background: C.table, color: C.parch, fontFamily: SERIF, overflowX: "hidden", minHeight: "100vh" }} className="w-full p-3">
      <style>{`
        @keyframes bannerIn { 0%{transform:translateX(-40px) scale(0.94);opacity:0}
          100%{transform:translateX(0) scale(1);opacity:1} }
        @keyframes bannerOut { 0%{transform:translateX(0) scale(1);opacity:1}
          100%{transform:translateX(40px) scale(0.94);opacity:0} }
        @keyframes riseOut { 0%{transform:translate(-50%,0);opacity:0} 20%{transform:translate(-50%,-8px);opacity:1}
          100%{transform:translate(-50%,-34px);opacity:0} }
        @keyframes popIn { 0%{transform:scale(.9);opacity:0} 100%{transform:scale(1);opacity:1} }
        @keyframes hintPulse { 0%,100%{opacity:1} 50%{opacity:0.45} }
      `}</style>

      {!began && <TitleCard onBegin={onBegin} onHelp={() => setHelp("basics")} />}
      {help && <HelpOverlay startTab={help} onClose={closeHelp} />}

      <div className="mx-auto" style={{ maxWidth: 980 }}>
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
                width: "100%", height: "min(58vh, 430px)", minHeight: 220,
                border: "2px solid #2f3746", background: "#9fc3d8", overflow: "hidden", touchAction: "none",
              }}
            />

            {/* while paused, block input to the map and everything overlaid on it
                (unit selection, action menu, forecast) — sized to the canvas only,
                so it never covers the under-map row where Resume actually lives */}
            {paused && g.status === "playing" && (
              <div className="absolute" style={{
                top: 0, left: 0, right: 0, height: "min(58vh, 430px)",
                zIndex: 45, background: "rgba(10,12,18,0.4)", cursor: "default",
              }} />
            )}

            {/* hint line — always names the next action; HTML, never inside the render buffer */}
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

            {/* battle forecast — overlaid on the map itself, near the units involved,
                so finishing an attack never requires looking away from the board */}
            <div ref={forecastRef} className="absolute"
              style={{ display: fc ? "block" : "none", width: 260, zIndex: 22 }}>
              {fc && <Forecast fc={fc} onAttack={api.confirmAttack} onCancel={api.cancelForecast} />}
            </div>

            {/* phase banner */}
            {g.banner.n >= 0 && (
              <PhaseBanner key={g.banner.n} side={g.banner.side} text={g.banner.text}
                top="calc(min(58vh, 430px) * 0.44)" />
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
                <div style={{ fontSize: 32, color: g.status === "win" ? C.gold : C.redLite }}>
                  {g.status === "win" ? "Victory!" : "Defeat"}
                </div>
                <Btn light strong on={restart}>Restart</Btn>
              </div>
            )}

            {/* the menu takes over this same under-map slot instead of floating
                over the viewport — see PauseMenu.jsx. Gated on status==="playing"
                so it can't get stuck open (or reachable) behind the end screen.
                End turn and the resolution ("graphics") toggle live only inside
                it now; Show threat/Rotate 90 stay available in both places. */}
            <div className="mt-2">
              {paused && g.status === "playing" ? (
                <PauseMenu
                  onResume={() => setPaused(false)}
                  api={api} g={g} cam={cam} setCam={setCam} RES={RES}
                  musicOn={musicOn} onToggleMusic={toggleMusic}
                  track={track} onSetTrack={chooseTrack}
                  onHelp={() => setHelp("basics")}
                />
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Btn on={() => setPaused(true)} disabled={g.status !== "playing"} strong>
                    Menu
                  </Btn>
                  <Btn on={api.toggleDanger} active={g.danger}>
                    {g.danger ? "Hide threat" : "Show threat"}
                  </Btn>
                  <Btn on={() => setCam((c) => ({ ...c, yaw: (c.yaw + 90) % 360 }))}>Rotate 90&deg;</Btn>
                  <Btn on={() => setHelp("basics")}>Help</Btn>
                </div>
              )}
            </div>
          </div>

          {/* ---- side panels ---- */}
          <div className="flex flex-col gap-3" style={{ flex: "0 0 268px", width: "100%", maxWidth: 300 }}>
            {inspected ? (
              <UnitCard u={inspected} />
            ) : (
              <Card>
                <Eyebrow>Orders</Eyebrow>
                <p style={{ color: C.inkSoft, fontSize: 13, margin: "4px 0 0" }}>
                  Tap a unit to see its movement in blue and its reach in red. Tap a tile to
                  move, then pick an action. Drag the map to orbit, scroll to zoom.
                </p>
                <div className="mt-2">
                  <Btn light on={() => setHelp("basics")}>New here? Read the manual</Btn>
                </div>
              </Card>
            )}

            <Card>
              <Eyebrow>Weapon triangle</Eyebrow>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.ink, lineHeight: 1.8 }}>
                <div>Sword &rarr; beats &rarr; Axe</div>
                <div>Axe &rarr; beats &rarr; Lance</div>
                <div>Lance &rarr; beats &rarr; Sword</div>
                <div style={{ color: C.inkSoft, marginTop: 4 }}>
                  Advantage gives +1 damage and +15 hit. Tomes hit Res and ignore terrain cover.
                </div>
                <button onClick={() => setHelp("combat")} style={{
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
