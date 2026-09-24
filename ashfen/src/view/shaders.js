/* SECTION 6: shaders */

/* outline tunables, templated into POST_FRAG as GLSL literals */
const OUTLINE_DARK = 0.45;      // a depth edge multiplies the pixel by this, so the line keeps the local hue
const OUTLINE_LIGHT = 1.3;      // a convex crease multiplies the pixel by this
const OUTLINE_DEPTH = 3.0;      // a depth jump is an edge past this many pixels' worth of the surface's own slope
const OUTLINE_FACING_MIN = 0.1; // how edge-on a surface may count, so a grazing floor cannot lift the threshold forever
const OUTLINE_CREASE = 0.2;     // 1 - cos of the shallowest crease that draws, about 37 degrees
const OUTLINE_SIDE_EPS = 0.03;  // two faces lit within this of each other both take the highlight
const OUTLINE_RUSH = 8.0;       // the lines are gone once the director's rush passes 1 / this
const glf = (x) => x.toFixed(3);

export const POST_VERT = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`;
/* POST_FRAG: encode, posterise, warm, vignette. uRush is the camera director's
   transit speed, 0 at rest and 1 at the peak of a fly-in. While it is up,
   each pixel averages eight taps along the line from itself toward the
   screen centre, a smear that grows with distance from the centre, so
   the middle of the frame stays readable while the edges streak past.
   Taps step inward rather than outward so the streak reads as the
   world rushing at the lens. The blur runs before the posteriser, which
   would otherwise cut the averaged ramps back into bands.

   rt holds linear light, and this pass is what puts the frame on the
   canvas, so it owes the sRGB encode that three adds by itself when a
   scene draws straight to the screen (which is why post off never looked
   dark). It sits after the blur, which should average light rather than
   encoded values, and before the posteriser, so the levels are spread
   evenly over what the eye sees. Without it the canvas showed linear
   values as if they were encoded: the sky came out at (89,135,168)
   instead of its (159,195,216), and the whole lit board sat in the
   bottom six of 32 levels, where one level is a big step.

   The quantiser is undithered on purpose. It only bands where it is fed a
   smooth ramp, and the scene no longer has one: the distance fog that
   used to supply it is gone (see scene.js), terrain faces are flat and
   constant per tile, the sky is one colour, and the water bands by
   design. The vignette below cannot band either, since it is applied
   after the floor. Dithering was tried here and works, but it lays a
   chequer over every flat surface to hide a ramp nothing needs.

   Outlines, after the quantiser so they stay one hard pixel wide. Each
   pixel reads rt's depth and the normal pass (scene.js) at itself and its
   four neighbours. A dark line goes on the near side of a depth jump, a
   light one on a convex crease where there is no jump. Every decision is
   a step, so a pixel is lined or it is not; nothing here is a ramp.

   The depth threshold is in pixels of the surface's own slope: one pixel
   of screen at depth z spans px world units, and a surface seen at facing
   f recedes about px / f per pixel. Scaling by z alone held at grid
   distance, but in the cut-in the ground runs nearly edge-on and every
   pixel of it read as a jump. The facing is the smaller of the two
   pixels', which keeps a step seen from low down from lining the riser.

   A crease is convex when the chord from this pixel to the neighbour, in
   view space, points further along the neighbour's normal than along this
   pixel's own: each face drops away behind the other's plane. Where a unit
   meets the ground it is the other way round. Both pixels astride a convex
   crease pass the test, so the more sun-facing one takes the line. That
   choice belongs to the world, not the camera, so the line does not hop
   sides while the camera orbits.

   rt's alpha is how much outline a pixel accepts: 1 for solid geometry,
   the unit's own opacity on a unit, 0 on water, and scaled down under an
   overlay by its coverage (see noOutline in meshes.js). uRush fades the
   lot out quickly, since lines drawn crisp over the transit blur would
   dirty it. Depth math and the tap coordinates are highp: mediump holds
   neither a linear depth nor a one-texel step at native width. */
export const POST_FRAG = `
  precision mediump float;
  uniform sampler2D tDiffuse; uniform float uLevels; uniform float uVignette; uniform float uRush;
  uniform float uOutline; uniform sampler2D tDepth; uniform sampler2D tNormal;
  uniform highp vec2 uTexel; uniform vec2 uTan; uniform highp float uNear; uniform highp float uFar; uniform vec3 uSun;
  varying highp vec2 vUv;
  highp float viewZ(highp vec2 uv){
    highp float d = texture2D(tDepth, uv).r;
    return uNear*uFar / (uFar - d*(uFar - uNear));
  }
  vec3 viewN(highp vec2 uv){ return texture2D(tNormal, uv).rgb*2.0 - 1.0; }
  void edgeTap(vec2 o, highp float z, vec3 n, vec3 v, float fn, highp float px,
               inout float dark, inout float jump, inout float light){
    highp vec2 uv = vUv + o*uTexel;
    highp float dz = viewZ(uv) - z;
    vec3 m = viewN(uv);
    highp float thr = ${glf(OUTLINE_DEPTH)}*px / max(min(fn, dot(m, v)), ${glf(OUTLINE_FACING_MIN)});
    dark = max(dark, step(thr, dz));
    jump = max(jump, step(thr, abs(dz)));
    /* half the squared difference is 1 - cos for unit normals, and 0 for
       two equal texels of anything, so the sky's clear colour, which is
       no unit vector, never reads as a crease against itself */
    vec3 dn = n - m;
    vec3 chord = vec3(o*px, -dz);
    float crease = step(${glf(OUTLINE_CREASE)}, 0.5*dot(dn, dn));
    float convex = step(0.0, -dot(chord, dn));
    float lit = step(-${glf(OUTLINE_SIDE_EPS)}, dot(dn, uSun));
    light = max(light, crease*convex*lit);
  }
  float outline(){
    float accept = texture2D(tDiffuse, vUv).a * clamp(1.0 - uRush*${glf(OUTLINE_RUSH)}, 0.0, 1.0);
    if (accept <= 0.0) return 1.0;
    highp float z = viewZ(vUv);
    vec3 n = viewN(vUv);
    vec3 v = normalize(vec3((1.0 - 2.0*vUv)*uTan, 1.0));
    float fn = dot(n, v);
    highp float px = 2.0*uTan.y*uTexel.y*z;
    float dark = 0.0, jump = 0.0, light = 0.0;
    edgeTap(vec2( 1.0, 0.0), z, n, v, fn, px, dark, jump, light);
    edgeTap(vec2(-1.0, 0.0), z, n, v, fn, px, dark, jump, light);
    edgeTap(vec2(0.0,  1.0), z, n, v, fn, px, dark, jump, light);
    edgeTap(vec2(0.0, -1.0), z, n, v, fn, px, dark, jump, light);
    return mix(1.0, ${glf(OUTLINE_DARK)}, dark*accept) * mix(1.0, ${glf(OUTLINE_LIGHT)}, light*(1.0 - jump)*accept);
  }
  void main(){
    vec2 d = vUv-0.5;
    vec3 c;
    if (uRush > 0.002) {
      vec2 stp = d * uRush * 0.4 / 7.0;
      c = vec3(0.0);
      for (int i = 0; i < 8; i++) c += texture2D(tDiffuse, vUv - stp * float(i)).rgb;
      c /= 8.0;
    } else {
      c = texture2D(tDiffuse, vUv).rgb;
    }
    c = linearToOutputTexel(vec4(c, 1.0)).rgb;
    if (uLevels < 63.0) c = floor(c*uLevels + 0.5)/uLevels;
    if (uOutline > 0.5) c *= outline();
    c = mix(c, c*vec3(1.06,1.01,0.93), 0.5);
    c *= 1.0 - dot(d,d)*uVignette;
    gl_FragColor = vec4(c,1.0);
  }`;

/* every scene shader below ends in linearToOutputTexel, three's own output
   encode. Drawing into rt it does nothing, since rt holds linear light and
   POST_FRAG encodes. With post off the scene draws straight to the canvas,
   and it is the same sRGB encode three's built-in materials apply there,
   so the two paths show the same colours. */
export const TILE_VERT = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
export const TILE_FRAG = `
  precision mediump float;
  uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
  void main(){
    vec2 p=vUv;
    float b=min(min(p.x,1.-p.x),min(p.y,1.-p.y));
    float edge=smoothstep(0.10,0.05,b);
    float pulse=0.80+sin(uTime*2.6)*0.12;
    gl_FragColor=linearToOutputTexel(vec4(uColor,(edge*0.75+0.26)*pulse));
  }`;

export const RING_FRAG = `
  precision mediump float;
  uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
  void main(){
    float d=length(vUv-0.5)*2.0;
    float r=0.74+sin(uTime*4.5)*0.06;
    float ring=smoothstep(0.10,0.0,abs(d-r));
    float glow=smoothstep(1.0,0.15,d)*0.16;
    gl_FragColor=linearToOutputTexel(vec4(uColor, ring*0.95+glow));
  }`;

/* the water, in the Wind Waker key: flat bright tones, a lapping white
   collar wherever the surface meets land, and hard little glints riding
   the swell. Nothing here is physically motivated; it is all cel shapes.

   WATER_VERT rolls the surface with three crossing sine swells and
   builds the normal from their analytic slopes rather than from the
   geometry, so a coarse grid still lights smoothly. Everything works in
   world space, which is what keeps the per-tile planes seamless: two
   vertices that share a world position get the same displacement. */
export const WATER_VERT = `
  uniform float uTime;
  /* uTime is declared in both stages, so neither may pin a precision:
     three's default highp then applies to both and they agree */
  varying vec3 vPos; varying vec3 vN;
  void main(){
    vec3 wp = (modelMatrix*vec4(position,1.)).xyz;
    float px = wp.x*1.7 + uTime*1.10;
    float pz = wp.z*2.3 - uTime*0.80;
    float pd = (wp.x+wp.z)*3.1 + uTime*1.70;
    wp.y += sin(px)*0.034 + sin(pz)*0.026 + sin(pd)*0.013;
    float dx = cos(px)*0.034*1.7 + cos(pd)*0.013*3.1;
    float dz = cos(pz)*0.026*2.3 + cos(pd)*0.013*3.1;
    vN = normalize(vec3(-dx, 1.0, -dz));
    vPos = wp;
    gl_Position = projectionMatrix*viewMatrix*vec4(wp,1.);
  }`;
/* WATER_FRAG. uShore is the shore field built by buildShoreField in
   meshes.js: one channel holding the distance from that point to the
   nearest land tile, in tile units, scaled into 0..1 over SHORE_RANGE.
   Reading it back gives a distance the shader can cut foam bands out of,
   so the collar follows the real coastline instead of a hand-placed
   decal. uOrigin/uSize map a world position onto that texture.

   The rest is three flat colour steps for depth, two more for the swell,
   a wobbling white collar at the waterline with a second band trailing
   behind it, and sparse diamond glints. Bands are cut with step, not
   smoothstep, on purpose: the hard edge is the whole look.

   The colours are sRGB values picked by eye against the screen, so the
   result goes through sRGBTransferEOTF into linear light like the rest of
   the frame, and the encode on the way out gives back exactly these. */
export const WATER_FRAG = `
  uniform float uTime; uniform sampler2D uShore;
  uniform vec2 uOrigin; uniform vec2 uSize; uniform float uRange; uniform vec3 uSun;
  varying vec3 vPos; varying vec3 vN;
  void main(){
    vec2 uv = (vPos.xz + uOrigin) / uSize;
    float d = texture2D(uShore, uv).r * uRange;

    /* depth ramp: bright turquoise in the shallows, deep teal offshore,
       in three flat steps rather than a smooth gradient */
    float dd = clamp(d/0.50, 0.0, 1.0);
    vec3 c = vec3(0.30,0.76,0.78);
    c = mix(c, vec3(0.11,0.53,0.66), step(0.30, dd));
    c = mix(c, vec3(0.06,0.38,0.60), step(0.72, dd));

    /* swell tones: two crossing waves quantised into a lighter and a
       lightest step, which is what gives the surface its cut-paper feel */
    float w = sin(vPos.x*2.6 + uTime*1.2) + sin(vPos.z*3.4 - uTime*0.9)
            + sin((vPos.x-vPos.z)*4.7 + uTime*1.8)*0.7;
    c = mix(c, c*1.16, step(0.55, w));
    c = mix(c, c*1.30 + vec3(0.03,0.05,0.04), step(1.55, w));

    /* the sun side of each swell lifts slightly, a soft tilt under the
       hard bands so the surface does not read as perfectly flat */
    c *= 0.95 + 0.10*smoothstep(-0.04, 0.04, dot(vN.xz, uSun.xz));

    /* shore collar. The waterline wobbles so the foam laps instead of
       tracing a clean offset, then a second thinner band trails behind
       it the way Wind Waker draws its concentric arcs. */
    float wob = sin(vPos.x*3.1 + uTime*1.7)*0.5 + sin(vPos.z*3.7 - uTime*1.2)*0.5;
    float e = d + wob*0.030;
    float collar = 1.0 - step(0.055, e);
    float arc = step(0.125, e) * (1.0 - step(0.155, e));

    /* the lip. Water that reaches the edge of the map has nothing to
       meet, it just goes over, so the last strip before the drop churns
       white the way the top of a fall does. The shore field cannot say
       this: off-map counts as water there, on purpose, so that a river
       leaving the map does not foam against the boundary like a bank. */
    vec2 tc = vPos.xz + uOrigin;
    float edge = min(min(tc.x, uSize.x - tc.x), min(tc.y, uSize.y - tc.y));
    float lip = 1.0 - step(0.16 + wob*0.02, edge);

    float foam = clamp(collar + arc*0.6 + lip, 0.0, 1.0);

    /* glints: a product of two fast sines makes a drifting diamond
       lattice, of which only the crests survive the step */
    float g = sin(vPos.x*7.0 + uTime*2.1) * sin(vPos.z*8.5 - uTime*1.6);
    float glint = step(0.972, g) * (1.0 - foam) * step(0.20, d);

    c = mix(c, vec3(0.93,0.99,1.0), foam);
    c = mix(c, vec3(1.0), glint*0.85);
    gl_FragColor = linearToOutputTexel(sRGBTransferEOTF(vec4(c,1.0)));
  }`;

/* the waterfall: what the river does when it runs out of map. One quad
   per run of edge water tiles, standing in the open air just outside the
   terrain's own edge face, built in scene.js.

   FALL_VERT hands the fragment stage world space rather than uv, so a
   quad that spans several tiles gets one continuous pattern instead of
   the same tile repeated. vSpan is the sum of world x and z: the quad
   stands on one of the two, so whichever axis it spans is the one that
   varies, and the same shader serves all four map edges. No uniform is
   shared with the fragment stage, which is what keeps the two precision
   declarations from having to agree. */
export const FALL_VERT = `
  varying vec3 vPos; varying float vSpan;
  void main(){
    vec4 wp = modelMatrix*vec4(position,1.);
    vPos = wp.xyz; vSpan = wp.x + wp.z;
    gl_Position = projectionMatrix*viewMatrix*wp;
  }`;
/* FALL_FRAG. The sheet is cut into vertical ribbons, each carrying its
   own offset so the fall does not read as one scrolling texture, and
   each ribbon carries dashes that scroll down it. The dash phase grows
   with the square of the drop, so the dashes stretch as they go and the
   water looks like it is picking up speed. The lip churns solid white,
   and past halfway the sheet shreds into separate falling chunks and
   thins out into nothing rather than ending on a cut line.

   No precision qualifier: world positions here run to a few tens of
   units and mediump would quantise the ribbon phases into steps you can
   see. uTop is the world height of the lip, uHeight the drop. Colours
   are sRGB, decoded on the way out, as in WATER_FRAG. */
export const FALL_FRAG = `
  uniform float uTime; uniform float uTop; uniform float uHeight;
  varying vec3 vPos; varying float vSpan;
  void main(){
    float t = clamp((uTop - vPos.y)/uHeight, 0.0, 1.0);
    float drop = t*uHeight;

    float lane = floor(vSpan*6.0);
    float off = fract(sin(lane*12.9898)*43758.5453);
    float seam = step(0.88, fract(vSpan*6.0));

    /* each lane runs at its own rate and starts at its own offset, or
       every streak in the sheet would break at the same height and the
       fall would read as a ladder */
    float ph = drop*(0.85 + off*0.5) + drop*drop*0.10 - uTime*(1.5 + off*0.6) + off*7.0;
    float streak = 1.0 - step(0.55, fract(ph));

    vec3 c = vec3(0.55,0.88,0.93);
    c = mix(c, vec3(0.97,1.00,1.00), streak);
    c = mix(c, vec3(0.26,0.62,0.78), seam);

    float crest = 1.0 - step(0.07, t);
    c = mix(c, vec3(1.0), crest);

    float body = 1.0 - smoothstep(0.62, 1.0, t);
    float chunk = 1.0 - step(0.42, fract(ph*0.5 + 0.3));
    float shred = mix(1.0, chunk, smoothstep(0.45, 0.90, t));
    gl_FragColor = linearToOutputTexel(sRGBTransferEOTF(vec4(c, clamp(body*shred + crest, 0.0, 1.0))));
  }`;

/* attack effects, see effects.js. Both use TILE_VERT for the vertex stage
   and additive blending, so alpha here is how much light the effect adds.

   TRAIL_FRAG: the weapon trail ribbon. uv.x runs from the newest sample
   (0) to the oldest; uLen is how much of that range holds real samples,
   so the alpha reaches zero exactly at the tail however few frames the
   swing took. uFade drops the whole ribbon out after the swing and uGain
   lifts it for a crit. */
export const TRAIL_FRAG = `
  precision mediump float;
  uniform vec3 uColor; uniform float uFade; uniform float uLen; uniform float uGain;
  varying vec2 vUv;
  void main(){
    float along = clamp(1.0 - vUv.x / max(uLen, 0.001), 0.0, 1.0);
    float across = 1.0 - abs(vUv.y - 0.5) * 1.2;
    float a = along * along * across * uFade * 0.85 * uGain;
    gl_FragColor = linearToOutputTexel(vec4(uColor, a));
  }`;

/* IMPACT_FRAG: the burst quad at the point of contact. uT runs 0 to 1
   over the burst's life: a six-point core that collapses and whitens at
   the centre, and a ring that expands out of it, both fading with uT. */
export const IMPACT_FRAG = `
  precision mediump float;
  uniform float uT; uniform vec3 uColor; varying vec2 vUv;
  void main(){
    vec2 p = (vUv - 0.5) * 2.0;
    float d = length(p);
    float star = 0.62 + 0.38 * abs(sin(atan(p.y, p.x) * 3.0));
    float core = smoothstep(0.7 * star, 0.0, d / max(1.0 - uT * 0.6, 0.05)) * (1.0 - uT);
    float r = 0.2 + uT * 0.8;
    float ring = smoothstep(0.12, 0.0, abs(d - r)) * (1.0 - uT) * 0.7;
    vec3 c = mix(uColor, vec3(1.0), core * 0.5);
    gl_FragColor = linearToOutputTexel(vec4(c, core + ring));
  }`;
