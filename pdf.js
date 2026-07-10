// pdf.js
// Generates a match report PDF: a scorecard-style batting list plus a
// per-batter wagon wheel, drawn with jsPDF vector primitives rather
// than rasterising the on-screen SVG. Drawing directly keeps the wagon
// wheels crisp at any zoom and avoids pulling in html2canvas, which
// cannot reliably capture inline SVG anyway.
//
// jsPDF is loaded lazily from a CDN the first time a report is
// requested, so it never slows down live scoring. Requires a network
// connection at export time; that is acceptable since exporting a
// report is not a live-match action.

import { computeBatterStats, currentEvents } from './innings.js';
import { getPlayerById, getBowlerById } from './match.js';
import { boundaryDistanceForAngle } from './utils.js';

const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

let jsPdfPromise = null;
function loadJsPdf() {
  if (jsPdfPromise) return jsPdfPromise;
  jsPdfPromise = new Promise((resolve, reject) => {
    if (window.jspdf && window.jspdf.jsPDF) {
      resolve(window.jspdf.jsPDF);
      return;
    }
    const script = document.createElement('script');
    script.src = JSPDF_URL;
    script.onload = () => {
      if (window.jspdf && window.jspdf.jsPDF) resolve(window.jspdf.jsPDF);
      else reject(new Error('jsPDF failed to load'));
    };
    script.onerror = () => reject(new Error('Could not load the PDF library. A connection is needed the first time.'));
    document.head.appendChild(script);
  });
  return jsPdfPromise;
}

const RUN_RGB = {
  0: [150, 150, 150],
  1: [190, 150, 40],
  2: [190, 150, 40],
  3: [190, 150, 40],
  4: [70, 130, 190],
  6: [180, 70, 60],
};

function dismissalText(stat, match) {
  if (!stat.out) return 'not out';
  const bowler = stat.dismissalBowlerId ? getBowlerById(match, stat.dismissalBowlerId) : null;
  const b = bowler ? ` b ${bowler.name}` : '';
  switch (stat.dismissalType) {
    case 'bowled': return `bowled${b}`;
    case 'caught': return `caught${b}`;
    case 'lbw': return `lbw${b}`;
    case 'stumped': return `stumped${b}`;
    case 'runout': return 'run out';
    case 'hitwicket': return 'hit wicket';
    default: return 'out';
  }
}

// Draws one batter's wagon wheel into the PDF at (cx, cy) with the
// given radius, using the same off-centre-crease geometry as the app.
function drawWagonWheel(doc, batterEvents, cx, cy, radius) {
  const creaseOffsetRatio = 0.167; // 45 / 270, matches CREASE_OFFSET / BOUNDARY_RADIUS
  const creaseY = cy + radius * creaseOffsetRatio;

  doc.setDrawColor(120, 150, 120);
  doc.setFillColor(235, 240, 232);
  doc.circle(cx, cy, radius, 'FD');

  doc.setFillColor(90, 90, 90);
  doc.circle(cx, creaseY, 0.6, 'F');

  for (const event of currentEvents(batterEvents)) {
    if (event.extraType || event.wicket) continue;
    if (event.angle === 0 && event.distance === 0) continue;

    const maxDist = boundaryDistanceForAngle(event.angle, radius * creaseOffsetRatio, radius);
    const r = (event.distance / 100) * maxDist;
    const rad = (event.angle * Math.PI) / 180;
    const x = cx + r * Math.sin(rad);
    const y = creaseY - r * Math.cos(rad);

    const rgb = RUN_RGB[event.runs] || RUN_RGB[0];
    doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
    doc.setLineWidth(0.3);
    doc.line(cx, creaseY, x, y);
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.circle(x, y, event.runs >= 4 ? 1.1 : 0.9, 'F');
  }
}

export async function generateMatchReport(match, allInnings, allEvents) {
  const JsPDF = await loadJsPdf();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;

  allInnings
    .slice()
    .sort((a, b) => a.inningsNumber - b.inningsNumber)
    .forEach((innings, index) => {
      if (index > 0) doc.addPage();

      const events = allEvents.filter((e) => e.inningsNumber === innings.inningsNumber);
      const stats = computeBatterStats(innings, events);
      const totalRuns = stats.reduce((s, x) => s + x.runs, 0);
      const wickets = stats.filter((s) => s.out).length;

      let y = margin;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('HOWZT match report', margin, y);
      y += 8;

      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      const opp = match.opposition ? ` v ${match.opposition}` : '';
      doc.text(`${match.teamName}${opp}`, margin, y);
      y += 6;
      doc.setFontSize(11);
      doc.text(`Innings ${innings.inningsNumber}: ${totalRuns} for ${wickets}`, margin, y);
      y += 8;

      // Batting table header.
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Batter', margin, y);
      doc.text('How out', margin + 45, y);
      doc.text('R', pageWidth - margin - 20, y, { align: 'right' });
      doc.text('B', pageWidth - margin, y, { align: 'right' });
      y += 2;
      doc.setDrawColor(180, 180, 180);
      doc.line(margin, y, pageWidth - margin, y);
      y += 5;

      doc.setFont('helvetica', 'normal');
      stats.forEach((stat) => {
        const player = getPlayerById(match, stat.playerId);
        if (!player) return;
        doc.text(player.name, margin, y);
        doc.text(dismissalText(stat, match), margin + 45, y);
        doc.text(String(stat.runs), pageWidth - margin - 20, y, { align: 'right' });
        doc.text(String(stat.ballsFaced), pageWidth - margin, y, { align: 'right' });
        y += 6;
      });

      y += 4;

      // Per-batter wagon wheels, two across, only for batters who faced
      // at least one positioned delivery.
      const radius = 28;
      const colGap = (pageWidth - margin * 2) / 2;
      let col = 0;
      let rowY = y + radius;

      stats.forEach((stat) => {
        const player = getPlayerById(match, stat.playerId);
        if (!player) return;
        const batterEvents = events.filter((e) => e.strikerBatterId === stat.playerId);
        const hasShots = currentEvents(batterEvents).some(
          (e) => !e.extraType && !e.wicket && !(e.angle === 0 && e.distance === 0)
        );
        if (!hasShots) return;

        if (rowY + radius > doc.internal.pageSize.getHeight() - margin) {
          doc.addPage();
          rowY = margin + radius;
          col = 0;
        }

        const cx = margin + radius + col * colGap;
        drawWagonWheel(doc, batterEvents, cx, rowY, radius);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(`${player.name}  ${stat.runs} (${stat.ballsFaced})`, cx, rowY + radius + 5, { align: 'center' });

        col += 1;
        if (col === 2) {
          col = 0;
          rowY += radius * 2 + 14;
        }
      });
    });

  const safe = (s) => (s || 'team').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const date = (match.createdAt || new Date().toISOString()).slice(0, 10);
  doc.save(`howzt-report-${safe(match.teamName)}-${date}.pdf`);
}
