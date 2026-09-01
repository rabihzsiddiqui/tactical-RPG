import { Card, Eyebrow, Btn } from "./primitives.jsx";

/* renders in normal flow under the map (see App.jsx), in the same slot as
   the row of battle buttons it mirrors — swapped in for that row rather
   than floated on top of the viewport, so it never covers the 3D scene.
   Every non-strong button here needs the `light` prop: Btn's default
   (transparent bg, parchment-colored text) assumes a dark parent like the
   table background those under-map buttons normally sit on, and is
   invisible against this Card's own parchment background. `light` swaps
   in ink text/border instead, which reads correctly here. */
export default function PauseMenu({
  onResume, api, g, cam, setCam, RES,
  musicOn, onToggleMusic, track, onSetTrack, onHelp,
}) {
  // ending the turn kicks off the enemy phase, which needs the map visible —
  // closes the menu on the way out instead of leaving it sitting open over it
  function endTurnAndClose() {
    api.endTurn();
    onResume();
  }

  return (
    <Card>
      <div style={{ fontSize: 19, marginBottom: 8 }}>Menu</div>

      <Eyebrow>Battle</Eyebrow>
      <div className="flex flex-wrap gap-2 mb-4">
        <Btn on={endTurnAndClose} disabled={g.phase !== "player" || g.status !== "playing"} strong>
          End turn
        </Btn>
        <Btn light on={api.toggleDanger} active={g.danger}>
          {g.danger ? "Hide threat" : "Show threat"}
        </Btn>
        <Btn light on={() => setCam((c) => ({ ...c, yaw: (c.yaw + 90) % 360 }))}>Rotate 90&deg;</Btn>
        <Btn light on={() => setCam((c) => ({ ...c, res: (c.res + 1) % RES.length }))}>
          {RES[cam.res].label}
        </Btn>
      </div>

      <Eyebrow>Help</Eyebrow>
      <div className="flex flex-wrap gap-2 mb-4">
        <Btn light on={onHelp}>Field manual</Btn>
      </div>

      <Eyebrow>Sound</Eyebrow>
      <div className="flex flex-wrap gap-2 mb-2">
        <Btn light on={onToggleMusic} active={musicOn}>{musicOn ? "Music: On" : "Music: Off"}</Btn>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <Btn light on={() => onSetTrack("prelude")} active={track === "prelude"}>Prelude</Btn>
        <Btn light on={() => onSetTrack("conquest")} active={track === "conquest"}>Conquest</Btn>
      </div>

      <Btn strong on={onResume}>Resume</Btn>
    </Card>
  );
}
