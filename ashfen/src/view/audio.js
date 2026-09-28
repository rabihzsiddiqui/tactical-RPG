/* SECTION: audio engine: score playback, combat/UI SFX, and phase stingers.
   Lives in view/, not core/: it's presentation, same as scene.js's
   walkPath/lunge/flash. core/game.js never imports this.

   Music: three selectable tracks (MUSIC_TRACKS), cycled from the pause
   menu, raven first and by default. raven.mp3 plays 0:00-3:15 once, then
   loops 0:09-3:15. The file is cut to end at 3:15 exactly, so it decodes
   no more than it plays. prelude.mp3 plays start-to-finish once (0:00-4:51), then loops the
   2:39-4:51 section forever. That is native AudioBufferSourceNode behavior:
   loop=true with loopStart/loopEnd only kicks in once playback first
   reaches loopEnd, so a start offset before loopStart plays through as an
   intro exactly once. conquest.mp3 has no intro: loopStart 0/loopEnd 122
   means the whole 0:00-2:02 clip repeats from the first frame, via the
   same mechanism. Needs Web Audio (not <audio loop>) because <audio>'s
   loop points aren't sample-accurate and would click at the seam. Music
   stops outright on the "end" event (win or lose; see stopMusic and
   scene.js's playEvents) and restartAudio puts it back at the exact state
   unlockAudio starts it in (track forced back to the default, music and
   stinger together, the music fading in), so a restarted run sounds like a
   fresh one.

   SFX: unit selection plays a sourced stinger (unit.wav), not the earlier
   synthesized "sheath" sound (filtered noise "shing" + inharmonic metallic
   partials) it replaced. select.wav plays on every player-committed
   choice: picking a move-destination tile (commitMove) or clicking an
   enemy/ally directly to skip past it (the engageAttack/engageHeal
   click-to-engage bypass), picking an action-menu entry (Attack/Heal/
   Vulnerary/Wait), picking the target after Attack or Heal, confirming an
   attack from the forecast, and End Turn.
   Backing out of the action menu or the forecast (both routed through
   scene.js's backToMove) plays back.wav instead. Phase banners use their
   own sourced stingers, one per banner text (playerphase/enemyphase.wav;
   a Defeat banner has no stinger of its own; the loss itself is voiced by
   defeat.wav off the "end" event, below).
   Victory/Defeat no longer get a banner event at all (see game.js's
   checkEnd), so their sound plays from the "end" event instead (see
   scene.js's playEvents). The field manual has its own pair: HelpPage.wav
   when the overlay opens (App.jsx's openHelp, the single funnel every
   entry point goes through) and Help.wav for the smaller moves inside it,
   switching tabs and closing. ThreatCheck.wav plays on the Show/Hide threat
   toggle, fired from scene.js's toggleDanger so both buttons that reach it
   sound the same. Opening the manual from the title card is
   silent, since that click comes before unlockAudio and playSfx no-ops
   until the context exists. The rest of the combat SFX (crit/miss/no-damage/
   death/final-hit/level-up/heal, plus four interchangeable plain-attack-hit
   takes) are all sourced assets in public/audio/, decoded once and cached
   in sfxBuffers.

   Levels: music and SFX run through two gain buses, and the pause menu's
   sliders move them (setMusicVolume/setSfxVolume). The music on/off toggle
   is separate and stops the source outright, so muting is not the same as
   dragging the music slider to zero. Neither the levels nor the toggle are
   persisted between sessions yet. */

import { clamp } from "../core/util.js";

const MUSIC_TRACKS = {
  raven: { url: "/audio/raven.mp3", loopStart: 9, loopEnd: 195 }, // 0:09-3:15
  prelude: { url: "/audio/prelude.mp3", loopStart: 159, loopEnd: 291 }, // 2:39-4:51
  conquest: { url: "/audio/conquest.mp3", loopStart: 0, loopEnd: 122 }, // 0:00-2:02
};
// the pause menu's Track option cycles these in order. The key doubles as
// its label there, uppercased by the menu's own styling.
export const MUSIC_TRACK_NAMES = Object.keys(MUSIC_TRACKS);
// the track a fresh session and every restart begin on
export const DEFAULT_MUSIC_TRACK = "raven";
// seconds the music takes to rise from silence when a run starts, so raven's
// first hit (about 0.45s in) doesn't land at full level on the Begin click
const MUSIC_FADE_IN_S = 2;
/* where the pause menu's two sliders start. They are the defaults, not the
   current level: musicVolume/sfxVolume below hold that, and the sliders
   move them. Music starts at 0.3, set for raven, the default track. */
export const DEFAULT_MUSIC_VOLUME = 0.3;
export const DEFAULT_SFX_VOLUME = 0.7;

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
  helpOpen: "/audio/HelpPage.wav",
  help: "/audio/Help.wav",
  threatCheck: "/audio/ThreatCheck.wav",
  menu: "/audio/Menu.wav",
  drag: "/audio/Drag.wav",
  zoomIn: "/audio/zoomin.wav",
  defeat: "/audio/defeat.wav",
};

// four interchangeable takes for a plain (non-crit) landed hit, picked at
// random each strike so normal attacks don't sound identical every time.
const ATTACK_HIT_NAMES = ["attackHit1", "attackHit2", "attackHit3", "attackHit4"];

let ctx = null;
let musicGain = null;
let sfxGain = null;
const sfxBuffers = {};
let sfxReady = null;
const musicBuffers = {}; // keyed by MUSIC_TRACKS name, each a decode promise
let musicSource = null; // the currently-playing BufferSourceNode, if any
let musicTrack = DEFAULT_MUSIC_TRACK;
let musicVolume = DEFAULT_MUSIC_VOLUME;
let sfxVolume = DEFAULT_SFX_VOLUME;
let musicEnabled = true;
let musicStarted = false; // true once unlockAudio has started the first track
/* sits between the music source and musicGain. Only the fade-in moves it,
   so a fade never fights the slider, which moves musicGain. */
let musicFade = null;

function getContext() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    musicGain = ctx.createGain();
    musicGain.gain.value = musicVolume;
    musicGain.connect(ctx.destination);
    musicFade = ctx.createGain();
    musicFade.connect(musicGain);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = sfxVolume;
    sfxGain.connect(ctx.destination);
  }
  return ctx;
}

function loadSfx(c) {
  if (!sfxReady) {
    sfxReady = Promise.all(
      Object.entries(SFX_FILES).map(async ([name, url]) => {
        /* per-file catch on purpose. These share one Promise.all, so without
           it a single missing or undecodable asset rejects the lot: every
           SFX goes quiet and unlockAudio never reaches its music start,
           because it awaits this before playing anything. Swallowing the
           failure costs one sound instead of all of them, and playSfx
           already no-ops on a buffer that is not there. */
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(res.status + " for " + url);
          const bytes = await res.arrayBuffer();
          sfxBuffers[name] = await c.decodeAudioData(bytes);
        } catch (err) {
          console.warn("sfx failed to load:", name, err);
        }
      })
    );
  }
  return sfxReady;
}

// gain defaults to 1 (the shared sfxGain level); pass a multiplier to trim
// one sound's volume without touching every other SFX on the same bus.
function playSfx(name, gain = 1) {
  const buf = sfxBuffers[name];
  if (!ctx || !buf) return; // not unlocked, or still decoding: skip rather than queue
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
export const playHelpOpen = () => playSfx("helpOpen");
export const playHelp = () => playSfx("help");
export const playThreatCheck = () => playSfx("threatCheck");
export const playMenu = () => playSfx("menu");
export const playDrag = () => playSfx("drag");
export const playZoomIn = () => playSfx("zoomIn");
export const playDefeat = () => playSfx("defeat");

/* the pause menu's volume sliders, both taking 0 to 1. Safe to call before
   the audio context exists: the level is remembered here and getContext
   applies it when it builds the two buses. Dragging a slider fires these
   on every pointer move, so the change is ramped over ~15ms instead of
   assigned outright, which would step the gain and click. */
function rampGain(node, v) {
  if (node) node.gain.setTargetAtTime(v, ctx.currentTime, 0.015);
}
export function setMusicVolume(v) {
  musicVolume = clamp(v, 0, 1);
  rampGain(musicGain, musicVolume);
}
export function setSfxVolume(v) {
  sfxVolume = clamp(v, 0, 1);
  rampGain(sfxGain, sfxVolume);
}

/* caches the promise, not the decoded buffer, so a Begin click landing
   while preloadAudio's decode is still running waits on that decode
   instead of starting a second one. A failed load is dropped from the
   cache so the next play can retry it. */
function loadMusicBuffer(c, name) {
  if (!musicBuffers[name]) {
    musicBuffers[name] = fetch(MUSIC_TRACKS[name].url)
      .then((res) => res.arrayBuffer())
      .then((bytes) => c.decodeAudioData(bytes))
      .catch((err) => { delete musicBuffers[name]; throw err; });
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
   call whenever the selected track or the on/off toggle changes, since it
   always tears down whatever was playing first, so there's never two tracks
   overlapping. No-ops if music is toggled off; the pause menu's "on" click
   calls this again to actually start it. musicPlayToken guards against two
   overlapping calls (e.g. a quick track switch before the first track's
   fetch/decode resolves) racing to decide which one actually starts.
   fadeIn is in seconds; 0 starts at full level, which is what a track
   switch or the music toggle wants. */
let musicPlayToken = 0;
async function playCurrentTrack(fadeIn = 0) {
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
  src.connect(musicFade);
  const now = c.currentTime;
  musicFade.gain.cancelScheduledValues(now);
  musicFade.gain.setValueAtTime(fadeIn > 0 ? 0 : 1, now);
  if (fadeIn > 0) musicFade.gain.linearRampToValueAtTime(1, now + fadeIn);
  src.start(now, 0);
  musicSource = src;
}

/* pause menu calls, safe before unlockAudio's first start has fired:
   they just record the preference, and playCurrentTrack (invoked from
   that start) reads musicEnabled/musicTrack when it runs. */
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

/* called on the win/lose "end" event (see scene.js's playEvents). Stops
   playback outright without touching musicEnabled, so a still-muted
   preference isn't silently flipped back on by this. */
export function stopMusic() {
  musicPlayToken++;
  stopMusicSource();
}

/* called once while the title card is up (App.jsx), so the default track
   and the SFX are fetched and decoded before Begin is pressed. Decoding
   needs a context, and a context made outside a user gesture starts
   suspended, which is fine: nothing plays until unlockAudio resumes it.
   Without this, the music's start would wait on decoding a multi-minute
   mp3 after the click. */
export function preloadAudio() {
  const c = getContext();
  loadSfx(c);
  loadMusicBuffer(c, musicTrack).catch(() => {});
}

/* browsers won't run audio before a user gesture, so this is called from
   the title card's Begin button (App.jsx), the page's first and only click
   before that point, so this always runs inside a real user gesture. That
   same click also sets the first "Player Phase" banner, so the stinger
   here is timed to land right as it appears (sfxReady is awaited first
   since decoding is async, but these are small local files so the wait is
   negligible). Music starts on the click too, not after the banner, and
   fades in over MUSIC_FADE_IN_S so the sting sits on top of it. It no
   longer waits on the SFX, so a slow SFX decode can't hold it back. */
export function unlockAudio() {
  const c = getContext();
  const ready = loadSfx(c);
  c.resume().then(async () => {
    musicStarted = true;
    playCurrentTrack(MUSIC_FADE_IN_S);
    await ready;
    playPlayerPhase();
  }).catch(() => {});
}

/* Restart's audio counterpart. App.jsx calls this alongside remaking the
   game state. The audio context is already unlocked and sfx already
   loaded by the time Restart is reachable (it only appears once the game
   has ended), so this skips straight to unlockAudio's tail: force the
   track back to the default (the actual "beginning", regardless of whatever
   was selected mid-run) and replay the same faded music and stinger as
   the very first game start. musicEnabled is left as the player set
   it, since restarting the run isn't the same as un-muting it. */
export function restartAudio() {
  musicTrack = DEFAULT_MUSIC_TRACK;
  musicStarted = true;
  playCurrentTrack(MUSIC_FADE_IN_S);
  playPlayerPhase();
}
