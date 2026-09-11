/** Local storage persistence for kit, settings, and tuning readings */

import { defaultKit } from './drums.js';

const STORAGE_KEY = 'drumtune.v1';

/** Default application settings */
const DEFAULT_SETTINGS = {
  a4: 440,
  sensitivity: 0.5,
  autoAdvance: true,
  holdMs: 2500,
  showSpectrum: true,
  tolerance: 3,
};

/**
 * Create empty readings for a drum
 * @param {object} drum - Drum object
 * @returns {object} Empty readings: { batter: { lug: [...], pitch: null }, reso: {...} }
 */
export function emptyReadings(drum) {
  return {
    batter: { lug: Array(drum.lugs).fill(null), pitch: null },
    reso: { lug: Array(drum.lugs).fill(null), pitch: null },
  };
}

/**
 * Ensure readings exist for a drum, creating or resizing as needed
 * @param {object} state - Application state
 * @param {object} drum - Drum object
 * @returns {object} Readings for this drum
 */
export function ensureReadings(state, drum) {
  if (!state.readings) state.readings = {};
  if (!state.readings[drum.id]) {
    state.readings[drum.id] = emptyReadings(drum);
  } else {
    // Resize lug arrays if drum lug count changed
    const existing = state.readings[drum.id];
    for (const head of ['batter', 'reso']) {
      if (existing[head].lug.length !== drum.lugs) {
        const newLug = Array(drum.lugs).fill(null);
        for (let i = 0; i < Math.min(existing[head].lug.length, drum.lugs); i++) {
          newLug[i] = existing[head].lug[i];
        }
        existing[head].lug = newLug;
      }
    }
  }
  return state.readings[drum.id];
}

/**
 * Load state from localStorage or create default
 * @returns {object} Application state
 */
export function load() {
  try {
    if (typeof localStorage === 'undefined') {
      return createDefaultState();
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return createDefaultState();
    }

    const state = JSON.parse(stored);

    // Merge in missing settings with defaults
    if (!state.settings) state.settings = {};
    state.settings = { ...DEFAULT_SETTINGS, ...state.settings };

    // Ensure kit exists
    if (!state.kit) state.kit = defaultKit();

    // Ensure readings object exists
    if (!state.readings) state.readings = {};

    return state;
  } catch (e) {
    console.warn('Failed to load state from localStorage:', e);
    return createDefaultState();
  }
}

/**
 * Save state to localStorage
 * @param {object} state - Application state
 */
export function save(state) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch (e) {
    console.warn('Failed to save state to localStorage:', e);
  }
}

/**
 * Reset to default state
 */
export function reset() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (e) {
    console.warn('Failed to reset localStorage:', e);
  }
}

/**
 * Create default application state
 * @returns {object}
 */
function createDefaultState() {
  return {
    kit: defaultKit(),
    settings: { ...DEFAULT_SETTINGS },
    readings: {},
  };
}

/**
 * Export store object with named methods
 */
export const store = { load, save, reset };
