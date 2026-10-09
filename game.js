// =====================================================================
// THE DEEP AWAKES — Game Engine
// DREDGE-style visuals with foreground lighthouse
// =====================================================================

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const fishingUI = document.getElementById("fishing-ui");
const fishingNeedleEl = document.getElementById("fishing-needle");
const fishingGreenArcsEl = document.getElementById("fishing-green-arcs");
const catchGaugeEl = document.getElementById("catch-gauge-canvas");
const fishingResultEl = document.getElementById("fishing-result");

const detektorUI = document.getElementById("detektor-ui");
const detektorZonesEl = document.getElementById("detektor-zones");
const detektorSweepEl = document.getElementById("detektor-sweep");
const detektorExtractFillEl = document.getElementById("detektor-extract-fill");
const detektorRedHintEl = document.getElementById("detektor-red-hint");
const detektorRedCountEl = document.getElementById("detektor-red-count");
const detektorResultEl = document.getElementById("detektor-result");

// Dock, market, oil rig, inventory and dialogue panels
const dockMenuUI = document.getElementById("dock-menu-ui");
const marketUI = document.getElementById("market-ui");
const oilrigUI = document.getElementById("oilrig-ui");
const inventoryUI = document.getElementById("inventory-ui");
const inventoryGridEl = document.getElementById("inventory-grid");
const inventoryCapacityEl = document.getElementById("inventory-capacity");

const dialogUI = document.getElementById("dialog-ui");
const dialogSpeakerEl = document.getElementById("dialog-speaker");
const dialogTextEl = document.getElementById("dialog-text");
const btnDialogNext = document.getElementById("btn-dialog-next");

const btnOpenMarket = document.getElementById("btn-open-market");
const btnRepairShip = document.getElementById("btn-repair-ship");
const btnLeaveDock = document.getElementById("btn-leave-dock");

const btnSellFish = document.getElementById("btn-sell-fish");
const btnBackMarket = document.getElementById("btn-back-market");
const marketResultEl = document.getElementById("market-result");

// Oil Rig UI elements
const btnUpgradeEngine = document.getElementById("btn-upgrade-engine");
const btnUpgradeLights = document.getElementById("btn-upgrade-lights");
const btnUpgradeHull = document.getElementById("btn-upgrade-hull");
const btnBackOilrig = document.getElementById("btn-back-oilrig");
const oilrigResultEl = document.getElementById("oilrig-result");

// Lighthouse Shop UI elements
const lighthouseShopUI = document.getElementById("lighthouse-shop-ui");
const btnUpgradeRodQuality = document.getElementById("btn-upgrade-rod-quality");
const btnUpgradeRodLine = document.getElementById("btn-upgrade-rod-line");
const btnUpgradeRodBait = document.getElementById("btn-upgrade-rod-bait");
const btnBackLighthouse = document.getElementById("btn-back-lighthouse");
const lighthouseResultEl = document.getElementById("lighthouse-result");

let fishingMode = false;
let fishingLocked = false;
let catchProgress = 0;
let redStreak = 0; // misses during the current catch — they accumulate, a hit does not clear them

let currentFishingZones = [];    // [start, end] angle pairs in rad, clockwise from 12:00

// The fish on the line is rolled when the minigame starts; its difficulty drives the parameters
let hookedFish = null;
let fishingParams = null;
let fishingNeedleAngle = 0;      // rad, clockwise from 12:00
let fishingNeedleDir = 1;        // 1 = clockwise, -1 = counter-clockwise ("reverse" trait)
let fishingNextReverseAt = 0;    // ms timestamp
let fishingDriftDir = 1;         // direction green zones wander ("drift" trait)
let fishingHitPulse = 0;         // 1 → 0, drives the centre-view reaction to a hit
let fishingMissPulse = 0;        // 1 → 0, same for a miss

// When the catch is lost the line snaps and the fish bolts — played over FISHING_ESCAPE_MS
const FISHING_ESCAPE_MS = 1250;
let fishingEscapeAt = 0;         // performance.now() of the snap, 0 = no escape in progress
let escapeCapture = null;        // where the fish was in the ring at the moment of the snap
let gaugeEscapeP = -1;           // gauge progress frozen at the snap

function fishingEscapeProgress() {
  return fishingEscapeAt ? Math.min(1, (performance.now() - fishingEscapeAt) / FISHING_ESCAPE_MS) : 0;
}

/** Base needle speed (rad/s) at difficulty 1; each level adds FISHING_SPEED_PER_LEVEL */
const FISHING_SPIN_SPEED = 3.1;
const FISHING_SPEED_PER_LEVEL = 0.3;
/** Green zones wander this fast (rad/s) for fish with the "drift" trait */
const FISHING_DRIFT_SPEED = 0.55;

function getFishingParams(fish) {
  const d = Math.max(1, Math.min(5, fish.difficulty || 1));
  return {
    difficulty: d,
    traits: fish.traits || [],
    spinSpeed: FISHING_SPIN_SPEED + (d - 1) * FISHING_SPEED_PER_LEVEL,
    zoneHalfWidth: 0.34 - (d - 1) * 0.04,
    twoZoneChance: 0.55 - (d - 1) * 0.1,
    hitsToLand: 3 + Math.floor((d - 1) / 2),
    // Progress per second while the needle spins — slow next to a hit (1 / hitsToLand)
    passiveRise: 0.03 - (d - 1) * 0.004,
    // Fraction of one hit the fish takes back on a miss
    missSlip: 0.35 + (d - 1) * 0.1
  };
}

function fishHasTrait(trait) {
  return !!fishingParams && fishingParams.traits.includes(trait);
}

function generateFishingGreenZones() {
  const params = fishingParams || getFishingParams({ difficulty: 1 });
  const extraWidth = (rodUpgrades.quality - 1) * 0.12;
  let halfWidth = params.zoneHalfWidth + extraWidth;
  // "shrink": the closer to landing, the narrower the window
  if (fishHasTrait("shrink")) halfWidth *= 1 - 0.45 * Math.min(1, catchProgress);
  halfWidth = Math.max(0.1, halfWidth);
  const numZones = Math.random() < params.twoZoneChance ? 2 : 1;
  const zones = [];
  for (let i = 0; i < numZones; i++) {
    const center = Math.random() * Math.PI * 2;
    zones.push([center - halfWidth, center + halfWidth]);
  }
  return zones;
}

function getBubbleActivateRadius() {
  return 130 + (rodUpgrades.bait - 1) * 30; // Lvl 1: 130, Lvl 2: 160, Lvl 3: 190
}

function getMaxRedStreak() {
  return 3 + (rodUpgrades.line - 1); // Lvl 1: 3, Lvl 2: 4, Lvl 3: 5
}

const DETEKTOR_ACTIVATE_RADIUS = 120;
const DETEKTOR_SWEEP_PERIOD_SEC = 2.85;
const DETEKTOR_HITS_TO_RELIC = 5;
const DETEKTOR_HIT_SLACK = 0.018;

let detektorMode = false;
let detektorLocked = false;
let detektorStartTime = 0;
let detektorProgress = 0;
let detektorRedStreak = 0;
/** @type {{ wx: number, taken: boolean } | null} */
let activeDetektorSpot = null;
/** @type {{ left: number, width: number }[]} */
let detektorZones = [];

let relicsFound = 0;

// --- Lighthouse ---
const LIGHTHOUSE_WX = 2550; // on its cliff just west of the harbour
const HARBOUR_WX = 2720;    // the pier where the boat docks
const TOWN_WX = 3020;       // the village on the hills behind the harbour
const START_X = 2200;       // where every voyage begins
const LIGHTHOUSE_CLIFF_W = 260;
const LIGHTHOUSE_CLIFF_H = 170;

const goldUI = document.getElementById("gold");
const fishUI = document.getElementById("fish");
const dangerUI = document.getElementById("danger");
const clockEl = document.getElementById("clock");
const dayEl = document.getElementById("day-label");
const relicsEl = document.getElementById("relics");

// Upgrades, Inventory, Dialogue, Shake, Weather states
let inventory = [];
const upgrades = {
  engine: 1,
  lights: 1,
  hull: 1
};
const upgradeCosts = {
  engine: [150, 300, 500],
  lights: [120, 240, 420],
  hull: [200, 350, 600]
};

const rodUpgrades = {
  quality: 1,
  line: 1,
  bait: 1
};
const rodUpgradeCosts = {
  quality: [80, 180, 320],
  line: [100, 220, 400],
  bait: [120, 260, 450]
};

let dockActive = false;
let currentMenu = null; // "dock", "market", "oilrig", "lighthouse", "dialog"
let dialogueActive = false;
let dialogueQueue = [];
let currentDialogue = null;
let typewriterIndex = 0;
let typewriterTimer = null;
let inventoryOpen = false;

let shakeIntensity = 0;
let gameOver = false;

let rainParticles = [];
let smokeParticles = []; // exhaust smoke from the funnel

// =====================================================================
// FLASHLIGHT / BATTERY SYSTEM
// Phase 1: Limited battery (drains over time, weak glow when dead)
// Phase 2: Recharge kit bought at oil rig → recharge via minigame (max 3x)
// Phase 3: Engine Lvl 3+ → slow auto-recharge from motor
// =====================================================================
const BATTERY_MAX = 100;          // 100 = full
// Battery runs on real seconds: a full charge lasts ~3 min by day, ~2 min at night
const BATTERY_DRAIN_PER_SEC = 0.55;
const BATTERY_MOTOR_CHARGE_PER_SEC = 0.35; // engine level 3+, while sailing
const RECHARGE_KIT_COST = 90;
const RECHARGE_KIT_USES = 3;
let battery = BATTERY_MAX;        // current battery %
let batteryRechargesLeft = 0;     // number of recharges left (max 3 after purchase)

// Recharge minigame state
let rechargeMinigameActive = false;
let rechargeMinigameLocked = false;
let rechargeMinigameProgress = 0;  // 0..1
let rechargeMinigameStart = 0;     // timestamp
const RECHARGE_NEEDLE_SPEED = 2.2; // rad/s
const RECHARGE_HITS_TO_FULL = 5;
let rechargeCurrentZones = [];
let rechargeRedStreak = 0;
const RECHARGE_MAX_RED = 3;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

resize();
window.addEventListener("resize", resize);

const surfaceRatio = 0.4;
function getSurfaceY() {
  return canvas.height * surfaceRatio;
}

const player = {
  x: START_X,
  speed: 2.8
};

let keys = {};
let fish = [];
const shoals = [];
const jellies = [];
const watchers = [];
let boatVx = 0;
let lastWildlifePX = null;
let wildFishing = false;

// Headlight: the player can switch it off (L) to save the battery
let headlightOn = true;
let headlight = { on: true, pct: 1, flicker: 1, dead: false, strength: 1, halfW: 58, reachPx: 150, bowLen: 240, r: 110, g: 220, b: 170 };
let batteryDeadWarned = false;
let gameWon = false;

// The boat swings round to face where it sails (eased −1…1)
let boatFacing = 1;           // direction of travel (eased −1…1); the cabin points this way
let boatFacingTarget = 1;
const BOAT_LAMP_X = 76;       // bow lamp on the cabin roof, in px ahead of the boat's centre
const BOAT_LAMP_DY = -68;     // ...and its height above the keel line
let fishJournal = {};          // species id → { count, best }
let seabedFeatures = [];

let gold = 0;
let caughtFish = 0;
let danger = 0;
let gameTime = 7.75;
let dayNum = 1;

// Day/night clock runs on real time, independent of monitor refresh rate.
// 1 in-game hour = 60 real seconds → full day = 24 minutes.
const GAME_HOURS_PER_SECOND = 1 / 60;
let frameDt = 1 / 60;          // seconds since previous frame (clamped)
let lastFrameTime = performance.now();

const worldWidth = 34000;

const camera = {
  x: START_X - window.innerWidth / 2
};

const detektorSpots = [];
const bubbleSpots = [];

function hash(n) {
  // Proper pseudo-random hash; the old frac(n·0.318) made procedural details repeat visibly
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function seedWorld() {
  seedWildlife();

  seabedFeatures.length = 0;
  for (let wx = -worldWidth / 2; wx < worldWidth / 2; wx += 120) {
    const h = 40 + hash(wx) * 70;
    seabedFeatures.push({ wx, height: h, w: 100 + hash(wx + 99) * 80 });
  }

  detektorSpots.length = 0;
  for (let i = 0; i < 8; i++) {
    detektorSpots.push({
      wx: -worldWidth / 2 + (i + 0.5) * (worldWidth / 8) + (Math.random() - 0.5) * 200,
      taken: false
    });
  }

  bubbleSpots.length = 0;
  const span = worldWidth - 400;
  const spotCount = Math.round(worldWidth / 1000);
  for (let i = 0; i < spotCount; i++) {
    bubbleSpots.push({
      wx: -worldWidth / 2 + 200 + (span / (spotCount - 1)) * i + (hash(i * 17) - 0.5) * 160,
      phase: hash(i * 41) * Math.PI * 2
    });
  }

  // Extra dense bubble spots in the coral reef zone
  const reefSpan = REEF_WX_END - REEF_WX_START;
  for (let i = 0; i < 14; i++) {
    bubbleSpots.push({
      wx: REEF_WX_START + 100 + (reefSpan - 200) * (i / 13) + (hash(i * 53 + 7) - 0.5) * 80,
      phase: hash(i * 61 + 99) * Math.PI * 2,
      reef: true
    });
  }
}

seedWorld();

function normalizeAngle(a) {
  const t = a % (Math.PI * 2);
  return t < 0 ? t + Math.PI * 2 : t;
}

function angleInSpan(theta, a0, a1) {
  const t = normalizeAngle(theta);
  const z0 = normalizeAngle(a0);
  const z1 = normalizeAngle(a1);
  if (z0 <= z1) return t >= z0 && t <= z1;
  return t >= z0 || t <= z1;
}


function ringArcD(cx, cy, r, a0, a1) {
  let span = normalizeAngle(a1 - a0);
  if (span < 1e-6) span = Math.PI * 2 - 1e-6;
  const x0 = cx + r * Math.sin(a0);
  const y0 = cy - r * Math.cos(a0);
  const x1 = cx + r * Math.sin(a1);
  const y1 = cy - r * Math.cos(a1);
  const large = span > Math.PI ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

function initFishingRingSvg() {
  if (!fishingGreenArcsEl) return;
  const cx = 100;
  const cy = 100;
  const r = 72;
  const d = currentFishingZones.map(([a0, a1]) => ringArcD(cx, cy, r, a0, a1)).join(" ");
  fishingGreenArcsEl.setAttribute("d", d);
}

function isNeedleInGreen(theta) {
  return currentFishingZones.some(([a0, a1]) => angleInSpan(theta, a0, a1));
}

function syncRelicsHud() {
  const questEl = document.getElementById("quest");
  if (questEl && questEl.firstChild && questEl.firstChild.nodeType === 3) {
    questEl.firstChild.nodeValue = relicsFound >= 7 ? "Kletba je zlomena " : "Seber všechny relikvie ";
  }
  if (relicsEl) relicsEl.textContent = relicsFound >= 7 ? "✓" : `${Math.min(relicsFound, 6)} / 6`;
}

// Danger always stays within 0–12 (the bar and the game-over check rely on it)
function addDanger(amount) {
  danger = Math.max(0, Math.min(12, danger + amount));
  if (dangerUI) dangerUI.innerText = Math.round(danger);
}

function getDetektorSpotNearPlayer() {
  let best = null;
  let bestD = DETEKTOR_ACTIVATE_RADIUS;
  for (let i = 0; i < detektorSpots.length; i++) {
    const spot = detektorSpots[i];
    if (spot.taken) continue;
    const d = Math.abs(spot.wx - player.x);
    if (d < bestD) {
      bestD = d;
      best = spot;
    }
  }
  return best;
}

function getBubbleNearPlayer() {
  let best = null;
  let bestD = getBubbleActivateRadius();
  for (let i = 0; i < bubbleSpots.length; i++) {
    const spot = bubbleSpots[i];
    if (spot.stock < 1) continue;
    const d = Math.abs(spot.wx - player.x);
    if (d < bestD) {
      bestD = d;
      best = spot;
    }
  }
  return best;
}

// =====================================================================
// FISHING — depth gauge: the hooked fish is hauled from the dark up to the surface
// =====================================================================

let gaugeShown = 0;      // eased copy of catchProgress so every pull glides instead of jumping
let gaugeBubbles = [];

function gaugeRoundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function resetCatchGauge() {
  gaugeShown = 0;
  gaugeBubbles = [];
}

function drawCatchGauge(dt) {
  const c = catchGaugeEl;
  if (!c || !hookedFish || !fishingParams) return;
  const g = c.getContext("2d");
  const W = 56, H = 180;
  const K = c.width / W;
  const t = performance.now() / 1000;
  const d = fishingParams.difficulty;

  const esc = fishingEscapeProgress();
  if (esc > 0) {
    if (gaugeEscapeP < 0) gaugeEscapeP = gaugeShown;
  } else {
    gaugeEscapeP = -1;
    gaugeShown += (catchProgress - gaugeShown) * Math.min(1, dt * 7);
  }
  const p = Math.max(0, Math.min(1, esc > 0 ? gaugeEscapeP : gaugeShown));
  const fall = esc * esc;

  g.setTransform(K, 0, 0, K, 0, 0);
  g.clearRect(0, 0, W, H);

  const tubeX = 7, tubeW = 28, top = 18, bot = H - 8;
  const cx = tubeX + tubeW / 2;
  const travelTop = top + 14, travelBot = bot - 14;
  const fishY0 = travelBot - p * (travelBot - travelTop);
  // After the snap the fish drops back into the dark
  const fishY = fishY0 + (bot + 16 - fishY0) * fall;
  const shake = Math.sin(t * 46) * fishingMissPulse * 3;
  const fishX = cx + Math.sin(t * (1.4 + d * 0.35)) * (2 + d * 1.1) + shake;
  const rgb = fishHexToRgb(hookedFish.color || "#8aa6b5");
  const aberrant = hookedFish.rarity === "aberrant";

  // Tube glass with the water inside: bright at the surface, black in the deep
  g.save();
  gaugeRoundRect(g, tubeX, top, tubeW, bot - top, 8);
  g.clip();
  const water = g.createLinearGradient(0, top, 0, bot);
  water.addColorStop(0, "#3d8a8a");
  water.addColorStop(0.3, "#1a4a56");
  water.addColorStop(0.7, "#082028");
  water.addColorStop(1, "#010406");
  g.fillStyle = water;
  g.fillRect(tubeX, top, tubeW, bot - top);

  // Light shafts sliding down from the surface
  g.globalCompositeOperation = "screen";
  for (let k = 0; k < 2; k++) {
    const sx = tubeX + ((k * 0.55 + t * 0.05) % 1.2) * tubeW - 4;
    const sh = g.createLinearGradient(0, top, 0, top + 90);
    sh.addColorStop(0, "rgba(170,235,230,0.18)");
    sh.addColorStop(1, "rgba(170,235,230,0)");
    g.fillStyle = sh;
    g.beginPath();
    g.moveTo(sx, top);
    g.lineTo(sx + 7, top);
    g.lineTo(sx + 1, top + 90);
    g.lineTo(sx - 9, top + 90);
    g.fill();
  }
  g.globalCompositeOperation = "source-over";

  // Hit-step notches: one for every hit still needed, lit once the fish has passed them
  const steps = fishingParams.hitsToLand;
  for (let k = 1; k < steps; k++) {
    const ny = travelBot - (k / steps) * (travelBot - travelTop);
    const reached = p >= k / steps - 1e-3;
    g.strokeStyle = reached ? "rgba(90,235,150,0.55)" : "rgba(200,220,220,0.16)";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(tubeX, ny);
    g.lineTo(tubeX + 7, ny);
    g.moveTo(tubeX + tubeW - 7, ny);
    g.lineTo(tubeX + tubeW, ny);
    g.stroke();
  }

  // Fishing line from the rod tip down to the fish, slack when it is calm and taut when it pulls
  const taut = Math.min(1, 0.25 + fishingHitPulse * 0.6 + fishingMissPulse * 0.4);
  g.strokeStyle = `rgba(240,236,220,${0.5 + fishingHitPulse * 0.35})`;
  g.lineWidth = 1;
  if (esc === 0) {
    g.beginPath();
    g.moveTo(cx, top - 4);
    g.quadraticCurveTo(cx + Math.sin(t * 2.2) * 5 * (1 - taut), (top + fishY) / 2, fishX, fishY - 9);
    g.stroke();
  } else {
    // Snapped: the upper line recoils to the ring, a short strand follows the sinking fish
    const up = 1 - Math.pow(1 - Math.min(1, esc * 2.6), 3);
    const cutY = (fishY0 - 9) + (top - 4 - (fishY0 - 9)) * up;
    g.beginPath();
    g.moveTo(cx, top - 4);
    g.quadraticCurveTo(cx + Math.sin(t * 36) * 5 * (1 - up), (top + cutY) / 2, cx + Math.sin(t * 40) * 3 * (1 - up), cutY);
    g.stroke();
    g.strokeStyle = `rgba(240,236,220,${0.5 * (1 - esc)})`;
    g.beginPath();
    g.moveTo(fishX, fishY - 9);
    g.quadraticCurveTo(fishX + Math.sin(t * 26) * 4, fishY - 15, fishX + Math.sin(t * 21) * 5, fishY - 22 + esc * 8);
    g.stroke();
  }

  // Bubbles trailing off the fish
  if (Math.random() < dt * (3 + d * 2)) {
    gaugeBubbles.push({ x: fishX + (Math.random() - 0.5) * 6, y: fishY - 6, r: 0.8 + Math.random() * 1.4, v: 14 + Math.random() * 16, ph: Math.random() * 6 });
  }
  for (let i = gaugeBubbles.length - 1; i >= 0; i--) {
    const b = gaugeBubbles[i];
    b.y -= b.v * dt;
    if (b.y < top + 2) { gaugeBubbles.splice(i, 1); continue; }
    g.strokeStyle = `rgba(200,240,240,${Math.min(0.6, (b.y - top) / 40)})`;
    g.lineWidth = 0.8;
    g.beginPath();
    g.arc(b.x + Math.sin(t * 4 + b.ph) * 1.5, b.y, b.r, 0, Math.PI * 2);
    g.stroke();
  }

  // The fish itself — head up, tail beating harder for tougher species
  if (aberrant) {
    const ag = g.createRadialGradient(fishX, fishY, 1, fishX, fishY, 20);
    ag.addColorStop(0, `rgba(210,40,60,${0.45 + 0.2 * Math.sin(t * 4)})`);
    ag.addColorStop(1, "rgba(210,40,60,0)");
    g.fillStyle = ag;
    g.fillRect(tubeX, fishY - 22, tubeW, 44);
  }
  g.save();
  if (esc > 0) g.globalAlpha = 1 - 0.85 * fall;
  g.translate(fishX, fishY);
  g.rotate(-Math.PI / 2 + Math.sin(t * (5 + d * 1.5)) * 0.1 + shake * 0.05);
  const flap = Math.sin(t * (8 + d * 2.5));
  g.fillStyle = fishShade(rgb, -0.2);
  g.beginPath();
  g.moveTo(-6, 0);
  g.lineTo(-14, -6 + flap * 2.5);
  g.quadraticCurveTo(-11, flap * 1.5, -14, 6 + flap * 2.5);
  g.closePath();
  g.fill();
  const body = g.createLinearGradient(0, -6, 0, 6);
  body.addColorStop(0, fishShade(rgb, 0.3));
  body.addColorStop(0.55, fishShade(rgb, 0));
  body.addColorStop(1, fishShade(rgb, -0.4));
  g.fillStyle = body;
  g.beginPath();
  g.ellipse(0, 0, 10, 6, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "rgba(225,242,255,0.35)";
  g.lineWidth = 0.8;
  g.stroke();
  g.fillStyle = "#f2efe6";
  g.beginPath();
  g.arc(6, -1.8, 1.7, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#050505";
  g.beginPath();
  g.arc(6.4, -1.8, 0.9, 0, Math.PI * 2);
  g.fill();
  g.restore();

  // Surface waves over the top of the water
  g.strokeStyle = "rgba(210,248,245,0.7)";
  g.lineWidth = 1.2;
  g.beginPath();
  for (let x = tubeX; x <= tubeX + tubeW; x += 2) {
    const y = top + 3 + Math.sin(x * 0.55 + t * 3) * 1.3;
    if (x === tubeX) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.stroke();

  // Flash inside the tube on hit / miss
  if (fishingHitPulse > 0) {
    g.fillStyle = `rgba(110,255,170,${fishingHitPulse * 0.22})`;
    g.fillRect(tubeX, top, tubeW, bot - top);
  }
  if (fishingMissPulse > 0) {
    g.fillStyle = `rgba(255,60,50,${fishingMissPulse * 0.28})`;
    g.fillRect(tubeX, top, tubeW, bot - top);
  }
  g.restore();

  // Glass rim and wooden frame
  g.lineWidth = 3;
  g.strokeStyle = "#2a1e18";
  gaugeRoundRect(g, tubeX, top, tubeW, bot - top, 8);
  g.stroke();
  g.lineWidth = 1;
  g.strokeStyle = esc > 0 ? `rgba(255,80,70,${Math.max(0.35, 1 - esc)})`
    : fishingHitPulse > 0 ? `rgba(110,255,170,${0.35 + fishingHitPulse * 0.6})`
    : fishingMissPulse > 0 ? `rgba(255,80,70,${0.35 + fishingMissPulse * 0.6})` : "rgba(150,120,95,0.45)";
  gaugeRoundRect(g, tubeX - 1.5, top - 1.5, tubeW + 3, bot - top + 3, 9);
  g.stroke();

  // Rod tip anchor at the top, and a brass ring the line passes through
  g.strokeStyle = "#a88848";
  g.lineWidth = 1.4;
  g.beginPath();
  g.arc(cx, top - 6, 3, 0, Math.PI * 2);
  g.stroke();

  // Glowing progress bar beside the tube, notched per hit
  const barX = tubeX + tubeW + 7, barW = 4;
  g.fillStyle = "rgba(255,255,255,0.08)";
  gaugeRoundRect(g, barX, top, barW, bot - top, 2);
  g.fill();
  const barH = Math.max(0, (bot - top) * p * (1 - Math.min(1, esc * 1.6)));
  if (barH > 0.5) {
    const bar = g.createLinearGradient(0, bot, 0, top);
    bar.addColorStop(0, "#1f9a5c");
    bar.addColorStop(1, p > 0.8 ? "#d8f56a" : "#5af0a0");
    g.save();
    g.shadowColor = "rgba(90,240,160,0.8)";
    g.shadowBlur = 4 + fishingHitPulse * 8;
    g.fillStyle = bar;
    gaugeRoundRect(g, barX, bot - barH, barW, barH, 2);
    g.fill();
    g.restore();
  }
  g.strokeStyle = "rgba(0,0,0,0.65)";
  g.lineWidth = 1;
  for (let k = 1; k < steps; k++) {
    const ny = bot - (k / steps) * (bot - top);
    g.beginPath();
    g.moveTo(barX - 1, ny);
    g.lineTo(barX + barW + 1, ny);
    g.stroke();
  }
}

// Advances needle, wandering zones and the slow passive reel-in by one frame
function stepFishing(dt) {
  const now = performance.now();
  let speed = fishingParams.spinSpeed;
  if (fishHasTrait("erratic")) {
    speed *= 1 + 0.45 * Math.sin(now * 0.0026) + 0.2 * Math.sin(now * 0.0071);
  }
  if (fishHasTrait("reverse") && now >= fishingNextReverseAt) {
    fishingNeedleDir *= -1;
    fishingNextReverseAt = now + 1100 + Math.random() * 2200;
  }
  fishingNeedleAngle = normalizeAngle(fishingNeedleAngle + speed * fishingNeedleDir * dt);

  if (fishHasTrait("drift")) {
    const shift = FISHING_DRIFT_SPEED * fishingDriftDir * dt;
    currentFishingZones = currentFishingZones.map(([a0, a1]) => [a0 + shift, a1 + shift]);
    initFishingRingSvg();
  }

  // The rod creeps up on its own while the needle spins
  catchProgress = Math.min(1, catchProgress + fishingParams.passiveRise * dt);

  fishingHitPulse = Math.max(0, fishingHitPulse - dt * 2.2);
  fishingMissPulse = Math.max(0, fishingMissPulse - dt * 2.2);

  if (catchProgress >= 1 - 1e-9) endFishingSuccess();
}

function updateFishingHudVisuals() {
  if (!fishingMode || !fishingNeedleEl || !fishingParams) return;
  if (fishingEscapeAt) {
    fishingHitPulse = Math.max(0, fishingHitPulse - frameDt * 2.2);
    fishingMissPulse = Math.max(0, fishingMissPulse - frameDt * 2.2);
    drawHookedFishView();
    drawCatchGauge(frameDt);
    return;
  }
  if (fishingLocked) return;
  stepFishing(frameDt);
  if (!fishingMode || fishingLocked) return;
  const deg = (fishingNeedleAngle * 180) / Math.PI;
  fishingNeedleEl.setAttribute("transform", `translate(100 100) rotate(${deg})`);
  drawHookedFishView();
  drawCatchGauge(frameDt);
}

// Web Animations restart reliably on every call (class toggling doesn't on SVG)
function flashFishingFeedback(hit) {
  const color = hit ? "#29c46a" : "#d8443c";
  const ring = document.getElementById("fishing-flash-ring");
  if (ring) {
    ring.style.stroke = color;
    ring.getAnimations().forEach((a) => a.cancel());
    ring.animate(
      [
        { opacity: 0.95, transform: "scale(1)", strokeWidth: "22px", filter: `drop-shadow(0 0 10px ${color})` },
        { opacity: 0, transform: "scale(1.3)", strokeWidth: "4px", filter: `drop-shadow(0 0 0 ${color})` }
      ],
      { duration: 420, easing: "ease-out" }
    );
  }
  const panel = fishingUI && fishingUI.querySelector(".fishing-panel");
  if (panel) {
    panel.getAnimations().forEach((a) => a.cancel());
    const glow = hit ? "rgba(41,196,106,0.55)" : "rgba(216,68,60,0.6)";
    const frames = [
      { borderColor: color, boxShadow: `0 0 0 2px ${glow}, 0 0 34px ${glow}` },
      { borderColor: "#2a1e18", boxShadow: "0 12px 40px rgba(0,0,0,0.75)" }
    ];
    if (!hit) {
      frames[0].transform = "translateX(-6px)";
      frames.splice(1, 0, { transform: "translateX(6px)", offset: 0.2 }, { transform: "translateX(-3px)", offset: 0.4 });
      frames[frames.length - 1].transform = "translateX(0)";
    }
    panel.animate(frames, { duration: hit ? 380 : 420, easing: "ease-out" });
  }
}

// =====================================================================
// FISHING — hooked fish view inside the ring
// Each species has a silhouette ("shape" in fish-data.js); the fish thrashes harder
// at higher difficulty and rises out of the murk as the catch progresses.
// =====================================================================

function fishHexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function fishShade(rgb, k, a = 1) {
  // k > 0 lightens toward white, k < 0 darkens toward black
  const t = k >= 0 ? 255 : 0;
  const m = Math.abs(k);
  return `rgba(${Math.round(rgb.r + (t - rgb.r) * m)},${Math.round(rgb.g + (t - rgb.g) * m)},${Math.round(rgb.b + (t - rgb.b) * m)},${a})`;
}

function fishTail(g, x, wig, h, rgb) {
  g.fillStyle = fishShade(rgb, -0.15);
  g.beginPath();
  g.moveTo(x, 0);
  g.lineTo(x - h * 1.1, -h + wig * h * 0.6);
  g.quadraticCurveTo(x - h * 0.6, wig * h * 0.4, x - h * 1.1, h + wig * h * 0.6);
  g.closePath();
  g.fill();
}

function fishEye(g, x, y, r, glow) {
  g.fillStyle = glow ? "#ffdd66" : "#f2efe6";
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#050505";
  g.beginPath();
  g.arc(x + r * 0.25, y, r * 0.55, 0, Math.PI * 2);
  g.fill();
}

// Body outline with rim light so even near-black species stay readable
function fishBody(g, rx, ry, rgb) {
  const grad = g.createLinearGradient(0, -ry, 0, ry);
  grad.addColorStop(0, fishShade(rgb, 0.25));
  grad.addColorStop(0.55, fishShade(rgb, 0));
  grad.addColorStop(1, fishShade(rgb, -0.45));
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "rgba(220,240,255,0.22)";
  g.lineWidth = 1.5;
  g.stroke();
}

const FISH_SHAPES = {
  slim(g, rgb, t, wig) {
    fishTail(g, -38, wig, 13, rgb);
    fishBody(g, 44, 11, rgb);
    g.fillStyle = fishShade(rgb, -0.2);
    g.beginPath();
    g.moveTo(-6, -10);
    g.lineTo(6, -19 + wig * 2);
    g.lineTo(14, -9);
    g.fill();
    g.strokeStyle = fishShade(rgb, -0.35, 0.6);
    g.lineWidth = 1;
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      g.moveTo(-24 + k * 12, -6);
      g.quadraticCurveTo(-20 + k * 12, 0, -24 + k * 12, 6);
      g.stroke();
    }
    fishEye(g, 32, -3, 3.2);
  },
  round(g, rgb, t, wig) {
    fishTail(g, -30, wig, 16, rgb);
    fishBody(g, 34, 21, rgb);
    g.fillStyle = fishShade(rgb, -0.25);
    g.beginPath();
    g.moveTo(-12, -19);
    g.quadraticCurveTo(0, -32 + wig * 3, 14, -18);
    g.fill();
    g.beginPath();
    g.ellipse(2, 8, 9, 4, 0.6 + wig * 0.3, 0, Math.PI * 2);
    g.fill();
    fishEye(g, 22, -5, 4);
  },
  flat(g, rgb, t, wig) {
    fishTail(g, -34, wig * 0.6, 12, rgb);
    // Fringe fins ripple all round
    g.fillStyle = fishShade(rgb, -0.3, 0.8);
    g.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.2) {
      const r = 1 + 0.08 * Math.sin(a * 6 + t * 8);
      g.lineTo(Math.cos(a) * 38 * r, Math.sin(a) * 28 * r);
    }
    g.fill();
    fishBody(g, 33, 24, rgb);
    g.fillStyle = fishShade(rgb, 0.3, 0.35);
    for (let k = 0; k < 6; k++) {
      g.beginPath();
      g.arc(-16 + (k % 3) * 14, -8 + Math.floor(k / 3) * 14, 3, 0, Math.PI * 2);
      g.fill();
    }
    fishEye(g, 20, -10, 3);
    fishEye(g, 24, -2, 3);
  },
  eel(g, rgb, t, wig) {
    const seg = 22;
    for (let i = seg; i >= 0; i--) {
      const u = i / seg;
      const x = 46 - u * 100;
      const y = Math.sin(t * 7 - u * 6) * (4 + u * 10) * (0.6 + Math.abs(wig));
      const w = 9 * (1 - u * 0.75);
      g.fillStyle = fishShade(rgb, 0.15 - u * 0.4);
      g.beginPath();
      g.arc(x, y, w, 0, Math.PI * 2);
      g.fill();
    }
    fishEye(g, 44, -3, 2.8);
    g.strokeStyle = "rgba(0,0,0,0.6)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(54, 2);
    g.lineTo(46, 3);
    g.stroke();
  },
  ray(g, rgb, t, wig) {
    const flap = Math.sin(t * 4) * 10;
    g.strokeStyle = fishShade(rgb, -0.3);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-14, 0);
    g.quadraticCurveTo(-40, wig * 10, -66, wig * 16);
    g.stroke();
    g.fillStyle = fishShade(rgb, 0);
    g.beginPath();
    g.moveTo(34, 0);
    g.quadraticCurveTo(6, -40 - flap, -16, -6);
    g.lineTo(-16, 6);
    g.quadraticCurveTo(6, 40 + flap, 34, 0);
    g.fill();
    g.strokeStyle = "rgba(220,240,255,0.22)";
    g.lineWidth = 1.5;
    g.stroke();
    fishEye(g, 22, -6, 2.6);
    fishEye(g, 22, 6, 2.6);
  },
  angler(g, rgb, t, wig) {
    fishTail(g, -26, wig, 14, rgb);
    fishBody(g, 32, 26, rgb);
    // Gaping jaw with needle teeth
    g.fillStyle = "#050303";
    g.beginPath();
    g.moveTo(32, -4);
    g.lineTo(12, 6);
    g.lineTo(32, 16);
    g.fill();
    g.fillStyle = "#e8e2d0";
    for (let k = 0; k < 5; k++) {
      g.beginPath();
      g.moveTo(16 + k * 3.5, 4 + k * 0.4);
      g.lineTo(18 + k * 3.5, 9);
      g.lineTo(20 + k * 3.5, 4 + k * 0.4);
      g.fill();
    }
    // Lure on a stalk
    const lx = 46 + Math.sin(t * 2) * 4;
    const ly = -42 + Math.cos(t * 2.4) * 3;
    g.strokeStyle = fishShade(rgb, 0.2);
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(10, -24);
    g.quadraticCurveTo(30, -50, lx, ly);
    g.stroke();
    const glow = g.createRadialGradient(lx, ly, 0, lx, ly, 16);
    glow.addColorStop(0, "rgba(180,255,220,0.95)");
    glow.addColorStop(1, "rgba(180,255,220,0)");
    g.fillStyle = glow;
    g.beginPath();
    g.arc(lx, ly, 16, 0, Math.PI * 2);
    g.fill();
    fishEye(g, 18, -12, 3, true);
  },
  gulper(g, rgb, t, wig) {
    const open = 0.5 + 0.5 * Math.sin(t * 3);
    g.strokeStyle = fishShade(rgb, -0.1);
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(-10, 0);
    g.quadraticCurveTo(-36, wig * 14, -60, wig * 24);
    g.stroke();
    // Huge hinged jaw
    g.fillStyle = fishShade(rgb, 0);
    g.beginPath();
    g.moveTo(-12, 0);
    g.lineTo(44, -14 - open * 18);
    g.quadraticCurveTo(30, 0, 44, 14 + open * 18);
    g.closePath();
    g.fill();
    g.fillStyle = "#0a0204";
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(40, -10 - open * 16);
    g.quadraticCurveTo(28, 0, 40, 10 + open * 16);
    g.closePath();
    g.fill();
    fishEye(g, 2, -8, 2.5);
  },
  eye(g, rgb, t, wig) {
    // Tendrils
    g.strokeStyle = fishShade(rgb, -0.2, 0.9);
    g.lineWidth = 3;
    for (let k = 0; k < 7; k++) {
      const a = Math.PI * 0.6 + (k / 6) * Math.PI * 0.8;
      g.beginPath();
      g.moveTo(Math.cos(a) * 24, Math.sin(a) * 24);
      g.quadraticCurveTo(
        Math.cos(a) * 40 + Math.sin(t * 4 + k) * 8, Math.sin(a) * 40,
        Math.cos(a) * 54 + Math.sin(t * 3 + k * 2) * 12, Math.sin(a) * 52
      );
      g.stroke();
    }
    // Eyeball tracking around
    g.fillStyle = "#e9e1cf";
    g.beginPath();
    g.arc(0, 0, 26, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(160,20,30,0.7)";
    g.lineWidth = 1;
    for (let k = 0; k < 6; k++) {
      const a = k * 1.05 + 0.3;
      g.beginPath();
      g.moveTo(Math.cos(a) * 25, Math.sin(a) * 25);
      g.lineTo(Math.cos(a + 0.2) * 14, Math.sin(a + 0.2) * 14);
      g.stroke();
    }
    const px = Math.sin(t * 1.3) * 7, py = Math.cos(t * 1.7) * 5;
    g.fillStyle = fishShade(rgb, 0.1);
    g.beginPath();
    g.arc(px, py, 12, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#000";
    g.beginPath();
    g.ellipse(px, py, 3 + Math.abs(Math.sin(t)) * 2, 9, 0, 0, Math.PI * 2);
    g.fill();
  },
  squid(g, rgb, t, wig) {
    g.strokeStyle = fishShade(rgb, 0.05);
    g.lineCap = "round";
    for (let k = 0; k < 6; k++) {
      g.lineWidth = 4 - k * 0.3;
      const oy = (k - 2.5) * 5;
      g.beginPath();
      g.moveTo(-14, oy);
      g.bezierCurveTo(
        -34, oy + Math.sin(t * 5 + k) * 10,
        -50, oy * 1.8 + Math.sin(t * 4 + k * 1.7) * 14,
        -66, oy * 2.4 + Math.sin(t * 6 + k) * 10
      );
      g.stroke();
    }
    g.fillStyle = fishShade(rgb, 0);
    g.beginPath();
    g.moveTo(-16, -14);
    g.quadraticCurveTo(30, -18, 50, 0);
    g.quadraticCurveTo(30, 18, -16, 14);
    g.closePath();
    g.fill();
    g.strokeStyle = "rgba(220,240,255,0.22)";
    g.lineWidth = 1.5;
    g.stroke();
    g.fillStyle = fishShade(rgb, 0.35, 0.5);
    for (let k = 0; k < 5; k++) {
      g.beginPath();
      g.arc(4 + k * 8, -4 + (k % 2) * 7, 2, 0, Math.PI * 2);
      g.fill();
    }
    fishEye(g, -8, -6, 4, true);
  },
  maw(g, rgb, t, wig) {
    const open = 0.55 + 0.45 * Math.sin(t * 2.6);
    fishBody(g, 36, 34, rgb);
    g.fillStyle = "#060203";
    g.beginPath();
    g.arc(4, 0, 24 * open, 0, Math.PI * 2);
    g.fill();
    // Rings of inward teeth
    g.fillStyle = "#e6dfcc";
    for (let ring = 0; ring < 2; ring++) {
      const R = 24 * open - ring * 7;
      if (R < 6) continue;
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2 + ring * 0.2 + t * (ring ? -0.4 : 0.3);
        g.beginPath();
        g.moveTo(4 + Math.cos(a - 0.12) * R, Math.sin(a - 0.12) * R);
        g.lineTo(4 + Math.cos(a) * (R - 7), Math.sin(a) * (R - 7));
        g.lineTo(4 + Math.cos(a + 0.12) * R, Math.sin(a + 0.12) * R);
        g.fill();
      }
    }
  },
  spiny(g, rgb, t, wig) {
    g.strokeStyle = fishShade(rgb, 0.4, 0.85);
    g.lineWidth = 1.5;
    for (let k = 0; k < 13; k++) {
      const a = -Math.PI * 0.95 + k * 0.16;
      const len = 30 + Math.sin(t * 3 + k) * 4;
      g.beginPath();
      g.moveTo(Math.cos(a) * 18, Math.sin(a) * 14);
      g.lineTo(Math.cos(a) * len * 1.2, Math.sin(a) * len);
      g.stroke();
    }
    fishTail(g, -28, wig, 14, rgb);
    fishBody(g, 32, 18, rgb);
    g.strokeStyle = "rgba(250,240,230,0.55)";
    g.lineWidth = 3;
    for (let k = 0; k < 5; k++) {
      g.beginPath();
      g.moveTo(-20 + k * 10, -16);
      g.lineTo(-24 + k * 10, 16);
      g.stroke();
    }
    fishEye(g, 22, -4, 3.5);
  },
  ghost(g, rgb, t, wig) {
    g.save();
    g.globalAlpha = 0.45 + 0.25 * Math.sin(t * 2.2);
    const glow = g.createRadialGradient(0, 0, 4, 0, 0, 60);
    glow.addColorStop(0, fishShade(rgb, 0.4, 0.5));
    glow.addColorStop(1, fishShade(rgb, 0.4, 0));
    g.fillStyle = glow;
    g.beginPath();
    g.arc(0, 0, 60, 0, Math.PI * 2);
    g.fill();
    fishTail(g, -30, wig, 16, rgb);
    fishBody(g, 34, 20, rgb);
    // Visible skeleton
    g.strokeStyle = "rgba(255,255,255,0.6)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(-28, 0);
    g.lineTo(26, 0);
    for (let k = 0; k < 6; k++) {
      g.moveTo(-20 + k * 8, -12);
      g.lineTo(-18 + k * 8, 12);
    }
    g.stroke();
    g.restore();
    fishEye(g, 22, -4, 3.5, true);
  },
  coral(g, rgb, t, wig) {
    const pulse = 1 + 0.06 * Math.sin(t * 3);
    g.fillStyle = fishShade(rgb, 0);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + t * 0.2;
      const r = (16 + (k % 3) * 6) * pulse;
      g.beginPath();
      g.arc(Math.cos(a) * r, Math.sin(a) * r * 0.8, 12 - (k % 3) * 2, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.arc(0, 0, 20 * pulse, 0, Math.PI * 2);
    g.fill();
    // Polyp eyes opening and closing
    for (let k = 0; k < 5; k++) {
      const a = k * 1.3 + 0.4;
      const open = Math.max(0, Math.sin(t * 2 + k * 1.7));
      g.fillStyle = "#f4e7a0";
      g.beginPath();
      g.ellipse(Math.cos(a) * 18, Math.sin(a) * 14, 3, 3 * open + 0.3, 0, 0, Math.PI * 2);
      g.fill();
    }
  },
  wraith(g, rgb, t, wig) {
    for (let k = 0; k < 12; k++) {
      const a = k * 0.9 + t * 0.6;
      const r = 12 + (k % 4) * 7;
      g.fillStyle = `rgba(8,8,12,${0.55 - (k % 4) * 0.08})`;
      g.beginPath();
      g.arc(Math.cos(a) * r * 1.3 - 6, Math.sin(a) * r * 0.7, 14 + (k % 3) * 4, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = "rgba(120,110,160,0.35)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(0, 0, 30, 0, Math.PI * 2);
    g.stroke();
    const blink = Math.sin(t * 0.9) > 0.92 ? 0.2 : 1;
    [[14, -6], [26, -4]].forEach(([x, y]) => {
      const gl = g.createRadialGradient(x, y, 0, x, y, 9);
      gl.addColorStop(0, "rgba(255,240,200,0.95)");
      gl.addColorStop(1, "rgba(255,200,120,0)");
      g.fillStyle = gl;
      g.beginPath();
      g.ellipse(x, y, 9, 9 * blink, 0, 0, Math.PI * 2);
      g.fill();
    });
  }
};

let fishViewDartDir = 1;

function drawHookedFishView() {
  const c = document.getElementById("fishing-fish-canvas");
  if (!c || !hookedFish || !fishingParams) return;
  const g = c.getContext("2d");
  const S = c.width;
  const t = performance.now() / 1000;
  const d = fishingParams.difficulty;
  const aberrant = hookedFish.rarity === "aberrant";
  const rgb = fishHexToRgb(hookedFish.color || "#8aa6b5");

  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, S, S);
  g.save();
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
  g.clip();

  // Water: lighter toward the surface, murkier for the deep zones
  const deep = aberrant || isInOilRigZone(player.x);
  const reef = isInReefZone(player.x);
  const water = g.createRadialGradient(S / 2, S * 0.2, S * 0.05, S / 2, S / 2, S * 0.75);
  water.addColorStop(0, reef ? "#3a1a2c" : deep ? "#14202a" : "#1d4a50");
  water.addColorStop(1, "#020608");
  g.fillStyle = water;
  g.fillRect(0, 0, S, S);

  // Light shafts
  g.save();
  g.globalCompositeOperation = "screen";
  for (let k = 0; k < 3; k++) {
    const x = ((k * 0.37 + t * 0.03) % 1) * S * 1.4 - S * 0.2;
    g.fillStyle = `rgba(160,220,220,${0.05 + 0.03 * Math.sin(t + k)})`;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + S * 0.12, 0);
    g.lineTo(x + S * 0.02, S);
    g.lineTo(x - S * 0.1, S);
    g.fill();
  }
  g.restore();

  // Drifting specks
  for (let k = 0; k < 16; k++) {
    const px = (hash(k * 17) * S + Math.sin(t * 0.5 + k) * 6) % S;
    const py = S - ((t * (8 + hash(k * 7) * 10) + hash(k * 31) * S) % S);
    g.fillStyle = `rgba(200,230,230,${0.15 + hash(k) * 0.25})`;
    g.fillRect(px, py, 1.5, 1.5);
  }

  // Fish motion: harder fish thrash wider and faster; a miss makes it bolt
  if (fishingMissPulse > 0.98) fishViewDartDir = Math.random() < 0.5 ? -1 : 1;
  const struggle = 0.45 + d * 0.12 + fishingMissPulse * 0.9;
  const fx = S / 2 + Math.sin(t * (0.8 + d * 0.18)) * S * 0.13 * struggle + fishingMissPulse * fishViewDartDir * S * 0.16;
  const fy = S / 2 + Math.sin(t * (1.2 + d * 0.22) + 1) * S * 0.07 * struggle + (1 - catchProgress) * S * 0.06;
  const facing = Math.cos(t * (0.8 + d * 0.18)) * (fishingMissPulse > 0.3 ? -fishViewDartDir : 1) >= 0 ? 1 : -1;
  const wig = Math.sin(t * (7 + d * 2.2)) * (0.35 + struggle * 0.25);
  const scale = (S / 180) * (0.82 + catchProgress * 0.28 + fishingHitPulse * 0.14) * (0.88 + 0.24 * (hookedFish.weightRatio || 0));

  // Escape: the line snaps at the mouth and the fish bolts off, trailing a bit of line
  const esc = fishingEscapeProgress();
  if (esc > 0 && !escapeCapture) escapeCapture = { fx, fy, facing, scale };
  const cap = escapeCapture;
  const ease = esc * esc;
  const dfx = esc > 0 ? cap.fx + cap.facing * S * 0.9 * ease : fx;
  const dfy = esc > 0 ? cap.fy + S * 0.3 * ease : fy;
  const dfacing = esc > 0 ? cap.facing : facing;
  const dscale = esc > 0 ? cap.scale * (1 - 0.4 * esc) : scale;
  const dwig = esc > 0 ? Math.sin(t * 34) * 0.8 : wig;

  if (esc === 0) {
    // Fishing line from the surface to the mouth — taut on a hit
    const mouthX = fx + facing * 44 * scale;
    g.strokeStyle = `rgba(235,230,215,${0.35 + fishingHitPulse * 0.5})`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(S / 2, -2);
    g.quadraticCurveTo(S / 2 + (1 - fishingHitPulse) * 14 * Math.sin(t * 2), fy * 0.5, mouthX, fy);
    g.stroke();
  } else {
    const m0x = cap.fx + cap.facing * 44 * cap.scale;
    const m0y = cap.fy;

    // Upper half of the broken line whips back up toward the surface
    const up = 1 - Math.pow(1 - Math.min(1, esc * 2.4), 3);
    const endX = m0x + (S / 2 - m0x) * up + Math.sin(t * 38) * 8 * (1 - up);
    const endY = m0y + (-2 - m0y) * up;
    g.strokeStyle = `rgba(235,230,215,${0.6 * (1 - up * 0.6)})`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(S / 2, -2);
    g.quadraticCurveTo((S / 2 + endX) / 2 + Math.sin(t * 30) * 6 * (1 - up), endY / 2, endX, endY);
    g.stroke();

    // Lower end stays in the fish's mouth and flutters behind it
    const mx = dfx + dfacing * 44 * dscale;
    g.strokeStyle = `rgba(235,230,215,${0.55 * (1 - esc)})`;
    g.beginPath();
    g.moveTo(mx, dfy);
    g.quadraticCurveTo(mx - dfacing * 10 + Math.sin(t * 28) * 4, dfy - 8, mx - dfacing * 22 + Math.sin(t * 22) * 5, dfy - 20 + esc * 10);
    g.stroke();

    // Burst of bubbles where it was hooked
    for (let k = 0; k < 9; k++) {
      g.strokeStyle = `rgba(200,235,240,${(1 - esc) * 0.6})`;
      g.lineWidth = 1;
      g.beginPath();
      g.arc(
        cap.fx + Math.sin(k * 2.3) * (8 + 26 * esc),
        cap.fy - (0.1 + 0.25 * (k % 4) / 3) * S * esc * 1.4,
        1.4 + (k % 3) * 1.2, 0, Math.PI * 2
      );
      g.stroke();
    }

    // Snap flash
    if (esc < 0.22) {
      const k = esc / 0.22;
      const fl = g.createRadialGradient(m0x, m0y, 0, m0x, m0y, 8 + 24 * k);
      fl.addColorStop(0, `rgba(255,255,255,${(1 - k) * 0.9})`);
      fl.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = fl;
      g.fillRect(0, 0, S, S);
      g.strokeStyle = `rgba(255,245,220,${1 - k})`;
      g.lineWidth = 1.5;
      for (let r = 0; r < 7; r++) {
        const ang = r * 0.9 + 0.3;
        g.beginPath();
        g.moveTo(m0x + Math.cos(ang) * (3 + 8 * k), m0y + Math.sin(ang) * (3 + 8 * k));
        g.lineTo(m0x + Math.cos(ang) * (9 + 18 * k), m0y + Math.sin(ang) * (9 + 18 * k));
        g.stroke();
      }
    }
  }

  // Aberrant fish radiate a sick glow
  if (aberrant) {
    const ag = g.createRadialGradient(dfx, dfy, 4, dfx, dfy, S * 0.42);
    ag.addColorStop(0, `rgba(200,30,50,${0.25 + 0.15 * Math.sin(t * 3)})`);
    ag.addColorStop(1, "rgba(200,30,50,0)");
    g.fillStyle = ag;
    g.fillRect(0, 0, S, S);
  }

  g.save();
  if (esc > 0) g.globalAlpha = 1 - 0.9 * Math.pow(esc, 1.5);
  g.translate(dfx, dfy);
  g.rotate(dwig * 0.12 + Math.sin(t * 1.6) * 0.06);
  g.scale(dscale * dfacing, dscale);
  (FISH_SHAPES[hookedFish.shape] || FISH_SHAPES.slim)(g, rgb, t, dwig);
  g.restore();

  // Murk: the fish emerges from the dark as it is reeled in
  g.fillStyle = `rgba(2,8,10,${Math.min(0.95, 0.5 * (1 - catchProgress) + esc * 0.45)})`;
  g.fillRect(0, 0, S, S);

  if (fishingHitPulse > 0) {
    g.fillStyle = `rgba(120,255,170,${fishingHitPulse * 0.22})`;
    g.fillRect(0, 0, S, S);
  }
  if (fishingMissPulse > 0) {
    g.fillStyle = `rgba(255,50,40,${fishingMissPulse * 0.28})`;
    g.fillRect(0, 0, S, S);
  }

  // Inner rim shadow
  const rim = g.createRadialGradient(S / 2, S / 2, S * 0.36, S / 2, S / 2, S / 2);
  rim.addColorStop(0, "rgba(0,0,0,0)");
  rim.addColorStop(1, "rgba(0,0,0,0.75)");
  g.fillStyle = rim;
  g.fillRect(0, 0, S, S);
  g.restore();
}

// Species depends on how far out you are, the time of day and the zone
function rollHookedFish() {
  const distanceRatio = Math.min(1.0, Math.abs(player.x) / (worldWidth / 2));
  const rolledDepth = 50 + distanceRatio * 320 + Math.random() * 30;
  // Only a lit lamp attracts the better fish, and the light upgrade is what widens the odds
  const lightLevel = headlight.on && headlight.strength > 0.3 ? upgrades.lights : 1;
  const species = getRandomFishForDepth(rolledDepth, getDaylightFactor(), isInReefZone(player.x), isInOilRigZone(player.x), lightLevel);
  return makeCaughtFish(species);
}

function updateFishingInfoPanel() {
  const titleEl = document.getElementById("fishing-title");
  if (titleEl) {
    titleEl.textContent = hookedFish.rarity === "aberrant" ? "Něco… zabralo" : "Něco zabralo!";
    titleEl.classList.toggle("aberrant", hookedFish.rarity === "aberrant");
  }

  const diffEl = document.getElementById("fishing-difficulty");
  if (diffEl) {
    const d = fishingParams.difficulty;
    diffEl.innerHTML = "";
    for (let i = 1; i <= 5; i++) {
      const pip = document.createElement("span");
      pip.className = "diff-pip" + (i <= d ? " on" : "");
      diffEl.appendChild(pip);
    }
    diffEl.dataset.level = String(d);
    diffEl.setAttribute("aria-label", `Obtížnost ${d} z 5`);
  }

  const stockEl = document.getElementById("fishing-spot-stock");
  if (stockEl && activeFishingSpot) {
    stockEl.innerHTML = "";
    for (let i = 1; i <= SPOT_MAX_STOCK; i++) {
      const pip = document.createElement("span");
      pip.className = "stock-pip" + (i <= activeFishingSpot.stock ? " on" : "");
      stockEl.appendChild(pip);
    }
  }

  const zoneEl = document.getElementById("fishing-zone-tag");
  if (zoneEl) {
    let zone = "POBŘEŽÍ", key = "coast";
    if (isInReefZone(player.x)) { zone = "KRVAVÝ ÚTES"; key = "reef"; }
    else if (isInOilRigZone(player.x)) { zone = "ROPNÁ VĚŽ"; key = "oil"; }
    else if (Math.abs(player.x) > worldWidth * 0.3) { zone = "HLUBINY"; key = "deep"; }
    zoneEl.textContent = zone;
    zoneEl.dataset.zone = key;
  }

}

function tryStartFishing() {
  if (fishingMode || fishingLocked || detektorMode || detektorLocked) return;
  const spot = getBubbleNearPlayer();
  if (!spot) return;
  const rolled = rollHookedFish();
  if (!findCargoSpot(rolled)) {
    triggerDialogue("Podpalubí", "Na další úlovek není v podpalubí místo. Přeskládej ryby (I), prodej úlovek v přístavu, nebo si na ropné věži vylepši trup.");
    return;
  }
  activeFishingSpot = spot;

  fishingMode = true;
  fishingLocked = false;
  catchProgress = 0;
  redStreak = 0;

  hookedFish = rolled;
  fishingParams = getFishingParams(hookedFish);
  fishingNeedleAngle = Math.random() * Math.PI * 2;
  fishingNeedleDir = 1;
  fishingNextReverseAt = performance.now() + 1200 + Math.random() * 1500;
  fishingDriftDir = Math.random() < 0.5 ? 1 : -1;
  fishingHitPulse = 0;
  fishingMissPulse = 0;
  fishingEscapeAt = 0;
  escapeCapture = null;
  resetCatchGauge();
  updateFishingInfoPanel();
  playCast();

  if (fishingUI) {
    fishingUI.classList.remove("hidden");
    fishingUI.setAttribute("aria-hidden", "false");
  }
  if (fishingResultEl) {
    fishingResultEl.classList.add("hidden");
    fishingResultEl.textContent = "";
  }

  currentFishingZones = generateFishingGreenZones();
  initFishingRingSvg();

}

function tryFishingHit() {
  if (!fishingMode || fishingLocked) return;

  if (isNeedleInGreen(fishingNeedleAngle)) {
    catchProgress += 1 / fishingParams.hitsToLand;
    flashFishingFeedback(true);
    fishingHitPulse = 1;
    playHit();

    currentFishingZones = generateFishingGreenZones();
    initFishingRingSvg();

    if (catchProgress >= 1 - 1e-9) {
      endFishingSuccess();
    }
  } else {
    redStreak++;
    flashFishingFeedback(false);
    fishingMissPulse = 1;
    playMiss();
    if (catchProgress > 0) {
      catchProgress = Math.max(0, catchProgress - fishingParams.missSlip / fishingParams.hitsToLand);
    }
    if (redStreak >= getMaxRedStreak()) {
      endFishingFail();
    }
  }
}

function closeFishingPanel() {
  fishingMode = false;
  if (fishingUI) {
    fishingUI.classList.add("hidden");
    fishingUI.setAttribute("aria-hidden", "true");
  }
}

function endFishingSuccess() {
  fishingLocked = true;
  const caught = hookedFish;
  playCatch();

  // Into the hold (the spot was checked when the cast began)
  if (!placeInHold(caught)) showToast("Úlovek se nevešel do podpalubí a plouje pryč.", "230,190,110");
  recordCatchInJournal(caught);
  caught.caughtAt = absoluteHours();
  if (activeFishingSpot) activeFishingSpot.stock = Math.max(0, activeFishingSpot.stock - 1);
  caughtFish = inventory.length;

  if (fishingResultEl) {
    fishingResultEl.textContent = caught.name;
    fishingResultEl.className = `fishing-result ok rarity-${caught.rarity}`;
    fishingResultEl.classList.remove("hidden");
  }

  // Add screen shake on catching a fish
  triggerScreenShake(8);

  window.setTimeout(() => {
    if (fishUI) fishUI.innerText = caughtFish;
    updateInventoryUI();

    if (!firstFishCaught) {
      firstFishCaught = true;
      triggerDialogue("Starý rybář", "Tvá první ryba. Moře je dnes klidné... ale nenech se oklamat. Jakmile slunce zapadne, drž se blízko majáku.");
    }

    // Aberrant fish increases danger level immediately!
    if (caught.rarity === "aberrant") {
      addDanger(2);
      triggerDialogue("Šílenství", "Něco na té rybě není v pořádku. Ty oči... ten sliz... cítíš, jak ti z toho pohledu třeští hlava.");
    }

    fishingLocked = false;
    closeFishingPanel();
    if (fishingResultEl) fishingResultEl.classList.add("hidden");
  }, 1200);
}

function endFishingFail() {
  fishingLocked = true;
  fishingEscapeAt = performance.now();
  escapeCapture = null;
  // Fresh splash where the floats were, a small jolt, then the panel closes after the fish is gone
  boatRods.forEach((r) => { r.landedAt = fishingEscapeAt; });
  triggerScreenShake(4);
  playSnap();
  window.setTimeout(() => {
    fishingLocked = false;
    redStreak = 0;
    catchProgress = 0;
    fishingEscapeAt = 0;
    escapeCapture = null;
    closeFishingPanel();
  }, FISHING_ESCAPE_MS + 250);
}

// =====================================================================
// BATTERY RECHARGE MINIGAME
// Uses the same ring-spinner mechanic as fishing, but recharges battery
// =====================================================================

function generateRechargeZones() {
  const numZones = Math.random() > 0.5 ? 2 : 1;
  const zones = [];
  for (let i = 0; i < numZones; i++) {
    const center = Math.random() * Math.PI * 2;
    const halfWidth = 0.32 + upgrades.lights * 0.04; // wider zone with lights upgrade
    zones.push([center - halfWidth, center + halfWidth]);
  }
  return zones;
}

function rechargeNeedleAngle(nowMs) {
  const dt = (nowMs - rechargeMinigameStart) / 1000;
  return normalizeAngle(dt * RECHARGE_NEEDLE_SPEED);
}

function isRechargeNeedleInGreen(theta) {
  return rechargeCurrentZones.some(([a0, a1]) => angleInSpan(theta, a0, a1));
}

function tryStartRechargeMinigame() {
  if (rechargeMinigameActive || fishingMode || detektorMode) return;
  if (batteryRechargesLeft <= 0) {
    triggerDialogue("Baterie", "Nemáš dobíjecí sadu. Koupíš ji na ropné věži — nebo zakotvi v přístavu, tam se baterie dobije sama.");
    return;
  }
  if (battery >= BATTERY_MAX - 5) {
    triggerDialogue("Baterie", "Baterie je již plná.");
    return;
  }

  rechargeMinigameActive = true;
  rechargeMinigameLocked = false;
  rechargeMinigameStart = performance.now();
  rechargeMinigameProgress = 0;
  rechargeRedStreak = 0;
  rechargeCurrentZones = generateRechargeZones();

  openRechargeUI();
}

function openRechargeUI() {
  const ui = document.getElementById("recharge-ui");
  if (ui) {
    ui.classList.remove("hidden");
    // A new attempt starts clean: no overvoltage count or result left from the last one
    const hintEl = document.getElementById("recharge-red-hint");
    if (hintEl) hintEl.classList.add("hidden");
    const resultEl = document.getElementById("recharge-result");
    if (resultEl) resultEl.classList.add("hidden");
    // Update ring SVG
    initRechargeRingSvg();
    updateRechargeFillBar();
    // Update count
    const countEl = document.getElementById("recharge-count");
    if (countEl) countEl.textContent = batteryRechargesLeft;
  }
}

function closeRechargeUI() {
  rechargeMinigameActive = false;
  rechargeMinigameLocked = false;
  const ui = document.getElementById("recharge-ui");
  if (ui) ui.classList.add("hidden");
}

function initRechargeRingSvg() {
  const arcsEl = document.getElementById("recharge-green-arcs");
  if (!arcsEl) return;
  const cx = 100, cy = 100, r = 72;
  const d = rechargeCurrentZones.map(([a0, a1]) => ringArcD(cx, cy, r, a0, a1)).join(" ");
  arcsEl.setAttribute("d", d);
}

function updateRechargeFillBar() {
  const fill = document.getElementById("recharge-progress-fill");
  if (fill) {
    fill.style.width = `${(rechargeMinigameProgress / RECHARGE_HITS_TO_FULL) * 100}%`;
  }
  const battEl = document.getElementById("recharge-battery-pct");
  if (battEl) battEl.textContent = Math.round(battery) + "%";
}

function tryRechargeHit() {
  if (!rechargeMinigameActive || rechargeMinigameLocked) return;
  const th = rechargeNeedleAngle(performance.now());

  if (isRechargeNeedleInGreen(th)) {
    rechargeRedStreak = 0;
    rechargeMinigameProgress++;
    playHit();

    // Flash ring (Web Animations restart reliably; class toggling doesn't on SVG)
    const flashRing = document.getElementById("recharge-flash-ring");
    if (flashRing && flashRing.animate) {
      flashRing.getAnimations().forEach((a) => a.cancel());
      flashRing.animate(
        [{ opacity: 0.95, transform: "scale(1)" }, { opacity: 0, transform: "scale(1.25)" }],
        { duration: 420, easing: "ease-out" }
      );
    }

    // Regenerate zones
    rechargeCurrentZones = generateRechargeZones();
    initRechargeRingSvg();
    updateRechargeFillBar();

    // Partial charge per hit
    battery = Math.min(BATTERY_MAX, battery + (BATTERY_MAX / RECHARGE_HITS_TO_FULL));

    if (rechargeMinigameProgress >= RECHARGE_HITS_TO_FULL) {
      endRechargeSuccess();
    }
  } else {
    rechargeRedStreak++;
    playMiss();
    const redEl = document.getElementById("recharge-red-count");
    const hintEl = document.getElementById("recharge-red-hint");
    if (hintEl) hintEl.classList.remove("hidden");
    if (redEl) redEl.textContent = rechargeRedStreak;
    if (rechargeRedStreak >= RECHARGE_MAX_RED) {
      endRechargeFail();
    }
  }
}

function endRechargeSuccess() {
  rechargeMinigameLocked = true;
  batteryRechargesLeft--;
  battery = BATTERY_MAX; // full charge on success

  const result = document.getElementById("recharge-result");
  if (result) {
    result.textContent = "Baterie plně nabita! (" + batteryRechargesLeft + " dobití zbývá)";
    result.className = "fishing-result ok";
    result.classList.remove("hidden");
  }

  window.setTimeout(() => {
    closeRechargeUI();
    if (result) result.classList.add("hidden");
    if (batteryRechargesLeft <= 0) {
      triggerDialogue("Baterie", "Dobíjecí sada je vyčerpána. Potřebuješ lepší motor, nebo novou sadu.");
    }
  }, 1400);
}

function endRechargeFail() {
  rechargeMinigameLocked = true;
  const result = document.getElementById("recharge-result");
  if (result) {
    result.textContent = "Přepětí! Dobíjení selhalo.";
    result.className = "fishing-result bad";
    result.classList.remove("hidden");
  }
  window.setTimeout(() => {
    rechargeMinigameLocked = false;
    rechargeRedStreak = 0;
    rechargeMinigameProgress = 0;
    closeRechargeUI();
    if (result) result.classList.add("hidden");
  }, 1000);
}

function updateRechargeHudVisuals() {
  if (!rechargeMinigameActive || rechargeMinigameLocked) return;
  const th = rechargeNeedleAngle(performance.now());
  const deg = (th * 180) / Math.PI;
  const needle = document.getElementById("recharge-needle");
  if (needle) needle.setAttribute("transform", `translate(100 100) rotate(${deg})`);
}

function detektorSweepU(nowMs) {
  const dt = (nowMs - detektorStartTime) / 1000;
  let phase = ((dt % DETEKTOR_SWEEP_PERIOD_SEC) / DETEKTOR_SWEEP_PERIOD_SEC) * 2;
  if (phase > 1) phase = 2 - phase;
  return phase;
}

function randomDetektorZones() {
  detektorZones = [];
  const target = 2 + (Math.random() > 0.45 ? 1 : 0);
  let guard = 0;
  while (detektorZones.length < target && guard++ < 60) {
    const width = 0.075 + Math.random() * 0.065;
    const left = 0.04 + Math.random() * (0.92 - width);
    const pad = 0.025;
    const overlaps = detektorZones.some(
      (z) => !(left + width + pad < z.left || left > z.left + z.width + pad)
    );
    if (!overlaps) detektorZones.push({ left, width });
  }
}

function renderDetektorZones() {
  if (!detektorZonesEl) return;
  detektorZonesEl.innerHTML = "";
  detektorZones.forEach((z) => {
    const el = document.createElement("div");
    el.className = "detektor-zone";
    el.style.left = `${z.left * 100}%`;
    el.style.width = `${z.width * 100}%`;
    detektorZonesEl.appendChild(el);
  });
}

function updateDetektorExtractBar() {
  if (!detektorExtractFillEl) return;
  const pct = Math.min(1, detektorProgress / DETEKTOR_HITS_TO_RELIC) * 100;
  detektorExtractFillEl.style.width = `${pct}%`;
}

function showDetektorRedHint() {
  if (detektorRedHintEl) detektorRedHintEl.classList.remove("hidden");
  if (detektorRedCountEl) detektorRedCountEl.textContent = String(detektorRedStreak);
}

function hideDetektorRedHint() {
  if (detektorRedHintEl) detektorRedHintEl.classList.add("hidden");
}

function tryStartDetektor() {
  if (fishingMode || fishingLocked || detektorMode || detektorLocked) return;
  const spot = getDetektorSpotNearPlayer();
  if (!spot) return;

  activeDetektorSpot = spot;
  detektorMode = true;
  detektorLocked = false;
  detektorStartTime = performance.now();
  detektorProgress = 0;
  detektorRedStreak = 0;
  randomDetektorZones();
  renderDetektorZones();
  updateDetektorExtractBar();

  if (detektorUI) {
    detektorUI.classList.remove("hidden");
    detektorUI.setAttribute("aria-hidden", "false");
  }
  if (detektorResultEl) {
    detektorResultEl.classList.add("hidden");
    detektorResultEl.textContent = "";
  }
  hideDetektorRedHint();
}

function sweepInGreen(u) {
  return detektorZones.some(
    (z) => u >= z.left - DETEKTOR_HIT_SLACK && u <= z.left + z.width + DETEKTOR_HIT_SLACK
  );
}

function tryDetektorHit() {
  if (!detektorMode || detektorLocked) return;
  const u = detektorSweepU(performance.now());

  if (sweepInGreen(u)) {
    detektorRedStreak = 0;
    hideDetektorRedHint();
    detektorProgress += 1;
    updateDetektorExtractBar();
    playPing();
    if (detektorProgress >= DETEKTOR_HITS_TO_RELIC) {
      endDetektorSuccess();
    }
  } else {
    detektorRedStreak++;
    showDetektorRedHint();
    playMiss();
    if (detektorRedStreak >= 3) {
      endDetektorFail();
    }
  }
}

function closeDetektorPanel() {
  detektorMode = false;
  activeDetektorSpot = null;
  detektorProgress = 0;
  updateDetektorExtractBar();
  if (detektorSweepEl) detektorSweepEl.style.left = "0%";
  if (detektorUI) {
    detektorUI.classList.add("hidden");
    detektorUI.setAttribute("aria-hidden", "true");
  }
}

function endDetektorSuccess() {
  detektorLocked = true;
  const spot = activeDetektorSpot;
  if (detektorResultEl) {
    detektorResultEl.textContent = relicsFound < 6 ? "Relikvie vyzvednuta!" : "Poklad vyzvednut!";
    detektorResultEl.className = "detektor-result ok";
    detektorResultEl.classList.remove("hidden");
  }

  triggerScreenShake(15);
  playCatch();

  window.setTimeout(() => {
    if (spot) spot.taken = true;
    gold += 50 + Math.floor(Math.random() * 30);
    if (relicsFound < 6) relicsFound++;
    if (goldUI) goldUI.innerText = gold;
    syncRelicsHud();

    // Increase danger! Relics are cursed!
    addDanger(3);

    detektorLocked = false;
    detektorRedStreak = 0;
    closeDetektorPanel();
    if (detektorResultEl) detektorResultEl.classList.add("hidden");

    if (relicsFound === 1) {
      triggerDialogue("Záhadná relikvie", "Vyzvedl jsi podivný kamenný klíč. Je ledový na dotek a šeptá nesrozumitelným jazykem. Měl bys najít všech 6.");
    } else if (relicsFound === 6) {
      triggerDialogue("Konec Hledání", "Vyzvedl jsi poslední ze šesti relikvií. Moře kolem tebe na okamžik ztichlo... ale hlubiny se začínají vařit. Vrať se k majáku!");
    } else {
      triggerDialogue("Záhadná relikvie", `Nalezena relikvie ${relicsFound}/6. Temné stíny v hlubinách se začínají chvět.`);
    }
  }, 1000);
}

function endDetektorFail() {
  detektorLocked = true;
  if (detektorResultEl) {
    detektorResultEl.textContent = "Signál ztracen — zkus jiný průjezd.";
    detektorResultEl.className = "detektor-result bad";
    detektorResultEl.classList.remove("hidden");
  }
  window.setTimeout(() => {
    detektorLocked = false;
    detektorRedStreak = 0;
    closeDetektorPanel();
    if (detektorResultEl) detektorResultEl.classList.add("hidden");
  }, 950);
}

function updateDetektorHudVisuals() {
  if (!detektorMode || detektorLocked || !detektorSweepEl) return;
  const u = detektorSweepU(performance.now());
  detektorSweepEl.style.left = `${u * 100}%`;
}

window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  keys[key] = true;
  initSound(); // browsers only allow audio after a user gesture

  if (key === "m" && !e.repeat) {
    toggleSound();
    return;
  }

  if (gameOver) {
    if (e.code === "Space" || e.key === " ") {
      e.preventDefault();
      restartGame();
    }
    return;
  }

  if (dialogueActive) {
    if (e.code === "Space" || e.key === " " || key === "enter") {
      e.preventDefault();
      skipTypewriter();
    }
    return;
  }

  const inMinigame = fishingMode || detektorMode || rechargeMinigameActive;

  if (key === "j" && !e.repeat) {
    toggleJournal();
    return;
  }

  if (key === "escape") {
    if (journalOpen) toggleJournal(false);
    if (inventoryOpen) toggleInventory();
    return;
  }

  if (key === "i") {
    e.preventDefault();
    toggleInventory();
    return;
  }

  if (key === "l" && !e.repeat) {
    if (!dockActive) toggleHeadlight();
    return;
  }

  if (key === "e") {
    if (inMinigame) return;
    if (dockActive) {
      handleEKeyInMenu();
    } else {
      // Prioritize dock if multiple are near
      if (getNearDock()) {
        openDockMenu();
      } else if (getNearOilRig()) {
        openOilRigMenu();
      } else if (getNearLighthouse()) {
        openLighthouseShopMenu();
      }
    }
    return;
  }

  if (e.code === "Space" || e.key === " ") {
    e.preventDefault();
    if (!e.repeat && !dockActive) {
      if (rechargeMinigameActive) tryRechargeHit();
      else if (fishingMode) tryFishingHit();
      else if (detektorMode) tryDetektorHit();
      else tryStartFishing();
    }
    return;
  }

  if (key === "f" && !e.repeat && !dockActive && !inMinigame) {
    tryStartDetektor();
  }

  // R = emergency recharge minigame (needs the kit from the oil rig)
  if (key === "r" && !e.repeat && !dockActive && !inMinigame) {
    tryStartRechargeMinigame();
  }
});

window.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});

// Alt-tab or clicking away never delivers keyup — release everything so the boat stops
window.addEventListener("blur", () => {
  Object.keys(keys).forEach((k) => { keys[k] = false; });
});

window.addEventListener("pointerdown", () => initSound());

let lastDangerTick = 0;

let firstFishCaught = false;
let dangerThresh3 = false;
let reefWarnedEntry = false;

function update() {
  if (fishingMode || detektorMode || rechargeMinigameActive || dockActive || dialogueActive || gameOver) return;

  // player.speed is tuned in pixels per 60 Hz frame; scale by real time so
  // high-refresh monitors don't sail faster
  const f60 = frameDt * 60;
  const goLeft = keys["a"] || keys["arrowleft"];
  const goRight = keys["d"] || keys["arrowright"];
  const speed = player.speed * (1 - HULL_SLOWDOWN * hullDamage);
  if (goLeft) player.x -= speed * f60;
  if (goRight) player.x += speed * f60;
  if (goLeft && !goRight) boatFacingTarget = -1;
  else if (goRight && !goLeft) boatFacingTarget = 1;

  player.x = Math.max(-worldWidth / 2 + 100, Math.min(worldWidth / 2 - 100, player.x));

  camera.x = player.x - canvas.width / 2;

  gameTime += GAME_HOURS_PER_SECOND * frameDt;
  if (gameTime >= 24) {
    gameTime -= 24;
    dayNum++;
  }

  // Reef zone entry warning
  const inReef = isInReefZone(player.x);
  if (inReef && !reefWarnedEntry) {
    reefWarnedEntry = true;
    triggerDialogue("Korálový útes", "Vplouváš do Krvavého útesu. Korály zde září nepřirozeně živými barvami... a voda kolem nich pulsuje. Místní rybáři sem chodí jen za soumraku — a ne všichni se vrátí.");
  }
  if (!inReef && reefWarnedEntry) {
    // Reset so warning can fire again if re-entering
    reefWarnedEntry = false;
  }

  // Danger ticking logic
  const daylight = getDaylightFactor();
  const isNight = daylight < 0.25;
  const isDeep = Math.abs(player.x) > worldWidth * 0.3;

  const tNow = Math.floor(performance.now() * 0.001);
  if (tNow % 5 === 0 && tNow !== lastDangerTick) {
    lastDangerTick = tNow;

    let dangerIncrease = 0;
    if (isNight) dangerIncrease += 0.15;
    if (isDeep) dangerIncrease += 0.1;
    if (inReef)  dangerIncrease += 0.22; // reef is dangerous!

    // Aberrant relics carried boost danger
    const aberrantCount = inventory.filter(f => f.rarity === "aberrant").length;
    dangerIncrease += aberrantCount * 0.12;

    // Once the curse is broken the sea is gentler
    if (gameWon) dangerIncrease *= 0.5;

    // Under the lighthouse's beam the mind settles
    if (nearLighthouse()) dangerIncrease = Math.min(dangerIncrease, 0) - 0.25;

    // A stronger hull resists the dread, but never weakens the lighthouse's relief.
    // addDanger keeps it within 0–12 (the relief used to push danger below zero).
    addDanger(dangerIncrease > 0 ? dangerIncrease / upgrades.hull : dangerIncrease);

    // Dialogue warning thresholds
    if (danger >= 3 && !dangerThresh3) {
      dangerThresh3 = true;
      triggerDialogue("Varování", "Cítíš nepříjemný chlad. V dálce pod hladinou jako by cosi matně rudě svítilo... Neupírej tam zrak.");
    }
  }

  updateAttacks(frameDt);
  updateFreshness(frameDt);

  // Exhaust smoke drifts back from the funnel on the cabin
  const bob = boatBob();
  const sternDir = boatFacing < 0 ? 1 : -1;
  const exhaustWx = player.x + 20 * boatFacing;
  const exhaustWy = getSurfaceY() - 8 + bob - 68;
  const isMoving = goLeft || goRight;

  if (isMoving && Math.random() < 0.18 * f60) {
    smokeParticles.push({
      wx: exhaustWx,
      wy: exhaustWy,
      vx: sternDir * (0.4 + Math.random() * 0.5),
      vy: -0.5 - Math.random() * 0.4,
      r: 2 + Math.random() * 2,
      alpha: 0.5
    });
  } else if (Math.random() < 0.05 * f60) { // idle smoke
    smokeParticles.push({
      wx: exhaustWx,
      wy: exhaustWy,
      vx: sternDir * (0.1 + Math.random() * 0.2),
      vy: -0.3 - Math.random() * 0.2,
      r: 1.5 + Math.random() * 1.5,
      alpha: 0.35
    });
  }

  for (let i = smokeParticles.length - 1; i >= 0; i--) {
    const p = smokeParticles[i];
    p.wx += p.vx * f60;
    p.wy += p.vy * f60;
    p.alpha -= 0.008 * f60;
    p.r += 0.06 * f60;
    if (p.alpha <= 0) {
      smokeParticles.splice(i, 1);
    }
  }

  // --- BATTERY SYSTEM --- (real seconds; recharges fully in the harbour)
  if (upgrades.engine >= 3 && isMoving && battery < BATTERY_MAX) {
    const charge = BATTERY_MOTOR_CHARGE_PER_SEC * (1 + (upgrades.engine - 3) * 0.6);
    battery = Math.min(BATTERY_MAX, battery + charge * frameDt);
  }
  if (headlightOn) {
    const drain = BATTERY_DRAIN_PER_SEC * (getDaylightFactor() < 0.3 ? 1.5 : 1.0);
    battery = Math.max(0, battery - drain * frameDt);
  }

  if (battery <= 0 && !batteryDeadWarned) {
    batteryDeadWarned = true;
    triggerDialogue("Baterie", "Světlo zablikalo a zhaslo. Baterie je vybitá — vrať se do přístavu, než tě pohltí tma.");
  }
  if (battery > 10) batteryDeadWarned = false;

  // Sitting in the dark at night wears on the mind
  if (battery <= 0 && getDaylightFactor() < 0.25) {
    addDanger(0.18 * frameDt);
  }

  if (danger >= 12 && !dockActive && !gameOver) {
    triggerGameOver();
  }
}

function formatTime(h) {
  const hh = Math.floor(h) % 24;
  const mm = Math.floor((h % 1) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}


// =====================================================================
// RENDERING — DREDGE-STYLE VISUALS
// =====================================================================

function drawSky(surfaceY) {
  const daylight = getDaylightFactor();

  // Night Sky
  const gNight = ctx.createLinearGradient(0, 0, 0, surfaceY);
  gNight.addColorStop(0, "#03050b");
  gNight.addColorStop(0.5, "#0a1020");
  gNight.addColorStop(1.0, "#1a2434");

  // Sunset Sky (Dusk/Dawn)
  const gSunset = ctx.createLinearGradient(0, 0, 0, surfaceY);
  gSunset.addColorStop(0, "#1b2342");
  gSunset.addColorStop(0.3, "#47395e");
  gSunset.addColorStop(0.6, "#a85a58");
  gSunset.addColorStop(0.85, "#de8a5e");
  gSunset.addColorStop(1.0, "#f0b47a");

  // Day Sky (Muted, foggy steel blue/amber)
  const gDay = ctx.createLinearGradient(0, 0, 0, surfaceY);
  gDay.addColorStop(0, "#3d5a7e");
  gDay.addColorStop(0.5, "#7b8fa4");
  gDay.addColorStop(1.0, "#bfc2bd");

  // 1. Draw Night Sky (base)
  ctx.fillStyle = gNight;
  ctx.fillRect(0, 0, canvas.width, surfaceY);

  // 2. Draw Sunset Sky on top
  const sunsetWeight = getSunsetWeight(); // peaks at 6:00 and 18:00

  if (sunsetWeight > 0) {
    ctx.save();
    ctx.globalAlpha = sunsetWeight;
    ctx.fillStyle = gSunset;
    ctx.fillRect(0, 0, canvas.width, surfaceY);
    ctx.restore();
  }

  // 3. Draw Day Sky on top
  let dayWeight = daylight;
  if (sunsetWeight > 0) {
    dayWeight = Math.max(0, daylight - sunsetWeight * 0.5);
  }

  if (dayWeight > 0) {
    ctx.save();
    ctx.globalAlpha = dayWeight;
    ctx.fillStyle = gDay;
    ctx.fillRect(0, 0, canvas.width, surfaceY);
    ctx.restore();
  }

  // Draw stars (only visible at night)
  const starAlpha = Math.max(0, 1 - daylight * 1.5);
  if (starAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = starAlpha;
    drawStars(surfaceY);
    ctx.restore();
  }

  // The sun and moon sit behind the clouds
  drawCelestialBody(surfaceY, daylight, sunsetWeight);
  drawRealisticClouds(surfaceY, daylight, sunsetWeight);
}

function drawStars(surfaceY) {
  const t = performance.now() * 0.001;
  for (let i = 0; i < 120; i++) {
    const x = hash(i * 73) * canvas.width;
    const y = hash(i * 37 + 100) * surfaceY * 0.5;
    const twinkle = Math.sin(t * (0.4 + hash(i * 19)) + i) * 0.5 + 0.5;
    const brightness = 0.12 + twinkle * 0.4;
    const sizeSeed = hash(i * 53);
    const size = sizeSeed > 0.94 ? 2.5 : sizeSeed > 0.82 ? 1.8 : 1;
    // Slight color variation: warm/cool/white
    const starHue = sizeSeed > 0.7 ? `rgba(230,240,255,${brightness})` :
                    sizeSeed > 0.45 ? `rgba(255,245,220,${brightness * 0.9})` :
                                      `rgba(200,215,250,${brightness})`;
    ctx.fillStyle = starHue;
    if (size > 1.5) {
      // Larger stars get a cross sparkle
      ctx.fillRect(x, y, size, size);
      ctx.fillStyle = `rgba(255,255,255,${brightness * 0.4})`;
      ctx.fillRect(x - 1, y + size * 0.5, size + 2, 1);
      ctx.fillRect(x + size * 0.5, y - 1, 1, size + 2);
    } else {
      ctx.fillRect(x, y, size, size);
    }
  }

  // Shooting stars (occasional)
  const shootT = t * 0.15;
  for (let s = 0; s < 3; s++) {
    const cycle = (shootT + s * 2.1) % 8;
    if (cycle > 1.2) continue; // only visible briefly
    const sx = hash(s * 31 + Math.floor(shootT / 8)) * canvas.width;
    const sy = hash(s * 47 + Math.floor(shootT / 8)) * surfaceY * 0.4;
    const progress = cycle / 1.2;
    const len = 90 + hash(s * 11) * 60;
    const alpha = progress < 0.5 ? progress / 0.5 : (1 - progress) / 0.5;
    ctx.save();
    const grad = ctx.createLinearGradient(sx, sy, sx + len * 0.85, sy + len * 0.35);
    grad.addColorStop(0, `rgba(255,255,255,0)`);
    grad.addColorStop(0.5, `rgba(230,245,255,${alpha * 0.85})`);
    grad.addColorStop(1, `rgba(255,255,255,${alpha * 0.15})`);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx + len * progress * 0.5, sy + len * progress * 0.2);
    ctx.lineTo(sx + len * progress * 0.5 + len * 0.4, sy + len * progress * 0.2 + len * 0.16);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Draws the sun (day) or moon (night) on the sky.
 */
function drawCelestialBody(surfaceY, daylight, sunsetWeight) {
  const t = performance.now() * 0.001;

  const { x: bodyX, y: bodyY } = getCelestial(surfaceY);

  if (bodyY > surfaceY - 5) return; // below horizon, skip

  if (daylight > 0.12) {
    // === SUN ===
    const sunAlpha = Math.min(1, daylight * 1.8) * (1 - sunsetWeight * 0.3);
    ctx.save();
    ctx.globalAlpha = sunAlpha;

    // Atmospheric halo
    const haloR = 54 + Math.sin(t * 0.4) * 4;
    const halo = ctx.createRadialGradient(bodyX, bodyY, 14, bodyX, bodyY, haloR);
    const haloC = sunsetWeight > 0.3 ? 'rgba(255,140,60,' : 'rgba(255,215,120,';
    halo.addColorStop(0,   haloC + '0.22)');
    halo.addColorStop(0.5, haloC + '0.07)');
    halo.addColorStop(1,   haloC + '0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(bodyX, bodyY, haloR, 0, Math.PI * 2);
    ctx.fill();

    // Sun disk
    const disk = ctx.createRadialGradient(bodyX - 3, bodyY - 3, 1, bodyX, bodyY, 15);
    if (sunsetWeight > 0.4) {
      disk.addColorStop(0,   'rgba(255,220,160,1)');
      disk.addColorStop(0.6, 'rgba(255,140,60,0.95)');
      disk.addColorStop(1,   'rgba(220,80,40,0.7)');
    } else {
      disk.addColorStop(0,   'rgba(255,255,200,1)');
      disk.addColorStop(0.5, 'rgba(255,230,130,0.95)');
      disk.addColorStop(1,   'rgba(255,200,80,0.6)');
    }
    ctx.fillStyle = disk;
    ctx.beginPath();
    ctx.arc(bodyX, bodyY, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    // === MOON ===
    const moonAlpha = Math.min(1, (1 - daylight) * 1.5);
    ctx.save();
    ctx.globalAlpha = moonAlpha;

    // Soft glow
    const moonGlow = ctx.createRadialGradient(bodyX, bodyY, 8, bodyX, bodyY, 48);
    moonGlow.addColorStop(0,   'rgba(200,215,255,0.18)');
    moonGlow.addColorStop(0.5, 'rgba(180,195,240,0.06)');
    moonGlow.addColorStop(1,   'rgba(150,170,220,0)');
    ctx.fillStyle = moonGlow;
    ctx.beginPath();
    ctx.arc(bodyX, bodyY, 48, 0, Math.PI * 2);
    ctx.fill();

    // Moon disk
    const moonGrad = ctx.createRadialGradient(bodyX - 3, bodyY - 3, 2, bodyX, bodyY, 12);
    moonGrad.addColorStop(0,   'rgba(240,245,255,0.98)');
    moonGrad.addColorStop(0.6, 'rgba(200,210,240,0.9)');
    moonGrad.addColorStop(1,   'rgba(160,175,220,0.5)');
    ctx.fillStyle = moonGrad;
    ctx.beginPath();
    ctx.arc(bodyX, bodyY, 12, 0, Math.PI * 2);
    ctx.fill();

    // Crescent shadow cutout
    ctx.fillStyle = 'rgba(5,8,18,0.8)';
    ctx.beginPath();
    ctx.arc(bodyX + 5, bodyY - 2, 10.5, 0, Math.PI * 2);
    ctx.fill();

    // Subtle craters
    ctx.fillStyle = 'rgba(130,145,185,0.22)';
    ctx.beginPath(); ctx.arc(bodyX - 4, bodyY + 3, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(bodyX - 8, bodyY - 2, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

// Painterly rock texture, baked once from noise: dark crevices, lit grains and slanted strata
let rockPattern = null;
function getRockPattern() {
  if (rockPattern) return rockPattern;
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let n = 0, amp = 0.5, tot = 0;
      for (let o = 0; o < 4; o++) {
        const f = 1 << o;
        n += fogValueNoise(x / S * 6 * f, y / S * 6 * f, 6 * f, 40 + o) * amp;
        tot += amp;
        amp *= 0.5;
      }
      n /= tot;
      const strata = Math.sin((y + n * 70) * 0.19) * 0.5 + 0.5;
      const v = n * 0.85 + strata * 0.15;
      const i = (y * S + x) * 4;
      if (v < 0.46) { img.data[i] = 4; img.data[i + 1] = 3; img.data[i + 2] = 2; img.data[i + 3] = (0.46 - v) * 200; }
      else { img.data[i] = 205; img.data[i + 1] = 185; img.data[i + 2] = 150; img.data[i + 3] = Math.max(0, v - 0.54) * 160; }
    }
  }
  g.putImageData(img, 0, 0);
  rockPattern = ctx.createPattern(c, "repeat");
  return rockPattern;
}

// Lays the rock texture over the current path, scrolling with its parallax layer
function fillRockTexture(parallax, alpha) {
  const p = getRockPattern();
  if (p.setTransform) p.setTransform(new DOMMatrix().translate(-camera.x * parallax, 0));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = p;
  ctx.fill();
  ctx.restore();
}

// Height of the coastal hills above the waterline (kept low so the sky has room)
const COAST_BASE = 64;
const COAST_AMP = 0.55;

// Top edge of a coast layer at screen x — shared by the hills, their strata, the forests and the town
function coastTopY(surfaceY, x, parallax, yOff) {
  const wx = x + camera.x * parallax;
  const n = Math.sin(wx * 0.0012) * 55
          + Math.sin(wx * 0.004) * 35
          + Math.sin(wx * 0.013) * 14
          + Math.sin(wx * 0.028) * 6;
  return surfaceY - COAST_BASE - n * COAST_AMP + yOff;
}

function drawRockyCoast(surfaceY, parallax, yOff, darker) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-10, canvas.height);
  for (let x = -10; x <= canvas.width + 60; x += 12) {
    ctx.lineTo(x, coastTopY(surfaceY, x, parallax, yOff));
  }
  ctx.lineTo(canvas.width + 10, canvas.height);
  ctx.closePath();
  const rc = darker ? 8 : 14;
  const rg = ctx.createLinearGradient(0, surfaceY - 180 + yOff, 0, surfaceY + 30);
  rg.addColorStop(0, `rgb(${rc + 8},${rc + 6},${rc})`);
  rg.addColorStop(0.5, `rgb(${rc + 4},${rc + 3},${rc})`);
  rg.addColorStop(1, `rgb(${rc},${rc - 2},${rc - 4})`);
  ctx.fillStyle = rg;
  ctx.fill();
  fillRockTexture(parallax, darker ? 0.5 : 0.75);

  // Cold light catching the ridge
  ctx.beginPath();
  for (let x = -10; x <= canvas.width + 60; x += 12) {
    const y = coastTopY(surfaceY, x, parallax, yOff);
    if (x === -10) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = `rgba(150,140,170,${0.16 * (0.4 + getDaylightFactor() * 0.8)})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Rock strata lines
  if (!darker) {
    ctx.strokeStyle = "rgba(50,40,28,0.18)";
    ctx.lineWidth = 1;
    for (let row = 0; row < 6; row++) {
      const rowY = surfaceY - 80 + yOff + row * 22;
      ctx.beginPath();
      for (let x = 0; x <= canvas.width; x += 18) {
        const wx = x + camera.x * parallax;
        const topEdge = coastTopY(surfaceY, x, parallax, yOff);
        if (rowY > topEdge) {
          const jit = Math.sin(wx * 0.04 + row * 2.1) * 2;
          if (x === 0 || rowY <= topEdge + 18) ctx.moveTo(x, rowY + jit);
          else ctx.lineTo(x, rowY + jit);
        }
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

// One notched pine tier with a faint lit left flank
function pineTier(sx, apexX, apexY, botY, halfW, scale, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(apexX, apexY);
  ctx.lineTo(sx + halfW, botY);
  for (let n = 3; n >= 1; n--) {
    ctx.lineTo(sx + halfW * (n / 4) * 1.0, botY - 2.5 * scale);
    ctx.lineTo(sx + halfW * ((n - 0.5) / 4) * 0.8, botY + 0.5 * scale);
  }
  ctx.lineTo(sx - halfW, botY);
  ctx.closePath();
  ctx.fill();
  const day = getDaylightFactor();
  ctx.fillStyle = `rgba(120,130,160,${0.05 + day * 0.1})`;
  ctx.beginPath();
  ctx.moveTo(apexX, apexY);
  ctx.lineTo(sx - halfW, botY);
  ctx.lineTo(sx - halfW * 0.2, botY);
  ctx.closePath();
  ctx.fill();
}

// Pines along the whole coast. Each tree has a fixed spot on its hill layer, so the forest
// scrolls with the hill and stands on its ridge; only the visible stretch is drawn.
function drawPineForest(surfaceY, parallax, yOff, seed, spacing, scale) {
  const baseWx = camera.x * parallax;
  const now = performance.now() / 1000;
  const first = Math.floor((baseWx - 60) / spacing);
  const last = Math.ceil((baseWx + canvas.width + 60) / spacing);
  for (let i = first; i <= last; i++) {
    // Clearings: some stretches of the ridge stay bare
    if (hash(Math.floor(i / 6) * 7.3 + seed) < 0.22) continue;
    const wx = i * spacing + hash(i * 13 + seed) * spacing * 0.8;
    const sx = wx - baseWx;
    if (sx < -50 || sx > canvas.width + 50) continue;

    const groundY = coastTopY(surfaceY, sx, parallax, yOff) + 4 * scale;
    const treeH = (55 + hash(i + seed) * 45) * scale;
    const treeW = (10 + hash(i * 7 + seed) * 6) * scale;

    // Trunk
    ctx.fillStyle = "#0a0806";
    ctx.fillRect(sx - 1.5 * scale, groundY - treeH * 0.15, 3 * scale, treeH * 0.15);

    // Wind sway — gusts roll along the treeline, tips move more than the base
    const sway = (Math.sin(now * 0.9 + wx * 0.013) + Math.sin(now * 2.3 + wx * 0.05) * 0.35) * treeH * 0.03;

    // Pine layers (3-4 triangular tiers)
    const layers = 3 + Math.floor(hash(i * 11 + seed) * 2);
    for (let l = 0; l < layers; l++) {
      const t = l / layers;
      const layerBot = groundY - treeH * 0.15 - treeH * 0.85 * t;
      const layerW = treeW * (1.15 - t * 0.55);
      const layerH = treeH * 0.32;

      pineTier(sx, sx + sway * ((l + 1) / layers), layerBot - layerH, layerBot + 3 * scale, layerW, scale,
        l % 2 === 0 ? "#080e07" : "#060b05");
    }
  }
}

function drawTownBuildings(surfaceY) {
  // The village climbs the hills behind the harbour: two rows of houses and a church
  const townSx = canvas.width / 2 + (TOWN_WX - player.x) * 0.25;
  if (townSx < -800 || townSx > canvas.width + 800) return;
  const dark = 1 - getDaylightFactor();
  const now = performance.now() / 1000;
  const wall = [[58, 46, 40], [66, 52, 42], [48, 44, 46], [72, 58, 48]];
  const roofs = [[34, 20, 18], [26, 22, 28], [44, 24, 18]];

  for (let row = 0; row < 2; row++) {
    const count = row ? 17 : 24;
    for (let i = 0; i < count; i++) {
      const k = i + row * 40;
      const sx = townSx + (i - count / 2) * (row ? 56 : 44) + hash(k * 7) * 18;
      if (sx < -30 || sx > canvas.width + 30) continue;
      const bw = 20 + hash(k * 3) * 14;
      const bh = 24 + hash(k + 1) * 24;
      // Back row sits higher up the slope
      const gy = coastTopY(surfaceY, sx, 0.25, 5) - bh * 0.45 + hash(k) * 6 - row * 16;
      const w = wall[Math.floor(hash(k * 5) * wall.length)];
      const r = roofs[Math.floor(hash(k * 9) * roofs.length)];
      const shade = row ? 0.7 : 1;

      ctx.fillStyle = `rgb(${w[0] * shade},${w[1] * shade},${w[2] * shade})`;
      ctx.fillRect(sx - bw / 2, gy, bw, bh);
      // Dark side and timber beams
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(sx + bw * 0.15, gy, bw * 0.35, bh);
      ctx.fillStyle = "rgba(20,12,8,0.45)";
      ctx.fillRect(sx - bw / 2, gy + bh * 0.45, bw, 1.5);
      ctx.fillRect(sx - 0.7, gy, 1.4, bh);

      // Steep roof with an overhang
      const rh = 11 + hash(k * 9) * 9;
      ctx.fillStyle = `rgb(${r[0] * shade},${r[1] * shade},${r[2] * shade})`;
      ctx.beginPath();
      ctx.moveTo(sx - bw / 2 - 4, gy + 1);
      ctx.lineTo(sx - 1, gy - rh);
      ctx.lineTo(sx + 1, gy - rh);
      ctx.lineTo(sx + bw / 2 + 4, gy + 1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(150,135,170,0.14)";
      ctx.beginPath();
      ctx.moveTo(sx - bw / 2 - 4, gy + 1);
      ctx.lineTo(sx - 1, gy - rh);
      ctx.lineTo(sx - 1, gy - rh + 3);
      ctx.lineTo(sx - bw / 2 + 2, gy + 1);
      ctx.closePath();
      ctx.fill();

      // Chimney with drifting smoke
      if (hash(k * 17 + 4) > 0.5) {
        const chx = sx + bw * 0.22, chy = gy - rh * 0.5;
        ctx.fillStyle = "#15100c";
        ctx.fillRect(chx - 2, chy - 8, 4, 10);
        for (let p = 0; p < 6; p++) {
          const age = (now * 0.12 + p / 6 + hash(k * 3 + 1)) % 1;
          ctx.fillStyle = `rgba(95,92,96,${(1 - age) * 0.22})`;
          ctx.beginPath();
          ctx.arc(chx - age * 26 - age * age * 18, chy - 10 - age * 46, 2 + age * 8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Windows switch on one by one as dusk falls; a few stay dark
      const switchOn = 0.25 + hash(k * 13 + 2) * 0.5;
      const lit = hash(k * 19 + 8) > 0.2 ? Math.max(0, Math.min(1, (dark - switchOn) * 6)) : 0;
      const flicker = Math.sin(now * 3 + k * 2.7) * 0.08 * lit;
      const glow = 0.1 + lit * (0.45 + hash(k + 2) * 0.45);
      if (lit > 0.05 && !row) shoreLights.push({ x: sx, a: lit * (0.45 + hash(k * 3) * 0.4), rgb: "255,195,110" });
      ctx.fillStyle = `rgba(255,195,110,${glow + flicker})`;
      const wins = bw > 28 ? 2 : 1;
      for (let wI = 0; wI < wins; wI++) {
        for (let fl = 0; fl < (bh > 36 ? 2 : 1); fl++) {
          ctx.fillRect(sx - bw / 2 + 4 + wI * (bw * 0.45), gy + 5 + fl * 15, 5, 7);
        }
      }
      if (lit > 0) {
        const wg = ctx.createRadialGradient(sx, gy + 9, 1, sx, gy + 9, 18);
        wg.addColorStop(0, `rgba(255,190,100,${(0.12 + flicker) * lit})`);
        wg.addColorStop(1, "rgba(255,190,100,0)");
        ctx.fillStyle = wg;
        ctx.fillRect(sx - 18, gy - 8, 36, 36);
      }
    }
  }

  // Church with a steeple, standing above the roofs
  const csx = townSx + 40;
  if (csx > -60 && csx < canvas.width + 60) {
    const base = coastTopY(surfaceY, csx, 0.25, 5) - 14;
    ctx.fillStyle = "#3e3632";
    ctx.fillRect(csx - 16, base - 34, 32, 40);
    ctx.fillRect(csx - 6, base - 74, 12, 42);
    ctx.fillStyle = "#1c1618";
    ctx.beginPath();
    ctx.moveTo(csx - 9, base - 74);
    ctx.lineTo(csx, base - 104);
    ctx.lineTo(csx + 9, base - 74);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(csx - 19, base - 34);
    ctx.lineTo(csx, base - 52);
    ctx.lineTo(csx + 19, base - 34);
    ctx.closePath();
    ctx.fill();
    const lit = Math.max(0.12, Math.min(1, dark * 1.4));
    ctx.fillStyle = `rgba(255,200,120,${0.25 + 0.6 * lit})`;
    ctx.fillRect(csx - 2, base - 66, 4, 9);
    ctx.fillRect(csx - 9, base - 22, 4, 9);
    ctx.fillRect(csx + 5, base - 22, 4, 9);
  }
}

// ------- LIGHTHOUSE (foreground, detailed, on rocky cliff) -------

function getLighthouseScreenX() {
  return LIGHTHOUSE_WX - camera.x;
}

function drawLighthouseCliff(surfaceY) {
  const sx = getLighthouseScreenX();
  if (sx < -350 || sx > canvas.width + 200) return;

  const waterY = surfaceY;
  const cliffTop = waterY - LIGHTHOUSE_CLIFF_H;
  const cliffL = sx - LIGHTHOUSE_CLIFF_W * 0.55;
  const cliffR = sx + LIGHTHOUSE_CLIFF_W * 0.45;

  // Above-water cliff face
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cliffL - 30, waterY + 8);
  // Left slope (jagged)
  ctx.lineTo(cliffL + 10, cliffTop + 60);
  ctx.lineTo(cliffL + 5, cliffTop + 35);
  ctx.lineTo(cliffL + 20, cliffTop + 20);
  ctx.lineTo(cliffL + 15, cliffTop + 5);
  // Top plateau (slightly rough)
  ctx.lineTo(cliffL + 30, cliffTop - 5);
  ctx.lineTo(cliffL + 50, cliffTop - 8);
  ctx.lineTo(sx - 10, cliffTop - 12);
  ctx.lineTo(sx + 20, cliffTop - 10);
  ctx.lineTo(sx + 50, cliffTop - 6);
  ctx.lineTo(cliffR - 30, cliffTop);
  ctx.lineTo(cliffR - 10, cliffTop + 8);
  // Right slope
  ctx.lineTo(cliffR, cliffTop + 30);
  ctx.lineTo(cliffR + 10, cliffTop + 55);
  ctx.lineTo(cliffR + 20, waterY + 8);
  ctx.closePath();

  // Rock gradient
  const rg = ctx.createLinearGradient(sx, cliffTop - 15, sx, waterY + 10);
  rg.addColorStop(0, "#3a3020");
  rg.addColorStop(0.25, "#2e2418");
  rg.addColorStop(0.6, "#221a10");
  rg.addColorStop(1, "#181208");
  ctx.fillStyle = rg;
  ctx.fill();
  fillRockTexture(1, 0.6);
  // Light from the upper left grazes the cliff face
  const edge = ctx.createLinearGradient(cliffL, 0, cliffR, 0);
  edge.addColorStop(0, "rgba(190,170,215,0.16)");
  edge.addColorStop(0.45, "rgba(190,170,215,0)");
  edge.addColorStop(1, "rgba(0,0,0,0.3)");
  ctx.fillStyle = edge;
  ctx.fill();

  // Rock strata detail
  ctx.strokeStyle = "rgba(60,48,30,0.3)";
  ctx.lineWidth = 1;
  for (let row = 0; row < 8; row++) {
    const ry = cliffTop + 5 + row * 18;
    if (ry > waterY) break;
    ctx.beginPath();
    const jx1 = cliffL + 20 + row * 5;
    const jx2 = cliffR - 10 - row * 3;
    ctx.moveTo(jx1, ry + Math.sin(row * 1.5) * 3);
    ctx.lineTo((jx1 + jx2) * 0.5, ry + Math.sin(row * 1.5 + 2) * 4);
    ctx.lineTo(jx2, ry + Math.sin(row * 1.5 + 4) * 2);
    ctx.stroke();
  }

  // Dark crevices
  ctx.fillStyle = "rgba(8,5,2,0.35)";
  ctx.fillRect(cliffL + 35, cliffTop + 30, 4, 25);
  ctx.fillRect(sx + 15, cliffTop + 20, 3, 35);
  ctx.fillRect(cliffR - 25, cliffTop + 40, 5, 20);

  // Moss patches on top
  ctx.fillStyle = "#1a2a14";
  for (let m = 0; m < 5; m++) {
    const mx = cliffL + 35 + m * 38 + hash(m * 7) * 10;
    const my = cliffTop - 8 + hash(m * 11) * 6;
    ctx.beginPath();
    ctx.ellipse(mx, my, 12 + hash(m) * 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawLighthouseCliffUnderwater(surfaceY) {
  const sx = getLighthouseScreenX();
  if (sx < -350 || sx > canvas.width + 200) return;

  const waterY = surfaceY;
  const cliffL = sx - LIGHTHOUSE_CLIFF_W * 0.55 - 20;
  const cliffR = sx + LIGHTHOUSE_CLIFF_W * 0.45 + 10;
  const underwaterDepth = 120;

  // Underwater rock
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cliffL - 10, waterY);
  ctx.lineTo(cliffL + 20, waterY + underwaterDepth * 0.6);
  ctx.lineTo(cliffL + 50, waterY + underwaterDepth);
  ctx.lineTo(cliffR - 40, waterY + underwaterDepth + 15);
  ctx.lineTo(cliffR + 5, waterY + underwaterDepth * 0.5);
  ctx.lineTo(cliffR + 25, waterY);
  ctx.closePath();

  const ug = ctx.createLinearGradient(sx, waterY, sx, waterY + underwaterDepth + 15);
  ug.addColorStop(0, "#1e1a10");
  ug.addColorStop(0.5, "#141008");
  ug.addColorStop(1, "#0a0804");
  ctx.fillStyle = ug;
  ctx.fill();
  ctx.restore();
}

function drawLighthouseTower(surfaceY) {
  const sx = getLighthouseScreenX();
  if (sx < -350 || sx > canvas.width + 200) return;

  const cliffTop = surfaceY - LIGHTHOUSE_CLIFF_H;
  const towerCX = sx + 10;
  const towerBase = cliffTop - 12;
  const towerHeight = 185;
  const widthBot = 38;
  const widthTop = 28;

  // Keeper's house: stone walls, tiled roof, chimney, door and lamplit windows
  const dusk = 1 - getDaylightFactor();
  ctx.fillStyle = "#2a2018";
  ctx.fillRect(towerCX - 42, towerBase - 5, 84, 32);
  ctx.fillStyle = "#4a3e30";
  ctx.fillRect(towerCX - 40, towerBase - 3, 80, 28);
  ctx.strokeStyle = "rgba(20,14,8,0.4)";
  ctx.lineWidth = 1;
  for (let row = 0; row < 4; row++) {
    const ry = towerBase - 3 + row * 7;
    ctx.beginPath();
    ctx.moveTo(towerCX - 40, ry);
    ctx.lineTo(towerCX + 40, ry);
    for (let cx = -40 + (row % 2) * 8; cx < 40; cx += 16) {
      ctx.moveTo(towerCX + cx, ry);
      ctx.lineTo(towerCX + cx, ry + 7);
    }
    ctx.stroke();
  }
  // Chimney with a thread of smoke
  ctx.fillStyle = "#2c241c";
  ctx.fillRect(towerCX + 22, towerBase - 34, 8, 20);
  const smokeT = performance.now() / 1000;
  for (let p = 0; p < 5; p++) {
    const age = (smokeT * 0.15 + p / 5) % 1;
    ctx.fillStyle = `rgba(110,106,110,${(1 - age) * 0.25})`;
    ctx.beginPath();
    ctx.arc(towerCX + 26 + age * 22, towerBase - 38 - age * 40, 2 + age * 7, 0, Math.PI * 2);
    ctx.fill();
  }
  // Roof with tile rows
  ctx.fillStyle = "#3a1e18";
  ctx.beginPath();
  ctx.moveTo(towerCX - 48, towerBase - 4);
  ctx.lineTo(towerCX, towerBase - 28);
  ctx.lineTo(towerCX + 48, towerBase - 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(10,4,2,0.4)";
  for (let t = 1; t < 4; t++) {
    ctx.beginPath();
    ctx.moveTo(towerCX - 48 + t * 10, towerBase - 4 - t * 6);
    ctx.lineTo(towerCX + 48 - t * 10, towerBase - 4 - t * 6);
    ctx.stroke();
  }
  // Door and windows with light from inside
  ctx.fillStyle = "#2a1a10";
  ctx.fillRect(towerCX - 5, towerBase + 8, 10, 17);
  [-26, 16].forEach((dx) => {
    ctx.fillStyle = `rgba(255,190,100,${0.3 + dusk * 0.65})`;
    ctx.fillRect(towerCX + dx, towerBase + 5, 10, 11);
    ctx.strokeStyle = "#1a1008";
    ctx.lineWidth = 1.2;
    ctx.strokeRect(towerCX + dx, towerBase + 5, 10, 11);
    ctx.beginPath();
    ctx.moveTo(towerCX + dx + 5, towerBase + 5);
    ctx.lineTo(towerCX + dx + 5, towerBase + 16);
    ctx.stroke();
    if (dusk > 0.3) {
      const wg = ctx.createRadialGradient(towerCX + dx + 5, towerBase + 10, 1, towerCX + dx + 5, towerBase + 10, 26);
      wg.addColorStop(0, `rgba(255,190,100,${0.3 * dusk})`);
      wg.addColorStop(1, "rgba(255,190,100,0)");
      ctx.fillStyle = wg;
      ctx.fillRect(towerCX + dx - 21, towerBase - 16, 52, 52);
    }
  });

  // Tower body — red/white stripes
  const stripeCount = 10;
  const stripeH = towerHeight / stripeCount;
  for (let s = 0; s < stripeCount; s++) {
    const t = s / stripeCount;
    const bw = widthBot + (widthTop - widthBot) * t;
    const tw = widthBot + (widthTop - widthBot) * ((s + 1) / stripeCount);
    const by = towerBase - 5 - s * stripeH;
    const ty = by - stripeH;

    const isRed = s % 2 === 0;
    ctx.fillStyle = isRed ? "#8a2828" : "#d0c4b0";
    ctx.beginPath();
    ctx.moveTo(towerCX - bw / 2, by);
    ctx.lineTo(towerCX + bw / 2, by);
    ctx.lineTo(towerCX + tw / 2, ty);
    ctx.lineTo(towerCX - tw / 2, ty);
    ctx.closePath();
    ctx.fill();

    // Subtle shading on left side
    if (isRed) {
      ctx.fillStyle = "rgba(0,0,0,0.15)";
      ctx.beginPath();
      ctx.moveTo(towerCX - bw / 2, by);
      ctx.lineTo(towerCX - bw / 4, by);
      ctx.lineTo(towerCX - tw / 4, ty);
      ctx.lineTo(towerCX - tw / 2, ty);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Gallery / balcony platform
  const galleryY = towerBase - 5 - towerHeight;
  const galleryW = widthTop + 16;
  ctx.fillStyle = "#1a1410";
  ctx.fillRect(towerCX - galleryW / 2, galleryY - 2, galleryW, 8);
  // Gallery railing posts
  ctx.strokeStyle = "#2a2018";
  ctx.lineWidth = 1.5;
  for (let p = -3; p <= 3; p++) {
    const px = towerCX + p * (galleryW / 7);
    ctx.beginPath();
    ctx.moveTo(px, galleryY - 2);
    ctx.lineTo(px, galleryY - 12);
    ctx.stroke();
  }
  // Gallery railing top bar
  ctx.strokeStyle = "#2a2018";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(towerCX - galleryW / 2, galleryY - 12);
  ctx.lineTo(towerCX + galleryW / 2, galleryY - 12);
  ctx.stroke();

  // Light housing (glass enclosure)
  const lightY = galleryY - 12;
  const lightH = 24;
  const lightW = 20;
  ctx.fillStyle = "#1a2028";
  ctx.fillRect(towerCX - lightW / 2, lightY - lightH, lightW, lightH);
  // Glass panels
  ctx.fillStyle = "rgba(180,220,200,0.15)";
  ctx.fillRect(towerCX - lightW / 2 + 2, lightY - lightH + 2, lightW - 4, lightH - 4);
  // Internal light glow
  const lgY = lightY - lightH / 2;
  const lg = ctx.createRadialGradient(towerCX, lgY, 2, towerCX, lgY, 22);
  lg.addColorStop(0, "rgba(255,220,140,0.95)");
  lg.addColorStop(0.3, "rgba(255,200,100,0.5)");
  lg.addColorStop(0.6, "rgba(255,180,80,0.15)");
  lg.addColorStop(1, "rgba(255,160,60,0)");
  ctx.fillStyle = lg;
  ctx.beginPath();
  ctx.arc(towerCX, lgY, 22, 0, Math.PI * 2);
  ctx.fill();

  // Larger ambient glow
  const lg2 = ctx.createRadialGradient(towerCX, lgY, 3, towerCX, lgY, 55);
  lg2.addColorStop(0, "rgba(255,210,130,0.45)");
  lg2.addColorStop(0.4, "rgba(255,190,100,0.12)");
  lg2.addColorStop(1, "rgba(255,180,80,0)");
  ctx.fillStyle = lg2;
  ctx.beginPath();
  ctx.arc(towerCX, lgY, 55, 0, Math.PI * 2);
  ctx.fill();

  // Conical roof
  ctx.fillStyle = "#1a1612";
  ctx.beginPath();
  ctx.moveTo(towerCX - lightW / 2 - 3, lightY - lightH);
  ctx.lineTo(towerCX, lightY - lightH - 18);
  ctx.lineTo(towerCX + lightW / 2 + 3, lightY - lightH);
  ctx.closePath();
  ctx.fill();

  // Weather vane / finial
  ctx.strokeStyle = "#3a3028";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(towerCX, lightY - lightH - 18);
  ctx.lineTo(towerCX, lightY - lightH - 30);
  ctx.stroke();
}

function drawLighthouseBeam(surfaceY) {
  const sx = getLighthouseScreenX();
  if (sx < -1200 || sx > canvas.width + 1200) return;

  // The lamp burns from dusk to dawn and stands dark through the middle of the day
  const daylight = getDaylightFactor();
  const vis = Math.max(0, Math.min(1, (0.85 - daylight) * 2));
  if (vis <= 0) return;

  const cliffTop = surfaceY - LIGHTHOUSE_CLIFF_H;
  const towerHeight = 185;
  const towerCX = sx + 10;
  const lightY = cliffTop - 12 - 5 - towerHeight - 12 - 12;

  // Beam rotation — sweeps left and right smoothly
  const beamTime = performance.now() * 0.0003;
  const beamAngle = Math.sin(beamTime) * 1.1;

  // Beam parameters
  const beamLength = 800; // longer beam
  const beamSpread = 0.15; // half-angle

  // Calculate beam end points
  const endCX = towerCX + Math.sin(beamAngle) * beamLength;
  const endCY = lightY + Math.cos(beamAngle) * beamLength * 0.15;
  const perpX = Math.cos(beamAngle) * beamLength * beamSpread;
  const perpY = -Math.sin(beamAngle) * beamLength * beamSpread;

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = vis;

  // 1. Soft Aura Beam (wide, very transparent)
  const auraGrad = ctx.createLinearGradient(towerCX, lightY, endCX, endCY);
  auraGrad.addColorStop(0, "rgba(255,230,160,0.15)");
  auraGrad.addColorStop(0.4, "rgba(255,220,140,0.06)");
  auraGrad.addColorStop(1, "rgba(255,200,100,0)");

  ctx.fillStyle = auraGrad;
  ctx.beginPath();
  ctx.moveTo(towerCX, lightY);
  ctx.lineTo(endCX - perpX * 1.5, endCY - perpY * 1.5);
  ctx.lineTo(endCX + perpX * 1.5, endCY + perpY * 1.5);
  ctx.closePath();
  ctx.fill();

  // 2. Core Intense Beam (narrower, brighter)
  const coreGrad = ctx.createLinearGradient(towerCX, lightY, endCX, endCY);
  coreGrad.addColorStop(0, "rgba(255,245,210,0.45)");
  coreGrad.addColorStop(0.3, "rgba(255,230,160,0.18)");
  coreGrad.addColorStop(0.8, "rgba(255,210,120,0.02)");
  coreGrad.addColorStop(1, "rgba(255,200,100,0)");

  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.moveTo(towerCX, lightY);
  ctx.lineTo(endCX - perpX * 0.6, endCY - perpY * 0.6);
  ctx.lineTo(endCX + perpX * 0.6, endCY + perpY * 0.6);
  ctx.closePath();
  ctx.fill();

  // 3. Central Bulb Lens Flare / Glow
  const flareScale = 1 + Math.sin(performance.now() * 0.002) * 0.05; // slight flicker
  const glow = ctx.createRadialGradient(towerCX, lightY, 0, towerCX, lightY, 90 * flareScale);
  glow.addColorStop(0, "rgba(255,255,255,0.95)");
  glow.addColorStop(0.1, "rgba(255,240,180,0.6)");
  glow.addColorStop(0.4, "rgba(255,210,120,0.15)");
  glow.addColorStop(1, "rgba(255,180,80,0)");

  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(towerCX, lightY, 90 * flareScale, 0, Math.PI * 2);
  ctx.fill();

  // Water reflection when beam hits water
  if (beamAngle > -0.5 && beamAngle < 0.5) {
    const refX = towerCX + Math.sin(beamAngle) * 300;
    const refW = 100 + Math.abs(beamAngle) * 200;
    const refAlpha = 0.08 * (1 - Math.abs(beamAngle));
    const rg = ctx.createRadialGradient(refX, surfaceY + 5, 0, refX, surfaceY + 5, refW);
    rg.addColorStop(0, `rgba(255,220,140,${refAlpha})`);
    rg.addColorStop(1, "rgba(255,220,140,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(refX - refW, surfaceY - 10, refW * 2, 60);
  }

  // CAMERA FLASH & LENS FLARE when beam points straight down/center (sweeps through 0)
  const flashWidth = 0.18;
  const flashIntensity = Math.max(0, 1 - Math.abs(beamAngle) / flashWidth);

  if (flashIntensity > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    // 1. Full-screen flash overlay (stronger at night)
    const glareAlpha = flashIntensity * 0.22 * (1 - daylight * 0.4);
    ctx.fillStyle = `rgba(255, 248, 220, ${glareAlpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Bulb blinding radial glow
    const glowRadius = 90 + flashIntensity * 260;
    const radG = ctx.createRadialGradient(towerCX, lightY, 2, towerCX, lightY, glowRadius);
    radG.addColorStop(0, "rgba(255, 255, 255, 1.0)");
    radG.addColorStop(0.12, "rgba(255, 235, 170, 0.75)");
    radG.addColorStop(0.35, "rgba(255, 180, 80, 0.35)");
    radG.addColorStop(0.7, "rgba(255, 140, 50, 0.06)");
    radG.addColorStop(1.0, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = radG;
    ctx.beginPath();
    ctx.arc(towerCX, lightY, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // 3. Horizontal lens flare streak
    const streakW = 400 + flashIntensity * 800;
    const streakH = 4 + flashIntensity * 12;
    const sGrad = ctx.createLinearGradient(towerCX - streakW/2, lightY, towerCX + streakW/2, lightY);
    sGrad.addColorStop(0, "rgba(200,220,255,0)");
    sGrad.addColorStop(0.4, "rgba(200,230,255,0.4)");
    sGrad.addColorStop(0.5, "rgba(255,255,255,0.9)");
    sGrad.addColorStop(0.6, "rgba(200,230,255,0.4)");
    sGrad.addColorStop(1, "rgba(200,220,255,0)");
    ctx.fillStyle = sGrad;
    ctx.fillRect(towerCX - streakW/2, lightY - streakH/2, streakW, streakH);

    ctx.restore();
  }
}

function drawCliffPines(surfaceY) {
  const sx = getLighthouseScreenX();
  if (sx < -350 || sx > canvas.width + 200) return;

  const cliffTop = surfaceY - LIGHTHOUSE_CLIFF_H;
  const cliffL = sx - LIGHTHOUSE_CLIFF_W * 0.55;

  // Small pine trees on the cliff
  const trees = [
    { dx: -45, h: 50, w: 9 },
    { dx: -25, h: 65, w: 11 },
    { dx: -60, h: 40, w: 8 },
    { dx: 65, h: 35, w: 7 },
    { dx: 80, h: 55, w: 10 },
    { dx: -75, h: 30, w: 7 },
  ];

  trees.forEach((tr) => {
    const tx = sx + tr.dx;
    const groundY = cliffTop - 8 + hash(tr.dx + 100) * 6;

    // Trunk
    ctx.fillStyle = "#0c0a06";
    ctx.fillRect(tx - 1.5, groundY - tr.h * 0.2, 3, tr.h * 0.2);

    // Pine layers
    for (let l = 0; l < 3; l++) {
      const t = l / 3;
      const ly = groundY - tr.h * 0.2 - tr.h * 0.8 * t;
      const lw = tr.w * (1.1 - t * 0.45);
      const lh = tr.h * 0.35;

      pineTier(tx, tx, ly - lh, ly + 3, lw, 1, l % 2 === 0 ? "#0a1208" : "#070e05");
    }
  });
}


// =====================================================================
// CORAL REEF RENDERING
// =====================================================================

/**
 * Draws the coral reef environment when the camera is in the reef zone.
 * Call this AFTER drawSeabed but BEFORE fish.
 */
function drawCoralReef(surfaceY) {
  // Only render if reef is (partially) visible
  const reefLeft  = REEF_WX_START - camera.x;
  const reefRight = REEF_WX_END   - camera.x;
  if (reefRight < -80 || reefLeft > canvas.width + 80) return;

  const t = performance.now() * 0.001;
  const waterH = canvas.height - surfaceY;

  // --- 1. Tint the water with an eerie coral-red/teal gradient overlay ---
  const visL = Math.max(0, reefLeft);
  const visR = Math.min(canvas.width, reefRight);
  if (visR > visL) {
    // Edge fade blend
    const fadeW = 320;
    const reefGrad = ctx.createLinearGradient(visL, 0, visR, 0);
    reefGrad.addColorStop(0,   "rgba(0,0,0,0)");
    reefGrad.addColorStop(Math.min(1, fadeW / (visR - visL)), "rgba(60,10,30,0.28)");
    reefGrad.addColorStop(Math.max(0, 1 - fadeW / (visR - visL)), "rgba(60,10,30,0.28)");
    reefGrad.addColorStop(1,   "rgba(0,0,0,0)");
    ctx.fillStyle = reefGrad;
    ctx.fillRect(visL, surfaceY, visR - visL, waterH);

    // Bioluminescent shimmer — teal + magenta pulses on top of water
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 18; i++) {
      const wx = REEF_WX_START + hash(i * 23) * (REEF_WX_END - REEF_WX_START);
      const sx = wx - camera.x;
      if (sx < -60 || sx > canvas.width + 60) continue;
      const pulse = Math.sin(t * (0.6 + hash(i * 11) * 0.8) + i * 2.1) * 0.5 + 0.5;
      const depth = 0.15 + hash(i * 41) * 0.5;
      const cy = surfaceY + depth * waterH * 0.65;
      const col = i % 3 === 0
        ? `rgba(255,60,180,${0.04 + pulse * 0.06})`
        : i % 3 === 1
        ? `rgba(60,255,180,${0.03 + pulse * 0.05})`
        : `rgba(255,180,60,${0.025 + pulse * 0.04})`;
      const rg = ctx.createRadialGradient(sx, cy, 0, sx, cy, 80 + pulse * 50);
      rg.addColorStop(0, col);
      rg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.ellipse(sx, cy, 80 + pulse * 50, 20 + pulse * 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // --- 2. Draw coral structures on the seabed ---
  const coralData = [];
  for (let wx = REEF_WX_START + 80; wx < REEF_WX_END - 80; wx += 90) {
    coralData.push({ wx, seed: hash(wx * 0.01) });
  }

  coralData.forEach(({ wx, seed }) => {
    const sx = wx - camera.x;
    if (sx < -120 || sx > canvas.width + 120) return;

    const baseY = seabedYAt(wx);

    // Hue cycles through coral palette based on seed
    const hues  = [0, 20, 300, 160, 40]; // red, orange, magenta, teal, amber
    const hueIdx = Math.floor(seed * hues.length);
    const hue   = hues[hueIdx];
    const h2    = hues[(hueIdx + 2) % hues.length];

    const coralType = Math.floor(seed * 3); // 0=branch, 1=fan, 2=dome

    // Reef corals glow on their own, so they show through the darkness
    const glowRgb = { 0: "255,70,90", 20: "255,130,60", 300: "230,70,220", 160: "60,240,190", 40: "255,190,70" }[hue];
    addGlow(sx, baseY - 26, 80, 0.32 + 0.12 * Math.sin(t * 1.3 + wx * 0.01), glowRgb);

    if (coralType === 0) {
      // Branching coral
      const drawBranch = (x, y, angle, len, depth) => {
        if (len < 3 || depth > 5) return;
        const ex = x + Math.sin(angle) * len;
        const ey = y - Math.cos(angle) * len;
        const bright = 35 + depth * 8;
        ctx.strokeStyle = `hsl(${hue}, 80%, ${bright}%)`;
        ctx.lineWidth = Math.max(0.8, 3 - depth * 0.5);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        const sway = Math.sin(t * 0.8 + depth + seed * 5) * 0.18;
        drawBranch(ex, ey, angle - 0.55 + sway, len * 0.65, depth + 1);
        drawBranch(ex, ey, angle + 0.55 + sway, len * 0.65, depth + 1);
        if (depth < 2) drawBranch(ex, ey, angle + sway, len * 0.7, depth + 1);
      };
      const coralH = 28 + seed * 35;
      ctx.save();
      drawBranch(sx, baseY, 0, coralH * 0.5, 0);
      ctx.restore();

      // Polyp dots at tips
      ctx.fillStyle = `hsl(${h2}, 90%, 70%)`;
      ctx.shadowColor = `hsl(${h2}, 100%, 60%)`;
      ctx.shadowBlur = 6;
      for (let p = 0; p < 4; p++) {
        const px = sx + (hash(seed * 7 + p) - 0.5) * 30;
        const py = baseY - 20 - hash(seed * 13 + p) * 40;
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

    } else if (coralType === 1) {
      // Fan coral (flat plane)
      const fanH = 35 + seed * 40;
      const fanW = 22 + seed * 25;
      const sway = Math.sin(t * 0.55 + seed * 3) * 0.07;
      ctx.save();
      ctx.translate(sx, baseY);
      ctx.rotate(sway);
      // Main stalk
      ctx.strokeStyle = `hsl(${hue}, 60%, 22%)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -fanH * 0.3);
      ctx.stroke();
      // Fan mesh
      const strips = 6;
      for (let s = 0; s <= strips; s++) {
        const px = (s / strips - 0.5) * fanW * 2;
        ctx.strokeStyle = `hsl(${hue}, 75%, ${28 + s * 3}%)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, -fanH * 0.3);
        ctx.quadraticCurveTo(px + Math.sin(t + s) * 5, -fanH * 0.65, px * 0.4, -fanH);
        ctx.stroke();
      }
      // Top rim glow
      ctx.strokeStyle = `hsl(${h2}, 90%, 60%)`;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = `hsl(${h2}, 100%, 55%)`;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(-fanW, -fanH * 0.95);
      ctx.quadraticCurveTo(0, -fanH - 8, fanW, -fanH * 0.95);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();

    } else {
      // Dome / brain coral
      const domeR = 14 + seed * 22;
      const sway  = Math.sin(t * 0.4 + seed * 4) * 1.5;
      const dg = ctx.createRadialGradient(sx + sway, baseY - domeR, 2, sx + sway, baseY - domeR, domeR);
      dg.addColorStop(0, `hsl(${hue}, 70%, 40%)`);
      dg.addColorStop(0.6, `hsl(${hue}, 65%, 24%)`);
      dg.addColorStop(1,   `hsl(${hue}, 55%, 12%)`);
      ctx.fillStyle = dg;
      ctx.shadowColor = `hsl(${h2}, 100%, 50%)`;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(sx + sway, baseY - domeR + 2, domeR, Math.PI, 0);
      ctx.fill();
      ctx.shadowBlur = 0;
      // Groove lines
      ctx.strokeStyle = `hsl(${hue}, 55%, 18%)`;
      ctx.lineWidth = 0.8;
      for (let g = 0; g < 4; g++) {
        const gx = sx + sway + (g - 1.5) * (domeR * 0.55);
        ctx.beginPath();
        ctx.arc(gx, baseY - domeR * 0.5, domeR * 0.6, Math.PI * 0.9, Math.PI * 0.1, true);
        ctx.stroke();
      }
    }
  });

  // --- 3. Surface glow band visible from above ---
  if (visR > visL) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const surfPulse = Math.sin(t * 1.2) * 0.5 + 0.5;
    const surfGrad = ctx.createLinearGradient(visL, surfaceY, visR, surfaceY);
    surfGrad.addColorStop(0, "rgba(0,0,0,0)");
    surfGrad.addColorStop(0.15, `rgba(255,60,180,${0.04 + surfPulse * 0.04})`);
    surfGrad.addColorStop(0.5,  `rgba(60,255,200,${0.06 + surfPulse * 0.05})`);
    surfGrad.addColorStop(0.85, `rgba(255,60,180,${0.04 + surfPulse * 0.04})`);
    surfGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = surfGrad;
    ctx.fillRect(visL, surfaceY - 10, visR - visL, 30);
    ctx.restore();
  }

  // --- 4. Reef boundary markers (eerie floating signs) ---
  const markers = [
    { wx: REEF_WX_START + 60, label: "⚠ KRVAVÝ ÚTES" },
    { wx: REEF_WX_END   - 60, label: "⚠ KONEC ÚTESU" }
  ];
  markers.forEach(({ wx, label }) => {
    const sx = wx - camera.x;
    if (sx < -60 || sx > canvas.width + 60) return;
    const bobbY = surfaceY - 38 + Math.sin(t * 0.9 + wx) * 4;
    ctx.save();
    ctx.font = "bold 11px 'Cinzel', Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,80,120,0.9)";
    ctx.shadowColor = "rgba(255,0,80,0.8)";
    ctx.shadowBlur = 10;
    ctx.fillText(label, sx, bobbY);
    ctx.shadowBlur = 0;
    // Post
    ctx.strokeStyle = "rgba(120,40,60,0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx, bobbY + 4);
    ctx.lineTo(sx, surfaceY - 6);
    ctx.stroke();
    ctx.restore();
  });
}

// =====================================================================
// OIL RIG RENDERING
// =====================================================================

function drawOilRig(surfaceY) {
  const sx = OILRIG_WX - camera.x;
  if (sx < -300 || sx > canvas.width + 300) return;

  const t = performance.now() * 0.001;
  const rigY = surfaceY - 120; // Main platform height

  ctx.save();
  ctx.translate(sx, 0);

  // Legs above the waterline (drawOilRigUnderwater continues them below)
  ctx.fillStyle = "#111";
  ctx.fillRect(-80, rigY, 20, surfaceY - rigY);
  ctx.fillRect(60, rigY, 20, surfaceY - rigY);

  // Cross bracing between the legs
  ctx.strokeStyle = "#222";
  ctx.lineWidth = 4;
  for (let y = rigY + 40; y < surfaceY; y += 60) {
    ctx.beginPath();
    ctx.moveTo(-60, y);
    ctx.lineTo(60, y + 30);
    ctx.moveTo(60, y);
    ctx.lineTo(-60, y + 30);
    ctx.stroke();
  }

  // Main Platform
  ctx.fillStyle = "#2a2a2a";
  ctx.fillRect(-120, rigY, 240, 25);
  ctx.fillStyle = "#3a3a3a";
  ctx.fillRect(-110, rigY - 15, 220, 15);

  // Drill tower
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.moveTo(-40, rigY - 15);
  ctx.lineTo(40, rigY - 15);
  ctx.lineTo(15, rigY - 140);
  ctx.lineTo(-15, rigY - 140);
  ctx.fill();

  // Tower crossbeams
  ctx.strokeStyle = "#0a0a0a";
  ctx.lineWidth = 2;
  for (let y = rigY - 30; y > rigY - 130; y -= 20) {
    const w = 15 + ((y - (rigY - 140)) / 125) * 25;
    ctx.beginPath();
    ctx.moveTo(-w, y);
    ctx.lineTo(w, y - 10);
    ctx.moveTo(w, y);
    ctx.lineTo(-w, y - 10);
    ctx.stroke();
  }

  // Red blinking light on top
  const blink = Math.sin(t * 4) > 0 ? 1 : 0.2;
  ctx.fillStyle = `rgba(255, 0, 0, ${blink})`;
  ctx.beginPath();
  ctx.arc(0, rigY - 145, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = "red";
  ctx.shadowBlur = 15 * blink;
  ctx.fill();
  ctx.shadowBlur = 0;

  // Crane
  ctx.strokeStyle = "#222";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(60, rigY - 15);
  ctx.lineTo(110, rigY - 80);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(110, rigY - 80);
  ctx.lineTo(110, rigY - 20);
  ctx.stroke();

  // Floating buoys (docking area)
  const bobY = Math.sin(t * 1.5) * 3;
  ctx.fillStyle = "#e64a19";
  ctx.fillRect(-140, surfaceY - 10 + bobY, 12, 12);
  ctx.fillRect(-160, surfaceY - 10 + bobY, 12, 12);

  ctx.restore();
}

// ------- WATER & UNDERWATER -------

function drawWaterSurface(surfaceY) {
  const t = performance.now() * 0.0007; // slow, heavy swell
  const daylight = getDaylightFactor();

  // Base color of the water surface
  const rBase = Math.round(2 + daylight * 12);
  const gBase = Math.round(14 + daylight * 42);
  const bBase = Math.round(18 + daylight * 34);

  ctx.save();

  // Draw the water plane background with a richer gradient
  const waterH = 55; // slightly taller horizon band
  const planeGrad = ctx.createLinearGradient(0, surfaceY, 0, surfaceY + waterH);
  planeGrad.addColorStop(0, `rgb(${Math.round(rBase * 0.3)}, ${Math.round(gBase * 0.35)}, ${Math.round(bBase * 0.4)})`);
  planeGrad.addColorStop(0.5, `rgb(${Math.round(rBase * 0.6)}, ${Math.round(gBase * 0.7)}, ${Math.round(bBase * 0.75)})`);
  planeGrad.addColorStop(1, `rgb(${rBase}, ${gBase}, ${bBase})`);
  // Translucent sheen only — the depths below stay dark
  ctx.globalAlpha = 0.3 + daylight * 0.25;
  ctx.fillStyle = planeGrad;
  ctx.fillRect(0, surfaceY, canvas.width, waterH);
  ctx.globalAlpha = 1;

  // Bright meniscus where air meets water
  ctx.strokeStyle = `rgba(${Math.round(150 + daylight * 80)},${Math.round(175 + daylight * 65)},${Math.round(190 + daylight * 50)},${0.22 + daylight * 0.25 + lightningFlash * 0.4})`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let x = -10; x <= canvas.width + 10; x += 12) {
    const y = surfaceY + Math.sin((x + camera.x * 0.9) * 0.035 + t * 1.6) * 1.2;
    if (x === -10) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Draw 3D perspective wave layers (8 layers)
  const layers = 8;
  for (let i = 0; i < layers; i++) {
    const ratio = i / (layers - 1);
    // Exponential spacing for perspective
    const yOffset = Math.pow(ratio, 1.8) * waterH;
    const wy = surfaceY + yOffset;

    // Wave parameters based on depth
    const amp = (0.6 + ratio * 3.8) * (1 + shakeIntensity * 0.1);
    const freq = 0.03 - ratio * 0.016;
    const speed = t * (1.1 + ratio * 2.8);

    ctx.beginPath();
    // Array to store points for drawing highlights on wave crests
    const wavePoints = [];
    for (let x = -20; x <= canvas.width + 20; x += 4) {
      // Waves scroll horizontally based on player movement (parallax scroll!)
      const worldX = x + camera.x * (0.3 + ratio * 0.7);
      const y = wy + Math.sin(worldX * freq + speed) * amp
                 + Math.cos(worldX * freq * 0.5 - speed * 0.6) * amp * 0.4;
      wavePoints.push({x, y, rawSin: Math.sin(worldX * freq + speed)});
      if (x === -20) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    // Wave color - fades in foreground, gets thicker
    const opacity = 0.15 + ratio * 0.3;
    const rW = Math.round(rBase + 45 * ratio);
    const gW = Math.round(gBase + 65 * ratio);
    const bW = Math.round(bBase + 60 * ratio);
    ctx.strokeStyle = `rgba(${rW}, ${gW}, ${bW}, ${opacity})`;
    ctx.lineWidth = 0.8 + ratio * 2.4;
    ctx.stroke();

    // Draw specular highlights (glints) and foam on the wave crests
    if (i > 2) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const glintAlpha = (0.05 + ratio * 0.12) * (0.5 + daylight * 0.5);
      ctx.lineWidth = (0.8 + ratio * 2.2) * 0.6;
      ctx.lineCap = "round";
      // Short strokes whose strength follows how close each point is to a crest
      for (let j = 1; j < wavePoints.length; j++) {
        const pt = wavePoints[j];
        const k = (pt.rawSin - 0.55) / 0.45;
        if (k <= 0) continue;
        const sm = k * k * (3 - 2 * k);
        ctx.strokeStyle = `rgba(240, 250, 255, ${glintAlpha * sm})`;
        ctx.beginPath();
        ctx.moveTo(wavePoints[j - 1].x, wavePoints[j - 1].y);
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  ctx.restore();
}

function drawBubbles(surfaceY) {
  const t = performance.now() * 0.0022;
  bubbleSpots.forEach((b) => {
    const sx = b.wx - camera.x;
    if (sx < -40 || sx > canvas.width + 40) return;
    const by = surfaceY - 6 + Math.sin(t + b.phase) * 3;
    const stock = b.stock === undefined ? SPOT_MAX_STOCK : b.stock;
    if (stock <= 0) return;
    const count = stock >= 3 ? 5 : stock + 1;
    ctx.save();
    ctx.lineWidth = 1.2;
    for (let i = 0; i < count; i++) {
      const ox = (i - 2) * 6 + Math.sin(b.phase * 1.3 + i) * 4;
      const oy = -i * 3 - (i % 2);
      const rr = 2.2 + i * 1.4;
      ctx.beginPath();
      ctx.arc(sx + ox, by + oy, rr * 0.45, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(230,240,255,${0.14 + i * 0.05})`;
      ctx.stroke();
    }
    ctx.restore();
  });
}

function drawUnderwater(surfaceY) {
  // How the water looks where light reaches it — the darkness pass decides what is seen
  const g = ctx.createLinearGradient(0, surfaceY, 0, canvas.height);
  g.addColorStop(0, "#14403e");
  g.addColorStop(0.45, "#0b2a2c");
  g.addColorStop(1, "#04100f");
  ctx.fillStyle = g;
  ctx.fillRect(0, surfaceY, canvas.width, canvas.height - surfaceY);
}

function drawUnderwaterCaustics(surfaceY) {
  const t = performance.now() * 0.001;
  ctx.save();
  ctx.globalCompositeOperation = "screen";

  // Caustic light ripples on the water column
  for (let i = 0; i < 12; i++) {
    const cx = (hash(i * 31) * canvas.width + Math.sin(t * 0.3 + i * 1.7) * 40) % canvas.width;
    const cy = surfaceY + 15 + hash(i * 47) * 80;
    const rx = 30 + hash(i * 53) * 40;
    const ry = 8 + hash(i * 61) * 6;
    const alpha = 0.02 + Math.sin(t * 0.8 + i * 2.3) * 0.015;

    ctx.fillStyle = `rgba(120,200,160,${alpha})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, Math.sin(t * 0.2 + i) * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawSeabed(surfaceY) {
  ctx.beginPath();
  ctx.moveTo(0, canvas.height);
  for (let x = 0; x <= canvas.width + 60; x += 20) {
    ctx.lineTo(x, seabedYAt(camera.x + x));
  }
  ctx.lineTo(canvas.width, canvas.height);
  ctx.lineTo(0, canvas.height);
  ctx.closePath();

  const gb = ctx.createLinearGradient(0, canvas.height - 140, 0, canvas.height);
  gb.addColorStop(0, "#1e2818");
  gb.addColorStop(0.4, "#162010");
  gb.addColorStop(1, "#0a0e06");
  ctx.fillStyle = gb;
  ctx.fill();
  fillRockTexture(1, 0.3);

  // Sand ripples following the slope, and a pale crest where the light catches the bed
  ctx.lineWidth = 1;
  for (let r = 0; r < 4; r++) {
    ctx.strokeStyle = `rgba(150,140,100,${0.16 - r * 0.03})`;
    ctx.beginPath();
    for (let x = 0; x <= canvas.width + 20; x += 20) {
      const y = seabedYAt(camera.x + x) + 10 + r * 11 + Math.sin((camera.x + x) * 0.05 + r * 2) * 1.6;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(190,180,130,0.28)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let x = 0; x <= canvas.width + 20; x += 20) {
    const y = seabedYAt(camera.x + x);
    if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Pebbles, shells and bones scattered over the sand
  const p0 = Math.floor((camera.x - 20) / 46);
  const p1 = Math.floor((camera.x + canvas.width + 20) / 46);
  for (let c = p0; c <= p1; c++) {
    if (hash(c * 3.7) < 0.35) continue;
    const px = c * 46 + hash(c * 5.1) * 40 - camera.x;
    const py = seabedYAt(c * 46 + hash(c * 5.1) * 40) + 6 + hash(c * 8.3) * 28;
    const kind = hash(c * 11.9);
    if (kind < 0.55) {
      ctx.fillStyle = `rgba(${70 + hash(c) * 40},${68 + hash(c) * 30},${54},0.8)`;
      ctx.beginPath();
      ctx.ellipse(px, py, 3 + hash(c * 2) * 5, 2 + hash(c * 4) * 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(190,185,150,0.25)";
      ctx.fillRect(px - 2, py - 2, 3, 1);
    } else if (kind < 0.85) {
      ctx.fillStyle = "rgba(205,190,160,0.7)";
      ctx.beginPath();
      ctx.arc(px, py, 3.5, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = "rgba(90,76,56,0.6)";
      ctx.lineWidth = 0.8;
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + k * 2.4, py - 3.4);
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = "rgba(200,195,170,0.55)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(px - 6, py);
      ctx.lineTo(px + 6, py - 2);
      ctx.moveTo(px - 2, py - 3);
      ctx.lineTo(px + 2, py + 2);
      ctx.stroke();
    }
  }

  // Rock formations on seabed
  ctx.strokeStyle = "rgba(25,35,20,0.5)";
  ctx.lineWidth = 2;
  for (let i = 0; i < seabedFeatures.length; i++) {
    const s = seabedFeatures[i];
    const ssx = s.wx - camera.x;
    if (ssx < -150 || ssx > canvas.width + 150) continue;
    // Rocks rest on the seabed (they used to hang at a fixed height off the screen bottom)
    const base = Math.max(seabedYAt(s.wx), seabedYAt(s.wx + s.w)) + 4;
    const by = base - s.height * 0.6;

    ctx.beginPath();
    ctx.moveTo(ssx, base);
    ctx.quadraticCurveTo(ssx + s.w * 0.3, by - 8, ssx + s.w * 0.5, by + 5);
    ctx.quadraticCurveTo(ssx + s.w * 0.7, by - 12, ssx + s.w, base);
    ctx.strokeStyle = "rgba(30,42,28,0.7)";
    ctx.stroke();

    // Fill rock, shaded from its lit left side to a dark right side
    const rockG = ctx.createLinearGradient(ssx, 0, ssx + s.w, 0);
    rockG.addColorStop(0, "rgba(58,70,56,0.75)");
    rockG.addColorStop(1, "rgba(10,16,10,0.85)");
    ctx.fillStyle = rockG;
    ctx.fill();
    fillRockTexture(1, 0.25);
    ctx.strokeStyle = "rgba(150,170,130,0.22)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(ssx, base);
    ctx.quadraticCurveTo(ssx + s.w * 0.3, by - 8, ssx + s.w * 0.5, by + 5);
    ctx.stroke();
  }
}

// =====================================================================
// UNDERWATER LIGHTING — the depths are black. The scene below the surface
// is drawn as if lit, then a darkness layer covers it, with holes cut where
// the boat's headlight and a few living lights (jellyfish, corals) reach.
// =====================================================================

const LIGHT_PAD = 40;                 // extra margin so screen shake never shows an edge
const lightCanvas = document.createElement("canvas");
const lightCtx = lightCanvas.getContext("2d");
const frameGlows = [];                // light sources registered while drawing this frame

function addGlow(x, y, r, strength, color) {
  frameGlows.push({ x, y, r, strength, color });
}

function computeHeadlight() {
  const pct = Math.max(0, battery / BATTERY_MAX);
  const lvl = upgrades.lights;
  let flicker = 1;
  if (pct > 0 && pct < 0.2) {
    const f = Math.sin(performance.now() * 0.025 + Math.random() * 0.5) * 0.5 + 0.5;
    flicker = 0.15 + f * 0.5;
  }
  const on = headlightOn && pct > 0;
  // A tired battery shortens the beam as well as dimming it
  const vigor = 0.6 + 0.4 * Math.min(1, pct * 2);
  const waterH = Math.max(1, canvas.height - getSurfaceY());
  return {
    on,
    pct,
    flicker,
    dead: pct <= 0,
    // Full strength until the battery runs low, then it fades out
    strength: on ? Math.min(1, 0.35 + pct * 1.3) * flicker : 0,
    // A small downward cone; only the light upgrade makes it reach deeper and wider
    halfW: (58 + (lvl - 1) * 16 + Math.sin(performance.now() * 0.001) * 3) * vigor,
    reachPx: waterH * (0.28 + (lvl - 1) * 0.17) * vigor,
    // The bow lamp throws light forward over the water
    bowLen: (240 + (lvl - 1) * 45) * vigor,
    r: Math.round(110 + (1 - pct) * 140),
    g: Math.round(200 + pct * 20),
    b: Math.round(110 + pct * 60)
  };
}

function toggleHeadlight() {
  headlightOn = !headlightOn;
  playClick();
}

function cutLight(g, x, y, r, a) {
  const rg = g.createRadialGradient(x, y, 0, x, y, r);
  rg.addColorStop(0, `rgba(0,0,0,${a})`);
  rg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rg;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

// Geometry of the bow lamp's forward beam (the boat's facing eases through zero when it turns)
function bowBeam(boatX, surfaceY) {
  const sgn = boatFacing >= 0 ? 1 : -1;
  const lamp = Math.abs(boatFacing);
  const len = headlight.bowLen * lamp;
  const bx = boatX + BOAT_LAMP_X * boatFacing;
  return { sgn, len, bx, far: bx + sgn * len, depthFar: 22 + len * 0.17 };
}

function cutBowLight(g, boatX, surfaceY) {
  const bb = bowBeam(boatX, surfaceY);
  if (bb.len < 10) return;
  const s = headlight.strength;
  for (let i = 0; i < 3; i++) {
    const k = 1 - i * 0.28;                       // widest wedge first, then tighter cores
    const grad = g.createLinearGradient(bb.bx, 0, bb.far, 0);
    grad.addColorStop(0, `rgba(0,0,0,${0.55 * s})`);
    grad.addColorStop(0.6, `rgba(0,0,0,${0.34 * s})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(bb.bx, surfaceY - 3);
    g.lineTo(bb.far, surfaceY - 3);
    g.lineTo(bb.far, surfaceY + bb.depthFar * k);
    g.lineTo(bb.bx + bb.sgn * 8, surfaceY + 10 * k);
    g.closePath();
    g.fill();
  }
  cutLight(g, bb.bx + bb.sgn * bb.len * 0.45, surfaceY + 14, bb.len * 0.38, 0.4 * s);
}

function drawUnderwaterDarkness(surfaceY, boatX, keelY) {
  const W = canvas.width + LIGHT_PAD * 2;
  const H = canvas.height + LIGHT_PAD * 2;
  if (lightCanvas.width !== W || lightCanvas.height !== H) {
    lightCanvas.width = W;
    lightCanvas.height = H;
  }
  const g = lightCtx;
  g.setTransform(1, 0, 0, 1, LIGHT_PAD, LIGHT_PAD);
  g.globalCompositeOperation = "source-over";
  g.clearRect(-LIGHT_PAD, -LIGHT_PAD, W, H);

  const day = getDaylightFactor();
  const lift = 1 - lightningFlash * 0.75;          // lightning shows the depths for a heartbeat
  const surfA = (0.9 - day * 0.45) * lift;         // daylight only gets a little way down
  const deepA = 0.985 * lift;
  const reach = 40 + day * 110;
  const top = surfaceY - 1;
  const left = -LIGHT_PAD, width = W;

  const amb = g.createLinearGradient(0, top, 0, top + reach);
  amb.addColorStop(0, `rgba(1,5,8,${surfA})`);
  amb.addColorStop(1, `rgba(1,4,7,${deepA})`);
  g.fillStyle = amb;
  g.fillRect(left, top, width, reach);
  g.fillStyle = `rgba(1,4,7,${deepA})`;
  g.fillRect(left, top + reach, width, H);

  g.globalCompositeOperation = "destination-out";
  const hl = headlight;
  if (hl.on && hl.strength > 0.01) {
    const reachY = keelY + hl.reachPx;
    // Nested cones give the beam a soft edge and a brighter core; it fades out at its reach
    const layers = 7;
    for (let i = 0; i < layers; i++) {
      const k = i / (layers - 1);                  // 0 = outer halo, 1 = core
      const w = hl.halfW * (1.45 - 0.85 * k);
      const topW = 8 + 10 * (1 - k);
      const a = 0.24 * hl.strength;
      const grad = g.createLinearGradient(0, keelY, 0, reachY);
      grad.addColorStop(0, `rgba(0,0,0,${a})`);
      grad.addColorStop(0.55, `rgba(0,0,0,${a * 0.7})`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(boatX - topW, keelY);
      g.lineTo(boatX - w, reachY);
      g.lineTo(boatX + w, reachY);
      g.lineTo(boatX + topW, keelY);
      g.closePath();
      g.fill();
    }
    cutLight(g, boatX, keelY + 18, 70, 0.4 * hl.strength);
    cutBowLight(g, boatX, surfaceY);
  }
  // The deck lantern spills a little warm light onto the water around the boat
  cutLight(g, boatX - 60 * boatFacing, surfaceY + 6, 85, 0.3);
  frameGlows.forEach((gl) => cutLight(g, gl.x, gl.y, gl.r, gl.strength));

  g.globalCompositeOperation = "source-over";
  ctx.drawImage(lightCanvas, -LIGHT_PAD, -LIGHT_PAD);
}

// Coloured bloom for things that glow on their own, drawn over the darkness
function drawEmissiveGlows() {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  frameGlows.forEach((gl) => {
    if (!gl.color) return;
    const r = gl.r * 0.7;
    const rg = ctx.createRadialGradient(gl.x, gl.y, 0, gl.x, gl.y, r);
    rg.addColorStop(0, `rgba(${gl.color},${gl.strength * 0.35})`);
    rg.addColorStop(1, `rgba(${gl.color},0)`);
    ctx.fillStyle = rg;
    ctx.fillRect(gl.x - r, gl.y - r, r * 2, r * 2);
  });
  ctx.restore();
}

// The downward beam: a small cone whose reach grows with the light upgrade
function drawLightCone(screenBoatX, keelY, surfaceY) {
  const hl = headlight;
  const H = canvas.height;

  if (!hl.on) {
    // Dead battery: only a weak red emergency blink at the bow
    if (hl.dead && headlightOn) {
      const blink = Math.sin(performance.now() * 0.006) > 0.7 ? 0.5 : 0;
      if (blink > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        const eg = ctx.createRadialGradient(screenBoatX + BOAT_LAMP_X * boatFacing, keelY + BOAT_LAMP_DY, 1, screenBoatX + BOAT_LAMP_X * boatFacing, keelY + BOAT_LAMP_DY, 18);
        eg.addColorStop(0, `rgba(255,60,60,${blink})`);
        eg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = eg;
        ctx.fillRect(screenBoatX + BOAT_LAMP_X * boatFacing - 18, keelY + BOAT_LAMP_DY - 18, 36, 36);
        ctx.restore();
      }
    }
    return;
  }

  const s = hl.strength;
  const { r, g, b } = hl;
  const t = performance.now() * 0.001;
  const reachY = Math.min(H - 25, keelY + hl.reachPx);
  ctx.save();
  ctx.globalCompositeOperation = "screen";

  // Haze inside the beam, fading to nothing at its reach
  const cone = ctx.createLinearGradient(0, keelY, 0, reachY);
  cone.addColorStop(0, `rgba(${r},${g},${b},${0.17 * s})`);
  cone.addColorStop(0.45, `rgba(${Math.round(r * 0.6)},${Math.round(g * 0.8)},${b},${0.07 * s})`);
  cone.addColorStop(1, "rgba(20,60,40,0)");
  ctx.fillStyle = cone;
  ctx.beginPath();
  ctx.moveTo(screenBoatX - 12, keelY + 4);
  ctx.lineTo(screenBoatX - hl.halfW, reachY);
  ctx.lineTo(screenBoatX + hl.halfW, reachY);
  ctx.lineTo(screenBoatX + 12, keelY + 4);
  ctx.closePath();
  ctx.fill();

  // Shafts of light drifting slowly inside the beam
  for (let i = 0; i < 5; i++) {
    const u = (i + 0.5) / 5 - 0.5;
    const sway = Math.sin(t * (0.3 + i * 0.07) + i * 1.7) * 0.12;
    const spread = (u + sway) * 2 * hl.halfW * 0.85;
    const w = 4 + hash(i * 13) * 9;
    const a = (0.04 + 0.03 * Math.sin(t * 0.7 + i * 2.3)) * s;
    const sg = ctx.createLinearGradient(0, keelY, 0, reachY);
    sg.addColorStop(0, `rgba(${r},${g},${b},${a})`);
    sg.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(screenBoatX - 3, keelY + 4);
    ctx.lineTo(screenBoatX + spread - w, reachY);
    ctx.lineTo(screenBoatX + spread + w, reachY);
    ctx.lineTo(screenBoatX + 3, keelY + 4);
    ctx.closePath();
    ctx.fill();
  }

  // Caustic shimmer only when the beam actually reaches the seabed
  if (keelY + hl.reachPx > H - 70) {
    const causticCount = Math.round(7 * Math.min(1, s * 1.2));
    for (let i = 0; i < causticCount; i++) {
      const cx = screenBoatX + (i - 3) * 22 + Math.sin(t * 1.5 + i * 1.5) * 14;
      const cy = H - 50 - hash(i * 17) * 30;
      const cr = 10 + Math.sin(t * 1.8 + i * 2.1) * 5;
      ctx.fillStyle = `rgba(120,220,160,${(0.05 + Math.sin(t * 1.2 + i * 1.8) * 0.025) * s})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy, cr * 1.5, cr * 0.4, Math.sin(t * 1.5 + i) * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Bloom on the lamp under the hull and on the bow fixture
  const lamp = ctx.createRadialGradient(screenBoatX, keelY + 6, 0, screenBoatX, keelY + 6, 40);
  lamp.addColorStop(0, `rgba(${r + 40},${g + 20},${b + 30},${0.35 * s})`);
  lamp.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = lamp;
  ctx.fillRect(screenBoatX - 40, keelY - 34, 80, 80);
  const head = ctx.createRadialGradient(screenBoatX + BOAT_LAMP_X * boatFacing, keelY + BOAT_LAMP_DY, 1, screenBoatX + BOAT_LAMP_X * boatFacing, keelY + BOAT_LAMP_DY, 22);
  head.addColorStop(0, `rgba(${Math.min(255, r + 60)},${Math.min(255, g + 30)},200,${0.55 * s})`);
  head.addColorStop(1, "rgba(255,255,200,0)");
  ctx.fillStyle = head;
  ctx.fillRect(screenBoatX + BOAT_LAMP_X * boatFacing - 22, keelY + BOAT_LAMP_DY - 22, 44, 44);
  ctx.restore();
}

// The bow lamp: a beam through the air that lands on the water ahead of the boat
function drawBowLight(screenBoatX, keelY, surfaceY) {
  const hl = headlight;
  if (!hl.on) return;
  const bb = bowBeam(screenBoatX, surfaceY);
  if (bb.len < 10) return;
  const s = hl.strength;
  const { r, g, b } = hl;
  const t = performance.now() * 0.001;
  const lampY = keelY + BOAT_LAMP_DY;
  ctx.save();
  ctx.globalCompositeOperation = "screen";

  // Beam through the air, from the lamp down to the sea ahead
  const air = ctx.createLinearGradient(bb.bx, 0, bb.far, 0);
  air.addColorStop(0, `rgba(${r + 60},${g + 30},${b + 40},${0.34 * s})`);
  air.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = air;
  ctx.beginPath();
  ctx.moveTo(bb.bx, lampY - 2);
  ctx.lineTo(bb.far, surfaceY - 12);
  ctx.lineTo(bb.far, surfaceY + 4);
  ctx.lineTo(bb.bx, lampY + 3);
  ctx.closePath();
  ctx.fill();

  // The sea surface lit up ahead
  ctx.save();
  ctx.translate(bb.bx + bb.sgn * bb.len * 0.55, surfaceY + 3);
  ctx.scale(1, 0.13);
  const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, bb.len * 0.5);
  pool.addColorStop(0, `rgba(${r + 50},${g + 30},${b + 40},${0.7 * s})`);
  pool.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.arc(0, 0, bb.len * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // A shallow wedge of light under the surface
  const wedge = ctx.createLinearGradient(bb.bx, 0, bb.far, 0);
  wedge.addColorStop(0, `rgba(${r},${g},${b},${0.26 * s})`);
  wedge.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = wedge;
  ctx.beginPath();
  ctx.moveTo(bb.bx, surfaceY - 2);
  ctx.lineTo(bb.far, surfaceY - 2);
  ctx.lineTo(bb.far, surfaceY + bb.depthFar * 0.8);
  ctx.lineTo(bb.bx + bb.sgn * 8, surfaceY + 8);
  ctx.closePath();
  ctx.fill();

  // Glints dancing on the waves in the beam
  for (let i = 0; i < 14; i++) {
    const u = (i + 0.5) / 14;
    const x = bb.bx + bb.sgn * bb.len * (0.12 + 0.86 * u) + Math.sin(t * 1.4 + i * 2.1) * 6;
    const flick = 0.5 + 0.5 * Math.sin(t * 3.2 + i * 1.7);
    ctx.fillStyle = `rgba(235,255,245,${0.5 * flick * (1 - u * 0.8) * s})`;
    ctx.fillRect(x - 2, surfaceY + 1 + (i % 3) * 2, 4 + (1 - u) * 3, 1.2);
  }
  ctx.restore();
}

// --- Marine snow: drifting specks that only show up inside the light ---

const marineSnow = [];
for (let i = 0; i < 160; i++) {
  marineSnow.push({
    u: Math.random(),
    v: Math.random(),
    z: 0.4 + Math.random() * 0.8,       // depth in the volume: nearer specks move faster
    ph: Math.random() * Math.PI * 2,
    s: 0.8 + Math.random() * 1.4
  });
}

function drawMarineSnow(surfaceY) {
  const t = performance.now() * 0.001;
  const W = canvas.width + 40;
  const waterH = canvas.height - surfaceY - 20;
  ctx.save();
  marineSnow.forEach((m) => {
    let x = (m.u * W - camera.x * m.z * 0.35 + Math.sin(t * 0.3 + m.ph) * 8) % W;
    if (x < 0) x += W;
    const y = (m.v + t * 0.008 * m.z) % 1;
    ctx.fillStyle = `rgba(205,228,218,${0.25 + 0.45 * (m.z - 0.4)})`;
    ctx.fillRect(x - 20, surfaceY + 10 + y * waterH, m.s, m.s);
  });
  ctx.restore();
}

// --- Bioluminescent wake: at night the sea sparkles where the hull churns it ---

const bioWake = [];

function updateBioWake(dt) {
  const night = 1 - getDaylightFactor();
  if (night > 0.55 && Math.abs(boatVx) > 40 && !dockActive && bioWake.length < 260) {
    const n = Math.floor(dt * 45 + Math.random());
    const back = -Math.sign(boatVx);
    for (let k = 0; k < n; k++) {
      bioWake.push({
        wx: player.x + back * wlRand(55, 110),
        depth: wlRand(3, 28),
        vx: back * wlRand(5, 25),
        life: 0,
        max: wlRand(1.2, 2.4),
        r: wlRand(1, 2.4)
      });
    }
  }
  for (let i = bioWake.length - 1; i >= 0; i--) {
    const p = bioWake[i];
    p.life += dt;
    p.wx += p.vx * dt;
    p.vx *= Math.pow(0.4, dt);
    if (p.life > p.max) bioWake.splice(i, 1);
  }
}

function drawBioWake(surfaceY) {
  if (!bioWake.length) return;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  bioWake.forEach((p) => {
    const u = p.life / p.max;
    const a = (u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85) * 0.7;
    const x = p.wx - camera.x;
    const y = surfaceY + p.depth;
    const rr = p.r * 4;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, rr);
    gr.addColorStop(0, `rgba(130,240,255,${a})`);
    gr.addColorStop(1, "rgba(40,160,255,0)");
    ctx.fillStyle = gr;
    ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  });
  ctx.restore();
}

// --- Rain landing on the sea ---

const rainRipples = [];

function drawRainRipples(surfaceY) {
  if (!rainRipples.length) return;
  ctx.save();
  ctx.lineWidth = 0.8;
  rainRipples.forEach((rp) => {
    const u = rp.t / 0.55;
    ctx.strokeStyle = `rgba(190,215,235,${(1 - u) * 0.35})`;
    ctx.beginPath();
    ctx.ellipse(rp.x, surfaceY + 1.5, 1.5 + u * 9, 0.6 + u * 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.restore();
}

// --- Oil rig legs below the waterline (the water fill used to hide them) ---

function drawOilRigUnderwater(surfaceY) {
  const sx = OILRIG_WX - camera.x;
  if (sx < -300 || sx > canvas.width + 300) return;
  const H = canvas.height;
  ctx.save();
  ctx.translate(sx, 0);
  const lg = ctx.createLinearGradient(0, surfaceY, 0, H);
  lg.addColorStop(0, "#2c2926");
  lg.addColorStop(1, "#121110");
  ctx.fillStyle = lg;
  ctx.fillRect(-80, surfaceY, 20, H - surfaceY);
  ctx.fillRect(60, surfaceY, 20, H - surfaceY);

  // Cross bracing continues down to the seabed
  ctx.strokeStyle = "#25221f";
  ctx.lineWidth = 4;
  for (let y = surfaceY - 80; y < H; y += 60) {
    if (y + 30 < surfaceY) continue;
    ctx.beginPath();
    ctx.moveTo(-60, Math.max(surfaceY, y));
    ctx.lineTo(60, y + 30);
    ctx.moveTo(60, Math.max(surfaceY, y));
    ctx.lineTo(-60, y + 30);
    ctx.stroke();
  }

  // Rust streaks and weed growing on the legs
  [-80, 60].forEach((lx, li) => {
    for (let k = 0; k < 5; k++) {
      const ry = surfaceY + 20 + hash(li * 31 + k * 7) * (H - surfaceY - 60);
      ctx.fillStyle = "rgba(120,62,30,0.28)";
      ctx.fillRect(lx + 3 + hash(k * 13 + li) * 10, ry, 3, 18 + hash(k * 5) * 30);
    }
    ctx.strokeStyle = "rgba(30,60,36,0.8)";
    ctx.lineWidth = 2;
    for (let k = 0; k < 4; k++) {
      const wx = lx + 4 + k * 4;
      ctx.beginPath();
      ctx.moveTo(wx, H - 50);
      ctx.quadraticCurveTo(wx + Math.sin(performance.now() * 0.0015 + k) * 8, H - 80, wx + Math.sin(performance.now() * 0.001 + k) * 5, H - 110 - k * 8);
      ctx.stroke();
    }
  });
  ctx.restore();
}

// --- Lightning: storms at night, briefly lighting the sky and the depths ---

const lightning = { next: 10 + Math.random() * 10, t: 99, bolt: null };
let lightningFlash = 0;

function updateLightning(dt) {
  const stormy = getDaylightFactor() < 0.45 || danger >= 7;
  lightning.t += dt;
  if (stormy && !gameOver && !dockActive) {
    lightning.next -= dt;
    if (lightning.next <= 0) strikeLightning();
  }
  // Bright strike, a short gap, then a weaker re-strike
  const t = lightning.t;
  let f = Math.exp(-t * 9);
  if (t > 0.12) f = Math.max(f, 0.75 * Math.exp(-(t - 0.12) * 6));
  lightningFlash = t < 1.5 ? f : 0;
}

function strikeLightning() {
  lightning.t = 0;
  lightning.next = 12 + Math.random() * 25 - Math.min(8, danger * 0.6);
  const bottom = getSurfaceY() * (0.5 + Math.random() * 0.2);
  let x = canvas.width * (0.1 + Math.random() * 0.8);
  let y = 0;
  const pts = [];
  while (y < bottom) {
    pts.push([x, y]);
    y += 12 + Math.random() * 22;
    x += (Math.random() - 0.5) * 34;
  }
  pts.push([x, bottom]);
  const from = pts[Math.floor(pts.length * (0.3 + Math.random() * 0.3))];
  const dir = Math.random() < 0.5 ? -1 : 1;
  const branch = [];
  let bx = from[0], by = from[1];
  for (let i = 0; i < 5; i++) {
    branch.push([bx, by]);
    bx += dir * (10 + Math.random() * 18);
    by += 10 + Math.random() * 16;
  }
  lightning.bolt = { pts, branch };
  triggerScreenShake(3);
  // Thunder arrives later the further away the strike was
  playThunder(0.4 + Math.random() * 1.6);
}

function drawLightningBolt() {
  if (!lightning.bolt || lightningFlash < 0.03) return;
  const a = Math.min(1, lightningFlash * 1.2);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const stroke = (pts, w, col) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  };
  stroke(lightning.bolt.pts, 10, `rgba(150,170,255,${a * 0.16})`);
  stroke(lightning.bolt.pts, 3.5, `rgba(200,215,255,${a * 0.5})`);
  stroke(lightning.bolt.pts, 1.4, `rgba(255,255,255,${a})`);
  stroke(lightning.bolt.branch, 1, `rgba(230,235,255,${a * 0.8})`);
  ctx.restore();
}

function drawLightningFlash(surfaceY) {
  if (lightningFlash < 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = `rgba(190,205,255,${lightningFlash * 0.32})`;
  ctx.fillRect(0, 0, canvas.width, surfaceY + 4);
  ctx.fillStyle = `rgba(150,180,220,${lightningFlash * 0.07})`;
  ctx.fillRect(0, surfaceY + 4, canvas.width, canvas.height - surfaceY);
  ctx.restore();
}

// --- HUD: battery / headlight ---

function updateHullHud() {
  const slots = document.querySelectorAll("#hull-slots i");
  slots.forEach((el, i) => el.classList.toggle("hit", i < hullDamage));
  const btn = document.getElementById("btn-repair-hull");
  if (btn && !btn._busy) {
    const cost = hullDamage * HULL_REPAIR_COST;
    btn.textContent = hullDamage ? `Opravit trup ($${cost})` : "Trup je v pořádku";
    btn.disabled = !hullDamage;
  }
}

function updateBatteryHud() {
  const fill = document.getElementById("battery-bar-fill");
  if (!fill) return;
  const pct = Math.max(0, Math.min(100, battery));
  fill.style.width = pct + "%";
  fill.classList.toggle("low", pct < 20);
  const pctEl = document.getElementById("battery-pct");
  if (pctEl) pctEl.textContent = Math.round(pct);
  const wrap = document.getElementById("battery-bar-wrap");
  if (wrap) wrap.classList.toggle("off", !headlightOn);
  const label = document.getElementById("battery-bar-label");
  if (label) label.textContent = headlightOn ? "Světlo" : "Zhasnuto";
}

// =====================================================================
// SOUND — procedural WebAudio, no files: sea, rain, engine, thunder and
// minigame cues. Starts on the first key press (browsers block audio until
// the player interacts). M mutes, and the choice is remembered.
// =====================================================================

const SOUND_VOLUME = 0.6;
const sound = { ctx: null, master: null, noise: null, rain: null, engine: null, engineOsc: null, chug: null, muted: false };
try {
  sound.muted = localStorage.getItem("deep-awakes-muted") === "1";
} catch (e) {
  // storage unavailable — keep the default
}

function noiseLoop() {
  const src = sound.ctx.createBufferSource();
  src.buffer = sound.noise;
  src.loop = true;
  src.start();
  return src;
}

function initSound() {
  if (sound.ctx) {
    if (sound.ctx.state === "suspended") sound.ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const ac = new AC();
  sound.ctx = ac;
  sound.master = ac.createGain();
  sound.master.gain.value = sound.muted ? 0 : SOUND_VOLUME;
  sound.master.connect(ac.destination);

  const len = ac.sampleRate * 2;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  sound.noise = buf;

  // Sea: low rolling noise that swells and ebbs like waves
  const seaLp = ac.createBiquadFilter();
  seaLp.type = "lowpass";
  seaLp.frequency.value = 380;
  const sea = ac.createGain();
  sea.gain.value = 0.06;
  const seaLfo = ac.createOscillator();
  seaLfo.frequency.value = 0.12;
  const seaDepth = ac.createGain();
  seaDepth.gain.value = 0.035;
  seaLfo.connect(seaDepth);
  seaDepth.connect(sea.gain);
  seaLfo.start();
  noiseLoop().connect(seaLp);
  seaLp.connect(sea);
  sea.connect(sound.master);

  // Rain: soft hiss, louder at night
  const rainHp = ac.createBiquadFilter();
  rainHp.type = "highpass";
  rainHp.frequency.value = 1500;
  const rainLp = ac.createBiquadFilter();
  rainLp.type = "lowpass";
  rainLp.frequency.value = 7000;
  sound.rain = ac.createGain();
  sound.rain.gain.value = 0;
  noiseLoop().connect(rainHp);
  rainHp.connect(rainLp);
  rainLp.connect(sound.rain);
  sound.rain.connect(sound.master);

  // Engine: a muffled diesel chug
  const eng = ac.createOscillator();
  eng.type = "sawtooth";
  eng.frequency.value = 46;
  const engLp = ac.createBiquadFilter();
  engLp.type = "lowpass";
  engLp.frequency.value = 170;
  const am = ac.createGain();
  am.gain.value = 0.7;
  const chug = ac.createOscillator();
  chug.frequency.value = 6;
  const chugDepth = ac.createGain();
  chugDepth.gain.value = 0.3;
  chug.connect(chugDepth);
  chugDepth.connect(am.gain);
  chug.start();
  sound.engine = ac.createGain();
  sound.engine.gain.value = 0;
  eng.connect(engLp);
  engLp.connect(am);
  am.connect(sound.engine);
  sound.engine.connect(sound.master);
  eng.start();
  sound.engineOsc = eng;
  sound.chug = chug;
  syncSoundHint();
}

function setSmooth(param, value, tc) {
  if (param._target === value) return;
  param._target = value;
  param.setTargetAtTime(value, sound.ctx.currentTime, tc);
}

function updateSound() {
  if (!sound.ctx) return;
  const night = getDaylightFactor() < 0.35;
  const sailing = !dockActive && !fishingMode && !detektorMode && !dialogueActive && !gameOver &&
    !!(keys["a"] || keys["arrowleft"] || keys["d"] || keys["arrowright"]);
  setSmooth(sound.rain.gain, gameOver ? 0 : night ? 0.045 : 0.016, 0.8);
  setSmooth(sound.engine.gain, gameOver ? 0 : sailing ? 0.07 : 0.018, 0.25);
  setSmooth(sound.engineOsc.frequency, 40 + upgrades.engine * 5 + (sailing ? 12 : 0), 0.4);
  setSmooth(sound.chug.frequency, sailing ? 9 + upgrades.engine : 5, 0.4);
}

function syncSoundHint() {
  const el = document.getElementById("sound-state");
  if (el) el.textContent = sound.muted ? "zvuk vyp." : "zvuk";
}

function toggleSound() {
  initSound();
  sound.muted = !sound.muted;
  try {
    localStorage.setItem("deep-awakes-muted", sound.muted ? "1" : "0");
  } catch (e) {
    // storage unavailable — the toggle still works for this session
  }
  if (sound.master) sound.master.gain.setTargetAtTime(sound.muted ? 0 : SOUND_VOLUME, sound.ctx.currentTime, 0.05);
  syncSoundHint();
}

function sfxTone(freq, opts = {}) {
  if (!sound.ctx || sound.muted) return;
  const ac = sound.ctx;
  const t0 = ac.currentTime + (opts.delay || 0);
  const dur = opts.dur || 0.2;
  const osc = ac.createOscillator();
  osc.type = opts.type || "sine";
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain || 0.1, t0 + (opts.attack || 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(sound.master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function sfxNoise(opts) {
  if (!sound.ctx || sound.muted) return;
  const ac = sound.ctx;
  const t0 = ac.currentTime + (opts.delay || 0);
  const dur = opts.dur || 0.3;
  const src = ac.createBufferSource();
  src.buffer = sound.noise;
  src.loop = true;
  const f = ac.createBiquadFilter();
  f.type = opts.filter || "lowpass";
  f.frequency.setValueAtTime(opts.freq || 800, t0);
  if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);
  f.Q.value = opts.q || 0.7;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain || 0.1, t0 + (opts.attack || 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f);
  f.connect(g);
  g.connect(sound.master);
  src.start(t0, Math.random() * 1.5);
  src.stop(t0 + dur + 0.05);
}

function playThunder(delay) {
  sfxNoise({ filter: "lowpass", freq: 900, to: 90, dur: 3.8, gain: 0.45, attack: 0.04, delay });
  sfxNoise({ filter: "lowpass", freq: 140, dur: 4.5, gain: 0.3, attack: 0.3, delay: delay + 0.1 });
}
function playSplash() { sfxNoise({ filter: "bandpass", freq: 1100, to: 300, q: 0.8, dur: 0.45, gain: 0.15 }); }
function playCast() {
  sfxNoise({ filter: "bandpass", freq: 2600, to: 700, q: 1.2, dur: 0.32, gain: 0.06 });
  sfxNoise({ filter: "bandpass", freq: 1000, to: 280, q: 0.8, dur: 0.45, gain: 0.13, delay: 0.8 });
}
function playHit() {
  sfxTone(520, { to: 780, dur: 0.12, type: "triangle", gain: 0.08 });
  sfxTone(1560, { dur: 0.06, gain: 0.025 });
}
function playMiss() {
  sfxTone(150, { to: 70, dur: 0.22, gain: 0.12 });
  sfxNoise({ filter: "lowpass", freq: 400, dur: 0.12, gain: 0.05 });
}
function playSnap() {
  sfxNoise({ filter: "highpass", freq: 2500, dur: 0.08, gain: 0.18 });
  sfxTone(900, { to: 160, dur: 0.32, type: "triangle", gain: 0.06 });
  sfxNoise({ filter: "bandpass", freq: 900, to: 250, q: 0.8, dur: 0.5, gain: 0.1, delay: 0.15 });
}
function playCatch() {
  sfxTone(660, { dur: 0.2, gain: 0.07 });
  sfxTone(990, { dur: 0.35, gain: 0.07, delay: 0.12 });
  playSplash();
}
function playCoins() { [1320, 1760, 2093].forEach((f, i) => sfxTone(f, { dur: 0.18, gain: 0.045, delay: i * 0.07 })); }
function playClick() { sfxTone(1400, { dur: 0.04, type: "square", gain: 0.02 }); }
function playPing() { sfxTone(1180, { dur: 0.3, gain: 0.045 }); }


function drawSeaweed(wx, baseY) {
  const sx = wx - camera.x;
  if (sx < -40 || sx > canvas.width + 40) return;
  const t = performance.now() * 0.0016;
  const tall = hash(wx * 0.37) > 0.55;           // some stands grow into kelp
  const fronds = tall ? 4 : 3;
  ctx.lineCap = "round";
  for (let f = 0; f < fronds; f++) {
    const segs = tall ? 11 : 6;
    let px = sx + (f - fronds / 2) * 7;
    let py = baseY;
    const lean = (hash(wx + f * 5) - 0.5) * 14;
    const pts = [[px, py]];
    for (let g = 1; g <= segs; g++) {
      const u = g / segs;
      px += Math.sin(u * 3 + f + t + wx * 0.01) * (5 + u * 6) * 0.6 + lean / segs;
      py -= (tall ? 17 : 14) + hash(wx + f * 10 + g) * 6;
      pts.push([px, py]);
    }
    // Stem, darker at the root and greener toward the tip
    const stemG = ctx.createLinearGradient(0, baseY, 0, py);
    stemG.addColorStop(0, "rgba(10,28,18,0.95)");
    stemG.addColorStop(1, "rgba(34,76,44,0.9)");
    ctx.strokeStyle = stemG;
    ctx.lineWidth = tall ? 3.2 : 2.4;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    // Leaf blades hanging off the stem
    if (tall) {
      ctx.fillStyle = "rgba(30,70,40,0.75)";
      for (let g = 2; g < pts.length; g += 2) {
        const [x, y] = pts[g];
        const side = g % 4 === 0 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + side * 10, y - 4 + Math.sin(t * 1.3 + g) * 2, x + side * 15, y + 6);
        ctx.quadraticCurveTo(x + side * 6, y + 1, x, y);
        ctx.fill();
      }
    }
  }
}

// =====================================================================
// WILDLIFE — fish, jellyfish and watchers behave like living things:
// they pick goals, pause, school together, shy away from the engine,
// get curious about the headlight and the bait.
// =====================================================================

function wlRand(a, b) {
  return a + Math.random() * (b - a);
}

function wlClamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function newBgFish(o) {
  const base = o.shoal ? o.shoal.wx + o.offX : o.wx;
  const depth = o.shoal ? o.shoal.depth + o.offD : o.depth;
  return {
    wx: base,
    depth,
    vx: 0,
    vd: 0,                              // depth units per second
    face: Math.random() < 0.5 ? -1 : 1, // eased −1…1, so turning looks like a flip
    size: o.size,
    body: o.body,
    hue: o.hue,
    shoal: o.shoal || null,
    offX: o.offX || 0,
    offD: o.offD || 0,
    tailPhase: Math.random() * Math.PI * 2,
    state: "idle",
    stateT: wlRand(0.2, 3),
    tx: base,
    td: depth,
    cruise: wlRand(22, 52) * (o.size > 10 ? 0.8 : 1),
    burst: 0,                           // seconds of startle left
    fleeDir: 1,
    curious: Math.random() < 0.4,
    lit: 0,
    pitch: 0
  };
}

function seedWildlife() {
  fish.length = 0;
  shoals.length = 0;
  jellies.length = 0;
  watchers.length = 0;
  lastWildlifePX = null;
  boatVx = 0;
  wildFishing = false;

  const half = worldWidth / 2 - 300;

  // Small fish keep together in shoals that wander the open water as one
  for (let s = 0; s < Math.round(worldWidth / 2400); s++) {
    const sh = {
      wx: wlRand(-half, half),
      depth: wlRand(80, 300),
      vx: 0,
      vd: 0,
      tx: 0,
      td: 0,
      speed: wlRand(26, 46),
      wait: 0,
      panic: 0,
      size: wlRand(5, 8),
      hue: Math.random()
    };
    sh.tx = sh.wx;
    sh.td = sh.depth;
    shoals.push(sh);
    const n = 5 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      fish.push(newBgFish({
        shoal: sh,
        size: sh.size * wlRand(0.85, 1.15),
        body: "slim",
        offX: wlRand(-60, 60),
        offD: wlRand(-22, 22),
        hue: wlClamp(sh.hue + wlRand(-0.06, 0.06), 0, 1)
      }));
    }
  }

  // Bigger loners go their own way
  const bodies = ["round", "slim", "flat", "round"];
  for (let i = 0; i < Math.round(worldWidth / 1200); i++) {
    fish.push(newBgFish({
      wx: wlRand(-half, half),
      depth: wlRand(70, 360),
      size: wlRand(8, 16),
      body: bodies[i % bodies.length],
      hue: Math.random()
    }));
  }

  // Jellyfish drift on the current and propel themselves with pulses
  [[800, 0.45], [-400, 0.55], [2200, 0.38], [-1800, 0.62], [3500, 0.48], [-2800, 0.42]].forEach(([wx, depth], i) => {
    jellies.push({
      wx, depth, vx: 0, vy: 0,
      phase: Math.random(),
      period: wlRand(2.4, 3.4),
      size: wlRand(0.9, 1.25),
      seed: i,
      contract: 0
    });
  });

  // ...and more of them scattered over the open sea
  for (let i = 0; i < 12; i++) {
    jellies.push({
      wx: wlRand(-half, half), depth: wlRand(0.35, 0.72), vx: 0, vy: 0,
      phase: Math.random(),
      period: wlRand(2.4, 3.4),
      size: wlRand(0.8, 1.3),
      seed: 10 + i,
      contract: 0
    });
  }

  // Watchers in the dark: they stalk the boat, blink at odd moments and avoid the light
  for (let i = 0; i < 3; i++) {
    watchers.push({
      wx: 0, depth: wlRand(0.4, 0.8), alpha: 0, placed: false,
      side: i % 2 ? 1 : -1, dist: wlRand(450, 720),
      blinkIn: wlRand(1.5, 5), blinkT: 0, blink: 0,
      gaze: 0, fear: 0
    });
  }
}

function pickLonerTarget(f, ctxInfo) {
  const half = worldWidth / 2 - 200;
  const { night, beamOn, beamHalf, pxPer } = ctxInfo;
  // Curious fish are drawn to the headlight at night, and to the bait while you fish
  if (f.curious && fishingMode && Math.abs(f.wx - player.x) < 700) {
    f.tx = player.x + (Math.random() < 0.5 ? -1 : 1) * wlRand(60, 160);
    f.td = wlRand(58, 84);
    return;
  }
  if (f.curious && night && beamOn && Math.abs(f.wx - player.x) < 500) {
    f.tx = player.x + wlRand(-beamHalf * 0.4, beamHalf * 0.4);
    f.td = wlRand(90, 190);
    return;
  }
  f.tx = wlClamp(f.wx + wlRand(-420, 420), -half, half);
  f.td = wlClamp(f.depth + wlRand(-60, 60), 62, 370);
}

function updateWildlife(dt) {
  if (!(dt > 0)) return;
  const surfaceY = getSurfaceY();
  const pxPer = Math.max(0.3, (canvas.height - surfaceY - 28) * 0.92 / 400);
  const now = performance.now() / 1000;
  const half = worldWidth / 2 - 200;

  // How fast the boat is moving: the engine noise is what spooks fish
  if (lastWildlifePX === null) lastWildlifePX = player.x;
  let bvx = (player.x - lastWildlifePX) / dt;
  lastWildlifePX = player.x;
  if (Math.abs(bvx) > 900) bvx = 0; // teleport (restart)
  boatVx += (bvx - boatVx) * Math.min(1, dt * 6);
  const boatMoving = Math.abs(boatVx) > 60;

  const night = getDaylightFactor() < 0.4;
  const beamOn = headlight.on && headlight.strength > 0.05;
  const beamHalf = headlight.halfW;
  const beamH = Math.max(1, headlight.reachPx);
  const info = { night, beamOn, beamHalf, pxPer };

  // Starting a catch: curious fish nearby come to inspect the bait
  if (fishingMode && !wildFishing) {
    wildFishing = true;
    fish.forEach((f) => {
      if (!f.shoal && f.curious && Math.abs(f.wx - player.x) < 700) {
        pickLonerTarget(f, info);
        f.state = "cruise";
        f.stateT = 12;
      }
    });
  } else if (!fishingMode) {
    wildFishing = false;
  }

  // ---- shoals: one shared goal, scatter when the engine roars past ----
  shoals.forEach((sh) => {
    const dxB = sh.wx - player.x;
    if (boatMoving && Math.abs(dxB) < 260 && sh.depth < 230 && sh.panic <= 0) {
      sh.panic = wlRand(1.1, 1.8);
      const away = Math.sign(dxB) || (Math.random() < 0.5 ? -1 : 1);
      sh.tx = wlClamp(sh.wx + away * wlRand(320, 520), -half, half);
      sh.td = wlClamp(sh.depth + wlRand(30, 80), 80, 340);
    }
    if (sh.panic > 0) {
      sh.panic -= dt;
    } else if (sh.wait > 0) {
      sh.wait -= dt;
    } else if (Math.hypot(sh.tx - sh.wx, (sh.td - sh.depth) * pxPer) < 30) {
      sh.wait = Math.random() < 0.5 ? wlRand(1.5, 4.5) : 0;
      sh.tx = wlClamp(sh.wx + wlRand(-500, 500), -half, half);
      sh.td = wlClamp(sh.depth + wlRand(-70, 70), 80, 330);
    }
    const sp = sh.panic > 0 ? sh.speed * 3.2 : sh.wait > 0 ? 3 : sh.speed;
    const ddx = sh.tx - sh.wx;
    const ddd = (sh.td - sh.depth) * pxPer;
    const dist = Math.hypot(ddx, ddd) || 1;
    const k = Math.min(1, dt * (sh.panic > 0 ? 5 : 1.2));
    sh.vx += (ddx / dist * sp - sh.vx) * k;
    sh.vd += (ddd / dist * sp / pxPer - sh.vd) * k;
    sh.wx = wlClamp(sh.wx + sh.vx * dt, -half, half);
    sh.depth = wlClamp(sh.depth + sh.vd * dt, 70, 350);
  });

  // ---- individual fish ----
  fish.forEach((f) => {
    let wantVx = 0, wantVd = 0;

    if (f.shoal) {
      const sh = f.shoal;
      const t = now * 0.6 + f.tailPhase;
      const tx = sh.wx + f.offX + Math.sin(t) * 10;
      const td = sh.depth + f.offD + Math.cos(t * 0.8) * 5;
      const cap = sh.speed * 3.4 + 40;
      wantVx = wlClamp(sh.vx + (tx - f.wx) * 1.4, -cap, cap);
      wantVd = wlClamp(sh.vd + (td - f.depth) * 1.4, -cap / pxPer, cap / pxPer);
    } else {
      f.stateT -= dt;
      if (f.state === "cruise") {
        const dx = f.tx - f.wx;
        const dd = (f.td - f.depth) * pxPer;
        const dist = Math.hypot(dx, dd);
        if (dist < 18 || f.stateT < 0) {
          f.state = "idle";
          f.stateT = wlRand(1, 4);       // stop and hover a while
        } else {
          wantVx = dx / dist * f.cruise;
          wantVd = dd / dist * f.cruise / pxPer;
        }
      } else {
        // idle: hang in the water with a lazy wobble
        wantVx = Math.sin(now * 0.7 + f.tailPhase) * 3;
        wantVd = Math.cos(now * 0.5 + f.tailPhase) * 1.5;
        if (f.stateT < 0) {
          pickLonerTarget(f, info);
          f.state = "cruise";
          f.stateT = wlRand(6, 12);
        }
      }
    }

    // Startle: the engine passes close above a shallow fish
    if (boatMoving && f.burst <= 0 && f.depth < 190 && Math.abs(f.wx - player.x) < 220) {
      f.burst = wlRand(0.7, 1.2);
      f.fleeDir = Math.sign(f.wx - player.x) || (Math.random() < 0.5 ? -1 : 1);
    }
    if (f.burst > 0) {
      f.burst -= dt;
      wantVx = f.fleeDir * f.cruise * 3.6;
      wantVd = 45;
    }

    const k = Math.min(1, dt * (f.burst > 0 ? 7 : 1.8));
    f.vx += (wantVx - f.vx) * k;
    f.vd += (wantVd - f.vd) * k;
    f.wx = wlClamp(f.wx + f.vx * dt, -half, half);
    f.depth = wlClamp(f.depth + f.vd * dt, 58, 385);

    // Facing eases over, so a turn squashes the fish through its flip
    if (Math.abs(f.vx) > 5) f.face += (Math.sign(f.vx) - f.face) * Math.min(1, dt * 5);
    const speed = Math.hypot(f.vx, f.vd * pxPer);
    f.tailPhase += dt * (3 + speed * 0.12);
    f.pitch += (Math.atan2(f.vd * pxPer, Math.abs(f.vx) + 12) - f.pitch) * Math.min(1, dt * 4);

    // Fish in the headlight beam are lit up
    let inBeam = 0;
    if (beamOn) {
      const dyPx = f.depth * pxPer;
      const halfAt = 14 + (beamHalf - 14) * Math.min(1, dyPx / beamH);
      if (dyPx < beamH && Math.abs(f.wx - player.x) < halfAt * 0.9) inBeam = 1;
      // ...or by the bow lamp's wedge of light ahead of the boat
      const sgn = boatFacing >= 0 ? 1 : -1;
      const dxF = (f.wx - player.x - BOAT_LAMP_X * boatFacing) * sgn;
      if (dxF > 0 && dxF < headlight.bowLen * Math.abs(boatFacing) && dyPx < 20 + dxF * 0.17) inBeam = 1;
    }
    f.lit += (inBeam - f.lit) * Math.min(1, dt * 4);
  });

  // ---- jellyfish: contract → thrust up → glide and slowly sink ----
  jellies.forEach((j) => {
    j.phase += dt / j.period;
    const ph = j.phase % 1;
    j.contract = ph < 0.3 ? Math.sin(ph / 0.3 * Math.PI) : 0;
    const targetVy = j.contract > 0.02 ? -0.04 : 0.012;
    j.vy += (targetVy - j.vy) * Math.min(1, dt * 3);
    j.depth += j.vy * dt;
    if (j.depth < 0.3) j.vy += dt * 0.05;
    if (j.depth > 0.78) j.vy -= dt * 0.05;
    j.depth = wlClamp(j.depth, 0.26, 0.82);
    const current = Math.sin(now * 0.05 + j.seed * 2.1) * 14;
    j.vx += (current - j.vx) * Math.min(1, dt * 0.4);
    j.wx += j.vx * dt;
  });

  updateWatchers(dt, beamOn, beamHalf, boatMoving);
}

function updateWatchers(dt, beamOn, beamHalf, boatMoving) {
  const want = danger >= 9 ? 3 : danger >= 6 ? 2 : danger >= 3 ? 1 : 0;
  watchers.forEach((w, i) => {
    const active = i < want;

    if (!w.placed && active) {
      w.placed = true;
      w.wx = player.x + w.side * w.dist;
    }

    // They trail the boat with a lag, drifting rather than following rigidly
    if (w.placed) {
      const desired = player.x + w.side * w.dist + Math.sin(performance.now() * 0.0003 + i * 2) * 40;
      w.wx += (desired - w.wx) * Math.min(1, dt * 0.35);
    }

    // Light and nearness frighten them: they fade, and come back from a new side
    const dx = Math.abs(w.wx - player.x);
    const inLight = beamOn && dx < Math.max(40, beamHalf * 0.55);
    if (inLight || dx < 220) w.fear = Math.min(1.2, w.fear + dt * 1.6);
    else w.fear = Math.max(0, w.fear - dt * 0.5);

    const target = active ? Math.max(0, 1 - w.fear) : 0;
    w.alpha += (target - w.alpha) * Math.min(1, dt * 2.5);

    if (active && w.fear > 1 && w.alpha < 0.05) {
      w.side = Math.random() < 0.5 ? -1 : 1;
      w.dist = wlRand(450, 720);
      w.depth = wlRand(0.4, 0.8);
      w.wx = player.x + w.side * w.dist;
      w.fear = 0;
    }

    // Blink at irregular moments, sometimes twice in a row
    w.blinkIn -= dt;
    if (w.blinkIn <= 0 && w.blinkT <= 0) {
      w.blinkT = 0.18;
      w.blinkIn = Math.random() < 0.2 ? 0.25 : wlRand(1.8, 6);
    }
    if (w.blinkT > 0) {
      w.blinkT -= dt;
      w.blink = Math.sin(Math.max(0, w.blinkT) / 0.18 * Math.PI);
    } else {
      w.blink = 0;
    }

    // Pupils track the boat
    const g = wlClamp((player.x - w.wx) / 400, -1, 1);
    w.gaze += (g - w.gaze) * Math.min(1, dt * 3);
  });
}

function drawFishEntity(f, surfaceY) {
  const sx = f.wx - camera.x;
  if (sx < -70 || sx > canvas.width + 70) return;

  const pxPer = (canvas.height - surfaceY - 28) * 0.92 / 400;
  const fy = surfaceY + f.depth * pxPer;
  if (fy > canvas.height - 10) return;

  const r = f.size;
  const speed = Math.hypot(f.vx, f.vd * pxPer);
  const amp = Math.min(1, 0.25 + speed / 70);
  const tail = Math.sin(f.tailPhase) * amp;
  const daylight = getDaylightFactor();
  const litAmt = f.lit * (1 - daylight * 0.6);

  let rx, ry;
  if (f.body === "round") { rx = r * 1.05; ry = r * 0.72; }
  else if (f.body === "flat") { rx = r * 1.25; ry = r * 0.5; }
  else { rx = r * 1.35; ry = r * 0.42; }

  const hue = 140 + f.hue * 30;
  const light = 20 + f.hue * 14 + litAmt * 20;
  const sat = 28 + litAmt * 14;

  ctx.save();
  ctx.translate(sx, fy);
  const sc = Math.abs(f.face) < 0.07 ? 0.07 * (f.face < 0 ? -1 : 1) : f.face;
  ctx.scale(sc, 1);
  ctx.rotate(f.pitch);
  ctx.globalAlpha = 1 - Math.min(1, f.depth / 400) * 0.4;

  // Tail, beating with the swim cycle
  ctx.fillStyle = `hsl(${hue}, ${sat}%, ${light * 0.75}%)`;
  ctx.beginPath();
  ctx.moveTo(-rx * 0.8, 0);
  ctx.lineTo(-rx * 1.85, -r * 0.55 + tail * r * 0.7);
  ctx.quadraticCurveTo(-rx * 1.55, tail * r * 0.45, -rx * 1.85, r * 0.55 + tail * r * 0.7);
  ctx.closePath();
  ctx.fill();

  // Dorsal fin
  ctx.beginPath();
  ctx.moveTo(-rx * 0.25, -ry * 0.85);
  ctx.lineTo(rx * 0.05 - tail * r * 0.1, -ry * 1.9);
  ctx.lineTo(rx * 0.45, -ry * 0.8);
  ctx.closePath();
  ctx.fill();

  // Body with a lighter belly
  ctx.save();
  ctx.rotate(tail * 0.05);
  ctx.fillStyle = `hsl(${hue}, ${sat}%, ${light}%)`;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `hsla(${hue}, ${sat - 8}%, ${light + 14}%, 0.5)`;
  ctx.beginPath();
  ctx.ellipse(0, ry * 0.3, rx * 0.88, ry * 0.55, 0, 0, Math.PI);
  ctx.fill();
  ctx.restore();

  // Gill line and eye
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(rx * 0.35, 0, ry * 0.8, -1.1, 1.1);
  ctx.stroke();
  ctx.fillStyle = `rgba(210,228,210,${0.45 + litAmt * 0.5})`;
  ctx.beginPath();
  ctx.arc(rx * 0.62, -ry * 0.15, Math.max(1, r * 0.13), 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawJellyfish(surfaceY) {
  const t = performance.now() * 0.001;
  jellies.forEach((j, i) => {
    const sx = j.wx - camera.x;
    if (sx < -70 || sx > canvas.width + 70) return;
    const fy = surfaceY + (canvas.height - surfaceY) * j.depth;
    addGlow(sx, fy, 60 * j.size, 0.35 + 0.3 * j.contract, "210,110,200");

    // The bell squeezes inward and lengthens when it pulses
    const c = j.contract;
    const jr = 18 * j.size;
    const rx = jr * (1 - 0.24 * c);
    const ry = jr * 0.6 * (1 + 0.3 * c);
    // Trailing parts lag behind the motion
    const lagX = wlClamp(-j.vx * 0.5, -10, 10);
    const lagY = wlClamp(j.vy * 400, -12, 12);

    ctx.save();
    ctx.translate(sx, fy);

    const jg = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    jg.addColorStop(0, `rgba(200,120,180,${0.45 + c * 0.12})`);
    jg.addColorStop(0.7, "rgba(160,80,140,0.25)");
    jg.addColorStop(1, "rgba(100,40,100,0)");
    ctx.fillStyle = jg;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, Math.PI, 0);
    ctx.fill();

    // Bioluminescent core flares as it pushes
    ctx.fillStyle = `rgba(220,160,220,${0.12 + c * 0.2})`;
    ctx.beginPath();
    ctx.arc(0, -2, rx * 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Tentacles trail and ripple
    ctx.strokeStyle = "rgba(200,100,180,0.2)";
    ctx.lineWidth = 1;
    for (let k = -2; k <= 2; k++) {
      const len = 30 + Math.abs(k) * -3 + lagY;
      ctx.beginPath();
      ctx.moveTo(k * 5 * (1 - 0.2 * c), 0);
      ctx.quadraticCurveTo(
        k * 5 + lagX * 0.5 + Math.sin(t * 1.3 + k + i) * 6,
        len * 0.55,
        k * 4 + lagX + Math.sin(t * 1.6 + k * 1.3 + i) * 9,
        len
      );
      ctx.stroke();
    }
    ctx.restore();
  });
}

function drawDeepEyes(surfaceY) {
  const t = performance.now() * 0.001;
  ctx.save();
  watchers.forEach((w) => {
    if (w.alpha < 0.02) return;
    const sx = w.wx - camera.x;
    if (sx < -40 || sx > canvas.width + 40) return;
    const ey = surfaceY + (canvas.height - surfaceY) * w.depth + Math.sin(t * 0.4 + w.dist) * 4;

    // Each eye is slit-pupilled and closes with the blink
    const open = Math.max(0.08, 1 - w.blink);
    [-8, 8].forEach((ox) => {
      const ex = sx + ox;
      const glow = ctx.createRadialGradient(ex, ey, 0, ex, ey, 16);
      glow.addColorStop(0, `rgba(255,40,60,${0.35 * w.alpha})`);
      glow.addColorStop(1, "rgba(255,40,60,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(ex - 16, ey - 16, 32, 32);

      ctx.fillStyle = `rgba(255,50,70,${0.9 * w.alpha})`;
      ctx.beginPath();
      ctx.ellipse(ex, ey, 4.6, 3 * open, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(20,0,6,${0.95 * w.alpha})`;
      ctx.beginPath();
      ctx.ellipse(ex + w.gaze * 1.8, ey, 1.1, 2.7 * open, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  });
  ctx.restore();
}

function boatBob() {
  return Math.sin(performance.now() * 0.0018) * 2;
}

function drawBoatWake(screenX, surfaceY, bob) {
  const t = performance.now() * 0.003;
  const y = surfaceY + bob + 2;

  // Foam wake behind boat
  ctx.save();
  ctx.globalAlpha = 0.3;
  for (let side = -1; side <= 1; side += 2) {
    ctx.beginPath();
    ctx.moveTo(screenX + side * 45, y + 20);
    for (let i = 1; i <= 6; i++) {
      const dx = side * (50 + i * 22);
      const dy = 18 + i * 3 + Math.sin(t + i * 0.8) * 2;
      ctx.lineTo(screenX + dx, y + dy);
    }
    ctx.strokeStyle = "rgba(200,220,240,0.3)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();

  // Waterline foam
  ctx.strokeStyle = "rgba(220,235,245,0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(screenX - 92, y + 25);
  ctx.quadraticCurveTo(screenX, y + 30, screenX + 92, y + 25);
  ctx.stroke();
}

// =====================================================================
// BOAT FISHING RODS — stowed upright, flung out over the water when a catch starts
// =====================================================================

const boatRods = [
  // dir: +1 points toward the bow, -1 toward the stern. Angles in rad above horizontal.
  { bx: 66,  by: -22, dir: 1,  idle: 1.3,  out: 0.5,  len: 62, side: 12,  delay: 0,    phase: 0.0, p: 0, wait: 0, landed: false, landedAt: 0 },
  { bx: -82, by: -10, dir: -1, idle: 1.22, out: 0.42, len: 60, side: -12, delay: 0.18, phase: 2.1, p: 0, wait: 0, landed: false, landedAt: 0 }
];

const ROD_CAST_SECONDS = 0.85;
const ROD_STOW_SECONDS = 0.55;

function easeOutBack(x) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function updateBoatRods(dt) {
  const out = fishingMode;
  const now = performance.now();
  boatRods.forEach((r) => {
    if (out) {
      r.wait += dt;
      if (r.wait >= r.delay) r.p = Math.min(1, r.p + dt / ROD_CAST_SECONDS);
    } else {
      r.wait = 0;
      r.p = Math.max(0, r.p - dt / ROD_STOW_SECONDS);
    }
    if (r.p >= 1 && !r.landed) {
      r.landed = true;
      r.landedAt = now;
    }
    if (r.p < 0.6) r.landed = false;
  });
}

function drawBoatRod(r, waterY, t) {
  const swing = Math.min(1, r.p / 0.55);
  const lineDrop = Math.max(0, Math.min(1, (r.p - 0.3) / 0.7));
  const landed = r.p >= 1;
  const d = fishingParams ? fishingParams.difficulty : 1;
  const esc = fishingEscapeProgress();
  const snapped = esc > 0.03;

  // Fight: the harder the fish, the more the rod bends; a miss makes it jerk, a hit takes slack
  let tension = 0;
  if (landed && fishingMode && esc === 0) {
    tension = 0.3 + catchProgress * 0.25 + d * 0.06
      + Math.sin(t * (5 + d) + r.phase) * 0.12
      + fishingMissPulse * 0.55 - fishingHitPulse * 0.2;
    tension = Math.max(0, tension);
  }

  const a = r.idle + (r.out - r.idle) * easeOutBack(swing);
  const whip = Math.sin(swing * Math.PI) * 7;      // rod flexes as it is thrown
  // After the snap the rod springs back and shivers as it settles
  const bend = whip + (esc > 0 ? 3 + 11 * Math.exp(-esc * 4.5) * Math.cos(esc * 26) : landed ? 3 + tension * 15 : 0);
  const dx = r.dir * Math.cos(a);
  const dy = -Math.sin(a);

  const tipX = r.bx + dx * r.len;
  const tipY = r.by + dy * r.len + bend * 0.7;
  const ctlX = r.bx + dx * r.len * 0.55;
  const ctlY = r.by + dy * r.len * 0.55 + bend * 0.1;

  // Holder bracket on the rail
  ctx.fillStyle = "#1a120e";
  ctx.fillRect(r.bx - 3, r.by - 1, 6, 8);

  // Rod: tapered blank sampled along the curve
  const N = 14;
  let px = r.bx, py = r.by;
  for (let i = 1; i <= N; i++) {
    const u = i / N;
    const x = (1 - u) * (1 - u) * r.bx + 2 * (1 - u) * u * ctlX + u * u * tipX;
    const y = (1 - u) * (1 - u) * r.by + 2 * (1 - u) * u * ctlY + u * u * tipY;
    ctx.strokeStyle = u < 0.18 ? "#17100c" : "#4a3626";
    ctx.lineWidth = 3.2 - 2.1 * u;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(x, y);
    ctx.stroke();
    px = x;
    py = y;
  }
  // Reel
  ctx.fillStyle = "#a88848";
  ctx.beginPath();
  ctx.arc(r.bx + dx * 9, r.by + dy * 9 + 3, 2.6, 0, Math.PI * 2);
  ctx.fill();

  if (lineDrop <= 0) return;

  // Line + float: drops from the tip, lands on the water, bobs when the fish pulls
  const baseX = tipX + r.side;
  const endX = tipX + (baseX - tipX) * lineDrop;
  const dip = landed ? tension * 3 * (0.6 + 0.4 * Math.sin(t * 6 + r.phase)) + fishingMissPulse * 3 : 0;
  const endY = tipY + (waterY - tipY) * lineDrop + dip;
  const sag = (1 - Math.min(1, tension * 1.6)) * 7 * (landed ? 1 : lineDrop);

  if (!snapped) {
    ctx.strokeStyle = "rgba(235,230,215,0.6)";
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.quadraticCurveTo((tipX + endX) / 2 - r.dir * sag, (tipY + endY) / 2, endX, endY);
    ctx.stroke();
  }

  // Under the surface: faint line down to a lure
  if (landed && !snapped) {
    const lureY = waterY + 42 + Math.sin(t * 1.4 + r.phase) * 3;
    ctx.strokeStyle = "rgba(235,230,215,0.2)";
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.quadraticCurveTo(endX + Math.sin(t * 0.9 + r.phase) * 5, (endY + lureY) / 2, endX + Math.sin(t * 0.9 + r.phase) * 3, lureY);
    ctx.stroke();
    ctx.fillStyle = "rgba(210,215,220,0.6)";
    ctx.beginPath();
    ctx.arc(endX + Math.sin(t * 0.9 + r.phase) * 3, lureY, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Splash and ripples once the float hits the water
  if (landed) {
    const since = (performance.now() - r.landedAt) / 1000;
    for (let k = 0; k < 3; k++) {
      const age = since - k * 0.28;
      if (age <= 0 || age > 1.3) continue;
      const u = age / 1.3;
      ctx.strokeStyle = `rgba(210,230,240,${(1 - u) * 0.45})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(endX, waterY + 1, 5 + u * 26, 1.5 + u * 5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (since < 0.4) {
      for (let k = 0; k < 7; k++) {
        const ang = -Math.PI * (0.15 + 0.7 * (k / 6));
        const sp = 18 + (k % 3) * 6;
        const sx = endX + Math.cos(ang) * sp * since;
        const sy = waterY + Math.sin(ang) * sp * since * 1.6 + 70 * since * since;
        ctx.fillStyle = `rgba(220,238,245,${0.8 * (1 - since / 0.4)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Snapped: only a loose strand flutters from the tip, the float is gone
  if (snapped) {
    const k = Math.min(1, (esc - 0.03) / 0.97);
    const len = 24 * (1 - 0.4 * k);
    ctx.strokeStyle = `rgba(235,230,215,${0.6 * (1 - k * 0.7)})`;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.quadraticCurveTo(
      tipX + Math.sin(esc * 40 + r.phase) * 8 * (1 - k) + r.side * 0.3, tipY + len * 0.5,
      tipX + Math.sin(esc * 34 + 1 + r.phase) * 10 * (1 - k) + r.side * 0.2, tipY + len
    );
    ctx.stroke();
    return;
  }

  // Float
  ctx.fillStyle = "#e8e4dc";
  ctx.beginPath();
  ctx.arc(endX, endY - 1, 3.6, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = "#c2352c";
  ctx.beginPath();
  ctx.arc(endX, endY - 1, 3.6, 0, Math.PI);
  ctx.fill();
}

function drawBoatRods(bob) {
  const t = performance.now() / 1000;
  const waterY = 8 - bob; // keeps floats on the water while the hull bobs
  boatRods.forEach((r) => drawBoatRod(r, waterY, t));
}

function drawBoatSide(screenX, surfaceY, bob) {
  const y = surfaceY - 8 + bob;
  ctx.save();
  ctx.translate(screenX, y);
  // Face the direction of travel; easing through zero reads as the boat swinging round
  ctx.scale(Math.abs(boatFacing) < 0.06 ? (boatFacing < 0 ? 0.06 : -0.06) : -boatFacing, 1);  // sprite has the cabin on its left, which now leads

  // 1. Hull Base (layered red-brown, lit from above)
  const hullGrad = ctx.createLinearGradient(0, -4, 0, 26);
  hullGrad.addColorStop(0, "#a3362a");
  hullGrad.addColorStop(0.45, "#7a2020");
  hullGrad.addColorStop(1, "#3e0f10");
  ctx.fillStyle = hullGrad;
  ctx.beginPath();
  ctx.moveTo(-85, -4);
  ctx.lineTo(76, -4);
  ctx.quadraticCurveTo(86, -2, 94, 12); // bow curves up
  ctx.quadraticCurveTo(84, 22, 70, 24); // bottom curve right
  ctx.quadraticCurveTo(0, 28, -75, 24); // bottom curve center
  ctx.lineTo(-82, 10);
  ctx.lineTo(-85, -4);
  ctx.closePath();
  ctx.fill();

  // Weathering: rust runs below the deck and a dark wet band along the waterline
  ctx.fillStyle = "rgba(70,32,14,0.35)";
  for (let k = 0; k < 7; k++) {
    ctx.fillRect(-70 + k * 22 + hash(k * 7) * 8, -3, 2, 6 + hash(k * 13) * 9);
  }
  ctx.fillStyle = "rgba(12,16,18,0.4)";
  ctx.fillRect(-82, 5, 168, 4);

  // 2. White hull upper trim
  ctx.fillStyle = "#d8cfc0";
  ctx.beginPath();
  ctx.moveTo(-86, -10);
  ctx.lineTo(74, -10);
  ctx.quadraticCurveTo(84, -8, 90, -4);
  ctx.lineTo(76, -4);
  ctx.lineTo(-85, -4);
  ctx.closePath();
  ctx.fill();

  // 3. Dark bottom hull plate
  ctx.fillStyle = "#1e1512";
  ctx.beginPath();
  ctx.moveTo(-75, 14);
  ctx.quadraticCurveTo(0, 20, 74, 14);
  ctx.quadraticCurveTo(80, 18, 86, 22);
  ctx.quadraticCurveTo(0, 28, -75, 24);
  ctx.closePath();
  ctx.fill();

  // 4. Cabin at the stern (back, left side)
  ctx.fillStyle = "#2c2018";
  ctx.fillRect(-68, -44, 52, 34);

  // Cabin cream walls
  ctx.fillStyle = "#c8b898";
  ctx.fillRect(-64, -40, 44, 30);

  // Framed wheelhouse windows; the lamplight inside grows with the dark
  const night = 1 - getDaylightFactor();
  [[-60, -36], [-38, -36]].forEach(([wx, wy]) => {
    ctx.fillStyle = "#1a2830";
    ctx.fillRect(wx, wy, 16, 13);
    ctx.fillStyle = `rgba(255,200,120,${0.12 + night * 0.7})`;
    ctx.fillRect(wx, wy, 16, 13);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.moveTo(wx, wy);
    ctx.lineTo(wx + 7, wy);
    ctx.lineTo(wx, wy + 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#6a4a2c";
    ctx.lineWidth = 1.6;
    ctx.strokeRect(wx, wy, 16, 13);
    ctx.beginPath();
    ctx.moveTo(wx + 8, wy);
    ctx.lineTo(wx + 8, wy + 13);
    ctx.stroke();
  });
  // Cabin door and the plank seams of the walls
  ctx.fillStyle = "#4a3422";
  ctx.fillRect(-24, -32, 4, 22);
  ctx.strokeStyle = "rgba(60,44,28,0.35)";
  ctx.lineWidth = 1;
  for (let py = -33; py < -12; py += 7) {
    ctx.beginPath();
    ctx.moveTo(-64, py);
    ctx.lineTo(-25, py);
    ctx.stroke();
  }
  // Radar mast and antenna on the cabin roof
  ctx.strokeStyle = "#2a2018";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-40, -48);
  ctx.lineTo(-40, -70);
  ctx.moveTo(-47, -62);
  ctx.lineTo(-33, -62);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,70,50,0.8)";
  ctx.beginPath();
  ctx.arc(-40, -71, 1.6, 0, Math.PI * 2);
  ctx.fill();

  // Cabin roof (overhanging)
  ctx.fillStyle = "#1e1612";
  ctx.fillRect(-72, -48, 60, 6);

  // 5. Open deck railing at the front (right side)
  ctx.strokeStyle = "#3a2d25";
  ctx.lineWidth = 1.5;
  for (let rx = -10; rx <= 68; rx += 20) {
    ctx.beginPath();
    ctx.moveTo(rx, -10);
    ctx.lineTo(rx, -22);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(-16, -22);
  ctx.lineTo(72, -22);
  ctx.stroke();

  // Tyre fenders along the hull, plank seams and rivets
  ctx.strokeStyle = "rgba(20,8,8,0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-84, 8);
  ctx.lineTo(80, 8);
  ctx.stroke();
  [-12, 22, 56].forEach((fx) => {
    ctx.fillStyle = "#141010";
    ctx.beginPath();
    ctx.arc(fx, 6, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2a2422";
    ctx.beginPath();
    ctx.arc(fx, 6, 2.6, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = "rgba(230,200,170,0.25)";
  for (let rx = -72; rx < 76; rx += 12) ctx.fillRect(rx, -1, 1.4, 1.4);

  // Deck cargo: crates and a coiled net by the rail
  ctx.fillStyle = "#5a4028";
  ctx.fillRect(2, -20, 14, 10);
  ctx.fillRect(8, -29, 11, 9);
  ctx.strokeStyle = "#2a1c10";
  ctx.lineWidth = 1;
  ctx.strokeRect(2, -20, 14, 10);
  ctx.strokeRect(8, -29, 11, 9);
  ctx.fillStyle = "#3a4a3c";
  ctx.beginPath();
  ctx.ellipse(52, -14, 9, 5, 0, Math.PI, 0);
  ctx.fill();

  // 6. Lifebuoy hanging on the side
  const lx = -42;
  const ly = -6;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#9e2a2b";
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(lx, ly, 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fill();
  // Hole in middle
  ctx.fillStyle = "#7a2020";
  ctx.beginPath();
  ctx.arc(lx, ly, 3, 0, Math.PI * 2);
  ctx.fill();

  // 7. Exhaust pipe bent backward
  ctx.strokeStyle = "#4a4038";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-20, -44);
  ctx.lineTo(-20, -64);
  ctx.lineTo(-26, -68);
  ctx.stroke();

  // 8. Headlight fixture on the cabin roof, at the leading edge
  ctx.fillStyle = "#3a2c18";
  ctx.fillRect(-71, -54, 7, 7);
  ctx.fillStyle = "#8a6820";
  ctx.fillRect(-75, -57, 6, 8);
  ctx.fillStyle = "#ffffaa";
  ctx.fillRect(-76, -56, 2, 6);

  const headlightGlow = ctx.createRadialGradient(-76, -53, 1, -76, -53, 12);
  headlightGlow.addColorStop(0, "rgba(255,255,200,0.6)");
  headlightGlow.addColorStop(1, "rgba(255,255,200,0)");
  ctx.fillStyle = headlightGlow;
  ctx.beginPath();
  ctx.arc(-76, -53, 12, 0, Math.PI * 2);
  ctx.fill();

  // 9. Mast / crane arm on open deck
  ctx.strokeStyle = "#4a3828";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(35, -10);
  ctx.lineTo(35, -60);
  ctx.stroke();

  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(35, -50);
  ctx.lineTo(60, -35);
  ctx.stroke();

  // Hanging lantern
  const lanternX = 60;
  const lanternY = -35;
  ctx.strokeStyle = "#1a120e";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(lanternX, lanternY);
  ctx.lineTo(lanternX, lanternY + 6);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,200,100,0.9)";
  ctx.beginPath();
  ctx.arc(lanternX, lanternY + 8, 3, 0, Math.PI * 2);
  ctx.fill();

  const lanternGlow = ctx.createRadialGradient(lanternX, lanternY + 8, 1, lanternX, lanternY + 8, 16);
  lanternGlow.addColorStop(0, "rgba(255,200,100,0.45)");
  lanternGlow.addColorStop(1, "rgba(255,200,100,0)");
  ctx.fillStyle = lanternGlow;
  ctx.beginPath();
  ctx.arc(lanternX, lanternY + 8, 16, 0, Math.PI * 2);
  ctx.fill();

  // 10. Waterline reflection shimmer
  ctx.strokeStyle = "rgba(180,160,140,0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-84, 34);
  ctx.lineTo(84, 34);
  ctx.stroke();

  drawBoatRods(bob);

  ctx.restore();
}

function drawDetektorHints(surfaceY) {
  detektorSpots.forEach((spot) => {
    if (spot.taken) return;
    const sx = spot.wx - camera.x;
    if (sx < 80 || sx > canvas.width - 80) return;
    const on = Math.abs(spot.wx - player.x) < DETEKTOR_ACTIVATE_RADIUS;
    if (!on) return;
    const groundY = seabedYAt(spot.wx);
    ctx.save();
    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, groundY - 10, 36, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "600 13px Georgia, serif";
    ctx.fillStyle = "rgba(240,235,220,0.95)";
    ctx.textAlign = "center";
    ctx.fillText("Detektor [F]", sx, groundY - 52);
    ctx.restore();
  });
}

function drawVignette() {
  const v = ctx.createRadialGradient(
    canvas.width / 2, canvas.height / 2, canvas.height * 0.15,
    canvas.width / 2, canvas.height / 2, canvas.height * 0.85
  );
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(0.55, "rgba(2,6,10,0.18)");
  v.addColorStop(1, "rgba(0,4,8,0.62)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// =====================================================================
// HELPER FUNCTIONS — CYCLE, DOCK, MARKET, INVENTORY, NARRATIVE, WEATHER
// =====================================================================

function getDaylightFactor() {
  const angle = ((gameTime - 12) / 12) * Math.PI;
  return 0.5 + 0.5 * Math.cos(angle);
}

function getNearDock() {
  return Math.abs(player.x - HARBOUR_WX) < 150;
}

function getNearOilRig() {
  return Math.abs(player.x - OILRIG_WX) < 150;
}

function getNearLighthouse() {
  return Math.abs(player.x - LIGHTHOUSE_WX) < 160;
}

function openDockMenu() {
  // The harbour line charges the battery whenever you tie up
  battery = BATTERY_MAX;
  batteryDeadWarned = false;

  if (relicsFound === 6) {
    // Victory: the relics go on the altar and the curse lifts. Play continues.
    relicsFound = 7;
    gameWon = true;
    syncRelicsHud();
    addDanger(-12);
    triggerScreenShake(12);
    triggerDialogue("Strážce majáku", "Přinesl jsi všech 6 relikvií! Položil jsi je na oltář pod majákem. Celý ostrov se otřásl... Zelené světlo prorazilo temnotu a zahnalo stíny zpět do propasti. Jsi volný. VYHRÁL JSI!");
    triggerDialogue("Strážce majáku", "Moře je teď klidnější a šílenství si k tobě hledá cestu jen pomalu. Ryby tu pořád jsou — plav, kam chceš.");
    return;
  }

  dockActive = true;
  currentMenu = "dock";

  if (dockMenuUI) {
    dockMenuUI.classList.remove("hidden");
  }

  // Decrease danger level
  addDanger(-4);
  renderContracts();
  saveGame();
}

function openOilRigMenu() {
  dockActive = true;
  currentMenu = "oilrig";
  if (oilrigUI) {
    oilrigUI.classList.remove("hidden");
    updateOilRigUI();
  }
}

function openLighthouseShopMenu() {
  dockActive = true;
  currentMenu = "lighthouse";
  if (lighthouseShopUI) {
    lighthouseShopUI.classList.remove("hidden");
    updateLighthouseShopUI();
  }
}

function closeAllDockMenus() {
  dockActive = false;
  currentMenu = null;
  if (dockMenuUI) dockMenuUI.classList.add("hidden");
  if (marketUI) marketUI.classList.add("hidden");
  if (oilrigUI) oilrigUI.classList.add("hidden");
  if (lighthouseShopUI) lighthouseShopUI.classList.add("hidden");
}

function handleEKeyInMenu() {
  if (currentMenu === "dock") {
    closeAllDockMenus();
  } else if (currentMenu === "market") {
    if (marketUI) marketUI.classList.add("hidden");
    if (dockMenuUI) dockMenuUI.classList.remove("hidden");
    currentMenu = "dock";
  } else if (currentMenu === "oilrig" || currentMenu === "lighthouse") {
    closeAllDockMenus();
  }
}

function initMenuButtons() {
  if (btnOpenMarket) {
    btnOpenMarket.addEventListener("click", () => {
      if (dockMenuUI) dockMenuUI.classList.add("hidden");
      if (marketUI) marketUI.classList.remove("hidden");
      currentMenu = "market";
      updateMarketUI();
    });
  }
  if (btnRepairShip) {
    const repairLabel = btnRepairShip.textContent;
    btnRepairShip.addEventListener("click", () => {
      if (gold >= 25) {
        gold -= 25;
        if (goldUI) goldUI.innerText = gold;
        addDanger(-12);
        triggerScreenShake(5);
        btnRepairShip.textContent = "Mysl je klidná";
      } else {
        btnRepairShip.textContent = "Nedostatek peněz";
      }
      clearTimeout(btnRepairShip._resetTimer);
      btnRepairShip._resetTimer = setTimeout(() => { btnRepairShip.textContent = repairLabel; }, 1400);
    });
  }
  const btnRepairHull = document.getElementById("btn-repair-hull");
  if (btnRepairHull) {
    btnRepairHull.addEventListener("click", () => {
      const cost = hullDamage * HULL_REPAIR_COST;
      if (!hullDamage) return;
      btnRepairHull._busy = true;
      if (gold >= cost) {
        gold -= cost;
        hullDamage = 0;
        if (goldUI) goldUI.innerText = gold;
        playCoins();
        saveGame();
        btnRepairHull.textContent = "Trup opraven";
      } else {
        btnRepairHull.textContent = "Nedostatek peněz";
      }
      setTimeout(() => { btnRepairHull._busy = false; }, 1400);
    });
  }
  if (btnLeaveDock) {
    btnLeaveDock.addEventListener("click", () => closeAllDockMenus());
  }
  if (btnSellFish) {
    btnSellFish.addEventListener("click", () => sellAllFish());
  }
  if (btnBackMarket) {
    btnBackMarket.addEventListener("click", () => {
      if (marketUI) marketUI.classList.add("hidden");
      if (dockMenuUI) dockMenuUI.classList.remove("hidden");
      currentMenu = "dock";
    });
  }
  if (btnBackOilrig) {
    btnBackOilrig.addEventListener("click", () => closeAllDockMenus());
  }
  if (btnBackLighthouse) {
    btnBackLighthouse.addEventListener("click", () => closeAllDockMenus());
  }
  if (btnUpgradeEngine) btnUpgradeEngine.addEventListener("click", () => buyShipUpgrade("engine"));
  if (btnUpgradeLights) btnUpgradeLights.addEventListener("click", () => buyShipUpgrade("lights"));
  if (btnUpgradeHull) btnUpgradeHull.addEventListener("click", () => buyShipUpgrade("hull"));

  if (btnUpgradeRodQuality) btnUpgradeRodQuality.addEventListener("click", () => buyRodUpgrade("quality"));
  if (btnUpgradeRodLine) btnUpgradeRodLine.addEventListener("click", () => buyRodUpgrade("line"));
  if (btnUpgradeRodBait) btnUpgradeRodBait.addEventListener("click", () => buyRodUpgrade("bait"));

  const btnNewGame = document.getElementById("btn-new-game");
  if (btnNewGame) btnNewGame.addEventListener("click", () => startNewGame());

  const btnBuyKit = document.getElementById("btn-buy-recharge-kit");
  if (btnBuyKit) btnBuyKit.addEventListener("click", () => buyRechargeKit());

  if (btnDialogNext) {
    btnDialogNext.addEventListener("click", () => skipTypewriter());
  }
}

function updateMarketUI() {
  let common = 0, uncommon = 0, rare = 0, aberrant = 0, reef = 0;
  let totalVal = 0;

  inventory.forEach(f => {
    totalVal += fishValue(f);
    if (f.reefOnly) {
      reef++;
    } else if (f.rarity === "common")   { common++;   }
    else if (f.rarity === "uncommon")   { uncommon++; }
    else if (f.rarity === "rare")       { rare++;     }
    else if (f.rarity === "aberrant")   { aberrant++; }
  });

  document.getElementById("market-common-count").textContent   = `${common}x`;
  document.getElementById("market-uncommon-count").textContent = `${uncommon}x`;
  document.getElementById("market-rare-count").textContent     = `${rare}x`;
  document.getElementById("market-aberrant-count").textContent = `${aberrant}x`;
  document.getElementById("market-sell-value").textContent     = totalVal;

  // Contracts this load would complete
  let bonus = 0;
  contracts.forEach((c) => {
    if (c.done + inventory.filter((f) => f.id === c.speciesId).length >= c.count) bonus += c.reward;
  });
  const bonusEl = document.getElementById("market-contract-bonus");
  if (bonusEl) bonusEl.textContent = `$${bonus}`;

  const reefCountEl = document.getElementById("market-reef-count");
  const reefRowEl   = document.getElementById("market-reef-row");
  if (reefCountEl) reefCountEl.textContent = `${reef}x`;
  if (reefRowEl)   reefRowEl.style.display = reef > 0 ? "" : "none";

  if (marketResultEl) marketResultEl.classList.add("hidden");
}

function sellAllFish() {
  if (inventory.length === 0) {
    if (marketResultEl) {
      marketResultEl.textContent = "Nemáš žádné ryby k prodeji.";
      marketResultEl.className = "market-result bad";
      marketResultEl.classList.remove("hidden");
    }
    return;
  }

  let totalVal = 0;
  let totalKg = 0;
  inventory.forEach(f => {
    totalVal += fishValue(f);
    totalKg += f.weight || 0;
  });
  const bonus = settleContracts(inventory);

  gold += totalVal + bonus;
  playCoins();
  saveGame();
  if (goldUI) goldUI.innerText = gold;

  const count = inventory.length;
  inventory = [];
  caughtFish = 0;
  if (fishUI) fishUI.innerText = caughtFish;

  updateInventoryUI();
  updateMarketUI();

  if (marketResultEl) {
    marketResultEl.textContent = `Prodáno ${count} ryb (${formatKg(totalKg)}) za $${totalVal}` + (bonus ? ` + zakázky $${bonus}!` : "!");
    marketResultEl.className = "market-result ok";
    marketResultEl.classList.remove("hidden");
  }
}

function updateOilRigUI() {
  const types = ["engine", "lights", "hull"];
  types.forEach(type => {
    const lvl = upgrades[type];
    const lvlEl = document.getElementById(`upgrade-${type}-level`);
    const btnEl = document.getElementById(`btn-upgrade-${type}`);

    if (lvlEl) {
      lvlEl.textContent = `(Lvl ${lvl})`;
    }

    if (btnEl) {
      if (lvl >= 4) {
        btnEl.textContent = "MAX";
        btnEl.disabled = true;
      } else {
        const cost = upgradeCosts[type][lvl - 1];
        btnEl.textContent = `$${cost}`;
        btnEl.disabled = false;
      }
    }
  });

  const kitLvl = document.getElementById("recharge-kit-level");
  const kitBtn = document.getElementById("btn-buy-recharge-kit");
  if (kitLvl) kitLvl.textContent = `(${batteryRechargesLeft}× zbývá)`;
  if (kitBtn) {
    const full = batteryRechargesLeft >= RECHARGE_KIT_USES;
    kitBtn.textContent = full ? "PLNÁ" : `$${RECHARGE_KIT_COST}`;
    kitBtn.disabled = full;
  }

  if (oilrigResultEl) {
    oilrigResultEl.classList.add("hidden");
  }
}

function buyShipUpgrade(type) {
  const lvl = upgrades[type];
  if (lvl >= 4) return;

  const cost = upgradeCosts[type][lvl - 1];
  if (gold < cost) {
    if (oilrigResultEl) {
      oilrigResultEl.textContent = "Nedostatek peněz!";
      oilrigResultEl.className = "market-result bad";
      oilrigResultEl.classList.remove("hidden");
    }
    return;
  }

  gold -= cost;
  if (goldUI) goldUI.innerText = gold;

  upgrades[type]++;

  if (type === "engine") {
    player.speed = 2.8 + (upgrades.engine - 1) * 0.9;
  }
  if (type === "hull") updateInventoryUI();

  updateOilRigUI();
  if (oilrigResultEl) {
    oilrigResultEl.textContent = `Vylepšení zakoupeno!`;
    oilrigResultEl.className = "market-result ok";
    oilrigResultEl.classList.remove("hidden");
  }
}

function buyRechargeKit() {
  if (batteryRechargesLeft >= RECHARGE_KIT_USES) return;
  if (gold < RECHARGE_KIT_COST) {
    if (oilrigResultEl) {
      oilrigResultEl.textContent = "Nedostatek peněz!";
      oilrigResultEl.className = "market-result bad";
      oilrigResultEl.classList.remove("hidden");
    }
    return;
  }
  gold -= RECHARGE_KIT_COST;
  if (goldUI) goldUI.innerText = gold;
  batteryRechargesLeft = RECHARGE_KIT_USES;
  playCoins();
  updateOilRigUI();
  if (oilrigResultEl) {
    oilrigResultEl.textContent = "Dobíjecí sada zakoupena — na moři ji použiješ klávesou R.";
    oilrigResultEl.className = "market-result ok";
    oilrigResultEl.classList.remove("hidden");
  }
}

function updateLighthouseShopUI() {
  const types = ["quality", "line", "bait"];
  types.forEach(type => {
    const lvl = rodUpgrades[type];
    const lvlEl = document.getElementById(`upgrade-rod-${type}-level`);
    const btnEl = document.getElementById(`btn-upgrade-rod-${type}`);

    if (lvlEl) {
      lvlEl.textContent = `(Lvl ${lvl})`;
    }

    if (btnEl) {
      if (lvl >= 4) {
        btnEl.textContent = "MAX";
        btnEl.disabled = true;
      } else {
        const cost = rodUpgradeCosts[type][lvl - 1];
        btnEl.textContent = `$${cost}`;
        btnEl.disabled = false;
      }
    }
  });
  if (lighthouseResultEl) {
    lighthouseResultEl.classList.add("hidden");
  }
}

function buyRodUpgrade(type) {
  const lvl = rodUpgrades[type];
  if (lvl >= 4) return;

  const cost = rodUpgradeCosts[type][lvl - 1];
  if (gold < cost) {
    if (lighthouseResultEl) {
      lighthouseResultEl.textContent = "Nedostatek peněz!";
      lighthouseResultEl.className = "market-result bad";
      lighthouseResultEl.classList.remove("hidden");
    }
    return;
  }

  gold -= cost;
  if (goldUI) goldUI.innerText = gold;

  rodUpgrades[type]++;

  if (type === "quality") initFishingRingSvg();

  updateLighthouseShopUI();
  if (lighthouseResultEl) {
    lighthouseResultEl.textContent = `Vylepšení zakoupeno!`;
    lighthouseResultEl.className = "market-result ok";
    lighthouseResultEl.classList.remove("hidden");
  }
}

const CARGO_COLS = 7;
const CARGO_CELL = 42;

function getCargoRows() {
  return 2 + upgrades.hull;
}

function itemDims(f, rot = f.rot) {
  return rot ? [f.fh, f.fw] : [f.fw, f.fh];
}

function cargoFits(f, gx, gy, rot, ignore) {
  const [w, h] = itemDims(f, rot);
  if (gx < 0 || gy < 0 || gx + w > CARGO_COLS || gy + h > getCargoRows()) return false;
  return !inventory.some((o) => {
    if (o === ignore || o.gx === undefined) return false;
    const [ow, oh] = itemDims(o);
    return gx < o.gx + ow && o.gx < gx + w && gy < o.gy + oh && o.gy < gy + h;
  });
}

// First free spot for a fish, trying it as it is and turned on its side
function findCargoSpot(f) {
  for (const rot of f.fw === f.fh ? [0] : [0, 1]) {
    for (let gy = 0; gy < getCargoRows(); gy++) {
      for (let gx = 0; gx < CARGO_COLS; gx++) {
        if (cargoFits(f, gx, gy, rot, null)) return { gx, gy, rot };
      }
    }
  }
  return null;
}

function placeInHold(f) {
  const spot = findCargoSpot(f);
  if (!spot) return false;
  Object.assign(f, spot);
  inventory.push(f);
  return true;
}

function drawHoldFish(cv, f) {
  const [w0, h0] = [f.fw * CARGO_CELL, f.fh * CARGO_CELL];
  const [cw, ch] = f.rot ? [h0, w0] : [w0, h0];
  cv.width = cw * 2;
  cv.height = ch * 2;
  const g = cv.getContext("2d");
  g.scale(2, 2);
  g.translate(cw / 2, ch / 2);
  if (f.rot) g.rotate(Math.PI / 2);
  const s = Math.min(w0 / 112, h0 / 62) * 0.95;
  g.scale(s, s);
  (FISH_SHAPES[f.shape] || FISH_SHAPES.slim)(g, fishHexToRgb(f.color || "#8aa6b5"), 0.8, 0);
}

// Drag a fish to another spot in the hold; a plain click turns it on its side
function startCargoDrag(e, f, el) {
  if (e.button !== 0) return;
  e.preventDefault();
  const rect = inventoryGridEl.getBoundingClientRect();
  const offX = e.clientX - rect.left - f.gx * CARGO_CELL;
  const offY = e.clientY - rect.top - f.gy * CARGO_CELL;
  let moved = false;
  let tx = f.gx, ty = f.gy;
  el.setPointerCapture(e.pointerId);
  el.classList.add("dragging");

  const onMove = (m) => {
    if (Math.hypot(m.clientX - e.clientX, m.clientY - e.clientY) > 4) moved = true;
    if (!moved) return;
    const left = m.clientX - rect.left - offX;
    const top = m.clientY - rect.top - offY;
    el.style.left = left + "px";
    el.style.top = top + "px";
    tx = Math.round(left / CARGO_CELL);
    ty = Math.round(top / CARGO_CELL);
    el.classList.toggle("bad", !cargoFits(f, tx, ty, f.rot, f));
  };
  const onUp = () => {
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", onUp);
    el.removeEventListener("pointercancel", onUp);
    if (!moved) {
      const turned = f.rot ? 0 : 1;
      if (f.fw !== f.fh && cargoFits(f, f.gx, f.gy, turned, f)) f.rot = turned;
    } else if (cargoFits(f, tx, ty, f.rot, f)) {
      f.gx = tx;
      f.gy = ty;
    }
    updateInventoryUI();
  };
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onUp);
}

function updateInventoryUI() {
  if (!inventoryGridEl) return;
  inventoryGridEl.innerHTML = "";
  inventoryGridEl.style.width = CARGO_COLS * CARGO_CELL + "px";
  inventoryGridEl.style.height = getCargoRows() * CARGO_CELL + "px";

  if (inventoryCapacityEl) {
    const used = inventory.reduce((n, f) => n + f.fw * f.fh, 0);
    inventoryCapacityEl.textContent = `${used} / ${getCargoCapacity()} polí`;
  }

  inventory.forEach((fish) => {
    const [w, h] = itemDims(fish);
    const el = document.createElement("div");
    el.className = `inv-item rarity-${fish.rarity} freshness-${fishFreshness(fish).key}`;
    el.style.left = fish.gx * CARGO_CELL + "px";
    el.style.top = fish.gy * CARGO_CELL + "px";
    el.style.width = w * CARGO_CELL + "px";
    el.style.height = h * CARGO_CELL + "px";

    const cv = document.createElement("canvas");
    drawHoldFish(cv, fish);
    el.appendChild(cv);

    const fresh = fishFreshness(fish);
    const tooltipEl = document.createElement("div");
    tooltipEl.className = "inventory-tooltip";
    tooltipEl.innerHTML = `
      <strong>${fish.name}</strong><br>
      <span style="color:#a89878; font-size:0.75rem;">${RARITY_LABEL[fish.rarity]}${fish.weight ? " · " + formatKg(fish.weight) : ""}</span><br>
      <span class="fresh-label fresh-${fresh.key}">${fresh.label}</span> · <span style="color:#d8cbb0;">$${fishValue(fish)}</span>
    `;
    el.appendChild(tooltipEl);

    el.addEventListener("pointerdown", (e) => startCargoDrag(e, fish, el));
    inventoryGridEl.appendChild(el);
  });
}

function toggleInventory() {
  if (inventoryOpen) {
    if (inventoryUI) inventoryUI.classList.add("hidden");
    inventoryOpen = false;
  } else {
    updateInventoryUI();
    if (inventoryUI) inventoryUI.classList.remove("hidden");
    inventoryOpen = true;
  }
}

function triggerDialogue(speaker, text) {
  dialogueQueue.push({ speaker, text });
  if (!dialogueActive) {
    dialogueActive = true;
    if (dialogUI) dialogUI.classList.remove("hidden");
    showNextDialogue();
  }
}

function showNextDialogue() {
  if (dialogueQueue.length === 0) {
    closeDialogue();
    return;
  }

  currentDialogue = dialogueQueue.shift();
  if (dialogSpeakerEl) {
    dialogSpeakerEl.textContent = currentDialogue.speaker;
  }

  typewriterIndex = 0;
  if (dialogTextEl) {
    dialogTextEl.textContent = "";
  }

  if (typewriterTimer) {
    clearInterval(typewriterTimer);
  }

  typewriterTimer = setInterval(() => {
    if (typewriterIndex < currentDialogue.text.length) {
      dialogTextEl.textContent += currentDialogue.text[typewriterIndex];
      typewriterIndex++;
    } else {
      clearInterval(typewriterTimer);
      typewriterTimer = null;
    }
  }, 35);
}

function skipTypewriter() {
  if (!currentDialogue) return;

  if (typewriterTimer) {
    clearInterval(typewriterTimer);
    typewriterTimer = null;
    if (dialogTextEl) {
      dialogTextEl.textContent = currentDialogue.text;
    }
    typewriterIndex = currentDialogue.text.length;
  } else {
    showNextDialogue();
  }
}

function closeDialogue() {
  dialogueActive = false;
  currentDialogue = null;
  if (dialogUI) dialogUI.classList.add("hidden");
  if (typewriterTimer) {
    clearInterval(typewriterTimer);
    typewriterTimer = null;
  }
}

function triggerGameOver() {
  // Nothing from the voyage may keep typing over the game-over text
  dialogueQueue = [];
  currentDialogue = null;
  if (typewriterTimer) {
    clearInterval(typewriterTimer);
    typewriterTimer = null;
  }
  gameOver = true;
  danger = 12;
  if (dangerUI) dangerUI.innerText = "12";

  closeAllDockMenus();
  if (inventoryUI) inventoryUI.classList.add("hidden");
  inventoryOpen = false;

  if (dialogUI) {
    dialogUI.classList.remove("hidden");
    dialogueActive = true;
  }
  if (dialogSpeakerEl) {
    dialogSpeakerEl.textContent = "Hlubiny moře";
  }
  if (dialogTextEl) {
    dialogTextEl.innerHTML = `<span style="color:#ff3333; font-weight:bold;">Tvoje loď byla pohlcena temnotou.</span><br><br>Šílenství tě zcela ovládlo a stíny z hlubin tě stáhly pod hladinu. Světlo majáku ti nepomohlo.<br><br><span style="font-size:0.9rem; color:#888;">Stiskni MEZERNÍK pro restartování plavby...</span>`;
  }

  if (btnDialogNext) {
    btnDialogNext.textContent = "Restartovat plavbu";
    btnDialogNext.onclick = () => {
      restartGame();
    };
  }
}

function restartGame() {
  // Drop anything left over from the previous voyage
  dialogueQueue = [];
  if (fishingMode) closeFishingPanel();
  fishingLocked = false;
  fishingEscapeAt = 0;
  escapeCapture = null;
  if (detektorMode) closeDetektorPanel();
  detektorLocked = false;
  if (rechargeMinigameActive) closeRechargeUI();
  boatRods.forEach((r) => { r.p = 0; r.wait = 0; r.landed = false; });

  battery = BATTERY_MAX;
  headlightOn = true;
  batteryDeadWarned = false;
  batteryRechargesLeft = 0;
  rodUpgrades.quality = 1;
  rodUpgrades.line = 1;
  rodUpgrades.bait = 1;
  gameWon = false;
  reefWarnedEntry = false;
  contracts = [];
  ensureContracts();
  attackTimer = 30;
  attackFlash = 0;
  lightning.t = 99;
  bioWake.length = 0;
  rainRipples.length = 0;

  gameOver = false;
  hullDamage = 0;
  danger = 0;
  gold = Math.max(0, gold - 100);
  inventory = [];
  caughtFish = 0;
  relicsFound = 0;

  upgrades.engine = 1;
  upgrades.lights = 1;
  upgrades.hull = 1;
  player.speed = 2.8;

  player.x = START_X;
  camera.x = START_X - canvas.width / 2;

  gameTime = 7.75;
  dayNum = 1;

  dangerThresh3 = false;

  if (goldUI) goldUI.innerText = gold;
  if (fishUI) fishUI.innerText = caughtFish;
  if (dangerUI) dangerUI.innerText = danger;
  syncRelicsHud();

  closeDialogue();
  if (btnDialogNext) {
    btnDialogNext.textContent = "Pokračovat";
    btnDialogNext.onclick = null;
  }

  seedWorld();
  initSpotState();

  saveGame();
  triggerDialogue("Nový začátek", "Procitáš v přístavu, s třeštící hlavou a prázdným podpalubím. Byl to jen sen? Nebo tě moře vrátilo zpět?");
}

function updateScreenShake() {
  if (shakeIntensity > 0) {
    shakeIntensity *= Math.pow(0.9, frameDt * 60);   // same decay on any refresh rate
    if (shakeIntensity < 0.1) shakeIntensity = 0;
  }
}

function triggerScreenShake(intensity) {
  shakeIntensity = intensity;
}

function drawDockStructure(surfaceY) {
  const sx = HARBOUR_WX - camera.x;
  if (sx < -300 || sx > canvas.width + 300) return;

  ctx.save();

  // 1. Vertical wooden posts (pilings)
  ctx.fillStyle = "#1e140f";
  ctx.strokeStyle = "#0d0906";
  ctx.lineWidth = 2.5;

  const pilingPositions = [-95, -50, 0, 50, 95];
  pilingPositions.forEach(dx => {
    const px = sx + dx;
    const py = surfaceY - 5;
    const ph = 60;

    // Draw wood post going underwater
    ctx.fillRect(px - 6, py, 12, ph);
    ctx.strokeRect(px - 6, py, 12, ph);

    // Ropes / metal bands around pilings
    ctx.strokeStyle = "#5a4535";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(px - 6, py + 12);
    ctx.lineTo(px + 6, py + 12);
    ctx.moveTo(px - 6, py + 18);
    ctx.lineTo(px + 6, py + 18);
    ctx.stroke();
  });

  // 2. Horizontal Pier Deck (planks)
  ctx.fillStyle = "#2c1c14";
  ctx.strokeStyle = "#0d0906";
  ctx.lineWidth = 2.5;
  ctx.fillRect(sx - 115, surfaceY - 14, 230, 10);
  ctx.strokeRect(sx - 115, surfaceY - 14, 230, 10);

  // Planks dividers
  ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
  ctx.lineWidth = 1.2;
  for (let x = sx - 105; x <= sx + 105; x += 15) {
    ctx.beginPath();
    ctx.moveTo(x, surfaceY - 14);
    ctx.lineTo(x, surfaceY - 4);
    ctx.stroke();
  }

  // 3. Pier Wood Sign saying "PŘÍSTAV"
  ctx.fillStyle = "#3a281e";
  ctx.fillRect(sx - 35, surfaceY - 36, 70, 14);
  ctx.strokeRect(sx - 35, surfaceY - 36, 70, 14);

  ctx.strokeStyle = "#1a120e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx - 20, surfaceY - 14);
  ctx.lineTo(sx - 20, surfaceY - 22);
  ctx.moveTo(sx + 20, surfaceY - 14);
  ctx.lineTo(sx + 20, surfaceY - 22);
  ctx.stroke();

  ctx.font = "bold 9px 'Cinzel', Georgia, serif";
  ctx.fillStyle = "#d8cbb0";
  ctx.textAlign = "center";
  ctx.fillText("PŘÍSTAV", sx, surfaceY - 26);

  // 4. Mooring bollard (uvazovací sloupek)
  ctx.fillStyle = "#3e403d";
  ctx.fillRect(sx + 80, surfaceY - 24, 8, 10);
  ctx.beginPath();
  ctx.arc(sx + 84, surfaceY - 24, 6, 0, Math.PI * 2);
  ctx.fill();

  // 5. Tied bobbing rowboat
  const rowboatBob = Math.sin(performance.now() * 0.0016) * 1.8;
  const rbx = sx + 50;
  const rby = surfaceY + 8 + rowboatBob;

  // Rowboat hull (side view)
  ctx.fillStyle = "#3e2d21";
  ctx.strokeStyle = "#1e130c";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(rbx - 22, rby - 4);
  ctx.lineTo(rbx + 18, rby - 4);
  ctx.quadraticCurveTo(rbx + 24, rby + 1, rbx + 22, rby + 6);
  ctx.lineTo(rbx - 16, rby + 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Rowboat interior rim
  ctx.fillStyle = "#1e130c";
  ctx.beginPath();
  ctx.moveTo(rbx - 18, rby - 2);
  ctx.lineTo(rbx + 14, rby - 2);
  ctx.lineTo(rbx + 18, rby + 3);
  ctx.lineTo(rbx - 14, rby + 4);
  ctx.closePath();
  ctx.fill();

  // Tied rope going to the bollard
  ctx.strokeStyle = "#5a4535";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(rbx - 22, rby);
  ctx.quadraticCurveTo(sx + 84, rby - 8, sx + 84, surfaceY - 18);
  ctx.stroke();

  // 6. Warm glowing lantern on the pier
  const lx = sx - 80;
  const ly = surfaceY - 42;

  ctx.strokeStyle = "#3a2d25";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(lx, surfaceY - 14);
  ctx.lineTo(lx, ly);
  ctx.lineTo(lx + 15, ly);
  ctx.stroke();

  const t = performance.now() * 0.0035;
  const flicker = Math.sin(t) * 0.08 + Math.cos(t * 1.7) * 0.04;

  const lg = ctx.createRadialGradient(lx + 15, ly + 6, 1, lx + 15, ly + 6, 25);
  lg.addColorStop(0, `rgba(255, 180, 80, ${0.95 + flicker})`);
  lg.addColorStop(0.3, `rgba(255, 150, 50, ${0.45 + flicker})`);
  lg.addColorStop(1, "rgba(255, 150, 50, 0)");

  ctx.fillStyle = lg;
  ctx.beginPath();
  ctx.arc(lx + 15, ly + 6, 25, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1a120e";
  ctx.fillRect(lx + 11, ly + 2, 8, 8);

  ctx.restore();
}

function drawTentacles(surfaceY) {
  if (danger < 6) return;
  const t = performance.now() * 0.001;

  ctx.save();
  ctx.fillStyle = "rgba(10, 22, 18, 0.95)";
  ctx.strokeStyle = "rgba(6, 12, 10, 1)";
  ctx.lineWidth = 3;

  for (let i = 0; i < 2; i++) {
    const wx = player.x + (i === 0 ? -180 : 180) + Math.sin(t * 0.4 + i) * 60;
    const sx = wx - camera.x;

    if (sx < 20 || sx > canvas.width - 20) continue;

    const tentH = 35 + Math.sin(t * 0.8 + i * 3.1) * 35;
    if (tentH <= 1) continue;

    ctx.beginPath();
    ctx.moveTo(sx - 12, surfaceY + 4);
    const cpX = sx + Math.sin(t * 1.2 + i) * 20;
    ctx.quadraticCurveTo(cpX, surfaceY - tentH * 0.5, sx - 2 + Math.sin(t * 1.5) * 8, surfaceY - tentH);
    ctx.quadraticCurveTo(cpX + 8, surfaceY - tentH * 0.4, sx + 12, surfaceY + 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "rgba(150, 170, 160, 0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(sx, surfaceY + 4, 18, 4, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawShadowCreature(surfaceY) {
  if (danger < 9) return;
  const t = performance.now() * 0.0012;
  const screenBoatX = canvas.width / 2;

  const followLag = Math.sin(t * 0.5) * 40 - 120;
  const cx = screenBoatX + followLag;
  const cy = surfaceY + 80 + Math.sin(t * 1.4) * 15;

  ctx.save();
  ctx.globalCompositeOperation = "multiply";

  const cg = ctx.createRadialGradient(cx, cy, 5, cx, cy, 90);
  cg.addColorStop(0, "rgba(5, 12, 10, 0.65)");
  cg.addColorStop(0.5, "rgba(5, 12, 10, 0.35)");
  cg.addColorStop(1, "rgba(0, 0, 0, 0)");

  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 100, 32, Math.sin(t * 0.8) * 0.15, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(5, 12, 10, 0.25)";
  ctx.beginPath();
  ctx.moveTo(cx - 70, cy);
  ctx.quadraticCurveTo(cx - 130, cy + Math.sin(t * 2) * 18, cx - 180, cy + Math.sin(t * 2) * 8);
  ctx.quadraticCurveTo(cx - 130, cy + Math.sin(t * 2) * -12, cx - 70, cy);
  ctx.fill();

  ctx.restore();
}

function updateRain() {
  const daylight = getDaylightFactor();
  const isNight = daylight < 0.35;
  const targetRain = isNight ? 100 : 30;
  const f60 = frameDt * 60;
  const surfaceY = getSurfaceY();

  while (rainParticles.length < targetRain) {
    rainParticles.push({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * 50,
      len: 15 + Math.random() * 20,
      speed: 12 + Math.random() * 8,
      opacity: 0.15 + Math.random() * 0.25
    });
  }

  for (let i = rainParticles.length - 1; i >= 0; i--) {
    const p = rainParticles[i];
    p.y += p.speed * f60;
    p.x -= p.speed * 0.25 * f60;

    // Drops end at the sea surface (they used to fall straight through the water)
    if (p.y + p.len > surfaceY) {
      const hitX = p.x - p.len * 0.25;
      if (hitX > -10 && hitX < canvas.width + 10 && rainRipples.length < 80) {
        rainRipples.push({ x: hitX, t: 0 });
      }
      p.x = Math.random() * (canvas.width + 100);
      p.y = -20 - Math.random() * 40;
    } else if (p.x < -20) {
      p.x = Math.random() * (canvas.width + 100);
      p.y = -20;
    }
  }

  for (let i = rainRipples.length - 1; i >= 0; i--) {
    rainRipples[i].t += frameDt;
    if (rainRipples[i].t > 0.55) rainRipples.splice(i, 1);
  }
}

function drawRain() {
  ctx.save();
  ctx.strokeStyle = "rgba(174,194,224,0.35)";
  ctx.lineWidth = 1.2;

  rainParticles.forEach(p => {
    ctx.globalAlpha = p.opacity;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - p.len * 0.25, p.y + p.len);
    ctx.stroke();
  });

  ctx.restore();
}

// =====================================================================
// FOG — layered, tileable fbm noise banks with time-of-day density
// =====================================================================

const FOG_TEX_W = 1024;
const FOG_TEX_H = 256;
let fogTexBase = null;   // white noise bank (alpha only)
let fogTexTinted = null; // same bank recoloured to the current fog tint
let fogTintKey = "";

function fogLatticeRand(ix, iy, seed) {
  const s = Math.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

// Value noise that wraps horizontally every `periodX` cells → seamless tiling
function fogValueNoise(x, y, periodX, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const xa = ((x0 % periodX) + periodX) % periodX;
  const xb = (xa + 1) % periodX;
  const a = fogLatticeRand(xa, y0, seed), b = fogLatticeRand(xb, y0, seed);
  const c = fogLatticeRand(xa, y0 + 1, seed), d = fogLatticeRand(xb, y0 + 1, seed);
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
}

function buildFogTexture() {
  const c = document.createElement("canvas");
  c.width = FOG_TEX_W;
  c.height = FOG_TEX_H;
  const g = c.getContext("2d");
  const img = g.createImageData(FOG_TEX_W, FOG_TEX_H);
  const baseCellsX = 6, baseCellsY = 3;
  for (let py = 0; py < FOG_TEX_H; py++) {
    const v = py / FOG_TEX_H;
    // Soft band: fades out at top and bottom, heavier toward the lower edge
    const band = Math.pow(Math.sin(Math.PI * v), 1.4) * (0.65 + 0.35 * v);
    for (let px = 0; px < FOG_TEX_W; px++) {
      const u = px / FOG_TEX_W;
      let n = 0, amp = 0.55, total = 0;
      for (let o = 0; o < 4; o++) {
        const cellsX = baseCellsX << o;
        const cellsY = baseCellsY << o;
        n += fogValueNoise(u * cellsX, v * cellsY, cellsX, o + 1) * amp;
        total += amp;
        amp *= 0.5;
      }
      n /= total;
      const a = Math.max(0, Math.min(1, (n - 0.28) * 2.6)) * band;
      const i = (py * FOG_TEX_W + px) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  fogTexBase = c;

  fogTexTinted = document.createElement("canvas");
  fogTexTinted.width = FOG_TEX_W;
  fogTexTinted.height = FOG_TEX_H;
}

function getSunsetWeight() {
  let w = 0;
  if (gameTime >= 4 && gameTime <= 8) w = 1 - Math.abs((gameTime - 6) / 2);
  else if (gameTime >= 16 && gameTime <= 20) w = 1 - Math.abs((gameTime - 18) / 2);
  return Math.max(0, Math.min(1, w));
}

// Fog colour follows the sky: cold blue-grey at night, warm at dusk, pale by day
function getFogTint() {
  const day = getDaylightFactor();
  const sun = getSunsetWeight();
  // Fog scatters light, so it always sits a little brighter than the ambient sky
  let r = 70 + (190 - 70) * day;
  let g = 84 + (196 - 84) * day;
  let b = 98 + (198 - 98) * day;
  r += (176 - r) * sun * 0.55;
  g += (132 - g) * sun * 0.55;
  b += (122 - b) * sun * 0.55;
  return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
}

// 0..1 — thick at dawn, lighter at noon, rising at night, deeper sea and danger add more
function getFogDensity() {
  const h = gameTime;
  const dawn = Math.exp(-((h - 6.5) ** 2) / (2 * 1.6 * 1.6));
  const dusk = Math.exp(-((h - 20.5) ** 2) / (2 * 2.2 * 2.2)) * 0.45;
  const night = (1 - getDaylightFactor()) * 0.3;
  const deep = Math.max(0, Math.min(1, (Math.abs(player.x) - 3000) / 6000)) * 0.3;
  const dread = (danger / 12) * 0.35;
  const breathe = Math.sin(performance.now() * 0.00007) * 0.06;
  return Math.max(0.12, Math.min(1, 0.2 + dawn * 0.6 + dusk + night + deep + dread + breathe));
}

function refreshFogTint() {
  const tint = getFogTint();
  const key = `${tint.r},${tint.g},${tint.b}`;
  if (key === fogTintKey) return;
  fogTintKey = key;
  const tg = fogTexTinted.getContext("2d");
  tg.globalCompositeOperation = "source-over";
  tg.clearRect(0, 0, FOG_TEX_W, FOG_TEX_H);
  tg.drawImage(fogTexBase, 0, 0);
  tg.globalCompositeOperation = "source-in";
  tg.fillStyle = `rgb(${key})`;
  tg.fillRect(0, 0, FOG_TEX_W, FOG_TEX_H);
}

// One horizontally tiled fog band. `parallax` ties it to the camera, `wind` drifts it.
function drawFogBand(centerY, height, tileW, parallax, wind, alpha, flipY) {
  if (alpha <= 0.005) return;
  const t = performance.now() / 1000;
  let off = (camera.x * parallax + t * wind) % tileW;
  if (off < 0) off += tileW;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  const top = centerY - height / 2;
  for (let x = -off; x < canvas.width; x += tileW) {
    if (flipY) {
      ctx.save();
      ctx.translate(0, top + height);
      ctx.scale(1, -1);
      ctx.drawImage(fogTexTinted, x, 0, tileW + 1, height);
      ctx.restore();
    } else {
      ctx.drawImage(fogTexTinted, x, top, tileW + 1, height);
    }
  }
  ctx.restore();
}

// "back" = behind the boat (over coast and horizon), "front" = veil in front of everything
function drawFogLayers(surfaceY, which) {
  if (!fogTexBase) buildFogTexture();
  refreshFogTint();
  const d = getFogDensity();
  const w = canvas.width;

  if (which === "back") {
    // Far bank hugging the coastline
    drawFogBand(surfaceY - 60, 150 + d * 110, w * 1.6, 0.18, 6, 0.3 + d * 0.7, false);
    // Mid bank resting on the water line
    drawFogBand(surfaceY - 6, 100 + d * 60, w * 1.3, 0.45, 14, 0.2 + d * 0.8, true);
  } else {
    // Low wisps drifting past in the foreground — keep the boat readable
    drawFogBand(surfaceY + 4, 80 + d * 50, w * 1.1, 1.05, 26, d * 0.55, false);
    // Thin haze over the air and surface when fog is heavy — the deep stays dark
    if (d > 0.35) {
      const tint = getFogTint();
      const a = (d - 0.35) * 0.2;
      const haze = ctx.createLinearGradient(0, 0, 0, surfaceY + 120);
      haze.addColorStop(0, `rgba(${tint.r},${tint.g},${tint.b},${a * 0.6})`);
      haze.addColorStop(0.75, `rgba(${tint.r},${tint.g},${tint.b},${a})`);
      haze.addColorStop(1, `rgba(${tint.r},${tint.g},${tint.b},0)`);
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, w, surfaceY + 120);
    }
  }
}

// =====================================================================
// BACKGROUND LIFE — gulls, passing boats
// =====================================================================

const gulls = [];
for (let i = 0; i < 9; i++) {
  gulls.push({
    x: hash(i * 91 + 5) * 3000,
    yRatio: 0.18 + hash(i * 57 + 3) * 0.5,
    speed: 18 + hash(i * 13 + 7) * 26,       // px/s across the sky
    dir: hash(i * 29) > 0.4 ? 1 : -1,
    size: 5 + hash(i * 41) * 5,
    phase: hash(i * 77) * 10,
    flapRate: 6 + hash(i * 61) * 4
  });
}

function drawGulls(surfaceY) {
  const day = getDaylightFactor();
  const vis = Math.max(0, Math.min(1, (day - 0.15) * 2));
  if (vis <= 0) return;
  const t = performance.now() / 1000;
  const span = canvas.width + 200;
  ctx.save();
  ctx.lineCap = "round";
  gulls.forEach((g) => {
    g.x += g.speed * g.dir * frameDt;
    let sx = (g.x - camera.x * 0.35) % span;
    if (sx < 0) sx += span;
    sx -= 100;
    const sy = surfaceY * g.yRatio + Math.sin(t * 0.5 + g.phase) * 8;
    // Flap in bursts, then glide
    const gliding = Math.sin(t * 0.35 + g.phase) > 0.3;
    const flap = gliding ? 0.25 : Math.sin(t * g.flapRate + g.phase);
    const s = g.size;
    ctx.strokeStyle = `rgba(20,22,28,${0.75 * vis})`;
    ctx.lineWidth = Math.max(1, s * 0.22);
    ctx.beginPath();
    ctx.moveTo(sx - s, sy - flap * s * 0.55);
    ctx.quadraticCurveTo(sx - s * 0.45, sy - s * 0.35 - flap * s * 0.2, sx, sy);
    ctx.quadraticCurveTo(sx + s * 0.45, sy - s * 0.35 - flap * s * 0.2, sx + s, sy - flap * s * 0.55);
    ctx.stroke();
  });
  ctx.restore();
}

// --- NPC ships: several hull types, sailing at different depths of field ---

const NPC_BOAT_MODELS = ["rowboat", "trawler", "steamer", "skiff"];
const NPC_BOAT_SPEED = { rowboat: 9, trawler: 12, steamer: 10, skiff: 34 };
const npcBoats = [];
for (let i = 0; i < 8; i++) {
  const model = NPC_BOAT_MODELS[i % NPC_BOAT_MODELS.length];
  const depth = hash(i * 37 + 11);               // 0 = far, 1 = near
  npcBoats.push({
    model,
    x: hash(i * 53 + 2) * 4000,
    depth,
    parallax: 0.3 + depth * 0.35,
    scale: 0.26 + depth * 0.3,
    dir: hash(i * 71 + 9) > 0.5 ? 1 : -1,
    speed: NPC_BOAT_SPEED[model] * (0.8 + hash(i * 19) * 0.4),
    phase: hash(i * 23) * 10
  });
}
npcBoats.sort((a, b) => a.depth - b.depth); // far first

// Colour helper: mixes a model colour toward the fog tint by the current haze amount
let npcHaze = { r: 0, g: 0, b: 0, k: 0 };
function hc(r, g, b, a = 1) {
  const k = npcHaze.k;
  return `rgba(${Math.round(r + (npcHaze.r - r) * k)},${Math.round(g + (npcHaze.g - g) * k)},${Math.round(b + (npcHaze.b - b) * k)},${a})`;
}

function npcWindowLight(night, a = 1) {
  return `rgba(255,${Math.round(200 - npcHaze.k * 40)},${Math.round(120 - npcHaze.k * 30)},${(0.15 + night * 0.8) * a})`;
}

function drawNpcGlow(x, y, r, night) {
  if (night < 0.25) return;
  const gl = ctx.createRadialGradient(x, y, 0, x, y, r);
  gl.addColorStop(0, `rgba(255,205,130,${0.4 * night})`);
  gl.addColorStop(1, "rgba(255,205,130,0)");
  ctx.fillStyle = gl;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// All models: facing right, waterline at y = 0, origin at mid-hull.

function drawNpcRowboat(t, night) {
  ctx.fillStyle = hc(92, 62, 40);
  ctx.beginPath();
  ctx.moveTo(-34, -9);
  ctx.lineTo(36, -12);
  ctx.quadraticCurveTo(31, 3, 18, 6);
  ctx.lineTo(-27, 6);
  ctx.quadraticCurveTo(-34, 2, -34, -9);
  ctx.fill();
  ctx.strokeStyle = hc(140, 104, 70);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-34, -9);
  ctx.lineTo(36, -12);
  ctx.stroke();
  // Rower
  ctx.fillStyle = hc(60, 70, 62);
  ctx.fillRect(-6, -26, 10, 16);
  ctx.fillStyle = hc(170, 140, 115);
  ctx.beginPath();
  ctx.arc(-1, -30, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hc(150, 120, 40);
  ctx.fillRect(-7, -35, 12, 3);
  // Oar sweeping through the water
  const a = Math.sin(t * 2.2) * 0.55;
  ctx.strokeStyle = hc(120, 90, 60);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-1, -18);
  ctx.lineTo(-1 + Math.cos(2.2 + a) * 34, -18 + Math.sin(2.2 + a) * 30);
  ctx.stroke();
  // Stern lantern
  ctx.strokeStyle = hc(40, 32, 26);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-30, -9);
  ctx.lineTo(-30, -30);
  ctx.stroke();
  ctx.fillStyle = npcWindowLight(night);
  ctx.beginPath();
  ctx.arc(-30, -32, 2.5, 0, Math.PI * 2);
  ctx.fill();
  drawNpcGlow(-30, -32, 18, night);
}

function drawNpcTrawler(t, night) {
  // Hull
  ctx.fillStyle = hc(38, 58, 76);
  ctx.beginPath();
  ctx.moveTo(-74, -16);
  ctx.lineTo(70, -20);
  ctx.quadraticCurveTo(80, -18, 82, -10);
  ctx.quadraticCurveTo(70, 6, 50, 9);
  ctx.lineTo(-64, 9);
  ctx.quadraticCurveTo(-74, 2, -74, -16);
  ctx.fill();
  ctx.fillStyle = hc(120, 36, 30);
  ctx.fillRect(-70, -2, 140, 4);
  ctx.fillStyle = hc(190, 184, 170);
  ctx.fillRect(-72, -18, 148, 3);
  // Wheelhouse (forward)
  ctx.fillStyle = hc(186, 178, 160);
  ctx.fillRect(18, -50, 40, 32);
  ctx.fillStyle = hc(40, 34, 30);
  ctx.fillRect(14, -54, 48, 5);
  ctx.fillStyle = npcWindowLight(night);
  for (let k = 0; k < 3; k++) ctx.fillRect(24 + k * 11, -44, 7, 8);
  drawNpcGlow(38, -40, 30, night * 0.7);
  // Main mast + aft gantry
  ctx.strokeStyle = hc(55, 48, 42);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-10, -18);
  ctx.lineTo(-10, -96);
  ctx.moveTo(-62, -18);
  ctx.lineTo(-56, -58);
  ctx.lineTo(-44, -18);
  ctx.stroke();
  // Outrigger booms, slowly rocking
  const rock = Math.sin(t * 0.8) * 0.06;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-10, -60);
  ctx.lineTo(-10 - Math.cos(0.75 + rock) * 60, -60 - Math.sin(0.75 + rock) * 46);
  ctx.moveTo(-10, -60);
  ctx.lineTo(-10 + Math.cos(0.75 - rock) * 60, -60 - Math.sin(0.75 - rock) * 46);
  ctx.stroke();
  // Rigging
  ctx.strokeStyle = hc(80, 74, 66, 0.7);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-10, -96);
  ctx.lineTo(80, -20);
  ctx.moveTo(-10, -96);
  ctx.lineTo(-72, -18);
  ctx.moveTo(-56, -58);
  ctx.lineTo(-62, -6);
  ctx.stroke();
  // Hanging net
  ctx.strokeStyle = hc(110, 120, 90, 0.8);
  ctx.beginPath();
  ctx.moveTo(-56, -56);
  ctx.quadraticCurveTo(-70, -30, -64, -6);
  ctx.stroke();
  // Deck work light
  ctx.fillStyle = `rgba(255,240,200,${0.25 + night * 0.75})`;
  ctx.beginPath();
  ctx.arc(-10, -98, 2.5, 0, Math.PI * 2);
  ctx.fill();
  drawNpcGlow(-10, -98, 22, night);
}

function drawNpcSteamer(t, night) {
  // Long hull
  ctx.fillStyle = hc(30, 28, 32);
  ctx.beginPath();
  ctx.moveTo(-112, -22);
  ctx.lineTo(108, -26);
  ctx.quadraticCurveTo(118, -22, 120, -14);
  ctx.quadraticCurveTo(108, 6, 88, 10);
  ctx.lineTo(-104, 10);
  ctx.quadraticCurveTo(-114, 2, -112, -22);
  ctx.fill();
  ctx.fillStyle = hc(110, 32, 28);
  ctx.fillRect(-108, 0, 210, 5);
  // Portholes
  ctx.fillStyle = npcWindowLight(night, 0.9);
  for (let k = 0; k < 9; k++) {
    ctx.beginPath();
    ctx.arc(-88 + k * 22, -12, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Cargo hatches
  ctx.fillStyle = hc(70, 58, 46);
  ctx.fillRect(-18, -34, 30, 9);
  ctx.fillRect(28, -34, 30, 9);
  ctx.fillRect(70, -34, 24, 9);
  // Aft superstructure
  ctx.fillStyle = hc(178, 172, 160);
  ctx.fillRect(-96, -58, 58, 34);
  ctx.fillRect(-88, -74, 40, 16);
  ctx.fillStyle = npcWindowLight(night);
  for (let k = 0; k < 5; k++) ctx.fillRect(-90 + k * 10, -48, 6, 6);
  for (let k = 0; k < 3; k++) ctx.fillRect(-82 + k * 11, -70, 7, 6);
  drawNpcGlow(-66, -52, 40, night * 0.6);
  // Funnel with red band
  ctx.fillStyle = hc(40, 36, 36);
  ctx.fillRect(-64, -104, 16, 32);
  ctx.fillStyle = hc(140, 36, 30);
  ctx.fillRect(-64, -96, 16, 6);
  // Funnel smoke (stateless puffs)
  for (let k = 0; k < 7; k++) {
    const age = (t * 0.22 + k / 7) % 1;
    const px = -56 - age * 70 - age * age * 30;
    const py = -108 - age * 60;
    ctx.fillStyle = hc(70, 70, 74, (1 - age) * 0.35);
    ctx.beginPath();
    ctx.arc(px, py, 4 + age * 14, 0, Math.PI * 2);
    ctx.fill();
  }
  // Fore mast + derrick
  ctx.strokeStyle = hc(60, 52, 46);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(84, -26);
  ctx.lineTo(84, -92);
  ctx.moveTo(84, -70);
  ctx.lineTo(50, -38);
  ctx.moveTo(10, -26);
  ctx.lineTo(10, -78);
  ctx.moveTo(10, -60);
  ctx.lineTo(40, -36);
  ctx.stroke();
  ctx.strokeStyle = hc(80, 74, 66, 0.6);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(84, -92);
  ctx.lineTo(118, -24);
  ctx.moveTo(84, -92);
  ctx.lineTo(10, -78);
  ctx.lineTo(-48, -104);
  ctx.stroke();
  // Navigation lights
  ctx.fillStyle = `rgba(255,250,235,${0.25 + night * 0.75})`;
  ctx.beginPath();
  ctx.arc(84, -94, 2.5, 0, Math.PI * 2);
  ctx.fill();
  drawNpcGlow(84, -94, 20, night);
  ctx.fillStyle = `rgba(90,255,140,${0.2 + night * 0.7})`;
  ctx.beginPath();
  ctx.arc(110, -30, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawNpcSkiff(t, night) {
  // Sleek planing hull, bow lifted
  ctx.save();
  ctx.rotate(-0.04);
  ctx.fillStyle = hc(160, 166, 170);
  ctx.beginPath();
  ctx.moveTo(-40, -12);
  ctx.lineTo(42, -14);
  ctx.quadraticCurveTo(50, -10, 46, -4);
  ctx.quadraticCurveTo(30, 5, 10, 6);
  ctx.lineTo(-38, 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = hc(150, 110, 40);
  ctx.fillRect(-38, -6, 82, 3);
  // Console + windscreen
  ctx.fillStyle = hc(60, 66, 72);
  ctx.fillRect(-6, -26, 18, 14);
  ctx.fillStyle = hc(140, 170, 190, 0.6);
  ctx.beginPath();
  ctx.moveTo(12, -26);
  ctx.lineTo(18, -16);
  ctx.lineTo(12, -16);
  ctx.fill();
  // Pilot
  ctx.fillStyle = hc(140, 60, 40);
  ctx.fillRect(-16, -28, 8, 14);
  ctx.fillStyle = hc(170, 140, 115);
  ctx.beginPath();
  ctx.arc(-12, -31, 4, 0, Math.PI * 2);
  ctx.fill();
  // Outboard motor
  ctx.fillStyle = hc(30, 30, 34);
  ctx.fillRect(-46, -16, 8, 14);
  // Antenna
  ctx.strokeStyle = hc(50, 50, 55);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(4, -26);
  ctx.lineTo(0, -52);
  ctx.stroke();
  ctx.fillStyle = `rgba(255,80,60,${0.3 + night * 0.7 * (Math.sin(t * 5) > 0 ? 1 : 0.3)})`;
  ctx.beginPath();
  ctx.arc(0, -53, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const NPC_DRAWERS = {
  rowboat: drawNpcRowboat,
  trawler: drawNpcTrawler,
  steamer: drawNpcSteamer,
  skiff: drawNpcSkiff
};

function drawNpcWake(len, speedFactor, alpha) {
  ctx.strokeStyle = `rgba(210,225,235,${alpha})`;
  ctx.lineWidth = 1.5;
  const t = performance.now() * 0.004;
  for (let k = 0; k < 4; k++) {
    const x0 = -len * 0.5 - k * 14 * speedFactor;
    const w = 10 + k * 8 * speedFactor;
    ctx.beginPath();
    ctx.moveTo(x0, 2 + Math.sin(t + k) * 0.8);
    ctx.lineTo(x0 - w, 3 + k * 0.6);
    ctx.stroke();
  }
}

const NPC_HULL_LEN = { rowboat: 70, trawler: 156, steamer: 232, skiff: 90 };

function drawNpcBoats(surfaceY) {
  const t = performance.now() / 1000;
  const night = 1 - getDaylightFactor();
  const tint = getFogTint();
  const fog = getFogDensity();
  const span = canvas.width + 700;

  npcBoats.forEach((b) => {
    b.x += b.speed * b.dir * frameDt;
    let sx = (b.x - camera.x * b.parallax) % span;
    if (sx < 0) sx += span;
    sx -= 350;
    const len = NPC_HULL_LEN[b.model] * b.scale;
    if (sx < -len || sx > canvas.width + len) return;

    // Far boats dissolve into the fog; at night they turn into silhouettes
    npcHaze = {
      r: tint.r, g: tint.g, b: tint.b,
      k: Math.min(0.88, (1 - b.depth) * 0.45 + fog * 0.35 + night * 0.2)
    };

    const bob = Math.sin(t * 1.4 + b.phase) * 1.6 * b.scale * 2;
    const roll = Math.sin(t * 1.1 + b.phase * 1.3) * 0.025;
    ctx.save();
    ctx.translate(sx, surfaceY + 2 + bob);
    ctx.rotate(roll);
    ctx.scale(b.scale * b.dir, b.scale);
    drawNpcWake(NPC_HULL_LEN[b.model], b.speed / 15, 0.12 + b.depth * 0.12);
    NPC_DRAWERS[b.model](t + b.phase, night);
    ctx.restore();
  });
}

// =====================================================================
// WORLD PROMPTS
// =====================================================================

// Context prompts float above the boat on a small dark plate, drawn last so the
// boat never covers them. The oil rig and lighthouse used to have no prompt at all.
function drawWorldPrompts(surfaceY) {
  if (fishingMode || detektorMode || rechargeMinigameActive || dockActive || dialogueActive || gameOver) return;
  const prompts = [];
  if (getBubbleNearPlayer()) prompts.push(["SPACE", "začít rybařit", "255,245,230"]);
  if (getDetektorSpotNearPlayer()) prompts.push(["F", "detektor / hledání pokladu", "180,230,210"]);
  if (getNearDock()) prompts.push(["E", "zakotvit v přístavu", "255,230,160"]);
  else if (getNearOilRig()) prompts.push(["E", "ropná věž — vylepšení lodi", "255,210,140"]);
  else if (getNearLighthouse()) prompts.push(["E", "maják — vylepšení prutu", "255,230,160"]);
  if (!prompts.length) return;

  ctx.save();
  ctx.textBaseline = "middle";
  let y = surfaceY - 108;
  prompts.forEach(([key, label, rgb]) => {
    ctx.font = "700 11px ui-monospace, monospace";
    const kw = ctx.measureText(key).width + 12;
    ctx.font = "600 15px Georgia, serif";
    const lw = ctx.measureText(label).width;
    const w = kw + lw + 40;
    const x = canvas.width / 2 - w / 2;

    ctx.fillStyle = "rgba(5,8,10,0.62)";
    ctx.strokeStyle = `rgba(${rgb},0.3)`;
    ctx.lineWidth = 1;
    gaugeRoundRect(ctx, x, y - 14, w, 28, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = `rgba(${rgb},0.14)`;
    ctx.strokeStyle = `rgba(${rgb},0.6)`;
    gaugeRoundRect(ctx, x + 10, y - 9, kw, 18, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = `rgba(${rgb},0.95)`;
    ctx.font = "700 11px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(key, x + 10 + kw / 2, y + 0.5);
    ctx.font = "600 15px Georgia, serif";
    ctx.textAlign = "left";
    ctx.fillText(label, x + kw + 20, y + 1);
    y -= 34;
  });
  ctx.restore();
}

// =====================================================================
// PROGRESSION — cargo space, fishing-spot stocks, discovery, journal,
// route map and saving.
// =====================================================================

const SPOT_MAX_STOCK = 3;
const SPOT_REGEN_SECONDS = 90;        // an emptied spot gets a fish back every ~1.5 min
const DISCOVER_RADIUS = 700;          // spots appear on the route map once you sail this close
const SAVE_KEY = "deep-awakes-save-v1";
const AUTOSAVE_SECONDS = 15;
const RARITY_LABEL = { common: "Běžná", uncommon: "Neobvyklá", rare: "Vzácná", aberrant: "Abnormální" };

let activeFishingSpot = null;
let journalOpen = false;
let saveTimer = 0;

// The hold is a grid of 7 × (2 + hull level) cells; hull upgrades add rows
function getCargoCapacity() {
  return CARGO_COLS * getCargoRows();
}

function initSpotState() {
  bubbleSpots.forEach((b) => {
    b.stock = SPOT_MAX_STOCK;
    b.regen = 0;
    b.discovered = false;
  });
  detektorSpots.forEach((s) => { s.discovered = false; });
}

function updateSpots(dt) {
  bubbleSpots.forEach((b) => {
    if (b.stock < SPOT_MAX_STOCK) {
      b.regen += dt;
      if (b.regen >= SPOT_REGEN_SECONDS) {
        b.regen = 0;
        b.stock++;
      }
    }
    if (!b.discovered && Math.abs(b.wx - player.x) < DISCOVER_RADIUS) b.discovered = true;
  });
  detektorSpots.forEach((s) => {
    if (!s.discovered && Math.abs(s.wx - player.x) < DISCOVER_RADIUS * 0.6) s.discovered = true;
  });
}

function recordCatchInJournal(fish) {
  const entry = fishJournal[fish.id] || (fishJournal[fish.id] = { count: 0, best: 0 });
  entry.count++;
  entry.best = Math.max(entry.best, fish.weight || 0);
}

// --- Fish journal (J) ---

function fishZoneLabel(f) {
  return f.reefOnly ? "Krvavý útes" : f.oilOnly ? "Ropná věž" : "Otevřené moře";
}

function fishTimeLabel(f) {
  return f.timeOfDay === "night" ? "v noci" : f.timeOfDay === "day" ? "ve dne" : "kdykoli";
}

function drawJournalFish(cv, species, known) {
  const g = cv.getContext("2d");
  const W = 160, H = 70;
  g.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
  g.clearRect(0, 0, W, H);
  g.save();
  g.translate(W / 2, H / 2);
  g.scale(0.55, 0.55);
  const rgb = known ? fishHexToRgb(species.color || "#8aa6b5") : { r: 40, g: 46, b: 50 };
  (FISH_SHAPES[species.shape] || FISH_SHAPES.slim)(g, rgb, 0.8, 0);
  g.restore();
  if (!known) {
    // Unknown species: only a dark silhouette as a hint
    g.globalCompositeOperation = "source-atop";
    g.fillStyle = "rgba(62,70,76,0.95)";
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "source-over";
  }
}

function renderJournal() {
  const grid = document.getElementById("journal-grid");
  if (!grid) return;
  grid.innerHTML = "";
  let found = 0;
  FISH_SPECIES.forEach((f) => {
    const e = fishJournal[f.id];
    if (e) found++;
    const card = document.createElement("div");
    card.className = "journal-card " + (e ? `rarity-${f.rarity}` : "unknown");
    if (e) card.title = f.desc || "";

    const cv = document.createElement("canvas");
    cv.width = 320;
    cv.height = 140;
    drawJournalFish(cv, f, !!e);
    card.appendChild(cv);

    const name = document.createElement("div");
    name.className = "journal-name";
    name.textContent = e ? f.name : "???";
    card.appendChild(name);

    const meta = document.createElement("div");
    meta.className = "journal-meta";
    meta.textContent = (e ? RARITY_LABEL[f.rarity] + " · " : "") + fishZoneLabel(f) + " · " + fishTimeLabel(f);
    card.appendChild(meta);

    const stats = document.createElement("div");
    stats.className = "journal-stats";
    stats.textContent = e ? `Uloveno ${e.count}× · rekord ${formatKg(e.best)}` : "Zatím neuloveno";
    card.appendChild(stats);

    grid.appendChild(card);
  });
  const prog = document.getElementById("journal-progress");
  if (prog) prog.textContent = `${found} / ${FISH_SPECIES.length} druhů`;
}

function toggleJournal(force) {
  const ui = document.getElementById("journal-ui");
  if (!ui) return;
  journalOpen = typeof force === "boolean" ? force : !journalOpen;
  if (journalOpen) renderJournal();
  ui.classList.toggle("hidden", !journalOpen);
  ui.setAttribute("aria-hidden", journalOpen ? "false" : "true");
}

// --- Route map under the clock ---

function drawRouteMap() {
  const W = Math.min(520, canvas.width * 0.42);
  const H = 18;
  const x0 = (canvas.width - W) / 2;
  const y0 = 104;
  const half = worldWidth / 2;
  const toX = (wx) => x0 + ((wx + half) / worldWidth) * W;
  const mid = y0 + H / 2;
  const t = performance.now() * 0.001;

  ctx.save();
  ctx.fillStyle = "rgba(6,8,10,0.55)";
  ctx.strokeStyle = "rgba(160,130,90,0.35)";
  ctx.lineWidth = 1;
  gaugeRoundRect(ctx, x0 - 10, y0 - 4, W + 20, H + 8, 5);
  ctx.fill();
  ctx.stroke();

  // Open water, darker toward the deep ends of the world
  ctx.strokeStyle = "rgba(120,170,170,0.35)";
  ctx.beginPath();
  ctx.moveTo(x0, mid);
  ctx.lineTo(x0 + W, mid);
  ctx.stroke();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(x0, y0, toX(-worldWidth * 0.3) - x0, H);
  ctx.fillRect(toX(worldWidth * 0.3), y0, x0 + W - toX(worldWidth * 0.3), H);

  // Reef and oil rig zones
  ctx.fillStyle = "rgba(210,50,90,0.35)";
  ctx.fillRect(toX(REEF_WX_START), y0 + 3, toX(REEF_WX_END) - toX(REEF_WX_START), H - 6);
  ctx.fillStyle = "rgba(230,160,50,0.22)";
  ctx.fillRect(toX(OILRIG_WX_START), y0 + 3, toX(OILRIG_WX_END) - toX(OILRIG_WX_START), H - 6);

  // Discovered fishing spots: bright while they still hold fish
  bubbleSpots.forEach((b) => {
    if (!b.discovered) return;
    ctx.fillStyle = b.stock > 0 ? "rgba(200,232,255,0.8)" : "rgba(200,232,255,0.18)";
    ctx.beginPath();
    ctx.arc(toX(b.wx), mid, 1.6, 0, Math.PI * 2);
    ctx.fill();
  });

  // Discovered relic sites: gold diamonds, dim once raised
  detektorSpots.forEach((s) => {
    if (!s.discovered) return;
    const x = toX(s.wx);
    ctx.fillStyle = s.taken ? "rgba(140,120,80,0.35)" : `rgba(255,205,90,${0.75 + 0.25 * Math.sin(t * 3)})`;
    ctx.beginPath();
    ctx.moveTo(x, mid - 5);
    ctx.lineTo(x + 3.5, mid);
    ctx.lineTo(x, mid + 5);
    ctx.lineTo(x - 3.5, mid);
    ctx.closePath();
    ctx.fill();
  });

  // Landmarks: harbour, lighthouse (blinking), oil rig
  const hx = toX(HARBOUR_WX);
  ctx.fillStyle = "#e8c070";
  ctx.fillRect(hx - 3, mid - 3, 6, 6);
  const lx = toX(LIGHTHOUSE_WX);
  ctx.fillStyle = "#f2efe6";
  ctx.fillRect(lx - 1.5, mid - 7, 3, 10);
  ctx.fillStyle = `rgba(255,240,180,${0.5 + 0.5 * Math.max(0, Math.sin(t * 2.4))})`;
  ctx.beginPath();
  ctx.arc(lx, mid - 7, 2.5, 0, Math.PI * 2);
  ctx.fill();
  const ox = toX(OILRIG_WX);
  ctx.strokeStyle = "#e0a040";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(ox - 4, mid + 5);
  ctx.lineTo(ox, mid - 6);
  ctx.lineTo(ox + 4, mid + 5);
  ctx.moveTo(ox - 5, mid - 1);
  ctx.lineTo(ox + 5, mid - 1);
  ctx.stroke();

  // The boat, pointing the way it faces
  const px = toX(player.x);
  const dir = boatFacing < 0 ? -1 : 1;
  ctx.fillStyle = "#ff7a5a";
  ctx.shadowColor = "rgba(255,120,90,0.8)";
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(px + dir * 6, mid);
  ctx.lineTo(px - dir * 4, mid - 4.5);
  ctx.lineTo(px - dir * 4, mid + 4.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// --- Saving: autosave every few seconds, on docking, selling and leaving the page ---

function saveGame() {
  if (gameOver) return;
  const data = {
    v: 1,
    gold,
    inventory: inventory.map((f) => ({ id: f.id, weight: f.weight, caughtAt: f.caughtAt, gx: f.gx, gy: f.gy, rot: f.rot })),
    hullDamage,
    contracts,
    upgrades: { ...upgrades },
    rodUpgrades: { ...rodUpgrades },
    battery,
    headlightOn,
    relicsFound,
    gameWon,
    detektor: detektorSpots.map((s) => ({ wx: s.wx, taken: s.taken, discovered: s.discovered })),
    spots: bubbleSpots.map((b) => ({ stock: b.stock, discovered: b.discovered })),
    gameTime,
    dayNum,
    danger,
    playerX: player.x,
    kitLeft: batteryRechargesLeft,
    journal: fishJournal,
    firstFishCaught,
    dangerThresh3
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) {
    // storage full or blocked — the game keeps running without saving
  }
}

function loadGame() {
  let data = null;
  try {
    data = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
  } catch (e) {
    data = null;
  }
  if (!data || data.v !== 1) return false;

  gold = Math.max(0, data.gold | 0);
  Object.assign(upgrades, data.upgrades || {});
  Object.assign(rodUpgrades, data.rodUpgrades || {});
  // The hold needs the hull level first; fish without a saved spot (older saves) are packed in
  inventory = [];
  (data.inventory || []).forEach((it) => {
    const sp = FISH_SPECIES.find((f) => f.id === it.id);
    if (!sp) return;
    const f = makeCaughtFish(sp, it.weight);
    f.caughtAt = it.caughtAt;
    const rot = it.rot ? 1 : 0;
    if (Number.isInteger(it.gx) && Number.isInteger(it.gy) && cargoFits(f, it.gx, it.gy, rot, null)) {
      Object.assign(f, { gx: it.gx, gy: it.gy, rot });
      inventory.push(f);
    } else {
      placeInHold(f);
    }
  });
  caughtFish = inventory.length;
  hullDamage = Math.max(0, Math.min(HULL_SLOTS, data.hullDamage | 0));
  player.speed = 2.8 + (upgrades.engine - 1) * 0.9;
  battery = Math.max(0, Math.min(BATTERY_MAX, Number(data.battery) || BATTERY_MAX));
  headlightOn = data.headlightOn !== false;
  relicsFound = data.relicsFound | 0;
  gameWon = !!data.gameWon;
  if (Array.isArray(data.detektor) && data.detektor.length === detektorSpots.length) {
    data.detektor.forEach((d, i) => {
      detektorSpots[i].wx = d.wx;
      detektorSpots[i].taken = !!d.taken;
      detektorSpots[i].discovered = !!d.discovered;
    });
  }
  if (Array.isArray(data.spots)) {
    data.spots.forEach((st, i) => {
      if (!bubbleSpots[i]) return;
      bubbleSpots[i].stock = Math.max(0, Math.min(SPOT_MAX_STOCK, st.stock | 0));
      bubbleSpots[i].discovered = !!st.discovered;
    });
  }
  gameTime = Number(data.gameTime) || 7.75;
  dayNum = data.dayNum | 0 || 1;
  // A reload never drops you straight back into the jaws of madness
  danger = Math.min(8, Math.max(0, Number(data.danger) || 0));
  player.x = Number(data.playerX) || START_X;
  camera.x = player.x - canvas.width / 2;
  batteryRechargesLeft = data.kitLeft | 0;
  fishJournal = data.journal || {};
  contracts = Array.isArray(data.contracts) ? data.contracts.filter((c) => speciesById(c.speciesId)) : [];
  ensureContracts();
  firstFishCaught = !!data.firstFishCaught;
  dangerThresh3 = !!data.dangerThresh3;

  if (goldUI) goldUI.innerText = gold;
  if (fishUI) fishUI.innerText = caughtFish;
  if (dangerUI) dangerUI.innerText = Math.round(danger);
  syncRelicsHud();
  updateInventoryUI();
  return true;
}

function startNewGame() {
  if (!window.confirm("Opravdu začít novou hru? Uložený postup se smaže.")) return;
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {
    // nothing to remove
  }
  window.removeEventListener("beforeunload", saveGame);
  window.location.reload();
}

window.addEventListener("beforeunload", saveGame);

// =====================================================================
// GAMEPLAY PRESSURE — freshness of the catch, harbour contracts,
// attacks from the deep, the lighthouse as a sanctuary, toasts.
// =====================================================================

// Fish keep their full price for a while, then go stale, then rot (in game hours)
const FRESH_HOURS = 10;
const STALE_HOURS = 20;
const STALE_MULT = 0.65;
const ROTTEN_MULT = 0.25;
const CONTRACT_SLOTS = 3;
const LIGHTHOUSE_SAFE_RADIUS = 600;

let contracts = [];          // { speciesId, count, done, reward }
const HULL_SLOTS = 3;
const HULL_SLOWDOWN = 0.12;          // speed lost per damaged slot
const HULL_REPAIR_COST = 40;         // per damaged slot, at the harbour
let hullDamage = 0;                  // 0..HULL_SLOTS — hits from the deep that were not shrugged off
let attackTimer = 30;        // seconds until the deep may strike again
let attackFlash = 0;         // red flash after a hit, 1 → 0
let freshnessTimer = 0;

function absoluteHours() {
  return dayNum * 24 + gameTime;
}

function fishAgeHours(f) {
  return f.caughtAt == null ? 0 : Math.max(0, absoluteHours() - f.caughtAt);
}

function fishFreshness(f) {
  const age = fishAgeHours(f);
  if (age < FRESH_HOURS) return { key: "fresh", label: "Čerstvá", mult: 1 };
  if (age < STALE_HOURS) return { key: "stale", label: "Odležená", mult: STALE_MULT };
  return { key: "rotten", label: "Zkažená", mult: ROTTEN_MULT };
}

// What a fish in the hold sells for right now
function fishValue(f) {
  return Math.max(1, Math.round(f.price * fishFreshness(f).mult));
}

// Warn once per fish when the hold starts to smell
function updateFreshness(dt) {
  freshnessTimer += dt;
  if (freshnessTimer < 1) return;
  freshnessTimer = 0;
  let turned = 0;
  inventory.forEach((f) => {
    const k = fishFreshness(f).key;
    if (k !== "fresh" && f.lastFreshness !== k) {
      f.lastFreshness = k;
      turned++;
    }
  });
  if (turned > 0) {
    showToast("Úlovek v podpalubí ztrácí čerstvost — prodej ho v přístavu.", "230,190,110");
    if (inventoryOpen) updateInventoryUI();
  }
}

// --- Harbour contracts ---

function speciesAvgPrice(sp) {
  const [lo, hi] = sp.weight || [1, 2];
  return ((lo + hi) / 2) * FISH_PRICE_PER_KG * (sp.priceMult || 1);
}

function makeContract() {
  const taken = new Set(contracts.map((c) => c.speciesId));
  // Mostly everyday catches, sometimes something rarer
  const roll = Math.random();
  const rarity = roll < 0.5 ? "common" : roll < 0.85 ? "uncommon" : "rare";
  let pool = FISH_SPECIES.filter((f) => f.rarity === rarity && !taken.has(f.id));
  if (!pool.length) pool = FISH_SPECIES.filter((f) => f.rarity !== "aberrant" && !taken.has(f.id));
  const sp = pool[Math.floor(Math.random() * pool.length)];
  const count = rarity === "rare" ? 1 : 1 + Math.floor(Math.random() * 3);
  const reward = Math.round((speciesAvgPrice(sp) * count * 1.6 + 20) / 5) * 5;
  return { speciesId: sp.id, count, done: 0, reward };
}

function ensureContracts() {
  while (contracts.length < CONTRACT_SLOTS) contracts.push(makeContract());
}

function speciesById(id) {
  return FISH_SPECIES.find((f) => f.id === id);
}

function renderContracts() {
  const list = document.getElementById("contracts-list");
  if (!list) return;
  ensureContracts();
  list.innerHTML = "";
  contracts.forEach((c) => {
    const sp = speciesById(c.speciesId);
    if (!sp) return;
    const have = inventory.filter((f) => f.id === c.speciesId).length;
    const row = document.createElement("div");
    row.className = "contract-row" + (have + c.done >= c.count ? " ready" : "");
    const where = sp.reefOnly ? "útes" : sp.oilOnly ? "ropná věž" : "moře";
    const when = sp.timeOfDay === "night" ? ", v noci" : sp.timeOfDay === "day" ? ", ve dne" : "";
    row.innerHTML = `
      <span class="contract-name">${sp.name}</span>
      <span class="contract-meta">${where}${when}</span>
      <span class="contract-progress">${Math.min(c.count, c.done + have)} / ${c.count}</span>
      <span class="contract-reward">+$${c.reward}</span>`;
    list.appendChild(row);
  });
}

// Selling counts toward contracts; returns the bonus earned
function settleContracts(sold) {
  let bonus = 0;
  const finished = [];
  contracts.forEach((c) => {
    const matching = sold.filter((f) => f.id === c.speciesId).length;
    c.done = Math.min(c.count, c.done + matching);
    if (c.done >= c.count) {
      bonus += c.reward;
      finished.push(c);
    }
  });
  if (finished.length) {
    contracts = contracts.filter((c) => !finished.includes(c));
    ensureContracts();
    const names = finished.map((c) => speciesById(c.speciesId).name).join(", ");
    showToast(`Zakázka splněna: ${names} (+$${bonus})`, "140,230,160");
  }
  return bonus;
}

// --- Attacks from the deep ---

function updateAttacks(dt) {
  attackFlash = Math.max(0, attackFlash - dt * 1.6);
  if (danger < 8 || (gameWon && danger < 10)) {
    attackTimer = Math.max(attackTimer, 18);
    return;
  }
  attackTimer -= dt;
  if (attackTimer > 0) return;
  attackTimer = 25 + Math.random() * 25 - (danger - 8) * 3;

  // The headlight keeps it at a distance half of the time
  if (headlight.on && Math.random() < 0.5) {
    showToast("Ve světle se cosi mihlo a zmizelo v hlubině…", "190,215,255");
    return;
  }

  triggerScreenShake(18);
  attackFlash = 1;
  playThud();

  // A stronger hull shrugs some hits off
  if (Math.random() < (upgrades.hull - 1) * 0.18) {
    showToast("Něco udeřilo do trupu — ale trup vydržel.", "230,190,110");
    return;
  }
  hullDamage = Math.min(HULL_SLOTS, hullDamage + 1);
  if (hullDamage === HULL_SLOTS) showToast("Trup je v troskách — loď zpomalila. Oprav ho v přístavu.", "255,150,90");
  if (inventory.length) {
    const idx = Math.floor(Math.random() * inventory.length);
    const lost = inventory.splice(idx, 1)[0];
    caughtFish = inventory.length;
    if (fishUI) fishUI.innerText = caughtFish;
    updateInventoryUI();
    showToast(`Něco udeřilo do trupu! Z podpalubí zmizela ${lost.name}.`, "255,110,100");
  } else {
    addDanger(1);
    showToast("Něco udeřilo do trupu… a pak bylo ticho.", "255,110,100");
  }
}

function drawAttackFlash() {
  if (attackFlash <= 0) return;
  const v = ctx.createRadialGradient(
    canvas.width / 2, canvas.height / 2, canvas.height * 0.2,
    canvas.width / 2, canvas.height / 2, canvas.height * 0.8
  );
  v.addColorStop(0, "rgba(120,0,10,0)");
  v.addColorStop(1, `rgba(150,0,20,${attackFlash * 0.55})`);
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function playThud() {
  sfxTone(70, { to: 38, dur: 0.6, gain: 0.3 });
  sfxNoise({ filter: "lowpass", freq: 300, to: 80, dur: 0.7, gain: 0.25 });
}

function nearLighthouse() {
  return Math.abs(player.x - LIGHTHOUSE_WX) < LIGHTHOUSE_SAFE_RADIUS;
}

// --- Toasts: short messages that don't pause the game ---

function showToast(text, rgb = "230,220,200") {
  const stack = document.getElementById("toast-stack");
  if (!stack) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.style.setProperty("--toast", rgb);
  el.textContent = text;
  stack.appendChild(el);
  while (stack.children.length > 3) stack.removeChild(stack.firstChild);
  setTimeout(() => el.classList.add("out"), 3200);
  setTimeout(() => el.remove(), 3800);
}

// =====================================================================
// OPEN-SEA REEFS — rock spires crowned with corals along the whole sea.
// Drawn "as lit": the darkness pass hides them until the headlight reaches
// them, and some corals glow faintly on their own. A better light upgrade
// shows more of the taller spires.
// =====================================================================

const SEA_REEF_CELL = 420;
const CORAL_COLORS = [
  { h: 340, glow: "255,90,150" },
  { h: 18,  glow: "255,140,70" },
  { h: 300, glow: "225,90,235" },
  { h: 170, glow: "70,240,200" },
  { h: 48,  glow: "255,205,80" },
  { h: 205, glow: "90,170,255" }
];

function seabedYAt(wx) {
  const roll =
    Math.sin(wx * 0.003) * 50 +
    Math.sin(wx * 0.01) * 25 +
    Math.sin(wx * 0.025) * 10 +
    hash(Math.floor(wx / 50)) * 16;
  return canvas.height - 55 - roll;
}

function drawBranchCoral(x, y, s, hue, t, seed) {
  ctx.lineCap = "round";
  const n = 4 + Math.floor(hash(seed) * 3);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * 1.5;
    const len = s * (0.65 + hash(seed + i * 3) * 0.5);
    const sway = Math.sin(t * 0.8 + seed + i) * 2.5;
    const mx = x + Math.cos(a) * len * 0.5 + sway * 0.5;
    const my = y + Math.sin(a) * len * 0.5;
    const ex = x + Math.cos(a) * len + sway;
    const ey = y + Math.sin(a) * len;
    ctx.strokeStyle = `hsl(${hue},62%,44%)`;
    ctx.lineWidth = Math.max(2, s * 0.13);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(mx, my, ex, ey);
    ctx.stroke();
    // tip branches and glowing polyps
    for (let k = -1; k <= 1; k += 2) {
      const bx = ex + Math.cos(a + k * 0.7) * len * 0.35;
      const by = ey + Math.sin(a + k * 0.7) * len * 0.35;
      ctx.lineWidth = Math.max(1.4, s * 0.08);
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.fillStyle = `hsl(${hue},85%,72%)`;
      ctx.beginPath();
      ctx.arc(bx, by, Math.max(1.5, s * 0.07), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawFanCoral(x, y, s, hue, t, seed) {
  const sway = Math.sin(t * 0.7 + seed) * 0.08;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(sway);
  ctx.strokeStyle = `hsl(${hue},50%,34%)`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -s * 0.35);
  ctx.stroke();
  ctx.fillStyle = `hsla(${hue},65%,50%,0.55)`;
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.75, s * 0.62, s * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `hsla(${hue},80%,70%,0.8)`;
  ctx.lineWidth = 1;
  for (let i = -5; i <= 5; i++) {
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.3);
    ctx.lineTo(i * s * 0.12, -s * 1.22 + Math.abs(i) * s * 0.05);
    ctx.stroke();
  }
  ctx.beginPath();
  for (let i = -3; i <= 3; i++) ctx.moveTo(-s * 0.55, -s * (0.55 + i * 0.09)), ctx.lineTo(s * 0.55, -s * (0.55 + i * 0.09));
  ctx.stroke();
  ctx.restore();
}

function drawTubeCoral(x, y, s, hue, t, seed) {
  const n = 3 + Math.floor(hash(seed) * 3);
  for (let i = 0; i < n; i++) {
    const tx = x + (i - (n - 1) / 2) * s * 0.3;
    const h = s * (0.55 + hash(seed + i * 7) * 0.7);
    const w = s * 0.16;
    const grad = ctx.createLinearGradient(tx - w, 0, tx + w, 0);
    grad.addColorStop(0, `hsl(${hue},55%,30%)`);
    grad.addColorStop(0.5, `hsl(${hue},68%,52%)`);
    grad.addColorStop(1, `hsl(${hue},55%,28%)`);
    ctx.fillStyle = grad;
    ctx.fillRect(tx - w, y - h, w * 2, h);
    ctx.fillStyle = "rgba(10,6,16,0.9)";
    ctx.beginPath();
    ctx.ellipse(tx, y - h, w, w * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    // a puff of tiny bubbles now and then
    const bub = (t * 0.4 + seed + i) % 1;
    ctx.fillStyle = `hsla(${hue},80%,85%,${0.5 * (1 - bub)})`;
    ctx.beginPath();
    ctx.arc(tx + Math.sin(bub * 9 + i) * 2, y - h - bub * 26, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBrainCoral(x, y, s, hue, t, seed) {
  const g = ctx.createRadialGradient(x - s * 0.15, y - s * 0.3, 1, x, y - s * 0.2, s * 0.65);
  g.addColorStop(0, `hsl(${hue},60%,64%)`);
  g.addColorStop(1, `hsl(${hue},58%,32%)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y - s * 0.15, s * 0.6, s * 0.46, 0, Math.PI, 0);
  ctx.fill();
  ctx.strokeStyle = `hsla(${hue},55%,22%,0.7)`;
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(x + (i - 1.5) * s * 0.2, y - s * 0.15, s * (0.25 + i * 0.05), Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
  }
}

function drawReefAnemone(x, y, s, hue, t, seed) {
  ctx.lineCap = "round";
  for (let i = -3; i <= 3; i++) {
    const sway = Math.sin(t * 1.4 + seed + i) * 3;
    ctx.strokeStyle = `hsl(${hue},75%,${55 + (i % 2) * 10}%)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + i * 2.5, y);
    ctx.quadraticCurveTo(x + i * 4 + sway, y - s * 0.5, x + i * 6 + sway * 1.6, y - s * (0.8 + hash(seed + i) * 0.3));
    ctx.stroke();
  }
  ctx.fillStyle = `hsl(${hue},50%,30%)`;
  ctx.beginPath();
  ctx.ellipse(x, y, 9, 4, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawRockPillar(px, baseY, w, h, seed) {
  const topY = baseY - h;
  const j = (k) => (hash(seed + k * 3.7) - 0.5);
  const pts = [
    [px - w * 0.62, baseY + 6],
    [px - w * 0.5 + j(1) * 8, baseY - h * 0.35],
    [px - w * 0.36 + j(2) * 8, topY + h * 0.2],
    [px - w * 0.2 + j(3) * 10, topY + j(4) * 14],
    [px + w * 0.05 + j(5) * 10, topY - 6 + j(6) * 12],
    [px + w * 0.28 + j(7) * 10, topY + 8 + j(8) * 12],
    [px + w * 0.4 + j(9) * 8, topY + h * 0.3],
    [px + w * 0.52 + j(10) * 8, baseY - h * 0.3],
    [px + w * 0.66, baseY + 6]
  ];
  const grad = ctx.createLinearGradient(px - w * 0.6, 0, px + w * 0.6, 0);
  grad.addColorStop(0, "#3e5a58");
  grad.addColorStop(0.45, "#2d4443");
  grad.addColorStop(1, "#16262a");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fill();

  // Lit upper-left edge and a few cracks
  ctx.strokeStyle = "rgba(150,190,180,0.35)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let i = 1; i <= 4; i++) i === 1 ? ctx.moveTo(pts[i][0], pts[i][1]) : ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
  ctx.strokeStyle = "rgba(5,12,14,0.5)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const cy = topY + h * (0.3 + i * 0.22);
    ctx.beginPath();
    ctx.moveTo(px - w * 0.3 + j(i + 20) * 10, cy);
    ctx.lineTo(px + w * 0.1 + j(i + 30) * 14, cy + 6 + j(i + 40) * 10);
    ctx.stroke();
  }
  return { topY, topX: px, topW: w * 0.5, ledgeY: topY + 6 };
}

function drawReefFormation(wx0, cell, surfaceY, t) {
  const waterH = canvas.height - surfaceY;
  const n = 2 + Math.floor(hash(cell * 3.3) * 3);
  const crowns = [];
  for (let i = 0; i < n; i++) {
    const px = wx0 + (i - (n - 1) / 2) * 74 + (hash(cell * 17 + i) - 0.5) * 30;
    const w = 40 + hash(cell * 5 + i * 9) * 52;
    const h = waterH * (0.16 + hash(cell * 11 + i * 4) * 0.36);
    const sx = px - camera.x;
    const baseY = seabedYAt(px) + 8;
    crowns.push({ sx, baseY, w, h, i, rock: drawRockPillar(sx, baseY, w, h, cell * 7 + i) });
  }

  // Corals on the crowns and ledges, anemones and kelp at the foot
  crowns.forEach((c, ci) => {
    const count = 2 + Math.floor(hash(cell * 19 + c.i) * 3);
    for (let k = 0; k < count; k++) {
      const seed = cell * 100 + c.i * 10 + k;
      const col = CORAL_COLORS[Math.floor(hash(seed * 1.7) * CORAL_COLORS.length)];
      const kind = Math.floor(hash(seed * 2.3) * 4);
      const onTop = k === 0;
      const cx = c.sx + (onTop ? 0 : (hash(seed * 3.1) - 0.5) * c.w * 0.7);
      const cy = onTop ? c.rock.topY + 4 : c.baseY - c.h * (0.25 + hash(seed * 4.1) * 0.5);
      const s = 18 + hash(seed * 5.3) * 22;
      if (kind === 0) drawBranchCoral(cx, cy, s, col.h, t, seed);
      else if (kind === 1) drawFanCoral(cx, cy, s, col.h, t, seed);
      else if (kind === 2) drawTubeCoral(cx, cy, s, col.h, t, seed);
      else drawBrainCoral(cx, cy, s, col.h, t, seed);
      // Roughly a third of them glow faintly, so a reef can be spotted from afar
      if (hash(seed * 6.7) > 0.62) addGlow(cx, cy - s * 0.5, 34 + s, 0.16, col.glow);
    }
    // foot: anemones and swaying kelp
    for (let k = 0; k < 2; k++) {
      const seed = cell * 50 + c.i * 5 + k;
      const col = CORAL_COLORS[Math.floor(hash(seed * 0.9) * CORAL_COLORS.length)];
      drawReefAnemone(c.sx + (k ? 1 : -1) * c.w * 0.55, c.baseY + 2, 16 + hash(seed) * 8, col.h, t, seed);
    }
    ctx.strokeStyle = "rgba(24,70,40,0.9)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (let k = 0; k < 3; k++) {
      const kx = c.sx - c.w * 0.7 + k * 7;
      ctx.beginPath();
      ctx.moveTo(kx, c.baseY + 3);
      ctx.bezierCurveTo(
        kx + Math.sin(t + k + ci) * 8, c.baseY - 34,
        kx - Math.sin(t * 0.8 + k) * 9, c.baseY - 68,
        kx + Math.sin(t * 0.9 + k * 2) * 11, c.baseY - 100 - k * 12
      );
      ctx.stroke();
    }
  });
}

function drawSeaReefs(surfaceY) {
  const t = performance.now() * 0.001;
  const first = Math.floor((camera.x - 260) / SEA_REEF_CELL);
  const last = Math.floor((camera.x + canvas.width + 260) / SEA_REEF_CELL);
  for (let c = first; c <= last; c++) {
    if (hash(c * 13.7 + 5) < 0.3) continue;
    const wx0 = c * SEA_REEF_CELL + 120 + hash(c * 7.1 + 1) * 160;
    // the dedicated coral reef zone, the oil rig, the harbour and the cliff keep their own look
    if (wx0 > REEF_WX_START - 200 && wx0 < REEF_WX_END + 200) continue;
    if (Math.abs(wx0 - OILRIG_WX) < 320 || Math.abs(wx0 - HARBOUR_WX) < 300 || Math.abs(wx0 - LIGHTHOUSE_WX) < 380) continue;
    drawReefFormation(wx0, c, surfaceY, t);
  }
}

// =====================================================================
// LIVELIER BACKGROUND — mountains with a snow line, horizon glow, sun
// rays, a glittering path of the sun/moon on the water, reflections of
// shore lights, channel buoys and a drifting flock of birds.
// =====================================================================

const shoreLights = [];     // { x, a, rgb } collected while drawing, reflected on the water afterwards
const HARBOUR_BUOYS = [
  { wx: 1650, red: true }, { wx: 1950, red: false }, { wx: 2250, red: true },
  { wx: 3150, red: false }, { wx: 3450, red: true }, { wx: 3750, red: false },
  { wx: -600, red: true }, { wx: -1100, red: false }
];

function mixRgb(a, b, k) {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`;
}

// Where the sun or moon stands: gameTime 0 = midnight, 12 = noon, arcing left → right
function getCelestial(surfaceY) {
  const angle = ((gameTime / 24) * Math.PI * 2) - Math.PI * 0.5;
  return {
    x: canvas.width * 0.5 + Math.cos(angle) * canvas.width * 0.42,
    y: surfaceY * 0.5 - Math.sin(angle) * surfaceY * 0.72
  };
}

function drawMountains(surfaceY) {
  const day = getDaylightFactor();
  const sun = getSunsetWeight();
  const tint = getFogTint();
  const W = canvas.width;
  const tintArr = [tint.r, tint.g, tint.b];

  // Warm glow along the horizon at dawn and dusk
  const glow = ctx.createLinearGradient(0, surfaceY - 170, 0, surfaceY);
  glow.addColorStop(0, "rgba(255,150,90,0)");
  glow.addColorStop(1, `rgba(255,150,90,${0.3 * sun + 0.05 * day})`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, surfaceY - 170, W, 170);

  const ranges = [
    { par: 0.025, base: 92, amp: 150, off: 1.3, dark: [24, 34, 52], mix: 0.55, snow: true },
    { par: 0.06, base: 62, amp: 96, off: 4.1, dark: [14, 22, 32], mix: 0.38, snow: false }
  ];
  ranges.forEach((rg) => {
    const pts = [];
    for (let x = -10; x <= W + 10; x += 8) {
      const wx = x + camera.x * rg.par;
      const ridged = Math.pow(1 - Math.abs(Math.sin(wx * 0.0021 + rg.off)), 1.7);
      const n = ridged * rg.amp * 0.72 + Math.sin(wx * 0.0063 + rg.off * 2) * rg.amp * 0.16 + Math.sin(wx * 0.017) * rg.amp * 0.05;
      pts.push([x, surfaceY - rg.base - n]);
    }
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(-10, surfaceY + 2);
      pts.forEach(([x, y]) => ctx.lineTo(x, y));
      ctx.lineTo(W + 10, surfaceY + 2);
      ctx.closePath();
    };
    const topY = surfaceY - rg.base - rg.amp * 0.85;
    const body = ctx.createLinearGradient(0, topY, 0, surfaceY);
    body.addColorStop(0, mixRgb(rg.dark, tintArr, rg.mix));
    body.addColorStop(1, mixRgb(rg.dark, tintArr, Math.min(0.92, rg.mix + 0.4)));
    path();
    ctx.fillStyle = body;
    ctx.fill();

    // Snow near the summits when the sun is up, tinted warm at dawn and dusk
    if (rg.snow && day > 0.25) {
      ctx.save();
      path();
      ctx.clip();
      const snow = ctx.createLinearGradient(0, topY, 0, topY + 62);
      const a = Math.min(0.55, (day - 0.25) * 0.9);
      snow.addColorStop(0, `rgba(${sun > 0.2 ? "255,215,190" : "235,242,250"},${a})`);
      snow.addColorStop(1, "rgba(235,242,250,0)");
      ctx.fillStyle = snow;
      ctx.fillRect(0, topY, W, 70);
      ctx.restore();
    }
  });
}

function drawSunRays(surfaceY) {
  const sun = getSunsetWeight();
  const day = getDaylightFactor();
  if (sun < 0.12 || day < 0.12) return;
  const b = getCelestial(surfaceY);
  if (b.y > surfaceY - 8) return;
  const t = performance.now() * 0.001;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.18 + i * 0.08) + Math.sin(t * 0.15 + i) * 0.03;
    const len = 520 + hash(i * 9) * 220;
    const spread = 0.035 + hash(i * 5) * 0.03;
    const rayA = (0.05 + 0.025 * Math.sin(t * 0.4 + i * 1.6)) * sun;
    const g = ctx.createLinearGradient(b.x, b.y, b.x + Math.cos(a) * len, b.y + Math.sin(a) * len);
    g.addColorStop(0, `rgba(255,190,120,${rayA})`);
    g.addColorStop(1, "rgba(255,190,120,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x + Math.cos(a - spread) * len, b.y + Math.sin(a - spread) * len);
    ctx.lineTo(b.x + Math.cos(a + spread) * len, b.y + Math.sin(a + spread) * len);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawBirdFlock(surfaceY) {
  const day = getDaylightFactor();
  if (day < 0.3) return;
  const t = performance.now() * 0.001;
  const W = canvas.width;
  const fx = ((t * 16 + 500) % (W + 700)) - 350;
  const fy = surfaceY * 0.3 + Math.sin(t * 0.2) * 18;
  ctx.save();
  ctx.strokeStyle = `rgba(20,24,30,${0.7 * Math.min(1, (day - 0.3) * 3)})`;
  ctx.lineWidth = 1.3;
  ctx.lineCap = "round";
  for (let i = 0; i < 9; i++) {
    const row = Math.ceil(i / 2);
    const side = i % 2 ? 1 : -1;
    const x = fx - row * 16;
    const y = fy + side * row * 8 + Math.sin(t * 1.1 + i) * 2;
    const flap = Math.sin(t * 6 + i * 0.8) * 4;
    ctx.beginPath();
    ctx.moveTo(x - 6, y - flap);
    ctx.quadraticCurveTo(x - 2, y - 3 - flap * 0.3, x, y);
    ctx.quadraticCurveTo(x + 2, y - 3 - flap * 0.3, x + 6, y - flap);
    ctx.stroke();
  }
  ctx.restore();
}

// Floating channel buoys; their lamps blink at night
function drawBuoys(surfaceY) {
  const t = performance.now() * 0.001;
  const day = getDaylightFactor();
  HARBOUR_BUOYS.forEach((bu, i) => {
    const sx = bu.wx - camera.x;
    if (sx < -30 || sx > canvas.width + 30) return;
    const bob = Math.sin(t * 1.5 + i * 1.7) * 2;
    const tilt = Math.sin(t * 1.1 + i) * 0.1;
    const y = surfaceY + 5 + bob;
    const col = bu.red ? ["#b2342a", "#e8584a", "255,70,60"] : ["#2a8a4a", "#58d088", "70,255,130"];
    ctx.save();
    ctx.translate(sx, y);
    ctx.rotate(tilt);
    ctx.fillStyle = col[0];
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(-3, -16);
    ctx.lineTo(3, -16);
    ctx.lineTo(6, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(240,240,235,0.85)";
    ctx.fillRect(-4.5, -9, 9, 2.5);
    ctx.fillStyle = "#1c1c1e";
    ctx.fillRect(-1, -22, 2, 6);
    const blinkOn = (t + i * 0.7) % 3.2 < 0.45;
    const lampA = blinkOn ? (1 - day * 0.5) : 0.12;
    ctx.fillStyle = `rgba(${col[2]},${lampA})`;
    ctx.beginPath();
    ctx.arc(0, -24, 3, 0, Math.PI * 2);
    ctx.fill();
    if (blinkOn) {
      const gl = ctx.createRadialGradient(0, -24, 0, 0, -24, 22);
      gl.addColorStop(0, `rgba(${col[2]},${0.5 * (1 - day * 0.6)})`);
      gl.addColorStop(1, `rgba(${col[2]},0)`);
      ctx.fillStyle = gl;
      ctx.fillRect(-22, -46, 44, 44);
    }
    ctx.restore();
    // water ring around the buoy
    ctx.strokeStyle = "rgba(200,225,235,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(sx, surfaceY + 4, 10 + Math.sin(t * 2 + i) * 1.5, 2, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (blinkOn && day < 0.85) shoreLights.push({ x: sx, a: 0.9 * (1 - day), rgb: col[2] });
  });
}

// Reflections of lights on the water: windows, buoys, lighthouse, oil rig and the boat's own lamps
function drawShoreReflections(surfaceY, screenBoatX) {
  const day = getDaylightFactor();
  const night = 1 - day;
  const t = performance.now() * 0.001;

  if (night > 0.2) {
    const lx = getLighthouseScreenX();
    shoreLights.push({ x: lx, a: 0.7 * night, rgb: "255,235,170" });
    shoreLights.push({ x: OILRIG_WX - camera.x, a: (Math.sin(t * 2) > 0 ? 0.9 : 0.25) * night, rgb: "255,70,60" });
  }
  shoreLights.push({ x: screenBoatX - 60 * boatFacing, a: 0.65 * (0.4 + night * 0.6), rgb: "255,200,110" });
  if (headlight.on) shoreLights.push({ x: screenBoatX + BOAT_LAMP_X * boatFacing, a: 0.55 * headlight.strength, rgb: "215,255,235" });

  ctx.save();
  shoreLights.forEach((l) => {
    if (l.a < 0.04 || l.x < -20 || l.x > canvas.width + 20) return;
    for (let j = 0; j < 22; j++) {
      const u = j / 22;
      const y = surfaceY + 3 + j * 2.4;
      const ww = 1.4 + u * 4;
      const wobble = Math.sin(t * 1.3 + j * 0.45 + l.x * 0.05) * (1 + u * 5);
      const shimmer = 0.7 + 0.3 * Math.sin(t * 1.9 + j * 0.7 + l.x);
      ctx.fillStyle = `rgba(${l.rgb},${l.a * (1 - u) * 0.38 * shimmer})`;
      ctx.fillRect(l.x + wobble - ww, y, ww * 2, 2.6);
    }
  });
  ctx.restore();
  shoreLights.length = 0;
}

// The sun's or moon's glittering path across the water
function drawGlitterPath(surfaceY) {
  const day = getDaylightFactor();
  const b = getCelestial(surfaceY);
  if (b.y > surfaceY - 6) return;
  const isSun = day > 0.12;
  const strength = isSun ? Math.min(1, day * 1.6) * 0.55 : Math.min(1, (1 - day) * 1.4) * 0.4;
  if (strength < 0.03) return;
  const t = performance.now() * 0.001;
  const rgb = isSun ? (getSunsetWeight() > 0.3 ? "255,190,120" : "255,236,170") : "205,220,255";
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let r = 0; r < 14; r++) {
    const u = r / 13;
    const y = surfaceY + 2 + Math.pow(u, 1.7) * 52;
    const spread = 12 + r * 9;
    const count = 3 + r;
    for (let k = 0; k < count; k++) {
      const x = b.x + (hash(r * 31 + k * 7) - 0.5) * 2 * spread;
      const flick = 0.5 + 0.5 * Math.sin(t * 2.4 + r * 3.1 + k * 5.3);
      const fk = Math.max(0, (flick - 0.3) / 0.7);
      if (fk <= 0) continue;
      ctx.fillStyle = `rgba(${rgb},${strength * fk * fk * (1 - Math.abs(x - b.x) / (spread * 1.3))})`;
      ctx.fillRect(x, y, 3 + r * 0.9, 1 + u * 1.2);
    }
  }
  ctx.restore();
}

// =====================================================================
// REALISTIC SKY — volumetric clouds generated once from noise and lit
// from above (bright billowing tops, darker bases), re-tinted as the time
// of day changes, drifting in three layers. Lightning lights them from
// inside; heavy clouds trail curtains of rain at night.
// =====================================================================

function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CLOUD_SPRITES = [];           // { a: density mask, l: sun-lit mask, t: tinted result, w, h }
const cloudField = [];              // cloud instances in the sky
const cloudScratch = document.createElement("canvas");
const cloudFlash = { idx: -1, v: 0, next: 8 };
let cloudTintKey = "";

function buildCloudSprite(kind, seed) {
  const rnd = makeRng(seed * 9973 + 17);
  const W = kind === "stratus" ? 360 : 260;
  const H = kind === "stratus" ? 64 : 112;

  // A cluster of soft blobs gives the overall form
  const blobs = [];
  if (kind === "stratus") {
    const n = 5 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      blobs.push({ x: W * (0.12 + 0.76 * rnd()), y: H * (0.45 + 0.15 * (rnd() - 0.5)), rx: W * (0.14 + 0.16 * rnd()), ry: H * (0.2 + 0.14 * rnd()) });
    }
  } else {
    const n = 6 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const u = 0.12 + 0.76 * rnd();
      const mid = 1 - Math.abs(u - 0.5) * 1.6;          // towers rise in the middle
      const r = H * (0.16 + 0.2 * rnd()) * (0.7 + 0.5 * mid);
      blobs.push({ x: W * u, y: H * 0.72 - r * (0.5 + 0.9 * rnd() * mid), rx: r * 1.15, ry: r });
    }
  }

  // Density = blobs × billowy noise; cumulus get a flat base
  const dens = new Float32Array(W * H);
  const vScale = kind === "stratus" ? 2 : 3.5;
  for (let y = 0; y < H; y++) {
    const baseFade = kind === "stratus"
      ? Math.sin(Math.PI * y / H)
      : Math.min(1, Math.max(0, (H * 0.86 - y) / (H * 0.16)));
    for (let x = 0; x < W; x++) {
      let f = 0;
      for (const b of blobs) {
        const dx = (x - b.x) / b.rx, dy = (y - b.y) / b.ry;
        f += Math.exp(-(dx * dx + dy * dy) * 2.2);
      }
      let n = 0, amp = 0.55, tot = 0;
      for (let o = 0; o < 4; o++) {
        const fr = 1 << o;
        n += fogValueNoise((x / W) * 5 * fr + seed * 3.1, (y / H) * vScale * fr, 4096, o + 3 + seed) * amp;
        tot += amp;
        amp *= 0.5;
      }
      n /= tot;
      dens[y * W + x] = Math.min(1, Math.max(0, (Math.min(f, 1.6) * (0.5 + 0.8 * n) - 0.42) * 2.3)) * baseFade;
    }
  }

  // Light from above: the more cloud a ray has passed through, the darker it gets
  const a = document.createElement("canvas");
  const l = document.createElement("canvas");
  const t = document.createElement("canvas");
  a.width = l.width = t.width = W;
  a.height = l.height = t.height = H;
  const ia = a.getContext("2d").createImageData(W, H);
  const il = l.getContext("2d").createImageData(W, H);
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let y = 0; y < H; y++) {
      const d = dens[y * W + x];
      acc += d * 0.07;
      const lum = 0.18 + 0.82 * Math.exp(-acc * 1.6);
      const i = (y * W + x) * 4;
      ia.data[i] = ia.data[i + 1] = ia.data[i + 2] = 255;
      il.data[i] = il.data[i + 1] = il.data[i + 2] = 255;
      ia.data[i + 3] = d * 255;
      il.data[i + 3] = d * lum * 255;
    }
  }
  a.getContext("2d").putImageData(ia, 0, 0);
  l.getContext("2d").putImageData(il, 0, 0);
  return { a, l, t, w: W, h: H };
}

function buildClouds() {
  for (let i = 0; i < 6; i++) CLOUD_SPRITES.push(buildCloudSprite("cumulus", i + 1));
  for (let i = 0; i < 3; i++) CLOUD_SPRITES.push(buildCloudSprite("stratus", i + 11));

  const rnd = makeRng(4242);
  const layers = [
    { n: 4, kinds: [6, 7, 8], y: [0.05, 0.16], s: [1.7, 2.4], par: 0.008, wind: 2.5, a: 0.5 },          // high, thin
    { n: 7, kinds: [0, 1, 2, 3, 4, 5], y: [0.14, 0.36], s: [1.5, 2.3], par: 0.02, wind: 5, a: 0.95 },  // main cumulus
    { n: 6, kinds: [0, 1, 2, 3, 4, 5, 6, 7, 8], y: [0.36, 0.58], s: [1.0, 1.6], par: 0.045, wind: 9, a: 0.9 } // low scud
  ];
  layers.forEach((L, li) => {
    for (let i = 0; i < L.n; i++) {
      cloudField.push({
        sprite: L.kinds[Math.floor(rnd() * L.kinds.length)],
        u: (i + rnd() * 0.8) / L.n,
        yR: L.y[0] + (L.y[1] - L.y[0]) * rnd(),
        s: L.s[0] + (L.s[1] - L.s[0]) * rnd(),
        flip: rnd() < 0.5,
        par: L.par,
        wind: L.wind * (0.8 + 0.4 * rnd()),
        a: L.a,
        rain: li === 1 && rnd() < 0.45
      });
    }
  });
}

// Lit and shadowed cloud colours for the current time of day
function cloudPalette(daylight, sunset) {
  const night = 1 - daylight;
  const lerp3 = (p, q, k) => p.map((v, i) => v + (q[i] - v) * k);
  let L = lerp3([236, 238, 242], [255, 184, 132], sunset * 0.85);
  let S = lerp3([112, 122, 138], [96, 66, 86], sunset * 0.8);
  L = lerp3(L, [58, 70, 96], Math.pow(night, 1.2));
  S = lerp3(S, [10, 13, 22], Math.pow(night, 1.1));
  return { L: L.map(Math.round), S: S.map(Math.round) };
}

function retintClouds(pal) {
  CLOUD_SPRITES.forEach((sp) => {
    const g = sp.t.getContext("2d");
    g.globalCompositeOperation = "source-over";
    g.clearRect(0, 0, sp.w, sp.h);
    g.drawImage(sp.a, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = `rgb(${pal.S.join(",")})`;
    g.fillRect(0, 0, sp.w, sp.h);

    cloudScratch.width = sp.w;
    cloudScratch.height = sp.h;
    const s = cloudScratch.getContext("2d");
    s.drawImage(sp.l, 0, 0);
    s.globalCompositeOperation = "source-in";
    s.fillStyle = `rgb(${pal.L.join(",")})`;
    s.fillRect(0, 0, sp.w, sp.h);

    g.globalCompositeOperation = "source-over";
    g.drawImage(cloudScratch, 0, 0);
  });
}

// Flickers of lightning hidden inside a single cloud
function updateCloudFlash(dt) {
  cloudFlash.v = Math.max(0, cloudFlash.v - dt * 3.2);
  const stormy = getDaylightFactor() < 0.45 || danger >= 7;
  if (!stormy || !cloudField.length) return;
  cloudFlash.next -= dt;
  if (cloudFlash.next <= 0) {
    cloudFlash.next = 3 + Math.random() * 9;
    cloudFlash.idx = Math.floor(Math.random() * cloudField.length);
    cloudFlash.v = 0.6 + Math.random() * 0.5;
  }
}

function drawRainCurtain(x, y, w, surfaceY, night, t, seed) {
  if (y >= surfaceY) return;
  const g = ctx.createLinearGradient(0, y, 0, surfaceY);
  g.addColorStop(0, `rgba(110,122,138,${0.16 * night})`);
  g.addColorStop(1, "rgba(110,122,138,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w - 30, surfaceY);
  ctx.lineTo(x - 40, surfaceY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = `rgba(150,160,175,${0.06 * night})`;
  ctx.lineWidth = 1;
  for (let k = 0; k < 14; k++) {
    const sx = x + ((hash(seed * 31 + k) * w + t * 22) % w);
    ctx.beginPath();
    ctx.moveTo(sx, y + 6);
    ctx.lineTo(sx - 28, surfaceY - 4);
    ctx.stroke();
  }
}

function drawRealisticClouds(surfaceY, daylight, sunset) {
  if (!CLOUD_SPRITES.length) buildClouds();
  const pal = cloudPalette(daylight, sunset);
  const key = pal.L.concat(pal.S).map((v) => Math.round(v / 6)).join(",");
  if (key !== cloudTintKey) {
    cloudTintKey = key;
    retintClouds(pal);
  }
  const t = performance.now() * 0.001;
  const span = canvas.width + 1100;
  const night = 1 - daylight;

  ctx.save();
  cloudField.forEach((c, idx) => {
    const sp = CLOUD_SPRITES[c.sprite];
    const w = sp.w * c.s;
    const h = sp.h * c.s;
    let x = (c.u * span + t * c.wind - camera.x * c.par) % span;
    if (x < 0) x += span;
    x -= 550;
    const y = surfaceY * c.yR - h * 0.55;
    if (x > canvas.width || x + w < 0) return;

    if (c.rain && night > 0.3) drawRainCurtain(x + w * 0.22, y + h * 0.78, w * 0.56, surfaceY, night, t, idx);

    const blit = (img) => {
      if (c.flip) {
        ctx.save();
        ctx.translate(x + w, y);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0, w, h);
        ctx.restore();
      } else {
        ctx.drawImage(img, x, y, w, h);
      }
    };
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = c.a;
    blit(sp.t);

    // Lightning lights the cloud from inside
    const flash = lightningFlash + (cloudFlash.idx === idx ? cloudFlash.v : 0);
    if (flash > 0.02) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.min(1, flash) * 0.5;
      blit(sp.l);
    }
  });
  ctx.restore();
}

// Distance haze over the far hills so the layers separate like real air
function drawAerialHaze(surfaceY, strength) {
  const tint = getFogTint();
  const a = strength * (0.6 + getFogDensity() * 0.6);
  const top = surfaceY - 250;
  const g = ctx.createLinearGradient(0, top, 0, surfaceY + 4);
  g.addColorStop(0, `rgba(${tint.r},${tint.g},${tint.b},0)`);
  g.addColorStop(0.7, `rgba(${tint.r},${tint.g},${tint.b},${a * 0.65})`);
  g.addColorStop(1, `rgba(${tint.r},${tint.g},${tint.b},${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, top, canvas.width, 254);
}

// The water mirrors whatever stands above it: shore, sky, the boat — rippled by the swell
const reflCanvas = document.createElement("canvas");

function drawSceneReflection(surfaceY) {
  const H = 64;
  const W = canvas.width;
  if (!W) return;   // window with no size (minimised / hidden)
  if (reflCanvas.width !== W || reflCanvas.height !== H) {
    reflCanvas.width = W;
    reflCanvas.height = H;
  }
  const r = reflCanvas.getContext("2d");
  r.clearRect(0, 0, W, H);
  const srcTop = Math.max(0, Math.round(surfaceY) - H);
  r.drawImage(canvas, 0, srcTop, W, H, 0, 0, W, H);

  const t = performance.now() * 0.001;
  ctx.save();
  for (let y = 0; y < H; y += 2) {
    const off = Math.sin(t * 1.1 + y * 0.35) * (0.5 + y * 0.06) + Math.sin(t * 0.7 + y * 0.13) * 1.2;
    ctx.globalAlpha = 0.3 * (1 - y / H);
    ctx.drawImage(reflCanvas, 0, H - 2 - y, W, 2, off, surfaceY + 2 + y, W, 2);
  }
  ctx.restore();
}

// Fine moving film grain over the whole picture
let grainPattern = null;

function drawFilmGrain() {
  if (!grainPattern) {
    const c = document.createElement("canvas");
    c.width = c.height = 160;
    const g = c.getContext("2d");
    const img = g.createImageData(160, 160);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (Math.random() - 0.5) * 120;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    grainPattern = ctx.createPattern(c, "repeat");
  }
  const ox = Math.random() * 160;
  const oy = Math.random() * 160;
  ctx.save();
  ctx.globalCompositeOperation = "overlay";
  ctx.globalAlpha = 0.07;
  ctx.translate(-ox, -oy);
  ctx.fillStyle = grainPattern;
  ctx.fillRect(ox - 20, oy - 20, canvas.width + 40, canvas.height + 40);
  ctx.restore();
}

function gameLoop() {
  const surfaceY = getSurfaceY();

  const nowMs = performance.now();
  frameDt = Math.min(0.1, (nowMs - lastFrameTime) / 1000);
  lastFrameTime = nowMs;

  frameGlows.length = 0;
  shoreLights.length = 0;
  headlight = computeHeadlight();
  updateBoatRods(frameDt);
  updateWildlife(frameDt);
  updateBioWake(frameDt);
  updateSpots(frameDt);
  boatFacing += (boatFacingTarget - boatFacing) * Math.min(1, frameDt * 4);
  saveTimer += frameDt;
  if (saveTimer >= AUTOSAVE_SECONDS) {
    saveTimer = 0;
    saveGame();
  }
  updateLightning(frameDt);
  updateCloudFlash(frameDt);
  updateSound();
  updateScreenShake();
  updateRain();
  update();

  if (clockEl) clockEl.textContent = formatTime(gameTime);
  if (dayEl) dayEl.textContent = `Den ${dayNum}`;

  // Update region label based on player position
  const regionEl = document.getElementById("region");
  if (regionEl) {
    if (isInReefZone(player.x)) {
      regionEl.textContent = "⚠ Krvavý útes";
      regionEl.style.color = "#ff5580";
    } else if (nearLighthouse()) {
      regionEl.textContent = "☀ Pod majákem";
      regionEl.style.color = "#e8d9a0";
    } else {
      regionEl.textContent = "Otevřené moře";
      regionEl.style.color = "";
    }
  }

  // === Danger Bar HUD sync ===
  const dangerBarFill = document.getElementById('danger-bar-fill');
  const hudLeft = document.getElementById('hud-left');
  if (dangerBarFill) {
    const pct = (danger / 12) * 100;
    dangerBarFill.style.width = pct + '%';
    if (danger >= 9) {
      dangerBarFill.classList.add('danger-critical');
    } else {
      dangerBarFill.classList.remove('danger-critical');
    }
  }
  if (hudLeft) {
    if (danger >= 6) {
      hudLeft.classList.add('danger-high');
    } else {
      hudLeft.classList.remove('danger-high');
    }
  }

  updateBatteryHud();
  updateHullHud();

  ctx.save();

  // Apply Screen Shake
  if (shakeIntensity > 0) {
    const dx = (Math.random() - 0.5) * shakeIntensity;
    const dy = (Math.random() - 0.5) * shakeIntensity;
    ctx.translate(dx, dy);
  }

  // Apply Danger Distortion
  if (danger >= 6) {
    const intensity = (danger - 6) / 6;
    const rot = Math.sin(performance.now() * 0.005) * 0.012 * intensity;
    const scl = 1 + Math.sin(performance.now() * 0.007) * 0.008 * intensity;
    ctx.translate(canvas.width / 2, surfaceY);
    ctx.rotate(rot);
    ctx.scale(scl, scl);
    ctx.translate(-canvas.width / 2, -surfaceY);
  }

  // === SKY ===
  drawSky(surfaceY);
  drawLightningBolt();

  drawSunRays(surfaceY);
  drawMountains(surfaceY);
  drawGulls(surfaceY);
  drawBirdFlock(surfaceY);

  // === BACKGROUND COAST (far) ===
  drawRockyCoast(surfaceY, 0.12, 15, false);
  drawPineForest(surfaceY, 0.12, 15, 300, 34, 0.5);
  drawAerialHaze(surfaceY, 0.34);

  // === MID COAST ===
  drawRockyCoast(surfaceY, 0.25, 5, true);
  drawPineForest(surfaceY, 0.25, 5, 80, 46, 0.72);
  drawTownBuildings(surfaceY);
  drawAerialHaze(surfaceY, 0.12);

  // === DOCK STRUCTURE ===
  drawDockStructure(surfaceY);
  drawOilRig(surfaceY);
  drawNpcBoats(surfaceY);
  drawFogLayers(surfaceY, "back");

  // === WATER SURFACE ===
  drawBubbles(surfaceY);

  const screenBoatX = canvas.width / 2;

  // === UNDERWATER ===
  // Everything below the surface is drawn as if lit; the darkness pass then
  // hides whatever the headlight and the living lights don't reach.
  const bob = boatBob();
  const keelY = surfaceY + 8 + bob;

  drawUnderwater(surfaceY);
  drawUnderwaterCaustics(surfaceY);
  drawShadowCreature(surfaceY);
  drawLighthouseCliffUnderwater(surfaceY);
  drawOilRigUnderwater(surfaceY);
  drawSeabed(surfaceY);
  drawCoralReef(surfaceY);
  drawSeaReefs(surfaceY);

  // Seaweed along the whole seabed (only the visible stretch is drawn)
  const weedStart = Math.floor((camera.x - 160) / 140) * 140;
  for (let wx = weedStart; wx < camera.x + canvas.width + 160; wx += 140) {
    const x = wx + hash(wx) * 40;
    drawSeaweed(x, seabedYAt(x) + 6);
  }

  drawMarineSnow(surfaceY);
  fish.forEach((f) => drawFishEntity(f, surfaceY));
  drawJellyfish(surfaceY);

  drawUnderwaterDarkness(surfaceY, screenBoatX, keelY);

  // Light, and things that glow on their own, sit on top of the darkness
  drawLightCone(screenBoatX, keelY, surfaceY);
  drawBowLight(screenBoatX, keelY, surfaceY);
  drawEmissiveGlows();
  drawBioWake(surfaceY);
  drawDeepEyes(surfaceY);
  drawWaterSurface(surfaceY);
  drawGlitterPath(surfaceY);
  drawBuoys(surfaceY);
  drawShoreReflections(surfaceY, screenBoatX);
  drawRainRipples(surfaceY);
  drawDetektorHints(surfaceY);

  // === BOAT ===
  drawBoatWake(screenBoatX, surfaceY, bob);

  // Draw exhaust smoke particles
  ctx.save();
  smokeParticles.forEach(p => {
    const sx = p.wx - camera.x;
    ctx.fillStyle = `rgba(130, 130, 130, ${p.alpha})`;
    ctx.beginPath();
    ctx.arc(sx, p.wy, p.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  drawBoatSide(screenBoatX, surfaceY, bob);
  drawTentacles(surfaceY);
  drawSceneReflection(surfaceY);

  // === FOREGROUND: LIGHTHOUSE ===
  drawLighthouseCliff(surfaceY);
  drawCliffPines(surfaceY);
  drawLighthouseTower(surfaceY);

  // === ATMOSPHERIC EFFECTS ===
  drawFogLayers(surfaceY, "front");
  drawRain();
  drawLightningFlash(surfaceY);
  drawAttackFlash();
  drawVignette();
  drawFilmGrain();

  // Lighthouse beam (on top of everything for dramatic effect)
  drawLighthouseBeam(surfaceY);

  // Darkness from danger
  const darkness = Math.min(danger * 0.03, 0.35);
  ctx.fillStyle = `rgba(0,5,12,${darkness})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Reef zone: pulsing crimson vignette overlay
  if (isInReefZone(player.x)) {
    const rt = performance.now() * 0.0012;
    const reefPulse = (Math.sin(rt) * 0.5 + 0.5) * 0.07 + 0.03;
    const rv = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, canvas.height * 0.18,
      canvas.width / 2, canvas.height / 2, canvas.height * 0.72
    );
    rv.addColorStop(0, "rgba(0,0,0,0)");
    rv.addColorStop(0.55, `rgba(80,0,20,${reefPulse * 0.5})`);
    rv.addColorStop(1, `rgba(120,0,30,${reefPulse})`);
    ctx.fillStyle = rv;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  drawWorldPrompts(surfaceY);

  ctx.restore();

  drawRouteMap();

  if (dangerUI) dangerUI.innerText = Math.round(danger);

  updateFishingHudVisuals();
  updateDetektorHudVisuals();
  updateRechargeHudVisuals();

  requestAnimationFrame(gameLoop);
}

syncRelicsHud();
initFishingRingSvg();
initMenuButtons();
initSpotState(); // after the whole script has run: it uses constants declared further down
ensureContracts();
updateInventoryUI();
if (loadGame()) {
  triggerDialogue("Lodní deník", `Pokračuješ v plavbě — den ${dayNum}. Postup se ukládá sám.`);
}
gameLoop();
