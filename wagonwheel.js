// wagonwheel.js
// Turns the current (non-superseded) events for a match into shot
// markers on the field. This is a view over the event log, never a
// separate source of truth, per the data model in the project brief.

import { CENTRE, BOUNDARY_RADIUS } from './field.js';
import { polarToPoint, displayAngleForHandedness } from './utils.js';
import { currentEvents } from './innings.js';
import { getPlayerById } from './match.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const RUN_COLOUR = {
  0: 'var(--run-dot)',
  1: 'var(--run-single)',
  2: 'var(--run-single)',
  3: 'var(--run-single)',
  4: 'var(--run-four)',
  6: 'var(--run-six)',
};

export function renderWagonWheel(shotsGroup, match, events) {
  shotsGroup.innerHTML = '';

  for (const event of currentEvents(events)) {
    if (event.extraType) continue;
    if (event.wicket) continue;

    const batter = getPlayerById(match, event.strikerBatterId);
    const handedness = batter ? batter.handedness : 'right';
    const displayAngle = displayAngleForHandedness(event.angle, handedness);
    const { x, y } = polarToPoint(displayAngle, event.distance, CENTRE, CENTRE, BOUNDARY_RADIUS);

    const marker = document.createElementNS(SVG_NS, 'circle');
    marker.setAttribute('cx', x);
    marker.setAttribute('cy', y);
    marker.setAttribute('r', event.runs >= 4 ? 8 : 6);
    marker.setAttribute('fill', RUN_COLOUR[event.runs] || 'var(--run-dot)');
    marker.setAttribute('class', 'shot-marker');
    shotsGroup.appendChild(marker);
  }
}
