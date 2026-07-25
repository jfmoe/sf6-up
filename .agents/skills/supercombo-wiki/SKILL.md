---
name: supercombo-wiki
description: 通过 SuperCombo Wiki 检索和读取可追溯的《Street Fighter 6》外部知识。仅在本地知识库无法回答具体问题，或问题要求最新、准确或来源可追溯的信息时使用。
---

# SuperCombo Wiki

把 SuperCombo 作为只读的 SF6 外部知识源，使用本 Skill 目录下的 `scripts/supercombo-wiki.js`。

1. 写明需要补足或核查的具体结论。若不确定本地是否已有答案，先检索本地知识库；若问题要求最新信息，直接进入外部核查。完成标准：查询目标是一条可核查的 SF6 结论，而非宽泛主题。
2. 运行 `bun <skill-dir>/scripts/supercombo-wiki.js search "<搜索词>" --limit <1-20>`。只用摘要选择相关页面，不从摘要形成事实结论。完成标准：候选标题均为 `Street Fighter 6` 根页或其子页面。
3. 对相关标题运行 `bun <skill-dir>/scripts/supercombo-wiki.js fetch "<标题1>" "<标题2>"`，单次不超过 20 个标题。完成标准：用于回答的页面均取得 wikitext、URL、`revid` 和更新时间。
4. 用简体中文回答。把外部内容标为“Wiki 事实”，把分析标为“Agent 推断”；每个实质性结论都附页面标题、URL、`revid` 和更新时间。完成标准：读者能逐条复查事实，并且不会把推断误认为 Wiki 原文。

CLI 返回非零状态或错误 JSON 时，说明失败，不用无关页面伪装成功。

默认按需读取，不持久缓存、不镜像，也不自动写入本地知识库。用户要求归档、再发布或扩大用途时，先提示 SuperCombo 的许可信息尚不明确，并把保存或发布视为需要单独授权的任务。

仅在接口行为变化或需要判断许可边界时，读取[现有权威研究资料](../../../docs/research/supercombo-wiki-access.md)；不要在本 Skill 中复制接口说明。
