# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"The Deep Awakes" — a 2D side-view fishing/horror browser game. Plain HTML + CSS + vanilla JavaScript rendered on a `<canvas>`. No build step, no package manager, no tests, no linter.

## Running

Open `index.html` directly in a browser, or serve the folder statically (e.g. `python -m http.server`) and open it. Runtime errors are surfaced on-screen via the `window.onerror` handler writing into `#error-log` at the top of `index.html`.

When changing a JS or CSS file, bump its `?v=N` cache-busting query string in `index.html` so browsers pick up the new version.

## Architecture

- **Script load order matters.** `index.html` loads `fish-data.js` then `game.js` as classic scripts sharing one global scope (no modules). `game.js` relies on globals from `fish-data.js`: `FISH_SPECIES`, `getRandomFishForDepth(...)`, and the zone helpers/constants (`REEF_WX_*`, `isInReefZone`, `OILRIG_WX*`, `isInOilRigZone`).
- **`game.js` is a single ~8500-line file (42 `// ====` banners: Grep a banner, then Read with offset/limit, never read it whole)** organized by `// ====` banner sections: global state and DOM element lookups at the top, then minigames (fishing, battery recharge, detektor), `update()`, a large block of `draw*` canvas rendering functions, menu/shop/inventory/dialogue logic, and finally `gameLoop()` plus init calls at the bottom (`syncRelicsHud(); initFishingRingSvg(); initMenuButtons(); updateInventoryUI(); gameLoop();`).
- **All state is module-level `let`/`const` globals** (e.g. `gold`, `danger`, `battery`, `inventory`, `gameTime`, `fishingMode`, `detektorMode`, `currentMenu`, `dialogueActive`). Mode flags gate input handling in the single `keydown` listener — check which flags are active when adding new interactions. `restartGame()` must reset any new state you add, and persistent progress must also be added to `saveGame()`/`loadGame()` (localStorage key `deep-awakes-save-v1`, autosaved every 15 s, on docking, selling and page unload).
- **Procedural detail uses `hash(n)`** (a sin-based pseudo-random hash) and, for one-off generation like cloud sprites, `makeRng(seed)`; both are deterministic, so the world looks the same every load.
- **World coordinates:** everything lives on a horizontal world axis (`worldWidth = 34000`, centered on 0; fishing spots and wildlife counts scale with it). `player.x` is the boat's world X; `camera.x = player.x - canvas.width / 2`. Draw functions convert world X (`wx`) to screen X by subtracting `camera.x`. The vertical layout is anchored on `getSurfaceY()` (40% of canvas height): sky/land above, water/seabed below. Named locations (`LIGHTHOUSE_WX`, `HARBOUR_WX`, `TOWN_WX`, `START_X`, reef zone, oil rig zone) are fixed world-X positions; use the constants, not raw numbers. The seabed height at a world X is `seabedYAt(wx)` and a coast layer's ridge is `coastTopY(...)` — anything standing on them should use these.
- **Rendering vs. UI:** the world (sky, sea, boat, fish, reef, oil rig, creatures, weather) is drawn each frame on the canvas. HUD, minigames, shops, inventory and dialogue are DOM overlays defined in `index.html` and styled by the matching CSS file (`fishing-minigame.css`, `detektor-minigame.css`, `market.css`, `inventory.css`, base `style.css`); `game.js` toggles and updates them.
- **Time is real seconds, never frames.** `gameLoop()` computes `frameDt` (clamped seconds since the last frame); anything that moves, drains or spawns over time must scale by it (values tuned "per 60 Hz frame" use `frameDt * 60`). Per-frame increments make the game run faster on high-refresh monitors.
- **Subsystems** (cargo hold grid and gear, minigames, danger, underwater lighting, boat models, harbour extras): details in [docs/architecture.md](docs/architecture.md); read the relevant section before touching them. Rules that always hold: add fish with `placeInHold()` (never `inventory.push`); change danger only through `addDanger(n)`; draw new underwater objects before `drawUnderwaterDarkness()` and register new light sources with `addGlow`.

## Conventions

- All player-facing text (UI labels, fish names/descriptions, dialogue) is in **Czech**; code identifiers and comments are in English. The relic-search mechanic is called "Detektor" (an older name for it is retired — don't reintroduce it).
- Fish species are data entries in `FISH_SPECIES` (`id`, `name`, `rarity`: common/uncommon/rare/aberrant, `weight` range in kg with optional `priceMult`, `difficulty`/`traits`/`shape` for the fishing minigame, `depthMin`/`depthMax`, `timeOfDay`; reef species are flagged `reefOnly: true`). Each catch is an instance from `makeCaughtFish()` with its own weight and price. Add new fish there rather than in `game.js`.
- Player messages: `triggerDialogue()` pauses the game (story beats, warnings that need reading); `showToast(text, rgb)` is a short non-blocking note for in-play events (attacks, finished contracts, spoiling catch).
- Sound is procedural WebAudio (no audio files): ambient loops are updated in `updateSound()`, one-shot cues are `play*()` helpers built on `sfxTone`/`sfxNoise`.

## Sub-agents

Project-specific (`.claude/agents/`): `underwater-lighting-reviewer` after adding an underwater object, light or glow; `fish-balance-reviewer` after editing `fish-data.js`. The global agents (`code-scout`, `frame-time-auditor`, `state-integrity-checker`, `czech-text-checker`) are used as the global instructions say.

## Docs

- [docs/claude-code-prirucka.md](docs/claude-code-prirucka.md): Czech handbook for Claude Code setup (plugins, settings, token-saving habits). Read it when the user asks about Claude Code configuration or token usage.
