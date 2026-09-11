/** Spectrum analyser display: log-frequency canvas plot with target/peak markers */

const FREQ_MIN = 30;
const FREQ_MAX = 1500;
const DB_MIN = -80;
const DB_MAX = 0;
const GRID_FREQS = [50, 100, 200, 500, 1000];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Create a spectrum renderer bound to a canvas.
 * @param {HTMLCanvasElement} canvas
 * @returns {{ draw: (state: {freqs: Float32Array, db: Float32Array, min?: number, max?: number, peakFreq?: number, targetFreq?: number}) => void, clear: () => void }}
 */
export function createSpectrum(canvas) {
  const ctx = canvas.getContext('2d');
  let cssWidth = 0;
  let cssHeight = 0;

  /** Resize the backing store to match clientWidth/Height * devicePixelRatio, if changed. */
  function ensureSize() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || canvas.width || 300;
    const h = canvas.clientHeight || canvas.height || 120;
    const targetW = Math.round(w * dpr);
    const targetH = Math.round(h * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    cssWidth = w;
    cssHeight = h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * @param {number} freq
   * @returns {number} x in CSS px
   */
  function xForFreq(freq) {
    const f = clamp(freq, FREQ_MIN, FREQ_MAX);
    const t = (Math.log10(f) - Math.log10(FREQ_MIN)) / (Math.log10(FREQ_MAX) - Math.log10(FREQ_MIN));
    return t * cssWidth;
  }

  /**
   * @param {number} db
   * @returns {number} y in CSS px
   */
  function yForDb(db) {
    const d = clamp(db, DB_MIN, DB_MAX);
    const t = (DB_MAX - d) / (DB_MAX - DB_MIN);
    return t * cssHeight;
  }

  function drawBackground() {
    ctx.fillStyle = '#0f1317';
    ctx.fillRect(0, 0, cssWidth, cssHeight);
  }

  function drawGrid() {
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.fillStyle = '#5a6472';
    ctx.font = '9px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.lineWidth = 1;
    for (const f of GRID_FREQS) {
      const x = xForFreq(f);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, cssHeight);
      ctx.stroke();
      const label = f >= 1000 ? `${f / 1000}k` : String(f);
      ctx.fillText(label, x + 2, 9);
    }
  }

  /**
   * @param {number} min
   * @param {number} max
   */
  function drawRangeBand(min, max) {
    if (min == null || max == null || !isFinite(min) || !isFinite(max)) return;
    const x0 = xForFreq(min);
    const x1 = xForFreq(max);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(Math.min(x0, x1), 0, Math.abs(x1 - x0), cssHeight);
  }

  /**
   * @param {Float32Array} freqs
   * @param {Float32Array} db
   */
  function drawSpectrum(freqs, db) {
    if (!freqs || !db || freqs.length === 0) return;
    const n = Math.min(freqs.length, db.length);

    ctx.beginPath();
    let started = false;
    let lastPx = -Infinity;
    const points = [];

    for (let i = 0; i < n; i++) {
      const f = freqs[i];
      if (f < FREQ_MIN || f > FREQ_MAX) continue;
      const x = xForFreq(f);
      const px = Math.round(x);
      if (px === lastPx) continue;
      lastPx = px;
      const y = yForDb(db[i]);
      points.push([x, y]);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }

    if (!started) return;

    // stroke the line first
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // fill under the curve
    const [firstX] = points[0];
    const [lastX] = points[points.length - 1];
    ctx.lineTo(lastX, cssHeight);
    ctx.lineTo(firstX, cssHeight);
    ctx.closePath();
    ctx.fillStyle = 'rgba(56,189,248,.25)';
    ctx.fill();
  }

  /**
   * @param {number} freq
   */
  function drawTargetLine(freq) {
    if (freq == null || !isFinite(freq)) return;
    const x = xForFreq(freq);
    ctx.save();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, cssHeight);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * @param {number} freq
   */
  function drawPeakLine(freq) {
    if (freq == null || !isFinite(freq)) return;
    const x = xForFreq(freq);
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, cssHeight);
    ctx.stroke();

    const label = `${Math.round(freq)} Hz`;
    ctx.font = '10px system-ui, -apple-system, sans-serif';
    const textW = ctx.measureText(label).width;
    const labelX = clamp(x + 4, 2, cssWidth - textW - 2);
    ctx.fillStyle = '#22c55e';
    ctx.fillText(label, labelX, 12);
  }

  /**
   * Draw a spectrum frame.
   * @param {{freqs: Float32Array, db: Float32Array, min?: number, max?: number, peakFreq?: number, targetFreq?: number}} state
   */
  function draw({ freqs, db, min, max, peakFreq, targetFreq } = {}) {
    ensureSize();
    drawBackground();
    drawRangeBand(min, max);
    drawGrid();
    drawSpectrum(freqs, db);
    drawTargetLine(targetFreq);
    drawPeakLine(peakFreq);
  }

  function clear() {
    ensureSize();
    drawBackground();
    drawGrid();
  }

  return { draw, clear };
}
