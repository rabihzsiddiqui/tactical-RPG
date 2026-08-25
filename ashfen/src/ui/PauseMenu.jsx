import { C } from "./theme.js";
import { Eyebrow, Btn } from "./primitives.jsx";

/* mirrors the button row under the map (End turn / threat toggle / rotate /
   resolution) so pausing doesn't hide anything you could already do, then
   adds sound settings — a music on/off toggle and a track picker — that
   have no other home in the UI. */
export default function PauseMenu({
  onResume, api, g, cam, setCam, RES,
  musicOn, onToggleMusic, track, onSetTrack,
}) {
  return (
    <div className="absolute flex items-center justify-center"
      style={{ inset: 0, zIndex: 50, background: "rgba(10,12,18,0.82)" }}>
      <div style={{
        background: C.parch, color: C.ink, border: "2px solid " + C.ink,
        boxShadow: "4px 4px 0 rgba(0,0,0,0.5)", padding: "16px 18px",
        maxWidth: 320, width: "88%",
      }}>
        <div style={{ fontSize: 19, marginBottom: 10 }}>Paused</div>

        <Eyebrow>Battle</Eyebrow>
        <div className="flex flex-wrap gap-2 mb-3">
          <Btn on={api.endTurn} disabled={g.phase !== "player" || g.status !== "playing"} strong>
            End turn
          </Btn>
          <Btn on={api.toggleDanger} active={g.danger}>
            {g.danger ? "Hide threat" : "Show threat"}
          </Btn>
          <Btn on={() => setCam((c) => ({ ...c, yaw: (c.yaw + 90) % 360 }))}>Rotate 90&deg;</Btn>
          <Btn on={() => setCam((c) => ({ ...c, res: (c.res + 1) % RES.length }))}>
            {RES[cam.res].label}
          </Btn>
        </div>

        <Eyebrow>Sound</Eyebrow>
        <div className="flex flex-wrap gap-2 mb-2">
          <Btn on={onToggleMusic} active={musicOn}>{musicOn ? "Music: On" : "Music: Off"}</Btn>
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          <Btn on={() => onSetTrack("prelude")} active={track === "prelude"}>Prelude</Btn>
          <Btn on={() => onSetTrack("conquest")} active={track === "conquest"}>Conquest</Btn>
        </div>

        <Btn strong on={onResume}>Resume</Btn>
      </div>
    </div>
  );
}
