/**
 * Strike analysis for drum tuning.
 *
 * A drum head hit near a lug rings at a strong, narrow resonance (the "lug pitch").
 * Hit in the centre it rings at the fundamental. Both show up as a sharp spectral
 * peak, so we do a high-resolution FFT on the ringing part of the strike and pick
 * the strongest peak inside the expected range, with parabolic interpolation for
 * sub-bin (~0.1 Hz) accuracy.
 */
import { fftReal, hann } from './fft.js';
import { freqToNote } from '../core/notes.js';

const MAX_SPECTRUM_HZ = 1500;

/**
 * Find the onset (strike) inside a buffer.
 * Returns the sample index where energy jumps, or -1.
 * @param {Float32Array} samples
 * @param {number} sampleRate
 * @param {number} threshold RMS level (0..1) that counts as a hit
 */
export function detectOnset(samples, sampleRate, threshold = 0.02) {
  const block = Math.max(32, Math.round(sampleRate * 0.002)); // 2 ms blocks
  const n = Math.floor(samples.length / block);
  let prev = 0;
  let noise = 1e-6;
  for (let b = 0; b < n; b++) {
    let s = 0;
    const off = b * block;
    for (let i = 0; i < block; i++) { const v = samples[off + i]; s += v * v; }
    const rms = Math.sqrt(s / block);
    // running noise floor (slow)
    if (b > 4 && rms > threshold && rms > prev * 3 && rms > noise * 6) {
      // refine: first sample within block whose |x| exceeds half the block rms
      for (let i = 0; i < block; i++) {
        if (Math.abs(samples[off + i]) > rms * 0.5) return off + i;
      }
      return off;
    }
    noise = noise * 0.9 + rms * 0.1;
    prev = rms;
  }
  return -1;
}

/**
 * Parabolic interpolation of a peak at bin k using log-magnitude values.
 * Returns {offset (-0.5..0.5), value}.
 */
function interpolate(db, k) {
  const a = db[k - 1], b = db[k], c = db[k + 1];
  const denom = a - 2 * b + c;
  if (denom === 0) return { offset: 0, value: b };
  const off = 0.5 * (a - c) / denom;
  return { offset: off, value: b - 0.25 * (a - c) * off };
}

/**
 * Analyse one strike.
 * @param {Float32Array} samples ringing part of the strike (already trimmed after the onset)
 * @param {number} sampleRate
 * @param {{min:number,max:number,fftSize?:number,a4?:number,prefer?:number}} opts expected frequency (target) in `prefer`
 */
export function analyzeStrike(samples, sampleRate, opts) {
  const { min, max, a4 = 440, prefer = null } = opts;
  const len = samples.length;
  if (len < 256) return null;
  let fftSize = opts.fftSize || 65536;
  while (fftSize < len) fftSize <<= 1;

  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  const w = hann(len);
  let mean = 0;
  for (let i = 0; i < len; i++) mean += samples[i];
  mean /= len;
  for (let i = 0; i < len; i++) re[i] = (samples[i] - mean) * w[i];
  fftReal(re, im);

  const binHz = sampleRate / fftSize;
  const nBins = Math.min(fftSize >> 1, Math.floor(MAX_SPECTRUM_HZ / binHz));
  const db = new Float32Array(nBins);
  let maxDb = -Infinity;
  for (let k = 0; k < nBins; k++) {
    const p = re[k] * re[k] + im[k] * im[k];
    const v = 10 * Math.log10(p + 1e-20);
    db[k] = v;
    if (v > maxDb) maxDb = v;
  }
  // normalise so the loudest bin (anywhere below 1500 Hz) is 0 dB
  for (let k = 0; k < nBins; k++) db[k] -= maxDb;

  const kMin = Math.max(2, Math.floor(min / binHz));
  const kMax = Math.min(nBins - 2, Math.ceil(max / binHz));
  if (kMax <= kMin) return null;

  // collect local maxima inside the range
  const peaks = [];
  for (let k = kMin; k <= kMax; k++) {
    if (db[k] > db[k - 1] && db[k] >= db[k + 1]) {
      const { offset, value } = interpolate(db, k);
      peaks.push({ freq: (k + offset) * binHz, db: value, bin: k });
    }
  }
  if (!peaks.length) return null;
  // Rank by loudness, with a mild pull toward the expected frequency so a
  // weaker neighbouring mode (e.g. the fundamental in lug mode) does not win
  // when it is only marginally louder. 4 dB per octave of distance.
  const score = (p) => p.db - (prefer ? 4 * Math.abs(Math.log2(p.freq / prefer)) : 0);
  peaks.sort((p, q) => score(q) - score(p));

  // merge peaks closer than 1.5 Hz (side lobes) keeping the loudest
  const merged = [];
  for (const p of peaks) {
    if (!merged.some(m => Math.abs(m.freq - p.freq) < 1.5)) merged.push(p);
    if (merged.length >= 5) break;
  }

  const best = merged[0];
  // signal quality: how much the best peak stands above the range median
  const ranged = Array.from(db.subarray(kMin, kMax + 1)).sort((a, b) => a - b);
  const median = ranged[ranged.length >> 1];
  const prominence = best.db - median;

  const freqs = new Float32Array(nBins);
  for (let k = 0; k < nBins; k++) freqs[k] = k * binHz;

  return {
    freq: best.freq,
    magnitudeDb: best.db,
    prominence,
    note: freqToNote(best.freq, a4),
    peaks: merged.map(({ freq, db }) => ({ freq, db })),
    spectrum: { freqs, db },
  };
}

/** Root-mean-square of a buffer. */
export function rms(samples) {
  let s = 0;
  for (let i = 0; i < samples.length; i++) s += samples[i] * samples[i];
  return Math.sqrt(s / samples.length);
}
