/* SECTION: audio engine — score playback and phase-change stingers.
   Lives in view/, not core/: it's presentation, same as scene.js's
   walkPath/lunge/flash. core/game.js never imports this.

   Music: prelude.mp3 plays start-to-finish once (0:00-4:51), then loops
   the 2:39-4:51 section forever. That's native AudioBufferSourceNode
   behavior — loop=true with loopStart/loopEnd only kicks in once playback
   first reaches loopEnd, so a start offset before loopStart plays through
   as an intro exactly once. Needs Web Audio (not <audio loop>) because
   <audio>'s loop points aren't sample-accurate and would click at the seam.

   SFX: the phase-start "sheath" sound is synthesized at runtime (filtered
   noise "shing" + a few inharmonic metallic partials) rather than sourced
   as an asset — nothing to license, and "deeper for enemy phase" is just
   the same recipe transposed down with a longer decay. */

const MUSIC_URL = "/audio/prelude.mp3";
const LOOP_START = 159; // 2:39
const LOOP_END = 291; // 4:51
const MUSIC_VOLUME = 0.5;
const SFX_VOLUME = 0.7;

let ctx = null;
let musicGain = null;
let sfxGain = null;
let musicBuffer = null;
let musicStarted = false;
let noiseBuffer = null;

function getContext() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    musicGain = ctx.createGain();
    musicGain.gain.value = MUSIC_VOLUME;
    musicGain.connect(ctx.destination);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = SFX_VOLUME;
    sfxGain.connect(ctx.destination);
  }
  return ctx;
}

async function startMusic() {
  if (musicStarted) return;
  musicStarted = true;
  const c = getContext();
  if (!musicBuffer) {
    const res = await fetch(MUSIC_URL);
    const bytes = await res.arrayBuffer();
    musicBuffer = await c.decodeAudioData(bytes);
  }
  const src = c.createBufferSource();
  src.buffer = musicBuffer;
  src.loop = true;
  src.loopStart = LOOP_START;
  src.loopEnd = LOOP_END;
  src.connect(musicGain);
  src.start(0, 0);
}

/* browsers won't run audio before a user gesture — call on the first
   pointerdown/keydown (armed below) to resume the context. The initial
   "Player Phase" banner is state set directly in newGame(), not an event
   played through scene.js's banner case, so nothing else would ever fire
   its sheath sound — this is that first play. Music then starts once the
   sheath's tail has finished, rather than stacking on top of it. */
export function unlockAudio() {
  const c = getContext();
  c.resume().then(() => {
    const tail = playSheath();
    setTimeout(startMusic, tail * 1000);
  }).catch(() => {});
}

function getNoiseBuffer(c) {
  if (!noiseBuffer) {
    const len = Math.floor(c.sampleRate * 0.4);
    noiseBuffer = c.createBuffer(1, len, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

/* blade-sheathing stinger for a phase banner. Both sides use the bright
   variant for now — the deep one (lower filter/partial frequencies, longer
   decay) didn't sound good; kept as a toggle to revisit later. Returns the
   sound's tail length in seconds so callers (see unlockAudio) can chain
   something after it finishes instead of guessing a delay. */
export function playSheath() {
  if (!ctx) return 0; // not unlocked yet — skip rather than queue for later
  const c = ctx;
  const deep = false;
  const now = c.currentTime;
  const dur = deep ? 0.5 : 0.38;

  const noise = c.createBufferSource();
  noise.buffer = getNoiseBuffer(c);
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 1.1;
  bp.frequency.setValueAtTime(deep ? 2000 : 4200, now);
  bp.frequency.exponentialRampToValueAtTime(deep ? 450 : 1100, now + dur);
  const noiseGain = c.createGain();
  noiseGain.gain.setValueAtTime(0.0001, now);
  noiseGain.gain.exponentialRampToValueAtTime(deep ? 0.5 : 0.4, now + 0.012);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  noise.connect(bp).connect(noiseGain).connect(sfxGain);
  noise.start(now);
  noise.stop(now + dur + 0.05);

  const freqs = deep ? [720, 1080, 1520] : [2500, 3300, 4700];
  const ringDur = deep ? 0.65 : 0.32;
  freqs.forEach((f, i) => {
    const osc = c.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = f;
    const g = c.createGain();
    const peak = (deep ? 0.16 : 0.11) / (i + 1);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + ringDur);
    osc.connect(g).connect(sfxGain);
    osc.start(now);
    osc.stop(now + ringDur + 0.05);
  });

  return Math.max(dur, ringDur) + 0.05;
}

if (typeof window !== "undefined") {
  const arm = () => {
    unlockAudio();
    window.removeEventListener("pointerdown", arm);
    window.removeEventListener("keydown", arm);
  };
  window.addEventListener("pointerdown", arm);
  window.addEventListener("keydown", arm);
}
