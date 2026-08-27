import assert from "node:assert/strict";
import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(await readFile(path.join(root, "data.json"), "utf8"));
const totalSites = Math.min(360, data.sites.length);
const totalPages = 1 + Math.ceil(Math.max(0, totalSites - 10) / 40);
const origin = "https://apizhongzhuan.github.io";
const topics = ["gpt", "claude", "codex", "gemini", "deepseek", "qwen", "kimi"];

async function htmlFor(page) {
  return readFile(page === 1 ? path.join(root, "index.html") : path.join(root, "page", String(page), "index.html"), "utf8");
}

function jsonLd(html) {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, "JSON-LD must exist");
  return JSON.parse(match[1]);
}

test("homepage title and primary heading target AI transit ranking intent", async () => {
  const html = await htmlFor(1);
  assert.ok(html.includes("<title>AI API中转站评测排名与推荐（2026）</title>"));
  assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1);
  assert.ok(html.includes("<h1>AI中转站评测</h1>"));
});

test("static ranking displays no more than 360 unique sites", async () => {
  const ranks = [];
  for (let page = 1; page <= totalPages; page += 1) {
    const html = await htmlFor(page);
    const pageRanks = [...html.matchAll(/<article class="(?:station-card[^"]*|review-card)" id="rank-(\d+)"/g)].map((match) => Number(match[1]));
    assert.ok(pageRanks.length > 0 && pageRanks.length <= 40);
    ranks.push(...pageRanks);
    assert.doesNotMatch(html, /<script(?! type="application\/ld\+json")/);
  }
  assert.equal(ranks.length, totalSites);
  assert.equal(new Set(ranks).size, totalSites);
  assert.deepEqual(ranks, Array.from({ length: totalSites }, (_, index) => index + 1));
});

test("ranking preserves data order and top ten official links", async () => {
  const sourceRanks = [];
  for (let page = 1; page <= totalPages; page += 1) {
    const html = await htmlFor(page);
    for (const match of html.matchAll(/id="rank-(\d+)" data-source-rank="(\d+)"/g)) {
      const display = Number(match[1]);
      const source = Number(match[2]);
      assert.equal(Math.floor((display - 1) / 10), Math.floor((source - 1) / 10));
      sourceRanks.push(source);
    }
  }
  assert.deepEqual(sourceRanks, Array.from({ length: totalSites }, (_, index) => index + 1));
  const homepage = await htmlFor(1);
  for (const site of data.sites.slice(0, 10)) {
    const card = homepage.match(new RegExp(`data-source-rank="${site.rank}"[\\s\\S]*?</article>`))?.[0] || "";
    assert.ok(card.includes(`href="${site.url}"`), `top ${site.rank} should link to its data.json URL`);
    assert.ok(card.includes("访问官网"));
  }
});

test("homepage ranking appears before user-facing sections", async () => {
  const html = await htmlFor(1);
  const ranking = html.indexOf('id="ranking"');
  const methodology = html.indexOf('id="methodology"');
  const guide = html.indexOf('id="guide"');
  assert.ok(ranking > 0 && ranking < methodology && methodology < guide);
  assert.doesNotMatch(html, /纯静态 HTML|无需脚本|同档轻量轮换|GitHub Pages|GitHub Actions/);
});

test("visible station descriptions are rewritten instead of copied from data", async () => {
  const byRank = new Map(data.sites.slice(0, totalSites).map((site) => [Number(site.rank), String(site.description || "").replace(/\s+/g, " ").trim()]));
  for (let page = 1; page <= totalPages; page += 1) {
    const html = await htmlFor(page);
    const cards = [...html.matchAll(/data-source-rank="(\d+)"[\s\S]*?<p class="station-description">([\s\S]*?)<\/p>/g)];
    for (const match of cards) {
      const source = byRank.get(Number(match[1])) || "";
      const visible = match[2].replace(/<[^>]+>/g, "").replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#039;", "'").trim();
      if (source) {
        assert.notEqual(visible, source);
        assert.ok(!source.startsWith(visible) && !visible.startsWith(source.slice(0, Math.min(80, source.length))));
      }
    }
  }
});

test("all explicit pixel font sizes are at least 14px", async () => {
  const css = await readFile(path.join(root, "assets", "styles.css"), "utf8");
  const sizes = [...css.matchAll(/font-size:\s*([0-9.]+)px/g)].map((match) => Number(match[1]));
  assert.ok(sizes.length > 0);
  assert.ok(sizes.every((size) => size >= 14), `found font sizes below 14px: ${sizes.filter((size) => size < 14).join(", ")}`);
});

test("every indexable page has unique SEO metadata and valid structured data", async () => {
  const titles = new Set();
  const canonicals = new Set();
  const files = [path.join(root, "index.html")];
  for (let page = 2; page <= totalPages; page += 1) files.push(path.join(root, "page", String(page), "index.html"));
  for (const topic of topics) files.push(path.join(root, "topics", topic, "index.html"));
  for (const file of files) {
    const html = await readFile(file, "utf8");
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
    assert.ok(title && canonical && description && description.length > 70);
    assert.ok(html.includes("max-image-preview:large"));
    assert.ok(html.includes('property="og:image"'));
    assert.ok(html.includes('name="twitter:card"'));
    assert.doesNotThrow(() => jsonLd(html));
    titles.add(title);
    canonicals.add(canonical);
  }
  assert.equal(titles.size, files.length);
  assert.equal(canonicals.size, files.length);
});

test("pagination relationships are coherent", async () => {
  for (let page = 1; page <= totalPages; page += 1) {
    const html = await htmlFor(page);
    const prev = html.match(/<link rel="prev" href="([^"]+)"/)?.[1];
    const next = html.match(/<link rel="next" href="([^"]+)"/)?.[1];
    assert.equal(prev, page > 1 ? (page === 2 ? `${origin}/` : `${origin}/page/${page - 1}/`) : undefined);
    assert.equal(next, page < totalPages ? `${origin}/page/${page + 1}/` : undefined);
  }
});

test("topic pages, sitemap, robots and assets exist", async () => {
  for (const topic of topics) {
    const file = path.join(root, "topics", topic, "index.html");
    await access(file);
    const html = await readFile(file, "utf8");
    assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1);
    assert.ok(html.includes("相关站点"));
  }
  const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.equal(locs.length, totalPages + topics.length);
  assert.equal(new Set(locs).size, locs.length);
  assert.ok((await readFile(path.join(root, "robots.txt"), "utf8")).includes(`${origin}/sitemap.xml`));
  assert.ok((await stat(path.join(root, "assets", "styles.min.css"))).size > 1000);
  assert.ok((await stat(path.join(root, "assets", "og-image.png"))).size > 1000);
});

test("generated page directories match expected count", async () => {
  const entries = await readdir(path.join(root, "page"), { withFileTypes: true });
  const pages = entries.filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name));
  assert.equal(pages.length, totalPages - 1);
});
