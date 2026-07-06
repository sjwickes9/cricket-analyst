// app.js
// Bootstraps the app: shows the setup wizard for a new match or next
// innings, then the live scoring screen. Holds the current match and
// innings in memory but always re-derives live state from storage.

import { renderField, onFieldTap, getOrientation, setOrientation, updateSideLabels } from './field.js';
import { renderWagonWheel } from './wagonwheel.js';
import { openBottomSheet, openExtraSheet, openWicketSheet, openConfirmSheet, openAddPersonSheet, openRotateSheet, openBowlerSheet, showToast, maybeShowWalkthrough } from './ui.js';
import { getEventsForMatch } from './storage.js';
import { computeLiveState, computeBatterStats } from './innings.js';
import {
  getActiveMatchId,
  getMatch,
  getActiveInnings,
  getPlayerById,
  getBowlerById,
  setInningsStatus,
  setCurrentBowler,
  addPlayerMidMatch,
  addBowlerMidMatch,
  appendToBattingOrder,
  clearActiveMatchId,
} from './match.js';
import { renderNewMatchSetup, renderNextInningsSetup, renderNextInningsChoice, renderOtherTeamRosterSetup } from './setup.js';
import { renderInningsSummary } from './summary.js';
import { recordShot, recordWicket, undoLastEvent, editEvent, getLastEvent } from './scoring.js';

const RUN_OPTIONS = [0, 1, 2, 3, 4, 6];

let match = null;
let innings = null;
let shotsGroup = null;
let fieldGroup = null;
let labelsGroup = null;

async function currentInningsEvents() {
  const allEvents = await getEventsForMatch(match.id);
  return allEvents.filter((e) => e.inningsNumber === innings.inningsNumber);
}

async function refresh() {
  const events = await currentInningsEvents();
  renderWagonWheel(shotsGroup, events);

  const state = computeLiveState(innings, events);
  updateStatusBar(state);

  if (state.allOut && innings.status === 'in-progress') {
    innings = await setInningsStatus(innings, 'all-out');
    showToast('All out');
    showInningsSummary();
  }
}

function updateStatusBar(state) {
  const striker = getPlayerById(match, state.strikerId);
  const nonStriker = getPlayerById(match, state.nonStrikerId);
  const bowler = getBowlerById(match, innings.currentBowlerId);

  document.getElementById('live-score').textContent = `${state.totalRuns}-${state.wicketsDown}`;
  document.getElementById('over-ball').textContent = `Over ${state.over}.${state.ball}`;
  document.getElementById('striker-name').textContent = `${striker ? striker.name : '?'} *`;
  document.getElementById('non-striker-name').textContent = nonStriker ? nonStriker.name : '?';
  document.getElementById('bowler-name').textContent = bowler ? bowler.name : 'Unknown';

  if (fieldGroup && labelsGroup) {
    updateSideLabels(fieldGroup, labelsGroup, striker ? striker.handedness : 'right');
  }
}

// A ball that goes straight through to the keeper untouched has no
// real shot position, so this skips the tap-and-select flow entirely.
// angle 0 / distance 0 is the same "no real position" sentinel already
// used for extras and wickets.
async function handleDotBall() {
  await recordShot({ matchId: match.id, innings, angle: 0, distance: 0, runs: 0 });
  await refresh();
  showToast('Dot ball recorded');
}

function handleFieldTap({ angle, distance }) {
  openBottomSheet({
    title: 'Runs scored',
    runOptions: RUN_OPTIONS,
    onSelect: async (runs) => {
      await recordShot({ matchId: match.id, innings, angle, distance, runs });
      await refresh();
      showToast(`${runs} run${runs === 1 ? '' : 's'} recorded`);
    },
  });
}

async function handleUndo() {
  const removed = await undoLastEvent(match.id, innings.inningsNumber);
  if (!removed) {
    showToast('Nothing to undo');
    return;
  }
  await refresh();
  showToast('Last ball undone');
}

async function handleEditLast() {
  const last = await getLastEvent(match.id, innings.inningsNumber);
  if (!last) {
    showToast('No ball to edit yet');
    return;
  }
  if (last.wicket || last.extraType) {
    showToast('Wickets and extras cannot be edited yet, undo instead');
    return;
  }

  openBottomSheet({
    title: 'Edit last ball',
    runOptions: RUN_OPTIONS,
    onSelect: async (runs) => {
      await editEvent(last, { runs });
      await refresh();
      showToast('Last ball updated');
    },
  });
}

async function handleExtra() {
  openExtraSheet({
    onComplete: async ({ extraType, extraRuns, runs }) => {
      await recordShot({ matchId: match.id, innings, angle: 0, distance: 0, runs, extraType, extraRuns });
      await refresh();
      showToast('Extra recorded');
    },
  });
}

async function handleWicket() {
  const events = await currentInningsEvents();
  const state = computeLiveState(innings, events);
  const striker = getPlayerById(match, state.strikerId);
  const nonStriker = getPlayerById(match, state.nonStrikerId);

  const remainingIds = innings.battingOrder.filter((id) => !state.battersAppeared.has(id));
  // Suggest the next player in the order first, but list the rest too.
  // If nobody remains, this is the innings-ending wicket, and the sheet
  // is shown without an incoming batter to pick.
  const orderedIds = state.nextBatterId
    ? [state.nextBatterId, ...remainingIds.filter((id) => id !== state.nextBatterId)]
    : remainingIds;
  const remainingBatters = orderedIds.map((id) => getPlayerById(match, id));

  openWicketSheet({
    striker,
    nonStriker,
    remainingBatters,
    onComplete: async ({ dismissalType, dismissedBatterId, incomingBatterId }) => {
      await recordWicket({
        matchId: match.id,
        innings,
        angle: 0,
        distance: 0,
        dismissalType,
        dismissedBatterId,
        incomingBatterId,
      });
      await refresh();
      showToast('Wicket recorded');
    },
  });
}

function handleDeclare() {
  openConfirmSheet({
    title: 'Declare innings',
    message: 'This ends the current innings. You can set up the next innings straight after.',
    confirmLabel: 'Declare',
    onConfirm: async () => {
      innings = await setInningsStatus(innings, 'declared');
      showToast('Innings declared');
      showInningsSummary();
    },
  });
}

function handleBowler() {
  openBowlerSheet({
    bowlers: match.bowlers,
    onSelectExisting: async (bowlerId) => {
      const bowler = bowlerId ? match.bowlers.find((b) => b.id === bowlerId) : null;
      innings = await setCurrentBowler(innings, bowlerId);
      await refresh();
      showToast(bowler ? `${bowler.name} is now bowling` : 'Bowler set to unknown');
    },
    onAddNew: async (name) => {
      const { match: updatedMatch, bowler } = await addBowlerMidMatch(match, { name });
      match = updatedMatch;
      innings = await setCurrentBowler(innings, bowler.id);
      await refresh();
      showToast(`${bowler.name} added and is now bowling`);
    },
  });
}
function handleAddBatter() {
  openAddPersonSheet({
    title: 'Add batter',
    showHandedness: true,
    onComplete: async ({ name, handedness }) => {
      const { match: updatedMatch, player } = await addPlayerMidMatch(match, { name, handedness });
      match = updatedMatch;
      innings = await appendToBattingOrder(innings, player.id);
      await refresh();
      showToast(`${name} added to the batting order`);
    },
  });
}

function orientationStorageKey() {
  return `cricket-analyst-orientation-${match.id}`;
}

function handleRotate() {
  const startingAngle = getOrientation(fieldGroup);
  openRotateSheet({
    currentAngle: startingAngle,
    onChange: (angle) => {
      setOrientation(fieldGroup, angle);
      refresh();
    },
    onClose: () => {
      localStorage.setItem(orientationStorageKey(), String(getOrientation(fieldGroup)));
    },
  });
}

function showScoringScreen() {
  document.getElementById('setup-container').style.display = 'none';
  const screen = document.getElementById('scoring-screen');
  screen.style.display = 'flex';

  const fieldContainer = document.getElementById('field-container');
  const { svg, shotsGroup: group, fieldGroup: fg, labelsGroup: lg } = renderField(fieldContainer);
  shotsGroup = group;
  fieldGroup = fg;
  labelsGroup = lg;

  const savedOrientation = Number(localStorage.getItem(orientationStorageKey())) || 0;
  setOrientation(fieldGroup, savedOrientation);

  onFieldTap(svg, fieldGroup, handleFieldTap);

  refresh();
}

async function showInningsSummary() {
  const screen = document.getElementById('scoring-screen');
  screen.style.display = 'none';
  const setupContainer = document.getElementById('setup-container');
  setupContainer.style.display = 'block';

  const events = await currentInningsEvents();
  const batterStats = computeBatterStats(innings, events);

  renderInningsSummary(setupContainer, match, innings, events, batterStats, {
    onStartNextInnings: () => startNextInningsFlow(),
    onFinish: () => showMatchFinished(),
  });
}

function showMatchFinished() {
  const setupContainer = document.getElementById('setup-container');
  setupContainer.innerHTML = `
    <div class="setup-screen">
      <h1 class="setup-title">Match finished</h1>
      <p class="setup-hint">Thanks for scoring. Nothing more is recorded for this match on this device.</p>
      <button type="button" id="new-match-button" class="setup-primary-button">Start a new match</button>
    </div>
  `;
  clearActiveMatchId();
  setupContainer.querySelector('#new-match-button').addEventListener('click', () => {
    match = null;
    innings = null;
    renderNewMatchSetup(setupContainer, (newMatch, newInnings) => {
      match = newMatch;
      innings = newInnings;
      showScoringScreen();
      maybeShowWalkthrough();
    });
  });
}

function startNextInningsFlow() {
  const screen = document.getElementById('scoring-screen');
  screen.style.display = 'none';
  const setupContainer = document.getElementById('setup-container');
  setupContainer.style.display = 'block';

  const onInningsReady = (updatedMatch, newInnings) => {
    match = updatedMatch;
    innings = newInnings;
    showScoringScreen();
  };

  renderNextInningsChoice(setupContainer, match, {
    onSameTeam: () => renderNextInningsSetup(setupContainer, match, onInningsReady),
    onOtherTeam: () => renderOtherTeamRosterSetup(setupContainer, match, onInningsReady),
  });
}

async function init() {
  const setupContainer = document.getElementById('setup-container');

  document.getElementById('undo-button').addEventListener('click', handleUndo);
  document.getElementById('edit-button').addEventListener('click', handleEditLast);
  document.getElementById('dot-ball-button').addEventListener('click', handleDotBall);
  document.getElementById('wicket-button').addEventListener('click', handleWicket);
  document.getElementById('extra-button').addEventListener('click', handleExtra);
  document.getElementById('declare-button').addEventListener('click', handleDeclare);
  document.getElementById('change-bowler-button').addEventListener('click', handleBowler);
  document.getElementById('add-batter-button').addEventListener('click', handleAddBatter);
  document.getElementById('rotate-button').addEventListener('click', handleRotate);

  const activeMatchId = getActiveMatchId();
  if (activeMatchId) {
    const existingMatch = await getMatch(activeMatchId);
    if (existingMatch) {
      const existingInnings = await getActiveInnings(activeMatchId);
      if (existingInnings && existingInnings.status === 'in-progress') {
        match = existingMatch;
        innings = existingInnings;
        showScoringScreen();
        maybeShowWalkthrough();
        return;
      }
      if (existingInnings) {
        match = existingMatch;
        innings = existingInnings;
        showInningsSummary();
        return;
      }
    }
  }

  renderNewMatchSetup(setupContainer, (newMatch, newInnings) => {
    match = newMatch;
    innings = newInnings;
    showScoringScreen();
    maybeShowWalkthrough();
  });
}

document.addEventListener('DOMContentLoaded', init);
