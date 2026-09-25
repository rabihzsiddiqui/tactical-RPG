/* weapon type glyphs, one per `type` in core/data.js's WEAPONS, on a 16
   unit square and drawn in currentColor so they take the colour of the
   text beside them. The long arms lie on the diagonal, grip bottom left,
   the way weapon icons have sat in the genre since the GBA: each is drawn
   upright and turned 45 degrees about the centre. Hard corners, like the
   rest of the ui. */

const DIAG = "rotate(45 8 8)";

const GLYPHS = {
  sword: (
    <g transform={DIAG}>
      <path d="M7 2.6 L8 0.8 L9 2.6 V10 H7 Z" />
      <rect x="4.6" y="10" width="6.8" height="1.5" />
      <rect x="7.3" y="11.5" width="1.4" height="2.7" />
      <rect x="6.6" y="14.2" width="2.8" height="1.4" />
    </g>
  ),
  lance: (
    <g transform={DIAG}>
      <path d="M8 0.4 L9.7 3.5 L8 5.7 L6.3 3.5 Z" />
      <rect x="7.35" y="5.2" width="1.3" height="10.5" />
    </g>
  ),
  axe: (
    <g transform={DIAG}>
      <rect x="8.3" y="1" width="1.4" height="14.5" />
      <path d="M8.3 2.2 L5 1 Q2.4 4.8 5 8.6 L8.3 7.4 Z" />
    </g>
  ),
  bow: (
    <g transform={DIAG} fill="none" stroke="currentColor">
      <path d="M10.5 1 C2.5 3 2.5 13 10.5 15" strokeWidth="1.8" />
      <path d="M10.5 1 V15" strokeWidth="0.8" />
    </g>
  ),
  /* a tome, spine on the left, with the flame of its one spell cut out of
     the cover. evenodd makes the inner shapes holes. */
  anima: (
    <path fillRule="evenodd" d={
      "M3 1.5 H13 V14.5 H3 Z M4.4 1.5 H5.2 V14.5 H4.4 Z "
      + "M9.2 4.2 C11.4 6.6 11.6 8.4 10.8 9.9 C10.3 10.9 8.1 10.9 7.6 9.9 "
      + "C6.9 8.6 7.6 7.4 8.4 6.8 C8.4 7.8 8.8 8.4 9.3 8.3 C9.6 7 9.6 5.6 9.2 4.2 Z"
    } />
  ),
  staff: (
    <g transform={DIAG}>
      <circle cx="8" cy="3.4" r="2.35" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="3.4" r="0.9" />
      <rect x="6.6" y="5.8" width="2.8" height="1" />
      <rect x="7.35" y="6.8" width="1.3" height="8.8" />
    </g>
  ),
};

/* `type` is the weapon's type key; an unknown one draws nothing */
export default function WeaponIcon({ type, size = 16, color }) {
  const glyph = GLYPHS[type];
  if (!glyph) return null;
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" role="img" aria-label={type}
      style={{ display: "block", flex: "0 0 auto", color }}>
      {glyph}
    </svg>
  );
}
