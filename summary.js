// summary.js
// The end of innings summary, laid out like a real cricket scorecard:
// each batter's name and dismissal on one line with aligned runs and
// balls columns, then extras and the innings total below. Tapping a
// batter shows their wagon wheel.
//
// Per-batter export uses a deliberate two-step mode rather than showing
// checkboxes all the time: the scorecard stays clean until the scorer
// presses "Export selected batters", which reveals the tick boxes and
// turns the button into "Export now", with a Cancel to back out.

import { renderField, updateSideLabels } from './field.js';
import { renderWagonWheel } from './wagonwheel.js';
import { getPlayerById, getBowlerById } from './match.js';
import { computeInningsTotals } from './innings.js';

export function formatDismissal(stat, match) {
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

export function renderInningsSummary(container, match, innings, events, batterStats, callbacks) {
  const { onStartNextInnings, onFinish, onExportJson, onExportSelected, onExportReport } = callbacks;
  container.innerHTML = '';

  const totals = computeInningsTotals(innings, events);
  const selected = new Set();
  let selectMode = false;

  const wrap = document.createElement('div');
  wrap.className = 'setup-screen';
  wrap.innerHTML = `
    <h1 class="setup-title">${match.teamName}</h1>
    <p class="setup-hint">Innings ${innings.inningsNumber}${match.opposition ? ` v ${match.opposition}` : ''}. Tap a name for the wagon wheel.</p>

    <div class="scorecard" id="scorecard">
      <div class="scorecard-head">
        <span class="sc-col-select"></span>
        <span class="sc-col-batter">Batter</span>
        <span class="sc-col-runs">R</span>
        <span class="sc-col-balls">B</span>
        <span class="sc-col-sr">SR</span>
      </div>
      <div id="scorecard-rows"></div>
      <div class="scorecard-extras">
        <span class="sc-col-select"></span>
        <span class="sc-col-batter">Extras</span>
        <span class="sc-extras-detail">(b ${totals.extras.bye}, lb ${totals.extras.legbye}, w ${totals.extras.wide}, nb ${totals.extras.noball})</span>
        <span class="sc-col-runs">${totals.extrasTotal}</span>
      </div>
      <div class="scorecard-total">
        <span class="sc-col-select"></span>
        <span class="sc-col-batter">Total</span>
        <span class="sc-total-detail">${totals.overs} overs</span>
        <span class="sc-col-runs">${totals.total}-${totals.wickets}</span>
      </div>
    </div>

    <div id="batter-detail" class="batter-detail"></div>

    <div class="summary-select-row">
      <button type="button" id="export-selected-button" class="setup-secondary-button">Export selected batters (PDF)</button>
      <button type="button" id="cancel-select-button" class="setup-secondary-button" style="display:none;">Cancel</button>
    </div>
    <div class="summary-export-row">
      <button type="button" id="export-report-button" class="setup-secondary-button">Full match report (PDF)</button>
      <button type="button" id="export-json-button" class="setup-secondary-button">Back up match (file)</button>
    </div>
    <button type="button" id="start-next-innings-button" class="setup-primary-button">Start next innings</button>
    <button type="button" id="finish-match-button" class="setup-secondary-button">Finish match here</button>
  `;
  container.appendChild(wrap);

  const scorecard = wrap.querySelector('#scorecard');
  const rowsContainer = wrap.querySelector('#scorecard-rows');
  const detail = wrap.querySelector('#batter-detail');
  const exportButton = wrap.querySelector('#export-selected-button');
  const cancelButton = wrap.querySelector('#cancel-select-button');

  function enterSelectMode() {
    selectMode = true;
    scorecard.classList.add('scorecard--selecting');
    cancelButton.style.display = '';
    updateExportButton();
  }

  function exitSelectMode() {
    selectMode = false;
    selected.clear();
    scorecard.classList.remove('scorecard--selecting');
    scorecard.querySelectorAll('.sc-select--on').forEach((b) => b.classList.remove('sc-select--on'));
    cancelButton.style.display = 'none';
    exportButton.disabled = false;
    exportButton.textContent = 'Export selected batters (PDF)';
  }

  function updateExportButton() {
    if (!selectMode) return;
    exportButton.disabled = selected.size === 0;
    exportButton.textContent = selected.size
      ? `Export now (${selected.size})`
      : 'Export now';
  }

  batterStats.forEach((stat) => {
    const player = getPlayerById(match, stat.playerId);
    if (!player) return;

    const row = document.createElement('div');
    row.className = 'scorecard-row';
    row.innerHTML = `
      <button type="button" class="sc-select" aria-label="Select ${player.name} for export">
        <span class="sc-tick"></span>
      </button>
      <button type="button" class="sc-batter-info">
        <span class="sc-batter-name">${player.name}</span>
        <span class="sc-batter-dismissal">${formatDismissal(stat, match)}</span>
      </button>
      <span class="sc-col-runs">${stat.runs}</span>
      <span class="sc-col-balls">${stat.ballsFaced}</span>
      <span class="sc-col-sr">${stat.ballsFaced ? ((stat.runs / stat.ballsFaced) * 100).toFixed(0) : '-'}</span>
    `;

    const selectButton = row.querySelector('.sc-select');
    selectButton.addEventListener('click', () => {
      if (!selectMode) return;
      if (selected.has(stat.playerId)) {
        selected.delete(stat.playerId);
        selectButton.classList.remove('sc-select--on');
      } else {
        selected.add(stat.playerId);
        selectButton.classList.add('sc-select--on');
      }
      updateExportButton();
    });

    row.querySelector('.sc-batter-info').addEventListener('click', () => {
      detail.innerHTML = '';
      const heading = document.createElement('h2');
      heading.textContent = `${player.name}'s wagon wheel`;
      detail.appendChild(heading);

      const fieldContainer = document.createElement('div');
      fieldContainer.className = 'summary-field-container';
      detail.appendChild(fieldContainer);

      const { shotsGroup, fieldGroup, labelsGroup } = renderField(fieldContainer);
      const batterEvents = events.filter((e) => e.strikerBatterId === stat.playerId);
      renderWagonWheel(shotsGroup, batterEvents, { showLines: true });
      updateSideLabels(fieldGroup, labelsGroup, player.handedness);
    });

    rowsContainer.appendChild(row);
  });

  // First press reveals the tick boxes; second press (once at least one
  // batter is ticked) runs the export and leaves select mode.
  exportButton.addEventListener('click', async () => {
    if (!selectMode) {
      enterSelectMode();
      return;
    }
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    exitSelectMode();
    await onExportSelected(ids);
  });

  cancelButton.addEventListener('click', exitSelectMode);
  wrap.querySelector('#export-report-button').addEventListener('click', onExportReport);
  wrap.querySelector('#export-json-button').addEventListener('click', onExportJson);
  wrap.querySelector('#start-next-innings-button').addEventListener('click', onStartNextInnings);
  wrap.querySelector('#finish-match-button').addEventListener('click', onFinish);
}
