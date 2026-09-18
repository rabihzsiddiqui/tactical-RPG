# Combat Cinematic Plan

Session plan for adding a modern-Fire-Emblem style attack cut-in to Ashfen Pass.
Written to be read by Claude Code at the start of each session.

**Target:** camera rushes in on a committed attack, frames both units where they
actually stand, plays a weighted attack beat with class-appropriate motion and
effects, then returns to the grid.

**Budget:** one day. Sessions are ordered by payoff. If the day runs out, stop
after whichever session is finished. Every session ends on a working build.

---

## Ground rules

These hold for every session in this plan.

- `src/core` imports nothing from Three.js. No exceptions. All work here lives
  in `src/view` and `src/ui`.
- `src/core/game.js` already emits everything needed. Do not add event types
  unless a session below says so explicitly.
- `animUnit()` in `scene.js` reaches into `u.view.parts` by name. Any change to
  `buildUnitMesh` must keep those names intact or update `animUnit` in the same
  commit.
- `npm test` stays green. Nothing in this plan touches combat or turn rules, so
  a red test means something went wrong.
- Commit at the end of each session. Do not start the next one on an uncommitted
  tree.
- Learning Mode: explain the reasoning behind structural choices as you go,
  especially camera framing math and anything touching the render loop.

---

## Existing surface worth knowing

Read these before starting. They already do most of what the plan builds on.

| Thing | Where | Notes |
| --- | --- | --- |
| `playEvents(events)` | `src/view/scene.js` | Sequences every event type against the live scene |
| `lunge(src, tgt)` | `src/view/scene.js` | Current attack motion, 120ms out / 180ms back |
| `flash(u, crit)` | `src/view/scene.js` | Hit feedback, already crit-aware |
| `floater(u, text, color)` | `src/view/scene.js` | Damage numbers, projects through `project()` |
| `die(u)` | `src/view/scene.js` | Death animation |
| `tween(ms, cb)` | `src/view/scene.js` | The only animation primitive in use |
| `camera` | `src/view/scene.js` | `PerspectiveCamera(30, 1.6, 0.5, 120)`, `camRef`/`setCam` from props |
| `strike` event | `src/core/game.js` | `{ srcId, tgtId, hit, crit, dmg, hpAfter }` |
| `WEAPONS[k].type` | `src/core/data.js` | `sword`, `lance`, `axe`, `bow`, `anima`, `staff` |
| Shaders | `src/view/shaders.js` | Five already written, all hand-rolled GLSL |

---

## Session 1: camera director and the attack beat

The core of the whole thing. Everything after this is refinement.

**New file:** `src/view/camera.js`

Export a director object with:

- `save()` stores current camera position, target and fov
- `flyIn(attacker, defender, opts)` frames both units
- `flyOut()` returns to the saved state
- `shake(intensity, ms)` additive offset, does not fight the fly
- `enabled` flag, read from a setting

**Framing math.** Take the midpoint between the two units. Offset the camera
perpendicular to the attack axis so both are in frame and neither occludes the
other. Drop the camera height toward eye level and widen fov from 30 to
somewhere around 45 to 55 so it reads as a rush rather than a zoom. Ease in
fast, ease out slower.

**The grouping problem, read this before wiring anything.**

An exchange produces several `strike` events in a row: the attack, the counter,
and a double if speed allows. `playEvents` receives them as a flat list. Flying
in and out per strike would be unwatchable.

So scan ahead in the event list for the contiguous run of `strike` events, fly
in once before the run, hold through all of it, fly out once after. Death and
levelUp events that follow the run stay inside the cut-in so a kill lands on
camera.

**Also in this session:** a cinematics toggle in the pause menu, defaulting on.
Off skips straight to event resolution with the current behaviour. You will want
this within ten minutes of testing, and it is the right accessibility call
anyway.

**Extract `tween` out of `scene.js`** into `src/view/anim.js` so `camera.js` can
use it without importing the scene. Small move, do it first.

**Stop when:** an attack flies in, holds through the full exchange including a
counter, and returns cleanly. Do not tune the framing past "clearly working."
Come back to it at the end if there is time.

---

## Session 2: per-class attack behaviour

Not polish. The camera will expose this as a bug.

`ironBow` is range 2 to 2. `fire` is range 1 to 2. The current `lunge()` offsets
the attacker toward the target regardless of weapon. Invisible at grid distance,
obviously wrong once the camera is close.

**New file:** `src/view/attacks.js`

A table keyed by `WEAPONS[k].type`, each entry describing the beat:

- `sword` lunge, short windup, fast step, quick recover
- `lance` lunge, straight thrust, longer reach, less lateral movement
- `axe` lunge, long windup, heavy step, slow recover, biggest shake
- `bow` no lunge. Draw pose, hold, release, arrow travels to target, camera
  tracks the arrow
- `anima` no lunge. Cast pose, projectile forms at the caster, travels, bursts
- `staff` no lunge, no shake. Caster raises the staff, target glows upward

Absorb the existing `lunge()` into this table as the melee case rather than
leaving two paths.

The arrow and the projectile need a mesh each. Keep them simple, a stretched box
and an octahedron respectively, in the style already in `meshes.js`.

**Stop when:** every one of the six weapon types plays a beat that looks
deliberate from the cut-in camera.

---

## Session 3: effects and impact

This is where the cut-in earns its keep.

**Hit-stop.** On connect, freeze the whole scene for 60 to 80ms before the
recoil starts. Single highest-value change in this session and roughly ten lines.
Crit gets 120ms.

**Screen shake.** Scale by weapon `mt`. Axe shakes hard, sword moderately, staff
not at all. Use the director's `shake` so it composes with the fly.

**Weapon trail.** A ribbon following the weapon through the swing arc, fading
over about 200ms. New shader in `shaders.js`, `TRAIL_FRAG`, alpha falling off
along the trail length.

**Impact burst.** A short-lived quad at the contact point. New `IMPACT_FRAG`.
Colour by weapon type so fire reads orange and physical reads white.

**Per-type effect assignment:**

- Physical: white spark, trail matching the palette `blade` colour
- `anima`: fire projectile, orange burst, brief light flare on the target
- `staff`: soft green upward motes, no burst, no shake

**Crit treatment.** Crit already reaches `flash(u, true)`. Give it the full
stack: longer hold, harder shake, brighter trail, a held beat before the camera
releases.

**Stop when:** a crit from Doran's axe feels different from a miss from Nessa's
bow without reading the HUD.

---

## Session 4: materials

Cheap, and worth more than remodelling.

Every part is `MeshLambertMaterial`, which has no specular. Up close a blade
reads as grey cardboard.

- Switch `blade`, `helm`, `trim`, `plume` to `MeshStandardMaterial` with
  metalness around 0.7 and roughness around 0.35
- Leave cloth parts on Lambert. Cheaper and it is the correct look
- Add a key light that fades in during the cut-in and out on release, so the
  weapon catches something during the swing
- Bump `faceTexture` resolution. It is fine at grid distance and will not be
  at close range

**Watch out.** `POST_FRAG` does `floor(c * uLevels + 0.5) / uLevels`. That
posterises the frame, which will band the new specular highlights. Either raise
`uLevels` during the cut-in or accept the banding as stylised. Decide
deliberately rather than discovering it.

**Stop when:** a sword catches the light through its swing arc.

---

## Session 5: class silhouettes

Last for a reason. Worst payoff per hour under a close camera, and no natural
stopping point.

Right now `buildUnitMesh(palKey, weaponKey)` varies colour and held weapon. The
body is identical for every unit. Bram at 11 Def and 4 Spd has the same torso,
cape and helm as Nessa at 4 Def and 10 Spd.

**New table in `src/core/data.js`,** next to `PALS`, keyed by class:

```
SILHOUETTES = {
  Lord:      { bulk: 1.0, helm: 'circlet', pauldrons: false, cape: true,  ... },
  Knight:    { bulk: 1.3, helm: 'full',    pauldrons: true,  cape: false, ... },
  Fighter:   { bulk: 1.2, helm: 'none',    pauldrons: true,  cape: false, ... },
  Archer:    { bulk: 0.9, helm: 'hood',    pauldrons: false, quiver: true, ... },
  Mage:      { bulk: 0.9, helm: 'hood',    robe: true,       cape: true,  ... },
  Cleric:    { bulk: 0.9, helm: 'none',    robe: true,       ... },
  ...
}
```

Then `buildUnitMesh(palKey, weaponKey, clsKey)` reads it. Update call sites.

This is a pure data table, which is the good kind of problem. It is also the one
place in this plan where the first pass will look wrong and need eyes on it.
Expect two or three rounds of "shoulders too wide, hood too far forward."

Enemy classes without a silhouette entry fall back to the current body.

**Stop when:** you can tell a Knight from an Archer in silhouette at cut-in
distance.

---

## Performance budget

The cut-in runs on mobile. Check after session 3 and again after session 4.

- No new draw calls in the per-frame path when cinematics are off
- Trail and burst meshes pooled, not allocated per strike
- The extra key light is added on fly-in and removed on fly-out, not left in
  the scene

---

## Not in this plan, but on the list

Noted so they do not get lost, and deliberately out of scope for the day.

- `public/audio` is uncompressed `.wav` and is most of the repo weight. You
  wrote compResso and audoRa. Twenty minute job.
- Several audio filenames look lifted. Worth resolving before this goes on the
  portfolio.
- `ashfen-pass.jsx` at repo root is the old single-file prototype, 69KB, no
  longer referenced.
- Deploy is on `tactical-rpg-rust.vercel.app`, the auto-generated suffix.
- Second level. `map.js` already isolates `LEVEL_NAME` next to the map.

---

## Session handoff template

Append one of these at the end of every session.

```
## Session N handoff: <title>
Date:
Session goal:
Completed:
  -
Not completed, and why:
  -
Files touched:
  -
Decisions made and the reasoning:
  -
Known issues introduced:
  -
Next session starts with:
```

---

## Session 1 handoff: camera director and the attack beat
Date: 2026-09-18
Session goal: fly the camera in on a committed attack, hold through the whole exchange, return to the grid. Cinematics toggle in the pause menu.
Completed:
  - `src/view/anim.js`: `tween` moved out of scene.js, plus `stepTweens(dtMs)`, `resetTweens()`, `easeOutCubic`, `easeInOutQuad`. The queue is module-level so camera.js can schedule tweens without importing the scene. scene.js still drives it from `frame()` and resets it on unmount.
  - `src/view/camera.js`: `createDirector({ isEnabled })` returning `{ save, flyIn, flyOut, shake, apply, enabled, active }`. `apply(camera, orbitPose)` is the hook the frame loop calls every tick. Idle: passes the orbit pose through. Active: lerps position, target and fov between the saved orbit pose and the cinematic pose by an eased 0..1 mix. Shake is a separate decaying tween that translates camera and target together, so it composes with a fly.
  - Framing: midpoint of the pair, camera pushed out perpendicular to the attack axis on whichever side the orbit camera already favours, distance 2.0 + 0.6 per tile of separation, look target 0.42 above the ground midpoint, elevation about 16 degrees, fov 50. Fly in 340ms ease-out, fly out 520ms ease-in-out.
  - `playEvents` groups a contiguous run of `strike` events plus any trailing `death` and `levelUp` for the same pair, flies in once before, out once after. The old switch is now `playEvent(e)`, unchanged inside.
  - Cinematics toggle in the pause menu Battle group, default on, persisted in localStorage under `tactical-rpg-cinematics`. Off skips the director entirely; every strike plays from the orbit camera as before.
  - Field manual's Menu entry mentions the toggle.
  - Verified headlessly: turn 1 enemy phase produced a hit-then-counter-miss exchange; frames show the fly-in, the hold through the counter, the blend out, and the orbit view restored. `npm test` 29 green, lint unchanged at 53 pre-existing warnings and 0 errors, `npm run build` clean.
Not completed, and why:
  - `shake` is implemented but nothing calls it yet. Session 3 owns screen shake by weapon might.
  - No framing tuning beyond "clearly working", per the plan. With the squad clustered on turn 1 a third unit often sits in the near corner of the frame.
Files touched:
  - `ashfen/src/view/anim.js` (new)
  - `ashfen/src/view/camera.js` (new)
  - `ashfen/src/view/scene.js`
  - `ashfen/src/ui/App.jsx`
  - `ashfen/src/ui/PauseMenu.jsx`
  - `ashfen/src/ui/HelpOverlay.jsx`
Decisions made and the reasoning:
  - The director does not own the camera outright. The frame loop still computes the orbit pose every tick and the director blends against it. Fly-in leaves from the pose saved at the first strike; fly-out returns toward the live orbit pose, so a Rotate 90 pressed mid-exchange lands without a pop when the director hands back.
  - The strike run is bounded by the unit pair, not just by event type. `runEnemyPhase` concatenates every enemy's events, so two enemies already adjacent to their targets would otherwise produce one cut-in that holds through the second exchange off camera.
  - `enabled` is a getter that reads the setting on every flyIn rather than a value captured at mount, so the toggle applies to the next attack without a remount.
  - Setting lives in the `cam` state next to `post` and `res` and is persisted, unlike the music toggles, because turning camera motion off is an accessibility choice that should survive relaunching the installed PWA.
Known issues introduced:
  - None found. Per-strike pacing (lunge 300ms, sleep 260 or 380) is unchanged, so an exchange is about 0.9s longer end to end from the two flies.
Next session starts with:
  - Session 2, `src/view/attacks.js`: absorb `lunge()` into a per-weapon-type beat table. The cut-in camera now makes the bow and tome lunge visibly wrong at range 2.
  - Headless check recipe: `npx vite --port 5199` in `ashfen/`, then a Playwright script using the npx-cached package with `executablePath` pointing at the cached `chromium_headless_shell` and args `--use-angle=swiftshader --enable-unsafe-swiftshader`. Set `tactical-rpg-onboarded=1` in localStorage, click Begin, then Menu and End turn. Turn 1's enemy phase already produces an exchange.

---

## Session 2 handoff: per-class attack behaviour
Date: 2026-09-18
Session goal: replace the one-size lunge with a beat per weapon type, so bows and tomes stop lunging at range 2 under the cut-in camera.
Completed:
  - `src/view/attacks.js`: `createAttackPlayer({ scene, director })` returning `play(src, tgt, { onImpact })`. A beat owns the attacker's limbs from windup to recovery and fires `onImpact` at the frame of contact; scene.js does flash, floater, sound and hp there. Beats are keyed by `WEAPONS[k].type`: sword, lance and axe share one melee routine with different keyframes and phase durations (axe: 200ms windup, 260ms recover; sword: 90/170; lance thrusts with the weapon rotated along the forearm). Bow draws, holds, looses an arrow that flies with a shallow arc. Anima forms a bolt in the casting hand, throws it, bursts it at the target. Staff raises, the target tints green and lifts a touch, then settles.
  - The old `lunge()` in scene.js is gone; melee is the table's first three entries, not a second path.
  - `meshes.js`: `buildArrow()` (box shaft, cone head, box fletching, +z forward) and `buildBolt()` (emissive octahedron, transparent for the burst fade). Built once by the attack player and reused, never allocated per strike.
  - `camera.js`: `director.track(vec3 | null)`. The look target leans 40% of the way toward a tracked point with a 90ms exponential lag, so the camera pans with the arrow or bolt and eases back when it lands. `apply(camera, orbit, dtMs)` now takes dt for that smoothing.
  - `scene.js`: `animUnit` has an `"attack"` state that leaves every part to attacks.js and only keeps position, offset and yaw current. The `strike` case calls `faceToward` then `attacks.play`; per-strike trailing sleep dropped from 260/380 to 100/240 because the recovery now sits between impact and the next strike. Non-instant `heal` events play the staff beat and get their own one-event cut-in via `exchangeEnd`, so the sixth beat is seen from the same camera as the other five. Instant heals (vulnerary, terrain) are untouched.
  - Square-up: `play()` waits 150ms before the windup when the attacker still has more than about 30 degrees to turn, because a windup that starts mid-spin read as flailing on the first screenshots.
  - Verified headlessly with a throwaway harness page (not committed, recipe in memory) that mounts the scene with fake React refs and drives real canvas taps: sword vs lance counter, axe vs axe counter, bow at range 2, fire at range 2, staff heal. All six beats play, every unit ends with zero offset, weapon back at 1.5 and body twist 0. `npm test` 29 green, lint unchanged at the pre-existing warnings, `npm run build` clean.
Not completed, and why:
  - No hit reaction on the defender beyond the existing flash. Session 3 owns hit-stop, shake and impact effects.
  - The bow is held in the right hand with the same carry rotation as every other weapon, so the draw reads as "bow in front, string hand pulling" rather than a true side-on draw. Deliberate enough to pass the stop condition; a dedicated bow carry rotation is a five-minute tweak if it bothers you in play.
Files touched:
  - `ashfen/src/view/attacks.js` (new)
  - `ashfen/src/view/meshes.js`
  - `ashfen/src/view/camera.js`
  - `ashfen/src/view/scene.js`
  - `ashfen/CLAUDE.md` (local only, it is in `.git/info/exclude`)
Decisions made and the reasoning:
  - Beats are whole-pose keyframes, not deltas. animUnit overwrites the same rotation fields every frame in its other states, so an additive approach would fight it; absolute poses lerped from and to a NEUTRAL keyframe also guarantee a beat can never leave a limb somewhere odd.
  - `onImpact` is a callback into scene.js rather than the beat resolving at impact and scene.js running the recovery, so the beat stays one readable async sequence and scene.js keeps every bit of game feedback in one place.
  - `play()` restores whatever anim state the unit had before, so a player attacker still lands back in its ready pose after acting, exactly as before beats existed.
  - The heal cut-in is a grouping change in `exchangeEnd`, not a new event type, in keeping with the ground rules.
  - The staff beat tints from each material's `userData.baseEmissive` so k = 0 is exactly the resting look and nothing has to be remembered or restored.
Known issues introduced:
  - A half-turn square-up plus the longer beats makes an axe exchange about 0.4s longer than the lunge version. Feels right in the cut-in, may want trimming with cinematics off.
Next session starts with:
  - Session 3, effects and impact. `director.shake` still has no caller; the beat's `onImpact` is the natural place for hit-stop and shake, and `WEAPONS[k].mt` is already on `wep(src)`.
  - Headless recipe is in memory (`headless-verify-recipe`) with the harness page inline; it drives real taps via a reconstructed orbit camera and exposes `window.H`.

---

## Session 3 handoff: effects and impact
Date: 2026-09-18
Session goal: make a hit land. Hit-stop, screen shake by weapon might, a weapon trail, an impact burst per weapon type, staff motes, and the full stack on a crit.
Completed:
  - `src/view/anim.js`: `hitStop(ms)` holds animation time still. `stepTweens` drains the hold first and returns the animation time that actually elapsed; `frame()` feeds that to `animUnit` and the effects, so limbs, tweens, trail and burst all freeze together on the frame of contact. A shake or recoil queued at impact is a tween, so it waits out the freeze and starts when it lifts. 70ms on a hit, 120ms on a crit. Overlapping holds keep the longer one.
  - `src/view/effects.js` (new): `createEffects({ scene })` returning `{ trailBegin, trailEnd, burst, flare, motes, update }`. One trail ribbon (16 samples, indexed quads, world-space vertices rewritten per frame, `TRAIL_FRAG`), one billboarded burst quad (`IMPACT_FRAG`, random roll per burst), one point light for the fire flare, one `Points` cloud of 14 motes. All built once at mount and hidden when idle, so no draw calls outside a beat. `update(dtMs, camera)` runs after `animUnit` so the trail samples the weapon where it is drawn this frame.
  - `src/view/shaders.js`: `TRAIL_FRAG` (alpha squared along the length, `uLen` so the tail reaches zero however few frames the swing took, `uFade` after the swing, `uGain` for crits) and `IMPACT_FRAG` (six-point core that collapses and whitens, ring that expands, both fading with `uT`). Both additive, both reuse `TILE_VERT`.
  - `src/view/attacks.js`: `play(src, tgt, { hit, crit, onImpact })`. Melee beats record the trail from the grip to the tip through the strike phase only (per-weapon `trail` span in `MELEE`), colour from the palette's `blade`, pulled 60% toward gold and gain 1.7 on a crit. Physical hits burst white at the target's chest, fire bursts orange and flares the point light, staff starts motes as the staff comes up. Missed shots aim past the target's shoulder and the arrow or bolt carries on past under the recovery; a missed bolt fizzles instead of bursting.
  - `src/view/scene.js`: the strike handler calls `hitStop`, `director.shake(mt * 0.005, 120 + mt * 14)` (crit: 1.8x), and `nudge()` for a 0.12 tile recoil (crit 0.22) or a 0.16 tile lean away on a miss. Shake follows the cinematics toggle because it is camera motion; hit-stop and recoil play regardless. A crit anywhere in an exchange holds 280ms before the camera lets go. `animUnit` runs on frozen time; the camera keeps real time.
  - Verified headlessly (harness page plus a Playwright driver, both throwaway) for axe crit with counter, sword hit with counter, bow hit, bow miss, fire hit, fire miss and a staff heal. Added a `?slow` switch to the harness that steps the frame clock a fixed 16ms per render so the trail could be seen with a full set of samples. `npm test` 29 green, lint unchanged at 53 pre-existing warnings and 0 errors, `npm run build` clean.
Not completed, and why:
  - No sound changes. The crit and hit sounds already exist and land on the same frame as the effects.
  - Melee misses show the lean-away and the number only. A proper sidestep dodge would want a keyframe of its own on the defender, which is Session 5 territory once bodies differ by class.
Files touched:
  - `ashfen/src/view/effects.js` (new)
  - `ashfen/src/view/anim.js`
  - `ashfen/src/view/shaders.js`
  - `ashfen/src/view/attacks.js`
  - `ashfen/src/view/scene.js`
Decisions made and the reasoning:
  - Hit-stop is a time scale, not a pause flag. Returning the effective dt from `stepTweens` means nothing else has to know about the freeze, and any future thing driven off that dt freezes for free.
  - Effects sample from the frame loop rather than from inside a tween callback. Tweens step before `animUnit` places the root, so a trail sampled there would lag a frame; sampling after `animUnit` with `updateWorldMatrix` gives the ribbon's leading edge exactly on the blade.
  - The trail is sampled per frame rather than computed from the pose curve. Fewer samples at a low frame rate make a shorter ribbon, never a wrong one, and the shader's `uLen` keeps the fade correct either way.
  - The flare is a real point light rather than an emissive tint, because `flash()` already owns the emissive channel on a hit and the two would fight. It is added once at mount at intensity 0: adding a light on demand recompiles every lit material, a hitch better paid once than mid-exchange.
  - The burst and motes draw without depth testing. The contact point is inside the target's body more often than not, and half the mote cloud starts inside it too.
  - Miss handling is in the beat, not a new event. The event already says hit or miss; the beat just aims differently.
Known issues introduced:
  - The `PointLight` adds one light to every Lambert shader permanently, a small per-fragment cost even when idle. Session 4's key light will want the same treatment; if two idle lights show up in mobile profiling, merge them into one light that moves.
  - The crit hold plus hit-stop makes a crit exchange about 0.4s longer than before. Intended.
Next session starts with:
  - Session 4, materials. Switch `blade`, `helm`, `trim`, `plume` to `MeshStandardMaterial`, add the key light on fly-in, decide what to do about `uLevels` banding. The flare light in effects.js is a working example of a light living in the scene at intensity 0.
  - Headless recipe is in memory (`headless-verify-recipe`), now with the slow-motion switch and the scenario driver.
