// app.js
// Bootstraps the live scoring screen. This is the only module that
// coordinates the others; it holds no scoring or rendering logic itself.

import { renderField, onFieldTap } from './field.js';
import { renderWagonWheel } from './wagonwheel.js';
import { openBottomSheet, showToast, maybeShowWalkthrough } from './ui.js';
import { getEventsForMatch } from './storage.js';
import { getCurrentMatchId, computeLiveState } from './innings.js';
import { getBatterById } from './players.js';
import { recordShot, undoLastEvent, editEvent, getLastEvent } from './scoring.js';

const RUN_OPTIONS = [0, 1, 2, 3, 4, 6];

const matchId = getCurrentMatchId();
let shotsGroup;

async function refresh() {
  const events = await getEventsForMatch(matchId);
  renderWagonWheel(shotsGroup, events);

  const state = computeLiveState(events);
  updateStatusBar(state);
}

function updateStatusBar(state) {
  const striker = getBatterById(state.strikerId);
  const nonStriker = getBatterById(state.nonStrikerId);

  document.getElementById('over-ball').textContent = `Over ${state.over}.${state.ball}`;
  document.getElementById('striker-name').textContent = `${striker.name} *`;
  document.getElementById('non-striker-name').textContent = nonStriker.name;
}

function handleFieldTap({ angle, distance }) {
  openBottomSheet({
    title: 'Runs scored',
    runOptions: RUN_OPTIONS,
    onSelect: async (runs) => {
      await recordShot({ matchId, angle, distance, runs });
      await refresh();
      showToast(`${runs} run${runs === 1 ? '' : 's'} recorded`);
    },
  });
}

async function handleUndo() {
  const removed = await undoLastEvent(matchId);
  if (!removed) {
    showToast('Nothing to undo');
    return;
  }
  await refresh();
  showToast('Last ball undone');
}

async function handleEditLast() {
  const last = await getLastEvent(matchId);
  if (!last) {
    showToast('No ball to edit yet');
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

function init() {
  const fieldContainer = document.getElementById('field-container');
  const { svg, shotsGroup: group } = renderField(fieldContainer);
  shotsGroup = group;

  onFieldTap(svg, handleFieldTap);

  document.getElementById('undo-button').addEventListener('click', handleUndo);
  document.getElementById('edit-button').addEventListener('click', handleEditLast);

  refresh();
  maybeShowWalkthrough();
}

document.addEventListener('DOMContentLoaded', init);
