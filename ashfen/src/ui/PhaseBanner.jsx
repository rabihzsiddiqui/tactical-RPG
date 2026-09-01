import { C, SERIF, PHASE_BANNER_MS } from "./theme.js";

/* a ribbon rather than a full-width slab. The old version slid a bar the
   whole viewport's width across the screen, which read as choppy simply
   because the element (and thus the distance it moved) was so large. This
   one is a bounded width and moves a few tens of pixels with a gentle
   scale+fade, so the same enter/hold/exit beat reads as smooth motion
   instead of a screen-wide slam. Pointed ends are pure CSS (clip-path),
   with no image assets. */
const ENTER_MS = 420;
const EXIT_MS = 380;
const EXIT_DELAY_MS = PHASE_BANNER_MS - EXIT_MS;

export default function PhaseBanner({ side, text, top }) {
  const bg = side === "player" ? "rgba(47,93,140,0.92)" : "rgba(157,47,51,0.92)";

  return (
    <div className="absolute flex items-center justify-center"
      style={{ left: 0, right: 0, top, height: 56, zIndex: 25, pointerEvents: "none" }}>
      <div className="relative flex items-center justify-center"
        style={{
          width: "min(88%, 460px)", height: 46,
          animation:
            `bannerIn ${ENTER_MS}ms cubic-bezier(.22,.85,.32,1) forwards, `
            + `bannerOut ${EXIT_MS}ms cubic-bezier(.6,0,.85,.25) ${EXIT_DELAY_MS}ms forwards`,
        }}>
        {/* the ribbon body, pointed at both ends */}
        <div className="absolute flex items-center justify-center" style={{
          inset: 0, background: bg,
          clipPath: "polygon(0% 50%, 6% 0%, 94% 0%, 100% 50%, 94% 100%, 6% 100%)",
        }}>
          <span className="absolute" style={{ left: "9%", right: "9%", top: 5, height: 2, background: C.gold, opacity: 0.85 }} />
          <span className="absolute" style={{ left: "9%", right: "9%", bottom: 5, height: 2, background: C.gold, opacity: 0.85 }} />
          <span style={{ fontFamily: SERIF, fontSize: 20, letterSpacing: "0.12em", color: C.parch }}>{text}</span>
        </div>
      </div>
    </div>
  );
}
