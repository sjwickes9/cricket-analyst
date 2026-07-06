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
export const VIEWBOX_SIZE = 600;
export const CENTRE = VIEWBOX_SIZE / 2;
export const BOUNDARY_RADIUS = 270;

// Canonical angles for the side labels, before handedness mirroring.
// 90 and 270 put them either side of the pitch for a right handed
// batter, matching the same convention used for shot markers.
const OFF_SIDE_CANONICAL_ANGLE = 90;
const LEG_SIDE_CANONICAL_ANGLE = 270;

export function renderField(container) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`);
  svg.setAttribute('class', 'field-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Cricket field, tap to record where the ball went');

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
  fieldGroup.appendChild(boundary);

  const thirtyYard = document.createElementNS(SVG_NS, 'circle');
  thirtyYard.setAttribute('cx', CENTRE);
  thirtyYard.setAttribute('cy', CENTRE);
  thirtyYard.setAttribute('r', BOUNDARY_RADIUS * 0.55);
  thirtyYard.setAttribute('class', 'field-inner-circle');
  fieldGroup.appendChild(thirtyYard);

  const pitch = document.createElementNS(SVG_NS, 'rect');
  pitch.setAttribute('x', CENTRE - 14);
  pitch.setAttribute('y', CENTRE - 90);
  pitch.setAttribute('width', 28);
  pitch.setAttribute('height', 90);
  pitch.setAttribute('class', 'field-pitch');
  fieldGroup.appendChild(pitch);

  const crease = document.createElementNS(SVG_NS, 'circle');
  crease.setAttribute('cx', CENTRE);
  crease.setAttribute('cy', CENTRE);
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

  container.innerHTML = '';
  container.appendChild(svg);

  updateSideLabels(fieldGroup, labelsGroup, 'right');

  return { svg, shotsGroup, fieldGroup, labelsGroup };
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

  const offPoint = polarToPoint(offAngle, 92, CENTRE, CENTRE, BOUNDARY_RADIUS);
  const legPoint = polarToPoint(legAngle, 92, CENTRE, CENTRE, BOUNDARY_RADIUS);

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

    const raw = tapToPolar(svgPoint.x, svgPoint.y, CENTRE, CENTRE, BOUNDARY_RADIUS);
    const orientation = getOrientation(fieldGroup);
    // The field is visually rotated by `orientation` degrees, so a tap
    // at a given screen position corresponds to a canonical angle that
    // is offset back by the same amount.
    const angle = ((raw.angle - orientation) % 360 + 360) % 360;
    handler({ angle: Number(angle.toFixed(1)), distance: raw.distance });
  });
}
