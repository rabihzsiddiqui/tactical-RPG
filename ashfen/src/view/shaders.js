/* SECTION 6: shaders */

export const POST_VERT = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`;
export const POST_FRAG = `
  precision mediump float;
  uniform sampler2D tDiffuse; uniform float uLevels; uniform float uVignette;
  varying vec2 vUv;
  void main(){
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    if (uLevels < 63.0) c = floor(c*uLevels + 0.5)/uLevels;
    c = mix(c, c*vec3(1.06,1.01,0.93), 0.5);
    vec2 d = vUv-0.5; c *= 1.0 - dot(d,d)*uVignette;
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

export const WATER_VERT = `
  varying vec3 vPos;
  void main(){ vPos=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
export const WATER_FRAG = `
  precision mediump float;
  uniform float uTime; varying vec3 vPos;
  void main(){
    float w=sin(vPos.x*2.2+uTime*1.3)*0.5+sin(vPos.z*3.1-uTime*0.9)*0.5;
    vec3 c=mix(vec3(0.12,0.27,0.34), vec3(0.19,0.40,0.47), step(0.05,w));
    c=mix(c, vec3(0.36,0.60,0.66), step(0.80,w));
    gl_FragColor=vec4(c,1.0);
  }`;
