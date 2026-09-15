import { readState, selectSites } from "./directory.js";

const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const policy = value => value === true ? "支持" : value === false ? "不支持" : "待确认";
const controls = document.querySelector(".directory-controls");

if (controls) {
  const results = document.querySelector(".directory-results");
  const original = document.querySelector(".review-ranking, .ranking-section");
  const status = controls.querySelector(".directory-status");
  const topic = controls.dataset.topic;
  let state = readState(location.search, topic);
  let directory;
  let pending;
  let revision = 0;
  let timer;
  controls.hidden = false;

  function syncControls() {
    for (const name of ["q", "sort", "view"]) controls.querySelector(`[name="${name}"]`).value = state[name];
    for (const name of ["refund", "invoice"]) controls.querySelector(`[name="${name}"]`).checked = state[name];
    controls.querySelectorAll('[name="model"]').forEach(input => { input.checked = state.models.includes(input.value); });
  }

  function writeUrl() {
    const url = new URL(location.href);
    for (const key of ["q", "sort", "view", "refund", "invoice", "model", "results"]) url.searchParams.delete(key);
    if (state.q) url.searchParams.set("q", state.q);
    if (state.sort !== "rank") url.searchParams.set("sort", state.sort);
    if (state.view !== "cards") url.searchParams.set("view", state.view);
    for (const key of ["refund", "invoice"]) if (state[key]) url.searchParams.set(key, "1");
    for (const model of state.models) url.searchParams.append("model", model);
    if (state.page > 1) url.searchParams.set("results", state.page);
    history.replaceState(null, "", url);
  }

  async function loadDirectory() {
    if (directory) return directory;
    if (!pending) pending = fetch("/assets/directory.json").then(response => {
      if (!response.ok) throw new Error("加载失败");
      return response.json();
    }).then(data => {
      if (!Array.isArray(data) || !data.every(site => typeof site.html === "string" && Array.isArray(site.topics))) throw new Error("数据无效");
      directory = data;
      return data;
    }).finally(() => { pending = null; });
    return pending;
  }

  function table(sites) {
    return `<div class="table-scroll"><table><caption>站点指标比较（数据快照，非实时监测）</caption><thead><tr><th>排名</th><th>站点</th><th>模型数量</th><th>在线率</th><th>延迟</th><th>退款</th><th>发票</th></tr></thead><tbody>${sites.map(site => `<tr><td>${site.rank}</td><td><a href="${escape(site.url)}" target="_blank" rel="nofollow noopener">${escape(site.name)} ↗</a></td><td>${site.modelCount}</td><td>${site.uptime == null ? "待补充" : `${site.uptime}%`}</td><td>${site.latencyMs == null ? "待补充" : `${site.latencyMs} ms`}</td><td>${policy(site.supportsRefund)}</td><td>${policy(site.supportsInvoice)}</td></tr>`).join("")}</tbody></table></div>`;
  }

  async function render() {
    const current = ++revision;
    const active = Boolean(state.q.trim() || state.refund || state.invoice || state.models.length || state.sort !== "rank" || state.view !== "cards" || state.page > 1);
    writeUrl();
    if (!active) {
      original.hidden = false;
      results.hidden = true;
      results.replaceChildren();
      results.removeAttribute("aria-busy");
      status.textContent = topic ? "在当前模型专题中筛选。" : "搜索与筛选覆盖全部已收录站点。";
      return;
    }
    status.textContent = "正在加载站点…";
    results.setAttribute("aria-busy", "true");
    try {
      const sites = await loadDirectory();
      if (current !== revision) return;
      const matches = selectSites(sites, state);
      const totalPages = Math.max(1, Math.ceil(matches.length / 40));
      state.page = Math.min(state.page, totalPages);
      writeUrl();
      const pageSites = matches.slice((state.page - 1) * 40, state.page * 40);
      // Keep the server-rendered ranking available when filters are reset.
      original.hidden = true;
      results.hidden = false;
      status.textContent = `找到 ${matches.length} 家站点${matches.length ? `，第 ${state.page}/${totalPages} 页` : "，请尝试减少筛选条件"}。`;
      results.innerHTML = matches.length ? `${state.view === "table" ? table(pageSites) : `<div class="station-grid">${pageSites.map(site => site.html.replace(/id="rank-(\d+)"/g, 'id="result-rank-$1"')).join("")}</div>`}${totalPages > 1 ? `<nav class="result-pagination" aria-label="筛选结果分页"><button type="button" data-page="${state.page - 1}" ${state.page === 1 ? "disabled" : ""}>上一页</button><span>${state.page} / ${totalPages}</span><button type="button" data-page="${state.page + 1}" ${state.page === totalPages ? "disabled" : ""}>下一页</button></nav>` : ""}` : '<div class="empty-state"><h2>没有符合条件的站点</h2><p>更换关键词，或重置筛选后重新选择。</p><button type="button" data-reset>重置筛选</button></div>';
    } catch {
      if (current !== revision) return;
      original.hidden = false;
      results.hidden = false;
      results.innerHTML = '<p class="empty-state">筛选数据加载失败，原始榜单仍可浏览。<button type="button" data-retry>重新加载</button></p>';
      status.textContent = "筛选尚未应用，请重试。";
    } finally {
      if (current === revision) results.removeAttribute("aria-busy");
    }
  }

  function update() {
    clearTimeout(timer);
    state = { ...state, q: controls.querySelector('[name="q"]').value,
      sort: controls.querySelector('[name="sort"]').value, view: controls.querySelector('[name="view"]').value,
      refund: controls.querySelector('[name="refund"]').checked, invoice: controls.querySelector('[name="invoice"]').checked,
      models: [...controls.querySelectorAll('[name="model"]:checked')].map(input => input.value), page: 1 };
    void render();
  }
  controls.addEventListener("input", event => {
    if (event.target.name === "q") { clearTimeout(timer); timer = setTimeout(update, 150); }
  });
  controls.addEventListener("change", update);
  document.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.hasAttribute("data-reset")) {
      clearTimeout(timer);
      state = readState("", topic); syncControls(); void render();
    } else if (button.hasAttribute("data-retry")) void render();
    else if (button.hasAttribute("data-page")) {
      state.page = Number(button.dataset.page); void render();
      controls.scrollIntoView({ block: "start" });
    }
  });
  window.addEventListener("popstate", () => { clearTimeout(timer); state = readState(location.search, topic); syncControls(); void render(); });
  syncControls();
  void render();
}

const promo = document.querySelector(".promo-band");
if (promo) {
  try { promo.hidden = localStorage.getItem("hide-promo") === "1"; } catch { /* Storage may be disabled. */ }
  promo.querySelector("button").addEventListener("click", () => {
    promo.hidden = true;
    try { localStorage.setItem("hide-promo", "1"); } catch { /* Still close it for this visit. */ }
  });
}

const compare = document.querySelector(".price-compare");
if (compare) {
  compare.querySelector(".compare-controls").hidden = false;
  const body = compare.querySelector("tbody");
  const rows = [...body.rows];
  compare.addEventListener("click", event => {
    if (event.target.closest('a[href^="#rank-"]')) controls?.querySelector("[data-reset]").click();
  });
  compare.addEventListener("change", () => {
    const model = compare.querySelector('[name="compare-model"]').value;
    const sort = compare.querySelector('[name="compare-sort"]').value;
    rows.sort((a, b) => Number(a.dataset[sort]) - Number(b.dataset[sort]) || Number(a.dataset.rank) - Number(b.dataset.rank));
    rows.forEach(row => { row.hidden = Boolean(model && row.dataset.model !== model); body.append(row); });
  });
}

// The existing price examples remain explicitly simulated; controls use only their displayed rows.
document.querySelectorAll(".pricing").forEach(pricing => {
  const tabs = pricing.querySelector(".price-tabs");
  const rows = [...pricing.querySelectorAll("tbody tr")];
  tabs.innerHTML = '<strong>按量</strong><button type="button" data-family="all" aria-pressed="true">全部</button><button type="button" data-family="claude" aria-pressed="false">Claude</button><button type="button" data-family="gpt" aria-pressed="false">GPT</button><button type="button" data-family="gemini" aria-pressed="false">Gemini</button><i></i><button type="button" data-price-view="chart" aria-pressed="false">图表</button><button type="button" data-price-view="table" aria-pressed="true">表格</button>';
  const chart = document.createElement("div");
  chart.className = "price-chart";
  chart.hidden = true;
  pricing.append(chart);
  let family = "all";
  let view = "table";
  function draw() {
    const visible = rows.filter(row => family === "all" || row.cells[0].textContent.startsWith(family));
    rows.forEach(row => { row.hidden = !visible.includes(row); });
    const max = Math.max(...visible.map(row => Number(row.cells[4].textContent.replace("¥", ""))));
    chart.innerHTML = '<p>输出价格 · 元 / 1M tokens</p>' + visible.map(row => {
      const price = Number(row.cells[4].textContent.replace("¥", ""));
      return `<div><span>${escape(row.cells[0].textContent)}</span><i style="width:${Math.max(1, price / max * 100)}%"></i><strong>¥${price.toFixed(3)}</strong></div>`;
    }).join("");
    chart.hidden = view !== "chart";
    pricing.querySelector(".table-scroll").hidden = view !== "table";
    tabs.querySelectorAll("button").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.family ? button.dataset.family === family : button.dataset.priceView === view)));
  }
  tabs.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.family) family = button.dataset.family;
    if (button.dataset.priceView) view = button.dataset.priceView;
    draw();
  });
});
