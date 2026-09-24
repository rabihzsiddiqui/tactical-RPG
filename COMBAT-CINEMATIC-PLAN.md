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

## Session 5: health bars and battle HUD

**Warm-up, do this first.** Health bars are ground decals pinned to a fixed
world offset, so they slide out from under the unit when the camera orbits and
compress to nothing at low angles.

- In `meshes.js`, remove both `rotation.x = -Math.PI / 2` lines in
  `buildHealthBar` so the planes stand upright in local space
- In `animUnit`, drop the `+ 0.62` world offset and billboard instead:

```js
const bar = u.view.hpBar.group;
bar.position.set(root.position.x, lvlH(u.x, u.y) + 0.12, root.position.z);
bar.quaternion.copy(camera.quaternion);
bar.translateY(-0.34);
```

- Re-tune `HP_BAR_W` and `HP_BAR_H`. Upright reads larger than a floor decal
- Depth is already correct, `depthTest: false` with renderOrder 10 and 11.
  Leave it

**Then the HUD.** During a cut-in, hide the world bars and show a Fire Emblem
style forecast panel instead.

The data already exists. `combat.js` exports `forecastOf(att, def)` returning
`{ a, d, counters }`, which is both sides' damage, hit, crit and whether a
counter happens. No core work needed.

- New component in `src/ui`, driven by the camera director's cut-in state
- Static panel from `forecastOf(attacker, defender)` at cut-in start
- Live HP drain from `hpAfter` on each `strike` event
- World bars hidden for the duration, restored on fly-out

**Stop when:** bars sit under every unit at any camera angle, and the cut-in
swaps them for a panel that shows the exchange before it resolves.

---

## Session 6: camera punch-up

Tuning what session 1 built. The fly-in works, it just doesn't hit hard enough.

Read the Current state section before changing any numbers. The existing values
were tuned by eye and some of them are deliberate.

In rough order of impact:

- **Radial blur during transit.** Add a uniform to `POST_FRAG` that ramps while
  the camera is flying and smears radially from screen centre. This is the one
  that makes it read as a rush. Nothing else is close
- **Bigger fov swing.** 30 to 65 or 70, not the 45 to 55 originally specced
- **Drop the camera low.** Near eye level or below
- **Keep it short.** 250 to 350ms in. Past 500ms it becomes a pan
- **Ease-out quart with a slight overshoot.** Blow a few percent past the final
  framing, settle back over ~100ms. The overshoot sells arrival

Runs after the HUD because the HUD changes what the framing has to leave room
for.

**Stop when:** the cut-in feels like the camera was thrown rather than moved.

---

## Session 7: class silhouettes

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

## Current state

Maintained across sessions. Read this before starting any session that touches
earlier work. Records decisions the code alone doesn't explain.

**What exists (Sessions 1 to 7, all committed, tests 29 green).** `anim.js` owns the tween queue and `hitStop`. `camera.js` is the director: `save`, `flyIn`, `flyOut`, `track`, `shake`, `apply`, plus the cut-in key light. `attacks.js` holds one beat per weapon type (sword, lance, axe share a melee routine; bow, anima, staff have their own). `effects.js` holds one trail ribbon, one burst quad, one flare light and 14 motes, built at mount and hidden when idle. `playEvents` groups a strike run by unit pair, flies in once before and out once after; a non-instant heal gets its own cut-in. World health bars are camera-facing billboards. `BattleHud.jsx` is the cut-in panel, driven by `g.cutIn` on the game state. `SILHOUETTES` in `data.js` gives each class a body; `buildUnitMesh` reads it by class key.

**Camera framing (retuned in Session 6).** Midpoint of the pair, camera perpendicular to the attack axis on whichever side scores less clutter, orbit side on a tie. `BASE_DIST` 1.3 plus 0.5 per tile of separation. Look target 0.42 above ground. `ELEVATION` 0.12 rise per unit of distance, about 7 degrees, so the camera lands just under a unit's eye line at 0.7. `CINE_FOV` 66 against the orbit's 30. Fly in 300ms ease-out quart with an overshoot hump, fly out 520ms ease-in-out. Projectile tracking leans the look target 40% toward the arrow or bolt with a 90ms lag.

**Materials.** Blade, helm, trim and plume are `MeshStandardMaterial` with metalness 0.7, roughness 0.4. Everything else stays Lambert. Key light `DirectionalLight` at 0xfff1d6, intensity 1.1 times the fly mix. `uLevels` blends from the setting up to 64 with the mix; `POST_FRAG` skips quantising at 63 and above.

**Decisions the code does not explain.**
- The director blends against the live orbit pose every tick rather than owning the camera. A Rotate 90 pressed mid-exchange lands without a pop on hand-back.
- The strike run is bounded by unit pair, not event type. `runEnemyPhase` concatenates every enemy's events, so two adjacent enemies would otherwise share one cut-in.
- The cinematics toggle is persisted in localStorage (`tactical-rpg-cinematics`) unlike the music toggles, because turning camera motion off is an accessibility choice that should survive relaunching the PWA.
- Beats are absolute pose keyframes lerped from and to NEUTRAL, not deltas. `animUnit` overwrites the same rotation fields each frame, so additive poses would fight it.
- `play()` waits 150ms before the windup when the attacker has more than about 30 degrees left to turn. A windup that starts mid-spin reads as flailing.
- Hit-stop is a time scale: `stepTweens` returns the animation time that actually elapsed and `animUnit` and the effects run on that. The camera keeps real time. 70ms on a hit, 120ms on a crit, plus a 280ms hold before fly-out on any crit.
- Shake is `mt * 0.005` amplitude for `120 + mt * 14` ms, 1.8x on a crit, and follows the cinematics toggle. Hit-stop and the recoil nudge play regardless.
- The trail is sampled per frame after `animUnit`, not computed from the pose curve. Fewer samples at low fps give a shorter ribbon, never a wrong one.
- The flare and the key light are added at mount at intensity 0. Adding a light on demand recompiles every lit material, a hitch better paid once. Both now sit in every Lambert shader; if mobile profiling flags them, merge into one light that moves.
- The key light is aimed as a mirror of the camera off the blade's narrow face at contact (`KEY_TWIST` 0.3 matches the melee strike torso yaw, `KEY_TILT` 0.36 keeps it above the horizon). Placed high and to the side, the blade never caught anything.
- Intensity 1.1, down from 1.6: with no tone mapping, 1.6 turned Kaelen's helm into a flat white slab in the near corner of frame.
- Roughness 0.4, not the plan's 0.35: on flat boxes a tighter lobe lit a whole face or nothing, popping like a facet.
- Posterisation blends off rather than switching, so the bands dissolve as the camera closes in instead of snapping off on frame one.

**Health bars and HUD (Session 5).**
- The bar copies the camera quaternion, then `translateY(-0.34)` in its own local frame, which is screen-down. So it sits under the feet on screen from any pitch or yaw, and dips below ground level at steep pitches; with `depthTest: false` that never shows. Size is 0.48 by 0.085, down from the decal's 0.62 by 0.11. Upright and square-on, the old size read like a plank.
- The HUD is driven by `g.cutIn` plus `tick()`, the same channel every other overlay uses, rather than by a React state the director owns. The director stays a plain object with no React in it, and the panel reads live HP from `g.units` the way the level-up card reads `g.levelUp`.
- The forecast is taken once, before `flyIn`, so the panel shows the odds the exchange was rolled against and the numbers never move while the HP drains. A heal cut-in stores `amount` instead: `strikeCalc` on a staff has no `hit` and returns NaN.
- `cutIn.closing` flips before `flyOut` and the object clears after it. The panel fades over the fly-out and the world bars come back at the same moment, so there is never a frame with neither.
- The player's unit is always on the left of the panel, whichever side is attacking. Blue left, red right, every time.
- Panel motion is opacity and transform only, with a `prefers-reduced-motion` override in the App style block.

**Camera punch-up (Session 6).**
- The radial blur is driven by measured camera speed, not by the easing curve. `apply` compares the camera position with last frame's, before shake is added, and normalises by fly length over fly duration over the quart's initial slope of 4, so the first frame of any fly-in reads 1 whatever the orbit zoom. The fly-out then blurs at about 0.3 for free, and the settle after the overshoot fades the blur out on its own. Read from `director.rush` into `uRush`.
- The blur runs before the posteriser in `POST_FRAG`. After it, the quantiser cut the averaged ramps back into bands. Eight taps stepping toward screen centre, smear 0.4 times the pixel's offset from centre, so the middle stays readable. No blur when the post pass is off; the toggle already drops the whole look.
- The overshoot is a world-unit hump along the fly line, both camera and look target together, 10% of the framing distance at its peak plus 4 degrees of fov, starting halfway through the fly and settling over the last quarter. Extrapolating the mix past 1 was tried on paper and rejected: a few percent of a twenty-unit fly from the default zoom put the lens inside a helm. The hump is scaled to the framing distance, so it is the same size from any zoom.
- Dropping the camera to eye level turned the carried-forward near-corner bystander into a wall across a third of the frame on turn 1. `framePair` now scores both sides of the axis: each bystander between camera and look target adds its overlap with the view cone weighted toward the camera end, units behind the target add 0.3 of that fading out over a second framing distance, and the orbit side only keeps its claim when the far side is no clearer. The far side means a longer fly and can put the enemy on the left; the blur covers the first and the HUD ignores the second. scene.js passes the live positions of every other living unit as `opts.others`.
- `BASE_DIST` 1.3 is not the 1.46 that would hold the old on-screen unit size at the wider fov. Slightly closer than that so the near ground and the wide angle stretch depth, which is the point of widening the fov at all. Feet land at about three quarters of frame height with the HUD starting just under them.

**Class silhouettes (Session 7).**
- Entries in `SILHOUETTES` are overrides on `SILHOUETTE_DEFAULT`, and the default is the pre-Session 7 body exactly (band helm, plume, cape, sleeves), so a class with no entry looks the way it always did. Every class in the roster has an entry, including the four enemy ones; the fallback is for classes that do not exist yet.
- Bulk scales torso width in full, torso depth at a third of the rate, shoulder spread and leg spacing in full, and limb thickness by the square root. Full-rate depth made the Knight a cube from the orbit; unscaled limbs on a 1.3 body read as a barrel on sticks. Height is not scaled: the head, hip and shoulder pivots stay where the pose keyframes in `attacks.js` expect them.
- Pauldrons and the quiver hang off the torso, not the arms, so they do not swing on a walk or a windup. The shield is on the off arm on purpose: it should come up with the arm in the lance strike.
- The Mage got a pointed hat instead of the hood the plan sketched. Two hooded casters next to the hooded Archer made three cloth caps in a row; the hat is the one silhouette that reads from any angle at any distance.
- The hood is a cap plus two side panels plus a neck drape. The first cut was cap and drape only and read as a beret from the front.
- Helm cones are four-sided and turned 45 degrees so a flat face points forward like the head box does.
- Fighter and Brigand are the same archetype, bare arms and no helm, told apart by team palette. Mercenary differs by keeping sleeves and adding pauldrons. The Warlord's horns are in the plume gold and read as crown spikes more than horns, which suits a boss and was left.
- Verified with a lineup harness (`verify-lineup.html`, not committed) that rendered each class at front, three-quarter, side and as a black silhouette on white, plus one real enemy phase through the cut-in.

**Dev reference poses (setup for the graphics sessions, 8 to 12).**
- Two keys in `npm run dev` only, logged to the console on load and stripped from the build: `p` snaps the orbit to `CAM_HOME` in `App.jsx` (pitch 48, yaw 0, fov 30, zoom 12; the orbit target is always the board centre), `c` toggles the reference cut-in (`refCutIn` on the scene api). Screenshots for any visual change are taken at both.
- The cut-in pair is the closest player and enemy by ROSTER start position: Doran (u2) at (5,8) against the Mercenary (u11) at (6,6). Press it on a fresh board. It frames those two units wherever they currently stand.
- They are 2.24 tiles apart, so the framing distance is about 2.4 against 1.8 for an adjacent melee exchange. The reference is a little wider than most real cut-ins; judge scale against that.
- It shows what a real cut-in shows (HUD, world bars hidden, bystanders veiled) and squares the player unit up with `faceToward`, as the first strike would. That snaps to a cardinal, so Doran faces north rather than straight at the Mercenary. The facing is restored on release. No strike plays, nothing resolves, and taps are locked while it holds.

**Known issues carried forward.** Bystanders behind the fighters are still common on turn 1 with either side chosen; the formation is simply crowded. A close bystander still catches the key light on its helm. Standard materials and the two idle lights are still untested on a phone; the performance budget asked for that check before Session 5 and it has not happened. oxlint reports `react(refs)` warnings for every read of `g` during render, including the new HUD block; that pattern predates this plan.

**At the end of every session:** append anything decided and why, but only where
the reasoning isn't obvious from the code. Tuned values, things tried and
rejected, deliberate choices that look like bugs. Not a changelog.
