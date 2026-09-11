/**
 * DrumTune Pro — main controller.
 * Wires the mic engine, the kit/state store and the UI screens together.
 */
import { AudioEngine } from '../audio/engine.js';
import { freqToNote, noteToFreq, centsBetween, nearestNoteFreq } from '../core/notes.js';
import {
  DRUM_TYPES, DEFAULT_LUGS, RESO_RELATIONS, TUNING_PRESETS,
  suggestedRange, lugFromFundamental, lugOrder, makeDrum, applyPreset, uid,
} from '../core/drums.js';
import { store, ensureReadings } from '../core/store.js';
import { createLugMap } from './lugmap.js';
import { createGauge } from './gauge.js';
import { createSpectrum } from './spectrum.js';

const $ = (id) => document.getElementById(id);
const round1 = (x) => Math.round(x * 10) / 10;

// ---------- state ----------
const state = store.load();
const ui = {
  drumId: null,
  head: 'batter',      // batter | reso
  mode: 'lug',         // lug | pitch
  activeLug: 0,
  strikeLug: null,     // lug the last strike was recorded on
  last: null,          // last strike result
  lastAt: 0,
};
let holdTimer = null;

function save() { store.save(state); }

function currentDrum() {
  const d = state.kit.drums.find(x => x.id === ui.drumId) || state.kit.drums[0];
  if (d) ui.drumId = d.id;
  return d;
}

/** Make sure a drum has a lug target for both heads (older saves may lack it). */
function normalizeDrum(d) {
  for (const head of ['batter', 'reso']) {
    d[head] = d[head] || { target: suggestedRange(d.type, d.diameter).mid };
    d[head].target = Math.round(d[head].target);
    if (!d[head].lugTarget) d[head].lugTarget = Math.round(lugFromFundamental(d[head].target));
  }
  d.lugs = d.lugs || DEFAULT_LUGS[d.type] || 8;
  return d;
}
state.kit.drums.forEach(normalizeDrum);

function targetHz(d = currentDrum()) {
  return ui.mode === 'lug' ? d[ui.head].lugTarget : d[ui.head].target;
}
function setTargetHz(v) {
  const d = currentDrum();
  v = Math.max(20, Math.min(1500, Math.round(v)));
  if (ui.mode === 'lug') d[ui.head].lugTarget = v; else d[ui.head].target = v;
  save();
  applyRange();
  renderTarget();
  renderLugs();
}

/** Frequency window the analyser looks in, based on the current target. */
function searchRange() {
  const t = targetHz();
  // lug mode: keep the fundamental (≈ target / 1.58) out of the window
  const lo = ui.mode === 'lug' ? 0.7 : 0.6;
  const hi = ui.mode === 'lug' ? 1.45 : 1.5;
  return { min: Math.max(30, Math.round(t * lo)), max: Math.min(1200, Math.round(t * hi)), prefer: t };
}

// ---------- audio ----------
const engine = new AudioEngine();
engine.setSensitivity(state.settings.sensitivity);
engine.setA4(state.settings.a4);
function applyRange() { engine.setRange(searchRange()); }

engine.addEventListener('state', (e) => {
  const { running, error } = e.detail;
  const btn = $('mic-btn');
  btn.classList.toggle('on', running);
  btn.setAttribute('aria-pressed', String(running));
  btn.querySelector('.label').textContent = running ? 'Stop' : 'Start';
  if (error) toast(error, 5000);
  else if (running) setHint(ui.mode === 'lug'
    ? `Listening. Tap the ${ui.head} head about 1 inch from lug ${ui.activeLug + 1}.`
    : `Listening. Hit the ${ui.head} head in the centre.`);
  else setHint('Tap Start, then tap the drum head about 1 inch from a lug.');
  if (!running) $('level-meter').querySelector('.bar').style.width = '0%';
});

engine.addEventListener('level', (e) => {
  const pct = Math.min(100, (e.detail.rms / 0.25) * 100);
  $('level-meter').querySelector('.bar').style.width = pct.toFixed(0) + '%';
});

engine.addEventListener('strike', (e) => onStrike(e.detail));

function onStrike(r) {
  const d = currentDrum();
  if (!d) return;
  const readings = ensureReadings(state, d);
  const freq = round1(r.freq);
  ui.last = r;
  ui.lastAt = performance.now();

  // a refined (longer-window) result belongs to the same lug as the first one,
  // even if we already moved the cursor on to the next lug
  const lugIndex = r.refined && ui.strikeLug != null ? ui.strikeLug : ui.activeLug;
  if (ui.mode === 'lug') {
    readings[ui.head].lug[lugIndex] = freq;
    if (!r.refined) ui.strikeLug = lugIndex;
  } else {
    readings[ui.head].pitch = freq;
  }
  save();
  renderReadout(freq);
  renderLugs();
  if (state.settings.showSpectrum) drawSpectrum(r);

  const t = targetHz(d);
  const diff = freq - t;
  const tol = state.settings.tolerance;
  let advice;
  if (Math.abs(diff) <= tol) advice = 'in tune ✓';
  else advice = `${Math.abs(diff).toFixed(1)} Hz ${diff < 0 ? 'low → tighten' : 'high → loosen'} ${turnHint(diff, t)}`;
  if (ui.mode === 'lug') {
    setHint(`Lug ${lugIndex + 1}: ${freq} Hz — ${advice}`);
    if (state.settings.autoAdvance && !r.refined) scheduleAdvance();
  } else {
    setHint(`Pitch: ${freq} Hz (${r.note ? r.note.label : ''}) — ${advice}`);
  }

  clearTimeout(holdTimer);
  holdTimer = setTimeout(() => document.querySelector('.readout').classList.add('stale'), state.settings.holdMs);
  document.querySelector('.readout').classList.remove('stale');
}

let advanceTimer = null;
function scheduleAdvance() {
  clearTimeout(advanceTimer);
  advanceTimer = setTimeout(() => {
    const d = currentDrum();
    const order = lugOrder(d.lugs);
    const pos = order.indexOf(ui.activeLug);
    ui.activeLug = order[(pos + 1) % order.length];
    renderLugs();
    setHint(`Now tap near lug ${ui.activeLug + 1}.`);
  }, 900);
}

/** Rough wrench guidance: how far to turn the rod. */
function turnHint(diffHz, target) {
  const pct = Math.abs(diffHz) / target;
  if (pct < 0.02) return '(~1/16 turn)';
  if (pct < 0.05) return '(~1/8 turn)';
  if (pct < 0.1) return '(~1/4 turn)';
  return '(~1/2 turn)';
}

// ---------- rendering: tune tab ----------
let lugmap, gauge, spectrum;

function renderChips() {
  const box = $('drum-chips');
  box.innerHTML = '';
  for (const d of state.kit.drums) {
    const b = document.createElement('button');
    b.className = 'chip' + (d.id === ui.drumId ? ' active' : '');
    b.dataset.id = d.id;
    b.textContent = `${d.name} ${d.diameter}"`;
    b.addEventListener('click', () => selectDrum(d.id));
    box.appendChild(b);
  }
}

function selectDrum(id) {
  ui.drumId = id;
  ui.activeLug = 0;
  ui.last = null;
  const d = currentDrum();
  lugmap.setLugs(d.lugs);
  applyRange();
  renderChips();
  renderTarget();
  renderReadout(null);
  renderLugs();
  spectrum.clear();
}

function renderTarget() {
  const d = currentDrum();
  if (!d) return;
  const t = targetHz(d);
  const n = freqToNote(t, state.settings.a4);
  $('target-hz').textContent = `${t} Hz`;
  $('target-note').textContent = n ? `${n.label} ${n.cents >= 0 ? '+' : ''}${n.cents}¢` : '—';
  $('target-preset').value = '';
}

function renderReadout(freq) {
  const hz = $('readout-hz'), note = $('readout-note'), cents = $('readout-cents');
  if (!freq) {
    hz.innerHTML = '— <small>Hz</small>';
    note.textContent = '—';
    cents.textContent = '—';
    cents.className = 'cents';
    gauge.update({ cents: 0, inTune: false, hasValue: false });
    return;
  }
  const t = targetHz();
  const c = Math.round(centsBetween(freq, t));
  const n = freqToNote(freq, state.settings.a4);
  hz.innerHTML = `${freq.toFixed(1)} <small>Hz</small>`;
  note.textContent = n ? n.label : '—';
  const diff = freq - t;
  const tol = state.settings.tolerance;
  const cls = Math.abs(diff) <= tol ? 'good' : Math.abs(diff) <= 2 * tol ? 'warn' : 'bad';
  cents.textContent = `${c >= 0 ? '+' : ''}${c}¢ vs target`;
  cents.className = 'cents ' + cls;
  gauge.update({ cents: c, inTune: cls === 'good', hasValue: true });
}

function renderLugs() {
  const d = currentDrum();
  if (!d) return;
  const readings = ensureReadings(state, d);
  const t = targetHz(d);
  const tol = state.settings.tolerance;
  const isLug = ui.mode === 'lug';
  $('lugmap').style.display = isLug ? '' : 'none';
  $('next-lug').style.display = isLug ? '' : 'none';
  const arr = readings[ui.head].lug;
  if (isLug) lugmap.update({ readings: arr, target: t, tolerance: tol, active: ui.activeLug });

  const vals = (isLug ? arr : [readings[ui.head].pitch]).filter(v => v != null);
  const stats = $('lug-stats');
  if (!vals.length) { stats.innerHTML = tile('Avg', '—') + tile('Spread', '—') + tile('Evenness', '—'); return; }
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const spread = Math.max(...vals) - Math.min(...vals);
  const centsSpread = 1200 * Math.log2(Math.max(...vals) / Math.min(...vals));
  const even = Math.max(0, Math.min(100, Math.round(100 - centsSpread * 0.6)));
  const avgDiff = avg - t;
  const avgCls = Math.abs(avgDiff) <= tol ? 'good' : Math.abs(avgDiff) <= 2 * tol ? 'warn' : 'bad';
  stats.innerHTML =
    tile('Avg', `${avg.toFixed(1)} Hz`, avgCls) +
    tile('Spread', `${spread.toFixed(1)} Hz`, spread <= tol ? 'good' : spread <= 2 * tol ? 'warn' : 'bad') +
    tile('Evenness', isLug ? `${even}%` : '—', even >= 90 ? 'good' : even >= 75 ? 'warn' : 'bad');
}
function tile(k, v, cls = '') { return `<div class="stat ${cls}"><div class="k">${k}</div><div class="v">${v}</div></div>`; }

function drawSpectrum(r) {
  const { min, max } = searchRange();
  spectrum.draw({ freqs: r.spectrum.freqs, db: r.spectrum.db, min, max, peakFreq: r.freq, targetFreq: targetHz() });
}

function setHint(text) { $('hint').textContent = text; }

let toastTimer = null;
function toast(msg, ms = 2500) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

// ---------- kit tab ----------
function renderKit() {
  const list = $('kit-list');
  list.innerHTML = '';
  for (const d of state.kit.drums) {
    const card = document.createElement('div');
    card.className = 'drum-card';
    card.dataset.id = d.id;
    card.innerHTML = `
      <div class="info">
        <div class="name">${esc(d.name)} <span class="muted">${d.diameter}" · ${d.lugs} lugs</span></div>
        <div class="meta">Batter ${d.batter.target} Hz (${noteLabel(d.batter.target)}) · Reso ${d.reso.target} Hz (${noteLabel(d.reso.target)}) · Lug ${d.batter.lugTarget} Hz</div>
      </div>
      <div class="actions">
        <button class="btn ghost edit" aria-label="Edit ${esc(d.name)}">Edit</button>
        <button class="btn ghost delete" aria-label="Delete ${esc(d.name)}">✕</button>
      </div>`;
    card.querySelector('.edit').addEventListener('click', () => openDrumDialog(d));
    card.querySelector('.delete').addEventListener('click', () => {
      if (state.kit.drums.length <= 1) return toast('Keep at least one drum.');
      if (!confirm(`Delete ${d.name}?`)) return;
      state.kit.drums = state.kit.drums.filter(x => x.id !== d.id);
      delete state.readings[d.id];
      save();
      if (ui.drumId === d.id) ui.drumId = null;
      renderKit(); selectDrum(currentDrum().id);
    });
    list.appendChild(card);
  }
  const sel = $('preset-select');
  if (!sel.options.length) {
    for (const p of TUNING_PRESETS) {
      const o = document.createElement('option');
      o.value = p.id; o.textContent = p.name;
      sel.appendChild(o);
    }
    sel.addEventListener('change', renderPresetDesc);
  }
  renderPresetDesc();
}
function renderPresetDesc() {
  const p = TUNING_PRESETS.find(x => x.id === $('preset-select').value) || TUNING_PRESETS[0];
  $('preset-desc').textContent = p ? p.description : '';
}
function noteLabel(hz) { const n = freqToNote(hz, state.settings.a4); return n ? n.label : ''; }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function openDrumDialog(d) {
  $('df-id').value = d ? d.id : '';
  $('df-name').value = d ? d.name : '';
  $('df-type').value = d ? d.type : 'tom';
  $('df-diameter').value = d ? d.diameter : 12;
  $('df-lugs').value = d ? d.lugs : DEFAULT_LUGS.tom;
  const dlg = $('drum-dialog');
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
}

function saveDrumDialog() {
  const id = $('df-id').value;
  const name = $('df-name').value.trim() || 'Drum';
  const type = DRUM_TYPES.includes($('df-type').value) ? $('df-type').value : 'tom';
  const diameter = Math.max(6, Math.min(30, Number($('df-diameter').value) || 12));
  const lugs = Math.max(4, Math.min(16, Number($('df-lugs').value) || DEFAULT_LUGS[type]));
  if (id) {
    const d = state.kit.drums.find(x => x.id === id);
    const changedSize = d.type !== type || d.diameter !== diameter;
    Object.assign(d, { name, type, diameter, lugs });
    if (changedSize) {
      const mid = Math.round(suggestedRange(type, diameter).mid);
      d.batter.target = mid; d.reso.target = Math.round(mid * Math.pow(2, 3 / 12));
      delete d.batter.lugTarget; delete d.reso.lugTarget;
    }
    normalizeDrum(d);
    ensureReadings(state, d);
  } else {
    const d = normalizeDrum(makeDrum({ name, type, diameter, lugs }));
    d.id = d.id || uid();
    state.kit.drums.push(d);
    ensureReadings(state, d);
  }
  save();
  renderKit();
  selectDrum(id || state.kit.drums[state.kit.drums.length - 1].id);
  $('drum-dialog').close?.();
  $('drum-dialog').removeAttribute('open');
}

// ---------- tools tab ----------
function renderTools() {
  const a4 = state.settings.a4;
  // intervals
  const from = Number($('iv-from-hz').value) || 100;
  const semis = Number($('iv-semitones').value) || 5;
  const count = Math.max(2, Math.min(6, Number($('iv-count').value) || 3));
  let html = '<ol class="list">';
  for (let i = 0; i < count; i++) {
    const f = from * Math.pow(2, (semis * i) / 12);
    html += `<li><b>${f.toFixed(1)} Hz</b> <span class="muted">${noteLabel(f)} · lug ≈ ${Math.round(lugFromFundamental(f))} Hz</span></li>`;
  }
  $('iv-result').innerHTML = html + '</ol>';
  // reso ratio
  const rsel = $('ratio-relation');
  if (!rsel.options.length) {
    for (const r of RESO_RELATIONS) {
      const o = document.createElement('option');
      o.value = r.id; o.textContent = r.label; rsel.appendChild(o);
    }
    rsel.value = 'reso-up-3';
  }
  const batter = Number($('ratio-batter').value) || 100;
  const rel = RESO_RELATIONS.find(r => r.id === rsel.value) || RESO_RELATIONS[0];
  const reso = batter * Math.pow(2, rel.semitones / 12);
  $('ratio-result').innerHTML =
    `Reso head: <b>${reso.toFixed(1)} Hz</b> <span class="muted">${noteLabel(reso)}</span><br>` +
    `<span class="muted">Batter lug ≈ ${Math.round(lugFromFundamental(batter))} Hz · Reso lug ≈ ${Math.round(lugFromFundamental(reso))} Hz</span>`;
  // converter
  const hz = Number($('cv-hz').value) || 0;
  const n = freqToNote(hz, a4);
  $('cv-out').innerHTML = n
    ? `<b>${n.label}</b> ${n.cents >= 0 ? '+' : ''}${n.cents}¢ <span class="muted">· nearest ${nearestNoteFreq(hz, a4).toFixed(2)} Hz · MIDI ${n.midi}</span>`
    : '—';
}

// ---------- settings tab ----------
function renderSettings() {
  const s = state.settings;
  $('set-a4').value = s.a4;
  $('set-sensitivity').value = s.sensitivity;
  $('set-tolerance').value = s.tolerance;
  $('set-autoadvance').checked = s.autoAdvance;
  $('set-hold').value = s.holdMs;
  $('set-spectrum').checked = s.showSpectrum;
  $('spectrum').style.display = s.showSpectrum ? '' : 'none';
}
function bindSettings() {
  const s = state.settings;
  $('set-a4').addEventListener('change', e => { s.a4 = Math.max(400, Math.min(480, Number(e.target.value) || 440)); engine.setA4(s.a4); save(); renderTarget(); renderKit(); });
  $('set-sensitivity').addEventListener('input', e => { s.sensitivity = Number(e.target.value); engine.setSensitivity(s.sensitivity); save(); });
  $('set-tolerance').addEventListener('change', e => { s.tolerance = Math.max(1, Math.min(20, Number(e.target.value) || 3)); save(); renderLugs(); });
  $('set-autoadvance').addEventListener('change', e => { s.autoAdvance = e.target.checked; save(); });
  $('set-hold').addEventListener('change', e => { s.holdMs = Math.max(500, Number(e.target.value) || 2500); save(); });
  $('set-spectrum').addEventListener('change', e => { s.showSpectrum = e.target.checked; save(); renderSettings(); });
  $('reset-all').addEventListener('click', () => {
    if (!confirm('Reset kit, targets and all readings?')) return;
    store.reset();
    location.reload();
  });
}

// ---------- tabs ----------
function showTab(name) {
  document.querySelectorAll('.tab').forEach(s => { s.hidden = s.id !== `tab-${name}`; });
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  if (name === 'tools') renderTools();
  if (name === 'kit') renderKit();
  if (name === 'settings') renderSettings();
  try { localStorage.setItem('drumtune.tab', name); } catch { /* ignore */ }
}

// ---------- boot ----------
function init() {
  lugmap = createLugMap($('lugmap'), { lugs: currentDrum().lugs, onSelect: (i) => { ui.activeLug = i; renderLugs(); setHint(`Tap near lug ${i + 1}.`); } });
  gauge = createGauge($('gauge'));
  spectrum = createSpectrum($('spectrum'));

  $('mic-btn').addEventListener('click', () => (engine.running ? engine.stop() : engine.start()));

  $('head-toggle').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    ui.head = b.dataset.head;
    $('head-toggle').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    applyRange(); renderTarget(); renderReadout(null); renderLugs();
  });
  $('mode-toggle').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    ui.mode = b.dataset.mode;
    $('mode-toggle').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    applyRange(); renderTarget(); renderReadout(null); renderLugs();
    setHint(ui.mode === 'lug' ? 'Lug mode: tap 1 inch from each lug. Muffle the centre with a finger for a cleaner reading.' : 'Pitch mode: hit the head in the centre to read the fundamental pitch.');
  });

  $('target-minus').addEventListener('click', () => setTargetHz(targetHz() - 1));
  $('target-plus').addEventListener('click', () => setTargetHz(targetHz() + 1));
  $('target-preset').addEventListener('change', (e) => {
    const level = e.target.value; if (!level) return;
    const d = currentDrum();
    let f0 = suggestedRange(d.type, d.diameter)[level];
    if (ui.head === 'reso') f0 *= Math.pow(2, 3 / 12);
    d[ui.head].target = Math.round(f0);
    d[ui.head].lugTarget = Math.round(lugFromFundamental(f0));
    save(); applyRange(); renderTarget(); renderLugs();
    toast(`Target set to ${level}: ${d[ui.head].target} Hz (lug ${d[ui.head].lugTarget} Hz)`);
  });

  $('clear-readings').addEventListener('click', () => {
    const d = currentDrum();
    const r = ensureReadings(state, d);
    r[ui.head].lug.fill(null); r[ui.head].pitch = null;
    ui.activeLug = 0;
    save(); renderReadout(null); renderLugs(); spectrum.clear();
  });
  $('next-lug').addEventListener('click', () => {
    const d = currentDrum();
    const order = lugOrder(d.lugs);
    ui.activeLug = order[(order.indexOf(ui.activeLug) + 1) % order.length];
    renderLugs(); setHint(`Tap near lug ${ui.activeLug + 1}.`);
  });

  $('add-drum').addEventListener('click', () => openDrumDialog(null));
  $('df-cancel').addEventListener('click', () => { $('drum-dialog').close?.(); $('drum-dialog').removeAttribute('open'); });
  $('drum-form').addEventListener('submit', (e) => { e.preventDefault(); saveDrumDialog(); });
  $('df-type').addEventListener('change', (e) => { if (!$('df-id').value) $('df-lugs').value = DEFAULT_LUGS[e.target.value]; });
  $('apply-preset').addEventListener('click', () => {
    const id = $('preset-select').value;
    const kit = applyPreset(state.kit, id);
    kit.drums.forEach(d => { d.batter.target = Math.round(d.batter.target); d.reso.target = Math.round(d.reso.target); delete d.batter.lugTarget; delete d.reso.lugTarget; normalizeDrum(d); });
    state.kit = kit;
    save(); renderKit(); selectDrum(ui.drumId);
    toast('Preset applied to all drums.');
  });

  ['iv-from-hz', 'iv-semitones', 'iv-count', 'ratio-batter', 'ratio-relation', 'cv-hz']
    .forEach(id => $(id).addEventListener('input', renderTools));

  document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  bindSettings();

  // first paint
  renderChips();
  selectDrum(currentDrum().id);
  renderSettings();
  renderKit();
  renderTools();
  let tab = 'tune';
  try { tab = localStorage.getItem('drumtune.tab') || 'tune'; } catch { /* ignore */ }
  showTab(tab);

  // stop the mic when the page is hidden (saves battery, avoids iOS audio glitches)
  document.addEventListener('visibilitychange', () => { if (document.hidden && engine.running) engine.stop(); });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
// expose for tests / debugging
window.__drumtune = { state, ui, engine, onStrike };
