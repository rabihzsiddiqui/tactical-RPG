/* the game's own identity, kept apart from the level it currently ships
   with. "Tactical RPG" is a placeholder title: change GAME_TITLE here and
   the title card, the onboarding card and the field manual all follow.
   Three copies live outside the bundle and have to be edited by hand:
   index.html's <title> and apple-mobile-web-app-title, vite.config.js's
   PWA manifest, and package.json's name. README.md lists them. */

export const GAME_TITLE = "Tactical RPG";
export const TAGLINE = "Grid tactics in the Fire Emblem tradition.";
