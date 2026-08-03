# AI 中转站推荐

纯静态 HTML 的 AI API 中转站排名站点，部署到 GitHub Pages。

## 特性

- 首页标题固定为“AI 中转站推荐”
- 最多展示 360 家站点，每页 40 家
- 每 10 个相邻站点组成一个档位，在档位内做确定性稳定洗牌
- 卡片简介由结构化指标重新生成，不直接复用数据快照中的描述原文
- GPT、Claude、Codex、Gemini、DeepSeek、Qwen、Kimi 静态专题页
- Canonical、Open Graph、Twitter Card、JSON-LD、FAQ、分页关系、robots.txt 和 sitemap.xml
- 无客户端 JavaScript，完整内容直接写入 HTML
- GitHub Actions 每天北京时间约 09:17 和 21:17 同步并部署

## 本地使用

```bash
npm run build
npm test
```

同步最新数据并构建：

```bash
npm run sync
```

GitHub 仓库需要在 Settings → Pages 中将 Source 设置为 GitHub Actions。

部署工作流只会发布 HTML、CSS、图片、分页、专题页、站点地图等公开文件，不会把构建脚本、测试或原始数据快照放入 Pages 产物。
