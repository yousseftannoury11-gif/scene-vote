# DrumTune Pro — Module Spec (contracts for all contributors)

Plain vanilla JS ES modules, no build step, no frameworks, no npm deps at runtime.
Runs from static hosting (GitHub Pages). Must work on iPhone Safari (iOS 15+) as a PWA.
Files live under `drum-tuner/`. `index.html` loads `js/ui/app.js` as `type="module"`.

## Design language
- Dark, pro studio look. Background #0b0d10, panels #14181d, borders #232a33.
- Accent (in tune) #22c55e, warning #f59e0b, off #ef4444, brand cyan #38bdf8.
- Font: system-ui / -apple-system. Big numeric readouts use `font-variant-numeric: tabular-nums`.
- Mobile first (375px wide iPhone). Respect `env(safe-area-inset-*)`. No horizontal scroll.
- Touch targets >= 44px. `-webkit-tap-highlight-color: transparent`, `touch-action: manipulation`.
- CSS custom properties defined in `css/app.css` on `:root`:
  --bg, --panel, --panel-2, --border, --text, --muted, --accent, --warn, --bad, --brand.

## Screens (tabs at bottom)
1. **Tune** (main): drum selector chips (top), head toggle Batter/Reso, mode toggle Lug / Pitch,
   big readout (Hz, note, cents), gauge, lug map (SVG), target row (target Hz/note, ± buttons), spectrum canvas.
2. **Kit**: list of drums, add/edit/delete drum (name, type, size, lug count), tuning presets.
3. **Tools**: interval calculator (toms), reso/batter ratio calculator, note<->Hz converter.
4. **Settings**: A4 reference, sensitivity, frequency range, auto-advance lugs, hold time, about.

## Module contracts

### js/core/notes.js
```js
export function freqToNote(freq, a4 = 440) // -> { name: 'A', octave: 3, midi: 57, cents: -12, label: 'A3' }
export function noteToFreq(midi, a4 = 440)  // -> Hz
export function centsBetween(f, target)     // -> cents (f relative to target)
export const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
```

### js/core/drums.js  (pure data + helpers)
```js
export const DRUM_TYPES = ['kick','snare','tom','floor']
// suggested fundamental pitch ranges per type/diameter (Hz) — batter head fundamental
export function suggestedRange(type, diameter) // -> { low, mid, high }  (Hz of fundamental, mid = default)
export function lugFromFundamental(f0)         // -> Hz lug freq estimate (about f0 * 1.5..1.65; use 1.58)
export function fundamentalFromLug(fLug)
export const RESO_RELATIONS = [ {id:'same',label:'Same as batter',semitones:0}, {id:'reso-up-3',label:'Reso +3 semitones (bright)',semitones:3}, {id:'reso-down-3',label:'Reso −3 semitones (fat)',semitones:-3}, {id:'reso-up-5',...5}, {id:'reso-down-5',...-5} ]
export const TUNING_PRESETS = [ { id:'rock', name:'Rock (low, punchy)', ...}, jazz, fusion, metal, custom ] // each: per-type factor 'low'|'mid'|'high' plus resoRelation id
export function defaultKit() // -> { id, name:'My Kit', drums:[ {id, name:'Kick', type:'kick', diameter:22, lugs:8, batter:{target:Hz}, reso:{target:Hz}}, snare 14" 10 lugs, tom 10" 6 lugs, tom 12" 6 lugs, floor 16" 8 lugs ] }
export function makeDrum({name,type,diameter,lugs}) // fills targets from suggestedRange().mid
export function analysisRange(type, head, mode)     // -> {min,max} Hz to search for the peak. mode 'lug'|'pitch'
```
Defaults (fundamental Hz, mid): kick 22"≈ 55 (low 45, high 70); kick 20"≈ 62; snare 14"≈ 190 (low 165, high 230); snare 13"≈ 210;
tom 8"≈ 260, 10"≈ 225, 12"≈ 185, 13"≈ 165, 14"≈ 140, 16"≈ 105, 18"≈ 90. Interpolate other sizes.
analysisRange: lug mode = [0.9*lugFromFundamental(low), 1.25*lugFromFundamental(high)], pitch mode = [0.75*low, 1.35*high]. Kick min never below 30 Hz.

### js/core/store.js
```js
export const store = { load(): State, save(state), reset() }  // localStorage key 'drumtune.v1'
// State = { kit, settings:{ a4:440, sensitivity:0.5, autoAdvance:true, holdMs:2500, showSpectrum:true }, readings:{ [drumId]: { batter:{ lug:[Hz|null...], pitch:Hz|null }, reso:{...} } } }
```

### js/audio/fft.js
```js
export function fftReal(re /*Float32Array length N (power of 2), in-place */, im /*Float32Array zeros*/)  // radix-2, forward
export function hann(n) // Float32Array window
```

### js/audio/pitch.js
```js
export function analyzeStrike(samples /*Float32Array*/, sampleRate, { min, max, fftSize = 65536 })
// -> { freq, note, magnitudeDb, peaks:[{freq, db}] (top 5 in range sorted by db), spectrum:{ freqs:Float32Array, db:Float32Array } (0..1500 Hz) } or null
export function detectOnset(samples, sampleRate, threshold) // -> index of onset or -1
```

### js/audio/engine.js
```js
export class AudioEngine extends EventTarget {
  async start()   // must be called from a user gesture; requests mic {echoCancellation:false,noiseSuppression:false,autoGainControl:false}
  stop()
  setRange({min,max}); setSensitivity(0..1)
  // events: 'level' {rms}, 'strike' {freq, note, cents?, peaks, spectrum}, 'state' {running, error}
}
```

### js/ui/lugmap.js
```js
export function createLugMap(container, { lugs, onSelect(index) }) // renders SVG drum, returns api
// api.update({ readings:[Hz|null...], target:Hz, tolerance:Hz, active:index }) colours each lug: green/amber/red/grey, shows Hz labels around, highlights active lug
// api.setLugs(n)
```

### js/ui/gauge.js
```js
export function createGauge(container) // returns { update({cents, inTune}) } needle from -50..+50 cents, animated
```

### js/ui/spectrum.js
```js
export function createSpectrum(canvas) // returns { draw({freqs, db, min, max, peakFreq, targetFreq}) } log-x axis, dB y
```

### js/ui/app.js — main controller (owned by lead)
