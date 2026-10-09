// =====================================================================
// THE DEEP AWAKES — Fish Database
// 12 open-sea + 6 reef + 4 oil rig species (Common, Uncommon, Rare, Aberrant)
// =====================================================================

// Fishing minigame tuning per species:
//   difficulty 1–5 — needle speed, green-zone width, hits needed, slip on a miss
//   traits: "reverse" (needle flips direction), "erratic" (needle speed surges),
//           "drift" (green zones wander around the ring), "shrink" (zones narrow as the fish tires)
//   shape — silhouette drawn in the centre of the fishing ring
//
// Selling price is driven mainly by weight (kg): every caught fish rolls its own weight
// within the species' `weight` range and sells for weight × FISH_PRICE_PER_KG.
// Only a few species carry a small premium via `priceMult` (rare and aberrant ones).

// Reef zone boundaries (world x)
const REEF_WX_START = -3800;
const REEF_WX_END   = -1800;

function isInReefZone(playerX) {
  return playerX >= REEF_WX_START && playerX <= REEF_WX_END;
}

// Oil rig zone boundaries
const OILRIG_WX      = 5800;
const OILRIG_WX_START = 4800;
const OILRIG_WX_END   = 6800;

function isInOilRigZone(playerX) {
  return playerX >= OILRIG_WX_START && playerX <= OILRIG_WX_END;
}

const FISH_SPECIES = [
  {
    id: "herring",
    difficulty: 1,
    traits: [],
    shape: "slim",
    name: "Sleď obecný",
    rarity: "common",
    weight: [0.5, 1.8],
    icon: "🐟",
    color: "#8aa6b5",
    desc: "Obyčejná stříbrná rybka. Plave v mělčinách a drží se v hejnech.",
    depthMin: 30,
    depthMax: 150,
    timeOfDay: "any"
  },
  {
    id: "mackerel",
    difficulty: 2,
    traits: ["erratic"],
    shape: "slim",
    name: "Makrela modrá",
    rarity: "common",
    weight: [0.7, 2.2],
    icon: "🐟",
    color: "#6b8ea0",
    desc: "Rychlý plavec s pruhovaným hřbetem. Chutná, ale nijak zvláštní.",
    depthMin: 40,
    depthMax: 180,
    timeOfDay: "day"
  },
  {
    id: "cod",
    difficulty: 1,
    traits: [],
    shape: "round",
    name: "Treska tmavá",
    rarity: "common",
    weight: [1.5, 5],
    icon: "🐟",
    color: "#8c9c7c",
    desc: "Spolehlivý úlovek chladných moří. Živí se při dně.",
    depthMin: 100,
    depthMax: 260,
    timeOfDay: "any"
  },
  {
    id: "flatfish",
    difficulty: 1,
    traits: [],
    shape: "flat",
    name: "Platýs bradavičnatý",
    rarity: "common",
    weight: [1, 3.5],
    icon: "🐠",
    color: "#7c6a58",
    desc: "Plochá ryba ležící na písku. Obě oči má na jedné straně hlavy.",
    depthMin: 120,
    depthMax: 300,
    timeOfDay: "any"
  },
  {
    id: "eel",
    difficulty: 3,
    traits: ["reverse"],
    shape: "eel",
    name: "Úhoř mořský",
    rarity: "uncommon",
    weight: [1, 3.5],
    icon: "🐍",
    color: "#3a4a3e",
    desc: "Slizký, hadovitý tvor. Nerad se nechává chytit.",
    depthMin: 80,
    depthMax: 220,
    timeOfDay: "night"
  },
  {
    id: "salmon",
    difficulty: 3,
    traits: ["erratic"],
    shape: "slim",
    name: "Losos divoký",
    rarity: "uncommon",
    weight: [2, 6.5],
    icon: "🐟",
    color: "#c08080",
    desc: "Svalnatá ryba bojující proti proudu. Má narůžovělé maso.",
    depthMin: 50,
    depthMax: 200,
    timeOfDay: "day"
  },
  {
    id: "skate",
    difficulty: 2,
    traits: ["drift"],
    shape: "ray",
    name: "Rejnok ostnatý",
    rarity: "uncommon",
    weight: [2.5, 8],
    icon: "🛸",
    color: "#544e45",
    desc: "Plochý paryba s bičovitým ocasem. Plachtí vodou jako stín.",
    depthMin: 150,
    depthMax: 340,
    timeOfDay: "any"
  },
  {
    id: "angler",
    difficulty: 4,
    traits: ["drift"],
    shape: "angler",
    name: "Ďas mořský",
    rarity: "rare",
    weight: [4, 14],
    priceMult: 1.2,
    icon: "👹",
    color: "#4a3c3c",
    desc: "Dravá hlubinná ryba s bioluminiscenční lucerničkou na hlavě.",
    depthMin: 220,
    depthMax: 380,
    timeOfDay: "night"
  },
  {
    id: "gulper",
    difficulty: 4,
    traits: ["reverse"],
    shape: "gulper",
    name: "Šírotlamka hlubinná",
    rarity: "rare",
    weight: [5, 16],
    priceMult: 1.2,
    icon: "🐲",
    color: "#2a2233",
    desc: "Skoro celé její tělo tvoří obrovská rozevíratelná tlama plná jehliček.",
    depthMin: 260,
    depthMax: 400,
    timeOfDay: "night"
  },
  {
    id: "aberrant_eye",
    difficulty: 5,
    traits: ["drift", "shrink"],
    shape: "eye",
    name: "Jednooká parma",
    rarity: "aberrant",
    weight: [4, 12],
    priceMult: 1.6,
    icon: "👁️",
    color: "#a62b4c",
    desc: "Narušená mutace ryby. Její jediné lidsky vyhlížející oko tě upřeně sleduje.",
    depthMin: 80,
    depthMax: 280,
    timeOfDay: "night"
  },
  {
    id: "aberrant_tentacle",
    difficulty: 5,
    traits: ["reverse", "erratic"],
    shape: "squid",
    name: "Chapadlovitá makrela",
    rarity: "aberrant",
    weight: [6, 18],
    priceMult: 1.6,
    icon: "🦑",
    color: "#7e2a8c",
    desc: "Namísto běžných ploutví jí ze stran vyrůstají malá chvějící se chapadélka.",
    depthMin: 120,
    depthMax: 320,
    timeOfDay: "night"
  },
  {
    id: "aberrant_maw",
    difficulty: 5,
    traits: ["erratic", "shrink"],
    shape: "maw",
    name: "Zubatý škleb",
    rarity: "aberrant",
    weight: [7, 20],
    priceMult: 1.6,
    icon: "💀",
    color: "#421832",
    desc: "Její tělo je pokryté nepravidelnými zuby, které při vytažení z vody tiše cvakají.",
    depthMin: 200,
    depthMax: 400,
    timeOfDay: "night"
  },

  // ─── KORÁLOVÝ ÚTES — unikátní druhy ──────────────────────────────
  {
    id: "clownfish",
    difficulty: 1,
    traits: ["drift"],
    shape: "round",
    name: "Klaun korálový",
    rarity: "common",
    weight: [1, 3],
    icon: "🐠",
    color: "#e86020",
    desc: "Pestrobarevná rybka skrývající se v sasankách. Na útesu ji najdeš všude.",
    depthMin: 20,
    depthMax: 160,
    timeOfDay: "day",
    reefOnly: true
  },
  {
    id: "parrotfish",
    difficulty: 2,
    traits: [],
    shape: "round",
    name: "Ryba papouščí",
    rarity: "uncommon",
    weight: [2, 6],
    icon: "🦜",
    color: "#28c87a",
    desc: "Žvýká korály a exkretuje bílý písek. Její zuby vypadají jako zobák.",
    depthMin: 30,
    depthMax: 200,
    timeOfDay: "day",
    reefOnly: true
  },
  {
    id: "lionfish",
    difficulty: 3,
    traits: ["shrink"],
    shape: "spiny",
    name: "Ryba lví",
    rarity: "uncommon",
    weight: [1.5, 5],
    icon: "🦁",
    color: "#c84040",
    desc: "Jedovaté ostny zdobí její rozepjaté ploutve. Krásná, ale smrtelně nebezpečná.",
    depthMin: 60,
    depthMax: 250,
    timeOfDay: "any",
    reefOnly: true
  },
  {
    id: "mantaray",
    difficulty: 4,
    traits: ["drift"],
    shape: "ray",
    name: "Manta obrovská",
    rarity: "rare",
    weight: [8, 22],
    priceMult: 1.2,
    icon: "🌊",
    color: "#1a3a5c",
    desc: "Obří paryba plachtí vodou jako temný stín. Neškodná — pokud ji nevyrušíš.",
    depthMin: 80,
    depthMax: 320,
    timeOfDay: "any",
    reefOnly: true
  },
  {
    id: "reef_ghost",
    difficulty: 4,
    traits: ["reverse"],
    shape: "ghost",
    name: "Duch útesu",
    rarity: "rare",
    weight: [4, 11],
    priceMult: 1.3,
    icon: "👻",
    color: "#aaeecc",
    desc: "Průsvitná ryba, téměř neviditelná. Místní rybáři tvrdí, že se tvoří z duší ztracených námořníků.",
    depthMin: 100,
    depthMax: 380,
    timeOfDay: "night",
    reefOnly: true
  },
  {
    id: "aberrant_coral",
    difficulty: 5,
    traits: ["drift", "shrink"],
    shape: "coral",
    name: "Korálový přízrak",
    rarity: "aberrant",
    weight: [6, 16],
    priceMult: 1.6,
    icon: "🪸",
    color: "#ff3399",
    desc: "Živý korálovitý útvar, který se pohybuje. Při pohledu na něj cítíš, jak ti mysl praská.",
    depthMin: 40,
    depthMax: 400,
    timeOfDay: "night",
    reefOnly: true
  },

  // ─── ROPNÁ VĚŽ — kontaminované vody ──────────────────────────────
  {
    id: "oil_flounder",
    difficulty: 2,
    traits: [],
    shape: "flat",
    name: "Ropný platýs",
    rarity: "common",
    weight: [1.5, 4.5],
    icon: "🐟",
    color: "#4a3c28",
    desc: "Pokrytý ropnou vrstvou. Maso chutná hořce, ale obchodníci se neptají.",
    depthMin: 30,
    depthMax: 200,
    timeOfDay: "any",
    oilOnly: true
  },
  {
    id: "mutant_eel",
    difficulty: 3,
    traits: ["reverse"],
    shape: "eel",
    name: "Mutovaný úhoř",
    rarity: "uncommon",
    weight: [2, 6],
    icon: "🐍",
    color: "#3a5a2a",
    desc: "Chemikálie z vrtů způsobily na jeho kůži podivné výrůstky. Ale stále se chytá.",
    depthMin: 60,
    depthMax: 280,
    timeOfDay: "night",
    oilOnly: true
  },
  {
    id: "drill_squid",
    difficulty: 4,
    traits: ["erratic", "drift"],
    shape: "squid",
    name: "Vrtná chobotnice",
    rarity: "rare",
    weight: [5, 15],
    priceMult: 1.2,
    icon: "🦑",
    color: "#2a2a3a",
    desc: "Žije mezi podmořskými nohami plošiny. Její chapadla jsou posetá leskle černými skvrnami.",
    depthMin: 100,
    depthMax: 370,
    timeOfDay: "any",
    oilOnly: true
  },
  {
    id: "oil_wraith",
    difficulty: 5,
    traits: ["reverse", "shrink"],
    shape: "wraith",
    name: "Ropný přízrak",
    rarity: "aberrant",
    weight: [6, 18],
    priceMult: 1.6,
    icon: "🕳️",
    color: "#0a0a0a",
    desc: "Skoro neviditelné stvoření plující v ropné vrstvě. Tvé ruce zčernaly při vytažení. Ruce? Nebo spáry?",
    depthMin: 50,
    depthMax: 400,
    timeOfDay: "night",
    oilOnly: true
  }
];

const FISH_PRICE_PER_KG = 5;

function rollFishWeight(species) {
  const [lo, hi] = species.weight || [1, 2];
  // Squared-ish roll: light fish are common, trophy specimens are rare
  const w = lo + (hi - lo) * Math.pow(Math.random(), 1.5);
  return Math.round(w * 10) / 10;
}

function computeFishPrice(species, weight) {
  return Math.max(1, Math.round(weight * FISH_PRICE_PER_KG * (species.priceMult || 1)));
}

// One caught fish = the species data plus its own weight and price (weight given when loading a save)
function makeCaughtFish(species, savedWeight) {
  const weight = savedWeight != null ? savedWeight : rollFishWeight(species);
  const [lo, hi] = species.weight || [1, 2];
  return {
    ...species,
    weight,
    weightRatio: hi > lo ? (weight - lo) / (hi - lo) : 0.5,
    price: computeFishPrice(species, weight)
  };
}

function formatKg(w) {
  return `${w.toFixed(1).replace(".", ",")} kg`;
}

function getRandomFishForDepth(depth, daylightFactor, inReef, inOilRig, lightLevel = 1) {
  // daylightFactor: 0 = night, 1 = noon
  // inReef: boolean — whether the player is fishing in the reef zone
  // inOilRig: boolean — whether the player is fishing in the oil rig zone
  const isNight = daylightFactor < 0.35;
  const isDay   = daylightFactor > 0.65;

  // Filter by depth AND zone exclusivity
  let candidates = FISH_SPECIES.filter(f => {
    if (depth < f.depthMin || depth > f.depthMax) return false;
    if (f.reefOnly && !inReef) return false;   // reef-only fish — only in reef
    if (f.oilOnly && !inOilRig) return false;  // oil-only fish - only in oil rig
    return true;
  });

  // Fallback
  if (candidates.length === 0) {
    candidates = FISH_SPECIES.filter(f => f.rarity === "common" && !f.reefOnly && !f.oilOnly);
  }

  // Filter by time of day
  const timeCandidates = candidates.filter(f => {
    if (f.timeOfDay === "night" && !isNight) return false;
    if (f.timeOfDay === "day"   && !isDay)   return false;
    return true;
  });
  if (timeCandidates.length > 0) candidates = timeCandidates;

  // Rarity weights — boosted in reef zone and oil rig
  const weights = {
    common:   inReef || inOilRig ? 70  : 100,
    uncommon: inReef || inOilRig ? 50  : 40,
    rare:     inReef || inOilRig ? 28  : 15,
    aberrant: inReef || inOilRig ? 12  : 6
  };

  // Extra aberrant boost at night
  let aberrantMult = isNight ? 1.8 : 1.0;
  if ((inReef || inOilRig) && isNight) aberrantMult = 2.8; // zone + night = very dangerous

  // A stronger headlight (light upgrade) draws better fish: uncommon and rare ones turn up more often
  const lightBoost = { common: 1, uncommon: 1 + 0.18 * (lightLevel - 1), rare: 1 + 0.4 * (lightLevel - 1), aberrant: 1 + 0.12 * (lightLevel - 1) };

  const weighedList = [];
  candidates.forEach(f => {
    let w = (weights[f.rarity] || 10) * (lightBoost[f.rarity] || 1);
    if (f.rarity === "aberrant") w = Math.round(w * aberrantMult);
    for (let i = 0; i < w; i++) weighedList.push(f);
  });

  const rollIdx = Math.floor(Math.random() * weighedList.length);
  return weighedList[rollIdx] || FISH_SPECIES[0];
}

