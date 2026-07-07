// wagonwheel.js
// Turns the current (non-superseded) events for a match into shot
// markers on the field. This is a view over the event log, never a
// separate source of truth, per the data model in the project brief.
//
// Markers always render at the raw stored angle/distance, exactly
// where the scorer tapped: that is the ball's real physical position
// on the field and must never move, regardless of who is batting.
// Handedness only ever affects the off side / leg side text labels
// (see field.js), which tell the scorer which side is which for the
// batter on strike. Mirroring the marker as well would double up with
// the labels moving and land the dot under the wrong label.

import { CENTRE, CREASE_Y, BOUNDARY_RADIUS } from './field.js';
import { polarToPoint } from './utils.js';
import { currentEvents } from './innings.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const RUN_COLOUR = {
  0: 'var(--run-dot)',
  1: 'var(--run-single)',
  2: 'var(--run-single)',
  3: 'var(--run-single)',
  4: 'var(--run-four)',
  6: 'var(--run-six)',
};

export function renderWagonWheel(shotsGroup, events) {
  shotsGroup.innerHTML = '';

  for (const event of currentEvents(events)) {
    if (event.extraType) continue;
    if (event.wicket) continue;
    // angle 0 / distance 0 is the sentinel used for deliveries with no
    // real shot position (quick dot ball, extras, wickets), not a
    // genuine tap at the exact centre.
    if (event.angle === 0 && event.distance === 0) continue;

    const { x, y } = polarToPoint(event.angle, event.distance, CENTRE, CREASE_Y, BOUNDARY_RADIUS);

    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', CENTRE);
    line.setAttribute('y1', CREASE_Y);
    line.setAttribute('x2', x);
    line.setAttribute('y2', y);
    line.setAttribute('class', 'shot-line');
    line.setAttribute('stroke', RUN_COLOUR[event.runs] || 'var(--run-dot)');
    shotsGroup.appendChild(line);

    const marker = document.createElementNS(SVG_NS, 'circle');
    marker.setAttribute('cx', x);
    marker.setAttribute('cy', y);
    marker.setAttribute('r', event.runs >= 4 ? 8 : 6);
    marker.setAttribute('fill', RUN_COLOUR[event.runs] || 'var(--run-dot)');
    marker.setAttribute('class', 'shot-marker');
    shotsGroup.appendChild(marker);
  }
}
