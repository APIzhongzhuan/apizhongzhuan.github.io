import assert from "node:assert/strict";
import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(await readFile(path.join(root, "data.json"), "utf8"));
const totalSites = Math.min(360, data.sites.length);
const totalPages = Math.ceil(totalSites / 40);
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

test("homepage title and primary heading are exact", async () => {
  const html = await htmlFor(1);
  assert.ok(html.includes("<title>AI 中转站推荐</title>"));
  assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1);
  assert.ok(html.includes("<h1>AI 中转站推荐</h1>"));
});

test("static ranking displays no more than 360 unique sites", async () => {
  const ranks = [];
  for (let page = 1; page <= totalPages; page += 1) {
    const html = await htmlFor(page);
    const pageRanks = [...html.matchAll(/<article class="station-card" id="rank-(\d+)"/g)].map((match) => Number(match[1]));
    assert.ok(pageRanks.length > 0 && pageRanks.length <= 40);
    ranks.push(...pageRanks);
    assert.doesNotMatch(html, /<script(?! type="application\/ld\+json")/);
  }
  assert.equal(ranks.length, totalSites);
  assert.equal(new Set(ranks).size, totalSites);
  assert.deepEqual(ranks, Array.from({ length: totalSites }, (_, index) => index + 1));
});

test("ranking only rotates within five-site source tiers", async () => {
  for (let page = 1; page <= totalPages; page += 1) {
    const html = await htmlFor(page);
    for (const match of html.matchAll(/id="rank-(\d+)" data-source-rank="(\d+)"/g)) {
      const display = Number(match[1]);
      const source = Number(match[2]);
      assert.equal(Math.floor((display - 1) / 5), Math.floor((source - 1) / 5));
    }
  }
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
