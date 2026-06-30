const KEY = "cricket_analyst_innings";

function saveData(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

function getData() {
  const raw = localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : null;
}
