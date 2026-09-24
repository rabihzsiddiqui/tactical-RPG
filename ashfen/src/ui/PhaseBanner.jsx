import { C, DISPLAY, PHASE_BANNER_MS, SCRIM_RGB, SCRIM_RAMP as RAMP } from "./theme.js";

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

/* the ribbon is sized off --view-h, the map viewport's height (see the
   media query in App.jsx), so it grows with the board instead of staying
   at the size a 430px map wanted. The clamps hold the ends: a phone keeps
   roughly the old ribbon, and a large desktop stops short of a ribbon that
   would swallow the field it is announcing. The fallback in each var() is
   the phone value, for any render outside the .ashfen root. */
const VH = "var(--view-h, 430px)";
const BAND_H = `clamp(52px, calc(${VH} * 0.12), 80px)`;
const FONT = `clamp(21px, calc(${VH} * 0.05), 32px)`;
const RULE = `clamp(2px, calc(${VH} * 0.0045), 3px)`;
/* caps want air between them. The tracking is added after the last letter
   too, which would sit the word a hair left of centre, so it is taken back
   off the right edge. */
const TRACK = "0.18em";

/* the map either side of the ribbon dims while the banner is up, the way a
   film letterboxes a title card: the board stays readable underneath, the
   ribbon stops competing with it. Two bands rather than one scrim with a
   hole in it, since the ribbon's pointed ends need the board showing
   through around them. The colour and the ramp below live in theme.js,
   since the pause menu dims the board the same way. */
const SCRIM_A = 0.55;
/* the inner edge of each band, the one facing the ribbon, is a ramp rather
   than a line. A plain two-stop gradient bands visibly across a dark sky,
   so the alpha comes down in an ease-out: most of the drop happens in the
   first third of the ramp and the rest is a long tail into nothing, which
   is also what stops the soft edge from reading as a second, blurrier
   line. Stops are given as a fraction of the ramp length back from the
   edge, so the whole thing scales with FADE. */
const FADE = `clamp(28px, calc(${VH} * 0.09), 64px)`;
const scrimAt = (a) => `rgba(${SCRIM_RGB},${(SCRIM_A * a).toFixed(3)})`;
/* `dir` is the direction the ramp runs, so the outer edge of the band
   stays solid: it sits against the edge of the canvas, where there is no
   seam to soften. */
const scrim = (dir) =>
  `linear-gradient(to ${dir}, ${scrimAt(1)} 0%, `
  + RAMP.map(([k, a]) => `${scrimAt(a)} calc(100% - ${k} * ${FADE})`).join(", ")
  + ")";
const SCRIM_ANIM =
  `scrimIn ${ENTER_MS}ms ease-out forwards, `
  + `scrimOut ${EXIT_MS}ms ease-in ${EXIT_DELAY_MS}ms forwards`;

export default function PhaseBanner({ side, text, top }) {
  const bg = side === "player" ? "rgba(47,93,140,0.92)" : "rgba(157,47,51,0.92)";

  return (
    /* sized to the canvas, not to the column, so the dimming stops at the
       bottom edge of the map and leaves the hint line and buttons alone */
    <div className="absolute" style={{
      top: 0, left: 0, right: 0, height: VH, zIndex: 25, pointerEvents: "none", overflow: "hidden",
    }}>
      <div className="absolute" style={{
        top: 0, left: 0, right: 0, height: top,
        backgroundImage: scrim("bottom"), animation: SCRIM_ANIM,
      }} />
      <div className="absolute" style={{
        top: `calc(${top} + ${BAND_H})`, left: 0, right: 0, bottom: 0,
        backgroundImage: scrim("top"), animation: SCRIM_ANIM,
      }} />

      <div className="absolute flex items-center justify-center"
        style={{ left: 0, right: 0, top, height: BAND_H }}>
        <div className="relative flex items-center justify-center"
          style={{
            width: "min(90%, 640px)", height: BAND_H,
            animation:
              `bannerIn ${ENTER_MS}ms cubic-bezier(.22,.85,.32,1) forwards, `
              + `bannerOut ${EXIT_MS}ms cubic-bezier(.6,0,.85,.25) ${EXIT_DELAY_MS}ms forwards`,
          }}>
          {/* the ribbon body, pointed at both ends */}
          <div className="absolute flex items-center justify-center" style={{
            inset: 0, background: bg,
            clipPath: "polygon(0% 50%, 6% 0%, 94% 0%, 100% 50%, 94% 100%, 6% 100%)",
          }}>
            <span className="absolute" style={{ left: "9%", right: "9%", top: "11%", height: RULE, background: C.gold, opacity: 0.85 }} />
            <span className="absolute" style={{ left: "9%", right: "9%", bottom: "11%", height: RULE, background: C.gold, opacity: 0.85 }} />
            <span style={{
              fontFamily: DISPLAY, fontWeight: 600, fontSize: FONT, textTransform: "uppercase",
              letterSpacing: TRACK, marginRight: `-${TRACK}`, color: C.parch, lineHeight: 1,
            }}>{text}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
