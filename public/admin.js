const { api, createStateStream, formatTime } = window.BuzzerApp;

const statusDot = document.querySelector("#statusDot");
const roundLabel = document.querySelector("#roundLabel");
const lockLabel = document.querySelector("#lockLabel");
const playerCount = document.querySelector("#playerCount");
const buzzCount = document.querySelector("#buzzCount");
const queue = document.querySelector("#queue");
const scoreList = document.querySelector("#scoreList");

document.querySelector("#startBtn").addEventListener("click", () => api.post("/api/start"));
document.querySelector("#closeBtn").addEventListener("click", () => api.post("/api/close"));
document.querySelector("#nextBtn").addEventListener("click", () => api.post("/api/next-round"));
document.querySelector("#resetBtn").addEventListener("click", () => {
  if (confirm("Remettre tous les scores à zéro ?")) {
    api.post("/api/reset");
  }
});

function score(playerId, delta) {
  api.post("/api/score", { playerId, delta }).catch((error) => alert(error.message));
}

function renderBuzzes(state) {
  buzzCount.textContent = `${state.buzzes.length} buzz`;
  queue.innerHTML = "";

  if (!state.buzzes.length) {
    queue.innerHTML = `<div class="empty">Aucun joueur n'a encore buzzé sur cette manche.</div>`;
    return;
  }

  for (const buzz of state.buzzes) {
    const row = document.createElement("div");
    row.className = `buzz-row ${buzz.rank === 1 ? "winner" : ""}`;
    row.innerHTML = `
      <div class="rank">${buzz.rank}</div>
      <div>
        <div class="person-name"></div>
        <div class="meta">${formatTime(buzz.at)}</div>
      </div>
      <button class="button primary">+1</button>
    `;
    row.querySelector(".person-name").textContent = buzz.playerName;
    row.querySelector("button").addEventListener("click", () => score(buzz.playerId, 1));
    queue.append(row);
  }
}

function renderScores(players) {
  playerCount.textContent = `${players.length} inscrit${players.length > 1 ? "s" : ""}`;
  scoreList.innerHTML = "";

  if (!players.length) {
    scoreList.innerHTML = `<div class="empty">Les joueurs apparaissent ici dès qu'ils entrent leur prénom.</div>`;
    return;
  }

  for (const player of players) {
    const row = document.createElement("div");
    row.className = "score-row";
    row.innerHTML = `
      <div class="score-value">${player.score}</div>
      <div>
        <div class="person-name"></div>
        <div class="meta">Score</div>
      </div>
      <div class="score-actions">
        <button aria-label="Retirer un point">-</button>
        <button aria-label="Ajouter un point">+</button>
      </div>
    `;
    row.querySelector(".person-name").textContent = player.name;
    const buttons = row.querySelectorAll("button");
    buttons[0].addEventListener("click", () => score(player.id, -1));
    buttons[1].addEventListener("click", () => score(player.id, 1));
    scoreList.append(row);
  }
}

createStateStream((state) => {
  statusDot.classList.toggle("open", state.acceptingBuzzes);
  roundLabel.textContent = `Manche ${state.round}`;
  lockLabel.textContent = state.acceptingBuzzes ? "Buzzer ouvert" : "Buzzer fermé";
  renderBuzzes(state);
  renderScores(state.players);
});
