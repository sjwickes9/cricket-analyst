// utils.js
// Small, dependency-free helpers used across modules.

export function generateId() {
  if (window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// The crease sits off-centre from the ground's true centre (see
// field.js), so "reaching the boundary" is not the same fixed distance
// in every direction: a shot straight down the ground has further to
// travel than one played behind the stumps. This returns the true
// distance from the crease to the boundary circle along a given angle,
// so 100% distance always means "reached the boundary", in every
// direction, not just some of them.
export function boundaryDistanceForAngle(angleDegrees, offsetFromCentre, boundaryRadius) {
  const theta = (angleDegrees * Math.PI) / 180;
  const d = offsetFromCentre;
  const r = boundaryRadius;
  return d * Math.cos(theta) + Math.sqrt(r * r - d * d * Math.sin(theta) * Math.sin(theta));
}

// Converts a tap point into the stored radial format: angle (0 to 360,
// 0 is straight back over the bowler's head, increasing clockwise) and
// distance (0 to 100, percent of the boundary in that direction). This
// is the only place tap coordinates are turned into cricket
// coordinates, so field.js stays a rendering module and this stays a
// pure conversion. offsetFromCentre is the crease's offset from the
// ground's true centre, 0 if the origin and centre coincide.
export function tapToPolar(tapX, tapY, originX, originY, boundaryRadius, offsetFromCentre = 0) {
  const dx = tapX - originX;
  const dy = tapY - originY;

  let angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
  if (angle < 0) angle += 360;

  const rawDistance = Math.sqrt(dx * dx + dy * dy);
  const maxDistance = boundaryDistanceForAngle(angle, offsetFromCentre, boundaryRadius);
  const distance = Math.min(100, (rawDistance / maxDistance) * 100);

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
// Must use the same offsetFromCentre as tapToPolar, or a shot recorded
// as "reached the boundary" would not render back at the boundary.
export function polarToPoint(angle, distance, originX, originY, boundaryRadius, offsetFromCentre = 0) {
  const maxDistance = boundaryDistanceForAngle(angle, offsetFromCentre, boundaryRadius);
  const radians = (angle * Math.PI) / 180;
  const r = (distance / 100) * maxDistance;
  const x = originX + r * Math.sin(radians);
  const y = originY - r * Math.cos(radians);
  return { x, y };
}
