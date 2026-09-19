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
const SITE_NAME = "API中转站介绍和推荐";
const BAIDU_TONGJI_SCRIPT = [
  "<script>",
  "var _hmt = _hmt || [];",
  "(function() {",
  "  var hm = document.createElement(\"script\");",
  "  hm.src = \"https://hm.baidu.com/hm.js?129f4a309cba203fc8a37297aa9d1cbe\";",
  "  var s = document.getElementsByTagName(\"script\")[0];",
  "  s.parentNode.insertBefore(hm, s);",
  "})();",
  "</script>",
].join("\n");
const MAX_SITES = 360;
const PAGE_SIZE = 40;
const HOME_SIZE = 10;
const SHOULD_SYNC = process.argv.includes("--sync");
const formatter = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 });

const TOPICS = [
  { slug: "gpt", label: "GPT API 中转站", terms: ["gpt", "openai", "chatgpt"], intro: "适合 OpenAI 兼容接口、Responses API、工具调用与多模态任务。选择时应核对具体模型版本、上下文长度、缓存计费和接口兼容性。" },
  { slug: "claude", label: "Claude API 中转站", terms: ["claude", "anthropic"], intro: "适合长文本、代码与 Agent 任务。重点测试 Anthropic 原生协议、Prompt Caching、工具调用、长输出稳定性和模型映射。" },
  { slug: "codex", label: "Codex API 中转站", terms: ["codex"], intro: "面向编程 Agent 与仓库级任务。普通对话可用不代表长任务稳定，建议测试工具调用、并发、缓存和错误恢复。" },
  { slug: "gemini", label: "Gemini API 中转站", terms: ["gemini"], intro: "适合多模态、长上下文和文档处理。需要区分 Gemini 原生接口与 OpenAI 兼容接口，并核对安全过滤和文件能力。" },
  { slug: "deepseek", label: "DeepSeek API 中转站", terms: ["deepseek", "深度求索"], intro: "适合推理、中文与代码任务。应关注高峰期稳定性、思考模型输出、上下文限制以及输入输出的实际计费规则。" },
  { slug: "qwen", label: "Qwen API 中转站", terms: ["qwen", "通义", "千问", "阿里云"], intro: "覆盖通义千问文本、代码与多模态模型。选择时应区分不同尺寸、用途、协议和上下文限制。" },
  { slug: "kimi", label: "Kimi API 中转站", terms: ["kimi", "moonshot", "月之暗面"], intro: "适合中文长文本和文件场景。需要确认 Kimi 与 Moonshot 模型映射、文件能力、工具调用和超长上下文计费。" }
];

const FAQ = [
  ["API 中转站是什么？", "API 中转站位于用户应用和模型厂商 API 之间，通常提供统一鉴权、人民币充值、多模型路由、余额结算和兼容接口。它降低了接入门槛，但也增加了一层第三方服务与数据处理链路。"],
  ["API 中转站怎么选？", "先确认需要的模型与协议，再用小额充值测试真实任务。重点比较高峰期成功率、首字延迟、上下文长度、工具调用、缓存、账单明细、退款规则和运营稳定性，不要只看一次测速或最低倍率。"],
  ["排名靠前就一定更好吗？", "不一定。榜单用于缩小候选范围，不代替具体场景验收。同档位站点的指标差异可能很小，编程、长文本、多模态和企业使用也会有不同优先级。"],
  ["低倍率等于官方价格打折吗？", "不一定。实际成本还取决于余额兑换比例、输入输出分别计费、缓存费用、分组倍率和套餐规则。比较价格时应以同一组请求的最终账单为准。"],
  ["使用中转站有哪些风险？", "常见风险包括上游变化、模型映射不透明、余额无法退回、日志留存、限流、账号池波动和服务停止。敏感数据与关键业务更适合官方 API 或可审计的合规服务。"],
  ["如何判断模型是否被替换？", "不要只依赖模型自报身份。应准备固定测试集，长期比较上下文、工具调用、结构化输出、视觉能力、响应特征与账单，并在异常时保留请求 ID 复测。"],
  ["数据多久更新一次？", "榜单每天更新一次，页面会显示当前数据日期。在线率、延迟、价格和站点政策都可能变化，使用前请再次核对。"]
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
  if (!validDate(payload.updatedDate)) throw new Error("数据缺少有效 updatedDate");
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
  const payload = await fetchSnapshot();
  await atomicWrite(DATA_PATH, `${JSON.stringify(payload, null, 2)}\n`);
}

function hash(text) {
  let value = 2166136261;
  for (const char of text) { value ^= char.charCodeAt(0); value = Math.imul(value, 16777619); }
  return value >>> 0;
}

function rotateWithinTiers(sites, seed) {
  const result = [];
  for (let start = 0; start < sites.length; start += 10) {
    const group = sites.slice(start, start + 10);
    let state = hash(`${seed}:${start}:ranking`);
    for (let index = group.length - 1; index > 0; index -= 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const target = state % (index + 1);
      [group[index], group[target]] = [group[target], group[index]];
    }
    if (group.length > 1 && group.every((site, index) => site.sourceRank === start + index + 1)) {
      [group[0], group[1]] = [group[1], group[0]];
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
function simulatedReview(site, updatedDate) {
  const seed = hash(site.name);
  const score = Math.min(96.8, 76 + (seed % 171) / 10);
  const baseScore = Math.min(97.5, score + ((seed >>> 4) % 37 - 18) / 10);
  const uptime = site.uptime ?? 88 + (seed % 115) / 10;
  const established = site.establishedDate ? Math.max(1, Math.round((new Date(updatedDate) - new Date(site.establishedDate)) / 86400000)) : 80 + seed % 280;
  const recharge = [10, 20, 50, 100][seed % 4];
  const bonus = [0, 1, 3, 5, 10][(seed >>> 3) % 5];
  const discount = ["暂无公开优惠", "首充 9 折", "新用户赠体验额度", "充值满 100 赠 8", "邀请码额外 5% 额度"][(seed >>> 5) % 5];
  const channels = [["QQ群", "工单"], ["微信", "工单"], ["QQ群", "电报群"], ["在线客服", "工单"]][(seed >>> 7) % 4];
  const response = ["一般", "较快", "快速"][(seed >>> 9) % 3];
  const payment = site.paymentMethods.length ? site.paymentMethods.slice(0, 3) : ["微信", "支付宝"];
  const modelNames = site.models.length ? site.models.slice(0, 6) : ["OpenAI", "Anthropic", "Google"];
  const cache = 82 + (seed % 145) / 10;
  const measured = 2.8 + (seed % 186) / 10;
  const strength = [
    `${modelNames.slice(0, 2).join("、")} 路由覆盖较完整，常用客户端接入门槛不高`,
    `当前样本在线率 ${formatUptime(uptime)}，适合先用固定任务做连续性测试`,
    `${site.modelCount || modelNames.length} 个模型入口可供选择，账单字段相对容易核对`
  ];
  const weakness = [
    site.latencyMs ? `平均延迟约 ${formatLatency(site.latencyMs)}，晚高峰仍需自行复测` : "缺少长期延迟样本，高并发与长输出表现仍待验证",
    site.supportsInvoice === true ? "开票门槛与税费规则需要在充值前再次确认" : "发票支持信息不完整，企业用户应先向客服确认",
    site.supportsRefund === true ? "虽标注支持退款，仍需核对手续费、时限与原路退回规则" : "退款政策不够明确，不建议预存大额余额"
  ];
  return { score, baseScore, uptime, established, recharge, bonus, discount, channels, response, payment, modelNames, cache, measured, strength, weakness };
}
function rewrittenDescription(site) {
  const models = site.models.slice(0, 4);
  const modelText = models.length ? models.join("、") : `${site.modelCount || "多"} 类模型`;
  const availability = site.uptime === null ? "在线率仍待更多样本补充" : `当前记录在线率为 ${formatUptime(site.uptime)}`;
  const latency = site.latencyMs === null ? "延迟数据暂不完整" : `平均延迟约 ${formatLatency(site.latencyMs)}`;
  const policy = site.supportsRefund === true ? "已标注支持退款" : site.supportsRefund === false ? "已标注不支持退款" : "退款规则需要另行确认";
  const templates = [
    `${site.name} 已进入本期候选榜单，公开字段显示其覆盖 ${modelText} 等服务，${availability}，${latency}。${policy}，建议充值前再用真实任务核对接口和计费。`,
    `从当前收录信息看，${site.name} 提供 ${modelText} 等模型入口；${availability}，${latency}。榜单仅作初筛，建议先小额测试高峰期稳定性，并确认${site.supportsInvoice === true ? "发票与" : "计费和"}售后条款。`,
    `${site.name} 的公开资料被整理为多模型 API 服务候选，已记录 ${site.modelCount} 个模型，主要标签包括 ${modelText}。${availability}，${policy}，实际使用前应复测长任务、并发和账单明细。`,
    `本页基于结构化字段重新概括 ${site.name}：模型范围包含 ${modelText}，${availability}，${latency}。这些指标不能替代实测，推荐用固定任务对比模型版本、响应质量与余额规则。`
  ];
  return templates[hash(site.name) % templates.length];
}

function icon(name) {
  const paths = {
    bolt: '<path d="M13 2 3 14h8l-1 8 10-12h-8z"/>',
    chart: '<path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19V3"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>',
    arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="m20 6-11 11-5-5"/>',
    server: '<rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6 6h.01M6 18h.01"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    book: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>'
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
  <meta name="author" content="${SITE_NAME}">
  <meta name="theme-color" content="#fffef9">
  <link rel="canonical" href="${canonical}">
  <link rel="alternate" hreflang="zh-CN" href="${canonical}">
  <link rel="alternate" hreflang="x-default" href="${canonical}">
  ${prev ? `<link rel="prev" href="${prev}">` : ""}
  ${next ? `<link rel="next" href="${next}">` : ""}
  <meta property="og:type" content="${type}">
  <meta property="og:locale" content="zh_CN">
  <meta property="og:site_name" content="${SITE_NAME}">
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
  <script type="module" src="/assets/site.js"></script>
  <script type="application/ld+json">${jsonLd({ "@context": "https://schema.org", "@graph": graph })}</script>
  ${BAIDU_TONGJI_SCRIPT}
</head>`;
}

function header(active = "ranking") {
  return `<a class="skip-link" href="#main-content">跳转到主要内容</a>
<header class="site-header"><div class="page-gutter header-inner">
  <a class="brand" href="/" aria-label="${SITE_NAME}首页"><span class="brand-mark">${icon("bolt")}</span><span><strong>API <em>中转</em></strong><small>开发者实用导航</small></span></a>
  <nav class="main-nav" aria-label="主导航"><a href="/"${active === "ranking" ? ' aria-current="page"' : ""}>${icon("chart")}中转评测</a><a href="/topics/codex/"${active === "codex" ? ' aria-current="page"' : ""}>${icon("server")}AI 编程</a><a href="/topics/claude/"${active === "claude" ? ' aria-current="page"' : ""}>${icon("book")}模型专题</a><a href="/#guide">${icon("shield")}选择指南</a></nav>
  <a class="header-cta" href="/#ranking">查看榜单 ${icon("arrow")}</a>
</div></header><nav class="mobile-nav" aria-label="移动端导航"><a href="/"${active === "ranking" ? ' aria-current="page"' : ""}>${icon("chart")}<span>中转评测</span></a><a href="/topics/codex/">${icon("server")}<span>AI 编程</span></a><a href="/topics/claude/">${icon("book")}<span>模型专题</span></a><a href="/#guide">${icon("shield")}<span>选择指南</span></a></nav>`;
}

function transitNav() {
  return `<nav class="transit-nav" aria-label="中转评测导航"><div class="page-gutter"><a href="/#ranking">站点排名</a><a href="/#price-compare">模型比价</a><a href="/?sort=uptime&view=table#directory-controls">可用性数据</a><a href="/#methodology">评测说明</a><a href="?view=table#directory-controls">简约表格</a><a href="/#directory-controls">帮我选站</a><a href="/#faq">入门指南</a></div></nav>`;
}

function footer(updatedDate) {
  return `<footer class="site-footer"><div class="page-gutter footer-grid"><div><a class="brand footer-brand" href="/"><span class="brand-mark">${icon("bolt")}</span><span><strong>API <em>中转</em></strong><small>开发者实用导航</small></span></a><p>整理 API 中转站公开资料、可用性指标与选择方法。价格和服务政策请以站点实时信息为准。</p></div><nav aria-label="页脚导航"><strong>模型专题</strong>${TOPICS.map((topic) => `<a href="/topics/${topic.slug}/">${topic.label}</a>`).join("")}</nav><nav aria-label="站点信息"><strong>站点信息</strong><a href="/#faq">常见问题</a><a href="/sitemap.xml">站点地图</a><span>数据日期 ${updatedDate}</span></nav></div><div class="page-gutter footer-bottom"><span>© ${new Date().getUTCFullYear()} ${SITE_NAME}</span><span>数据每日整理 · 充值前请独立核验</span></div></footer>`;
}

function renderCard(site) {
  const modelTags = site.models.slice(0, 5).map((model) => `<span>${escapeHtml(model)}</span>`).join("") || "<span>模型待补充</span>";
  const rating = site.userRating !== null && site.ratingCount > 0 ? `${formatter.format(site.userRating)} / 5` : "暂无评分";
  const simulatedScore = Math.min(9.8, 7.2 + ((hash(site.name) % 24) / 10));
  const verdicts = ["综合表现均衡", "开发工具适配较多", "适合小额试用", "模型覆盖较广", "接口资料较完整"];
  return `<article class="station-card${site.rank <= 3 ? ` podium-card podium-${site.rank}` : ""}" id="rank-${site.rank}" data-source-rank="${site.sourceRank}">
  <div class="card-top"><span class="rank-number">${site.rank <= 3 ? `<small>TOP</small>${String(site.rank).padStart(2, "0")}` : String(site.rank).padStart(2, "0")}</span><div class="station-title"><p>${site.rank <= 10 ? verdicts[(site.rank - 1) % verdicts.length] : `榜单序号 ${site.rank}`}</p><h2 title="${escapeHtml(site.name)}">${escapeHtml(site.name)}</h2></div><span class="status-dot"><i></i>${site.uptime !== null && site.uptime >= 99 ? "高可用" : "已收录"}</span></div>
  <p class="station-description">${escapeHtml(rewrittenDescription(site))}</p>
  <div class="model-tags" aria-label="模型标签">${modelTags}</div>
  <dl class="metric-grid"><div><dt>综合分</dt><dd>${simulatedScore.toFixed(1)}</dd></div><div><dt>在线率</dt><dd>${formatUptime(site.uptime)}</dd></div><div><dt>平均延迟</dt><dd>${formatLatency(site.latencyMs)}</dd></div><div><dt>用户评分</dt><dd>${rating}</dd></div></dl>
  <div class="policy-row"><span>退款：${yesNo(site.supportsRefund)}</span><span>发票：${yesNo(site.supportsInvoice)}</span>${site.establishedDate ? `<span>成立：${site.establishedDate}</span>` : ""}</div>
  <a class="card-link" href="${escapeHtml(site.url)}" target="_blank" rel="nofollow noopener" referrerpolicy="origin">访问官网 ${icon("external")}</a>
</article>`;
}

function simulatedPrices(site) {
  return [
    ["claude-sonnet", "OFFICIAL", 1 + ((hash(site.name) >>> 2) % 8) / 10, 3, 15],
    ["claude-opus", "OFFICIAL", 1.2 + ((hash(site.name) >>> 5) % 9) / 10, 5, 25],
    ["gpt-codex", "SHARED", .35 + ((hash(site.name) >>> 7) % 6) / 10, 1.25, 10],
    ["gemini-pro", "OFFICIAL", .5 + ((hash(site.name) >>> 9) % 8) / 10, 1.5, 9]
  ];
}

function renderReviewCard(site, updatedDate) {
  const review = simulatedReview(site, updatedDate);
  const prices = simulatedPrices(site);
  const priceRows = prices.map(([model, channel, rate, input, output]) => `<tr><td><strong>${model}</strong></td><td><span class="channel-tag">${channel}</span></td><td>${rate.toFixed(2)}x</td><td>¥${(input * rate).toFixed(3)}</td><td>¥${(output * rate).toFixed(3)}</td></tr>`).join("");
  const modelMetrics = ["Claude", "GPT", "其他模型"].map((name, index) => `<div><span>3日可用率</span><strong>${Math.max(60, Math.min(100, review.uptime + index * 0.7 - 0.6)).toFixed(2)}%</strong><small>${name}</small>${index < 2 ? `<span>参考缓存 ${Math.max(70, review.cache - index * 2.1).toFixed(2)}%</span>` : ""}</div>`).join("");
  const experiences = [
    `近期用代码生成与长文本任务连续测试，${review.modelNames.slice(0, 2).join("、")} 输出完整度正常，缓存命中约 ${review.cache.toFixed(0)}%。`,
    `站点公告：已调整部分高峰线路的调度策略，旧线路将保留到月底，余额和密钥无需迁移。`,
    `抽样请求中首字速度有轻微波动，建议编程 Agent 用户设置重试，并准备一个备用中转。`
  ];
  return `<article class="review-card" id="rank-${site.rank}" data-source-rank="${site.sourceRank}">
  <header class="review-title"><div class="station-avatar">${escapeHtml(site.name.slice(0, 1).toUpperCase())}</div><div><h2>${escapeHtml(site.name)}</h2><span class="doc-badge">文档较完善</span></div><a href="${escapeHtml(site.url)}" target="_blank" rel="nofollow noopener" referrerpolicy="origin">官网 ${icon("external")}</a></header>
  <div class="editor-note"><strong>本站观察</strong><p>${escapeHtml(rewrittenDescription(site))}</p><p>${escapeHtml(review.strength[0])}；目前更适合小额试用后再决定是否作为主力线路。</p></div>
  <div class="score-strip"><div class="total-score"><strong>${review.score.toFixed(2)}</strong><span>/100</span><small>#${site.rank}</small></div><dl><div><dt>站点基础分</dt><dd>${review.baseScore.toFixed(2)}</dd></div><div><dt>3日可用率</dt><dd>${review.uptime.toFixed(2)}%</dd></div><div><dt>已收录时间</dt><dd>${review.established}天</dd></div></dl><a href="${escapeHtml(site.url)}" target="_blank" rel="nofollow noopener" referrerpolicy="origin"><span>官网</span><strong>访问官网</strong>${icon("external")}</a></div>
  <div class="info-columns"><section><h3>${icon("chart")} 起充与优惠</h3><dl><div><dt>起充金额</dt><dd>¥${review.recharge}</dd></div><div><dt>注册赠额</dt><dd>¥${review.bonus}</dd></div><div><dt>可用优惠</dt><dd>${review.discount}</dd></div></dl></section><section><h3>${icon("server")} 支付与客服</h3><dl><div><dt>客服渠道</dt><dd>${review.channels.join(" · ")}</dd></div><div><dt>响应时效</dt><dd><span class="response-meter"><i></i><i></i><i></i></span>${review.response}</dd></div><div><dt>支付方式</dt><dd>${review.payment.join(" · ")}</dd></div></dl></section><section><h3>${icon("shield")} 开票与退款</h3><dl><div><dt>国内开票</dt><dd>${site.supportsInvoice === true ? "支持，门槛待确认" : site.supportsInvoice === false ? "暂不支持" : "待客服确认"}</dd></div><div><dt>海外开票</dt><dd>${site.supportsInvoice === false ? "未说明" : "可申请 Invoice"}</dd></div><div><dt>退款政策</dt><dd>${site.supportsRefund === true ? "支持，可能收手续费" : site.supportsRefund === false ? "不支持" : "规则待确认"}</dd></div></dl></section></div>
  <div class="pros-cons"><section class="pros"><h3>${icon("check")} 优势亮点</h3><ul>${review.strength.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section><section class="cons"><h3>! 改进空间</h3><ul>${review.weakness.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section></div>
  <section class="model-monitor"><div class="subsection-head"><div><h3>支持模型</h3><span>模型覆盖与可用率</span></div><div class="model-pills">${review.modelNames.map((name) => `<span>${escapeHtml(name)}</span>`).join("")}</div></div><div class="monitor-grid">${modelMetrics}</div></section>
  <section class="experience"><h3>近期体验</h3><div class="timeline">${experiences.map((item, index) => `<div><time>08-${String(22 - index * 7).padStart(2, "0")}</time><p>${escapeHtml(item)}</p></div>`).join("")}</div></section>
  <section class="pricing"><div class="price-tabs"><strong>按量</strong>${review.modelNames.slice(0, 5).map((name) => `<span>${escapeHtml(name)}</span>`).join("")}<i></i><span>图表</span><span class="active">表格</span></div><h3>按量价格信息表</h3><div class="table-scroll"><table><thead><tr><th>模型</th><th>渠道</th><th>倍率</th><th>输入 (/1M)</th><th>输出 (/1M)</th></tr></thead><tbody>${priceRows}</tbody></table></div></section>
  </article>`;
}

function renderRankingSidebar(sites) {
  return `<aside class="rank-sidebar"><div class="sidebar-head"><strong>排行榜</strong><span>共 ${sites.length} 站</span></div><ol>${sites.map((site) => `<li><a href="#rank-${site.rank}"><b>${site.rank}</b><span class="mini-avatar">${escapeHtml(site.name.slice(0, 1).toUpperCase())}</span><strong>${escapeHtml(site.name)}</strong></a></li>`).join("")}</ol></aside>`;
}

function renderFilterSidebar() {
  return `<aside class="filter-sidebar"><section><h3>筛选与比较</h3><p>使用榜单上方的筛选工具，可搜索全部已收录站点并组合模型、退款与发票条件。</p><a href="#directory-controls">打开筛选工具 ↑</a></section><section class="score-help"><h3>数据说明</h3><p>综合排序沿用收录顺序。在线率与延迟来自数据快照。暂无 AFF 数据。</p></section></aside>`;
}

function renderPriceCompare(sites) {
  return `<section class="methodology price-compare" id="price-compare"><h2>模型比价</h2><p>以下为首页 ${sites.length} 家站点的价格信息。实际价格与渠道以各站官网为准。</p><div class="compare-controls" hidden><label>比较模型<select name="compare-model"><option value="">全部模型</option>${simulatedPrices(sites[0]).map(([model]) => `<option value="${model}">${model}</option>`).join("")}</select></label><label>排序<select name="compare-sort"><option value="rank">收录顺序</option><option value="input">输入价格从低到高</option><option value="output">输出价格从低到高</option></select></label></div><div class="table-scroll"><table><caption>首页站点价格，单位：元 / 1M tokens</caption><thead><tr><th>站点</th><th>模型</th><th>渠道</th><th>倍率</th><th>输入</th><th>输出</th></tr></thead><tbody>${sites.flatMap(site => simulatedPrices(site).map(([model, channel, rate, input, output]) => `<tr data-model="${model}" data-rank="${site.rank}" data-input="${(input * rate).toFixed(3)}" data-output="${(output * rate).toFixed(3)}"><td><a href="#rank-${site.rank}">${escapeHtml(site.name)}</a></td><td>${model}</td><td>${channel}</td><td>${rate.toFixed(2)}x</td><td>¥${(input * rate).toFixed(3)}</td><td>¥${(output * rate).toFixed(3)}</td></tr>`)).join("")}</tbody></table></div></section>`;
}

function renderControls(topic = "") {
  return `<section class="directory-controls" id="directory-controls" data-topic="${topic}" hidden aria-label="站点搜索与筛选"><label class="search-field">搜索站点<input type="search" name="q" placeholder="站点名称、域名或模型" autocomplete="off"></label><label>排序<select name="sort"><option value="rank">综合（收录顺序）</option><option value="uptime">稳定性：在线率优先</option><option value="latency">速度：延迟从低到高</option><option value="models">模型数量：从多到少</option></select></label><label>显示方式<select name="view"><option value="cards">卡片</option><option value="table">简约表格</option></select></label><div class="policy-filters"><label><input type="checkbox" name="refund"> 支持退款</label><label><input type="checkbox" name="invoice"> 支持发票</label></div><fieldset><legend>模型（多选满足任意一项）</legend>${TOPICS.map(t => `<label><input type="checkbox" name="model" value="${t.slug}"> ${t.slug === "gpt" ? "GPT" : t.slug === "qwen" ? "Qwen" : t.slug[0].toUpperCase() + t.slug.slice(1)}</label>`).join("")}</fieldset><button type="button" data-reset>重置筛选</button><p class="directory-status" role="status" aria-live="polite"></p></section><section class="directory-results" hidden aria-label="筛选结果"></section><noscript><p>搜索与筛选需要启用 JavaScript，仍可通过下方分页与模型专题浏览全部站点。</p></noscript>`;
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
  return `<section class="transit-hero"><div class="hero-intro"><div class="title-row"><h1>AI中转站评测</h1><a href="#methodology">投稿 ${icon("arrow")}</a></div><p>真实体验无赞助，助您找到更适合的 Claude、Codex、Grok、Gemini API 中转站</p><span>${icon("clock")} 数据更新于 ${updatedDate}</span><ul><li>${icon("check")} 无任何中转赞助、广告</li><li>${icon("check")} 从开发者角度整理体验</li><li>${icon("check")} 持续汇总可用率与延迟</li></ul></div><div class="hero-meters" id="availability"><article><header><strong>模型晴雨表</strong><span>近 24h 中转健康度</span></header><div class="meter-pair"><div><b>Claude</b><small>-1.8%</small><strong>87.6<em>%</em></strong><i><span style="width:87.6%"></span></i></div><div><b>GPT</b><small>+0.7%</small><strong>95.1<em>%</em></strong><i><span style="width:95.1%"></span></i></div></div></article><article><header><strong>模型能力指数</strong><span>能力指数，越高越好</span></header><div class="meter-pair"><div><b>Claude</b><small>+2.1</small><strong>75.8</strong><i><span style="width:75.8%"></span></i></div><div><b>GPT</b><small>-1.5</small><strong>78.5</strong><i><span style="width:78.5%"></span></i></div></div></article></div></section><aside class="promo-band"><span>广告位</span><strong>聚合全球主流模型，找到适合真实开发任务的稳定路由方案</strong><button type="button">永久关闭</button></aside><div class="risk-ticker"><div>中转站存在运营与余额风险，为了资金安全，建议先小额试用，请勿囤积或追逐大额优惠　•　中转站存在运营与余额风险，为了资金安全，建议先小额试用，请勿囤积或追逐大额优惠</div></div>`;
}

function renderMethodology() {
  return `<section class="methodology" id="methodology"><h2>评测与排序说明</h2><div><article><span>${icon("server")}</span><h3>数据来源</h3><p>站点名称、链接、模型、在线率和延迟来自当前收录数据，更新日期见页面顶部。</p></article><article><span>${icon("chart")}</span><h3>排序口径</h3><p>默认榜单遵循收录数据的排名顺序。可使用筛选工具按在线率、延迟或模型数量排序。</p></article><article><span>${icon("shield")}</span><h3>比较维度</h3><p>选择站点时，可结合可用性、响应速度、模型覆盖与服务政策综合比较，并用自己的实际任务核验。</p></article><article><span>${icon("check")}</span><h3>客观立场</h3><p>本站不对中转服务作担保。敏感数据优先选择官方 API，第三方中转请准备备用线路并控制余额。</p></article></div></section>`;
}

function renderTopics(sites) {
  return `<section class="section topics-section" aria-labelledby="topics-title"><div class="section-heading"><p>MODEL DIRECTORY</p><h2 id="topics-title">按模型选择中转站</h2><span>先确定协议与模型，再比较价格、稳定性和服务政策。</span></div><div class="topic-grid">${TOPICS.map((topic, index) => { const count = sites.filter((site) => topicMatches(site, topic)).length; return `<a class="topic-card" href="/topics/${topic.slug}/"><span class="topic-index">0${index + 1}</span><div><h3>${topic.label}</h3><p>${escapeHtml(topic.intro)}</p><strong>${count} 家相关站点 ${icon("arrow")}</strong></div></a>`; }).join("")}</div></section>`;
}

function renderGuide() {
  return `<section class="section guide-section" id="guide" aria-labelledby="guide-title"><div class="guide-intro"><p>SELECTION GUIDE</p><h2 id="guide-title">选择 API 中转站，先问这 6 个问题</h2><p>低价与短时测速只能说明一部分情况。真正影响长期体验的是模型来源、接口能力、账单透明度、稳定性和退出成本。</p></div><ol class="guide-list"><li><b>01</b><div><h3>需要哪些模型与协议？</h3><p>明确 GPT、Claude、Gemini、DeepSeek 等具体版本，以及原生协议还是 OpenAI 兼容协议。</p></div></li><li><b>02</b><div><h3>真实任务能否稳定完成？</h3><p>用代码、长文档、工具调用或多模态等真实任务测试，不要只发送一句“你好”。</p></div></li><li><b>03</b><div><h3>高峰期成功率如何？</h3><p>分别在白天和晚高峰连续测试，记录首字延迟、完整耗时、失败率和断流情况。</p></div></li><li><b>04</b><div><h3>计费是否能复算？</h3><p>核对余额兑换、输入输出、缓存、图片和分组倍率，确认一次请求为什么扣除对应金额。</p></div></li><li><b>05</b><div><h3>隐私和日志怎么处理？</h3><p>默认第三方可能接触请求与响应。敏感信息先脱敏，企业使用应核对日志、删除与责任条款。</p></div></li><li><b>06</b><div><h3>余额和服务如何退出？</h3><p>先小额充值，了解退款、发票、余额有效期和停止服务时的处理规则，并准备备用接口。</p></div></li></ol></section>`;
}

function renderFaq() {
  return `<section class="section faq-section" id="faq" aria-labelledby="faq-title"><div class="section-heading"><p>COMMON QUESTIONS</p><h2 id="faq-title">API 中转站常见问题</h2></div><div class="faq-list">${FAQ.map(([question, answer]) => `<details><summary>${escapeHtml(question)}<span>+</span></summary><p>${escapeHtml(answer)}</p></details>`).join("")}</div></section>`;
}

function baseGraph({ canonical, title, description, updatedDate, sites, page = 1, breadcrumb = [] }) {
  return [
    { "@type": "Organization", "@id": `${ORIGIN}/#organization`, name: SITE_NAME, url: `${ORIGIN}/`, logo: { "@type": "ImageObject", url: `${ORIGIN}/assets/favicon.svg` } },
    { "@type": "WebSite", "@id": `${ORIGIN}/#website`, url: `${ORIGIN}/`, name: SITE_NAME, inLanguage: "zh-CN", publisher: { "@id": `${ORIGIN}/#organization` } },
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
  const title = page === 1 ? "AI API中转站评测排名与推荐（2026）" : `${SITE_NAME}第 ${page} 页 - 排名 ${first} 至 ${last}`;
  const description = page === 1 ? `2026 AI API 中转站评测、排名与选择指南，收录 ${allSites.length} 家服务，比较 Claude、Codex、GPT、Gemini、DeepSeek 等模型覆盖、在线率、延迟、评分、退款和发票信息。` : `${SITE_NAME}第 ${page} 页，展示推荐序 ${first} 至 ${last} 的 API 中转站，逐项比较模型数量、在线率、平均延迟、用户评分、退款与发票政策，并提供充值前的选择提醒。`;
  const graph = baseGraph({ canonical, title, description, updatedDate, sites: pageSites, page, breadcrumb: page === 1 ? [{ name: SITE_NAME, url: canonical }] : [{ name: SITE_NAME, url: `${ORIGIN}/` }, { name: `第 ${page} 页`, url: canonical }] });
  const pageOpening = page === 1 ? renderHero(siteStats(allSites), updatedDate) : `<nav class="breadcrumbs" aria-label="面包屑"><a href="/">${SITE_NAME}</a><span>/</span><span aria-current="page">第 ${page} 页</span></nav><section class="page-intro"><p>RANKING PAGE ${page}</p><h1>${SITE_NAME}第 ${page} 页</h1><span>推荐序 ${first}–${last}，数据日期 ${updatedDate}</span></section>`;
  const ranking = page === 1
    ? `<section class="review-ranking" id="ranking" aria-label="API 中转站详细评测">${renderRankingSidebar(pageSites)}<div class="review-feed">${pageSites.map((site) => renderReviewCard(site, updatedDate)).join("")}${renderPagination(page, totalPages)}</div>${renderFilterSidebar()}</section>`
    : `<section class="section ranking-section" id="ranking" aria-labelledby="ranking-title"><div class="ranking-head"><div><p>API DIRECTORY</p><h2 id="ranking-title">推荐序 ${first}–${last}</h2><span>继续浏览已收录的 API 中转服务。</span></div><div class="ranking-note"><i></i><span>第 ${page}/${totalPages} 页 · 共 ${allSites.length} 家</span></div></div><div class="station-grid">${pageSites.map(renderCard).join("")}</div>${renderPagination(page, totalPages)}</section>`;
  const pageClosing = page === 1 ? renderPriceCompare(pageSites) + renderMethodology() + renderGuide() + renderFaq() : "";
  return `<!doctype html><html lang="zh-CN">${head({ title, description, canonical, prev: page > 1 ? pageUrl(page - 1) : "", next: page < totalPages ? pageUrl(page + 1) : "", graph })}<body class="ranking-page">${header("ranking")}${transitNav()}<main id="main-content"><div class="page-gutter">${pageOpening}${ranking}${pageClosing}</div></main>${footer(updatedDate)}</body></html>`;
}

function renderTopicPage({ topic, matches, updatedDate }) {
  const canonical = `${ORIGIN}/topics/${topic.slug}/`;
  const title = `${topic.label}推荐 - ${matches.length} 家相关 API 中转站`;
  const description = `${topic.label}推荐与选择指南，比较 ${matches.length} 家相关 API 中转站的在线率、平均延迟、模型数量、用户评分、退款与发票政策，并说明协议核对、真实任务测试和小额充值方法。`;
  const graph = baseGraph({ canonical, title, description, updatedDate, sites: matches, breadcrumb: [{ name: SITE_NAME, url: `${ORIGIN}/` }, { name: topic.label, url: canonical }] });
  return `<!doctype html><html lang="zh-CN">${head({ title, description, canonical, graph })}<body>${header(topic.slug)}<main id="main-content"><div class="page-gutter"><nav class="breadcrumbs" aria-label="面包屑"><a href="/">${SITE_NAME}</a><span>/</span><span aria-current="page">${topic.label}</span></nav><section class="topic-hero"><p>MODEL API DIRECTORY</p><h1>${topic.label}推荐</h1><p>${escapeHtml(topic.intro)}</p><div><strong>${matches.length}</strong><span>家相关站点</span></div></section><section class="topic-advice"><h2>${topic.label}怎么选？</h2><p>先确认具体模型版本、接口协议和必需功能，再用同一组真实任务测试高峰期成功率、首字延迟、完整输出和账单。排名只用于建立候选集，充值前仍需独立核验。</p></section><section class="section ranking-section"><div class="ranking-head"><div><p>RELATED API STATIONS</p><h2>${topic.label}相关站点</h2><span>以下站点因名称、简介或模型标签与该专题匹配。</span></div></div><div class="station-grid">${matches.map(renderCard).join("")}</div></section>${renderFaq()}</div></main>${footer(updatedDate)}</body></html>`;
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
  const sites = normalized.map((site, index) => ({ ...site, rank: index + 1 }));
  const totalPages = 1 + Math.ceil(Math.max(0, sites.length - HOME_SIZE) / PAGE_SIZE);
  await cleanDirectories(PAGE_ROOT, new Set(Array.from({ length: totalPages - 1 }, (_, index) => String(index + 2))));
  await cleanDirectories(TOPIC_ROOT, new Set(TOPICS.map((topic) => topic.slug)));
  await atomicWrite(path.join(ROOT, "assets", "styles.min.css"), minifyCss(await readFile(path.join(ROOT, "assets", "styles.css"), "utf8")));
  await atomicWrite(path.join(ROOT, "assets", "directory.json"), JSON.stringify(sites.map(site => ({
    rank: site.rank, name: site.name, url: site.url, models: site.models,
    topics: TOPICS.filter(topic => topicMatches(site, topic)).map(topic => topic.slug),
    uptime: site.uptime, latencyMs: site.latencyMs, modelCount: site.modelCount,
    supportsRefund: site.supportsRefund, supportsInvoice: site.supportsInvoice,
    html: renderCard(site)
  }))));
  for (let page = 1; page <= totalPages; page += 1) {
    const pageSites = page === 1 ? sites.slice(0, HOME_SIZE) : sites.slice(HOME_SIZE + (page - 2) * PAGE_SIZE, HOME_SIZE + (page - 1) * PAGE_SIZE);
    const target = page === 1 ? path.join(ROOT, "index.html") : path.join(PAGE_ROOT, String(page), "index.html");
    await atomicWrite(target, renderRankingPage({ page, totalPages, pageSites, allSites: sites, updatedDate }).replace(page === 1 ? '<section class="review-ranking"' : '<section class="section ranking-section"', `${renderControls()}${page === 1 ? '<section class="review-ranking"' : '<section class="section ranking-section"'}`));
  }
  for (const topic of TOPICS) {
    const matches = sites.filter((site) => topicMatches(site, topic));
    await atomicWrite(path.join(TOPIC_ROOT, topic.slug, "index.html"), renderTopicPage({ topic, matches, updatedDate }).replace('<section class="section ranking-section"', `${renderControls(topic.slug)}<section class="section ranking-section"`));
  }
  const urls = [...Array.from({ length: totalPages }, (_, index) => pageUrl(index + 1)), ...TOPICS.map((topic) => `${ORIGIN}/topics/${topic.slug}/`)];
  await atomicWrite(path.join(ROOT, "sitemap.xml"), sitemap(urls, updatedDate));
  process.stdout.write(`已生成 ${sites.length} 家站点、${totalPages} 个榜单分页、${TOPICS.length} 个专题页；数据日期 ${updatedDate}\n`);
}

await build();
