/** Drum tuning data: types, ranges, frequency calculations, presets, and lug ordering */

import { noteToFreq } from './notes.js';

export const DRUM_TYPES = ['kick', 'snare', 'tom', 'floor'];

export const DEFAULT_LUGS = { kick: 8, snare: 10, tom: 6, floor: 8 };

export const RESO_RELATIONS = [
  { id: 'same', label: 'Same as batter', semitones: 0 },
  { id: 'reso-up-2', label: 'Reso +2 semitones', semitones: 2 },
  { id: 'reso-up-3', label: 'Reso +3 semitones (bright)', semitones: 3 },
  { id: 'reso-up-5', label: 'Reso +5 semitones', semitones: 5 },
  { id: 'reso-down-2', label: 'Reso −2 semitones', semitones: -2 },
  { id: 'reso-down-3', label: 'Reso −3 semitones (fat)', semitones: -3 },
  { id: 'reso-down-5', label: 'Reso −5 semitones', semitones: -5 },
];

export const TUNING_PRESETS = [
  {
    id: 'rock',
    name: 'Rock (low, punchy)',
    description: 'Low kick punch, mid-high snare, low toms',
    level: { kick: 'low', snare: 'mid', tom: 'low', floor: 'low' },
    resoRelation: 'reso-up-3',
  },
  {
    id: 'jazz',
    name: 'Jazz (warm, round)',
    description: 'High fundamental, open resonance',
    level: { kick: 'high', snare: 'high', tom: 'high', floor: 'high' },
    resoRelation: 'same',
  },
  {
    id: 'fusion',
    name: 'Fusion (bright, articulate)',
    description: 'Mid fundamentals, bright reso',
    level: { kick: 'mid', snare: 'mid', tom: 'mid', floor: 'mid' },
    resoRelation: 'reso-up-3',
  },
  {
    id: 'metal',
    name: 'Metal (controlled)',
    description: 'Low kick, high snare crack, mid toms',
    level: { kick: 'low', snare: 'high', tom: 'mid', floor: 'low' },
    resoRelation: 'reso-down-3',
  },
  {
    id: 'funk',
    name: 'Funk (tight, groovy)',
    description: 'Mid kick, high snare, tight toms',
    level: { kick: 'mid', snare: 'high', tom: 'mid', floor: 'mid' },
    resoRelation: 'reso-up-5',
  },
];

/** Frequency tables: (diameter -> [low, mid, high] in Hz) */
const RANGES = {
  kick: [[18, 52, 70, 90], [20, 48, 62, 80], [22, 42, 55, 72], [24, 38, 50, 65], [26, 35, 46, 60]],
  snare: [[12, 190, 230, 280], [13, 175, 210, 255], [14, 165, 190, 230], [15, 150, 175, 215]],
  tom: [[8, 230, 260, 320], [10, 195, 225, 275], [12, 160, 185, 230], [13, 145, 165, 205], [14, 125, 140, 175], [15, 112, 125, 160], [16, 95, 105, 135]],
  floor: [[14, 115, 130, 165], [16, 92, 105, 135], [18, 80, 90, 115]],
};

/**
 * Linear interpolation helper
 * @param {number} x0, y0, x1, y1 - Two points
 * @param {number} x - X value to interpolate
 * @returns {number} Interpolated Y
 */
function lerp(x0, y0, x1, y1, x) {
  if (x <= x0) return y0;
  if (x >= x1) return y1;
  return y0 + (y1 - y0) * ((x - x0) / (x1 - x0));
}

/**
 * Get suggested fundamental frequency range for a drum type and diameter
 * @param {string} type - 'kick', 'snare', 'tom', or 'floor'
 * @param {number} diameter - Diameter in inches
 * @returns {object} { low, mid, high } in Hz
 */
export function suggestedRange(type, diameter) {
  const table = RANGES[type];
  if (!table) return null;

  if (table.length === 1) {
    const [, low, mid, high] = table[0];
    return { low, mid, high };
  }

  const diameters = table.map(row => row[0]);
  const lows = table.map(row => row[1]);
  const mids = table.map(row => row[2]);
  const highs = table.map(row => row[3]);

  return {
    low: lerp(diameters[0], lows[0], diameters[diameters.length - 1], lows[lows.length - 1], diameter),
    mid: lerp(diameters[0], mids[0], diameters[diameters.length - 1], mids[mids.length - 1], diameter),
    high: lerp(diameters[0], highs[0], diameters[diameters.length - 1], highs[highs.length - 1], diameter),
  };
}

/**
 * Estimate lug frequency from fundamental
 * @param {number} f0 - Fundamental frequency in Hz
 * @returns {number} Lug frequency in Hz
 */
export function lugFromFundamental(f0) {
  return f0 * 1.58;
}

/**
 * Estimate fundamental from lug frequency
 * @param {number} fLug - Lug frequency in Hz
 * @returns {number} Fundamental frequency in Hz
 */
export function fundamentalFromLug(fLug) {
  return fLug / 1.58;
}

/**
 * Analysis frequency range for peak detection
 * @param {string} type - Drum type
 * @param {string} head - 'batter' or 'reso'
 * @param {string} mode - 'lug' or 'pitch'
 * @returns {object} { min, max } in Hz
 */
export function analysisRange(type, head, mode) {
  const range = suggestedRange(type, RANGES[type][Math.floor(RANGES[type].length / 2)][0]);
  const { low, high } = range;

  let min, max;
  if (mode === 'lug') {
    min = Math.max(30, 0.9 * lugFromFundamental(low));
    max = 1.25 * lugFromFundamental(high);
  } else {
    min = Math.max(30, 0.75 * low);
    max = 1.35 * high;
  }

  max = Math.min(max, 1200);
  return { min: Math.round(min), max: Math.round(max) };
}

/**
 * Standard star/criss-cross lug tuning order
 * @param {number} n - Number of lugs
 * @returns {array} Lug indices in tuning order
 */
export function lugOrder(n) {
  const patterns = {
    6: [0, 3, 1, 4, 2, 5],
    8: [0, 4, 2, 6, 1, 5, 3, 7],
    10: [0, 5, 2, 7, 4, 9, 1, 6, 3, 8],
  };

  if (patterns[n]) return patterns[n];

  if (n % 2 === 0) {
    const result = [];
    const half = n / 2;
    for (let i = 0; i < half; i += 2) {
      result.push(i, i + half);
    }
    for (let i = 1; i < half; i += 2) {
      result.push(i, i + half);
    }
    return result;
  }

  return Array.from({ length: n }, (_, i) => i);
}

/**
 * Generate a random unique ID
 * @returns {string}
 */
export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'd' + Date.now() + Math.random().toString(36).slice(2);
}

/**
 * Create a drum object with default targets
 * @param {object} opts - { name, type, diameter, lugs }
 * @returns {object} Drum object
 */
export function makeDrum({ name, type, diameter, lugs }) {
  const lugCount = lugs || DEFAULT_LUGS[type] || 8;
  const range = suggestedRange(type, diameter);
  const batterTarget = range.mid;
  const resoTarget = batterTarget * Math.pow(2, 3 / 12); // +3 semitones default

  return {
    id: uid(),
    name,
    type,
    diameter,
    lugs: lugCount,
    batter: { target: batterTarget },
    reso: { target: resoTarget },
  };
}

/**
 * Create default kit with standard drums
 * @returns {object} Kit with id, name, drums[]
 */
export function defaultKit() {
  return {
    id: uid(),
    name: 'My Kit',
    drums: [
      makeDrum({ name: 'Kick', type: 'kick', diameter: 22, lugs: 8 }),
      makeDrum({ name: 'Snare', type: 'snare', diameter: 14, lugs: 10 }),
      makeDrum({ name: 'Tom 1', type: 'tom', diameter: 10, lugs: 6 }),
      makeDrum({ name: 'Tom 2', type: 'tom', diameter: 12, lugs: 6 }),
      makeDrum({ name: 'Floor Tom', type: 'floor', diameter: 16, lugs: 8 }),
    ],
  };
}

/**
 * Apply a tuning preset to a kit
 * @param {object} kit - Drum kit
 * @param {string} presetId - Preset ID
 * @returns {object} New kit with targets updated
 */
export function applyPreset(kit, presetId) {
  const preset = TUNING_PRESETS.find(p => p.id === presetId);
  if (!preset) return kit;

  const resoRelation = RESO_RELATIONS.find(r => r.id === preset.resoRelation);
  if (!resoRelation) return kit;

  const newKit = {
    ...kit,
    drums: kit.drums.map(drum => {
      const level = preset.level[drum.type];
      if (!level) return drum;

      const range = suggestedRange(drum.type, drum.diameter);
      const batterTarget = range[level];
      const resoTarget = batterTarget * Math.pow(2, resoRelation.semitones / 12);

      return {
        ...drum,
        batter: { ...drum.batter, target: batterTarget },
        reso: { ...drum.reso, target: resoTarget },
      };
    }),
  };

  return newKit;
}
