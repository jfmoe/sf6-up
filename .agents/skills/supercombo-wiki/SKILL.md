---
name: supercombo-wiki
description: 通过 SuperCombo Wiki 检索和读取可追溯的《Street Fighter 6》外部知识。仅在本地知识库无法回答具体问题，或问题要求最新、准确或来源可追溯的信息时使用。
---

# SuperCombo Wiki

把 SuperCombo 作为只读的 SF6 外部知识源，使用本 Skill 目录下的 `scripts/supercombo-wiki.js`。

1. 写明需要补足或核查的具体结论。若不确定本地是否已有答案，先检索本地知识库；若问题要求最新信息，直接进入外部核查。完成标准：查询目标是一条可核查的 SF6 结论，而非宽泛主题。
2. 查询帧数时，运行 `bun <skill-dir>/scripts/supercombo-wiki.js frame-data "<角色>" [--move-type "<招式类型>"] [--input "<指令>"] [--limit <1-200>]`。只使用返回的预定义字段，把结果标为“Cargo 事实”，并引用 `sources` 中的 URL、`revid` 和更新时间。完成标准：角色与筛选条件准确，且每条数据都能追溯到带版本的 SF6 源页。
3. 查询其他内容时，运行 `search "<搜索词>" --limit <1-20>`，再对相关标题运行 `fetch "<标题1>" "<标题2>"`，单次不超过 20 个标题。只用搜索摘要选择页面，不从摘要形成事实结论。完成标准：用于回答的页面均取得 wikitext、URL、`revid` 和更新时间。
4. `frame-data` 返回 `cargo_unavailable` 时，执行错误中的 `fallback.command` 与 `query`，按 `select` 选择与角色对应的 SF6 `/Data` 页面，再用 `fallback.then` 指定的 `fetch` 读取它；候选为空或无法唯一对应角色时说明失败，不猜页面。明确说明结构化查询不可用，只把读取到的原始内容标为“Wiki 原文”，不要把它伪装成 Cargo 值。完成标准：降级页面仍严格属于 SF6 范围，并取得完整版本信息。
5. 用简体中文回答。区分“Cargo 事实”“Wiki 原文”和“Agent 推断”；每个实质性结论都附页面标题、URL、`revid` 和更新时间。完成标准：读者能逐条复查事实，并且不会把推断误认为来源内容。

CLI 返回非零状态或错误 JSON 时，说明失败，不用无关页面伪装成功。

默认按需读取，不持久缓存、不镜像，也不自动写入本地知识库。用户要求归档、再发布或扩大用途时，先提示 SuperCombo 的许可信息尚不明确，并把保存或发布视为需要单独授权的任务。

仅在接口行为变化或需要判断许可边界时，读取[现有权威研究资料](../../../docs/research/supercombo-wiki-access.md)；不要在本 Skill 中复制接口说明。
