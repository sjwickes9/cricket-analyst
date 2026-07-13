// field.js
// Draws the field and converts taps into angle/distance via utils.js.
// Knows nothing about scoring, storage or the wagon wheel; it only
// reports where a tap landed.
//
// Field orientation (rotating the view to match where the scorer is
// sitting) is a display-only transform applied to a single wrapping
// group, exactly like handedness is applied at render time elsewhere.
// The stored angle/distance on each event never changes; onFieldTap
// simply subtracts the current orientation before reporting a tap, so
// what gets stored is always relative to the canonical, unrotated field.

import { tapToPolar, polarToPoint, displayAngleForHandedness } from './utils.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
// The viewBox is larger than the field itself to leave a margin outside
// the boundary for the sector run labels. CENTRE and BOUNDARY_RADIUS
// are unchanged, so no stored coordinate or geometry is affected: only
// the drawable canvas around the field grew.
export const VIEWBOX_SIZE = 700;
export const CENTRE = VIEWBOX_SIZE / 2;
export const BOUNDARY_RADIUS = 270;

// The pitch is drawn symmetrically around the ground's true centre, as
// on a real ground, with the striker standing at one end of it rather
// than at the exact middle. CREASE_Y is that end: the origin every
// shot's angle and distance is actually measured from. The boundary
// and thirty yard circles are still drawn around CENTRE; only the
// pitch, the crease marker, and every polar conversion use CREASE_Y.
const PITCH_LENGTH = 90;
export const CREASE_Y = CENTRE + PITCH_LENGTH / 2;
export const CREASE_OFFSET = PITCH_LENGTH / 2;

// Canonical angles for the side labels, before handedness mirroring.
// 90 and 270 put them either side of the pitch for a right handed
// batter, matching the same convention used for shot markers.
const OFF_SIDE_CANONICAL_ANGLE = 90;
const LEG_SIDE_CANONICAL_ANGLE = 270;

let instanceCounter = 0;

export function renderField(container) {
  instanceCounter += 1;
  const gradientId = `turf-gradient-${instanceCounter}`;
  const stripeId = `turf-stripes-${instanceCounter}`;
  const clipId = `turf-clip-${instanceCounter}`;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`);
  svg.setAttribute('class', 'field-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Cricket field, tap to record where the ball went');

  // Mown stripes, as on a professional outfield: alternating light and
  // dark bands from the roller running up and down the ground. Drawn as
  // a pattern and clipped to the boundary, layered over the radial
  // gradient so the field still has depth rather than looking flat.
  const defs = document.createElementNS(SVG_NS, 'defs');
  defs.innerHTML = `
    <radialGradient id="${gradientId}" cx="50%" cy="42%" r="75%">
      <stop offset="0%" stop-color="var(--field-green-light)" />
      <stop offset="60%" stop-color="var(--field-green)" />
      <stop offset="100%" stop-color="var(--field-green-dark)" />
    </radialGradient>
    <pattern id="${stripeId}" width="44" height="10" patternUnits="userSpaceOnUse">
      <rect x="0" y="0" width="22" height="10" fill="#ffffff" opacity="0.05" />
      <rect x="22" y="0" width="22" height="10" fill="#000000" opacity="0.05" />
    </pattern>
    <clipPath id="${clipId}">
      <circle cx="${CENTRE}" cy="${CENTRE}" r="${BOUNDARY_RADIUS}" />
    </clipPath>
  `;
  svg.appendChild(defs);

  // Everything that represents the physical field (and the shots on
  // it) lives inside this rotatable group. Rotating it never touches
  // stored data, only how it is drawn.
  const fieldGroup = document.createElementNS(SVG_NS, 'g');
  fieldGroup.setAttribute('class', 'field-rotatable');
  fieldGroup.dataset.orientation = '0';
  svg.appendChild(fieldGroup);

  const boundary = document.createElementNS(SVG_NS, 'circle');
  boundary.setAttribute('cx', CENTRE);
  boundary.setAttribute('cy', CENTRE);
  boundary.setAttribute('r', BOUNDARY_RADIUS);
  boundary.setAttribute('class', 'field-boundary');
  boundary.setAttribute('fill', `url(#${gradientId})`);
  fieldGroup.appendChild(boundary);

  const stripes = document.createElementNS(SVG_NS, 'rect');
  stripes.setAttribute('x', CENTRE - BOUNDARY_RADIUS);
  stripes.setAttribute('y', CENTRE - BOUNDARY_RADIUS);
  stripes.setAttribute('width', BOUNDARY_RADIUS * 2);
  stripes.setAttribute('height', BOUNDARY_RADIUS * 2);
  stripes.setAttribute('fill', `url(#${stripeId})`);
  stripes.setAttribute('clip-path', `url(#${clipId})`);
  stripes.setAttribute('pointer-events', 'none');
  fieldGroup.appendChild(stripes);

  const rope = document.createElementNS(SVG_NS, 'circle');
  rope.setAttribute('cx', CENTRE);
  rope.setAttribute('cy', CENTRE);
  rope.setAttribute('r', BOUNDARY_RADIUS - 6);
  rope.setAttribute('class', 'field-boundary-rope');
  fieldGroup.appendChild(rope);

  const thirtyYard = document.createElementNS(SVG_NS, 'circle');
  thirtyYard.setAttribute('cx', CENTRE);
  thirtyYard.setAttribute('cy', CENTRE);
  thirtyYard.setAttribute('r', BOUNDARY_RADIUS * 0.55);
  thirtyYard.setAttribute('class', 'field-inner-circle');
  fieldGroup.appendChild(thirtyYard);

  const pitch = document.createElementNS(SVG_NS, 'rect');
  pitch.setAttribute('x', CENTRE - 14);
  pitch.setAttribute('y', CREASE_Y - PITCH_LENGTH);
  pitch.setAttribute('width', 28);
  pitch.setAttribute('height', PITCH_LENGTH);
  pitch.setAttribute('class', 'field-pitch');
  fieldGroup.appendChild(pitch);

  const crease = document.createElementNS(SVG_NS, 'circle');
  crease.setAttribute('cx', CENTRE);
  crease.setAttribute('cy', CREASE_Y);
  crease.setAttribute('r', 6);
  crease.setAttribute('class', 'field-crease-marker');
  fieldGroup.appendChild(crease);

  // Group that shot markers get appended to, kept separate so the
  // wagon wheel module never has to touch the field's own elements.
  // It lives inside fieldGroup so shots rotate along with the field.
  const shotsGroup = document.createElementNS(SVG_NS, 'g');
  shotsGroup.setAttribute('class', 'field-shots');
  fieldGroup.appendChild(shotsGroup);

  // Off side and leg side labels sit outside the rotatable group so
  // the text itself always stays upright and legible, even though
  // their position tracks both field orientation and handedness (see
  // updateSideLabels). This is the visible, at-a-glance confirmation
  // that mirroring is working correctly for the batter on strike.
  const labelsGroup = document.createElementNS(SVG_NS, 'g');
  labelsGroup.setAttribute('class', 'field-side-labels');
  svg.appendChild(labelsGroup);

  const offLabel = document.createElementNS(SVG_NS, 'text');
  offLabel.setAttribute('class', 'field-side-label');
  offLabel.setAttribute('text-anchor', 'middle');
  offLabel.textContent = 'OFF SIDE';
  labelsGroup.appendChild(offLabel);

  const legLabel = document.createElementNS(SVG_NS, 'text');
  legLabel.setAttribute('class', 'field-side-label');
  legLabel.setAttribute('text-anchor', 'middle');
  legLabel.textContent = 'LEG SIDE';
  labelsGroup.appendChild(legLabel);

  // Sector run labels sit outside the boundary, in their own group and
  // outside the rotatable group for the same reason as the side labels:
  // they must stay upright and readable. Populated only by the summary
  // view (see renderSectorLabels); empty during live scoring.
  const sectorGroup = document.createElementNS(SVG_NS, 'g');
  sectorGroup.setAttribute('class', 'field-sector-labels');
  svg.appendChild(sectorGroup);

  const existingSvg = container.querySelector('svg');
  if (existingSvg) existingSvg.remove();
  container.appendChild(svg);

  // The field must always be square, but relying on CSS alone
  // (height: auto, aspect-ratio) to size an SVG that only carries a
  // viewBox has proven unreliable once nested inside the summary
  // screen's layout. Measuring the container directly and setting an
  // explicit inline pixel size removes that ambiguity entirely: inline
  // style always wins over any stylesheet rule, so this is the actual
  // rendered size regardless of what the CSS says.
  const measuredWidth = container.clientWidth || VIEWBOX_SIZE;
  const measuredHeight = container.clientHeight || measuredWidth;
  const size = Math.min(measuredWidth, measuredHeight);
  svg.style.width = `${size}px`;
  svg.style.height = `${size}px`;

  updateSideLabels(fieldGroup, labelsGroup, 'right');

  return { svg, shotsGroup, fieldGroup, labelsGroup, sectorGroup };
}

// Draws the eight sector run totals just outside the boundary, each at
// the mid-angle of its sector. Like the side labels, these are
// positioned in display space (mirrored for handedness, offset by the
// field's rotation) but the text itself is never rotated, so it stays
// upright however the field is turned. Sectors with no runs are drawn
// faded rather than omitted, so the eight-sector shape stays legible
// and an empty sector is itself informative to a coach.
export function renderSectorLabels(fieldGroup, sectorGroup, sectorData, handedness) {
  sectorGroup.innerHTML = '';
  if (!sectorData) return;

  const orientation = getOrientation(fieldGroup);
  const labelRadius = BOUNDARY_RADIUS + 32;

  sectorData.sectors.forEach((sector) => {
    const midAngle = (sector.from + sector.to) / 2;
    // Shot markers render at raw physical angles (they show where the
    // ball actually went), while sector totals are computed in
    // handedness-corrected space (so a left hander's leg side runs are
    // counted as leg side). For a left hander the label must therefore
    // be mirrored back to the physical angle, or it would sit over the
    // opposite side's shots.
    const physicalAngle = handedness === 'left' ? (360 - midAngle) % 360 : midAngle;
    const screenAngle = (physicalAngle + orientation) % 360;
    const rad = (screenAngle * Math.PI) / 180;

    const x = CENTRE + labelRadius * Math.sin(rad);
    const y = CREASE_Y - labelRadius * Math.cos(rad);

    const runsText = document.createElementNS(SVG_NS, 'text');
    runsText.setAttribute('x', x);
    runsText.setAttribute('y', y);
    runsText.setAttribute('text-anchor', 'middle');
    runsText.setAttribute('class', sector.runs > 0 ? 'sector-runs' : 'sector-runs sector-runs--empty');
    runsText.textContent = String(sector.runs);
    sectorGroup.appendChild(runsText);

    const pctText = document.createElementNS(SVG_NS, 'text');
    pctText.setAttribute('x', x);
    pctText.setAttribute('y', y + 12);
    pctText.setAttribute('text-anchor', 'middle');
    pctText.setAttribute('class', sector.runs > 0 ? 'sector-pct' : 'sector-pct sector-pct--empty');
    pctText.textContent = `${sector.percentage}%`;
    sectorGroup.appendChild(pctText);
  });
}

// Faint radial lines marking the eight sector divisions, drawn inside
// the field so the reader can see which shots belong to which total.
export function renderSectorDividers(fieldGroup, show) {
  const existing = fieldGroup.querySelector('.field-sector-dividers');
  if (existing) existing.remove();
  if (!show) return;

  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('class', 'field-sector-dividers');
  group.setAttribute('pointer-events', 'none');

  for (let angle = 0; angle < 360; angle += 45) {
    const rad = (angle * Math.PI) / 180;
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', CENTRE);
    line.setAttribute('y1', CREASE_Y);
    line.setAttribute('x2', CENTRE + BOUNDARY_RADIUS * 1.02 * Math.sin(rad));
    line.setAttribute('y2', CREASE_Y - BOUNDARY_RADIUS * 1.02 * Math.cos(rad));
    line.setAttribute('class', 'field-sector-divider');
    group.appendChild(line);
  }

  fieldGroup.appendChild(group);
}

// Positions the off/leg side labels using the same handedness mirror
// applied to shot markers, plus the field's current orientation, so
// the labels always match what the scorer sees, whichever way the
// field is currently rotated. The text elements themselves are never
// rotated, so they stay upright and readable.
export function updateSideLabels(fieldGroup, labelsGroup, handedness) {
  const orientation = getOrientation(fieldGroup);
  const [offLabel, legLabel] = labelsGroup.children;

  const offAngle = (displayAngleForHandedness(OFF_SIDE_CANONICAL_ANGLE, handedness) + orientation) % 360;
  const legAngle = (displayAngleForHandedness(LEG_SIDE_CANONICAL_ANGLE, handedness) + orientation) % 360;

  const offPoint = polarToPoint(offAngle, 92, CENTRE, CREASE_Y, BOUNDARY_RADIUS, CREASE_OFFSET);
  const legPoint = polarToPoint(legAngle, 92, CENTRE, CREASE_Y, BOUNDARY_RADIUS, CREASE_OFFSET);

  offLabel.setAttribute('x', offPoint.x);
  offLabel.setAttribute('y', offPoint.y);
  legLabel.setAttribute('x', legPoint.x);
  legLabel.setAttribute('y', legPoint.y);
}

export function getOrientation(fieldGroup) {
  return Number(fieldGroup.dataset.orientation) || 0;
}

export function setOrientation(fieldGroup, degrees) {
  const normalised = ((degrees % 360) + 360) % 360;
  fieldGroup.dataset.orientation = String(normalised);
  fieldGroup.setAttribute('transform', `rotate(${normalised} ${CENTRE} ${CENTRE})`);
  return normalised;
}

export function onFieldTap(svg, fieldGroup, handler) {
  svg.addEventListener('click', (event) => {
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const svgPoint = point.matrixTransform(svg.getScreenCTM().inverse());

    const raw = tapToPolar(svgPoint.x, svgPoint.y, CENTRE, CREASE_Y, BOUNDARY_RADIUS, CREASE_OFFSET);
    const orientation = getOrientation(fieldGroup);
    // The field is visually rotated by `orientation` degrees, so a tap
    // at a given screen position corresponds to a canonical angle that
    // is offset back by the same amount.
    const angle = ((raw.angle - orientation) % 360 + 360) % 360;
    handler({ angle: Number(angle.toFixed(1)), distance: raw.distance });
  });
}
