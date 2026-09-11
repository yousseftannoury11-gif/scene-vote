/** Musical note utilities: frequency ↔ MIDI ↔ cents conversion */

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Convert frequency to note object { name, octave, midi, cents, label }
 * @param {number} freq - Frequency in Hz
 * @param {number} a4 - Reference A4 frequency (default 440 Hz)
 * @returns {object|null} Note object or null if freq invalid
 */
export function freqToNote(freq, a4 = 440) {
  if (freq <= 0 || !isFinite(freq)) return null;

  const midiFloat = 69 + 12 * Math.log2(freq / a4);
  const midi = Math.round(midiFloat);
  const cents = Math.round((midiFloat - midi) * 100);
  const name = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  const label = name + octave;

  return { name, octave, midi, cents, label };
}

/**
 * Convert MIDI note number to frequency in Hz
 * @param {number} midi - MIDI note number (69 = A4)
 * @param {number} a4 - Reference A4 frequency (default 440 Hz)
 * @returns {number} Frequency in Hz
 */
export function noteToFreq(midi, a4 = 440) {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Calculate cents difference between two frequencies
 * @param {number} f - Frequency in Hz
 * @param {number} target - Target frequency in Hz
 * @returns {number} Cents (positive means f is higher)
 */
export function centsBetween(f, target) {
  return 1200 * Math.log2(f / target);
}

/**
 * Get the frequency of the nearest note to a given frequency
 * @param {number} freq - Frequency in Hz
 * @param {number} a4 - Reference A4 frequency (default 440 Hz)
 * @returns {number} Frequency of nearest note
 */
export function nearestNoteFreq(freq, a4 = 440) {
  const note = freqToNote(freq, a4);
  if (!note) return freq;
  return noteToFreq(note.midi, a4);
}

/**
 * Convert note label (e.g., 'F#3', 'Gb3') to MIDI number
 * @param {string} label - Note label
 * @returns {number} MIDI note number
 */
export function noteLabelToMidi(label) {
  const match = label.match(/^([A-G])(#|b)?(-?\d+)$/);
  if (!match) return null;

  const [, noteName, modifier, octaveStr] = match;
  const octave = parseInt(octaveStr);
  const noteIndex = NOTE_NAMES.indexOf(noteName);

  if (noteIndex === -1) return null;

  // Map modifier: # = +1, b = -1 (enharmonic equivalent)
  let semitone = noteIndex;
  if (modifier === '#') semitone += 1;
  if (modifier === 'b') semitone -= 1;

  // MIDI = (octave + 1) * 12 + semitone
  return (octave + 1) * 12 + semitone;
}
