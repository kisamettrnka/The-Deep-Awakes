# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"The Deep Awakes" — a 2D side-view, DREDGE-inspired fishing/horror browser game. Plain HTML + CSS + vanilla JavaScript rendered on a `<canvas>`. No build step, no package manager, no tests, no linter.

## Running

Open `index.html` directly in a browser, or serve the folder statically (e.g. `python -m http.server`) and open it. Runtime errors are surfaced on-screen via the `window.onerror` handler writing into `#error-log` at the top of `index.html`.

When changing a JS or CSS file, bump its `?v=N` cache-busting query string in `index.html` so browsers pick up the new version.

## Architecture

- **Script load order matters.** `index.html` loads `fish-data.js` then `game.js` as classic scripts sharing one global scope (no modules). `game.js` relies on globals from `fish-data.js`: `FISH_SPECIES`, `getRandomFishForDepth(...)`, and the zone helpers/constants (`REEF_WX_*`, `isInReefZone`, `OILRIG_WX*`, `isInOilRigZone`).
- **`game.js` is a single ~4000-line file** organized by `// ====` banner sections: global state and DOM element lookups at the top, then minigames (fishing, battery recharge, detektor), `update()`, a large block of `draw*` canvas rendering functions, menu/shop/inventory/dialogue logic, and finally `gameLoop()` plus init calls at the bottom (`syncRelicsHud(); initFishingRingSvg(); initMenuButtons(); updateInventoryUI(); gameLoop();`).
- **All state is module-level `let`/`const` globals** (e.g. `gold`, `danger`, `battery`, `inventory`, `gameTime`, `fishingMode`, `detektorMode`, `currentMenu`, `dialogueActive`). Mode flags gate input handling in the single `keydown` listener — check which flags are active when adding new interactions. `restartGame()` must reset any new state you add.
- **World coordinates:** everything lives on a horizontal world axis (`worldWidth = 22000`, centered on 0). `player.x` is the boat's world X; `camera.x = player.x - canvas.width / 2`. Draw functions convert world X (`wx`) to screen X by subtracting `camera.x`. The vertical layout is anchored on `getSurfaceY()` (40% of canvas height): sky/land above, water/seabed below. Named locations (lighthouse `LIGHTHOUSE_WX`, dock/village, reef zone, oil rig zone) are fixed world-X positions.
- **Rendering vs. UI:** the world (sky, sea, boat, fish, reef, oil rig, creatures, weather) is drawn each frame on the canvas. HUD, minigames, shops, inventory and dialogue are DOM overlays defined in `index.html` and styled by the matching CSS file (`fishing-minigame.css`, `detektor-minigame.css`, `market.css`, `inventory.css`, base `style.css`); `game.js` toggles and updates them.
- **Minigames** (fishing, detektor relic search, battery recharge) share a pattern: a moving needle/sweep with randomly generated green zones, hits-to-complete counters, and a red-streak failure limit, each with `tryStart*`, `try*Hit`, `end*Success`, `end*Fail`, and `update*HudVisuals` functions.
- **Danger ("Šílenství") system:** `danger` (0–12) ticks up every 5s in `update()` based on night, distance from center ("deep"), being in the reef, and aberrant items carried (divided by the `upgrades.hull` multiplier); catching fish/finding relics add flat amounts, docking reduces it. It drives HUD warnings, canvas distortion (≥6), horror visuals (deep eyes, tentacles, shadow creature), and game over at 12 when not docked.

## Conventions

- All player-facing text (UI labels, fish names/descriptions, dialogue) is in **Czech**; code identifiers and comments are in English. The relic-search mechanic is called "Detektor" (formerly "Dredge"/"dredž" — don't reintroduce that term).
- Fish species are data entries in `FISH_SPECIES` (`id`, `name`, `rarity`: common/uncommon/rare/aberrant, `price`, `depthMin`/`depthMax`, `timeOfDay`; reef species are flagged `reefOnly: true`). Add new fish there rather than in `game.js`.

## Docs

- [docs/claude-code-prirucka.md](docs/claude-code-prirucka.md): Czech handbook for Claude Code setup (plugins, settings, token-saving habits). Read it when the user asks about Claude Code configuration or token usage.
