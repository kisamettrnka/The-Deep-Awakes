// =====================================================================
// THE DEEP AWAKES — Game Engine
// DREDGE-style visuals with foreground lighthouse
// =====================================================================

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const fishingUI = document.getElementById("fishing-ui");
const fishingNeedleEl = document.getElementById("fishing-needle");
const fishingGreenArcsEl = document.getElementById("fishing-green-arcs");
const catchFishIconEl = document.getElementById("catch-fish-icon");
const fishingRedHintEl = document.getElementById("fishing-red-hint");
const fishingRedCountEl = document.getElementById("fishing-red-count");
const fishingResultEl = document.getElementById("fishing-result");

const detektorUI = document.getElementById("detektor-ui");
const detektorZonesEl = document.getElementById("detektor-zones");
const detektorSweepEl = document.getElementById("detektor-sweep");
const detektorExtractFillEl = document.getElementById("detektor-extract-fill");
const detektorRedHintEl = document.getElementById("detektor-red-hint");
const detektorRedCountEl = document.getElementById("detektor-red-count");
const detektorResultEl = document.getElementById("detektor-result");

// New DOM elements for dock, market, shipyard, inventory, dialogue
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
let fishingStartTime = 0;
let catchProgress = 0;
let redStreak = 0;

let currentFishingZones = [];

function generateFishingGreenZones() {
  const extraWidth = (rodUpgrades.quality - 1) * 0.12;
  const numZones = Math.random() > 0.6 ? 2 : 1;
  const zones = [];
  for (let i = 0; i < numZones; i++) {
    const center = Math.random() * Math.PI * 2;
    const halfWidth = 0.28 + extraWidth;
    zones.push([center - halfWidth, center + halfWidth]);
  }
  return zones;
}

/** Úhel od 12:00 po směru hodinových ručiček, 0 = nahoru. */
function getFishingGreenZones() {
  return currentFishingZones;
}

/** Rychlost jehly v rad/s */
const FISHING_SPIN_SPEED = 2.85;
const FISHING_HITS_TO_LAND = 4;

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
const LIGHTHOUSE_WX = 2550; // Moved to the edge of the village (starts at 2800)
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
let fogOffset = 0;
let smokeParticles = []; // New: exhaust smoke particles from boat

// =====================================================================
// FLASHLIGHT / BATTERY SYSTEM
// Phase 1: Limited battery (drains over time, weak glow when dead)
// Phase 2: Recharge kit bought at oil rig → recharge via minigame (max 3x)
// Phase 3: Engine Lvl 3+ → slow auto-recharge from motor
// =====================================================================
const BATTERY_MAX = 100;          // 100 = full
const BATTERY_DRAIN_RATE = 0.018; // per frame (approx ~5500 frames = ~92s at 60fps)
const BATTERY_MOTOR_CHARGE_RATE = 0.004; // per frame when engine >= 3
let battery = BATTERY_MAX;        // current battery %
let batteryRechargeKitOwned = false; // bought at oil rig?
let batteryRechargesLeft = 0;     // number of recharges left (max 3 after purchase)
const BATTERY_RECHARGE_MAX_USES = 3;

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

// Battery HUD flash state
let batteryLowFlash = 0; // 0..1 flash alpha for low battery warning

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
  x: 2200, // start left of lighthouse
  y: 0,
  speed: 2.8
};

let keys = {};
let fish = [];
let seabedFeatures = [];
let sparkles = [];

let gold = 0;
let caughtFish = 0;
let danger = 0;
let gameTime = 7.75;
let dayNum = 12;

const worldWidth = 22000;

const camera = {
  x: 2200 - window.innerWidth / 2 // initial camera focus
};

const detektorSpots = [];
const bubbleSpots = [];

function hash(n) {
  let t = n * 0.3183099;
  return t - Math.floor(t);
}

function seedWorld() {
  fish.length = 0;
  for (let i = 0; i < 60; i++) {
    fish.push({
      wx: Math.random() * worldWidth - worldWidth / 2,
      depth: 60 + Math.random() * 340,
      size: 6 + Math.random() * 10,
      phase: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 0.8,
      hue: 0.5 + Math.random() * 0.2
    });
  }

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

  for (let i = 0; i < 40; i++) {
    sparkles.push({
      wx: Math.random() * worldWidth - worldWidth / 2,
      y: Math.random(),
      a: Math.random() * Math.PI * 2,
      sp: 0.5 + Math.random()
    });
  }

  bubbleSpots.length = 0;
  const span = worldWidth - 400;
  for (let i = 0; i < 22; i++) {
    bubbleSpots.push({
      wx: -worldWidth / 2 + 200 + (span / 21) * i + (hash(i * 17) - 0.5) * 160,
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

function needleAngleAt(nowMs) {
  const dt = (nowMs - fishingStartTime) / 1000;
  return normalizeAngle(dt * FISHING_SPIN_SPEED);
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
  const zones = getFishingGreenZones();
  const d = zones.map(([a0, a1]) => ringArcD(cx, cy, r, a0, a1)).join(" ");
  fishingGreenArcsEl.setAttribute("d", d);
}

function isNeedleInGreen(theta) {
  const zones = getFishingGreenZones();
  return zones.some(([a0, a1]) => angleInSpan(theta, a0, a1));
}

function syncRelicsHud() {
  if (relicsEl) relicsEl.textContent = `${Math.min(relicsFound, 6)} / 6`;
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
    const d = Math.abs(spot.wx - player.x);
    if (d < getBubbleActivateRadius() && d < bestD) {
      bestD = d;
      best = spot;
    }
  }
  return best;
}

function updateCatchFishIcon() {
  if (!catchFishIconEl) return;
  const p = Math.min(1, Math.max(0, catchProgress));
  catchFishIconEl.style.bottom = `${12 + p * 72}%`;
}

function updateFishingHudVisuals() {
  if (!fishingMode || fishingLocked || !fishingNeedleEl) return;
  const th = needleAngleAt(performance.now());
  const deg = (th * 180) / Math.PI;
  fishingNeedleEl.setAttribute("transform", `translate(100 100) rotate(${deg})`);
}

function showFishingRedHint() {
  if (fishingRedHintEl) fishingRedHintEl.classList.remove("hidden");
  if (fishingRedCountEl) fishingRedCountEl.textContent = String(redStreak);
}

function hideFishingRedHint() {
  if (fishingRedHintEl) fishingRedHintEl.classList.add("hidden");
}

function tryStartFishing() {
  if (fishingMode || fishingLocked || detektorMode || detektorLocked) return;
  if (!getBubbleNearPlayer()) return;

  fishingMode = true;
  fishingLocked = false;
  fishingStartTime = performance.now();
  catchProgress = 0;
  redStreak = 0;

  if (fishingUI) {
    fishingUI.classList.remove("hidden");
    fishingUI.setAttribute("aria-hidden", "false");
  }
  if (fishingResultEl) {
    fishingResultEl.classList.add("hidden");
    fishingResultEl.textContent = "";
  }
  hideFishingRedHint();
  
  currentFishingZones = generateFishingGreenZones();
  initFishingRingSvg();
  
  updateCatchFishIcon();
}

function tryFishingHit() {
  if (!fishingMode || fishingLocked) return;

  const th = needleAngleAt(performance.now());

  if (isNeedleInGreen(th)) {
    redStreak = 0;
    hideFishingRedHint();
    catchProgress += 1 / FISHING_HITS_TO_LAND;
    updateCatchFishIcon();
    
    const flashRing = document.getElementById("fishing-flash-ring");
    if (flashRing) {
      flashRing.classList.remove("flash-anim");
      void flashRing.offsetWidth;
      flashRing.classList.add("flash-anim");
    }
    
    currentFishingZones = generateFishingGreenZones();
    initFishingRingSvg();

    if (catchProgress >= 1 - 1e-9) {
      endFishingSuccess();
    }
  } else {
    redStreak++;
    showFishingRedHint();
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
  
  if (inventory.length >= 12) {
    if (fishingResultEl) {
      fishingResultEl.textContent = "Podpalubí je plné! Nemůžeš naložit další ryby.";
      fishingResultEl.className = "fishing-result bad";
      fishingResultEl.classList.remove("hidden");
    }
    window.setTimeout(() => {
      fishingLocked = false;
      closeFishingPanel();
      if (fishingResultEl) fishingResultEl.classList.add("hidden");
    }, 1500);
    return;
  }

  // Roll for species
  const distanceRatio = Math.min(1.0, Math.abs(player.x) / (worldWidth / 2));
  const rolledDepth = 50 + distanceRatio * 320 + Math.random() * 30;
  const daylight = getDaylightFactor();
  const inReef = isInReefZone(player.x);
  const inOilRig = isInOilRigZone(player.x);
  const caught = getRandomFishForDepth(rolledDepth, daylight, inReef, inOilRig);

  // Add to inventory
  inventory.push(caught);
  caughtFish = inventory.length;

  if (fishingResultEl) {
    let rarityText = "Běžná";
    if (caught.rarity === "uncommon") rarityText = "Neobvyklá";
    else if (caught.rarity === "rare") rarityText = "Vzácná";
    else if (caught.rarity === "aberrant") rarityText = "Abnormální";
    
    fishingResultEl.innerHTML = `Chyceno: <strong>${caught.name}</strong> (${rarityText})!`;
    fishingResultEl.className = `fishing-result ok`;
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
      danger += 2;
      if (dangerUI) dangerUI.innerText = Math.round(danger);
      triggerDialogue("Šílenství", "Něco na té rybě není v pořádku. Ty oči... ten sliz... cítíš, jak ti z toho pohledu třeští hlava.");
    }

    fishingLocked = false;
    closeFishingPanel();
    if (fishingResultEl) fishingResultEl.classList.add("hidden");
  }, 1200);
}

function endFishingFail() {
  fishingLocked = true;
  if (fishingResultEl) {
    fishingResultEl.textContent = "T\u0159i chyby \u2014 ryba unikla.";
    fishingResultEl.className = "fishing-result bad";
    fishingResultEl.classList.remove("hidden");
  }
  window.setTimeout(() => {
    fishingLocked = false;
    redStreak = 0;
    catchProgress = 0;
    closeFishingPanel();
    if (fishingResultEl) fishingResultEl.classList.add("hidden");
  }, 900);
}

function handleSpaceAction() {
  if (rechargeMinigameActive) tryRechargeHit();
  else if (detektorMode) tryDetektorHit();
  else if (fishingMode) tryFishingHit();
  else tryStartFishing();
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
  if (!batteryRechargeKitOwned || batteryRechargesLeft <= 0) return;
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
    
    // Flash ring
    const flashRing = document.getElementById("recharge-flash-ring");
    if (flashRing) {
      flashRing.classList.remove("flash-anim");
      void flashRing.offsetWidth;
      flashRing.classList.add("flash-anim");
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
    // Update HUD count
    const kitBtn = document.getElementById("btn-recharge-battery");
    if (kitBtn) kitBtn.textContent = `Dobít baterii (${batteryRechargesLeft}x zbývá)`;
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
    if (detektorProgress >= DETEKTOR_HITS_TO_RELIC) {
      endDetektorSuccess();
    }
  } else {
    detektorRedStreak++;
    showDetektorRedHint();
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
  
  window.setTimeout(() => {
    if (spot) spot.taken = true;
    gold += 50 + Math.floor(Math.random() * 30);
    if (relicsFound < 6) relicsFound++;
    if (goldUI) goldUI.innerText = gold;
    syncRelicsHud();
    
    // Increase danger! Relics are cursed!
    danger += 3;
    if (dangerUI) dangerUI.innerText = Math.round(danger);

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
    detektorResultEl.textContent = "Sign\u00E1l ztracen \u2014 zkuste jin\u00FD pr\u016Fjezd.";
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

  if (gameOver) {
    if (e.code === "Space" || e.key === " ") {
      e.preventDefault();
      restartGame();
    }
    return;
  }

  if (dialogueActive) {
    if (e.code === "Space" || e.key === " " || e.key === "enter") {
      e.preventDefault();
      skipTypewriter();
    }
    return;
  }

  if (e.key === "i" || e.key === "I") {
    e.preventDefault();
    toggleInventory();
    return;
  }

  if (e.key === "e" || e.key === "E") {
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
    if (!e.repeat) {
      if (rechargeMinigameActive) tryRechargeHit();
      else if (fishingMode) tryFishingHit();
      else if (detektorMode) tryDetektorHit();
      else tryStartFishing();
    }
  }

  if ((key === "f") && !e.repeat) {
    if (!fishingMode && !detektorMode && !rechargeMinigameActive) {
      tryStartDetektor();
    }
  }
  
  // R = start recharge minigame (if kit owned and battery not full)
  if ((key === "r") && !e.repeat) {
    if (!fishingMode && !detektorMode && !dockActive) {
      tryStartRechargeMinigame();
    }
  }
});

window.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});

let lastDangerTick = 0;

let firstFishCaught = false;
let dangerThresh3 = false;
let dangerThresh6 = false;
let dangerThresh9 = false;
let reefWarnedEntry = false;

function update() {
  if (fishingMode || detektorMode || dockActive || dialogueActive || gameOver) return;

  if (keys["a"] || keys["arrowleft"]) player.x -= player.speed;
  if (keys["d"] || keys["arrowright"]) player.x += player.speed;

  player.x = Math.max(-worldWidth / 2 + 100, Math.min(worldWidth / 2 - 100, player.x));

  camera.x = player.x - canvas.width / 2;

  gameTime += 0.0005;
  if (gameTime >= 24) {
    gameTime -= 24;
    dayNum++;
  }

  fish.forEach((f) => {
    f.phase += 0.02 * f.speed;
    f.wx += Math.sin(f.phase) * 0.4;
  });

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

    // Scale down by hull upgrade resistance
    const hullResist = upgrades.hull;
    danger += dangerIncrease / hullResist;

    // Clamp danger at 12
    danger = Math.min(12, danger);
    if (dangerUI) dangerUI.innerText = Math.round(danger);

    // Dialogue warning thresholds
    if (danger >= 3 && !dangerThresh3) {
      dangerThresh3 = true;
      triggerDialogue("Varování", "Cítíš nepříjemný chlad. V dálce pod hladinou jako by cosi matně rudě svítilo... Neupírej tam zrak.");
    }
  }

  // Smoke particle update
  const bob = boatBob();
  const exhaustWx = player.x - 22;
  const exhaustWy = getSurfaceY() - 8 + bob - 68;
  
  if ((keys["a"] || keys["arrowleft"] || keys["d"] || keys["arrowright"]) && Math.random() < 0.18) {
    smokeParticles.push({
      wx: exhaustWx,
      wy: exhaustWy,
      vx: -0.4 - Math.random() * 0.5,
      vy: -0.5 - Math.random() * 0.4,
      r: 2 + Math.random() * 2,
      alpha: 0.5
    });
  } else if (Math.random() < 0.05) { // idle smoke
    smokeParticles.push({
      wx: exhaustWx,
      wy: exhaustWy,
      vx: -0.1 - Math.random() * 0.2,
      vy: -0.3 - Math.random() * 0.2,
      r: 1.5 + Math.random() * 1.5,
      alpha: 0.35
    });
  }
  
  for (let i = smokeParticles.length - 1; i >= 0; i--) {
    const p = smokeParticles[i];
    p.wx += p.vx;
    p.wy += p.vy;
    p.alpha -= 0.008;
    p.r += 0.06;
    if (p.alpha <= 0) {
      smokeParticles.splice(i, 1);
    }
  }

  // --- BATTERY SYSTEM ---
  // Battery drains only when on sea (not docked)
  const isMoving = keys["a"] || keys["arrowleft"] || keys["d"] || keys["arrowright"];
  
  // Auto-charge from motor at engine level 3+
  if (upgrades.engine >= 3 && battery < BATTERY_MAX) {
    battery = Math.min(BATTERY_MAX, battery + BATTERY_MOTOR_CHARGE_RATE);
  }
  
  // Drain battery — faster at night
  const batteryDrain = BATTERY_DRAIN_RATE * (getDaylightFactor() < 0.3 ? 1.5 : 1.0);
  if (!rechargeMinigameActive) {
    battery = Math.max(0, battery - batteryDrain);
  }
  
  // Danger boost when battery dead at night
  const daylight2 = getDaylightFactor();
  if (battery <= 0 && daylight2 < 0.25) {
    danger = Math.min(12, danger + 0.003);
  }
  
  // Battery low flash warning
  if (battery < 20) {
    batteryLowFlash = Math.sin(performance.now() * 0.008) * 0.5 + 0.5;
  } else {
    batteryLowFlash = 0;
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
  gNight.addColorStop(0, "#020308");
  gNight.addColorStop(0.5, "#060912");
  gNight.addColorStop(1.0, "#0a121a");
  
  // Sunset Sky (Dusk/Dawn)
  const gSunset = ctx.createLinearGradient(0, 0, 0, surfaceY);
  gSunset.addColorStop(0, "#0b1022");
  gSunset.addColorStop(0.3, "#251b32");
  gSunset.addColorStop(0.6, "#5a3036");
  gSunset.addColorStop(0.85, "#784435");
  gSunset.addColorStop(1.0, "#885540");
  
  // Day Sky (Muted, foggy steel blue/amber)
  const gDay = ctx.createLinearGradient(0, 0, 0, surfaceY);
  gDay.addColorStop(0, "#2c3b4e");
  gDay.addColorStop(0.5, "#48525b");
  gDay.addColorStop(1.0, "#7c7263");

  // 1. Draw Night Sky (base)
  ctx.fillStyle = gNight;
  ctx.fillRect(0, 0, canvas.width, surfaceY);

  // 2. Draw Sunset Sky on top
  let sunsetWeight = 0;
  if (gameTime >= 4 && gameTime <= 8) {
    sunsetWeight = 1 - Math.abs((gameTime - 6) / 2); // peak at 6:00
  } else if (gameTime >= 16 && gameTime <= 20) {
    sunsetWeight = 1 - Math.abs((gameTime - 18) / 2); // peak at 18:00
  }
  sunsetWeight = Math.max(0, Math.min(1, sunsetWeight));
  
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
  
  drawPainterlyClouds(surfaceY, daylight, sunsetWeight);
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

function drawPainterlyClouds(surfaceY, daylight, sunsetWeight) {
  const t = performance.now() * 0.00004;
  const cloudOpacity = 0.35 + (1 - daylight) * 0.45; // slightly denser clouds at night

  // High dark clouds
  for (let i = 0; i < 7; i++) {
    const cx = ((i * 320 + t * 35) % (canvas.width + 600)) - 300;
    const cy = surfaceY * 0.12 + hash(i * 7) * surfaceY * 0.12;
    const rx = 180 + hash(i * 13) * 140;
    const ry = 32 + hash(i * 23) * 22;
    ctx.fillStyle = `rgba(20,15,30,${(0.5 + hash(i * 31) * 0.3) * cloudOpacity})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(30,18,35,${(0.3 + hash(i * 41) * 0.2) * cloudOpacity})`;
    ctx.beginPath();
    ctx.ellipse(cx + rx * 0.35, cy - ry * 0.3, rx * 0.65, ry * 0.55, 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // Mid warm clouds
  for (let i = 0; i < 9; i++) {
    const cx = ((i * 260 + t * 22 + 400) % (canvas.width + 500)) - 250;
    const cy = surfaceY * 0.32 + hash(i * 11 + 200) * surfaceY * 0.18;
    const rx = 140 + hash(i * 17 + 200) * 110;
    const ry = 28 + hash(i * 29 + 200) * 18;
    
    // Day = grey/blue, Sunset = purple/warm, Night = very dark purple
    const r = Math.round(50 + daylight * 20);
    const g = Math.round(35 + daylight * 20);
    const b = Math.round(45 + daylight * 15);
    
    ctx.fillStyle = `rgba(${r},${g},${b},${(0.3 + hash(i * 37 + 200) * 0.2) * cloudOpacity})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    // Warm highlight
    ctx.fillStyle = `rgba(110,70,72,${(0.15 + hash(i * 43 + 200) * 0.12) * cloudOpacity * daylight})`;
    ctx.beginPath();
    ctx.ellipse(cx + 30, cy - ry * 0.35, rx * 0.5, ry * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Low horizon clouds — pink/salmon
  for (let i = 0; i < 12; i++) {
    const cx = ((i * 200 + t * 15 + 200) % (canvas.width + 500)) - 250;
    const cy = surfaceY * 0.58 + hash(i * 19 + 400) * surfaceY * 0.18;
    const rx = 120 + hash(i * 23 + 400) * 90;
    const ry = 20 + hash(i * 31 + 400) * 15;
    
    const r = Math.round(80 + daylight * 30);
    const g = Math.round(48 + daylight * 20);
    const b = Math.round(48 + daylight * 20);
    
    ctx.fillStyle = `rgba(${r},${g},${b},${(0.22 + hash(i * 41 + 400) * 0.18) * cloudOpacity})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    // Pink top highlight
    ctx.fillStyle = `rgba(170,110,105,${(0.1 + hash(i * 47 + 400) * 0.1) * cloudOpacity * daylight})`;
    ctx.beginPath();
    ctx.ellipse(cx + 18, cy - ry * 0.4, rx * 0.55, ry * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw sun or moon
  drawCelestialBody(surfaceY, daylight, sunsetWeight);
}

/**
 * Draws the sun (day) or moon (night) on the sky.
 */
function drawCelestialBody(surfaceY, daylight, sunsetWeight) {
  const t = performance.now() * 0.001;

  // gameTime 0=midnight, 12=noon — arcs left→right
  const angle = ((gameTime / 24) * Math.PI * 2) - Math.PI * 0.5;
  const bodyX = canvas.width * 0.5 + Math.cos(angle) * canvas.width * 0.42;
  const bodyY = surfaceY * 0.5 - Math.sin(angle) * surfaceY * 0.72;

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

function drawRockyCoast(surfaceY, parallax, yOff, darker) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-10, canvas.height);
  for (let x = -10; x <= canvas.width + 60; x += 12) {
    const wx = x + camera.x * parallax;
    const n = Math.sin(wx * 0.0012) * 55
            + Math.sin(wx * 0.004) * 35
            + Math.sin(wx * 0.013) * 14
            + Math.sin(wx * 0.028) * 6;
    ctx.lineTo(x, surfaceY - 105 - n + yOff);
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

  // Rock strata lines
  if (!darker) {
    ctx.strokeStyle = "rgba(50,40,28,0.18)";
    ctx.lineWidth = 1;
    for (let row = 0; row < 6; row++) {
      const rowY = surfaceY - 80 + yOff + row * 22;
      ctx.beginPath();
      for (let x = 0; x <= canvas.width; x += 18) {
        const wx = x + camera.x * parallax;
        const n = Math.sin(wx * 0.0012) * 55 + Math.sin(wx * 0.004) * 35;
        const topEdge = surfaceY - 105 - n + yOff;
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

function drawPineForest(surfaceY, parallax, wxOff, count, scale) {
  const baseWx = camera.x * parallax;
  for (let i = 0; i < count; i++) {
    const wx = wxOff + i * 75 * scale + hash(i * 13 + wxOff) * 40;
    const sx = wx - baseWx + canvas.width * 0.2;
    if (sx < -50 || sx > canvas.width + 50) continue;

    const coastWx = sx + camera.x * parallax;
    const coastN = Math.sin(coastWx * 0.0012) * 55 + Math.sin(coastWx * 0.004) * 35;
    const groundY = surfaceY - 105 - coastN;

    const treeH = (55 + hash(i + wxOff) * 45) * scale;
    const treeW = (10 + hash(i * 7 + wxOff) * 6) * scale;

    // Trunk
    ctx.fillStyle = "#0a0806";
    ctx.fillRect(sx - 1.5 * scale, groundY - treeH * 0.15, 3 * scale, treeH * 0.15);

    // Pine layers (3-5 triangular tiers)
    const layers = 3 + Math.floor(hash(i * 11 + wxOff) * 2);
    for (let l = 0; l < layers; l++) {
      const t = l / layers;
      const layerBot = groundY - treeH * 0.15 - treeH * 0.85 * (t);
      const layerW = treeW * (1.15 - t * 0.55);
      const layerH = treeH * 0.32;

      ctx.fillStyle = l % 2 === 0 ? "#080e07" : "#060b05";
      ctx.beginPath();
      ctx.moveTo(sx, layerBot - layerH);
      ctx.lineTo(sx + layerW, layerBot + 3 * scale);
      ctx.lineTo(sx - layerW, layerBot + 3 * scale);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawTownBuildings(surfaceY) {
  const startWx = 2800;
  for (let i = 0; i < 22; i++) {
    const wx = startWx + i * 48 + hash(i * 7) * 20;
    const sx = wx - camera.x * 0.22;
    if (sx < -20 || sx > canvas.width + 20) continue;

    const coastWx = sx + camera.x * 0.22;
    const bump = Math.sin(coastWx * 0.0012) * 20;
    const gy = surfaceY - 60 - bump - hash(i) * 30;
    const bw = 18 + hash(i * 3) * 12;
    const bh = 22 + hash(i + 1) * 20;

    // Building body
    ctx.fillStyle = `rgba(35,30,28,${0.9 + hash(i * 5) * 0.1})`;
    ctx.fillRect(sx - bw / 2, gy, bw, bh);

    // Roof
    ctx.fillStyle = "#1a1410";
    ctx.beginPath();
    ctx.moveTo(sx - bw / 2 - 3, gy);
    ctx.lineTo(sx, gy - 10 - hash(i * 9) * 8);
    ctx.lineTo(sx + bw / 2 + 3, gy);
    ctx.closePath();
    ctx.fill();

    // Lit window
    const winGlow = 0.3 + hash(i + 2) * 0.55;
    const flicker = Math.sin(performance.now() * 0.003 + i * 2.7) * 0.08;
    ctx.fillStyle = `rgba(255,195,110,${winGlow + flicker})`;
    ctx.fillRect(sx - 3, gy + 6, 6, 7);
    if (bw > 22) {
      ctx.fillRect(sx + 6, gy + 8, 5, 6);
    }

    // Window glow halo
    const wg = ctx.createRadialGradient(sx, gy + 9, 1, sx, gy + 9, 14);
    wg.addColorStop(0, `rgba(255,190,100,${0.08 + flicker})`);
    wg.addColorStop(1, "rgba(255,190,100,0)");
    ctx.fillStyle = wg;
    ctx.fillRect(sx - 14, gy - 2, 28, 24);
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

  // Base building / house
  ctx.fillStyle = "#2a2018";
  ctx.fillRect(towerCX - 40, towerBase - 5, 80, 32);
  ctx.fillStyle = "#3a3020";
  ctx.fillRect(towerCX - 38, towerBase - 3, 76, 28);
  // House roof
  ctx.fillStyle = "#1e1610";
  ctx.beginPath();
  ctx.moveTo(towerCX - 44, towerBase - 5);
  ctx.lineTo(towerCX, towerBase - 25);
  ctx.lineTo(towerCX + 44, towerBase - 5);
  ctx.closePath();
  ctx.fill();
  // House window
  ctx.fillStyle = "rgba(255,190,100,0.4)";
  ctx.fillRect(towerCX - 18, towerBase + 6, 8, 10);
  ctx.fillRect(towerCX + 10, towerBase + 6, 8, 10);

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
  const daylight = getDaylightFactor();
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

      ctx.fillStyle = l % 2 === 0 ? "#0a1208" : "#070e05";
      ctx.beginPath();
      ctx.moveTo(tx, ly - lh);
      ctx.lineTo(tx + lw, ly + 3);
      ctx.lineTo(tx - lw, ly + 3);
      ctx.closePath();
      ctx.fill();
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

    const worldX = wx;
    const seabedRoll =
      Math.sin(worldX * 0.003) * 50 +
      Math.sin(worldX * 0.01) * 25 +
      Math.sin(worldX * 0.025) * 10 +
      hash(Math.floor(worldX / 50)) * 16;
    const baseY = canvas.height - 55 - seabedRoll;

    // Hue cycles through coral palette based on seed
    const hues  = [0, 20, 300, 160, 40]; // red, orange, magenta, teal, amber
    const hueIdx = Math.floor(seed * hues.length);
    const hue   = hues[hueIdx];
    const h2    = hues[(hueIdx + 2) % hues.length];

    const coralType = Math.floor(seed * 3); // 0=branch, 1=fan, 2=dome

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

  // Underwater pillars
  ctx.fillStyle = "#111";
  ctx.fillRect(-80, rigY, 20, canvas.height - rigY);
  ctx.fillRect(60, rigY, 20, canvas.height - rigY);
  
  // Cross beams underwater/above water
  ctx.strokeStyle = "#222";
  ctx.lineWidth = 4;
  for (let y = rigY + 40; y < canvas.height; y += 60) {
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
  const t = performance.now() * 0.0015;
  const daylight = getDaylightFactor();
  
  // Base color of the water surface
  // Richer, deeper colors for a premium look
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
  ctx.fillStyle = planeGrad;
  ctx.fillRect(0, surfaceY, canvas.width, waterH);
  
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
    for (let x = -20; x <= canvas.width + 20; x += 15 - Math.round(ratio * 5)) {
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
      ctx.beginPath();
      let hasHighlight = false;
      for (let j = 0; j < wavePoints.length; j++) {
        const pt = wavePoints[j];
        // Only add highlight near the crests of the waves
        if (pt.rawSin > 0.75) {
          if (!hasHighlight) {
            ctx.moveTo(pt.x, pt.y);
            hasHighlight = true;
          } else {
            ctx.lineTo(pt.x, pt.y);
          }
        } else {
          hasHighlight = false;
        }
      }
      
      // Specular highlight color (mix of moonlight/sunlight)
      const glintAlpha = (0.05 + ratio * 0.12) * (0.5 + daylight * 0.5);
      ctx.strokeStyle = `rgba(240, 250, 255, ${glintAlpha})`;
      ctx.lineWidth = (0.8 + ratio * 2.2) * 0.6;
      ctx.stroke();
      ctx.restore();
    }
  }
  
  // Draw perspective grid lines radiating from horizon
  const gridLines = 16;
  ctx.strokeStyle = `rgba(${rBase + 20}, ${gBase + 30}, ${bBase + 25}, 0.08)`;
  ctx.lineWidth = 1;
  for (let i = 0; i <= gridLines; i++) {
    const pct = i / gridLines;
    // horizon point is center-ish
    const hx = canvas.width * 0.5 + (pct - 0.5) * 200 - camera.x * 0.1;
    // foreground point spreads wide
    const fgx = canvas.width * 0.5 + (pct - 0.5) * canvas.width * 2.5 - camera.x * 0.8;
    
    ctx.beginPath();
    ctx.moveTo(hx, surfaceY);
    
    // Draw wave-distorted perspective line
    for (let yStep = 0; yStep <= 10; yStep++) {
      const yPct = yStep / 10;
      const yVal = surfaceY + Math.pow(yPct, 1.8) * waterH;
      const currX = hx + (fgx - hx) * yPct;
      const waveRatio = Math.pow(yPct, 1.8);
      const amp = (0.6 + waveRatio * 3.5);
      const freq = 0.03 - waveRatio * 0.018;
      const speed = t * (1.2 + waveRatio * 2.5);
      const worldX = currX + camera.x * (0.3 + waveRatio * 0.7);
      const distY = yVal + Math.sin(worldX * freq + speed) * amp;
      
      ctx.lineTo(currX, distY);
    }
    ctx.stroke();
  }
  
  ctx.restore();
}

function drawBubbles(surfaceY) {
  const t = performance.now() * 0.0022;
  bubbleSpots.forEach((b) => {
    const sx = b.wx - camera.x;
    if (sx < -40 || sx > canvas.width + 40) return;
    const by = surfaceY - 6 + Math.sin(t + b.phase) * 3;
    ctx.save();
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 5; i++) {
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
  const daylight = getDaylightFactor();
  
  // Daylight water: green-teal. Night water: dark murky blue-black
  const r0 = Math.round(2 + daylight * 16);
  const g0 = Math.round(6 + daylight * 36);
  const b0 = Math.round(4 + daylight * 30);
  
  const r1 = Math.round(0 + daylight * 4);
  const g1 = Math.round(2 + daylight * 10);
  const b1 = Math.round(1 + daylight * 8);
  
  const g = ctx.createLinearGradient(0, surfaceY, 0, canvas.height);
  g.addColorStop(0, `rgb(${r0}, ${g0}, ${b0})`);
  g.addColorStop(0.5, `rgb(${r1}, ${g1}, ${b1})`);
  g.addColorStop(1, "#000000");
  
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
    const worldX = camera.x + x;
    const roll =
      Math.sin(worldX * 0.003) * 50 +
      Math.sin(worldX * 0.01) * 25 +
      Math.sin(worldX * 0.025) * 10 +
      hash(Math.floor(worldX / 50)) * 16;
    const y = canvas.height - 55 - roll;
    ctx.lineTo(x, y);
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

  // Rock formations on seabed
  ctx.strokeStyle = "rgba(25,35,20,0.5)";
  ctx.lineWidth = 2;
  for (let i = 0; i < seabedFeatures.length; i++) {
    const s = seabedFeatures[i];
    const ssx = s.wx - camera.x;
    if (ssx < -150 || ssx > canvas.width + 150) continue;
    const by = canvas.height - s.height - 18;

    // Rock shape
    ctx.beginPath();
    ctx.moveTo(ssx, by + s.height);
    ctx.quadraticCurveTo(ssx + s.w * 0.3, by - 8, ssx + s.w * 0.5, by + 5);
    ctx.quadraticCurveTo(ssx + s.w * 0.7, by - 12, ssx + s.w, by + s.height);
    ctx.strokeStyle = "rgba(30,42,28,0.7)";
    ctx.stroke();

    // Fill rock
    ctx.fillStyle = "rgba(18,26,14,0.4)";
    ctx.fill();
  }
}

function drawLightCone(screenBoatX, keelY, surfaceY) {
  const depth = canvas.height - surfaceY;

  // === BATTERY FACTOR ===
  // batteryPct: 0..1  (0 = dead, 1 = full)
  const batteryPct = Math.max(0, battery / BATTERY_MAX);
  
  // When very low (< 20%), add flickering
  let flickerMult = 1.0;
  if (batteryPct < 0.2 && batteryPct > 0) {
    const flicker = Math.sin(performance.now() * 0.025 + Math.random() * 0.5) * 0.5 + 0.5;
    flickerMult = 0.15 + flicker * 0.5; // 0.15 - 0.65 range
  } else if (batteryPct <= 0) {
    // Dead battery - only tiny emergency red blink
    const emergencyBlink = Math.sin(performance.now() * 0.006) > 0.7 ? 0.06 : 0;
    const halfWdead = 18;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const emergG = ctx.createRadialGradient(screenBoatX + 78, keelY - 11, 1, screenBoatX + 78, keelY - 11, halfWdead);
    emergG.addColorStop(0, `rgba(255,60,60,${emergencyBlink})`);
    emergG.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = emergG;
    ctx.beginPath();
    ctx.arc(screenBoatX + 78, keelY - 11, halfWdead, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return; // No main cone when dead
  }

  // Lights upgrade multiplies cone width
  const lightsFactor = 1 + (upgrades.lights - 1) * 0.28;
  const halfW = (140 + Math.sin(performance.now() * 0.001) * 10) * batteryPct * lightsFactor * flickerMult;
  
  // Color shifts to warmer amber when low on battery
  const greenComponent = Math.round(200 + batteryPct * 20);
  const redComponent   = Math.round(110 + (1 - batteryPct) * 140);
  const blueComponent  = Math.round(110 + batteryPct * 60);
  const coneAlpha0 = 0.35 * batteryPct * flickerMult;
  const coneAlpha1 = 0.16 * batteryPct * flickerMult;
  const coneAlpha2 = 0.07 * batteryPct * flickerMult;

  // Main cone
  const cone = ctx.createLinearGradient(screenBoatX, keelY, screenBoatX, canvas.height - 15);
  cone.addColorStop(0,   `rgba(${redComponent},${greenComponent},${blueComponent},${coneAlpha0})`);
  cone.addColorStop(0.2, `rgba(${Math.round(redComponent*0.7)},${Math.round(greenComponent*0.85)},${blueComponent},${coneAlpha1})`);
  cone.addColorStop(0.5, `rgba(${Math.round(redComponent*0.5)},${Math.round(greenComponent*0.7)},${Math.round(blueComponent*0.7)},${coneAlpha2})`);
  cone.addColorStop(1,   "rgba(20,60,30,0)");

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(screenBoatX - 14, keelY + 4);
  ctx.lineTo(screenBoatX - halfW, canvas.height - 25);
  ctx.lineTo(screenBoatX + halfW, canvas.height - 25);
  ctx.lineTo(screenBoatX + 14, keelY + 4);
  ctx.closePath();
  ctx.fillStyle = cone;
  ctx.fill();
  ctx.restore();

  // Soft volumetric glow (scaled by battery)
  if (batteryPct > 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const soft = ctx.createRadialGradient(
      screenBoatX, keelY + depth * 0.35, 0,
      screenBoatX, keelY + depth * 0.35, halfW * 1.1
    );
    soft.addColorStop(0, `rgba(${redComponent},${greenComponent},${blueComponent},${0.15 * batteryPct * flickerMult})`);
    soft.addColorStop(0.5, `rgba(60,150,100,${0.05 * batteryPct * flickerMult})`);
    soft.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = soft;
    ctx.fillRect(screenBoatX - halfW * 1.3, keelY, halfW * 2.6, depth);
    ctx.restore();
  }

  // Caustic shimmer on seabed (only when battery > 30%)
  if (batteryPct > 0.3) {
    const t = performance.now() * 0.0015;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const causticCount = Math.round(8 * batteryPct);
    for (let i = 0; i < causticCount; i++) {
      const cx = screenBoatX + (i - 3.5) * 35 + Math.sin(t + i * 1.5) * 20;
      const cy = canvas.height - 50 - hash(i * 17) * 30;
      const cr = 12 + Math.sin(t * 1.2 + i * 2.1) * 6;
      const ca = (0.04 + Math.sin(t * 0.8 + i * 1.8) * 0.02) * batteryPct * flickerMult;
      ctx.fillStyle = `rgba(120,220,160,${ca})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy, cr * 1.5, cr * 0.4, Math.sin(t + i) * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  
  // Headlight fixture glow on bow (visible even at low battery — it's the source)
  const headGlowAlpha = 0.55 * batteryPct * flickerMult;
  const headGlow = ctx.createRadialGradient(screenBoatX + 78, keelY - 11, 1, screenBoatX + 78, keelY - 11, 14 + batteryPct * 6);
  headGlow.addColorStop(0, `rgba(${redComponent + 60},${greenComponent + 30},200,${headGlowAlpha})`);
  headGlow.addColorStop(1, "rgba(255,255,200,0)");
  ctx.save();
  ctx.fillStyle = headGlow;
  ctx.beginPath();
  ctx.arc(screenBoatX + 78, keelY - 11, 20 + batteryPct * 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}


function drawFishEntity(f, surfaceY) {

  const worldScreenX = f.wx - camera.x;
  if (worldScreenX < -40 || worldScreenX > canvas.width + 40) return;

  const waterCol = canvas.height - surfaceY - 28;
  const fy = surfaceY + (f.depth / 400) * waterCol * 0.92;
  if (fy > canvas.height - 10) return;

  const ang = Math.sin(f.phase) * 0.3;
  ctx.save();
  ctx.translate(worldScreenX, fy);
  ctx.rotate(ang);
  const r = f.size;
  const body = `hsl(${140 + f.hue * 30}, 28%, ${20 + f.hue * 14}%)`;
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.2, r * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  // Eye
  ctx.fillStyle = "rgba(200,220,200,0.4)";
  ctx.beginPath();
  ctx.arc(r * 0.7, -r * 0.1, r * 0.12, 0, Math.PI * 2);
  ctx.fill();
  // Tail
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.moveTo(-r * 1.1, 0);
  ctx.lineTo(-r * 2, -r * 0.5);
  ctx.lineTo(-r * 2, r * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawSeaweed(wx, baseY) {
  const sx = wx - camera.x;
  if (sx < -20 || sx > canvas.width + 20) return;
  ctx.lineCap = "round";
  for (let s = 0; s < 3; s++) {
    const segs = 6;
    let px = sx + s * 7;
    let py = baseY;
    ctx.beginPath();
    ctx.moveTo(px, py);
    for (let g = 1; g <= segs; g++) {
      const t = g / segs;
      px += Math.sin(t * 3 + s + performance.now() * 0.0018) * 9;
      py -= 16 + hash(wx + s * 10 + g) * 6;
      ctx.lineTo(px, py);
    }
    ctx.strokeStyle = `rgba(18,40,25,${0.85 + s * 0.05})`;
    ctx.lineWidth = 3 - s * 0.5;
    ctx.stroke();
  }
}

function drawJellyfish(surfaceY) {
  const t = performance.now() * 0.001;
  const jellies = [
    { wx: 800, depth: 0.45 }, { wx: -400, depth: 0.55 },
    { wx: 2200, depth: 0.38 }, { wx: -1800, depth: 0.62 },
    { wx: 3500, depth: 0.48 }, { wx: -2800, depth: 0.42 }
  ];
  jellies.forEach((j, i) => {
    const sx = j.wx - camera.x;
    if (sx < -60 || sx > canvas.width + 60) return;
    const fy = surfaceY + (canvas.height - surfaceY) * j.depth + Math.sin(t * 0.6 + i * 1.8) * 14;
    const pulse = 0.85 + Math.sin(t * 1.8 + i) * 0.15;
    ctx.save();
    ctx.translate(sx, fy);
    // Bell
    const jr = 18 * pulse;
    const jg = ctx.createRadialGradient(0, 0, 0, 0, 0, jr);
    jg.addColorStop(0, "rgba(200,120,180,0.45)");
    jg.addColorStop(0.7, "rgba(160,80,140,0.25)");
    jg.addColorStop(1, "rgba(100,40,100,0)");
    ctx.fillStyle = jg;
    ctx.beginPath();
    ctx.ellipse(0, 0, jr, jr * 0.6, 0, Math.PI, 0);
    ctx.fill();
    // Bioluminescent core
    ctx.fillStyle = "rgba(220,160,220,0.12)";
    ctx.beginPath();
    ctx.arc(0, -2, jr * 0.3, 0, Math.PI * 2);
    ctx.fill();
    // Tentacles
    ctx.strokeStyle = "rgba(200,100,180,0.18)";
    ctx.lineWidth = 1;
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath();
      ctx.moveTo(k * 5, 0);
      ctx.quadraticCurveTo(k * 5 + Math.sin(t + k) * 8, 18, k * 4 + Math.sin(t * 1.2 + k) * 12, 32);
      ctx.stroke();
    }
    ctx.restore();
  });
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

function drawBoatSide(screenX, surfaceY, bob) {
  const y = surfaceY - 8 + bob;
  ctx.save();
  ctx.translate(screenX, y);

  // 1. Hull Base (layered red-brown)
  ctx.fillStyle = "#7a2020";
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
  
  // Circular portholes with brass rings
  ctx.fillStyle = "#1a2830";
  ctx.beginPath();
  ctx.arc(-53, -25, 5, 0, Math.PI * 2);
  ctx.arc(-31, -25, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(200,220,180,0.3)";
  ctx.beginPath();
  ctx.arc(-53, -25, 5, 0, Math.PI * 2);
  ctx.arc(-31, -25, 5, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.strokeStyle = "#a88848";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(-53, -25, 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-31, -25, 5, 0, Math.PI * 2);
  ctx.stroke();

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

  // 8. Headlight fixture at the bow
  ctx.fillStyle = "#8a6820";
  ctx.fillRect(72, -14, 8, 6);
  ctx.fillStyle = "#ffffaa";
  ctx.fillRect(78, -14, 2, 6);
  
  const headlightGlow = ctx.createRadialGradient(78, -11, 1, 78, -11, 12);
  headlightGlow.addColorStop(0, "rgba(255,255,200,0.6)");
  headlightGlow.addColorStop(1, "rgba(255,255,200,0)");
  ctx.fillStyle = headlightGlow;
  ctx.beginPath();
  ctx.arc(78, -11, 12, 0, Math.PI * 2);
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

  ctx.restore();
}

function drawDetektorHints(surfaceY) {
  detektorSpots.forEach((spot) => {
    if (spot.taken) return;
    const sx = spot.wx - camera.x;
    if (sx < 80 || sx > canvas.width - 80) return;
    const on = Math.abs(spot.wx - player.x) < DETEKTOR_ACTIVATE_RADIUS;
    if (!on) return;
    const wx = spot.wx;
    const groundY =
      canvas.height -
      55 -
      (Math.sin(wx * 0.003) * 50 + Math.sin(wx * 0.01) * 25);
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
  v.addColorStop(0.5, "rgba(2,6,10,0.25)");
  v.addColorStop(1, "rgba(0,4,8,0.85)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle Scanlines (premium gritty nautical vibe)
  ctx.save();
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
  for (let y = 0; y < canvas.height; y += 4) {
    ctx.fillRect(0, y, canvas.width, 2);
  }
  ctx.restore();
}

function drawForegroundMist(surfaceY) {
  // Atmospheric mist at water surface
  const t = performance.now() * 0.00008;
  for (let i = 0; i < 5; i++) {
    const cx = ((i * 400 + t * 60) % (canvas.width + 500)) - 250;
    const cy = surfaceY + Math.sin(t * 10 + i * 1.5) * 8;
    const rx = 200 + hash(i * 19) * 150;
    const ry = 25 + hash(i * 23) * 15;
    ctx.fillStyle = `rgba(100,115,125,${0.04 + hash(i * 31) * 0.03})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Light fog gradient
  const grad = ctx.createLinearGradient(0, surfaceY - 40, 0, surfaceY + 60);
  grad.addColorStop(0, "rgba(100,110,120,0)");
  grad.addColorStop(0.45, "rgba(90,100,110,0.08)");
  grad.addColorStop(1, "rgba(80,90,100,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, surfaceY - 50, canvas.width, 120);
}

// Floating particles in water (marine snow / glowing plankton)
function drawWaterParticles(surfaceY) {
  const t = performance.now() * 0.001;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  // Increased count for better atmosphere
  for (let i = 0; i < 70; i++) {
    const wx = hash(i * 67) * worldWidth - worldWidth / 2;
    const sx = wx - camera.x;
    if (sx < -10 || sx > canvas.width + 10) continue;
    
    // Spread them more deeply
    const depthRatio = hash(i * 83);
    const baseY = surfaceY + 20 + depthRatio * (canvas.height - surfaceY) * 0.95;
    
    const dy = Math.sin(t * 0.4 + i * 2.1) * (10 + depthRatio * 15);
    const dx = Math.sin(t * 0.3 + i * 1.7) * (6 + depthRatio * 8);
    const alpha = 0.05 + Math.sin(t * 0.8 + i * 3) * 0.08 + (danger / 24); // glow more with danger
    
    // Size varies, some are tiny specs, some are larger plankton
    const r = 0.8 + hash(i * 101) * 2.5;
    
    // Create soft glow
    const glowGrad = ctx.createRadialGradient(sx + dx, baseY + dy, 0, sx + dx, baseY + dy, r * 2.5);
    // Tint plankton slightly cyan/green, but shift to warm/aberrant colors if danger is high
    const hue = 160 - (danger * 3); 
    glowGrad.addColorStop(0, `hsla(${hue}, 80%, 80%, ${alpha + 0.1})`);
    glowGrad.addColorStop(0.5, `hsla(${hue}, 70%, 60%, ${alpha * 0.6})`);
    glowGrad.addColorStop(1, `hsla(${hue}, 60%, 40%, 0)`);
    
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(sx + dx, baseY + dy, r * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}


// =====================================================================
// GAME LOOP
// =====================================================================

// =====================================================================
// HELPER FUNCTIONS — CYCLE, DOCK, MARKET, INVENTORY, NARRATIVE, WEATHER
// =====================================================================

function getDaylightFactor() {
  const angle = ((gameTime - 12) / 12) * Math.PI;
  return 0.5 + 0.5 * Math.cos(angle);
}

function getNearDock() {
  return Math.abs(player.x - 2720) < 150;
}

function getNearOilRig() {
  return Math.abs(player.x - OILRIG_WX) < 150;
}

function getNearLighthouse() {
  return Math.abs(player.x - LIGHTHOUSE_WX) < 160;
}

function openDockMenu() {
  dockActive = true;
  currentMenu = "dock";
  
  if (relicsFound === 6) {
    triggerDialogue("Strážce majáku", "Přinesl jsi všech 6 relikvií! Položil jsi je na oltář pod majákem. Celý ostrov se otřásl... Zelené světlo prorazilo temnotu a zahnalo stíny zpět do propasti. Jsi volný. VYHRÁL JSI!");
    relicsFound = 7;
    syncRelicsHud();
    return;
  }
  
  if (dockMenuUI) {
    dockMenuUI.classList.remove("hidden");
  }
  
  // Decrease danger level
  danger = Math.max(0, danger - 4);
  if (dangerUI) dangerUI.innerText = Math.round(danger);
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
    btnRepairShip.addEventListener("click", () => {
      if (gold >= 25) {
        gold -= 25;
        if (goldUI) goldUI.innerText = gold;
        danger = 0;
        if (dangerUI) dangerUI.innerText = danger;
        triggerScreenShake(5);
      }
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

  if (btnDialogNext) {
    btnDialogNext.addEventListener("click", () => skipTypewriter());
  }
}

function updateMarketUI() {
  let common = 0, uncommon = 0, rare = 0, aberrant = 0, reef = 0;
  let totalVal = 0;

  inventory.forEach(f => {
    totalVal += f.price;
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
  inventory.forEach(f => {
    totalVal += f.price;
  });
  
  gold += totalVal;
  if (goldUI) goldUI.innerText = gold;
  
  const count = inventory.length;
  inventory = [];
  caughtFish = 0;
  if (fishUI) fishUI.innerText = caughtFish;
  
  updateInventoryUI();
  updateMarketUI();
  
  if (marketResultEl) {
    marketResultEl.textContent = `Prodáno ${count} ryb za $${totalVal}!`;
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
  
  updateOilRigUI();
  if (oilrigResultEl) {
    oilrigResultEl.textContent = `Vylepšení zakoupeno!`;
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

function updateInventoryUI() {
  if (!inventoryGridEl) return;
  inventoryGridEl.innerHTML = "";
  
  if (inventoryCapacityEl) {
    inventoryCapacityEl.textContent = `Kapacita: ${inventory.length} / 12`;
  }
  
  for (let i = 0; i < 12; i++) {
    const slotEl = document.createElement("div");
    slotEl.className = "inventory-slot";
    
    if (i < inventory.length) {
      const fish = inventory[i];
      slotEl.classList.add(`rarity-${fish.rarity}`);
      
      const iconEl = document.createElement("span");
      iconEl.className = "fish-icon";
      iconEl.textContent = fish.icon || "🐟";
      slotEl.appendChild(iconEl);
      
      const tooltipEl = document.createElement("div");
      tooltipEl.className = "inventory-tooltip";
      
      let rarityText = "Běžná";
      if (fish.rarity === "uncommon") rarityText = "Neobvyklá";
      else if (fish.rarity === "rare") rarityText = "Vzácná";
      else if (fish.rarity === "aberrant") rarityText = "Abnormální";
      
      tooltipEl.innerHTML = `
        <strong>${fish.name}</strong><br>
        <span style="color:#a89878; font-size:0.75rem;">${rarityText}</span><br>
        <span style="color:#d8cbb0;">$${fish.price}</span>
      `;
      slotEl.appendChild(tooltipEl);
    } else {
      slotEl.innerHTML = `<span style="opacity: 0.15; font-size: 1.6rem;">🐟</span>`;
    }
    
    inventoryGridEl.appendChild(slotEl);
  }
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
  gameOver = false;
  danger = 0;
  gold = Math.max(0, gold - 100);
  inventory = [];
  caughtFish = 0;
  relicsFound = 0;
  
  upgrades.engine = 1;
  upgrades.lights = 1;
  upgrades.hull = 1;
  player.speed = 2.8;
  
  player.x = 2400; 
  camera.x = 2400 - canvas.width / 2;
  
  gameTime = 7.75;
  dayNum = 1;
  
  dangerThresh3 = false;
  dangerThresh6 = false;
  dangerThresh9 = false;
  
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
  
  triggerDialogue("Nový začátek", "Procitáš v přístavu, s třeštící hlavou a prázdným podpalubím. Byl to jen sen? Nebo tě moře vrátilo zpět?");
}

function updateScreenShake() {
  if (shakeIntensity > 0) {
    shakeIntensity *= 0.9;
    if (shakeIntensity < 0.1) shakeIntensity = 0;
  }
}

function triggerScreenShake(intensity) {
  shakeIntensity = intensity;
}

function drawDockStructure(surfaceY) {
  const sx = 2720 - camera.x;
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

function drawDeepEyes(surfaceY) {
  if (danger < 3) return;
  const t = performance.now() * 0.002;
  
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const wx = hash(i * 19) * worldWidth - worldWidth / 2;
    const sx = wx - camera.x;
    
    if (sx < 50 || sx > canvas.width - 50) continue;
    
    const ey = surfaceY + 120 + hash(i * 31) * (canvas.height - surfaceY - 180);
    const blink = Math.sin(t * 0.5 + i * 3) > -0.85 ? 1 : 0;
    
    if (blink > 0) {
      ctx.fillStyle = "rgba(255, 30, 60, 0.85)";
      ctx.shadowColor = "rgba(255, 30, 60, 0.9)";
      ctx.shadowBlur = 10;
      
      ctx.beginPath();
      ctx.arc(sx - 8, ey, 2.5, 0, Math.PI * 2);
      ctx.arc(sx + 8, ey, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
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
    p.y += p.speed;
    p.x -= p.speed * 0.25;
    
    if (p.y > canvas.height || p.x < -20) {
      p.x = Math.random() * (canvas.width + 100);
      p.y = -20;
    }
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

function drawRollingFog(surfaceY) {
  const t = performance.now() * 0.0001;
  const daylight = getDaylightFactor();
  const opacity = 0.05 + (1 - daylight) * 0.12 + (danger / 12) * 0.15;
  
  ctx.save();
  ctx.globalAlpha = opacity;
  for (let i = 0; i < 4; i++) {
    const cx = ((i * 500 + t * 40) % (canvas.width + 800)) - 400;
    const cy = surfaceY + 10 + Math.sin(t * 8 + i * 2) * 15;
    const rx = 300 + hash(i * 17) * 200;
    const ry = 40 + hash(i * 23) * 20;
    
    const fogGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    fogGlow.addColorStop(0, "rgba(80,95,105,0.4)");
    fogGlow.addColorStop(0.5, "rgba(65,80,90,0.15)");
    fogGlow.addColorStop(1, "rgba(50,60,70,0)");
    
    ctx.fillStyle = fogGlow;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// =====================================================================
// GAME LOOP
// =====================================================================

function gameLoop() {
  const surfaceY = getSurfaceY();

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
    } else {
      regionEl.textContent = "The Marrows";
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

  // === BACKGROUND COAST (far) ===
  drawRockyCoast(surfaceY, 0.12, 15, false);
  drawPineForest(surfaceY, 0.15, 300, 18, 0.8);

  // === MID COAST ===
  drawRockyCoast(surfaceY, 0.25, 5, true);
  drawTownBuildings(surfaceY);
  drawPineForest(surfaceY, 0.3, 80, 14, 1.1);

  // === DOCK STRUCTURE ===
  drawDockStructure(surfaceY);
  drawOilRig(surfaceY);
  drawRollingFog(surfaceY);

  // === WATER SURFACE ===
  drawWaterSurface(surfaceY);
  drawBubbles(surfaceY);

  // Fishing prompt
  if (!fishingMode && !detektorMode && getBubbleNearPlayer()) {
    ctx.save();
    ctx.font = "600 15px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,245,230,0.95)";
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = 8;
    ctx.fillText("SPACE \u2014 za\u010D\u00EDt ryba\u0159it", canvas.width / 2, surfaceY - 28);
    ctx.restore();
  }

  // Detector prompt
  if (!fishingMode && !detektorMode && getDetektorSpotNearPlayer()) {
    ctx.save();
    ctx.font = "600 15px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(180,230,210,0.95)";
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = 8;
    ctx.fillText("F \u2014 detektor / hled\u00E1n\u00ED pokladu", canvas.width / 2, surfaceY - 50);
    ctx.restore();
  }

  // Dock prompt
  if (!fishingMode && !detektorMode && getNearDock()) {
    ctx.save();
    ctx.font = "600 15px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255, 230, 160, 0.95)";
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = 8;
    ctx.fillText("E \u2014 zakotvit v přístavu", canvas.width / 2, surfaceY - 72);
    ctx.restore();
  }

  const screenBoatX = canvas.width / 2;

  // === UNDERWATER ===
  drawUnderwater(surfaceY);
  drawDeepEyes(surfaceY);
  drawShadowCreature(surfaceY);
  drawLighthouseCliffUnderwater(surfaceY);
  drawSeabed(surfaceY);
  drawCoralReef(surfaceY);
  drawUnderwaterCaustics(surfaceY);

  // Seaweed
  for (let wx = -2000; wx < 8000; wx += 140) {
    const ground =
      canvas.height - 40 -
      Math.sin(wx * 0.003) * 42 -
      Math.sin(wx * 0.01) * 18 -
      hash(wx) * 12;
    drawSeaweed(wx + hash(wx) * 40, ground);
  }

  // Draw light cone from bow headlight — battery-aware
  const bob = boatBob();
  const keelY = surfaceY + 8 + bob;
  drawLightCone(screenBoatX, keelY, surfaceY);


  drawWaterParticles(surfaceY);
  fish.forEach((f) => drawFishEntity(f, surfaceY));
  drawJellyfish(surfaceY);

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

  // === FOREGROUND: LIGHTHOUSE ===
  drawLighthouseCliff(surfaceY);
  drawCliffPines(surfaceY);
  drawLighthouseTower(surfaceY);

  // Sparkles
  sparkles.forEach((sp) => {
    const sx = sp.wx - camera.x;
    if (sx < 0 || sx > canvas.width) return;
    const sy = surfaceY + sp.y * (canvas.height - surfaceY) * 0.85;
    const tw = Math.sin(sp.a + performance.now() * 0.001 * sp.sp) * 0.5 + 0.5;
    ctx.fillStyle = `rgba(200,220,255,${0.04 + tw * 0.06})`;
    ctx.fillRect(sx, sy, 2, 2);
  });

  // === ATMOSPHERIC EFFECTS ===
  drawForegroundMist(surfaceY);
  drawRollingFog(surfaceY);
  drawRain();
  drawVignette();

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

  ctx.restore();

  if (dangerUI) dangerUI.innerText = Math.round(danger);

  updateFishingHudVisuals();
  updateDetektorHudVisuals();

  requestAnimationFrame(gameLoop);
}

syncRelicsHud();
initFishingRingSvg();
initMenuButtons();
updateInventoryUI();
gameLoop();
