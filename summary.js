// summary.js
// The end of innings summary: a batting list for the innings just
// completed, where tapping a batter shows their individual wagon wheel.
// This is the first statistics view in the app and reuses field.js and
// wagonwheel.js exactly as the live scoring screen does, just scoped to
// one batter's deliveries.

import { renderField, updateSideLabels } from './field.js';
import { renderWagonWheel } from './wagonwheel.js';
import { getPlayerById, getBowlerById } from './match.js';

function formatDismissal(stat, match) {
  if (!stat.out) return 'not out';

  const bowler = stat.dismissalBowlerId ? getBowlerById(match, stat.dismissalBowlerId) : null;
  const bowlerText = bowler ? ` b ${bowler.name}` : '';

  switch (stat.dismissalType) {
    case 'bowled':
      return `bowled${bowlerText}`;
    case 'caught':
      return `caught${bowlerText}`;
    case 'lbw':
      return `lbw${bowlerText}`;
    case 'stumped':
      return `stumped${bowlerText}`;
    case 'runout':
      return 'run out';
    case 'hitwicket':
      return 'hit wicket';
    default:
      return 'out';
  }
}

export function renderInningsSummary(container, match, innings, events, batterStats, { onStartNextInnings, onFinish }) {
  container.innerHTML = '';

  const totalRuns = batterStats.reduce((sum, s) => sum + s.runs, 0);
  const wickets = batterStats.filter((s) => s.out).length;

  const wrap = document.createElement('div');
  wrap.className = 'setup-screen';
  wrap.innerHTML = `
    <h1 class="setup-title">Innings complete</h1>
    <p class="setup-hint">${match.teamName}: ${totalRuns}-${wickets}</p>
    <div id="batting-list" class="batting-list"></div>
    <div id="batter-detail" class="batter-detail"></div>
    <button type="button" id="start-next-innings-button" class="setup-primary-button">Start next innings</button>
    <button type="button" id="finish-match-button" class="setup-secondary-button">Finish match here</button>
  `;
  container.appendChild(wrap);

  const list = wrap.querySelector('#batting-list');
  const detail = wrap.querySelector('#batter-detail');

  batterStats.forEach((stat) => {
    const player = getPlayerById(match, stat.playerId);
    if (!player) return;

    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'batting-row';
    row.innerHTML = `
      <span class="batting-row-name">${player.name}</span>
      <span class="batting-row-runs">${stat.runs} (${stat.ballsFaced})</span>
      <span class="batting-row-dismissal">${formatDismissal(stat, match)}</span>
    `;

    row.addEventListener('click', () => {
      detail.innerHTML = '';
      const heading = document.createElement('h2');
      heading.textContent = `${player.name}'s wagon wheel`;
      detail.appendChild(heading);

      const fieldContainer = document.createElement('div');
      fieldContainer.className = 'summary-field-container';
      detail.appendChild(fieldContainer);

      const { shotsGroup, fieldGroup, labelsGroup } = renderField(fieldContainer);
      const batterEvents = events.filter((e) => e.strikerBatterId === stat.playerId);
      renderWagonWheel(shotsGroup, match, batterEvents);
      updateSideLabels(fieldGroup, labelsGroup, player.handedness);
    });

    list.appendChild(row);
  });

  wrap.querySelector('#start-next-innings-button').addEventListener('click', onStartNextInnings);
  wrap.querySelector('#finish-match-button').addEventListener('click', onFinish);
}
