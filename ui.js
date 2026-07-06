// ui.js
// Generic interface helpers: the run-selection bottom sheet, toast
// messages, and the skippable first launch walkthrough. No scoring or
// storage logic lives here.

const WALKTHROUGH_SEEN_KEY = 'cricket-analyst-walkthrough-seen';

export function openBottomSheet({ title, runOptions, onSelect, onCancel }) {
  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';

  const sheet = document.createElement('div');
  sheet.className = 'bottom-sheet';

  const heading = document.createElement('h2');
  heading.textContent = title;
  sheet.appendChild(heading);

  const grid = document.createElement('div');
  grid.className = 'run-grid';

  runOptions.forEach((runs) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'run-button';
    button.textContent = runs;
    button.addEventListener('click', () => {
      document.body.removeChild(overlay);
      onSelect(runs);
    });
    grid.appendChild(button);
  });

  sheet.appendChild(grid);

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'sheet-cancel';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => {
    document.body.removeChild(overlay);
    if (onCancel) onCancel();
  });
  sheet.appendChild(cancel);

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
}

// Generic labelled-option sheet, used for extra type and runs steps.
function openLabelledSheet({ title, options, onSelect, onCancel }) {
  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';

  const sheet = document.createElement('div');
  sheet.className = 'bottom-sheet';

  const heading = document.createElement('h2');
  heading.textContent = title;
  sheet.appendChild(heading);

  const grid = document.createElement('div');
  grid.className = 'run-grid';

  options.forEach(({ label, value }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'run-button';
    button.textContent = label;
    button.addEventListener('click', () => {
      document.body.removeChild(overlay);
      onSelect(value);
    });
    grid.appendChild(button);
  });
  sheet.appendChild(grid);

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'sheet-cancel';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => {
    document.body.removeChild(overlay);
    if (onCancel) onCancel();
  });
  sheet.appendChild(cancel);

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
}

// Two-step flow: pick the extra type, then how many runs it carried.
export function openExtraSheet({ onComplete, onCancel }) {
  openLabelledSheet({
    title: 'Extra',
    options: [
      { label: 'Wide', value: 'wide' },
      { label: 'No ball', value: 'noball' },
      { label: 'Bye', value: 'bye' },
      { label: 'Leg bye', value: 'legbye' },
    ],
    onCancel,
    onSelect: (extraType) => {
      if (extraType === 'noball') {
        openLabelledSheet({
          title: 'Runs off the bat',
          options: [0, 1, 2, 3, 4, 6].map((n) => ({ label: String(n), value: n })),
          onCancel,
          onSelect: (runs) => onComplete({ extraType, extraRuns: 1, runs }),
        });
        return;
      }

      if (extraType === 'wide') {
        openLabelledSheet({
          title: 'Runs, including the wide',
          options: [1, 2, 3, 4, 5].map((n) => ({ label: String(n), value: n })),
          onCancel,
          onSelect: (extraRuns) => onComplete({ extraType, extraRuns, runs: 0 }),
        });
        return;
      }

      // bye or legbye
      openLabelledSheet({
        title: extraType === 'bye' ? 'Byes run' : 'Leg byes run',
        options: [1, 2, 3, 4].map((n) => ({ label: String(n), value: n })),
        onCancel,
        onSelect: (extraRuns) => onComplete({ extraType, extraRuns, runs: 0 }),
      });
    },
  });
}

// Wicket flow: dismissal type, who is out (only asked for run outs),
// runs completed before the wicket, then who is coming in.
export function openWicketSheet({ striker, nonStriker, remainingBatters, onComplete, onCancel }) {
  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';
  const sheet = document.createElement('div');
  sheet.className = 'bottom-sheet';

  const incomingField = remainingBatters.length > 0
    ? `<label class="setup-label">Incoming batter
        <select id="incoming-batter" class="setup-text-input">
          ${remainingBatters.map((b) => `<option value="${b.id}">${b.name}</option>`).join('')}
        </select>
      </label>`
    : `<p class="setup-banner">No batters remaining. The innings ends after this wicket.</p>`;

  sheet.innerHTML = `
    <h2>Wicket</h2>
    <label class="setup-label">How out
      <select id="dismissal-type" class="setup-text-input">
        <option value="bowled">Bowled</option>
        <option value="caught">Caught</option>
        <option value="lbw">LBW</option>
        <option value="stumped">Stumped</option>
        <option value="runout">Run out</option>
        <option value="hitwicket">Hit wicket</option>
        <option value="other">Other</option>
      </select>
    </label>
    <div id="who-out-field" class="setup-label" style="display:none;">
      Who is out
      <div class="run-grid" id="who-out-buttons">
        <button type="button" class="run-button" data-batter="${striker.id}">${striker.name} (striker)</button>
        <button type="button" class="run-button" data-batter="${nonStriker.id}">${nonStriker.name} (non-striker)</button>
      </div>
    </div>
    ${incomingField}
    <button type="button" id="confirm-wicket" class="setup-primary-button">Confirm wicket</button>
    <button type="button" class="sheet-cancel">Cancel</button>
  `;

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  let dismissedBatterId = striker.id;
  const dismissalSelect = sheet.querySelector('#dismissal-type');
  const whoOutField = sheet.querySelector('#who-out-field');

  dismissalSelect.addEventListener('change', () => {
    whoOutField.style.display = dismissalSelect.value === 'runout' ? 'block' : 'none';
  });

  sheet.querySelector('#who-out-buttons').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-batter]');
    if (!button) return;
    dismissedBatterId = button.dataset.batter;
    sheet.querySelectorAll('#who-out-buttons button').forEach((b) => b.classList.remove('run-button--selected'));
    button.classList.add('run-button--selected');
  });

  sheet.querySelector('.sheet-cancel').addEventListener('click', () => {
    document.body.removeChild(overlay);
    if (onCancel) onCancel();
  });

  sheet.querySelector('#confirm-wicket').addEventListener('click', () => {
    const dismissalType = dismissalSelect.value;
    const incomingSelect = sheet.querySelector('#incoming-batter');
    const incomingBatterId = incomingSelect ? incomingSelect.value : null;
    document.body.removeChild(overlay);
    onComplete({ dismissalType, dismissedBatterId, incomingBatterId });
  });
}

export function openAddPersonSheet({ title, showHandedness, onComplete, onCancel }) {
  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';
  const sheet = document.createElement('div');
  sheet.className = 'bottom-sheet';

  sheet.innerHTML = `
    <h2>${title}</h2>
    <label class="setup-label">Name
      <input type="text" id="add-person-name" class="setup-text-input" placeholder="Player name" />
    </label>
    ${
      showHandedness
        ? `<label class="setup-label">Handedness
             <select id="add-person-handedness" class="setup-text-input">
               <option value="right">Right handed</option>
               <option value="left">Left handed</option>
             </select>
           </label>`
        : ''
    }
    <button type="button" id="confirm-add-person" class="setup-primary-button">Add</button>
    <button type="button" class="sheet-cancel">Cancel</button>
    <p id="add-person-error" class="setup-error"></p>
  `;
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  sheet.querySelector('#add-person-name').focus();

  sheet.querySelector('.sheet-cancel').addEventListener('click', () => {
    document.body.removeChild(overlay);
    if (onCancel) onCancel();
  });

  sheet.querySelector('#confirm-add-person').addEventListener('click', () => {
    const name = sheet.querySelector('#add-person-name').value.trim();
    if (!name) {
      sheet.querySelector('#add-person-error').textContent = 'Enter a name.';
      return;
    }
    const handedness = showHandedness ? sheet.querySelector('#add-person-handedness').value : undefined;
    document.body.removeChild(overlay);
    onComplete({ name, handedness });
  });
}

export function openRotateSheet({ currentAngle, onChange, onClose }) {
  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';
  const sheet = document.createElement('div');
  sheet.className = 'bottom-sheet';
  sheet.innerHTML = `
    <h2>Rotate view</h2>
    <p class="setup-hint">Drag to match the direction you are sitting in.</p>
    <input type="range" id="rotate-slider" class="rotate-slider" min="0" max="359" step="1" value="${currentAngle}" />
    <div id="rotate-value" class="rotate-value">${currentAngle}°</div>
    <button type="button" id="rotate-done" class="setup-primary-button">Done</button>
  `;
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  const slider = sheet.querySelector('#rotate-slider');
  const valueLabel = sheet.querySelector('#rotate-value');
  slider.addEventListener('input', () => {
    const value = Number(slider.value);
    valueLabel.textContent = `${value}°`;
    onChange(value);
  });

  sheet.querySelector('#rotate-done').addEventListener('click', () => {
    document.body.removeChild(overlay);
    if (onClose) onClose();
  });
}

// Lists every bowler on record so far, with an inline way to add a new
// one. Selecting an existing name, or adding a new one, both set that
// person as the bowler for the current over in one step, since a
// bowler added mid-match should immediately become who is bowling.
export function openBowlerSheet({ bowlers, onSelectExisting, onAddNew }) {
  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';
  const sheet = document.createElement('div');
  sheet.className = 'bottom-sheet';

  const existingRows = bowlers
    .map((b) => `<button type="button" class="bowler-list-row" data-bowler="${b.id}">${b.name}</button>`)
    .join('');

  sheet.innerHTML = `
    <h2>Bowler</h2>
    <button type="button" class="bowler-list-row" data-bowler="">Unknown / not tracked</button>
    ${existingRows}
    <label class="setup-label">Add a new bowler
      <input type="text" id="new-bowler-name" class="setup-text-input" placeholder="Bowler name" />
    </label>
    <button type="button" id="add-new-bowler-button" class="setup-primary-button">Add and set as bowling</button>
    <button type="button" class="sheet-cancel">Cancel</button>
  `;
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  sheet.querySelectorAll('.bowler-list-row').forEach((row) => {
    row.addEventListener('click', () => {
      const bowlerId = row.dataset.bowler || null;
      document.body.removeChild(overlay);
      onSelectExisting(bowlerId);
    });
  });

  sheet.querySelector('.sheet-cancel').addEventListener('click', () => {
    document.body.removeChild(overlay);
  });

  sheet.querySelector('#add-new-bowler-button').addEventListener('click', () => {
    const name = sheet.querySelector('#new-bowler-name').value.trim();
    if (!name) return;
    document.body.removeChild(overlay);
    onAddNew(name);
  });
}

export function openConfirmSheet({ title, message, confirmLabel, onConfirm, onCancel }) {
  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';
  const sheet = document.createElement('div');
  sheet.className = 'bottom-sheet';
  sheet.innerHTML = `
    <h2>${title}</h2>
    <p>${message}</p>
    <button type="button" id="confirm-action" class="setup-primary-button">${confirmLabel}</button>
    <button type="button" class="sheet-cancel">Cancel</button>
  `;
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  sheet.querySelector('.sheet-cancel').addEventListener('click', () => {
    document.body.removeChild(overlay);
    if (onCancel) onCancel();
  });
  sheet.querySelector('#confirm-action').addEventListener('click', () => {
    document.body.removeChild(overlay);
    onConfirm();
  });
}

export function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('toast-visible'), 10);
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, 1800);
}

export function maybeShowWalkthrough() {
  if (localStorage.getItem(WALKTHROUGH_SEEN_KEY)) return;

  const overlay = document.createElement('div');
  overlay.className = 'walkthrough-overlay';
  overlay.innerHTML = `
    <div class="walkthrough-card">
      <h2>Scoring a delivery</h2>
      <ol>
        <li>Tap the field where the ball travelled.</li>
        <li>Select the runs scored.</li>
        <li>Save. The wagon wheel updates straight away.</li>
      </ol>
      <button type="button" class="walkthrough-dismiss">Got it</button>
    </div>
  `;

  overlay.querySelector('.walkthrough-dismiss').addEventListener('click', () => {
    localStorage.setItem(WALKTHROUGH_SEEN_KEY, 'true');
    overlay.remove();
  });

  document.body.appendChild(overlay);
}
