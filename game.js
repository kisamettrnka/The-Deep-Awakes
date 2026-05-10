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

let fishingMode = false;
let fishingLocked = false;
let fishingStartTime = 0;
let catchProgress = 0;
let redStreak = 0;

/** Úhel od 12:00 po směru hodinových ručiček, 0 = nahoru. */
const FISHING_GREEN_ZONES = [
  [5 * Math.PI / 3 - 0.32, 5 * Math.PI / 3 + 0.26],
  [5 * Math.PI / 6 - 0.2, Math.PI + 0.2]
];

/** Rychlost jehly v rad/s (≈ jedna otáčka za 3,8 s při 1,65). */
const FISHING_SPIN_SPEED = 1.65;
const FISHING_HITS_TO_LAND = 4;
const BUBBLE_ACTIVATE_RADIUS = 130;

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

const goldUI = document.getElementById("gold");
const fishUI = document.getElementById("fish");
const dangerUI = document.getElementById("danger");
const clockEl = document.getElementById("clock");
const dayEl = document.getElementById("day-label");
const relicsEl = document.getElementById("relics");

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
  x: 0,
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

const worldWidth = 12000;

const camera = {
  x: 0
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
  const d = FISHING_GREEN_ZONES.map(([a0, a1]) => ringArcD(cx, cy, r, a0, a1)).join(" ");
  fishingGreenArcsEl.setAttribute("d", d);
}

function isNeedleInGreen(theta) {
  return FISHING_GREEN_ZONES.some(([a0, a1]) => angleInSpan(theta, a0, a1));
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
  let bestD = BUBBLE_ACTIVATE_RADIUS;
  for (let i = 0; i < bubbleSpots.length; i++) {
    const d = Math.abs(player.x - bubbleSpots[i].wx);
    if (d < bestD) {
      bestD = d;
      best = bubbleSpots[i];
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
    if (catchProgress >= 1 - 1e-9) {
      endFishingSuccess();
    }
  } else {
    redStreak++;
    showFishingRedHint();
    if (redStreak >= 3) {
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
  if (fishingResultEl) {
    fishingResultEl.textContent = "Úlovek!";
    fishingResultEl.className = "fishing-result ok";
    fishingResultEl.classList.remove("hidden");
  }
  window.setTimeout(() => {
    caughtFish++;
    gold += 8;
    if (fishUI) fishUI.innerText = caughtFish;
    if (goldUI) goldUI.innerText = gold;
    fishingLocked = false;
    closeFishingPanel();
    if (fishingResultEl) fishingResultEl.classList.add("hidden");
  }, 750);
}

function endFishingFail() {
  fishingLocked = true;
  if (fishingResultEl) {
    fishingResultEl.textContent = "Tři chyby — ryba unikla.";
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
  if (detektorMode) tryDetektorHit();
  else if (fishingMode) tryFishingHit();
  else tryStartFishing();
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
  window.setTimeout(() => {
    if (spot) spot.taken = true;
    gold += 28 + Math.floor(Math.random() * 14);
    if (relicsFound < 6) relicsFound++;
    if (goldUI) goldUI.innerText = gold;
    syncRelicsHud();
    detektorLocked = false;
    detektorRedStreak = 0;
    closeDetektorPanel();
    if (detektorResultEl) detektorResultEl.classList.add("hidden");
  }, 780);
}

function endDetektorFail() {
  detektorLocked = true;
  if (detektorResultEl) {
    detektorResultEl.textContent = "Signál ztracen — zkuste jiný průjezd.";
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
  keys[e.key.toLowerCase()] = true;
  if (e.code === "Space" || e.key === " ") {
    e.preventDefault();
    if (!e.repeat) handleSpaceAction();
  }
  if ((e.key === "f" || e.key === "F") && !e.repeat) {
    tryStartDetektor();
  }
});

window.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});

function update() {
  if (fishingMode || detektorMode) return;

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

  const t = performance.now() * 0.0001;
  if (Math.floor(t * 2) % 40 === 0) {
    danger += 0;
  }
}

function formatTime(h) {
  const hh = Math.floor(h) % 24;
  const mm = Math.floor((h % 1) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function drawSky(surfaceY) {
  const g = ctx.createLinearGradient(0, 0, 0, surfaceY);
  g.addColorStop(0, "#2a3a52");
  g.addColorStop(0.45, "#4a5f76");
  g.addColorStop(0.85, "#6a7d8e");
  g.addColorStop(1, "#8a9bab");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, surfaceY);

  ctx.fillStyle = "rgba(180,200,220,0.08)";
  for (let i = 0; i < 5; i++) {
    const y = 30 + i * 35 + Math.sin(performance.now() * 0.0003 + i) * 8;
    ctx.beginPath();
    ctx.ellipse(canvas.width * 0.3 + i * 180, y, 120 + i * 20, 22, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCoastSilhouette(surfaceY, parallax) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, surfaceY);
  for (let x = 0; x <= canvas.width + 80; x += 40) {
    const wx = x + camera.x * parallax;
    const n = Math.sin(wx * 0.002) * 40 + Math.sin(wx * 0.005) * 25;
    ctx.lineTo(x, surfaceY - 120 - n);
  }
  ctx.lineTo(canvas.width, surfaceY);
  ctx.closePath();
  ctx.fillStyle = "#1c2633";
  ctx.fill();
  ctx.restore();
}

function drawTrees(wxOffset, surfaceY, parallax, count, scale) {
  const baseWx = camera.x * parallax;
  for (let i = 0; i < count; i++) {
    const wx =
      wxOffset +
      i * 200 * scale +
      hash(i * 13 + wxOffset) * 100 -
      baseWx +
      canvas.width * 0.2;
    if (wx < -80 || wx > canvas.width + 80) continue;
    const w = 14 * scale;
    const h = (50 + hash(i + wxOffset) * 35) * scale;
    ctx.fillStyle = "#152028";
    ctx.beginPath();
    ctx.moveTo(wx, surfaceY - h);
    ctx.lineTo(wx + w, surfaceY);
    ctx.lineTo(wx - w, surfaceY);
    ctx.closePath();
    ctx.fill();
  }
}

function drawLighthouse(surfaceY) {
  const wx = 2100;
  const sx = wx - camera.x * 0.25;
  if (sx < -60 || sx > canvas.width + 60) return;
  const ground = surfaceY - 90 - Math.sin(wx * 0.002) * 15;
  const h = 110;
  const w = 22;
  ctx.fillStyle = "#3a3530";
  ctx.fillRect(sx - 8, ground, 48, 12);
  for (let y = 0; y < h; y += 14) {
    const stripe = Math.floor(y / 14) % 2 === 0;
    ctx.fillStyle = stripe ? "#c44" : "#e8e8e8";
    ctx.fillRect(sx - w / 2, ground - y - 14, w, 14);
  }
  ctx.fillStyle = "#2a2826";
  ctx.beginPath();
  ctx.moveTo(sx - 18, ground - h);
  ctx.lineTo(sx, ground - h - 28);
  ctx.lineTo(sx + 18, ground - h);
  ctx.closePath();
  ctx.fill();
  const glow = ctx.createRadialGradient(sx, ground - h - 12, 2, sx, ground - h - 12, 40);
  glow.addColorStop(0, "rgba(255,220,160,0.9)");
  glow.addColorStop(0.4, "rgba(255,200,120,0.25)");
  glow.addColorStop(1, "rgba(255,200,100,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(sx, ground - h - 8, 35, 0, Math.PI * 2);
  ctx.fill();
}

function drawTownLights(surfaceY) {
  const startWx = 2800;
  for (let i = 0; i < 18; i++) {
    const wx = startWx + i * 55 + hash(i * 7) * 20;
    const sx = wx - camera.x * 0.22;
    if (sx < 0 || sx > canvas.width) continue;
    const bump = Math.sin(wx * 0.01) * 6;
    const gy = surfaceY - 55 - bump - hash(i) * 25;
    ctx.fillStyle = "rgba(40,48,58,0.95)";
    ctx.fillRect(sx - 10, gy, 24, 20 + hash(i + 1) * 15);
    ctx.fillStyle = `rgba(255,200,120,${0.35 + hash(i + 2) * 0.5})`;
    ctx.fillRect(sx - 4, gy + 6, 6, 8);
  }
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

function drawWaterSurface(surfaceY) {
  ctx.strokeStyle = "rgba(200,220,235,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  const t = performance.now() * 0.002;
  for (let x = 0; x <= canvas.width; x += 8) {
    const y = surfaceY + Math.sin(x * 0.02 + t) * 2 + Math.sin(x * 0.05 + t * 1.3) * 1;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.strokeStyle = "rgba(100,140,170,0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= canvas.width; x += 6) {
    const y = surfaceY + 3 + Math.sin(x * 0.025 + t * 0.8);
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawUnderwater(surfaceY) {
  const g = ctx.createLinearGradient(0, surfaceY, 0, canvas.height);
  g.addColorStop(0, "#152a38");
  g.addColorStop(0.35, "#0d1a24");
  g.addColorStop(1, "#050a10");
  ctx.fillStyle = g;
  ctx.fillRect(0, surfaceY, canvas.width, canvas.height - surfaceY);
}

function drawSeabed(surfaceY) {
  ctx.beginPath();
  ctx.moveTo(0, canvas.height);
  for (let x = 0; x <= canvas.width + 60; x += 30) {
    const worldX = camera.x + x;
    const roll =
      Math.sin(worldX * 0.0035) * 45 +
      Math.sin(worldX * 0.011) * 22 +
      hash(Math.floor(worldX / 50)) * 18;
    const y = canvas.height - 55 - roll;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(canvas.width, canvas.height);
  ctx.lineTo(0, canvas.height);
  ctx.closePath();
  const gb = ctx.createLinearGradient(0, canvas.height - 120, 0, canvas.height);
  gb.addColorStop(0, "#2d3540");
  gb.addColorStop(1, "#121620");
  ctx.fillStyle = gb;
  ctx.fill();

  ctx.strokeStyle = "rgba(20,30,42,0.6)";
  ctx.lineWidth = 2;
  for (let i = 0; i < seabedFeatures.length; i++) {
    const s = seabedFeatures[i];
    const sx = s.wx - camera.x;
    if (sx < -150 || sx > canvas.width + 150) continue;
    const by = canvas.height - s.height - 20;
    ctx.beginPath();
    ctx.moveTo(sx, by + s.height);
    ctx.quadraticCurveTo(sx + s.w * 0.5, by - 15, sx + s.w, by + s.height);
    ctx.strokeStyle = "rgba(25,38,50,0.85)";
    ctx.stroke();
  }
}

function drawLightCone(screenBoatX, keelY, surfaceY) {
  const depth = canvas.height - surfaceY;
  const halfW = 160 + Math.sin(performance.now() * 0.001) * 10;

  const cone = ctx.createLinearGradient(screenBoatX, keelY, screenBoatX, canvas.height - 20);
  cone.addColorStop(0, "rgba(200,230,255,0.22)");
  cone.addColorStop(0.25, "rgba(120,160,200,0.08)");
  cone.addColorStop(1, "rgba(20,40,60,0)");

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(screenBoatX - 18, keelY + 4);
  ctx.lineTo(screenBoatX - halfW, canvas.height - 30);
  ctx.lineTo(screenBoatX + halfW, canvas.height - 30);
  ctx.lineTo(screenBoatX + 18, keelY + 4);
  ctx.closePath();
  ctx.fillStyle = cone;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const soft = ctx.createRadialGradient(screenBoatX, keelY + depth * 0.35, 0, screenBoatX, keelY + depth * 0.35, halfW * 1.1);
  soft.addColorStop(0, "rgba(180,210,240,0.15)");
  soft.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = soft;
  ctx.fillRect(screenBoatX - halfW * 1.2, keelY, halfW * 2.4, depth);
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
  const body = `hsl(${180 + f.hue * 40}, 45%, ${42 + f.hue * 15}%)`;
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.2, r * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
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
  ctx.strokeStyle = "rgba(30,55,45,0.85)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  for (let s = 0; s < 3; s++) {
    ctx.beginPath();
    ctx.moveTo(sx + s * 8, baseY);
    const segs = 5;
    let px = sx + s * 8;
    let py = baseY;
    for (let g = 1; g <= segs; g++) {
      const t = g / segs;
      px += Math.sin(t * 3 + s + performance.now() * 0.002) * 10;
      py -= 18 + hash(wx + s * 10 + g) * 5;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
}

function boatBob() {
  return Math.sin(performance.now() * 0.0018) * 2;
}

function drawBoatSide(screenX, surfaceY, bob) {
  const y = surfaceY - 8 + bob;

  ctx.save();
  ctx.translate(screenX, y);

  ctx.fillStyle = "#2a2220";
  ctx.beginPath();
  ctx.moveTo(-85, -6);
  ctx.lineTo(78, -6);
  ctx.lineTo(88, 16);
  ctx.lineTo(-88, 16);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#1e3a52";
  ctx.fillRect(-75, -38, 150, 32);
  ctx.fillStyle = "#2a5080";
  ctx.fillRect(-65, -48, 55, 20);
  ctx.fillRect(5, -42, 48, 16);

  ctx.fillStyle = "#c43c3c";
  ctx.beginPath();
  ctx.moveTo(-95, 16);
  ctx.lineTo(92, 16);
  ctx.lineTo(88, 32);
  ctx.lineTo(-90, 32);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#eaeaea";
  ctx.beginPath();
  ctx.moveTo(-70, -6);
  ctx.lineTo(65, -6);
  ctx.lineTo(62, 8);
  ctx.lineTo(-68, 8);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.arc(-30, -20, 5, 0, Math.PI * 2);
  ctx.arc(35, -20, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(-75, -38, 150, 32);

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
      (Math.sin(wx * 0.0035) * 45 + Math.sin(wx * 0.011) * 22);
    ctx.save();
    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = on ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.25)";
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
    canvas.width / 2,
    canvas.height / 2,
    canvas.height * 0.25,
    canvas.width / 2,
    canvas.height / 2,
    canvas.height * 0.75
  );
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,15,25,0.55)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawForegroundMist(surfaceY) {
  const grad = ctx.createLinearGradient(0, surfaceY - 40, 0, surfaceY + 60);
  grad.addColorStop(0, "rgba(120,140,160,0)");
  grad.addColorStop(0.5, "rgba(100,120,140,0.12)");
  grad.addColorStop(1, "rgba(80,100,120,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, surfaceY - 50, canvas.width, 110);
}

function gameLoop() {
  const surfaceY = getSurfaceY();

  update();

  if (clockEl) clockEl.textContent = formatTime(gameTime);
  if (dayEl) dayEl.textContent = `Den ${dayNum}`;

  ctx.save();

  drawSky(surfaceY);
  drawCoastSilhouette(surfaceY, 0.15);
  drawTrees(400, surfaceY, 0.2, 14, 1);
  drawCoastSilhouette(surfaceY, 0.28);
  drawTownLights(surfaceY);
  drawTrees(100, surfaceY, 0.35, 10, 1.2);
  drawLighthouse(surfaceY);

  drawWaterSurface(surfaceY);
  drawBubbles(surfaceY);

  if (!fishingMode && !detektorMode && getBubbleNearPlayer()) {
    ctx.save();
    ctx.font = "600 15px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,245,230,0.95)";
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = 8;
    ctx.fillText("SPACE — začít rybařit", canvas.width / 2, surfaceY - 28);
    ctx.restore();
  }

  if (!fishingMode && !detektorMode && getDetektorSpotNearPlayer()) {
    ctx.save();
    ctx.font = "600 15px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(180,230,210,0.95)";
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = 8;
    ctx.fillText("F — detektor / hledání pokladu", canvas.width / 2, surfaceY - 50);
    ctx.restore();
  }

  const screenBoatX = canvas.width / 2;
  drawUnderwater(surfaceY);
  drawSeabed(surfaceY);

  for (let wx = -2000; wx < 8000; wx += 140) {
    const ground =
      canvas.height -
      40 -
      Math.sin(wx * 0.0035) * 38 -
      Math.sin(wx * 0.011) * 16 -
      hash(wx) * 12;
    drawSeaweed(wx + hash(wx) * 40, ground);
  }

  const bob = boatBob();
  const keelY = surfaceY + 8 + bob;
  drawLightCone(screenBoatX, keelY, surfaceY);

  fish.forEach((f) => drawFishEntity(f, surfaceY));

  drawBoatSide(screenBoatX, surfaceY, bob);

  drawDetektorHints(surfaceY);

  sparkles.forEach((sp) => {
    const sx = sp.wx - camera.x;
    if (sx < 0 || sx > canvas.width) return;
    const sy = surfaceY + sp.y * (canvas.height - surfaceY) * 0.85;
    const tw = Math.sin(sp.a + performance.now() * 0.001 * sp.sp) * 0.5 + 0.5;
    ctx.fillStyle = `rgba(200,220,255,${0.04 + tw * 0.06})`;
    ctx.fillRect(sx, sy, 2, 2);
  });

  drawForegroundMist(surfaceY);
  drawVignette();

  const darkness = Math.min(danger * 0.03, 0.35);
  ctx.fillStyle = `rgba(0,5,12,${darkness})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.restore();

  if (dangerUI) dangerUI.innerText = danger;

  updateFishingHudVisuals();
  updateDetektorHudVisuals();

  requestAnimationFrame(gameLoop);
}

syncRelicsHud();
initFishingRingSvg();
gameLoop();
