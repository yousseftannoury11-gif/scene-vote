/**
 * Minimal radix-2 in-place complex FFT + window helpers.
 * No dependencies, fast enough for 64k points on a phone (~10 ms).
 */

const cache = new Map();

/** Precompute bit-reversal table and twiddles for size n. */
function tables(n) {
  let t = cache.get(n);
  if (t) return t;
  const rev = new Uint32Array(n);
  const bits = Math.log2(n) | 0;
  for (let i = 0; i < n; i++) {
    let r = 0, x = i;
    for (let b = 0; b < bits; b++) { r = (r << 1) | (x & 1); x >>= 1; }
    rev[i] = r;
  }
  const cos = new Float32Array(n / 2);
  const sin = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    const a = (-2 * Math.PI * i) / n;
    cos[i] = Math.cos(a);
    sin[i] = Math.sin(a);
  }
  t = { rev, cos, sin };
  cache.set(n, t);
  return t;
}

/**
 * Forward FFT, in place. re/im are Float32Array of equal power-of-2 length.
 * @param {Float32Array} re
 * @param {Float32Array} im
 */
export function fftReal(re, im) {
  const n = re.length;
  if (n & (n - 1)) throw new Error('fft size must be a power of 2');
  const { rev, cos, sin } = tables(n);
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j > i) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = n / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0, w = 0; k < half; k++, w += step) {
        const wr = cos[w], wi = sin[w];
        const a = start + k, b = a + half;
        const tr = re[b] * wr - im[b] * wi;
        const ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr;        im[a] += ti;
      }
    }
  }
}

/** Hann window of length n. */
export function hann(n) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  return w;
}

/** Exponential (decaying) window — matches a ringing drum head, keeps early energy. */
export function expWindow(n, decay = 4) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    // short fade-in to avoid a click, then exponential decay
    const fadeIn = i < 64 ? i / 64 : 1;
    w[i] = fadeIn * Math.exp(-decay * x);
  }
  return w;
}
