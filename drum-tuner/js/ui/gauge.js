/** Cents gauge: semicircular needle dial from -50 to +50 cents */

const SVG_NS = 'http://www.w3.org/2000/svg';
const CX = 150;
const CY = 92;
const R_TRACK = 82;
const R_TICK_OUT = 90;
const R_LABEL = 68;
const NEEDLE_LEN = 74;

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
 * Map a cents value to the gauge's angle in degrees (180 = left/-50, 90 = top/0, 0 = right/+50).
 * @param {number} cents
 * @returns {number}
 */
function centsToTheta(cents) {
  return 90 * (1 - cents / 50);
}

/**
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {number} thetaDeg
 * @returns {{x:number, y:number}}
 */
function polar(cx, cy, r, thetaDeg) {
  const rad = (thetaDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

/**
 * Build an SVG arc path string sweeping clockwise from thetaStart to thetaEnd (thetaStart > thetaEnd).
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {number} thetaStart
 * @param {number} thetaEnd
 * @returns {string}
 */
function arcPath(cx, cy, r, thetaStart, thetaEnd) {
  const p1 = polar(cx, cy, r, thetaStart);
  const p2 = polar(cx, cy, r, thetaEnd);
  const large = Math.abs(thetaStart - thetaEnd) > 180 ? 1 : 0;
  return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${large} 1 ${p2.x} ${p2.y}`;
}

/**
 * Create the cents gauge UI.
 * @param {HTMLElement} container
 * @returns {{ update: (state: {cents:number, inTune:boolean, hasValue?:boolean}) => void }}
 */
export function createGauge(container) {
  const svg = el('svg', {
    viewBox: '0 0 300 100',
    width: '100%',
    height: '100%',
    class: 'gauge-svg',
  });

  // base track
  el('path', {
    d: arcPath(CX, CY, R_TRACK, 180, 0),
    fill: 'none', stroke: '#262e38', 'stroke-width': 10,
    'stroke-linecap': 'round',
  }, svg);

  // amber zone (+/-15 cents)
  el('path', {
    d: arcPath(CX, CY, R_TRACK, centsToTheta(-15), centsToTheta(15)),
    fill: 'none', stroke: '#f59e0b', 'stroke-width': 10, opacity: 0.4,
    'stroke-linecap': 'round',
  }, svg);

  // green zone (+/-5 cents)
  el('path', {
    d: arcPath(CX, CY, R_TRACK, centsToTheta(-5), centsToTheta(5)),
    fill: 'none', stroke: '#22c55e', 'stroke-width': 10, opacity: 0.9,
    'stroke-linecap': 'round',
  }, svg);

  // tick marks every 10 cents
  for (let c = -50; c <= 50; c += 10) {
    const theta = centsToTheta(c);
    const p1 = polar(CX, CY, R_TRACK - 3, theta);
    const p2 = polar(CX, CY, R_TICK_OUT, theta);
    el('line', {
      x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
      stroke: '#3a4451', 'stroke-width': 1.5,
    }, svg);
  }

  // labels at -50, -25, 0, 25, 50
  for (const c of [-50, -25, 0, 25, 50]) {
    const theta = centsToTheta(c);
    const p = polar(CX, CY, R_LABEL, theta);
    const text = el('text', {
      x: p.x, y: p.y + 4,
      'text-anchor': 'middle',
      style: 'fill:#6b7684',
      'font-size': 9,
    }, svg);
    text.textContent = c > 0 ? `+${c}` : String(c);
  }

  const needleGroup = el('g', {
    class: 'gauge-needle',
    style: `transform-origin:${CX}px ${CY}px; transition: transform 120ms ease-out;`,
  }, svg);

  const needleTip = polar(CX, CY, NEEDLE_LEN, 90); // rest at 0 cents (straight up)
  const needleLine = el('line', {
    x1: CX, y1: CY, x2: needleTip.x, y2: needleTip.y,
    stroke: '#e5e7eb', 'stroke-width': 3, 'stroke-linecap': 'round',
  }, needleGroup);

  const hub = el('circle', {
    cx: CX, cy: CY, r: 7,
    fill: '#e5e7eb', stroke: '#0b0d10', 'stroke-width': 1.5,
  }, needleGroup);

  container.innerHTML = '';
  container.appendChild(svg);

  /**
   * Update the needle position and in-tune indication.
   * @param {{cents:number, inTune:boolean, hasValue?:boolean}} state
   */
  function update({ cents = 0, inTune = false, hasValue = true } = {}) {
    const clamped = Math.max(-50, Math.min(50, cents));
    const deg = hasValue ? 1.8 * clamped : 0;

    needleGroup.style.transform = `rotate(${deg}deg)`;
    needleGroup.style.opacity = hasValue ? '1' : '0.35';

    const color = hasValue && inTune ? '#22c55e' : '#e5e7eb';
    hub.setAttribute('fill', color);
    needleLine.setAttribute('stroke', '#e5e7eb');
  }

  update({ cents: 0, inTune: false, hasValue: false });

  return { update };
}
