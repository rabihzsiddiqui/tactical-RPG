import { playActionSelect, playBack, playDrag } from "../view/audio.js";
import { Card, Eyebrow, Btn, Slider } from "./primitives.jsx";

/* renders in normal flow under the map (see App.jsx), in the same slot as
   the row of battle buttons it mirrors. It is swapped in for that row
   rather than floated over the viewport, so it never covers the 3D scene.
   Every non-strong button here needs the `light` prop: Btn's default
   (transparent bg, parchment-colored text) assumes a dark parent like the
   table background those under-map buttons normally sit on, and is
   invisible against this Card's own parchment background. `light` swaps
   in ink text/border instead, which reads correctly here. */
export default function PauseMenu({
  onResume, api, g, cam, setCam, RES,
  musicOn, onToggleMusic, track, onSetTrack, onHelp,
  musicVol, onSetMusicVol, sfxVol, onSetSfxVol,
}) {
  // ending the turn kicks off the enemy phase, which needs the map visible,
  // so this closes the menu on the way out rather than leaving it open over it
  function endTurnAndClose() {
    api.endTurn();
    onResume();
  }

  /* Resume plays back.wav, since leaving the menu is the same gesture as
     backing out of the action menu or the forecast. It sits on the button
     rather than on onResume itself, because endTurnAndClose closes the menu
     too and End turn already has its own sound. */
  function resumeAndSound() {
    playBack();
    onResume();
  }

  /* the controls below own their sound, unlike End turn, Show threat and
     Field manual, which are already voiced further down the call (by
     api.endTurn, api.toggleDanger and App's openHelp). Adding a second one
     here would double them up. */
  function rotate() {
    playActionSelect();
    setCam((c) => ({ ...c, yaw: (c.yaw + 90) % 360 }));
  }
  function cycleRes() {
    playActionSelect();
    setCam((c) => ({ ...c, res: (c.res + 1) % RES.length }));
  }
  function toggleMusic() {
    playActionSelect();
    onToggleMusic();
  }
  function pickTrack(name) {
    playActionSelect();
    onSetTrack(name);
  }

  return (
    <Card>
      <div style={{ fontSize: 19, marginBottom: 8 }}>Menu</div>

      {/* Resume leads. Closing the menu is the most common reason to open it,
          so it sits above the Battle group rather than at the far end of a
          panel the reader has to scroll past first. */}
      <div className="mb-4">
        <Btn strong on={resumeAndSound}>Resume</Btn>
      </div>

      <Eyebrow>Battle</Eyebrow>
      <div className="flex flex-wrap gap-2 mb-4">
        <Btn on={endTurnAndClose} disabled={g.phase !== "player" || g.status !== "playing"} strong>
          End turn
        </Btn>
        <Btn light on={api.toggleDanger} active={g.danger}>
          {g.danger ? "Hide threat" : "Show threat"}
        </Btn>
        <Btn light on={rotate}>Rotate 90&deg;</Btn>
        <Btn light on={cycleRes}>{RES[cam.res].label}</Btn>
      </div>

      <Eyebrow>Help</Eyebrow>
      <div className="flex flex-wrap gap-2 mb-4">
        <Btn light on={onHelp}>Field manual</Btn>
      </div>

      <Eyebrow>Sound</Eyebrow>
      <div className="flex flex-wrap gap-2 mb-2">
        <Btn light on={toggleMusic} active={musicOn}>{musicOn ? "Music: On" : "Music: Off"}</Btn>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        <Btn light on={() => pickTrack("prelude")} active={track === "prelude"}>Prelude</Btn>
        <Btn light on={() => pickTrack("conquest")} active={track === "conquest"}>Conquest</Btn>
      </div>
      {/* the music slider stays usable while music is off. It sets the level
          the track will come back at, rather than being greyed out. */}
      <div className="mb-4">
        <Slider label="Music volume" value={musicVol} on={onSetMusicVol} onGrab={playDrag} />
        <Slider label="Effects volume" value={sfxVol} on={onSetSfxVol} onGrab={playDrag} />
      </div>
    </Card>
  );
}
