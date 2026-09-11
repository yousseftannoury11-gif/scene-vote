/** Lug map: SVG drum head with tappable lug circles showing per-lug tuning readings */

const VIEW = 300;
const CENTER = VIEW / 2;
const LUG_RADIUS = 128;
const LUG_R = 16;
const DEFAULT_TEXT_FILL = '#9aa4b2';

/**
 * Compute the x/y position of lug `i` of `n`, with lug 0 at 12 o'clock going clockwise.
 * @param {number} i
 * @param {number} n
 * @returns {{x:number, y:number}}
 */
function lugPos(i, n) {
  const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
  return {
    x: CENTER + Math.cos(angle) * LUG_RADIUS,
    y: CENTER + Math.sin(angle) * LUG_RADIUS,
  };
}

/**
 * Classify a reading against target/tolerance.
 * @param {number|null} hz
 * @param {number} target
 * @param {number} tolerance
 * @returns {'empty'|'good'|'warn'|'bad'}
 */
function classify(hz, target, tolerance) {
  if (hz == null || !isFinite(hz)) return 'empty';
  const diff = Math.abs(hz - target);
  if (diff <= tolerance) return 'good';
  if (diff <= tolerance * 2) return 'warn';
  return 'bad';
}

/**
 * Hint arrow for a lug reading relative to target/tolerance.
 * @param {number|null} hz
 * @param {number} target
 * @param {number} tolerance
 * @returns {string} '▲' (tighten), '▼' (loosen), or ''
 */
function hintArrow(hz, target, tolerance) {
  if (hz == null || !isFinite(hz)) return '';
  if (hz < target - tolerance) return '▲';
  if (hz > target + tolerance) return '▼';
  return '';
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * @param {string} name
 * @param {Record<string,string|number>} attrs
 * @param {Element} [parent]
 * @returns {SVGElement}
 */
function el(name, attrs = {}, parent) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

/**
 * Create an interactive lug map UI.
 * @param {HTMLElement} container
 * @param {{ lugs: number, onSelect?: (index: number) => void }} opts
 * @returns {{ update: (state: {readings:(number|null)[], target:number, tolerance:number, active?: number}) => void, setLugs: (n: number) => void, destroy: () => void }}
 */
export function createLugMap(container, { lugs, onSelect } = {}) {
  let n = lugs;
  let svg = null;
  let lugEls = []; // { g, circle, label, hz }
  let defsGradId = `lugmap-grad-${Math.random().toString(36).slice(2)}`;
  let centerAvg = null;
  let centerLbl = null;
  let lastState = { readings: [], target: 0, tolerance: 1, active: -1 };

  function handlePointerDown(e) {
    const g = e.currentTarget;
    const idx = Number(g.dataset.index);
    if (onSelect) onSelect(idx);
  }

  function handleKeydown(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    const g = e.currentTarget;
    const idx = Number(g.dataset.index);
    if (onSelect) onSelect(idx);
  }

  function render() {
    container.innerHTML = '';
    lugEls = [];

    svg = el('svg', {
      viewBox: `0 0 ${VIEW} ${VIEW}`,
      width: '100%',
      height: '100%',
      class: 'lugmap-svg',
    });

    const defs = el('defs', {}, svg);
    const grad = el('radialGradient', { id: defsGradId, cx: '50%', cy: '42%', r: '65%' }, defs);
    el('stop', { offset: '0%', 'stop-color': '#232b35' }, grad);
    el('stop', { offset: '100%', 'stop-color': '#1c222a' }, grad);

    // outer hoop ring
    el('circle', {
      cx: CENTER, cy: CENTER, r: 142,
      fill: 'none', stroke: '#3a4451', 'stroke-width': 6,
    }, svg);

    // drum head
    el('circle', {
      cx: CENTER, cy: CENTER, r: 132,
      fill: `url(#${defsGradId})`,
    }, svg);

    // faint rim
    el('circle', {
      cx: CENTER, cy: CENTER, r: 132,
      fill: 'none', stroke: '#3a4451', 'stroke-width': 1, opacity: 0.5,
    }, svg);

    // center avg readout
    centerAvg = el('text', {
      x: CENTER, y: CENTER - 4,
      'text-anchor': 'middle', class: 'center-avg',
      style: `fill:${DEFAULT_TEXT_FILL}`,
      'font-size': 22, 'font-weight': 600,
    }, svg);
    centerAvg.textContent = '--';

    centerLbl = el('text', {
      x: CENTER, y: CENTER + 16,
      'text-anchor': 'middle', class: 'center-lbl',
      style: `fill:${DEFAULT_TEXT_FILL}`,
      'font-size': 11, 'letter-spacing': '0.05em',
    }, svg);
    centerLbl.textContent = 'avg';

    for (let i = 0; i < n; i++) {
      const { x, y } = lugPos(i, n);
      const g = el('g', {
        class: 'lug-g',
        'data-index': i,
        tabindex: 0,
        role: 'button',
        'aria-label': `Lug ${i + 1}`,
      }, svg);

      const circle = el('circle', {
        class: 'lug empty',
        cx: x, cy: y, r: LUG_R,
        stroke: '#3a4451', 'stroke-width': 1.5,
      }, g);

      const label = el('text', {
        class: 'lug-label',
        x, y: y + 4,
        'text-anchor': 'middle',
        style: 'fill:#e5e7eb',
        'font-size': 13, 'font-weight': 600,
      }, g);
      label.textContent = String(i + 1);

      // hz label placed just inside the lug circle (towards the centre) so it never clips
      const dx = x - CENTER;
      const dy = y - CENTER;
      const dist = Math.hypot(dx, dy) || 1;
      const hzX = x - (dx / dist) * (LUG_R + 15);
      const hzY = y - (dy / dist) * (LUG_R + 15);

      const hz = el('text', {
        class: 'lug-hz',
        x: hzX, y: hzY + 4,
        'text-anchor': 'middle',
        style: `fill:${DEFAULT_TEXT_FILL}`,
        'font-size': 11,
      }, g);
      hz.textContent = '';

      g.addEventListener('pointerdown', handlePointerDown);
      g.addEventListener('keydown', handleKeydown);

      lugEls.push({ g, circle, label, hz });
    }

    container.appendChild(svg);
    applyState(lastState);
  }

  function applyState(state) {
    lastState = state;
    const { readings = [], target = 0, tolerance = 1, active = -1 } = state;

    let sum = 0;
    let count = 0;

    for (let i = 0; i < n; i++) {
      const entry = lugEls[i];
      if (!entry) continue;
      const hz = readings[i] ?? null;
      const cls = classify(hz, target, tolerance);

      entry.circle.setAttribute('class', `lug ${cls}${i === active ? ' active' : ''}`);
      entry.g.classList.toggle('active', i === active);

      if (hz != null && isFinite(hz)) {
        const arrow = hintArrow(hz, target, tolerance);
        entry.hz.textContent = arrow ? `${Math.round(hz)} ${arrow}` : `${Math.round(hz)}`;
        sum += hz;
        count++;
      } else {
        entry.hz.textContent = '';
      }
    }

    if (centerAvg) {
      centerAvg.textContent = count > 0 ? String(Math.round(sum / count)) : '--';
    }
  }

  /**
   * Update lug colours/labels from current readings.
   * @param {{readings:(number|null)[], target:number, tolerance:number, active?: number}} state
   */
  function update(state) {
    applyState(state);
  }

  /**
   * Re-render with a new lug count.
   * @param {number} count
   */
  function setLugs(count) {
    n = count;
    render();
  }

  function destroy() {
    for (const { g } of lugEls) {
      g.removeEventListener('pointerdown', handlePointerDown);
      g.removeEventListener('keydown', handleKeydown);
    }
    container.innerHTML = '';
    lugEls = [];
    svg = null;
  }

  render();

  return { update, setLugs, destroy };
}
