import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";

const state = {
  round: 1,
  acceptingBuzzes: false,
  lockedPlayerId: null,
  activeQuestionId: null,
  revealAnswer: false,
  musicPlaying: false,
  buzzes: [],
  questions: [],
  players: new Map()
};

let db = null;
const clients = new Set();

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sortedPlayers() {
  return [...state.players.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name);
  });
}

function activeQuestion() {
  return state.questions.find((question) => question.id === state.activeQuestionId) || null;
}

function snapshot() {
  return {
    round: state.round,
    acceptingBuzzes: state.acceptingBuzzes,
    lockedPlayerId: state.lockedPlayerId,
    activeQuestionId: state.activeQuestionId,
    activeQuestion: activeQuestion(),
    revealAnswer: state.revealAnswer,
    musicPlaying: state.musicPlaying,
    buzzes: state.buzzes,
    questions: state.questions,
    players: sortedPlayers(),
    database: db ? "postgres" : "memory"
  };
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function broadcast() {
  const payload = `data: ${JSON.stringify(snapshot())}\n\n`;
  for (const client of clients) {
    client.write(payload);
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function cleanText(value, max = 280) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, max);
}

function cleanName(value) {
  return cleanText(value, 32);
}

function id(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function findOrCreatePlayer(playerId, name) {
  const cleanId = cleanText(playerId, 80);
  if (!cleanId) return null;

  const displayName = cleanName(name) || "Joueur";
  const existing = state.players.get(cleanId);
  if (existing) {
    existing.name = displayName;
    existing.lastSeen = Date.now();
    return existing;
  }

  const player = {
    id: cleanId,
    name: displayName,
    score: 0,
    lastSeen: Date.now()
  };
  state.players.set(cleanId, player);
  return player;
}

function questionFromBody(body) {
  const text = cleanText(body.text, 420);
  if (!text) return null;

  return {
    id: cleanText(body.id, 80) || id("q"),
    text,
    answer: cleanText(body.answer, 280),
    category: cleanText(body.category, 40),
    points: Math.max(1, Math.min(20, Number(body.points || 1) || 1)),
    createdAt: Number(body.createdAt || Date.now())
  };
}

function dbStatePayload() {
  return {
    round: state.round,
    acceptingBuzzes: state.acceptingBuzzes,
    lockedPlayerId: state.lockedPlayerId,
    activeQuestionId: state.activeQuestionId,
    revealAnswer: state.revealAnswer,
    musicPlaying: state.musicPlaying,
    buzzes: state.buzzes
  };
}

async function initDb() {
  if (!process.env.DATABASE_URL) return;

  try {
    const { Pool } = await import("pg");
    db = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false }
    });

    await db.query(`
      create table if not exists game_state (
        id integer primary key,
        data jsonb not null,
        updated_at timestamptz not null default now()
      )
    `);
    await db.query(`
      create table if not exists players (
        id text primary key,
        name text not null,
        score integer not null default 0,
        last_seen bigint not null
      )
    `);
    await db.query(`
      create table if not exists questions (
        id text primary key,
        text text not null,
        answer text not null default '',
        category text not null default '',
        points integer not null default 1,
        created_at bigint not null
      )
    `);

    const stateResult = await db.query("select data from game_state where id = 1");
    if (stateResult.rows[0]?.data) {
      const saved = stateResult.rows[0].data;
      state.round = saved.round || 1;
      state.acceptingBuzzes = Boolean(saved.acceptingBuzzes);
      state.lockedPlayerId = saved.lockedPlayerId || null;
      state.activeQuestionId = saved.activeQuestionId || null;
      state.revealAnswer = Boolean(saved.revealAnswer);
      state.musicPlaying = Boolean(saved.musicPlaying);
      state.buzzes = Array.isArray(saved.buzzes) ? saved.buzzes : [];
    }

    const players = await db.query("select id, name, score, last_seen from players");
    for (const row of players.rows) {
      state.players.set(row.id, {
        id: row.id,
        name: row.name,
        score: Number(row.score) || 0,
        lastSeen: Number(row.last_seen) || Date.now()
      });
    }

    const questions = await db.query("select id, text, answer, category, points, created_at from questions order by created_at asc");
    state.questions = questions.rows.map((row) => ({
      id: row.id,
      text: row.text,
      answer: row.answer || "",
      category: row.category || "",
      points: Number(row.points) || 1,
      createdAt: Number(row.created_at) || Date.now()
    }));

    console.log("Base PostgreSQL connectée");
  } catch (error) {
    console.warn("PostgreSQL indisponible, l'application reste en mémoire:", error.message);
    db = null;
  }
}

async function persistState() {
  if (!db) return;
  await db.query(
    `insert into game_state (id, data, updated_at)
     values (1, $1, now())
     on conflict (id) do update set data = excluded.data, updated_at = now()`,
    [dbStatePayload()]
  );
}

async function persistPlayer(player) {
  if (!db) return;
  await db.query(
    `insert into players (id, name, score, last_seen)
     values ($1, $2, $3, $4)
     on conflict (id) do update set name = excluded.name, score = excluded.score, last_seen = excluded.last_seen`,
    [player.id, player.name, player.score, player.lastSeen]
  );
}

async function persistAllPlayers() {
  if (!db) return;
  for (const player of state.players.values()) {
    await persistPlayer(player);
  }
}

async function persistQuestion(question) {
  if (!db) return;
  await db.query(
    `insert into questions (id, text, answer, category, points, created_at)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (id) do update set text = excluded.text, answer = excluded.answer, category = excluded.category, points = excluded.points`,
    [question.id, question.text, question.answer, question.category, question.points, question.createdAt]
  );
}

async function deleteQuestion(idToDelete) {
  if (!db) return;
  await db.query("delete from questions where id = $1", [idToDelete]);
}

async function mutate(res, action) {
  await action();
  await persistState();
  broadcast();
  sendJson(res, 200, { ok: true, state: snapshot() });
}

async function handleApi(req, res) {
  const cleanUrl = new URL(req.url, `http://localhost:${port}`);

  if (req.method === "GET" && cleanUrl.pathname === "/api/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    res.write(`data: ${JSON.stringify(snapshot())}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  if (req.method === "GET" && cleanUrl.pathname === "/api/state") {
    sendJson(res, 200, snapshot());
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Méthode non autorisée" });
    return;
  }

  try {
    const body = await readBody(req);

    if (cleanUrl.pathname === "/api/join") {
      const player = findOrCreatePlayer(body.playerId, body.name);
      if (!player) return sendJson(res, 400, { error: "Joueur invalide" });
      await persistPlayer(player);
      broadcast();
      sendJson(res, 200, { ok: true, player, state: snapshot() });
      return;
    }

    if (cleanUrl.pathname === "/api/buzz") {
      const player = findOrCreatePlayer(body.playerId, body.name);
      if (!player) return sendJson(res, 400, { error: "Joueur invalide" });
      if (!state.acceptingBuzzes) {
        sendJson(res, 409, { error: "Le buzzer est fermé", state: snapshot() });
        return;
      }

      await mutate(res, async () => {
        await persistPlayer(player);
        const alreadyBuzzed = state.buzzes.some((buzz) => buzz.playerId === player.id);
        if (!alreadyBuzzed) {
          const buzz = {
            playerId: player.id,
            playerName: player.name,
            at: Date.now(),
            rank: state.buzzes.length + 1
          };
          state.buzzes.push(buzz);
          if (!state.lockedPlayerId) {
            state.lockedPlayerId = player.id;
            state.acceptingBuzzes = false;
          }
        }
      });
      return;
    }

    if (cleanUrl.pathname === "/api/start") {
      await mutate(res, async () => {
        state.acceptingBuzzes = true;
        state.lockedPlayerId = null;
        state.buzzes = [];
      });
      return;
    }

    if (cleanUrl.pathname === "/api/close") {
      await mutate(res, async () => {
        state.acceptingBuzzes = false;
      });
      return;
    }

    if (cleanUrl.pathname === "/api/next-round") {
      await mutate(res, async () => {
        state.round += 1;
        state.acceptingBuzzes = false;
        state.lockedPlayerId = null;
        state.buzzes = [];
        state.revealAnswer = false;
      });
      return;
    }

    if (cleanUrl.pathname === "/api/score") {
      const player = state.players.get(cleanText(body.playerId, 80));
      const delta = Number(body.delta || 0);
      if (!player || !Number.isFinite(delta)) {
        sendJson(res, 400, { error: "Score invalide" });
        return;
      }
      await mutate(res, async () => {
        player.score = Math.max(0, player.score + delta);
        await persistPlayer(player);
      });
      return;
    }

    if (cleanUrl.pathname === "/api/reset") {
      await mutate(res, async () => {
        state.round = 1;
        state.acceptingBuzzes = false;
        state.lockedPlayerId = null;
        state.buzzes = [];
        state.revealAnswer = false;
        state.musicPlaying = false;
        for (const player of state.players.values()) {
          player.score = 0;
        }
        await persistAllPlayers();
      });
      return;
    }

    if (cleanUrl.pathname === "/api/questions") {
      const question = questionFromBody(body);
      if (!question) return sendJson(res, 400, { error: "Question invalide" });

      await mutate(res, async () => {
        const index = state.questions.findIndex((item) => item.id === question.id);
        if (index >= 0) state.questions[index] = { ...state.questions[index], ...question };
        else state.questions.push(question);
        if (!state.activeQuestionId) state.activeQuestionId = question.id;
        await persistQuestion(question);
      });
      return;
    }

    if (cleanUrl.pathname === "/api/questions/activate") {
      const questionId = cleanText(body.questionId, 80);
      if (!state.questions.some((question) => question.id === questionId)) {
        sendJson(res, 404, { error: "Question introuvable" });
        return;
      }
      await mutate(res, async () => {
        state.activeQuestionId = questionId;
        state.revealAnswer = false;
        state.acceptingBuzzes = false;
        state.lockedPlayerId = null;
        state.buzzes = [];
      });
      return;
    }

    if (cleanUrl.pathname === "/api/questions/delete") {
      const questionId = cleanText(body.questionId, 80);
      await mutate(res, async () => {
        state.questions = state.questions.filter((question) => question.id !== questionId);
        if (state.activeQuestionId === questionId) {
          state.activeQuestionId = state.questions[0]?.id || null;
          state.revealAnswer = false;
        }
        await deleteQuestion(questionId);
      });
      return;
    }

    if (cleanUrl.pathname === "/api/screen") {
      await mutate(res, async () => {
        if ("revealAnswer" in body) state.revealAnswer = Boolean(body.revealAnswer);
        if ("musicPlaying" in body) state.musicPlaying = Boolean(body.musicPlaying);
      });
      return;
    }

    sendJson(res, 404, { error: "Route inconnue" });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
}

async function serveStatic(req, res) {
  const cleanUrl = new URL(req.url, `http://localhost:${port}`);
  let pathname = decodeURIComponent(cleanUrl.pathname);
  if (pathname === "/") pathname = "/player.html";
  if (pathname === "/admin") pathname = "/admin.html";
  if (pathname === "/screen") pathname = "/screen.html";

  const filePath = join(publicDir, pathname);
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream"
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Page introuvable");
  }
}

const server = createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    handleApi(req, res);
    return;
  }
  serveStatic(req, res);
});

await initDb();

server.listen(port, host, () => {
  const publicHost = host === "0.0.0.0" ? "localhost" : host;
  console.log(`Jeu buzzer prêt sur http://${publicHost}:${port}`);
  console.log(`Interface admin: http://${publicHost}:${port}/admin`);
  console.log(`Écran de diffusion: http://${publicHost}:${port}/screen`);
});
