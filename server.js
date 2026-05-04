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
  buzzes: [],
  players: new Map()
};

const clients = new Set();

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function snapshot() {
  return {
    round: state.round,
    acceptingBuzzes: state.acceptingBuzzes,
    lockedPlayerId: state.lockedPlayerId,
    buzzes: state.buzzes,
    players: [...state.players.values()].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.name.localeCompare(b.name);
    })
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

function cleanName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 32);
}

function findOrCreatePlayer(id, name) {
  const cleanId = String(id || "").trim().slice(0, 80);
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

async function handleApi(req, res) {
  if (req.method === "GET" && req.url === "/api/events") {
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

  if (req.method === "GET" && req.url === "/api/state") {
    sendJson(res, 200, snapshot());
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Méthode non autorisée" });
    return;
  }

  try {
    const body = await readBody(req);

    if (req.url === "/api/join") {
      const player = findOrCreatePlayer(body.playerId, body.name);
      if (!player) return sendJson(res, 400, { error: "Joueur invalide" });
      broadcast();
      sendJson(res, 200, { ok: true, player, state: snapshot() });
      return;
    }

    if (req.url === "/api/buzz") {
      const player = findOrCreatePlayer(body.playerId, body.name);
      if (!player) return sendJson(res, 400, { error: "Joueur invalide" });
      if (!state.acceptingBuzzes) {
        sendJson(res, 409, { error: "Le buzzer est fermé", state: snapshot() });
        return;
      }

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

      broadcast();
      sendJson(res, 200, { ok: true, state: snapshot() });
      return;
    }

    if (req.url === "/api/start") {
      state.acceptingBuzzes = true;
      state.lockedPlayerId = null;
      state.buzzes = [];
      broadcast();
      sendJson(res, 200, { ok: true, state: snapshot() });
      return;
    }

    if (req.url === "/api/close") {
      state.acceptingBuzzes = false;
      broadcast();
      sendJson(res, 200, { ok: true, state: snapshot() });
      return;
    }

    if (req.url === "/api/next-round") {
      state.round += 1;
      state.acceptingBuzzes = false;
      state.lockedPlayerId = null;
      state.buzzes = [];
      broadcast();
      sendJson(res, 200, { ok: true, state: snapshot() });
      return;
    }

    if (req.url === "/api/score") {
      const player = state.players.get(String(body.playerId || ""));
      const delta = Number(body.delta || 0);
      if (!player || !Number.isFinite(delta)) {
        sendJson(res, 400, { error: "Score invalide" });
        return;
      }
      player.score = Math.max(0, player.score + delta);
      broadcast();
      sendJson(res, 200, { ok: true, state: snapshot() });
      return;
    }

    if (req.url === "/api/reset") {
      state.round = 1;
      state.acceptingBuzzes = false;
      state.lockedPlayerId = null;
      state.buzzes = [];
      for (const player of state.players.values()) {
        player.score = 0;
      }
      broadcast();
      sendJson(res, 200, { ok: true, state: snapshot() });
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

server.listen(port, host, () => {
  const publicHost = host === "0.0.0.0" ? "localhost" : host;
  console.log(`Jeu buzzer prêt sur http://${publicHost}:${port}`);
  console.log(`Interface admin: http://${publicHost}:${port}/admin`);
});
