/* shared presentation tokens, used by both the scene (floater colors) and the ui layer */

export const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
export const SERIF = "Georgia, 'Iowan Old Style', 'Times New Roman', serif";

export const C = {
  parch: "#e9e0c8", parchDim: "#d8ccae", ink: "#221c12", inkSoft: "#5c5140",
  rule: "#b3a586", blue: "#2f5d8c", blueLite: "#7fb0e8", red: "#9d2f33",
  redLite: "#e0868a", gold: "#c8a04a", green: "#5f8a4a", table: "#0c0f16",
};

/* the phase banner's full on-screen lifetime (enter + hold + exit). audio.js
   times the first "Player Phase" banner's music cue off this same number, so
   the sting-to-music handoff stays in sync with what's actually on screen. */
export const PHASE_BANNER_MS = 1500;
