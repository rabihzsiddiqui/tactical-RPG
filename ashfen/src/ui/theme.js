/* shared presentation tokens, used by both the scene (floater colors) and the ui layer */

export const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
export const SERIF = "Georgia, 'Iowan Old Style', 'Times New Roman', serif";
/* the display face, for the phase banner and anything else that wants
   carved capitals. The web font behind it is subset to uppercase (see the
   @font-face in index.css), so only set this on text that is uppercased,
   by textTransform or by being written that way. Lowercase would silently
   fall through to the next face in the stack. */
export const DISPLAY = "Cinzel, 'Trajan Pro', Optima, Georgia, serif";

export const C = {
  parch: "#e9e0c8", parchDim: "#d8ccae", ink: "#221c12", inkSoft: "#5c5140",
  rule: "#b3a586", blue: "#2f5d8c", blueLite: "#7fb0e8", red: "#9d2f33",
  redLite: "#e0868a", gold: "#c8a04a", green: "#5f8a4a", table: "#0c0f16",
};

/* a theme colour at some alpha, so every tint on a dark panel is one of C's */
export const rgba = (hex, a) =>
  `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;

/* the dark scrim the phase banner and the pause menu lay over the map, and
   the ramp both fade it by: [fraction of the ramp back from its inner edge,
   fraction of full alpha]. PhaseBanner.jsx explains the shape. */
export const SCRIM_RGB = "10,12,18";
export const SCRIM_RAMP = [[1, 1], [0.65, 0.7], [0.38, 0.4], [0.16, 0.15], [0, 0]];

/* the phase banner's full on-screen lifetime (enter + hold + exit). audio.js
   times the first "Player Phase" banner's music cue off this same number, so
   the sting-to-music handoff stays in sync with what's actually on screen. */
export const PHASE_BANNER_MS = 1500;
