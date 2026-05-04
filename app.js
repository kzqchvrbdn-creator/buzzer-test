const api = {
  async post(path, body = {}) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Action impossible");
    return data;
  }
};

function formatTime(time) {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(time));
}

function createStateStream(onState) {
  const events = new EventSource("/api/events");
  events.addEventListener("message", (event) => {
    onState(JSON.parse(event.data));
  });
  events.addEventListener("error", () => {
    document.querySelectorAll("[data-connection]").forEach((node) => {
      node.textContent = "Connexion en attente";
    });
  });
  return events;
}

window.BuzzerApp = {
  api,
  createStateStream,
  formatTime
};
