const { api, createStateStream } = window.BuzzerApp;

const playerIdKey = "buzzer-player-id";
const playerNameKey = "buzzer-player-name";
const playerId = localStorage.getItem(playerIdKey) || crypto.randomUUID();
localStorage.setItem(playerIdKey, playerId);

const statusDot = document.querySelector("#statusDot");
const roundLabel = document.querySelector("#roundLabel");
const playerNameLabel = document.querySelector("#playerNameLabel");
const joinForm = document.querySelector("#joinForm");
const nameInput = document.querySelector("#nameInput");
const buzzer = document.querySelector("#buzzer");
const message = document.querySelector("#message");
const miniScoreboard = document.querySelector("#miniScoreboard");

let playerName = localStorage.getItem(playerNameKey) || "";
let currentState = null;
let buzzing = false;
let lastBuzzAttempt = 0;

nameInput.value = playerName;

function hasJoined() {
  return playerName.trim().length > 0;
}

function updatePlayerState(state) {
  currentState = state;
  const myBuzz = state.buzzes.find((buzz) => buzz.playerId === playerId);
  const lockedBuzz = state.buzzes.find((buzz) => buzz.playerId === state.lockedPlayerId);
  const me = state.players.find((player) => player.id === playerId);

  statusDot.classList.toggle("open", state.acceptingBuzzes);
  roundLabel.textContent = `Manche ${state.round}`;
  playerNameLabel.textContent = hasJoined()
    ? `${playerName}, prépare-toi à buzzer.`
    : "Entre ton prénom pour rejoindre la partie.";

  buzzer.disabled = !hasJoined() || !state.acceptingBuzzes || buzzing;

  if (!hasJoined()) {
    message.textContent = "Entre ton prénom pour rejoindre la partie.";
  } else if (myBuzz && myBuzz.rank === 1) {
    message.textContent = "Tu as buzzé en premier.";
  } else if (myBuzz) {
    message.textContent = `Tu as buzzé en position ${myBuzz.rank}.`;
  } else if (lockedBuzz) {
    message.textContent = `${lockedBuzz.playerName} a buzzé en premier.`;
  } else if (state.acceptingBuzzes) {
    message.textContent = "Le buzzer est ouvert.";
  } else {
    message.textContent = "En attente du lancement par l'admin.";
  }

  miniScoreboard.innerHTML = "";
  for (const player of state.players.slice(0, 8)) {
    const score = document.createElement("span");
    score.textContent = `${player.name}: ${player.score}`;
    if (me && player.id === me.id) score.style.borderColor = "#2563eb";
    miniScoreboard.append(score);
  }
}

joinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  playerName = nameInput.value.trim().replace(/\s+/g, " ").slice(0, 32);
  if (!playerName) return;
  localStorage.setItem(playerNameKey, playerName);
  await api.post("/api/join", { playerId, name: playerName });
  updatePlayerState(currentState || { round: 1, acceptingBuzzes: false, buzzes: [], players: [] });
});

async function sendBuzz() {
  if (!hasJoined()) return;
  if (buzzing || buzzer.disabled) return;

  const now = Date.now();
  if (now - lastBuzzAttempt < 700) return;
  lastBuzzAttempt = now;

  buzzing = true;
  buzzer.disabled = true;
  message.textContent = "Buzz envoyé.";
  if ("vibrate" in navigator) navigator.vibrate(45);

  try {
    await api.post("/api/buzz", { playerId, name: playerName });
  } catch (error) {
    message.textContent = error.message;
  } finally {
    buzzing = false;
    if (currentState) updatePlayerState(currentState);
  }
}

buzzer.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  sendBuzz();
});

buzzer.addEventListener("click", sendBuzz);

createStateStream((state) => {
  updatePlayerState(state);
});

if (hasJoined()) {
  api.post("/api/join", { playerId, name: playerName }).catch(() => {});
}
