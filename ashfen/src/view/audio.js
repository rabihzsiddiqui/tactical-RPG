/* SECTION: audio engine — score playback, combat/UI SFX, and phase stingers.
   Lives in view/, not core/: it's presentation, same as scene.js's
   walkPath/lunge/flash. core/game.js never imports this.

   Music: two selectable tracks (MUSIC_TRACKS), switched from the pause
   menu. prelude.mp3 plays start-to-finish once (0:00-4:51), then loops the
   2:39-4:51 section forever — that's native AudioBufferSourceNode behavior,
   loop=true with loopStart/loopEnd only kicks in once playback first
   reaches loopEnd, so a start offset before loopStart plays through as an
   intro exactly once. conquest.mp3 has no intro: loopStart 0/loopEnd 122
   means the whole 0:00-2:02 clip repeats from the first frame, via the
   same mechanism. Needs Web Audio (not <audio loop>) because <audio>'s
   loop points aren't sample-accurate and would click at the seam. Music
   stops outright on the "end" event (win or lose — see stopMusic and
   scene.js's playEvents) and restartAudio puts it back at the exact state
   unlockAudio starts it in (track forced back to prelude, stinger, then
   the same delayed start), so a restarted run sounds like a fresh one.

   SFX: unit selection plays a sourced stinger (unit.wav), not the earlier
   synthesized "sheath" sound (filtered noise "shing" + inharmonic metallic
   partials) it replaced. Picking an action-menu entry (Attack/Heal/
   Vulnerary/Wait) plays select.wav; backing out of it (the action menu's
   Back and the forecast's Back, both routed through scene.js's
   backToMove) plays back.wav. Phase banners use their own sourced
   stingers, one per banner text (playerphase/enemyphase.wav; a Defeat
   banner has no dedicated asset yet and falls back to Next Turn.wav).
   Victory/Defeat no longer get a banner event at all — see game.js's
   checkEnd — so their sound plays from the "end" event instead (see
   scene.js's playEvents). The rest of the combat SFX (crit/miss/no-damage/
   death/final-hit/level-up/heal, plus four interchangeable plain-attack-hit
   takes) are all sourced assets in public/audio/, decoded once and cached
   in sfxBuffers. */

import { PHASE_BANNER_MS } from "../ui/theme.js";

const MUSIC_TRACKS = {
  prelude: { url: "/audio/prelude.mp3", loopStart: 159, loopEnd: 291 }, // 2:39-4:51
  conquest: { url: "/audio/conquest.mp3", loopStart: 0, loopEnd: 122 }, // 0:00-2:02
};
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
  playerPhase: "/audio/playerphase.wav",
  enemyPhase: "/audio/enemyphase.wav",
  victory: "/audio/victory.wav",
  unitSelect: "/audio/unit.wav",
  actionSelect: "/audio/select.wav",
  back: "/audio/back.wav",
};

// four interchangeable takes for a plain (non-crit) landed hit — picked at
// random each strike so normal attacks don't sound identical every time.
const ATTACK_HIT_NAMES = ["attackHit1", "attackHit2", "attackHit3", "attackHit4"];

let ctx = null;
let musicGain = null;
let sfxGain = null;
const sfxBuffers = {};
let sfxReady = null;
const musicBuffers = {}; // keyed by MUSIC_TRACKS name
let musicSource = null; // the currently-playing BufferSourceNode, if any
let musicTrack = "prelude";
let musicEnabled = true;
let musicStarted = false; // true once unlockAudio's post-banner start has fired

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

// gain defaults to 1 (the shared sfxGain level); pass a multiplier to trim
// one sound's volume without touching every other SFX on the same bus.
function playSfx(name, gain = 1) {
  const buf = sfxBuffers[name];
  if (!ctx || !buf) return; // not unlocked, or still decoding — skip rather than queue
  const src = ctx.createBufferSource();
  src.buffer = buf;
  if (gain === 1) {
    src.connect(sfxGain);
  } else {
    const trim = ctx.createGain();
    trim.gain.value = gain;
    src.connect(trim).connect(sfxGain);
  }
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
export const playPlayerPhase = () => playSfx("playerPhase");
export const playEnemyPhase = () => playSfx("enemyPhase");
export const playVictory = () => playSfx("victory", 0.9); // 10% quieter than the shared sfx level
export const playUnitSelect = () => playSfx("unitSelect");
export const playActionSelect = () => playSfx("actionSelect");
export const playBack = () => playSfx("back");

async function loadMusicBuffer(c, name) {
  if (!musicBuffers[name]) {
    const res = await fetch(MUSIC_TRACKS[name].url);
    const bytes = await res.arrayBuffer();
    musicBuffers[name] = await c.decodeAudioData(bytes);
  }
  return musicBuffers[name];
}

function stopMusicSource() {
  if (musicSource) {
    try { musicSource.stop(); } catch { /* already stopped */ }
    musicSource = null;
  }
}

/* (re)starts playback of the current track from its own beginning. Safe to
   call whenever the selected track or the on/off toggle changes — it always
   tears down whatever was playing first, so there's never two tracks
   overlapping. No-ops if music is toggled off; the pause menu's "on" click
   calls this again to actually start it. musicPlayToken guards against two
   overlapping calls (e.g. a quick track switch before the first track's
   fetch/decode resolves) racing to decide which one actually starts. */
let musicPlayToken = 0;
async function playCurrentTrack() {
  if (!musicEnabled) return;
  const token = ++musicPlayToken;
  const c = getContext();
  const track = musicTrack;
  const buf = await loadMusicBuffer(c, track);
  if (token !== musicPlayToken || !musicEnabled) return;
  stopMusicSource();
  const { loopStart, loopEnd } = MUSIC_TRACKS[track];
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.loopStart = loopStart;
  src.loopEnd = loopEnd;
  src.connect(musicGain);
  src.start(0, 0);
  musicSource = src;
}

/* pause menu calls — safe before unlockAudio's delayed first start has
   fired: they just record the preference, and playCurrentTrack (invoked
   from that delayed start) reads musicEnabled/musicTrack when it runs. */
export function setMusicEnabled(on) {
  musicEnabled = on;
  if (!musicStarted) return;
  if (on) playCurrentTrack();
  else { musicPlayToken++; stopMusicSource(); }
}

export function setMusicTrack(name) {
  if (!MUSIC_TRACKS[name] || name === musicTrack) return;
  musicTrack = name;
  if (musicStarted && musicEnabled) playCurrentTrack();
}

/* called on the win/lose "end" event (see scene.js's playEvents) — stops
   playback outright without touching musicEnabled, so a still-muted
   preference isn't silently flipped back on by this. */
export function stopMusic() {
  musicPlayToken++;
  stopMusicSource();
}

/* browsers won't run audio before a user gesture — called directly from the
   title card's Begin button (App.jsx), the page's first and only click
   before that point, so this always runs inside a real user gesture. That
   same click also sets the first "Player Phase" banner, so the stinger
   here is timed to land right as it appears (sfxReady is awaited first
   since decoding is async, but these are small local files so the wait is
   negligible). Music starts once the banner's own on-screen lifetime
   (PHASE_BANNER_MS, see ui/theme.js) has fully played out, not just once
   the sting's own short tail has decayed — otherwise music would start
   while the banner is still animating. */
export function unlockAudio() {
  const c = getContext();
  const ready = loadSfx(c);
  c.resume().then(async () => {
    await ready;
    playPlayerPhase();
    setTimeout(() => { musicStarted = true; playCurrentTrack(); }, PHASE_BANNER_MS);
  }).catch(() => {});
}

/* Restart's audio counterpart — App.jsx calls this alongside remaking the
   game state. The audio context is already unlocked and sfx already
   loaded by the time Restart is reachable (it only appears once the game
   has ended), so this skips straight to unlockAudio's tail: force the
   track back to prelude (the actual "beginning", regardless of whatever
   was selected mid-run) and replay the same stinger-then-music sequence
   as the very first game start. musicEnabled is left as the player set
   it — restarting the run isn't the same as un-muting it. */
export function restartAudio() {
  musicTrack = "prelude";
  playPlayerPhase();
  setTimeout(() => { musicStarted = true; playCurrentTrack(); }, PHASE_BANNER_MS);
}
