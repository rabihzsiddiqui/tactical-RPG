# Tactical RPG

A turn-based grid tactics game in the Fire Emblem tradition, built with React,
Three.js and Vite. Two companies of soldiers take turns moving across a tile
grid and fighting. Every attack is previewed before it is committed, terrain
changes the odds, and a fallen unit stays dead for the rest of the battle.

The title is a placeholder. The game currently ships with one level, **Ashfen
Pass**, and more are planned.

## Running it

```sh
cd game
npm install
npm run dev      # dev server with hot reload
npm run build    # production build into game/dist
npm run preview  # serve that build
npm test         # vitest, covering the combat and turn rules
npm run lint     # oxlint
```

## How to play

The game explains itself. The title card has a **How to play** button, the
button row under the map has **Help**, and the pause menu has **Field manual**.
Pressing `?` or `H` opens the same manual anywhere in the app, and `Esc` closes
it. It has five tabs:

| Tab | Covers |
| --- | --- |
| Basics | Win and loss conditions, the phase structure, a step-by-step first turn |
| Controls | Every tap, drag and button, including the click-to-engage shortcut |
| Combat | Reading a forecast, counterattacks, doubling, the weapon triangle, EXP |
| Terrain | Movement cost, Def and Avoid, and a table of every tile in the level |
| Glossary | Every abbreviation the HUD shows, from Mt and Avo to Rout and Phase |

The weapon and terrain tables in the manual are generated from the same modules
the rules run on, so they cannot drift out of date.

### The short version

Defeat every enemy unit to win. You lose if Kaelen, your Lord, is killed or your
whole company falls. Each turn you move and act with every one of your six
units, then end the turn and watch the enemy do the same. Tap a unit to see its
movement range in blue and its attack reach in red, tap a tile to move there,
then pick an action. Sword beats axe, axe beats lance, lance beats sword.

## Layout

```
game/
  src/core/    rules: map, weapons, pathfinding, combat math, enemy AI, turn flow
  src/view/    three.js: scene, meshes, shaders, audio
  src/ui/      react overlay: HUD, action menu, forecast, field manual
  public/      icons and audio
ashfen-pass.jsx  the original single-file prototype, kept for reference
```

`src/core` imports nothing from Three.js. The rules are testable on their own
and the renderer is replaceable. `src/core/game.js` turns a decision into a new
state plus a list of events, and `src/view/scene.js` plays those events back
against the live scene. Tests live beside the modules they cover, in
`src/core/*.test.js`.

## Renaming the game

`GAME_TITLE` in `game/src/ui/meta.js` feeds the title card and the manual.
Three copies sit outside the bundle and need editing by hand:

- `game/index.html`: the `<title>` tag and `apple-mobile-web-app-title`
- `game/vite.config.js`: `name` and `short_name` in the PWA manifest
- `game/package.json`: the `name` field

The level name is separate, in `LEVEL_NAME` in `game/src/core/map.js`, next to
the map it belongs to. A second level goes there as a second map and name.
