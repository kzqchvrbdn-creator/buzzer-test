const { api, createStateStream, formatTime } = window.BuzzerApp;

const statusDot = document.querySelector("#statusDot");
const roundLabel = document.querySelector("#roundLabel");
const lockLabel = document.querySelector("#lockLabel");
const playerCount = document.querySelector("#playerCount");
const buzzCount = document.querySelector("#buzzCount");
const questionCount = document.querySelector("#questionCount");
const screenStatus = document.querySelector("#screenStatus");
const queue = document.querySelector("#queue");
const scoreList = document.querySelector("#scoreList");
const questionList = document.querySelector("#questionList");
const questionForm = document.querySelector("#questionForm");
const questionText = document.querySelector("#questionText");
const questionAnswer = document.querySelector("#questionAnswer");
const questionCategory = document.querySelector("#questionCategory");
const questionPoints = document.querySelector("#questionPoints");
const musicBtn = document.querySelector("#musicBtn");

let latestState = null;

document.querySelector("#startBtn").addEventListener("click", () => api.post("/api/start"));
document.querySelector("#closeBtn").addEventListener("click", () => api.post("/api/close"));
document.querySelector("#nextBtn").addEventListener("click", () => api.post("/api/next-round"));
document.querySelector("#revealBtn").addEventListener("click", () => api.post("/api/screen", { revealAnswer: true }));
document.querySelector("#hideBtn").addEventListener("click", () => api.post("/api/screen", { revealAnswer: false }));
musicBtn.addEventListener("click", () => {
  api.post("/api/screen", { musicPlaying: !latestState?.musicPlaying });
});
document.querySelector("#resetBtn").addEventListener("click", () => {
  if (confirm("Remettre tous les scores à zéro ?")) {
    api.post("/api/reset");
  }
});

questionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await api.post("/api/questions", {
    text: questionText.value,
    answer: questionAnswer.value,
    category: questionCategory.value,
    points: Number(questionPoints.value || 1)
  });
  questionForm.reset();
  questionPoints.value = "1";
});

function score(playerId, delta) {
  api.post("/api/score", { playerId, delta }).catch((error) => alert(error.message));
}

function questionPointsValue(question) {
  return Number(question?.points || 1);
}

function renderQuestions(state) {
  questionCount.textContent = `${state.questions.length} question${state.questions.length > 1 ? "s" : ""}`;
  questionList.innerHTML = "";

  if (!state.questions.length) {
    questionList.innerHTML = `<div class="empty">Ajoute tes questions ici, puis choisis celle qui doit passer à l'écran.</div>`;
    return;
  }

  for (const question of state.questions) {
    const row = document.createElement("article");
    row.className = `question-row ${question.id === state.activeQuestionId ? "active-question" : ""}`;
    row.innerHTML = `
      <div>
        <div class="person-name"></div>
        <div class="meta"></div>
      </div>
      <div class="question-actions">
        <button class="button blue" type="button">Diffuser</button>
        <button class="button light" type="button">Supprimer</button>
      </div>
    `;
    row.querySelector(".person-name").textContent = question.text;
    row.querySelector(".meta").textContent = `${question.category || "Sans catégorie"} · ${questionPointsValue(question)} point${questionPointsValue(question) > 1 ? "s" : ""}`;
    const buttons = row.querySelectorAll("button");
    buttons[0].addEventListener("click", () => api.post("/api/questions/activate", { questionId: question.id }));
    buttons[1].addEventListener("click", () => {
      if (confirm("Supprimer cette question ?")) {
        api.post("/api/questions/delete", { questionId: question.id });
      }
    });
    questionList.append(row);
  }
}

function renderBuzzes(state) {
  buzzCount.textContent = `${state.buzzes.length} buzz`;
  queue.innerHTML = "";

  if (!state.buzzes.length) {
    queue.innerHTML = `<div class="empty">Aucun joueur n'a encore buzzé sur cette manche.</div>`;
    return;
  }

  const points = questionPointsValue(state.activeQuestion);
  for (const buzz of state.buzzes) {
    const row = document.createElement("div");
    row.className = `buzz-row ${buzz.rank === 1 ? "winner" : ""}`;
    row.innerHTML = `
      <div class="rank">${buzz.rank}</div>
      <div>
        <div class="person-name"></div>
        <div class="meta">${formatTime(buzz.at)}</div>
      </div>
      <button class="button primary">+${points}</button>
    `;
    row.querySelector(".person-name").textContent = buzz.playerName;
    row.querySelector("button").addEventListener("click", () => score(buzz.playerId, points));
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
  latestState = state;
  statusDot.classList.toggle("open", state.acceptingBuzzes);
  roundLabel.textContent = `Manche ${state.round}`;
  lockLabel.textContent = state.acceptingBuzzes ? "Buzzer ouvert" : "Buzzer fermé";
  screenStatus.textContent = state.revealAnswer ? "Réponse affichée" : "Réponse masquée";
  musicBtn.textContent = state.musicPlaying ? "Couper musique" : "Lancer musique";
  renderQuestions(state);
  renderBuzzes(state);
  renderScores(state.players);
});
