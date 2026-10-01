// Global constants and game data tables.

export const W = 24;          // columns of the ant-farm slab
export const START_ROWS = 112; // rows generated at the start; more are added as the dwarfs dig deeper
export const CHUNK = 32;      // rows added at a time
export const SLAB = 0.5;      // slab thickness (cell units) – how deep the glass box is
export const ISO = Math.cos(Math.PI / 6);

export const ENTRANCE_X = 3;  // column of the main shaft under the mine entrance
export const STASH_X = 5;     // where treasure is delivered (mine cart)
export const FEAST_X = 7;     // first seat of the feast table
export const COTTAGE_X = 12;  // cottage door column

export const DAY_LENGTH = 300;   // seconds for a full day/night cycle
export const NIGHT_START = 0.68; // fraction of the day when night begins
export const HORN_MAX = 3;
export const HORN_REGEN = 45;    // seconds per command charge
export const SACK_SIZE = 3;
export const MAX_DWARFS = 12;
export const VARIANTS = 6;       // dwarf looks in assets/dwarfs.webp (one row each)

export const MAT = { AIR: 0, BORDER: 255 };

// Earth bands from top to bottom. A cell stores band + 1 (0 = dug out).
const BASE_BANDS = [
  { name: 'Erde', tex: 'dirt', hard: 1, time: 2.2, crumb: '#7b4a2b', depth: 0 },
  { name: 'Lehm', tex: 'clay', hard: 1, time: 3.2, crumb: '#d38b48', depth: 14 },
  { name: 'Stein', tex: 'stone', hard: 2, time: 5.0, crumb: '#9aa0a8', depth: 34 },
  { name: 'Tiefgestein', tex: 'deep', hard: 3, time: 7.0, crumb: '#4a4f9a', depth: 58 },
  { name: 'Glutfels', tex: 'magma', hard: 4, time: 9.0, crumb: '#ff8a3a', depth: 82 },
  { name: 'Kristallfels', tex: 'crystal', hard: 5, time: 10.5, crumb: '#56c8c0', depth: 108 },
  { name: 'Obsidian', tex: 'obsidian', hard: 6, time: 12, crumb: '#6a58a0', depth: 134 },
  { name: 'Zwergenruinen', tex: 'ruins', hard: 7, time: 13, crumb: '#b8ae98', depth: 160 },
];
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const bandCache = [];

// Band info for band index b (endless: the deep three repeat, each round harder).
export function band(b) {
  if (bandCache[b]) return bandCache[b];
  let info;
  if (b < BASE_BANDS.length) info = BASE_BANDS[b];
  else {
    const k = b - BASE_BANDS.length;
    const src = BASE_BANDS[5 + (k % 3)];
    const round = 2 + Math.floor(k / 3);
    info = { ...src, name: `${src.name} ${ROMAN[round] || round}`, hard: b, time: 13 + k * 1.1, depth: 186 + 26 * k };
  }
  bandCache[b] = info;
  return info;
}

const AIR = { name: 'Luft', hard: 0, time: 0 };
const BORDER = { name: 'Rahmen', tex: 'stone', hard: 9999, time: 9999, crumb: '#555' };
// Material info for a stored cell value.
export function mat(m) {
  if (m === 0) return AIR;
  if (m === MAT.BORDER) return BORDER;
  return band(m - 1);
}

// worth of treasure grows the deeper it was found
export const valueMult = (b) => (b <= 4 ? 1 : 1 + (b - 4) * 0.8);

const PICK_NAMES = ['', 'Kupferhacke', 'Eisenhacke', 'Mithrilhacke', 'Runenhacke', 'Kristallhacke', 'Obsidianhacke', 'Sternenhacke'];
export function pickInfo(level) {
  const name = PICK_NAMES[level] || `Sternenhacke +${level - 7}`;
  const cost = level <= 1 ? 0 : level === 2 ? 90 : level === 3 ? 650 : Math.round(2400 * Math.pow(2.6, level - 4));
  // the first band this pick can break that the previous one could not
  let b = 0;
  while (band(b).hard < level) b++;
  return { name, cost, unlocks: band(b).name, tex: band(b).tex };
}

// Ore table, index = ore id stored in the world; value = base value (times band multiplier)
export const ORES = [
  null,
  { key: 'coal', name: 'Kohle', value: 1, icon: 'coal', glow: null },
  { key: 'gold', name: 'Gold', value: 5, icon: 'gold', glow: '#ffd34d' },
  { key: 'amethyst', name: 'Amethyst', value: 10, icon: 'amethyst', glow: '#c27bff' },
  { key: 'ruby', name: 'Rubin', value: 18, icon: 'ruby', glow: '#ff4d5e' },
  { key: 'sapphire', name: 'Saphir', value: 26, icon: 'sapphire', glow: '#4d7bff' },
  { key: 'mithril', name: 'Mithril', value: 36, icon: 'mithril', glow: '#bfe6ff' },
  { key: 'diamond', name: 'Diamant', value: 70, icon: 'diamond', glow: '#e8fbff' },
  { key: 'fossil', name: 'Ammonit', value: 30, icon: 'fossil', glow: null },
  { key: 'rune', name: 'Runenstein', value: 120, icon: 'rune', glow: '#5fd7ff' },
  { key: 'chest', name: 'Schatztruhe', value: 220, icon: 'chest', glow: '#ffcf5a' },
  { key: 'heart', name: 'Herz des Berges', value: 1000, icon: 'diamond', glow: '#ffffff' },
];
export const ORE_HEART = 11;

// [ore, seeds per band, min size, max size] – deeper bands reuse the last table
export const ORE_TABLE = [
  [[1, 12, 2, 4], [2, 6, 1, 3], [8, 3, 1, 1]],
  [[1, 7, 2, 3], [2, 11, 2, 4], [3, 6, 1, 3], [8, 3, 1, 1]],
  [[2, 9, 2, 4], [3, 12, 2, 4], [4, 9, 1, 3], [10, 1, 1, 1], [8, 1, 1, 1]],
  [[4, 6, 1, 2], [5, 10, 1, 3], [6, 9, 2, 4], [7, 4, 1, 2], [9, 2, 1, 1], [10, 1, 1, 1]],
  [[7, 7, 1, 3], [6, 4, 1, 3], [9, 3, 1, 1], [10, 2, 1, 1]],
  [[3, 9, 2, 4], [7, 7, 1, 3], [5, 7, 1, 3], [6, 4, 2, 3], [9, 3, 1, 1], [10, 2, 1, 1]],
];

// Dinosaur skeletons pressed into the earth (assets/dinos/<i>.png): footprint height in cells + image aspect
export const DINOS = [
  { name: 'T-Rex', rows: 5, aspect: 1.325 },
  { name: 'Triceratops', rows: 4, aspect: 1.546 },
  { name: 'Brachiosaurus', rows: 6, aspect: 1.041 },
  { name: 'Stegosaurus', rows: 4, aspect: 1.506 },
];

// The village on the meadow grows with the colony. Geometry in meadow cells:
// x0..x1 along the farm, z0..z1 in depth (0 = glass, negative = further back).
export const VILLAGE = [
  { id: 'cottage', name: 'Häuschen', kind: 'house', x0: 11.4, x1: 13.6, z0: -2.8, z1: -0.7, door: 12, roof: '#e0ad4f' },
  { id: 'house1', name: 'Neues Haus', kind: 'house', x0: 3.6, x1: 5.4, z0: -4.2, z1: -2.9, door: 4, roof: '#c9603e' },
  { id: 'forge', name: 'Schmiede', kind: 'forge', x0: 14.6, x1: 16.5, z0: -2.6, z1: -1.0 },
  { id: 'house2', name: 'Neues Haus', kind: 'house', x0: 17.6, x1: 19.4, z0: -2.6, z1: -0.9, door: 18, roof: '#7a9a4a' },
  { id: 'museum', name: 'Dino-Museum', kind: 'museum', x0: 20.6, x1: 23.4, z0: -3.4, z1: -1.3 },
  { id: 'house3', name: 'Neues Haus', kind: 'house', x0: 7.4, x1: 9.2, z0: -4.2, z1: -2.9, door: 8, roof: '#5f7fae' },
  { id: 'tavern', name: 'Taverne', kind: 'tavern' },
];

export const NAMES = [
  'Brumli', 'Gimbo', 'Torvi', 'Knorz', 'Pumpel', 'Hilde', 'Berta', 'Ragni', 'Olli', 'Snorri',
  'Fenna', 'Gundi', 'Mosi', 'Krümel', 'Bolle', 'Dorle', 'Ferdi', 'Grisel', 'Hacki', 'Ingo',
  'Jola', 'Kalle', 'Lotti', 'Mumpitz', 'Nobbi', 'Pelle', 'Rudi', 'Sigi', 'Trudi', 'Wuschel',
];

export const LIKES = ['tief', 'kristall', 'gold', 'pause', 'gang', 'knochen', 'bier'];
