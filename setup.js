// setup.js
// Renders the team setup wizard (roster entry, then opening pair and
// bowler) and the shorter "start next innings" version reused after a
// declaration or all out. Pure DOM building; match.js does the saving.

import { createMatch, startInnings } from './match.js';

function playerRow(onRemove) {
  const row = document.createElement('div');
  row.className = 'roster-row';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Player name';
  nameInput.className = 'roster-name-input';

  const handedness = document.createElement('select');
  handedness.className = 'roster-handedness-select';
  handedness.innerHTML = '<option value="right">Right handed</option><option value="left">Left handed</option>';

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'roster-remove-button';
  remove.textContent = 'Remove';
  remove.addEventListener('click', () => onRemove(row));

  row.append(nameInput, handedness, remove);
  return { row, nameInput, handedness };
}

function bowlerRow(onRemove) {
  const row = document.createElement('div');
  row.className = 'roster-row';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Bowler name';
  nameInput.className = 'roster-name-input';

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'roster-remove-button';
  remove.textContent = 'Remove';
  remove.addEventListener('click', () => onRemove(row));

  row.append(nameInput, remove);
  return { row, nameInput };
}

export function renderNewMatchSetup(container, onComplete) {
  container.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'setup-screen';
  wrap.innerHTML = `
    <h1 class="setup-title">New match</h1>
    <label class="setup-label">Your team
      <input type="text" id="team-name-input" class="setup-text-input" placeholder="e.g. Under 15s" />
    </label>
    <label class="setup-label">Opposition (optional)
      <input type="text" id="opposition-input" class="setup-text-input" placeholder="e.g. Riverside CC" />
    </label>

    <h2 class="setup-subheading">Batters</h2>
    <div id="players-list" class="roster-list"></div>
    <button type="button" id="add-player-button" class="setup-secondary-button">Add batter</button>

    <h2 class="setup-subheading">Bowlers (optional)</h2>
    <p class="setup-hint">Skip this if bowler names are not known. You can still record every shot.</p>
    <div id="bowlers-list" class="roster-list"></div>
    <button type="button" id="add-bowler-button" class="setup-secondary-button">Add bowler</button>

    <button type="button" id="setup-next-button" class="setup-primary-button">Next: pick openers</button>
    <p id="setup-error" class="setup-error"></p>
  `;
  container.appendChild(wrap);

  const playersList = wrap.querySelector('#players-list');
  const bowlersList = wrap.querySelector('#bowlers-list');
  const playerRows = [];
  const bowlerRows = [];

  function addPlayerRow() {
    const { row, nameInput, handedness } = playerRow((r) => {
      r.remove();
      const idx = playerRows.findIndex((pr) => pr.row === r);
      if (idx >= 0) playerRows.splice(idx, 1);
    });
    playersList.appendChild(row);
    playerRows.push({ row, nameInput, handedness });
  }

  function addBowlerRow() {
    const { row, nameInput } = bowlerRow((r) => {
      r.remove();
      const idx = bowlerRows.findIndex((br) => br.row === r);
      if (idx >= 0) bowlerRows.splice(idx, 1);
    });
    bowlersList.appendChild(row);
    bowlerRows.push({ row, nameInput });
  }

  // Start with two batter rows, since every match needs at least two.
  // No bowler row to start, bowlers are optional.
  addPlayerRow();
  addPlayerRow();

  wrap.querySelector('#add-player-button').addEventListener('click', addPlayerRow);
  wrap.querySelector('#add-bowler-button').addEventListener('click', addBowlerRow);

  wrap.querySelector('#setup-next-button').addEventListener('click', async () => {
    const errorEl = wrap.querySelector('#setup-error');
    const teamName = wrap.querySelector('#team-name-input').value.trim() || 'My team';
    const opposition = wrap.querySelector('#opposition-input').value.trim();

    const players = playerRows
      .map((pr) => ({ name: pr.nameInput.value.trim(), handedness: pr.handedness.value }))
      .filter((p) => p.name.length > 0);

    const bowlers = bowlerRows
      .map((br) => ({ name: br.nameInput.value.trim() }))
      .filter((b) => b.name.length > 0);

    if (players.length < 2) {
      errorEl.textContent = 'Add at least two batters.';
      return;
    }

    const match = await createMatch({ teamName, opposition, players, bowlers });
    renderOpenersSetup(container, match, onComplete);
  });
}

export function renderOpenersSetup(container, match, onComplete, bannerText) {
  container.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'setup-screen';

  const playerOptions = match.players.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
  const bowlerOptions =
    '<option value="">Unknown / not tracked</option>' +
    match.bowlers.map((b) => `<option value="${b.id}">${b.name}</option>`).join('');

  wrap.innerHTML = `
    ${bannerText ? `<p class="setup-banner">${bannerText}</p>` : ''}
    <h1 class="setup-title">Opening pair</h1>
    <label class="setup-label">On strike
      <select id="striker-select" class="setup-text-input">${playerOptions}</select>
    </label>
    <label class="setup-label">Non-striker
      <select id="non-striker-select" class="setup-text-input">${playerOptions}</select>
    </label>
    <label class="setup-label">Opening bowler (optional)
      <select id="bowler-select" class="setup-text-input">${bowlerOptions}</select>
    </label>
    <button type="button" id="start-match-button" class="setup-primary-button">Start scoring</button>
    <p id="openers-error" class="setup-error"></p>
  `;
  container.appendChild(wrap);

  // Default the non-striker select to the second player if available.
  const nonStrikerSelect = wrap.querySelector('#non-striker-select');
  if (match.players.length > 1) nonStrikerSelect.value = match.players[1].id;

  wrap.querySelector('#start-match-button').addEventListener('click', async () => {
    const strikerId = wrap.querySelector('#striker-select').value;
    const nonStrikerId = nonStrikerSelect.value;
    const bowlerId = wrap.querySelector('#bowler-select').value || null;
    const errorEl = wrap.querySelector('#openers-error');

    if (strikerId === nonStrikerId) {
      errorEl.textContent = 'The striker and non-striker must be different players.';
      return;
    }

    const battingOrder = match.players.map((p) => p.id);
    const innings = await startInnings({ matchId: match.id, strikerId, nonStrikerId, bowlerId, battingOrder });
    onComplete(match, innings);
  });
}

// Reused after a declaration or all out: same roster, fresh openers.
export function renderNextInningsSetup(container, match, onComplete) {
  renderOpenersSetup(container, match, onComplete, 'Innings complete. Set up the next innings.');
}
