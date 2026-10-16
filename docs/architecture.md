# Architecture details (The Deep Awakes)

Subsystem notes moved out of `CLAUDE.md`; read the relevant section before changing that area.

## Cargo hold and gear
The cargo hold is a grid, not a list: `inventory` is still an array of fish, but each has a footprint (`fw`×`fh`, from `fishFootprint()` in `fish-data.js`, by weight) and a spot (`gx`, `gy`, `rot`) in a 7 × (2 + hull level) grid. Add fish with `placeInHold()` (never `inventory.push`), check room with `findCargoSpot()`; the grid UI is drag-and-drop in `updateInventoryUI()`/`startCargoDrag()`. Equipment (`GEAR_DEFS`, array `gear`) lives in the same grid and gives passive bonuses while loaded (`hasGear(id)`); use `holdItems()` for fish + gear, and `placeGear()` to load one. Attacks from the deep also damage the hull (`hullDamage`, 3 slots): slower boat until repaired at the harbour.

## Minigames
Minigames (fishing, detektor relic search, battery recharge) share a pattern: a moving needle/sweep with randomly generated green zones, hits-to-complete counters, and a red-streak failure limit, each with `tryStart*`, `try*Hit`, `end*Success`, `end*Fail`, and `update*HudVisuals` functions.

## Danger ("Šílenství")
The danger system: `danger` (0–12) ticks up every 5s in `update()` based on night, distance from center ("deep"), being in the reef, and aberrant items carried (divided by the `upgrades.hull` multiplier), and falls under the lighthouse; catching fish/finding relics add flat amounts, docking reduces it. It drives HUD warnings, canvas distortion (≥6), horror visuals (deep eyes, tentacles, shadow creature), and game over at 12 when not docked. Change it through `addDanger(n)`, which keeps it within 0–12.

## Underwater lighting
The depths are black except where light reaches. In `gameLoop()` everything below the surface is first drawn as if lit (water, seabed, reef, fish, jellyfish, marine snow), then `drawUnderwaterDarkness()` composites an offscreen darkness layer with holes cut for the headlight cone (state in `headlight`, from `computeHeadlight()`/battery/`headlightOn`) and for glows registered via `addGlow(x, y, r, strength, color)` during drawing. Things that glow on their own (beam haze, coral/jelly bloom, bioluminescent wake, deep eyes, water surface) are drawn after the darkness pass. The downward beam is deliberately small: its width and reach (`headlight.halfW`/`reachPx`) and the bow lamp's forward beam (`bowLen`) grow only with the light upgrade (`upgrades.lights`), which also tilts rarity weights toward better fish while the lamp is lit (`lightLevel` in `getRandomFishForDepth`). New underwater objects go before it; new light sources call `addGlow`.

## Boat models and extras
The boat's look follows the hull level (`BOAT_MODELS`, `getBoatModel()`, drawn in `drawBoatSide()` — keep the lamp at sprite (-76,-53) and the rods/exhaust positions the same in every model). Turbo is Shift (`boost*` globals, drained in `update()`), `floatCrates` are random flotsam rewards, a flawless catch (`redStreak === 0`) sells for +25 %.

## Harbour scene extras
The village (`drawTownBuildings`) is a terraced hill drawn from `villageHillY`; on arrival `startMooring()` makes the boat tie a rope to the pier or drop an anchor (`moor`), and on leaving the boat waits until it is cast off before it can move. Fish leap and splash now and then (`fishLeaps`, `splashes`). The harbour menus are fixed in the top-right corner.
