/* SECTION: audio engine — score playback, combat/UI SFX, and phase stingers.
   Lives in view/, not core/: it's presentation, same as scene.js's
   walkPath/lunge/flash. core/game.js never imports this.

   Music: prelude.mp3 plays start-to-finish once (0:00-4:51), then loops
   the 2:39-4:51 section forever. That's native AudioBufferSourceNode
   behavior — loop=true with loopStart/loopEnd only kicks in once playback
   first reaches loopEnd, so a start offset before loopStart plays through
   as an intro exactly once. Needs Web Audio (not <audio loop>) because
   <audio>'s loop points aren't sample-accurate and would click at the seam.

   SFX: the synthesized "sheath" stinger (filtered noise "shing" + a few
   inharmonic metallic partials) now plays on unit selection, not phase
   banners — those use the sourced Next Turn.wav instead (see scene.js's
   select() and its "banner" event case). The rest of the combat SFX
   (crit/miss/no-damage/death/final-hit/level-up/heal, plus four
   interchangeable plain-attack-hit takes, all in public/audio/) are
   sourced assets, decoded once and cached in sfxBuffers. */

import { PHASE_BANNER_MS } from "../ui/theme.js";

const MUSIC_URL = "/audio/prelude.mp3";
const LOOP_START = 159; // 2:39
const LOOP_END = 291; // 4:51
const MUSIC_VOLUME = 0.5;
const SFX_VOLUME = 0.7;

const SFX_FILES = {
  critHit: "/audio/Critical Hit 1.wav",
  noDamage: "/audio/No Damage.wav",
  nextTurn: "/audio/Next Turn.wav",
  miss: "/audio/Attack Miss 1.wav",
  death: "/audio/Death.wav",
  finalHit: "/audio/Final Hit.wav",
  levelUp: "/audio/Level Up.wav",
  attackHit1: "/audio/Attack Hit 1.wav",
  attackHit2: "/audio/Attack Hit 2.wav",
  attackHit3: "/audio/Attack Hit 3.wav",
  attackHit4: "/audio/Attack Hit 4.wav",
  heal: "/audio/Heal.wav",
};

// four interchangeable takes for a plain (non-crit) landed hit — picked at
// random each strike so normal attacks don't sound identical every time.
const ATTACK_HIT_NAMES = ["attackHit1", "attackHit2", "attackHit3", "attackHit4"];

let ctx = null;
let musicGain = null;
let sfxGain = null;
let musicBuffer = null;
let musicStarted = false;
let noiseBuffer = null;
const sfxBuffers = {};
let sfxReady = null;

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

function loadSfx(c) {
  if (!sfxReady) {
    sfxReady = Promise.all(
      Object.entries(SFX_FILES).map(async ([name, url]) => {
        const res = await fetch(url);
        const bytes = await res.arrayBuffer();
        sfxBuffers[name] = await c.decodeAudioData(bytes);
      })
    );
  }
  return sfxReady;
}

function playSfx(name) {
  const buf = sfxBuffers[name];
  if (!ctx || !buf) return; // not unlocked, or still decoding — skip rather than queue
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(sfxGain);
  src.start(0);
}

export const playCritHit = () => playSfx("critHit");
export const playNoDamage = () => playSfx("noDamage");
export const playNextTurn = () => playSfx("nextTurn");
export const playMiss = () => playSfx("miss");
export const playDeath = () => playSfx("death");
export const playFinalHit = () => playSfx("finalHit");
export const playLevelUp = () => playSfx("levelUp");
export const playHeal = () => playSfx("heal");
export const playAttackHit = () =>
  playSfx(ATTACK_HIT_NAMES[Math.floor(Math.random() * ATTACK_HIT_NAMES.length)]);

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

/* browsers won't run audio before a user gesture — called directly from the
   title card's Begin button (App.jsx), the page's first and only click
   before that point, so this always runs inside a real user gesture. That
   same click also sets the first "Player Phase" banner, so the Next Turn
   stinger here is timed to land right as it appears (sfxReady is awaited
   first since decoding is async, but these are small local files so the
   wait is negligible). Music starts once the banner's own on-screen
   lifetime (PHASE_BANNER_MS, see ui/theme.js) has fully played out, not
   just once the sting's own short tail has decayed — otherwise music would
   start while the banner is still animating. */
export function unlockAudio() {
  const c = getContext();
  const ready = loadSfx(c);
  c.resume().then(async () => {
    await ready;
    playNextTurn();
    setTimeout(startMusic, PHASE_BANNER_MS);
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

/* blade-sheathing stinger, played when a player unit is selected (see
   scene.js's select()). Bright variant only for now — the deep one (lower
   filter/partial frequencies, longer decay) didn't sound good; kept as a
   toggle to revisit later. Returns the sound's own tail length in seconds,
   unused by any current caller but kept for one that wants to chain off
   the sound itself rather than a fixed timeout. */
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
