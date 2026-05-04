const { createStateStream } = window.BuzzerApp;

const screenRound = document.querySelector("#screenRound");
const screenCategory = document.querySelector("#screenCategory");
const screenQuestion = document.querySelector("#screenQuestion");
const screenAnswer = document.querySelector("#screenAnswer");
const screenBuzzName = document.querySelector("#screenBuzzName");
const screenScores = document.querySelector("#screenScores");
const armAudioBtn = document.querySelector("#armAudioBtn");

let audioContext = null;
let musicTimer = null;
let musicOn = false;

function ensureAudio() {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
}

function playNote(frequency, duration = 0.16, gainValue = 0.025) {
  if (!audioContext) return;
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.03);
}

function startMusic() {
  if (musicTimer || !audioContext) return;
  const notes = [196, 247, 294, 330, 294, 247];
  let index = 0;
  musicTimer = setInterval(() => {
    playNote(notes[index % notes.length], 0.22, 0.018);
    index += 1;
  }, 360);
}

function stopMusic() {
  clearInterval(musicTimer);
  musicTimer = null;
}

function setMusic(shouldPlay) {
  musicOn = shouldPlay;
  if (!audioContext && shouldPlay) return;
  if (shouldPlay) startMusic();
  else stopMusic();
}

armAudioBtn.addEventListener("click", () => {
  ensureAudio();
  armAudioBtn.textContent = "Écran prêt";
  armAudioBtn.disabled = true;
  setMusic(musicOn);
});

function renderScores(players) {
  screenScores.innerHTML = "";
  for (const player of players.slice(0, 6)) {
    const row = document.createElement("div");
    row.className = "screen-score-row";
    row.innerHTML = `<span></span><strong>${player.score}</strong>`;
    row.querySelector("span").textContent = player.name;
    screenScores.append(row);
  }
}

createStateStream((state) => {
  const question = state.activeQuestion;
  const firstBuzz = state.buzzes.find((buzz) => buzz.rank === 1);

  screenRound.textContent = `Manche ${state.round}`;
  screenCategory.textContent = question
    ? `${question.category || "Question"} · ${question.points || 1} point${Number(question.points || 1) > 1 ? "s" : ""}`
    : "En attente";
  screenQuestion.textContent = question?.text || "Choisis une question depuis l'admin.";
  screenAnswer.textContent = question?.answer || "";
  screenAnswer.classList.toggle("hidden", !state.revealAnswer || !question?.answer);
  screenBuzzName.textContent = firstBuzz ? firstBuzz.playerName : "Personne pour l'instant";
  renderScores(state.players);
  setMusic(state.musicPlaying);
});
