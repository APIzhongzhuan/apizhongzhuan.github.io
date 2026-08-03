import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_PATH = path.join(ROOT, "data.json");
const PAGE_ROOT = path.join(ROOT, "page");
const TOPIC_ROOT = path.join(ROOT, "topics");
const SOURCE_URL = process.env.DATA_SOURCE_URL || "https://raw.githubusercontent.com/hvoyai/awesome-ai-api/main/data.json";
const ORIGIN = "https://apizhongzhuan.github.io";
const MAX_SITES = 360;
const PAGE_SIZE = 40;
const SHOULD_SYNC = process.argv.includes("--sync");
const formatter = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 });

const TOPICS = [
  { slug: "gpt", label: "GPT 中转站", terms: ["gpt", "openai", "chatgpt"], intro: "适合 OpenAI 兼容接口、Responses API、工具调用与多模态任务。选择时应核对具体模型版本、上下文长度、缓存计费和接口兼容性。" },
  { slug: "claude", label: "Claude 中转站", terms: ["claude", "anthropic"], intro: "适合长文本、代码与 Agent 任务。重点测试 Anthropic 原生协议、Prompt Caching、工具调用、长输出稳定性和模型映射。" },
  { slug: "codex", label: "Codex 中转站", terms: ["codex"], intro: "面向编程 Agent 与仓库级任务。普通对话可用不代表长任务稳定，建议测试工具调用、并发、缓存和错误恢复。" },
  { slug: "gemini", label: "Gemini 中转站", terms: ["gemini"], intro: "适合多模态、长上下文和文档处理。需要区分 Gemini 原生接口与 OpenAI 兼容接口，并核对安全过滤和文件能力。" },
  { slug: "deepseek", label: "DeepSeek 中转站", terms: ["deepseek", "深度求索"], intro: "适合推理、中文与代码任务。应关注高峰期稳定性、思考模型输出、上下文限制以及输入输出的实际计费规则。" },
  { slug: "qwen", label: "Qwen 中转站", terms: ["qwen", "通义", "千问", "阿里云"], intro: "覆盖通义千问文本、代码与多模态模型。选择时应区分不同尺寸、用途、协议和上下文限制。" },
  { slug: "kimi", label: "Kimi 中转站", terms: ["kimi", "moonshot", "月之暗面"], intro: "适合中文长文本和文件场景。需要确认 Kimi 与 Moonshot 模型映射、文件能力、工具调用和超长上下文计费。" }
];

const FAQ = [
  ["AI 中转站是什么？", "AI 中转站位于用户应用和模型厂商 API 之间，通常提供统一鉴权、人民币充值、多模型路由、余额结算和兼容接口。它降低了接入门槛，但也增加了一层第三方服务与数据处理链路。"],
  ["AI 中转站怎么选？", "先确认需要的模型与协议，再用小额充值测试真实任务。重点比较高峰期成功率、首字延迟、上下文长度、工具调用、缓存、账单明细、退款规则和运营稳定性，不要只看一次测速或最低倍率。"],
  ["排名靠前就一定更好吗？", "不一定。榜单用于缩小候选范围，不代替具体场景验收。同档位站点的指标差异可能很小，编程、长文本、多模态和企业使用也会有不同优先级。"],
  ["为什么榜单顺序会轻微变化？", "站点先按公开目录的综合序筛选，再在每五个相邻站点组成的同档位内按数据日期做轻量轮换。这样既保留总体质量层级，也避免把细小差异误解成永久且绝对的名次。"],
  ["低倍率等于官方价格打折吗？", "不一定。实际成本还取决于余额兑换比例、输入输出分别计费、缓存费用、分组倍率和套餐规则。比较价格时应以同一组请求的最终账单为准。"],
  ["使用中转站有哪些风险？", "常见风险包括上游变化、模型映射不透明、余额无法退回、日志留存、限流、账号池波动和服务停止。敏感数据与关键业务更适合官方 API 或可审计的合规服务。"],
  ["如何判断模型是否被替换？", "不要只依赖模型自报身份。应准备固定测试集，长期比较上下文、工具调用、结构化输出、视觉能力、响应特征与账单，并在异常时保留请求 ID 复测。"],
  ["数据多久更新一次？", "站点通过 GitHub Actions 每天自动同步两次。页面显示数据日期，若上游临时不可用则保留上一份已验证快照，避免生成空榜单或损坏页面。"]
];

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function safeUrl(value) {
  try { const url = new URL(String(value || "")); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; } catch { return ""; }
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validDate(value) {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function normalize(site, index) {
  const models = Array.isArray(site.models) ? [...new Set(site.models.map(String).map((x) => x.trim()).filter(Boolean))] : [];
  const payments = Array.isArray(site.paymentMethods) ? [...new Set(site.paymentMethods.map(String).map((x) => x.trim()).filter(Boolean))] : [];
  return {
    sourceRank: Math.max(1, Math.round(finite(site.rank) || index + 1)),
    name: String(site.name || "未命名站点").trim(),
    url: safeUrl(site.url),
    description: String(site.description || "").replace(/\s+/g, " ").trim(),
    establishedDate: validDate(site.establishedDate),
    modelCount: Math.max(0, Math.round(finite(site.modelCount) ?? models.length)),
    models,
    uptime: finite(site.uptime),
    latencyMs: finite(site.latencyMs),
    userRating: finite(site.userRating),
    ratingCount: Math.max(0, Math.round(finite(site.ratingCount) || 0)),
    paymentMethods: payments,
    supportsRefund: typeof site.supportsRefund === "boolean" ? site.supportsRefund : null,
    supportsInvoice: typeof site.supportsInvoice === "boolean" ? site.supportsInvoice : null
  };
}

function validate(payload) {
  if (!payload || !Array.isArray(payload.sites) || !payload.sites.length) throw new Error("数据缺少非空 sites 数组");
  for (const [index, site] of payload.sites.entries()) {
    if (!site?.name || !safeUrl(site.url)) throw new Error(`第 ${index + 1} 条数据无效`);
  }
}

async function atomicWrite(target, content) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, target);
}

async function fetchSnapshot() {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(SOURCE_URL, { headers: { "user-agent": "apizhongzhuan-static-builder/1.0" }, signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = JSON.parse(await response.text());
      validate(payload);
      const sites = payload.sites.map(normalize).sort((a, b) => a.sourceRank - b.sourceRank).slice(0, MAX_SITES);
      return { ...payload, sites: sites.map(({ sourceRank, ...site }) => ({ rank: sourceRank, ...site })) };
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
    }
  }
  throw lastError;
}

async function syncData() {
  try {
    const payload = await fetchSnapshot();
    await atomicWrite(DATA_PATH, `${JSON.stringify(payload, null, 2)}\n`);
    return;
  } catch (error) {
    try {
      const current = JSON.parse(await readFile(DATA_PATH, "utf8"));
      validate(current);
      process.stderr.write(`同步失败，继续使用已验证快照：${error.message}\n`);
      return;
    } catch { throw error; }
  }
}

function hash(text) {
  let value = 2166136261;
  for (const char of text) { value ^= char.charCodeAt(0); value = Math.imul(value, 16777619); }
  return value >>> 0;
}

function rotateWithinTiers(sites, seed) {
  const result = [];
  for (let start = 0; start < sites.length; start += 5) {
    const group = sites.slice(start, start + 5);
    if (group.length > 2) {
      const mode = hash(`${seed}:${start}`) % 4;
      if (mode === 0 && group.length > 2) [group[1], group[2]] = [group[2], group[1]];
      if (mode === 1 && group.length > 4) [group[3], group[4]] = [group[4], group[3]];
      if (mode === 2 && group.length > 3) [group[2], group[3]] = [group[3], group[2]];
    }
    result.push(...group);
  }
  return result.map((site, index) => ({ ...site, rank: index + 1 }));
}

function topicMatches(site, topic) {
  const text = [site.name, site.description, ...site.models].join(" ").toLowerCase();
  return topic.terms.some((term) => text.includes(term.toLowerCase()));
}

function pageUrl(page) { return page === 1 ? `${ORIGIN}/` : `${ORIGIN}/page/${page}/`; }
function pagePath(page) { return page === 1 ? "/" : `/page/${page}/`; }
function formatUptime(value) { return value === null ? "待补充" : `${formatter.format(value)}%`; }
function formatLatency(value) { return value === null ? "待补充" : value >= 1000 ? `${formatter.format(value / 1000)} 秒` : `${Math.round(value)} ms`; }
function yesNo(value) { return value === true ? "支持" : value === false ? "不支持" : "待确认"; }
function trimText(value, size = 132) { return value.length > size ? `${value.slice(0, size).trim()}…` : value; }

function icon(name) {
  const paths = {
    bolt: '<path d="M13 2 3 14h8l-1 8 10-12h-8z"/>',
    chart: '<path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19V3"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>',
    arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
  };
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

function jsonLd(value) { return JSON.stringify(value).replaceAll("</", "<\\/"); }

function head({ title, description, canonical, type = "website", prev = "", next = "", graph = [] }) {
  return `<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
  <meta name="author" content="AI 中转站推荐">
  <meta name="theme-color" content="#159a96">
  <link rel="canonical" href="${canonical}">
  <link rel="alternate" hreflang="zh-CN" href="${canonical}">
  <link rel="alternate" hreflang="x-default" href="${canonical}">
  ${prev ? `<link rel="prev" href="${prev}">` : ""}
  ${next ? `<link rel="next" href="${next}">` : ""}
  <meta property="og:type" content="${type}">
  <meta property="og:locale" content="zh_CN">
  <meta property="og:site_name" content="AI 中转站推荐">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${ORIGIN}/assets/og-image.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${ORIGIN}/assets/og-image.png">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="manifest" href="/site.webmanifest">
  <link rel="stylesheet" href="/assets/styles.min.css">
  <script type="application/ld+json">${jsonLd({ "@context": "https://schema.org", "@graph": graph })}</script>
</head>`;
}

function header(active = "ranking") {
  return `<a class="skip-link" href="#main-content">跳转到主要内容</a>
<header class="site-header"><div class="page-gutter header-inner">
  <a class="brand" href="/" aria-label="AI 中转站推荐首页"><span class="brand-mark">${icon("bolt")}</span><span><strong>AI 中转站推荐</strong><small>API TRANSIT GUIDE</small></span></a>
  <nav class="main-nav" aria-label="主导航"><a href="/"${active === "ranking" ? ' aria-current="page"' : ""}>综合排名</a>${TOPICS.slice(0, 4).map((topic) => `<a href="/topics/${topic.slug}/"${active === topic.slug ? ' aria-current="page"' : ""}>${topic.label.replace(" 中转站", "")}</a>`).join("")}<a href="/#guide">选择指南</a></nav>
  <a class="header-cta" href="#ranking">查看榜单 ${icon("arrow")}</a>
</div></header>`;
}

function footer(updatedDate) {
  return `<footer class="site-footer"><div class="page-gutter footer-grid"><div><a class="brand footer-brand" href="/"><span class="brand-mark">${icon("bolt")}</span><span><strong>AI 中转站推荐</strong><small>静态排名与选择指南</small></span></a><p>帮助开发者从公开信息中筛选 AI API 中转服务。排名与指标仅作信息参考，不构成购买或投资建议。</p></div><nav aria-label="页脚导航"><strong>模型专题</strong>${TOPICS.map((topic) => `<a href="/topics/${topic.slug}/">${topic.label}</a>`).join("")}</nav><nav aria-label="站点信息"><strong>站点信息</strong><a href="/#method">排名说明</a><a href="/#faq">常见问题</a><a href="/sitemap.xml">站点地图</a><span>数据日期 ${updatedDate}</span></nav></div><div class="page-gutter footer-bottom"><span>© ${new Date().getUTCFullYear()} AI 中转站推荐</span><span>每天自动更新 2 次 · GitHub Pages</span></div></footer>`;
}

function renderCard(site) {
  const modelTags = site.models.slice(0, 5).map((model) => `<span>${escapeHtml(model)}</span>`).join("") || "<span>模型待补充</span>";
  const rating = site.userRating !== null && site.ratingCount > 0 ? `${formatter.format(site.userRating)} / 5` : "暂无评分";
  return `<article class="station-card" id="rank-${site.rank}" data-source-rank="${site.sourceRank}">
  <div class="card-top"><span class="rank-number">${String(site.rank).padStart(2, "0")}</span><div class="station-title"><p>推荐序 ${site.rank}</p><h2 title="${escapeHtml(site.name)}">${escapeHtml(site.name)}</h2></div><span class="status-dot"><i></i>${site.uptime !== null && site.uptime >= 99 ? "高可用" : "已收录"}</span></div>
  <p class="station-description">${escapeHtml(trimText(site.description || `${site.name} 已进入 AI 中转站公开目录，建议在充值前核对模型、价格、服务条款和退款政策。`))}</p>
  <div class="model-tags" aria-label="模型标签">${modelTags}</div>
  <dl class="metric-grid"><div><dt>在线率</dt><dd>${formatUptime(site.uptime)}</dd></div><div><dt>平均延迟</dt><dd>${formatLatency(site.latencyMs)}</dd></div><div><dt>用户评分</dt><dd>${rating}</dd></div><div><dt>收录模型</dt><dd>${site.modelCount} 个</dd></div></dl>
  <div class="policy-row"><span>退款：${yesNo(site.supportsRefund)}</span><span>发票：${yesNo(site.supportsInvoice)}</span>${site.establishedDate ? `<span>成立：${site.establishedDate}</span>` : ""}</div>
  <a class="card-link" href="${escapeHtml(site.url)}" target="_blank" rel="nofollow noopener" referrerpolicy="origin">查看站点资料 ${icon("arrow")}</a>
</article>`;
}

function renderPagination(page, totalPages) {
  if (totalPages <= 1) return "";
  const links = Array.from({ length: totalPages }, (_, index) => index + 1).map((item) => `<a href="${pagePath(item)}"${item === page ? ' aria-current="page"' : ""}>${item}</a>`).join("");
  return `<nav class="pagination" aria-label="榜单分页">${page > 1 ? `<a class="page-wide" href="${pagePath(page - 1)}">上一页</a>` : '<span class="page-wide disabled">上一页</span>'}<div>${links}</div>${page < totalPages ? `<a class="page-wide" href="${pagePath(page + 1)}">下一页</a>` : '<span class="page-wide disabled">下一页</span>'}</nav>`;
}

function siteStats(sites) {
  return {
    total: sites.length,
    models: new Set(sites.flatMap((site) => site.models)).size,
    highUptime: sites.filter((site) => site.uptime !== null && site.uptime >= 99).length,
    described: sites.filter((site) => site.description).length
  };
}

function renderHero(stats, updatedDate) {
  return `<section class="hero"><div class="hero-copy"><p class="eyebrow">2026 AI API TRANSIT DIRECTORY</p><h1>AI 中转站推荐</h1><p class="hero-lead">收录并整理 <strong>${stats.total}</strong> 家 AI API 中转站，通过静态 HTML 排名、模型专题和选择指南，帮助你比较 GPT、Claude、Codex、Gemini、DeepSeek 等中转服务。</p><div class="hero-actions"><a class="button primary" href="#ranking">浏览中转站排名 ${icon("arrow")}</a><a class="button secondary" href="#guide">先看选择指南</a></div><p class="update-line">${icon("clock")} 数据日期 ${updatedDate} · 每日自动更新两次</p></div><div class="hero-panel" aria-label="榜单摘要"><div class="panel-bar"><i></i><i></i><i></i><span>apizhongzhuan.github.io/ranking</span></div><ol><li><b>01</b><span><strong>公开信息聚合</strong><small>最多展示 360 家，拒绝无限堆叠</small></span><em>DATA</em></li><li><b>02</b><span><strong>同档轻量轮换</strong><small>保留层级，减少绝对名次误导</small></span><em>FAIR</em></li><li><b>03</b><span><strong>纯静态 HTML</strong><small>无需脚本即可读取完整榜单</small></span><em>SEO</em></li><li><b>04</b><span><strong>模型专题页</strong><small>按真实使用场景缩小候选范围</small></span><em>GUIDE</em></li></ol></div></section>
  <section class="stats-strip" aria-label="站点数据概览"><div><strong>${stats.total}</strong><span>收录中转站</span></div><div><strong>${stats.models}</strong><span>模型与厂商标签</span></div><div><strong>${stats.highUptime}</strong><span>在线率 ≥ 99%</span></div><div><strong>${stats.described}</strong><span>含详细介绍</span></div></section>`;
}

function renderTopics(sites) {
  return `<section class="section topics-section" aria-labelledby="topics-title"><div class="section-heading"><p>MODEL DIRECTORY</p><h2 id="topics-title">按模型选择中转站</h2><span>先确定协议与模型，再比较价格、稳定性和服务政策。</span></div><div class="topic-grid">${TOPICS.map((topic, index) => { const count = sites.filter((site) => topicMatches(site, topic)).length; return `<a class="topic-card" href="/topics/${topic.slug}/"><span class="topic-index">0${index + 1}</span><div><h3>${topic.label}</h3><p>${escapeHtml(topic.intro)}</p><strong>${count} 家相关站点 ${icon("arrow")}</strong></div></a>`; }).join("")}</div></section>`;
}

function renderMethod() {
  return `<section class="section method-section" id="method" aria-labelledby="method-title"><div class="section-heading"><p>METHODOLOGY</p><h2 id="method-title">排名与更新说明</h2><span>排名用于建立候选集，不把有限公开指标包装成绝对评测。</span></div><div class="method-grid"><article><span>${icon("chart")}</span><h3>数据筛选</h3><p>同步公开目录后按原始综合序取前 360 条，验证名称、链接和基础字段。页面不会展示超过 360 家站点。</p></article><article><span>${icon("shield")}</span><h3>轻量轮换</h3><p>每五个相邻站点视为同一档位，只在档位内部按数据日期交换少量位置。原始大层级不变，榜单不会完全随机。</p></article><article><span>${icon("clock")}</span><h3>定时更新</h3><p>GitHub Actions 每天运行两次。同步失败时继续使用上一份已验证快照，避免空页面和损坏数据被部署。</p></article></div></section>`;
}

function renderGuide() {
  return `<section class="section guide-section" id="guide" aria-labelledby="guide-title"><div class="guide-intro"><p>SELECTION GUIDE</p><h2 id="guide-title">选择 AI 中转站，先问这 6 个问题</h2><p>低价与短时测速只能说明一部分情况。真正影响长期体验的是模型来源、接口能力、账单透明度、稳定性和退出成本。</p></div><ol class="guide-list"><li><b>01</b><div><h3>需要哪些模型与协议？</h3><p>明确 GPT、Claude、Gemini、DeepSeek 等具体版本，以及原生协议还是 OpenAI 兼容协议。</p></div></li><li><b>02</b><div><h3>真实任务能否稳定完成？</h3><p>用代码、长文档、工具调用或多模态等真实任务测试，不要只发送一句“你好”。</p></div></li><li><b>03</b><div><h3>高峰期成功率如何？</h3><p>分别在白天和晚高峰连续测试，记录首字延迟、完整耗时、失败率和断流情况。</p></div></li><li><b>04</b><div><h3>计费是否能复算？</h3><p>核对余额兑换、输入输出、缓存、图片和分组倍率，确认一次请求为什么扣除对应金额。</p></div></li><li><b>05</b><div><h3>隐私和日志怎么处理？</h3><p>默认第三方可能接触请求与响应。敏感信息先脱敏，企业使用应核对日志、删除与责任条款。</p></div></li><li><b>06</b><div><h3>余额和服务如何退出？</h3><p>先小额充值，了解退款、发票、余额有效期和停止服务时的处理规则，并准备备用接口。</p></div></li></ol></section>`;
}

function renderFaq() {
  return `<section class="section faq-section" id="faq" aria-labelledby="faq-title"><div class="section-heading"><p>COMMON QUESTIONS</p><h2 id="faq-title">AI 中转站常见问题</h2></div><div class="faq-list">${FAQ.map(([question, answer]) => `<details><summary>${escapeHtml(question)}<span>+</span></summary><p>${escapeHtml(answer)}</p></details>`).join("")}</div></section>`;
}

function baseGraph({ canonical, title, description, updatedDate, sites, page = 1, breadcrumb = [] }) {
  return [
    { "@type": "Organization", "@id": `${ORIGIN}/#organization`, name: "AI 中转站推荐", url: `${ORIGIN}/`, logo: { "@type": "ImageObject", url: `${ORIGIN}/assets/favicon.svg` } },
    { "@type": "WebSite", "@id": `${ORIGIN}/#website`, url: `${ORIGIN}/`, name: "AI 中转站推荐", inLanguage: "zh-CN", publisher: { "@id": `${ORIGIN}/#organization` } },
    { "@type": "CollectionPage", "@id": `${canonical}#webpage`, url: canonical, name: title, description, inLanguage: "zh-CN", dateModified: updatedDate, isPartOf: { "@id": `${ORIGIN}/#website` }, breadcrumb: { "@id": `${canonical}#breadcrumb` } },
    { "@type": "BreadcrumbList", "@id": `${canonical}#breadcrumb`, itemListElement: breadcrumb.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: item.url })) },
    { "@type": "ItemList", "@id": `${canonical}#ranking`, name: `${title}榜单`, numberOfItems: sites.length, itemListOrder: "https://schema.org/ItemListOrderAscending", itemListElement: sites.map((site) => ({ "@type": "ListItem", position: site.rank, item: { "@type": "Service", name: site.name, url: site.url, description: `${site.name}，推荐序 ${site.rank}，在线率 ${formatUptime(site.uptime)}，平均延迟 ${formatLatency(site.latencyMs)}，收录模型 ${site.modelCount} 个。` } })) },
    ...(page === 1 ? [{ "@type": "FAQPage", "@id": `${ORIGIN}/#faq`, mainEntity: FAQ.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) }] : [])
  ];
}

function renderRankingPage({ page, totalPages, pageSites, allSites, updatedDate }) {
  const first = pageSites[0]?.rank || 0;
  const last = pageSites.at(-1)?.rank || 0;
  const canonical = pageUrl(page);
  const title = page === 1 ? "AI 中转站推荐" : `AI 中转站推荐第 ${page} 页 - 排名 ${first} 至 ${last}`;
  const description = page === 1 ? `AI 中转站推荐与 API 中转站排名，静态展示最多 ${allSites.length} 家站点，覆盖 GPT、Claude、Codex、Gemini、DeepSeek 等模型，包含在线率、延迟、评分、退款和发票信息。` : `AI 中转站推荐第 ${page} 页，展示推荐序 ${first} 至 ${last} 的 API 中转站，逐项比较模型数量、在线率、平均延迟、用户评分、退款与发票政策，并提供静态 HTML 资料入口和选择提醒。`;
  const graph = baseGraph({ canonical, title, description, updatedDate, sites: pageSites, page, breadcrumb: page === 1 ? [{ name: "AI 中转站推荐", url: canonical }] : [{ name: "AI 中转站推荐", url: `${ORIGIN}/` }, { name: `第 ${page} 页`, url: canonical }] });
  return `<!doctype html><html lang="zh-CN">${head({ title, description, canonical, prev: page > 1 ? pageUrl(page - 1) : "", next: page < totalPages ? pageUrl(page + 1) : "", graph })}<body>${header("ranking")}<main id="main-content"><div class="page-gutter">${page === 1 ? renderHero(siteStats(allSites), updatedDate) + renderTopics(allSites) + renderMethod() + renderGuide() : `<nav class="breadcrumbs" aria-label="面包屑"><a href="/">AI 中转站推荐</a><span>/</span><span aria-current="page">第 ${page} 页</span></nav><section class="page-intro"><p>RANKING PAGE ${page}</p><h1>AI 中转站推荐第 ${page} 页</h1><span>推荐序 ${first}–${last}，数据日期 ${updatedDate}</span></section>`}<section class="section ranking-section" id="ranking" aria-labelledby="ranking-title"><div class="ranking-head"><div><p>STATIC HTML RANKING</p><h2 id="ranking-title">${page === 1 ? "AI API 中转站排名" : `推荐序 ${first}–${last}`}</h2><span>每页 ${PAGE_SIZE} 家，全部内容直接写入 HTML，搜索引擎和无脚本环境均可完整读取。</span></div><div class="ranking-note"><i></i><span>当前为第 ${page}/${totalPages} 页</span></div></div><div class="station-grid">${pageSites.map(renderCard).join("")}</div>${renderPagination(page, totalPages)}</section>${page === 1 ? renderFaq() : ""}</div></main>${footer(updatedDate)}</body></html>`;
}

function renderTopicPage({ topic, matches, updatedDate }) {
  const canonical = `${ORIGIN}/topics/${topic.slug}/`;
  const title = `${topic.label}推荐 - ${matches.length} 家相关 AI API 中转站`;
  const description = `${topic.label}推荐与选择指南，静态整理 ${matches.length} 家相关 AI API 中转站，比较在线率、平均延迟、模型数量、用户评分、退款与发票政策，并说明协议核对、真实任务测试和小额充值方法。`;
  const graph = baseGraph({ canonical, title, description, updatedDate, sites: matches, breadcrumb: [{ name: "AI 中转站推荐", url: `${ORIGIN}/` }, { name: topic.label, url: canonical }] });
  return `<!doctype html><html lang="zh-CN">${head({ title, description, canonical, graph })}<body>${header(topic.slug)}<main id="main-content"><div class="page-gutter"><nav class="breadcrumbs" aria-label="面包屑"><a href="/">AI 中转站推荐</a><span>/</span><span aria-current="page">${topic.label}</span></nav><section class="topic-hero"><p>MODEL TRANSIT DIRECTORY</p><h1>${topic.label}推荐</h1><p>${escapeHtml(topic.intro)}</p><div><strong>${matches.length}</strong><span>家相关站点</span></div></section><section class="topic-advice"><h2>${topic.label}怎么选？</h2><p>先确认具体模型版本、接口协议和必需功能，再用同一组真实任务测试高峰期成功率、首字延迟、完整输出和账单。排名只用于建立候选集，充值前仍需独立核验。</p></section><section class="section ranking-section"><div class="ranking-head"><div><p>RELATED STATIONS</p><h2>${topic.label}相关站点</h2><span>以下站点因名称、简介或模型标签与该专题匹配。</span></div></div><div class="station-grid">${matches.map(renderCard).join("")}</div></section>${renderFaq()}</div></main>${footer(updatedDate)}</body></html>`;
}

function minifyCss(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").replace(/\s*([{}:;,>])\s*/g, "$1").replace(/;}/g, "}").trim() + "\n";
}

function sitemap(urls, updatedDate) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url, index) => `  <url><loc>${url}</loc><lastmod>${updatedDate}</lastmod><changefreq>daily</changefreq><priority>${index === 0 ? "1.0" : "0.8"}</priority></url>`).join("\n")}\n</urlset>\n`;
}

async function cleanDirectories(root, validNames) {
  let entries = [];
  try { entries = await readdir(root, { withFileTypes: true }); } catch (error) { if (error.code !== "ENOENT") throw error; }
  await Promise.all(entries.filter((entry) => entry.isDirectory() && !validNames.has(entry.name)).map((entry) => rm(path.join(root, entry.name), { recursive: true, force: true })));
}

async function build() {
  if (SHOULD_SYNC) await syncData();
  const payload = JSON.parse(await readFile(DATA_PATH, "utf8"));
  validate(payload);
  const updatedDate = validDate(payload.updatedDate) || new Date().toISOString().slice(0, 10);
  const normalized = payload.sites.map(normalize).sort((a, b) => a.sourceRank - b.sourceRank).slice(0, MAX_SITES);
  const sites = rotateWithinTiers(normalized, updatedDate);
  const totalPages = Math.ceil(sites.length / PAGE_SIZE);
  await cleanDirectories(PAGE_ROOT, new Set(Array.from({ length: totalPages - 1 }, (_, index) => String(index + 2))));
  await cleanDirectories(TOPIC_ROOT, new Set(TOPICS.map((topic) => topic.slug)));
  await atomicWrite(path.join(ROOT, "assets", "styles.min.css"), minifyCss(await readFile(path.join(ROOT, "assets", "styles.css"), "utf8")));
  for (let page = 1; page <= totalPages; page += 1) {
    const pageSites = sites.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const target = page === 1 ? path.join(ROOT, "index.html") : path.join(PAGE_ROOT, String(page), "index.html");
    await atomicWrite(target, renderRankingPage({ page, totalPages, pageSites, allSites: sites, updatedDate }));
  }
  for (const topic of TOPICS) {
    const matches = sites.filter((site) => topicMatches(site, topic));
    await atomicWrite(path.join(TOPIC_ROOT, topic.slug, "index.html"), renderTopicPage({ topic, matches, updatedDate }));
  }
  const urls = [...Array.from({ length: totalPages }, (_, index) => pageUrl(index + 1)), ...TOPICS.map((topic) => `${ORIGIN}/topics/${topic.slug}/`)];
  await atomicWrite(path.join(ROOT, "sitemap.xml"), sitemap(urls, updatedDate));
  process.stdout.write(`已生成 ${sites.length} 家站点、${totalPages} 个榜单分页、${TOPICS.length} 个专题页；数据日期 ${updatedDate}\n`);
}

await build();
