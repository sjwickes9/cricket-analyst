// pdf.js
// Two PDF exports, both drawn with jsPDF vector primitives rather than
// rasterising the on-screen SVG (keeps wagon wheels crisp and avoids
// pulling in html2canvas, which cannot reliably capture inline SVG):
//
//   generateMatchReport   - the whole match: a proper cricket scorecard
//                           per innings (batters, extras, total) plus a
//                           grid of per-batter wagon wheels.
//   generateBatterReport  - one full analysis page per selected batter:
//                           their figures, scoring breakdown, strike
//                           rate and a large wagon wheel.
//
// jsPDF is loaded lazily from a CDN the first time a report is
// requested, so it never slows down live scoring.

import { computeBatterStats, computeInningsTotals, currentEvents, strikeRate } from './innings.js';
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

const CREASE_OFFSET_RATIO = 0.167; // 45 / 270, matches CREASE_OFFSET / BOUNDARY_RADIUS

// Draws one batter's wagon wheel into the PDF at (cx, cy) with the
// given radius, using the same off-centre-crease geometry as the app.
function drawWagonWheel(doc, batterEvents, cx, cy, radius) {
  const creaseY = cy + radius * CREASE_OFFSET_RATIO;

  doc.setDrawColor(120, 150, 120);
  doc.setFillColor(235, 240, 232);
  doc.circle(cx, cy, radius, 'FD');

  doc.setFillColor(90, 90, 90);
  doc.circle(cx, creaseY, 0.6, 'F');

  for (const event of currentEvents(batterEvents)) {
    if (event.extraType || event.wicket) continue;
    if (event.angle === 0 && event.distance === 0) continue;

    const maxDist = boundaryDistanceForAngle(event.angle, radius * CREASE_OFFSET_RATIO, radius);
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

function safeName(s) {
  return (s || 'team').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
}

// Draws a full scorecard for one innings starting at y, returns the y
// position after it.
function drawScorecard(doc, match, innings, events, margin, startY, pageWidth) {
  const stats = computeBatterStats(innings, events);
  const totals = computeInningsTotals(innings, events);

  let y = startY;
  const runsX = pageWidth - margin - 26;
  const ballsX = pageWidth - margin - 12;
  const srX = pageWidth - margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Batter', margin, y);
  doc.text('R', runsX, y, { align: 'right' });
  doc.text('B', ballsX, y, { align: 'right' });
  doc.text('SR', srX, y, { align: 'right' });
  y += 2;
  doc.setDrawColor(180, 180, 180);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  doc.setFontSize(10);
  stats.forEach((stat) => {
    const player = getPlayerById(match, stat.playerId);
    if (!player) return;
    doc.setFont('helvetica', 'bold');
    doc.text(player.name, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(110, 110, 110);
    doc.text(dismissalText(stat, match), margin + 2, y + 4);
    doc.setTextColor(0, 0, 0);
    doc.text(String(stat.runs), runsX, y, { align: 'right' });
    doc.text(String(stat.ballsFaced), ballsX, y, { align: 'right' });
    doc.text(stat.ballsFaced ? strikeRate(stat.runs, stat.ballsFaced) : '-', srX, y, { align: 'right' });
    y += 9;
  });

  doc.setDrawColor(180, 180, 180);
  doc.line(margin, y - 2, pageWidth - margin, y - 2);

  doc.setFont('helvetica', 'normal');
  doc.text('Extras', margin, y + 3);
  doc.setTextColor(110, 110, 110);
  doc.setFontSize(9);
  doc.text(`(b ${totals.extras.bye}, lb ${totals.extras.legbye}, w ${totals.extras.wide}, nb ${totals.extras.noball})`, margin + 16, y + 3);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.text(String(totals.extrasTotal), runsX, y + 3, { align: 'right' });
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Total', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text(`${totals.overs} overs`, margin + 16, y);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`${totals.total}-${totals.wickets}`, runsX, y, { align: 'right' });
  y += 8;

  return y;
}

export async function generateMatchReport(match, allInnings, allEvents) {
  const JsPDF = await loadJsPdf();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;

  allInnings
    .slice()
    .sort((a, b) => a.inningsNumber - b.inningsNumber)
    .forEach((innings, index) => {
      if (index > 0) doc.addPage();

      const events = allEvents.filter((e) => e.inningsNumber === innings.inningsNumber);

      let y = margin;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('HOWZT match report', margin, y);
      y += 8;

      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      const opp = match.opposition ? ` v ${match.opposition}` : '';
      doc.text(`${match.teamName}${opp}  -  Innings ${innings.inningsNumber}`, margin, y);
      y += 8;

      y = drawScorecard(doc, match, innings, events, margin, y, pageWidth);
      y += 6;

      const stats = computeBatterStats(innings, events);
      const radius = 26;
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

        if (rowY + radius > pageHeight - margin) {
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

  const date = (match.createdAt || new Date().toISOString()).slice(0, 10);
  doc.save(`howzt-report-${safeName(match.teamName)}-${date}.pdf`);
}

// One full-page analysis per selected batter: figures, scoring
// breakdown, strike rate and a large wagon wheel.
export async function generateBatterReport(match, innings, events, playerIds) {
  const JsPDF = await loadJsPdf();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;

  const allStats = computeBatterStats(innings, events);
  const wanted = playerIds
    .map((id) => allStats.find((s) => s.playerId === id))
    .filter(Boolean);

  wanted.forEach((stat, index) => {
    if (index > 0) doc.addPage();
    const player = getPlayerById(match, stat.playerId);

    let y = margin;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('HOWZT batter analysis', margin, y);
    y += 9;

    doc.setFontSize(15);
    doc.text(player ? player.name : 'Batter', margin, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const opp = match.opposition ? ` v ${match.opposition}` : '';
    doc.text(`${match.teamName}${opp}  -  Innings ${innings.inningsNumber}`, margin, y);
    y += 5;
    doc.setTextColor(110, 110, 110);
    doc.text(dismissalText(stat, match), margin, y);
    doc.setTextColor(0, 0, 0);
    y += 10;

    // Headline figures.
    const sr = strikeRate(stat.runs, stat.ballsFaced);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(`${stat.runs} runs off ${stat.ballsFaced} balls`, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(`Strike rate ${sr}`, margin, y + 6);
    y += 14;

    // Scoring breakdown table.
    const b = stat.breakdown;
    const cells = [
      ['Dots', b[0]],
      ['1s', b[1]],
      ['2s', b[2]],
      ['3s', b[3]],
      ['4s', b[4]],
      ['6s', b[6]],
    ];
    const cellW = (pageWidth - margin * 2) / cells.length;
    doc.setDrawColor(200, 200, 200);
    cells.forEach((cell, i) => {
      const x = margin + i * cellW;
      doc.rect(x, y, cellW, 16);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(110, 110, 110);
      doc.text(cell[0], x + cellW / 2, y + 5, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(String(cell[1]), x + cellW / 2, y + 12, { align: 'center' });
    });
    y += 24;

    // Large wagon wheel.
    const batterEvents = events.filter((e) => e.strikerBatterId === stat.playerId);
    const radius = 55;
    const cx = pageWidth / 2;
    const cy = y + radius;
    drawWagonWheel(doc, batterEvents, cx, cy, radius);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(110, 110, 110);
    doc.text('Wagon wheel: lines show each scoring stroke from the crease', cx, cy + radius + 6, { align: 'center' });
    doc.setTextColor(0, 0, 0);
  });

  const date = (match.createdAt || new Date().toISOString()).slice(0, 10);
  doc.save(`howzt-batters-${safeName(match.teamName)}-${date}.pdf`);
}
