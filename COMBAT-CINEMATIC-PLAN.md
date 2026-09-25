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

**Outlines (Session 8).**
- Depth comes from a `DepthTexture` on `rt`, normals from a second target drawn with `scene.overrideMaterial`. The depth texture is the same 24 bits the old renderbuffer was, so nothing z-fights differently. `rt.setSize` disposes the target and three reallocates the depth texture at the new size on the next render; nothing else resizes it. `camera.far` is `dist + 80`, not 120, so near and far go to the shader every frame.
- `rt`'s alpha is a mask: how much outline each pixel accepts. The camera layer keeps overlays out of the normal pass, but it cannot stop a crease under a health bar (`depthTest: false`) from drawing across it, and a veiled bystander at opacity 0 still writes depth, which drew its outline around nothing. So `noOutline()` in `meshes.js` puts an object on layer 1 and also blends it so `rt`'s alpha drops by its coverage. Units write their own opacity there (`fadeOutline`). Water writes 0. The colour factors are three's own, and the canvas has no alpha channel, so none of it shows with post off.
- The depth threshold is in pixels of the surface's own slope, `px / facing`, using the smaller facing of the two pixels. Scaling by depth alone held at grid distance, but in the cut-in the ground runs nearly edge-on and every pixel of it read as a jump. Taking the smaller facing stops a step seen from low down from lining its riser dark.
- Convexity is tested on the view-space chord between the two pixels, not on screen offsets alone. Both pixels astride a convex crease pass it, so the more sun-facing one takes the highlight. That makes the side a property of the world, and a line does not hop across an edge as the camera orbits. `OUTLINE_SIDE_EPS` lets both sides draw when the two faces are lit nearly the same, since 8-bit normals would otherwise flip the choice frame to frame.
- The crease measure is half the squared normal difference, not `1 - dot`. The normal target clears to the sky colour, which is no unit vector, and the first cut lit the whole sky at 1.3.
- The normal pass is flat shaded. Trees, bushes and the keep are flat shaded in colour but carry smooth vertex normals, so a smooth normal pass found no facets on them. It skips the shadow map and world matrix updates, which the colour pass has already done.
- Checked with a seeded, fixed-clock harness: outlines off is pixel-identical to the build before them, at 400x240 and native, orbit pose and reference cut-in.
- Starting values, before any tuning against screenshots: dark 0.45, light 1.3, depth edge at 3 pixels of slope, crease at 0.2 (about 37 degrees), facing floor 0.1, side epsilon 0.03, gone once rush passes 0.125. The grass tufts pick up a scribble of both kinds of line and are the likeliest thing to shimmer while orbiting.

**Pause menu (Session 8b).**
- This reverses the old decision to render the menu in normal flow under the map. Once the map took the window, that slot sat below the fold. The menu is now an overlay sized to `--view-h` at zIndex 50, and it replaces the zIndex 45 input blocker. The title card (60) and the manual (70) stay above it.
- There is one cursor, and it is DOM focus. Hover, a tap, Tab and the arrows all move focus, and the gold bar follows the focused row, so Enter and Space activate through the button's own click. A `pointerdown` handler also moves focus, because Safari does not focus a button on click and the bar would otherwise stay on the old row after a tap.
- App keeps the only keydown listener and forwards to the open menu through a ref. HelpOverlay still has its own Escape listener, so App ignores every key except `?` while the manual is open. While the manual is up, the menu blurs whatever it had focused. Otherwise Enter would press the row hidden behind the manual. When the manual closes, focus goes back to the row that opened it.
- The stacked layout switches on a container query against the map's width, not a media query against the window's. From 640 to 1023px of window the map is only 430 wide, and side by side the panels did not fit it.
- On a narrow map, Options takes the strip's place as well as the list's. The brief kept the strip. A phone in Safari leaves the map about 320px, which fits the strip and the list, or Options alone, but not the strip and Options together. Fitting a phone without scrolling was the stop condition, so the strip gave way.
- The two volume sliders sit side by side, which saves the row that let Options overflow an upright iPad. The Slider's keyboard `onGrab` now fires on left and right only: up and down move the menu's highlight and change nothing.
- `SCRIM_RGB` and the ramp moved from PhaseBanner to `theme.js`, since exporting an array from a component file trips the fast-refresh lint. The command value has a fixed min width, because the panel sizes to its content and grew 8px whenever Threat range flipped from ON to OFF.
- `restart()` clears `paused`. The enemy phase plays on behind an open menu, so a battle can end with it open, and it came back over the new board.
- Checked headlessly from 360 to 1920 wide: no row clipped or wrapped, every row at least 44px, no panel scrolls. Also checked: every old control, the Escape order with the manual open, End turn disabled in the enemy phase, and no console errors. Two known exceptions: a landscape phone, where the map is 226px tall and the panels scroll inside, and a 320px-wide phone, where the strip wraps and the list scrolls 11px. Spacing and colour are untuned pending screenshots.

**Lighting (Session 9).**
- All board lights live in `LIGHTS` at the top of scene.js, shadow map settings included. The key light and the flare stay with camera.js and effects.js. Moving them was pixel identical.
- The post pass had no sRGB encode. Three converts every hex colour to linear and three's own materials encode again when drawing to the screen, which is why post off always looked right. POST_FRAG wrote linear light straight to the canvas, so every colour showed darker than written: the sky 0x9fc3d8 as (89,135,168), a sunlit grass top as (24,48,8), the board's front wall as (16,8,8). The posteriser spent its 32 levels on linear light, and the whole lit board sat in levels 0 to 6. Most of what earlier sessions called a dark palette was this. The likely origin is the r128 prototype, where hex passed through unconverted.
- The encode is three's `linearToOutputTexel`, placed after the transit blur (which should average light) and before the posteriser (so its levels are even to the eye).
- `rt` is tagged `SRGBColorSpace`, so the GPU stores it encoded and decodes on read. Same memory. A plain 8-bit target holding linear light kept 439 distinct colours in a dark patch of the reference cut-in against 597, and the gap shows once the posteriser lets go.
- Water and waterfall colours are GLSL literals picked by eye against the screen, so they are treated as sRGB and decoded with `sRGBTransferEOTF`. They display pixel identical to before. The other scene shaders take hex through `THREE.Color`, which is already linear, and now show their written colour: rings, move and attack tiles, trails, bursts. Every scene shader ends in `linearToOutputTexel`, a no-op into `rt` and the screen encode with post off, so the two paths agree. With post off only the rings changed (about 120 pixels at the reference pose); the lit scene there was already right.
- Effects blend additively in linear light now, so a trail or burst adds more on screen than it did. Values tuned against the dark pipeline are up for review in this session: the key light's 1.1, `OUTLINE_DARK` and `OUTLINE_LIGHT`, and anything in TYPES.

**Tile-stepped haze (Session 10).**
- Every solid takes one haze amount from the distance between the camera and the centre of its tile, taken at y 0 whatever the tile's height. The terrain finds its tile per fragment, from the world position nudged 0.01 in along the face normal, so a wall belongs to the tile it hangs from. Units and props pass an anchor uniform that the shader snaps to its tile. Water, the falls and the overlays are not patched.
- The mix goes in before three's output encode, in linear light, so post on and post off agree. Three's own fog mixes after the encode.
- Props anchor at the prop's origin through a uniform, not at each mesh's `modelMatrix` origin as briefed. Per mesh, 15 of the 39 prop groups split across tiles: both bridges are two tiles wide, so the deck anchors on one tile and the rails, on the span's outer edges, on the tiles either side, and the outer blades of 13 bushes hang past their tile. `tileFogProp` gives each prop its own clones of its materials, all reading one anchor. They share one program, so nothing extra compiles.
- Near and far are measured from the camera's distance to the director's look target, not fixed in world units. Fixed values could not do what the brief asked of the cut-in: the camera sits about 2.4 from the fighters there, every tile is nearer than the orbit's near row, and the whole board came out clear. Measured this way the haze also spans the board at any zoom and window shape. At the reference pose the absolute distances move by 2.4 between a wide and a tall window, and the offsets do not. `camera.js` exposes `target` for this.
- In a cut-in the near edge moves to 0.5 past the look target (`HAZE_CINE_NEAR`), riding the director's mix. With the orbit's offset the fighters took the same haze as the board centre, about 0.13, and read washed out. Now they are pixel identical with and without haze, and the board a few tiles behind them reaches the cap.
- Checked on the seeded, fixed-clock harness with post off: the haze amount recovered per pixel from an on/off pair (blue channel, linear) is constant inside every face, and every jump lies on a tile edge or a silhouette, at the reference pose, after a half orbit and in the reference cut-in.
- Starting values, before any tuning against screenshots: colour 0x9fc3d8 (the sky), cap 0.35, near 2.4 in front of the look target and far 4.1 past it (the near and far rows at the reference pose), cut-in near 0.5 past it. The far row goes from (73,104,54) to (114,143,130) and the near row moves one quantiser level; the front wall does not move. In the old linear canvas units of the fog comment that is about 20 to 57 against the old fog's 37 to 64. Grass has almost no blue, so blue carries most of the lift and the middle of the board already leans teal. That is the first thing to judge.
- `clone()` copies `userData` but not `onBeforeCompile`, and assigning `onBeforeCompile` replaces whatever was there. `tileFog` chains a patch already on the material and keeps its cache key, and `tileFogProp` carries a patch across the clone. Any other shader patch on the same materials has to chain the same way, or the haze drops out.

**Wind, cloud shadows and ash (Session 11).**
- One `uWind` (x, z, strength) and the scene's `uTime` drive all three, from `wind.js`. Every motion is speed times time, so `uWind` is set once at mount: changing it at runtime would jump every cloud and flake to where the new speed puts them. Gusts live in `SWAY_VERT`, not in the uniform.
- The cloud shadow is not inside the tilefog patch, as the brief suggested. `wind.js` has its own patch and stacks it on tileFog's the way tileFog stacks: the earlier `onBeforeCompile` runs first and the cache key is extended. The suffix also keeps sway and non-sway programs apart, which three would otherwise key on the same closure source. The harness checked that all 1277 lit materials on layer 0 carry both patches and none carries one without the other.
- Sway weight is baked per vertex (`aSway`, reach in world units) by `bakeSway` in meshes.js, not passed as a per-material uniform. The outline normal pass draws everything through one override material, and it has to sway too, or the creases stay where the blades were while the depth edges follow them. Blades weight by height squared so they bend, canopies linearly so they lean. The offset is built in world space, so gusts roll downwind across the field whichever way a prop is turned, then taken back to mesh space with `inverse(mat3(modelMatrix))`, so shadows, haze and the cloud all see the moved vertex.
- The normal material sets `defaultAttributeValues.aSway = [0]` for the meshes that lack the attribute. WebGL's resting attribute value is context state, not saved per mesh. Nothing else in the scene writes one today; a ShaderMaterial drawn on a geometry with no uv or color would.
- Canopies cast through a swaying `MeshDepthMaterial`, and tufts keep the plain one. `clone()` does not copy `customDepthMaterial`, so it is set after the props are cloned. A unit's head carries an array of six materials, one per box face, so the traverse concats.
- The cloud scales the sun's direct light only, the shadow-casting directional light that three sorts to index 0, not the whole lit colour. A face in sun shadow has no sun to lose, so a tree's shadow merges into the cloud's rather than stacking darker under it.
- The cloud is read at the fragment's position slid along the sun's rays to y 0, so its edge on a wall, a raised tile or a unit's side lines up with the ground beside it. `fract()` keeps the lookup in 0..1 however long the app has been open, since some phone GPUs lose sub-texel precision on large texture coordinates.
- Noise is two octaves of tileable value noise, 8 and 16 cells, weighted 0.7 and 0.3, from an integer hash rather than `Math.random`, so the seeded harness's other draws do not move. Four base cells made one blob covering half the texture.
- Ash sits at `renderOrder` 1. Units live in the transparent pass for their fades, and the ash object's origin is the board centre, so at 0 a cut-in's fighters could sort after it and paint over a flake in front of them.
- Checked on the seeded harness at 400x240 and native, orbit pose and reference cut-in: no console errors. Between two times, only the brush, the canopy edges, water, rings and idle units change. In the cut-in the creases stay on the swaying blades. A cloud edge is one clean step and a crop across one holds fewer distinct colours than before.
- Starting values, before any tuning: tuft reach 0.03 at the tallest tip, canopy 0.012; rest lean 0.35 of the reach, gusts 5 units apart rolling at 1.4 per second, flutter 0.25 at 3.3 radians per second; wind toward +x and a little away from the home camera, strength 1. Clouds: one texture repeat per 32 units, 0.2 units per second (five seconds to cross a tile), cut 0.53 (about 40 percent cover), 0.35 of the sun let through. Measured on lit grass, a cloud takes on-screen luminance to 0.89 at the median, 0.81 at the tenth percentile: about 23 percent darker in linear light, 11 on screen. Ash: 320 flakes in the board's footprint plus 0.5, from y -0.4 to 3.2, drift 0.35, fall 0.12, wobble 0.08, one in ten an ember at 1.3 times 0xff8a3c, the rest 0xc9c6bf. At native resolution a 2 pixel flake is faint.

**Sky, lowland and ridges (Session 12).**
- The orbit never looks above the horizon. Its pitch stops at 20 degrees down, where the top edge of the frame is still about 5 degrees under it. So the sky bands only ever show in a cut-in, and their edges are placed for that view, which reaches about 26 degrees up at the top centre. Under the horizon the orbit sees the lowland.
- `scene.background` is gone, and `renderer.setClearColor(SKY_HORIZON)` takes its place. The dome covers every pixel of the colour pass, but the outline normal pass never draws it, and that pass still has to clear to the old sky: the crease test in POST_FRAG was written against it.
- The dome is on the no-outline layer but is not `noOutline`: it writes 1 into rt's alpha, as the clear did. With 0 there, ten texels at 400x240 lost a dark line the old sky took along the tree silhouettes at the reference pose. With 1, the first cut (flat 0x9fc3d8 under the horizon) was pixel identical to the build before at 400x240 and native, post on and off, and no cut-in moved by more than one texel between the two.
- The sky is built last in `mountScene`, after the effects. three draws `Math.random` for every uuid, and built first it shifted every seeded draw after it: the pixel diff showed about 2000 changed texels on the grass, the trees and the idle units, and none on the sky.
- The brief's far plane of 120 has been `dist + 80` since Session 8, never under 80. `fitDist` lets the orbit back off to 38.6 units from the board centre (a portrait phone at pitch 20 and zoom 22), and to 22 on a landscape desktop. The first estimate for the rings, 20 and 35, would have put a phone's camera over the far ring. The ridge lines sit at 46 and 62, and the near ring's base comes no nearer than 39.5, so the camera is inside both rings from every pose. Nothing is more than 72 units from the board centre, the lowland's rim, and the camera is never further from the centre than `dist`, so everything stays at least 8 units inside the far plane.
- The lowland is flush with the map's edge tiles, at y 0, a disk of radius 72 out under both rings with the board cut out of it. It is tucked 0.25 in under the board's edge so the two overlap instead of meeting on a line, and polygon offset (factor 1, units 1) keeps the board on top there; no crack showed at 400x240 or native. Before this it was a plateau's lowland at -1.25, just under the lowest of the board's edge walls. That fixed the cut-in's world ending past the board's far edge, but the raised board looked out of place in the world. Two earlier tries coloured the dome under the horizon instead: flat 0x9fc3d8 read as an island floating in sky, and green bands there read as a backdrop.
- The lowland is fogged by distance from the board's edge, not from the camera, so the map is the clear thing in the middle and the land fades back from it. The distance is to the board's rectangle, so the fog follows its outline, rounded at the corners. It steps to 0.35 right at the edge, one deliberate step, and eases out (1 - (1 - t) squared) to 1 at 18 units, exactly the dome's colour under the horizon, so the lowland's far reaches and the dome meet with no edge and the far-plane clip of the disk never shows. It is a smooth ramp, which the rule against ramps before the posteriser forbids, so with post on POST_FRAG applies it after the quantiser: it works each pixel's world position back from depth through the camera's world matrix (`uCamWorld`), fogs pixels at or under y 0.05 outside the board, and quantises the fog colour like the dome so full fog matches it exactly. rt's alpha gates it, which keeps it off overlays and ash. With post off there is no quantiser, and the lowland and the river fog themselves from the same GLSL (`GROUND_FOG_PARS`), switched by `uFogInShader`. Tried first: six hard rings (0.25 at the edge to 1 at 24), which the posteriser left alone but which banded heavily by design, and before that a flat 0.2 or 0.35 that turned the grass teal or read as out of place. It takes the board's shadow and the cloud shadow: flush with the board, clouds would otherwise stop dead at the map's edge and draw its rectangle, and the fog fades them out with distance.
- The map's outline is drawn in POST_FRAG as part of the outlines, on the same toggle and at the same dark factor. Neither depth nor normal changes at a flush seam, so it is found in world space: a board pixel at ground height with a lowland pixel beside it takes the line, so it sits on the board's side, one pixel wide at any resolution. Hill tiles on the edge stand above ground height and keep their ordinary depth-edge line instead.
- The board's own tile haze (`HAZE_MAX` in tilefog.js) drops from Session 10's 0.35 to 0.15. The fog round the map now does the framing, and the map itself should read clear.
- The river runs on out of the map across the lowland to 44 units from the centre, deep in the full fog, in a channel walled down to the river bed like the banks inside the board. The waterfalls and WATER_FRAG's white lip at the map's edge are gone: with the ground at the map's level there is nothing to fall off. The run-out is WATER_FRAG with GROUND_FOG defined, on the board water's own uniform objects so uTime moves with it; out there the shore field reads its clamped edge column, which is the same banks the river had where it left the map. Each strip starts on the board's edge with six cells a unit across, as a water tile has, so the two meet vertex for vertex. It sits on the no-outline layer but is not `noOutline`: POST_FRAG fogs by rt's alpha, and a zero there left the river bright through the fog.
- Only the inner face of each ring is built. From anywhere inside, the ridge line hides the outer one, and it would be back-facing anyway.
- The ridges start 0.5 under the lowland and rise straight out of it, at about 45 degrees, with a shoulder row partway up that wanders in and out so each face breaks into facets. The first cut ran them down to a foot at -12 at about 70 degrees, a wall of facets taller than the board from the lowest orbit. Later cuts stopped them at a haze line over the dome, and from low down they read as grey slabs floating on it.
- Ridge colour is baked per face at mount: how squarely the face meets the sun in LIGHTS picks a point between shade and lit, and the ring's mist mixes that toward the horizon, all in sRGB. `MeshBasicMaterial`, so the haze and cloud patches never touch it and no light change moves it. `noOutline`, so the ridges take no lines; asked twice and left open, so they stay off.
- Values after four rounds of screenshots. Sky edges 2, 5, 9 and 14 degrees; the first cut's 3, 8, 15 and 24 hung the top band down over the middle of the frame like a cap, since a rectilinear lens bends rings of constant elevation up at the sides. Zenith 0x5b8ec4, bands evenly mixed in sRGB. Lowland 0x6b8f4a, tuck 0.25; fog 0.35 at the edge to 1 at 18, nothing over y 0.05; board haze 0.15. River run-out to 44, surface at -0.1 as on the board, 2 cells a unit along it. Ridge lit 0x7d9a86, shade 0x4c6470, base 0.5 under the lowland, shoulder 0.45 of the way up. Near ring: 48 columns, ridge 1.8 to 4.4 high, wandering 2, base 5 in from the ridge line, mist 0.15 (first cut 0.3). Far ring: 40 columns, 4.0 to 8.6 high, wandering 2.7, base 8 in, mist 0.45 (first cut 0.6, when it sat within one level of the sky band behind it and read as haze). From a cut-in eye line near 1.0, near peaks rise about 1 to 4 degrees over the horizon and far ones 3 to 7.
- Still to judge: the fog's strength and reach, which are starting values. The river run-out stays bluer than the grass beside it at any fog short of full, since water starts far lighter and more saturated, so it reads as a line leading out of the map. Seen in passing: with post off, the headless harness draws the board's own water, the unit rings and the health bars white. The build from before this session does the same, so it predates this work; not yet checked in a real browser.
- Checked on the seeded, fixed-clock harness at 1000x500 after each change: the reference pose and cut-in at 400x240 and native, the orbit at pitch 20 from three yaws, and three real attacks: along z, along x, and a bow shot on a diagonal. Every cut-in frame has both ridge rings on the horizon behind the fighters. No console errors.

**Red sky on Adreno (after Session 12).**
- On a OnePlus 13R (Snapdragon 8 Gen 3, Adreno 750) the cut-in sky came out in bands of red: each band at its own red channel with green and blue at 0, at the right heights. A Pixel 8 Pro (Tensor G3, Mali) and an M2 iPad drew it right, and turning Outlines off or changing Resolution changed nothing. The dome read its colours from `uniform vec3 uBand[BANDS]` inside a loop; three's own shaders unroll such loops, and this one did not.
- `skyFrag` in shaders.js now writes the band colours and edges into the source as literals, one comparison per edge, with no uniform arrays left in the dome. Nine significant digits name each 32 bit float exactly, and the seeded harness gave a pixel diff of 0 against the build before at 366x430 and 1000x500, at the reference pose and in the reference cut-in.
- Confirmed on the OnePlus, through the dev server's network URL (`npm run dev -- --host`): the sky draws in its blues again. If a new shader needs a table, prefer literals or unrolled constant indices over a uniform array in a loop.

**Mist up the ridges (after Session 12, superseded by the lighter haze below).**
- In the cut-in the horizon read as a flat blue cut. The lowland reaches full fog 18 units from the map's edge, and the ridges 38 to 62 out carried only their baked mist of 0.15 and 0.45. So the hills were clearer than the plain in front of them, and stood with a hard foot on a uniform strip of fog.
- `groundFog` now gives anything standing over `GROUND_FOG_TOP`, further than `GROUND_MIST_NEAR` (10) from the map's edge, a mist of `1 - smoothstep(0.05, GROUND_MIST_TOP, y)`, with `GROUND_MIST_TOP` at 4.0. Only the ridges stand out there, so their feet sink into the same fog as the plain and they clear toward the crest. The first cut, `(1 - y/3.5)^2`, thinned too early to show: most of the near ridge in view stands over 2 units.
- POST_FRAG gates the fog on rt's alpha only at ground height, since the ridges write 0 there (`noOutline`). With post off, the ridge material fogs itself like the lowland. That path is untested: the headless harness reads the ridges back as transparent with post off in both builds, and the app never turns post off.
- Seeded harness: the reference pose is pixel-identical at 1000x500 and 366x430, since the orbit never sees the ridges. In the reference cut-in only a 51px strip changes. The near ridge's foot goes from 86A18D to A3C3CF against the fog strip's A4C4D0, and the far ring, all over 4.0, is untouched. These are starting values and have not been judged against screenshots.

**Lighter haze (after Session 12).**
- The ridge mist washed the ridges out from the low orbit. At pitch 20 their colour went from 819E88 to about A1BDCC, the fog's own colour, so the top of the frame became a blank wall. The reference pose never sees the ridges, so its pixel diff of 0 missed this. Check pitch 20 as well as the reference pose whenever the far world changes.
- The root cause was fog density, not the ridges. At 0.93 fog 12 units out and full fog at 18, nothing 38 to 62 units away should be visible at all, so the plain had to go flat before the hills. The user was offered three fixes: lighter haze, a cloud bank over the band, or a thin mist at the ridges' feet only. They chose lighter haze, accepting less mist round the map in the orbit.
- `groundFog` is now `1 - (1 - GROUND_FOG_EDGE) * exp(-d / GROUND_FOG_REACH)` for the plain, the river run-out and the ridges alike, with EDGE 0.25 and REACH 110. It never quite reaches full. It gives about 0.33 at 12, 0.46 at the near ridge's foot and 0.54 at the far ridge. The height mist and `GROUND_MIST_TOP` are gone. `GROUND_FOG_NEAR` (10) still keeps canopies and ash near the edge out of it. Ridge baked mist is now 0 on the near ring and 0.2 on the far ring, to keep the far ring back.
- Seeded harness, against the build before the mist. At pitch 20 the 72-row flat band (A2BECD) under the ridges is gone, and the top of the frame runs far ridge 90A8A3 to near ridge and plain 7A9681 to 728F72 with no flat run. In the reference cut-in the pale strip under the near ridge is gone, and the plain runs green (688564) to its foot. The near ridge goes from 85A08D to 90ADA6, and the far ring from 8FACA4 to 96B4B3, so the two rings now sit close in tone. At the reference pose the lowland at the top of the frame goes from 83A093 to 688560, and about 5 percent of pixels change.
- Starting values. Still to judge: whether the ridges are now too pale and too close to each other, and whether cloud shadows read as blotches on the clearer plain. At full fog they once did.

**Unit panel portraits (outside the sessions).**
- The unit panel (`ui/UnitHud.jsx`) shows a face for whichever unit was tapped last, and `view/portrait.js` renders it: each unit's own `buildUnitMesh`, weapon hidden, in a small scene of its own, rendered once at mount into a 112px target on the board's renderer and kept as a data url. It is not a per-frame pass, so it has no toggle. One render per palette and class, cached across restarts: eleven for the current roster, since the two brigands share one.
- The target is tagged `SRGBColorSpace` like `rt`. three writes linear light into every render target, but an sRGB one is stored as SRGB8_ALPHA8, so the GPU encodes on write and `readRenderTargetPixels` hands back bytes a canvas can take as they are. No LUT in JS.
- It runs last in `mountScene`, after `syncUnitVisuals`, for the same seeded-draw reason as the sky.
- Starting values, not yet judged against the user's screenshots: fov 18, aim height 0.72, span 0.6, unit turned 0.45 rad so the face points toward screen left, the board's ambient, a key in the sun's colour at 1.8 from front left, a rim in the bounce colour at 0.8. Helm tops crop a little (the knight's plume, the mage's hat), as a bust would.
- The panel sits in the map's top-left corner, at the Menu button's 8px inset and level with it, by the user's call. It keeps 92px free on the right for the button: its 75.1px width in Cinzel rounded up to 76, its inset and 8 between. Whatever the corner, it belongs in that top strip: the first cut hung under the Menu button, and on a 390px-wide phone it landed on the keep, covering the Sniper or Garrick when either was tapped. The top strip is the ground past the board's far edge at the opening pose.
- A tap on the panel opens the rest of the old unit card (stat grid with weapon bonuses in gold, weapon numbers, level, EXP, vulneraries, terrain and cover) and plays the drag sound both ways. Open, it is 319px tall for an ally and 283px for a foe, most of a phone's board on the left, so it stays open only until the next tap on it. It does stay open from one unit to the next, for comparing. Taps on it never reach the board: the panel is a sibling of the canvas, not a child.

**Known issues carried forward.** Bystanders behind the fighters are still common on turn 1 with either side chosen; the formation is simply crowded. A close bystander still catches the key light on its helm. Standard materials and the two idle lights are still untested on a phone; the performance budget asked for that check before Session 5 and it has not happened. oxlint reports `react(refs)` warnings for every read of `g` during render, including the new HUD block; that pattern predates this plan.

**At the end of every session:** append anything decided and why, but only where
the reasoning isn't obvious from the code. Tuned values, things tried and
rejected, deliberate choices that look like bugs. Not a changelog.
