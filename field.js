// field.js
// Draws the field and converts taps into angle/distance via utils.js.
// Knows nothing about scoring, storage or the wagon wheel; it only
// reports where a tap landed.

import { tapToPolar } from './utils.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const VIEWBOX_SIZE = 600;
export const CENTRE = VIEWBOX_SIZE / 2;
export const BOUNDARY_RADIUS = 270;

export function renderField(container) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`);
  svg.setAttribute('class', 'field-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Cricket field, tap to record where the ball went');

  const boundary = document.createElementNS(SVG_NS, 'circle');
  boundary.setAttribute('cx', CENTRE);
  boundary.setAttribute('cy', CENTRE);
  boundary.setAttribute('r', BOUNDARY_RADIUS);
  boundary.setAttribute('class', 'field-boundary');
  svg.appendChild(boundary);

  const thirtyYard = document.createElementNS(SVG_NS, 'circle');
  thirtyYard.setAttribute('cx', CENTRE);
  thirtyYard.setAttribute('cy', CENTRE);
  thirtyYard.setAttribute('r', BOUNDARY_RADIUS * 0.55);
  thirtyYard.setAttribute('class', 'field-inner-circle');
  svg.appendChild(thirtyYard);

  const pitch = document.createElementNS(SVG_NS, 'rect');
  pitch.setAttribute('x', CENTRE - 14);
  pitch.setAttribute('y', CENTRE - 90);
  pitch.setAttribute('width', 28);
  pitch.setAttribute('height', 90);
  pitch.setAttribute('class', 'field-pitch');
  svg.appendChild(pitch);

  const crease = document.createElementNS(SVG_NS, 'circle');
  crease.setAttribute('cx', CENTRE);
  crease.setAttribute('cy', CENTRE);
  crease.setAttribute('r', 6);
  crease.setAttribute('class', 'field-crease-marker');
  svg.appendChild(crease);

  // Group that shot markers get appended to, kept separate so the
  // wagon wheel module never has to touch the field's own elements.
  const shotsGroup = document.createElementNS(SVG_NS, 'g');
  shotsGroup.setAttribute('class', 'field-shots');
  svg.appendChild(shotsGroup);

  container.innerHTML = '';
  container.appendChild(svg);

  return { svg, shotsGroup };
}

export function onFieldTap(svg, handler) {
  svg.addEventListener('click', (event) => {
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const svgPoint = point.matrixTransform(svg.getScreenCTM().inverse());

    const { angle, distance } = tapToPolar(svgPoint.x, svgPoint.y, CENTRE, CENTRE, BOUNDARY_RADIUS);
    handler({ angle, distance });
  });
}
