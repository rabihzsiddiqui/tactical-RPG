/* SECTION 6: shaders */

export const POST_VERT = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`;
/* POST_FRAG: posterise, warm, vignette. uRush is the camera director's
   transit speed, 0 at rest and 1 at the peak of a fly-in. While it is up,
   each pixel averages eight taps along the line from itself toward the
   screen centre, a smear that grows with distance from the centre, so
   the middle of the frame stays readable while the edges streak past.
   Taps step inward rather than outward so the streak reads as the
   world rushing at the lens. The blur runs before the posteriser, which
   would otherwise cut the averaged ramps back into bands. */
export const POST_FRAG = `
  precision mediump float;
  uniform sampler2D tDiffuse; uniform float uLevels; uniform float uVignette; uniform float uRush;
  varying vec2 vUv;
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
    if (uLevels < 63.0) c = floor(c*uLevels + 0.5)/uLevels;
    c = mix(c, c*vec3(1.06,1.01,0.93), 0.5);
    c *= 1.0 - dot(d,d)*uVignette;
    gl_FragColor = vec4(c,1.0);
  }`;

export const TILE_VERT = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
export const TILE_FRAG = `
  precision mediump float;
  uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
  void main(){
    vec2 p=vUv;
    float b=min(min(p.x,1.-p.x),min(p.y,1.-p.y));
    float edge=smoothstep(0.10,0.05,b);
    float pulse=0.80+sin(uTime*2.6)*0.12;
    gl_FragColor=vec4(uColor,(edge*0.75+0.26)*pulse);
  }`;

export const RING_FRAG = `
  precision mediump float;
  uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
  void main(){
    float d=length(vUv-0.5)*2.0;
    float r=0.74+sin(uTime*4.5)*0.06;
    float ring=smoothstep(0.10,0.0,abs(d-r));
    float glow=smoothstep(1.0,0.15,d)*0.16;
    gl_FragColor=vec4(uColor, ring*0.95+glow);
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
   smoothstep, on purpose: the hard edge is the whole look. */
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
    gl_FragColor = vec4(c,1.0);
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
   see. uTop is the world height of the lip, uHeight the drop. */
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
    gl_FragColor = vec4(c, clamp(body*shred + crest, 0.0, 1.0));
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
    gl_FragColor = vec4(uColor, a);
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
    gl_FragColor = vec4(c, core + ring);
  }`;
