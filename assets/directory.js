export function selectSites(sites, state) {
  const query = (state.q || "").trim().toLocaleLowerCase();
  const selected = sites.filter(site =>
    (!state.topic || site.topics.includes(state.topic)) &&
    (!query || [site.name, site.url, ...site.models].join(" ").toLocaleLowerCase().includes(query)) &&
    (!state.refund || site.supportsRefund === true) &&
    (!state.invoice || site.supportsInvoice === true) &&
    (!state.models.length || state.models.some(model => site.topics.includes(model)))
  );
  const fields = { uptime: ["uptime", -1], latency: ["latencyMs", 1], models: ["modelCount", -1] };
  const [field, direction] = fields[state.sort] || ["rank", 1];
  return selected.sort((a, b) => {
    if (a[field] == null && b[field] != null) return 1;
    if (b[field] == null && a[field] != null) return -1;
    return (a[field] - b[field]) * direction || a.rank - b.rank;
  });
}

export function readState(search, topic = "") {
  const params = new URLSearchParams(search);
  return {
    q: params.get("q") || "", refund: params.get("refund") === "1", invoice: params.get("invoice") === "1",
    models: params.getAll("model").filter(model => ["gpt", "claude", "codex", "gemini", "deepseek", "qwen", "kimi"].includes(model)),
    sort: ["uptime", "latency", "models"].includes(params.get("sort")) ? params.get("sort") : "rank",
    view: params.get("view") === "table" ? "table" : "cards",
    page: Math.max(1, Math.floor(Number(params.get("results"))) || 1), topic
  };
}
