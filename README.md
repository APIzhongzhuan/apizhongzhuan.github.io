# API中转站介绍和推荐

API 中转站介绍、推荐与排名站点，部署到 GitHub Pages。

## 特性

- 最多展示 360 家站点，首页详细展示前 10 家，后续每页 40 家
- 默认遵循数据快照的排名顺序
- 卡片简介由结构化指标重新生成，不直接复用数据快照中的描述原文
- GPT、Claude、Codex、Gemini、DeepSeek、Qwen、Kimi 静态专题页
- Canonical、Open Graph、Twitter Card、JSON-LD、FAQ、分页关系、robots.txt 和 sitemap.xml
- 完整内容直接写入 HTML；客户端 JavaScript 增强全站搜索、模型/退款/发票组合筛选、指标排序、结果分页和简约表格
- 筛选条件保存在 URL，支持刷新和分享；专题页限定在当前专题筛选
- 首页价格支持模型筛选、价格排序及卡片内图表切换；广告关闭状态保存在当前浏览器
- 公开筛选索引为 `assets/directory.json`，随构建更新，不依赖发布原始数据快照；脚本不可用时仍可浏览静态榜单
- GitHub Actions 每天北京时间约 09:17 和 21:17 同步并部署

## 本地使用

```bash
npm ci
npm run build
npm test
```

同步最新数据并构建：

```bash
npm run sync
```

GitHub 仓库需要在 Settings → Pages 中将 Source 设置为 GitHub Actions。

部署工作流只会发布 HTML、CSS、图片、分页、专题页、站点地图等公开文件，不会把构建脚本、测试或原始数据快照放入 Pages 产物。
