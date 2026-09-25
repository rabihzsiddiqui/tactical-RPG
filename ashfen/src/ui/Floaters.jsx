/* the numbers that rise off a unit when a strike lands or a heal takes:
   carved capitals, light on a burst of colour so they read against grass,
   sky or a red tunic alike. The enemy health bar's red behind damage, gold
   into that red behind a crit, the staff heal's green behind a heal, and a
   plain small MISS. The theme's own green is too near the grass to show. scene.js
   adds one per event (floater(), with its screen point and a kind) and
   drops it once the rise is over. They are html over the canvas, so the
   posteriser never touches the soft edge of the burst. */

import { C, SERIF, rgba } from "./theme.js";

const FLOAT_MS = 900;  // the whole rise; scene.js clears each floater after the same 900
const SIZE = 28;       // px, a hit or a heal
const CRIT_SIZE = 36;  // px, a crit
const MISS_SIZE = 18;  // px, a miss
const RISE = 38;       // px it climbs before it is gone

/* the burst: an oval with a near-solid core behind the figures that
   softens to nothing at its edge */
const burst = (inner, mid, edge) =>
  `radial-gradient(closest-side, ${inner}, ${inner} 25%, ${mid} 55%, ${edge})`;

/* added to App.jsx's style block. The text is Cinzel for the figures,
   with Spectral behind it for the "+" the capitals subset leaves out. A
   quick pop to full size, then the climb and the fade. Under reduced
   motion it only fades, where it landed. */
export const FLOATER_CSS = `
  .float { position: absolute; z-index: 12; pointer-events: none; transform: translate(-50%, 0);
    font-family: Cinzel, ${SERIF}; font-weight: 600; font-size: ${SIZE}px; line-height: 1;
    letter-spacing: 0.02em; text-transform: uppercase; white-space: nowrap; color: ${C.parch};
    text-shadow: 0 1px 0 rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.5);
    animation: floatUp ${FLOAT_MS}ms ease-out forwards; }
  .float::before { content: ""; position: absolute; z-index: -1; left: 50%; top: 50%;
    width: 2.8em; height: 2em; transform: translate(-50%, -50%); border-radius: 50%;
    background: ${burst(rgba(C.hurt, 0.95), rgba(C.hurt, 0.55), rgba(C.hurt, 0))}; }
  .float.crit { font-size: ${CRIT_SIZE}px; color: ${C.gold}; }
  .float.crit::before { width: 3.2em; height: 2.3em; background: ${burst(rgba(C.gold, 0.85), rgba(C.hurt, 0.7), rgba(C.hurt, 0))}; }
  .float.heal::before { background: ${burst(rgba(C.mend, 0.95), rgba(C.mend, 0.55), rgba(C.mend, 0))}; }
  .float.miss { font-size: ${MISS_SIZE}px; color: ${C.parchDim}; }
  .float.miss::before { display: none; }
  @keyframes floatUp {
    0% { transform: translate(-50%, 0) scale(0.7); opacity: 0; }
    15% { transform: translate(-50%, -6px) scale(1.1); opacity: 1; }
    30% { transform: translate(-50%, -10px) scale(1); opacity: 1; }
    100% { transform: translate(-50%, -${RISE}px) scale(1); opacity: 0; }
  }
  @keyframes floatFade { 0% { opacity: 0; } 15% { opacity: 1; } 100% { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) {
    .float { animation-name: floatFade; }
  }
`;

/* `floats` is scene.js's list: { id, x, y, text, kind }, kind one of
   hit, crit, heal and miss */
export default function Floaters({ floats }) {
  return floats.map((f) => (
    <div key={f.id} className={"float " + f.kind} style={{ left: f.x, top: f.y }}>{f.text}</div>
  ));
}
