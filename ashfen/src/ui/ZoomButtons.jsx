/* the map's zoom buttons, in its bottom-right corner: plus over minus, in
   the Menu button's dress, a dark panel with the gold rule inside a darker
   edge. On a phone a pinch is quick to overshoot and easy to lose track of,
   and these step the same zoom a fixed amount per tap. Each press plays the
   drag sound. At either end of the range that button dims and does nothing.

   The range comes from the scene (zoomRange in scene.js): in to ZOOM_MIN,
   out to the zoom that just frames the board from the current angle. The
   wheel and the pinch clamp to the same range. */

import { playDrag } from "../view/audio.js";
import { C, rgba } from "./theme.js";

const STEP = 1.4;   // zoom factor per press, about two wheel notches
const SIZE = 44;    // px, each button's side: a full touch target
const INSET = 8;    // px from the map's right and bottom edges, the Menu button's own inset

/* added to App.jsx's style block, like MENU_CSS. The button glyphs take
   the gold on hover and focus, and the panel's rule lights with them, the
   way the Menu button's does. */
export const ZOOM_CSS = `
  .zoom { position: absolute; right: ${INSET}px; top: calc(var(--view-h) - ${INSET}px); transform: translateY(-100%);
    z-index: 19; display: flex; flex-direction: column; width: ${SIZE}px;
    background: ${rgba(C.table, 0.82)}; border: 1px solid rgba(0,0,0,0.7);
    outline: 1px solid ${rgba(C.gold, 0.7)}; outline-offset: -4px; }
  .zoom:hover, .zoom:has(button:focus-visible) { outline-color: ${C.gold}; }
  .zoom button { display: flex; align-items: center; justify-content: center; width: ${SIZE}px; height: ${SIZE}px;
    padding: 0; background: transparent; border: none; outline: none; color: ${C.parch}; cursor: pointer;
    touch-action: manipulation; -webkit-tap-highlight-color: transparent; user-select: none; }
  .zoom button:not(:disabled):hover, .zoom button:focus-visible { color: ${C.gold}; }
  .zoom button:disabled { color: ${C.rule}; opacity: 0.4; cursor: default; }
  .zoom-rule { height: 1px; margin: 0 9px; background: ${rgba(C.gold, 0.5)}; }
`;

function Glyph({ plus }) {
  return (
    <svg viewBox="0 0 14 14" width={14} height={14} aria-hidden="true">
      <path d={plus ? "M1 7 H13 M7 1 V13" : "M1 7 H13"} stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  );
}

/* `zoom` is only here so the buttons redraw when it changes */
export default function ZoomButtons({ api, zoom }) {
  const range = api.zoomRange?.();
  if (!range) return null;
  const z = Math.min(zoom, range.max);
  const press = (k) => {
    playDrag();
    api.zoomBy(k);
  };
  return (
    <div className="zoom">
      <button onClick={() => press(1 / STEP)} disabled={z <= range.min + 0.01} aria-label="Zoom in">
        <Glyph plus />
      </button>
      <div className="zoom-rule" />
      <button onClick={() => press(STEP)} disabled={z >= range.max - 0.01} aria-label="Zoom out">
        <Glyph />
      </button>
    </div>
  );
}
