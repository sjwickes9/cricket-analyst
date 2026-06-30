function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showNewInnings() {
  showScreen('inningsScreen');
}

function goHome() {
  showScreen('homeScreen');
}

function saveInnings() {

  const team = document.getElementById('teamName').value;
  const opposition = document.getElementById('opposition').value;
  const battingOrder = document.getElementById('battingOrder').value
    .split('\n')
    .filter(n => n.trim() !== '');

  const innings = {
    id: Date.now(),
    team,
    opposition,
    battingOrder,
    currentBatterIndex: 0,
    shots: []
  };

  saveData(innings);

  document.getElementById('status').innerText =
    "Innings saved. Ready to resume.";

  goHome();
}

function loadInnings() {
  const data = getData();

  if (!data) {
    document.getElementById('status').innerText = "No saved innings found.";
    return;
  }

  alert("Loaded innings for: " + data.team);
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js');
}
