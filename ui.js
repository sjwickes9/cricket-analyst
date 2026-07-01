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
