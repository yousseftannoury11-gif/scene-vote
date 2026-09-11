/**
 * Microphone engine: captures audio, spots drum strikes and analyses them.
 *
 * Works on iPhone Safari: the AudioContext and getUserMedia are created inside
 * start(), which must be called from a tap. Uses an AnalyserNode polled on a
 * timer (no AudioWorklet needed), so it also survives Safari quirks.
 *
 * Events (CustomEvent.detail):
 *   'level'  { rms, db }
 *   'strike' { freq, note, peaks, spectrum, prominence, refined }
 *   'state'  { running, error }
 */
import { analyzeStrike, detectOnset, rms } from './pitch.js';

const FIRST_DELAY_MS = 330;   // wait for the ring after a hit before analysing
const REFINE_DELAY_MS = 700;  // second, longer analysis if the drum still rings
const SKIP_MS = 12;           // drop the noisy transient right after the hit

export class AudioEngine extends EventTarget {
  constructor() {
    super();
    this.ctx = null;
    this.stream = null;
    this.analyser = null;
    this.timer = null;
    this.buf = null;
    this.range = { min: 40, max: 600, prefer: null };
    this.a4 = 440;
    this.sensitivity = 0.5;
    this.noise = 0.001;
    this.state = 'idle';       // idle | wait | refine | cooldown
    this.strikeAt = 0;
    this.lastLevel = 0;
    this.running = false;
  }

  get threshold() {
    // sensitivity 1 → very quiet taps trigger; 0 → only loud hits
    return 0.003 * Math.pow(10, (1 - this.sensitivity) * 1.5);
  }

  setRange(r) { this.range = { min: r.min, max: r.max, prefer: r.prefer || null }; }
  setSensitivity(v) { this.sensitivity = Math.min(1, Math.max(0, v)); }
  setA4(v) { this.a4 = v; }

  /** Must be called from a user gesture (tap). */
  async start() {
    if (this.running) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('Web Audio is not supported in this browser.');
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access needs HTTPS (or localhost) and a modern browser.');
      }
      this.ctx = this.ctx || new AC();
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
        video: false,
      });
      const src = this.ctx.createMediaStreamSource(this.stream);
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 25;
      hp.Q.value = 0.7;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 32768;
      this.analyser.smoothingTimeConstant = 0;
      src.connect(hp);
      hp.connect(this.analyser);
      this.buf = new Float32Array(this.analyser.fftSize);
      this.stream.getAudioTracks().forEach(t => {
        t.addEventListener('ended', () => this.stop('Microphone was disconnected.'));
      });
      this.running = true;
      this.state = 'idle';
      this.noise = 0.001;
      this.timer = setInterval(() => this.tick(), 25);
      this.emit('state', { running: true, error: null });
    } catch (err) {
      this.cleanup();
      const msg = err && err.name === 'NotAllowedError'
        ? 'Microphone permission was denied. Allow it in Settings → Safari → Microphone.'
        : (err && err.message) || String(err);
      this.emit('state', { running: false, error: msg });
    }
  }

  stop(error = null) {
    this.cleanup();
    this.emit('state', { running: false, error });
  }

  cleanup() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.analyser = null;
    this.running = false;
    this.state = 'idle';
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  tick() {
    if (!this.analyser) return;
    const sr = this.ctx.sampleRate;
    this.analyser.getFloatTimeDomainData(this.buf);
    const n = this.buf.length;
    const recent = this.buf.subarray(n - Math.round(sr * 0.02)); // last 20 ms
    const level = rms(recent);
    this.lastLevel = level;
    this.emit('level', { rms: level, db: 20 * Math.log10(level + 1e-9) });

    const now = performance.now();
    const thr = this.threshold;

    if (this.state === 'idle') {
      if (level > thr && level > this.noise * 4) {
        this.strikeAt = now;
        this.state = 'wait';
      } else {
        this.noise = this.noise * 0.95 + level * 0.05;
      }
      return;
    }

    if (this.state === 'wait' && now - this.strikeAt >= FIRST_DELAY_MS) {
      const ok = this.analyse(sr, false);
      this.state = ok ? 'refine' : 'cooldown';
      return;
    }

    if (this.state === 'refine' && now - this.strikeAt >= REFINE_DELAY_MS) {
      // only refine if the drum is still clearly ringing
      if (level > thr * 0.5) this.analyse(sr, true);
      this.state = 'cooldown';
      return;
    }

    if (this.state === 'cooldown') {
      // re-arm once the sound has died down or after a while
      if (level < thr * 0.6 || now - this.strikeAt > 1500) this.state = 'idle';
    }
  }

  /** Analyse the buffer around the most recent strike. */
  analyse(sr, refined) {
    const n = this.buf.length;
    // the strike happened roughly (now - strikeAt) ms before the end of the buffer
    const elapsed = (performance.now() - this.strikeAt) / 1000;
    const approx = n - Math.round(elapsed * sr);
    const searchFrom = Math.max(0, approx - Math.round(sr * 0.08));
    const searchTo = Math.min(n, approx + Math.round(sr * 0.08));
    let onset = detectOnset(this.buf.subarray(searchFrom, searchTo), sr, this.threshold);
    onset = onset < 0 ? Math.max(0, approx) : searchFrom + onset;
    const start = Math.min(n - 256, onset + Math.round(sr * SKIP_MS / 1000));
    const seg = this.buf.subarray(start);
    const res = analyzeStrike(seg, sr, { min: this.range.min, max: this.range.max, prefer: this.range.prefer, a4: this.a4 });
    if (!res || res.prominence < 12) return false;
    this.emit('strike', { ...res, refined, windowMs: Math.round(seg.length / sr * 1000) });
    return true;
  }
}
