// utils.js
// Small, dependency-free helpers used across modules.

export function generateId() {
  if (window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Converts a tap point into the stored radial format: angle (0 to 360,
// 0 is straight back over the bowler's head, increasing clockwise) and
// distance (0 to 100, percent of boundary radius). This is the only
// place tap coordinates are turned into cricket coordinates, so field.js
// stays a rendering module and this stays a pure conversion.
export function tapToPolar(tapX, tapY, centreX, centreY, boundaryRadius) {
  const dx = tapX - centreX;
  const dy = tapY - centreY;

  let angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
  if (angle < 0) angle += 360;

  const rawDistance = Math.sqrt(dx * dx + dy * dy);
  const distance = Math.min(100, (rawDistance / boundaryRadius) * 100);

  return { angle: Number(angle.toFixed(1)), distance: Number(distance.toFixed(1)) };
}

// Stored angle is captured against a right-handed batter's view of the
// field. A left-handed batter's off side and leg side are mirrored, so
// rendering (never storage) flips the angle for display.
export function displayAngleForHandedness(angle, handedness) {
  if (handedness === 'left') {
    return (360 - angle) % 360;
  }
  return angle;
}

// Turns stored angle/distance back into SVG x,y for drawing a marker.
export function polarToPoint(angle, distance, centreX, centreY, boundaryRadius) {
  const radians = (angle * Math.PI) / 180;
  const r = (distance / 100) * boundaryRadius;
  const x = centreX + r * Math.sin(radians);
  const y = centreY - r * Math.cos(radians);
  return { x, y };
}
