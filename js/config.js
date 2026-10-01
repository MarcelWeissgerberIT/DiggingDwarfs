// Global constants and game data tables.

export const W = 20;          // columns of the ant-farm slab
export const H = 104;         // rows of earth (row 0 = top soil, row -1 = surface air)
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

export const MAT = { AIR: 0, DIRT: 1, CLAY: 2, STONE: 3, DEEP: 4, MAGMA: 5, BEDROCK: 6 };

// hard = minimum pick level needed, time = seconds to dig with level-1 pick
export const MATS = [
  { name: 'Luft' },
  { name: 'Erde', tex: 'dirt', hard: 1, time: 2.2, crumb: '#7b4a2b' },
  { name: 'Lehm', tex: 'clay', hard: 1, time: 3.2, crumb: '#d38b48' },
  { name: 'Stein', tex: 'stone', hard: 2, time: 5.0, crumb: '#9aa0a8' },
  { name: 'Tiefgestein', tex: 'deep', hard: 3, time: 7.0, crumb: '#4a4f9a' },
  { name: 'Glutfels', tex: 'magma', hard: 4, time: 9.0, crumb: '#ff8a3a' },
  { name: 'Grundfels', tex: 'magma', hard: 99, time: 999, crumb: '#333' },
];

export const PICKS = [
  null,
  { name: 'Kupferhacke', cost: 0, desc: 'gräbt Erde & Lehm' },
  { name: 'Eisenhacke', cost: 90, desc: 'gräbt jetzt auch Stein' },
  { name: 'Mithrilhacke', cost: 650, desc: 'gräbt jetzt auch Tiefgestein' },
  { name: 'Runenhacke', cost: 2400, desc: 'gräbt sogar Glutfels' },
];

// icon = [row, col] in assets/items.png (4x4 grid)
export const ICON = {
  gold: [0, 0], diamond: [0, 1], amethyst: [0, 2], ruby: [0, 3],
  sapphire: [1, 0], mithril: [1, 1], coal: [1, 2], chest: [1, 3],
  mushroom: [2, 0], fossil: [2, 1], lantern: [2, 2], pick: [2, 3],
  beer: [3, 0], flag: [3, 1], cart: [3, 2], rune: [3, 3],
};

// Ore table, index = ore id stored in the world
export const ORES = [
  null,
  { key: 'coal', name: 'Kohle', value: 1, icon: 'coal', glow: null },
  { key: 'gold', name: 'Gold', value: 5, icon: 'gold', glow: '#ffd34d' },
  { key: 'amethyst', name: 'Amethyst', value: 10, icon: 'amethyst', glow: '#c27bff' },
  { key: 'ruby', name: 'Rubin', value: 18, icon: 'ruby', glow: '#ff4d5e' },
  { key: 'sapphire', name: 'Saphir', value: 26, icon: 'sapphire', glow: '#4d7bff' },
  { key: 'mithril', name: 'Mithril', value: 36, icon: 'mithril', glow: '#bfe6ff' },
  { key: 'diamond', name: 'Diamant', value: 70, icon: 'diamond', glow: '#e8fbff' },
  { key: 'fossil', name: 'Fossil', value: 30, icon: 'fossil', glow: null },
  { key: 'rune', name: 'Runenstein', value: 120, icon: 'rune', glow: '#5fd7ff' },
  { key: 'chest', name: 'Schatztruhe', value: 220, icon: 'chest', glow: '#ffcf5a' },
  { key: 'heart', name: 'Herz des Berges', value: 1000, icon: 'diamond', glow: '#ffffff' },
];
export const ORE_HEART = 11;

export const NAMES = [
  'Brumli', 'Gimbo', 'Torvi', 'Knorz', 'Pumpel', 'Hilde', 'Berta', 'Ragni', 'Olli', 'Snorri',
  'Fenna', 'Gundi', 'Mosi', 'Krümel', 'Bolle', 'Dorle', 'Ferdi', 'Grisel', 'Hacki', 'Ingo',
  'Jola', 'Kalle', 'Lotti', 'Mumpitz', 'Nobbi', 'Pelle', 'Rudi', 'Sigi', 'Trudi', 'Wuschel',
];

export const LIKES = [
  'tiefe Stollen', 'funkelnde Kristalle', 'Gold, viel Gold', 'gemütliche Pausen',
  'lange Gänge', 'alte Knochen', 'kühles Bier', 'Laternenlicht', 'Lieder beim Graben',
];
