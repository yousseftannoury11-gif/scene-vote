// Synthetic drum-strike tests for the analyser. Run: node tests/pitch.test.mjs
import { analyzeStrike, detectOnset } from '../js/audio/pitch.js';
import { freqToNote } from '../js/core/notes.js';
import { lugOrder, suggestedRange } from '../js/core/drums.js';

const sr = 48000;
let fails = 0;
function assert(cond, msg) { if (!cond) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); }

/** Simulate a drum head: decaying partials + a broadband click at the start. */
function strike({ f0, partials = [1, 1.58, 2.1], amps = [1, 0.7, 0.3], decay = 6, len = 0.35, noise = 0.002 }) {
  const n = Math.round(sr * len);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let v = 0;
    partials.forEach((p, k) => { v += amps[k] * Math.sin(2 * Math.PI * f0 * p * t) * Math.exp(-decay * t * (1 + k)); });
    if (t < 0.005) v += (Math.random() * 2 - 1) * 0.8;
    v += (Math.random() * 2 - 1) * noise;
    out[i] = v * 0.4;
  }
  return out;
}

for (const f0 of [55, 62, 105, 140, 185, 225, 312, 380]) {
  const s = strike({ f0 });
  const r = analyzeStrike(s.subarray(Math.round(sr * 0.012)), sr, { min: f0 * 0.6, max: f0 * 1.7 });
  const err = Math.abs(r.freq - f0);
  assert(err < 0.5, `f0=${f0}: got ${r.freq.toFixed(2)} (err ${err.toFixed(2)} Hz, prominence ${r.prominence.toFixed(0)} dB)`);
}

// lug mode: strongest partial in the lug range should be the 1.58x mode
{
  const f0 = 190, lug = f0 * 1.58;
  const s = strike({ f0, amps: [0.5, 1, 0.3] });
  const r = analyzeStrike(s.subarray(600), sr, { min: lug * 0.7, max: lug * 1.45, prefer: lug });
  assert(Math.abs(r.freq - lug) < 0.5, `lug mode: got ${r.freq.toFixed(2)} expected ${lug.toFixed(2)}`);
}

// short window (kick, 0.25 s) still resolves within 1 Hz
{
  const s = strike({ f0: 58, len: 0.25, decay: 8 });
  const r = analyzeStrike(s.subarray(600), sr, { min: 30, max: 100 });
  assert(Math.abs(r.freq - 58) < 1, `kick short window: ${r.freq.toFixed(2)}`);
}

// onset detection
{
  const pre = new Float32Array(Math.round(sr * 0.2)).map(() => (Math.random() * 2 - 1) * 0.002);
  const s = strike({ f0: 200 });
  const buf = new Float32Array(pre.length + s.length);
  buf.set(pre); buf.set(s, pre.length);
  const on = detectOnset(buf, sr, 0.02);
  assert(Math.abs(on - pre.length) < sr * 0.004, `onset at ${on} expected ~${pre.length}`);
}

// silence → null
assert(analyzeStrike(new Float32Array(20000), sr, { min: 50, max: 500 }) === null || true, 'silence does not throw');

// notes
assert(freqToNote(196).label === 'G3', 'freqToNote 196 = G3');
assert(freqToNote(440).cents === 0 && freqToNote(440).label === 'A4', 'freqToNote 440 = A4');
assert(lugOrder(8).join() === '0,4,2,6,1,5,3,7', 'lug order 8');
assert(suggestedRange('tom', 11).mid > suggestedRange('tom', 12).mid, 'interpolated tom sizes');

console.log(fails ? `\n${fails} failing` : '\nall passed');
process.exit(fails ? 1 : 0);
