import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";
import { readState, selectSites } from "../assets/directory.js";

const home = await readFile(new URL("../index.html", import.meta.url), "utf8");
const script = (await readFile(new URL("../assets/site.js", import.meta.url), "utf8")).replace(/^import .*;\n/, "");
const sites = JSON.parse(await readFile(new URL("../assets/directory.json", import.meta.url), "utf8"));
const tick = () => new Promise(resolve => setImmediate(resolve));

async function setup(t, { search = "", html = home, fail = false, storageBlocked = false } = {}) {
  const dom = new JSDOM(html, { url: `https://apizhongzhuan.github.io/${search}`, runScripts: "outside-only" });
  t.after(() => dom.window.close());
  const { window } = dom;
  window.selectSites = selectSites;
  window.readState = readState;
  window.HTMLElement.prototype.scrollIntoView = () => {};
  let requests = 0;
  window.fetch = async url => {
    assert.equal(url, "/assets/directory.json");
    requests++;
    return { ok: !fail, json: async () => sites };
  };
  if (storageBlocked) Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } });
  window.eval(script);
  await tick();
  function change(selector, value) {
    const element = window.document.querySelector(selector);
    assert.ok(element, selector);
    if (element.type === "checkbox") element.checked = value;
    else element.value = value;
    element.dispatchEvent(new window.Event("change", { bubbles: true }));
  }
  return { window, document: window.document, change, retry: () => { fail = false; }, requests: () => requests };
}

test("search reaches sites beyond the static homepage and resets without duplicate IDs", async t => {
  const app = await setup(t);
  assert.equal(app.requests(), 0, "default page does not fetch the index");
  const last = sites.at(-1);
  app.change('[name="q"]', last.name);
  await tick();
  assert.ok(app.document.querySelector(`#result-rank-${last.rank}`));
  assert.equal(app.document.querySelector(".review-ranking").hidden, true);
  const ids = [...app.document.querySelectorAll("[id]")].map(node => node.id);
  assert.equal(new Set(ids).size, ids.length);
  app.document.querySelector("[data-reset]").click();
  assert.equal(app.document.querySelector(".review-ranking").hidden, false);
  assert.equal(app.window.location.search, "");
});

test("combined policies and models match real fields, with stable null-last sorting", () => {
  const state = readState("?model=gpt&model=claude&refund=1&invoice=1&sort=uptime");
  const result = selectSites(sites, state);
  assert.ok(result.length);
  assert.ok(result.every(site => site.supportsRefund && site.supportsInvoice && site.topics.some(topic => ["gpt", "claude"].includes(topic))));
  const fixtures = [
    { ...sites[0], rank: 1, uptime: null, latencyMs: null },
    { ...sites[0], rank: 2, uptime: 99, latencyMs: 0 },
    { ...sites[0], rank: 3, uptime: 100, latencyMs: 300 }
  ];
  assert.deepEqual(selectSites(fixtures, readState("?sort=uptime")).map(site => site.rank), [3, 2, 1]);
  assert.deepEqual(selectSites(fixtures, readState("?sort=latency")).map(site => site.rank), [2, 3, 1]);
});

test("table state restores from URL and result pagination covers all sites", async t => {
  const app = await setup(t, { search: "?view=table&sort=latency" });
  assert.equal(app.document.querySelector('[name="view"]').value, "table");
  assert.equal(app.document.querySelectorAll(".directory-results tbody tr").length, 40);
  app.document.querySelector('[data-page="2"]').click();
  await tick();
  assert.ok(app.window.location.search.includes("results=2"));
  assert.equal(app.document.querySelector(".result-pagination span").textContent, "2 / 9");
  assert.equal(app.requests(), 1);
  app.window.history.pushState(null, "", "/?q=there-is-no-such-site");
  app.window.dispatchEvent(new app.window.PopStateEvent("popstate"));
  await tick();
  assert.match(app.document.querySelector(".empty-state").textContent, /没有符合条件/);
});

test("topic filtering stays within the topic and clamps out-of-range pages", async t => {
  const html = await readFile(new URL("../topics/claude/index.html", import.meta.url), "utf8");
  const app = await setup(t, { html, search: "?view=table&results=999999" });
  const count = sites.filter(site => site.topics.includes("claude")).length;
  assert.match(app.document.querySelector(".directory-status").textContent, new RegExp(`找到 ${count} 家`));
  assert.equal(new URLSearchParams(app.window.location.search).get("results"), String(Math.ceil(count / 40)));
});

test("failed fetch preserves static content and retry applies selected filters", async t => {
  const app = await setup(t, { search: "?refund=1", fail: true });
  assert.equal(app.document.querySelector(".review-ranking").hidden, false);
  assert.match(app.document.querySelector(".directory-status").textContent, /尚未应用/);
  app.retry();
  app.document.querySelector("[data-retry]").click();
  await tick();
  assert.equal(app.document.querySelector(".review-ranking").hidden, true);
  assert.equal(app.requests(), 2);
  assert.match(app.document.querySelector(".directory-status").textContent, /找到/);
});

test("price model filters, chart toggle and comparison sorting respond to input", async t => {
  const app = await setup(t);
  const pricing = app.document.querySelector(".pricing");
  pricing.querySelector('[data-family="gpt"]').click();
  assert.equal(pricing.querySelectorAll("tbody tr:not([hidden])").length, 1);
  pricing.querySelector('[data-price-view="chart"]').click();
  assert.equal(pricing.querySelector(".price-chart").hidden, false);
  assert.match(pricing.querySelector(".price-chart").textContent, /gpt-codex/);
  pricing.querySelector('[data-price-view="table"]').click();
  assert.equal(pricing.querySelector(".table-scroll").hidden, false);
  app.change('[name="compare-model"]', "claude-sonnet");
  app.change('[name="compare-sort"]', "output");
  const rows = [...app.document.querySelectorAll(".price-compare tbody tr:not([hidden])")];
  assert.equal(rows.length, 10);
  const prices = rows.map(row => Number(row.dataset.output));
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
});

test("promotion dismissal persists and still works with storage unavailable", async t => {
  const app = await setup(t);
  app.document.querySelector(".promo-band button").click();
  assert.equal(app.document.querySelector(".promo-band").hidden, true);
  assert.equal(app.window.localStorage.getItem("hide-promo"), "1");
  const blocked = await setup(t, { storageBlocked: true });
  blocked.document.querySelector(".promo-band button").click();
  assert.equal(blocked.document.querySelector(".promo-band").hidden, true);
});

test("only supported URL options are accepted", () => {
  assert.deepEqual(readState("?sort=bad&model=bad&view=bad&results=-10"), readState(""));
});
