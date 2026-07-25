# SuperCombo Wiki 外部知识源接入调研

## 结论

**可接入，建议把公开的 MediaWiki Action API 作为索引、搜索、版本追踪和正文读取的主接口。** 它能批量返回页面的原始 wikitext，并且对包含 `/` 的 SF6 子页面可用。这是当前最小、无需新增依赖的方案。REST 搜索可以作为更简洁的交互式搜索入口；Cargo API 可按表查询帧数等结构化数据，但只能作为可选加速层。不要把网页抓取、`Special:Export`、REST 单页端点或分类目录作为主同步机制。

这项判断基于 2026-07-25 的公开、只读实测：目标站点的 API 无需认证即可返回 SF6 页面、搜索、页面清单、最新修订、批量原始内容和 Cargo 表数据；而 `Special:Export/Street_Fighter_6` 返回了 Cloudflare 的 `Just a moment...` 挑战页，并非 XML 导出结果。

## 已确认的站点接口

### 软件与公开 API

`action=query&meta=siteinfo` 返回 `generator: "MediaWiki 1.45.1"`、文章路径 `/w/$1`，并列出 Cargo、ParserFunctions 扩展。因此可以把该站视为一个公开的 MediaWiki 实例，而不是解析 HTML 的专有网站。

- [站点信息实测请求](https://wiki.supercombo.gg/api.php?action=query&meta=siteinfo&siprop=general%7Cextensions%7Cstatistics&format=json)
- MediaWiki 官方将 [Action API](https://www.mediawiki.org/wiki/API:Main_page) 定义为读取页面与查询模块的 HTTP API；[REST API](https://www.mediawiki.org/wiki/API:REST_API) 则提供页面读取、转换和历史等 REST 风格端点。

下表中的「实测」仅表示该 URL 在核查日返回了所述结构，不能等同于站点未来的接口承诺。

| 目的 | 推荐端点/参数 | 实测结果 |
| --- | --- | --- |
| 批量读取原始内容和修订 | `action=query&titles=…&prop=revisions&rvprop=ids%7Ctimestamp%7Ccontent&rvslots=main&formatversion=2` | 对 `Street Fighter 6` 和 `Street Fighter 6/Ryu` 的单次请求返回两页的 `pageid`、`revid`、时间和 `slots.main.content`；正文分别为 5265 和 83935 字符。**这是批量同步的首选内容端点。** 参数语义见 MediaWiki [API:Revisions](https://www.mediawiki.org/wiki/API:Revisions)。 |
| REST 单页原始内容 | `GET /rest.php/v1/page/Street_Fighter_6` | 根页返回 HTTP 200 JSON，含 `id=56270`、`latest.id=365702`、`content_model="wikitext"` 和 5265 字符的 `source`。但把子页标题编码为 `Street_Fighter_6%2FRyu` 时，当前服务器返回 404 HTML；双重编码则返回 `rest-invalid-title`。因此它只适合经实测不含 `/` 的单页，不能承担 SF6 全量同步。([根页实测 URL](https://wiki.supercombo.gg/rest.php/v1/page/Street_Fighter_6)) |
| 读取可渲染 HTML | `GET /rest.php/v1/page/Street_Fighter_6/html` | 根页返回 HTTP 200，`Content-Type: text/html; profile="https://www.mediawiki.org/wiki/Specs/HTML/2.8.0"`。适合人工展示，不应取代保存 wikitext 源，并有上述子页面路径限制。 |
| Action API 的页面/修订元数据 | `action=query&titles=Street_Fighter_6&prop=info%7Crevisions&inprop=url&rvprop=ids%7Ctimestamp%7Cuser%7Ccomment&rvlimit=1` | 返回 `pageid`、`lastrevid`、规范 URL，以及最新 `revid`、父版本、时间、编辑者和摘要。([实测 URL](https://wiki.supercombo.gg/api.php?action=query&titles=Street_Fighter_6&prop=info%7Crevisions&inprop=url&rvprop=ids%7Ctimestamp%7Cuser%7Ccomment&rvlimit=1&format=json)) |
| 站内全文搜索 | `action=query&list=search&srsearch=…&srnamespace=0&srlimit=…` | 搜索 `Ryu` 返回 `title`、`pageid`、`size`、`wordcount`、`snippet`、`timestamp`。它是全站搜索，结果会混入其他游戏，不能把命中集直接当 SF6 范围。([实测 URL](https://wiki.supercombo.gg/api.php?action=query&list=search&srsearch=Ryu&srnamespace=0&srlimit=3&format=json))；参数语义见 MediaWiki [API:Search](https://www.mediawiki.org/wiki/API:Search)。 |
| REST 全文搜索 | `GET /rest.php/v1/search/page?q=…` | 搜索 `Street Fighter 6 Ryu` 返回 `pages[]`，含 `id`、`key`、`title`、`excerpt` 和可选缩略图；首批结果优先出现 SF6/Ryu 子页，但随后仍混入其他作品。它适合交互式检索，范围仍需按标题前缀本地过滤。([实测 URL](https://wiki.supercombo.gg/rest.php/v1/search/page?q=Street%20Fighter%206%20Ryu&limit=5)) |
| 枚举 SF6 子页面 | `action=query&list=allpages&apnamespace=0&apprefix=Street_Fighter_6/&aplimit=…` | 返回如 `Street Fighter 6/A.K.I./Data` 的 `pageid`/`title`，并给出 `continue.apcontinue`；这是当前最可靠的范围索引。([实测 URL](https://wiki.supercombo.gg/api.php?action=query&list=allpages&apnamespace=0&apprefix=Street_Fighter_6%2F&aplimit=10&format=json)) |
| 全站变更流 | `action=query&list=recentchanges&rcnamespace=0&rcprop=title%7Cids%7Ctimestamp…` | 返回 `title`、`pageid`、`revid`、`old_revid`、`rcid`、时间和大小，并用 `rccontinue` 翻页。([实测 URL](https://wiki.supercombo.gg/api.php?action=query&list=recentchanges&rcnamespace=0&rclimit=5&rcprop=title%7Cids%7Ctimestamp%7Csizes%7Cflags&format=json))；参数和 continuation 行为见官方 [API:RecentChanges](https://www.mediawiki.org/wiki/API:RecentChanges)。 |
| 结构化查询 Cargo 表 | `action=cargoquery&tables=SF6_FrameData&fields=…&where=chara="Ryu"` | 返回 `cargoquery[].title`，可直接取得招式指令、伤害、发生、持续、收招和命中/防御有利帧；`action=cargofields&table=SF6_FrameData` 返回字段类型。站点自己的 `paraminfo` 表明 `cargoquery` 支持 `tables`、`fields`、`where`、`order_by`、`limit`、`offset` 等参数。Cargo 官方说明其查询语法接近 SQL。([实测查询](https://wiki.supercombo.gg/api.php?action=cargoquery&tables=SF6_FrameData&fields=chara%2Cinput%2Cdamage%2Cstartup%2Cactive%2Crecovery%2ChitAdv%2CblockAdv&where=chara%3D%22Ryu%22&limit=5&format=json)，[Cargo 查询文档](https://www.mediawiki.org/wiki/Extension:Cargo/Querying_data)) |
| 站点地图 | `/rest.php/site/v1/sitemap/0` | HTTP 200 XML sitemap index，可作只读的交叉核对入口；不是增量同步的唯一事实来源。([实测 URL](https://wiki.supercombo.gg/rest.php/site/v1/sitemap/0)) |

所有会分页的 Action API 请求都必须原样带回响应里的 `continue` 字段，而不是猜测偏移量；这是 MediaWiki API 的标准分页模式（参见 [API:Allpages](https://www.mediawiki.org/wiki/API:Allpages)）。

接口稳定性应分层理解：

1. MediaWiki 标准 Action API 是主依赖，接口最通用，也已覆盖同步所需的全部能力。
2. REST 搜索是方便的读接口，但搜索结果仍需本地限定 SF6 范围；REST 单页接口受当前服务器对子页面路径的处理限制。
3. Cargo 表能省去解析 wikitext，但 `SF6_FrameData` 等表名、字段和字段内的 wikitext/HTML 都是该站的内部数据模型。同步程序必须允许它变化，不能把它当作 MediaWiki 标准契约。

### 不建议使用的接口或范围

- `Special:Export/Street_Fighter_6` 在实测中被 Cloudflare 拦截，响应是挑战 HTML，不能当作稳定 XML 导出接口。其路径还落在 `robots.txt` 的 `/w/Special:` 禁止范围内。
- 页面 `Street Fighter 6` 的分类属性确实为 `Category:Street Fighter 6`，但对该分类运行 `list=categorymembers` 的首批结果包含明显无关页面。因此不要仅凭分类成员确定 SF6 同步范围；以页面根节点加 `Street Fighter 6/` 标题前缀为准，并在本地维护允许的根页面。([分类属性实测](https://wiki.supercombo.gg/api.php?action=query&titles=Street_Fighter_6&prop=categories&cllimit=max&format=json)，[分类成员实测](https://wiki.supercombo.gg/api.php?action=query&list=categorymembers&cmtitle=Category%3AStreet_Fighter_6&cmnamespace=0&cmlimit=5&format=json))
- 无前缀的 `list=allpages` 同样会列出全站其他游戏与无关页面，不能用于本知识库的范围边界。

## 许可、robots 与访问礼仪

### 可验证的限制

[robots.txt](https://wiki.supercombo.gg/robots.txt) 允许通用爬虫访问（`Allow: /`），但禁止若干命名 AI 爬虫、`/index.php?title=` 和 `/w/Special:`；它还声明 `Content-Signal: search=yes,ai-train=no,use=reference`。文件没有给出 `ai-input` 的值。这里仅转述文件本身，不把它推断为许可证或对所有使用方式的授权。

站点的机器可读许可信息目前为空：REST 页面响应中的 `license.url`、`license.title` 都是空字符串，Action API 的 `meta=siteinfo&siprop=rightsinfo` 也返回空 `url`/`text`。因此本调研**没有确认到可据以再发布或批量镜像内容的许可证**。在将页面内容提交、公开发布，或用于超出本地参考的用途前，应由维护者向 SuperCombo 取得明确许可；本地同步也应保留来源 URL、页面标题、版本号和抓取时间。

- [REST 许可字段实测](https://wiki.supercombo.gg/rest.php/v1/page/Street_Fighter_6)
- [Action API rightsinfo 实测](https://wiki.supercombo.gg/api.php?action=query&meta=siteinfo&siprop=rightsinfo&format=json)

MediaWiki 官方 [API:Etiquette](https://www.mediawiki.org/wiki/API:Etiquette) 建议：使用带联系信息的描述性 User-Agent、请求串行发送、尽可能合并页面、缓存结果；非交互作业加入 `maxlag`，遇到限流使用指数退避。该页明确指出读取请求没有统一的硬速度限制，但站点管理员可以因危及稳定而封禁访问者；SuperCombo 没有在本次可读资料中公布具体的读取限流数值。

## 现成工具的判断

| 方案 | 核查结果 | 取舍 |
| --- | --- | --- |
| `curl` + `jq` + Action API | 本机已有，无需安装；上述索引、搜索、批量正文、修订端点均已实测。 | **首选最小方案。** 请求、缓存和同步状态由仓库脚本显式掌控，也避开为单一站点引入运行时依赖。 |
| Cargo API | SuperCombo 的 `cargoquery` 和 `cargofields` 已实测，`SF6_FrameData` 可直接查询。 | 适合作为帧数等表格数据的加速层；必须保留 Action API 正文路径作为事实来源或降级路径，并监测表结构变化。 |
| [Pywikibot](https://www.mediawiki.org/wiki/Manual:Pywikibot) | MediaWiki 官方文档将其描述为 MediaWiki 自动化的 Python 库及脚本集合，并链接其 [稳定文档](https://doc.wikimedia.org/pywikibot/stable/) 与 [官方源码](https://gerrit.wikimedia.org/g/pywikibot/core)。核查页显示已发布稳定版 11.4.2。 | 值得作为后续选择：当需要可靠 continuation、重试、很多页面批量管理或编辑时再采用。当前只读同步不需要它的站点配置和 Python 依赖，且本次未验证其对本 wiki 的专用配置，故不作为首发实现。 |
| `Special:Export`/网页抓取 | 前者实测被挑战页替代；后者受主题/模板渲染及 Cloudflare 影响。 | 不采用作长期主通道。 |

没有发现需要使用私有 token 的、由 SuperCombo 单独发布的 fetch/search API 或官方 CLI；可用且已实测的是该站公开的 MediaWiki 标准接口。这不是对站点所有隐藏或未来接口的否定，只是本次一手核查的范围。

## 最小可行接入方案

### 首次同步

1. 将根页 `Street Fighter 6` 加入种子列表；用 `allpages` 的 `apprefix=Street Fighter 6/` 枚举子页，直到响应没有 `continue.apcontinue`。存储 `title` 与 `pageid`，并将本地范围限定在这两类标题。
2. 将标题按批传给 Action API 的 `prop=revisions`，保存 `pageid`、`revid`、`timestamp`、`slots.main.content` 和来源 URL；保存原始 wikitext，而不是把带 Cargo/模板的页面 HTML 当稳定数据模型。
3. 初次抓取完成后，将清单与每页最新修订号写入同步状态；不应把 SuperCombo 内容无条件复制到仓库的公开笔记正文，直到许可得到确认。

下面的命令示例只取得一页清单；生产脚本必须读取并回传 `continue`。将 User-Agent 中的维护者 URL 换成真实、可联系的地址。

```sh
base='https://wiki.supercombo.gg'
agent='sf6-up-sync/0.1 (+https://<维护者可联系地址>)'

curl --fail --silent --show-error --location --compressed -A "$agent" --get "$base/api.php" \
  --data-urlencode 'action=query' \
  --data-urlencode 'format=json' \
  --data-urlencode 'formatversion=2' \
  --data-urlencode 'list=allpages' \
  --data-urlencode 'apnamespace=0' \
  --data-urlencode 'apprefix=Street Fighter 6/' \
  --data-urlencode 'aplimit=max' \
  --data-urlencode 'maxlag=5' \
  | jq '{pages: .query.allpages, continue: .continue}'

# titles 的值由清单按批拼接；Action API 可同时返回修订元数据和原始 wikitext。
curl --fail --silent --show-error --location --compressed -A "$agent" --get "$base/api.php" \
  --data-urlencode 'action=query' \
  --data-urlencode 'format=json' \
  --data-urlencode 'formatversion=2' \
  --data-urlencode 'titles=Street Fighter 6|Street Fighter 6/Ryu' \
  --data-urlencode 'prop=revisions' \
  --data-urlencode 'rvprop=ids|timestamp|content' \
  --data-urlencode 'rvslots=main' \
  --data-urlencode 'maxlag=5' \
  | jq '.query.pages[] | {pageid, title, revision: .revisions[0]}'
```

### 增量更新

建议以「重新枚举范围 + 按修订号比较」为正确性路径：重新跑前缀清单以发现新页/删除页，再批量查询当前页面的 `revisions`（每批标题数遵循 API 响应和站点负载），只有 `revid` 改变时才通过同一个 Action API 查询追加 `rvprop=content` 读取正文。这样不依赖站点 `recentchanges` 的保留窗口，也不会遗漏较早的变更。

```sh
# titles 的值由已保存的范围清单按批拼接；每批只读查询最新修订。
curl --fail --silent --show-error --location --compressed -A "$agent" --get "$base/api.php" \
  --data-urlencode 'action=query' \
  --data-urlencode 'format=json' \
  --data-urlencode 'titles=Street Fighter 6|Street Fighter 6/Ryu' \
  --data-urlencode 'prop=info|revisions' \
  --data-urlencode 'rvprop=ids|timestamp' \
  --data-urlencode 'rvlimit=1' \
  --data-urlencode 'maxlag=5'

# 可选的低延迟提示流：结果是全站变更，必须在本地过滤已保存的 SF6 范围；
# 不能替代上面的完整比较。
curl --fail --silent --show-error --location --compressed -A "$agent" --get "$base/api.php" \
  --data-urlencode 'action=query' \
  --data-urlencode 'format=json' \
  --data-urlencode 'list=recentchanges' \
  --data-urlencode 'rcnamespace=0' \
  --data-urlencode 'rcstart=2026-07-25T00:00:00Z' \
  --data-urlencode 'rcdir=newer' \
  --data-urlencode 'rcprop=title|ids|timestamp' \
  --data-urlencode 'rclimit=max' \
  --data-urlencode 'maxlag=5'
```

实现时以串行请求、缓存与退避为默认策略；收到 `maxlag`、HTTP 429 或 API 的 `ratelimited` 错误时暂停并以指数退避重试。将 `recentchanges` 的 `rccontinue` 和 `allpages` 的 `apcontinue` 原样保存，避免漏页或重复页。

## 验证日期与实测命令摘要

验证日期：**2026-07-25**。

本次对公开 URL 使用 `curl -sS -L --max-time 30` 发出以下只读请求（省略了输出文件名）：

```sh
curl 'https://wiki.supercombo.gg/api.php?action=query&meta=siteinfo&siprop=general%7Cextensions%7Cstatistics&format=json'
curl 'https://wiki.supercombo.gg/rest.php/v1/page/Street_Fighter_6'
curl 'https://wiki.supercombo.gg/rest.php/v1/page/Street_Fighter_6%2FRyu'
curl 'https://wiki.supercombo.gg/rest.php/v1/page/Street_Fighter_6/html'
curl 'https://wiki.supercombo.gg/rest.php/v1/search/page?q=Street%20Fighter%206%20Ryu&limit=5'
curl 'https://wiki.supercombo.gg/api.php?action=query&titles=Street_Fighter_6%7CStreet_Fighter_6%2FRyu&prop=revisions&rvprop=ids%7Ctimestamp%7Ccontent&rvslots=main&formatversion=2&format=json'
curl 'https://wiki.supercombo.gg/api.php?action=query&titles=Street_Fighter_6&prop=info%7Crevisions&inprop=url&rvprop=ids%7Ctimestamp%7Cuser%7Ccomment&rvlimit=1&format=json'
curl 'https://wiki.supercombo.gg/api.php?action=query&list=search&srsearch=Ryu&srnamespace=0&srlimit=3&format=json'
curl 'https://wiki.supercombo.gg/api.php?action=query&list=allpages&apnamespace=0&apprefix=Street_Fighter_6%2F&aplimit=10&format=json'
curl 'https://wiki.supercombo.gg/api.php?action=query&list=recentchanges&rcnamespace=0&rclimit=5&rcprop=title%7Cids%7Ctimestamp%7Csizes%7Cflags&format=json'
curl 'https://wiki.supercombo.gg/api.php?action=cargoquery&tables=SF6_FrameData&fields=chara%2Cinput%2Cdamage%2Cstartup%2Cactive%2Crecovery%2ChitAdv%2CblockAdv&where=chara%3D%22Ryu%22&limit=5&format=json'
curl 'https://wiki.supercombo.gg/api.php?action=cargofields&table=SF6_FrameData&format=json'
curl 'https://wiki.supercombo.gg/rest.php/site/v1/sitemap/0'
curl 'https://wiki.supercombo.gg/Special:Export/Street_Fighter_6'
curl 'https://wiki.supercombo.gg/robots.txt'
```

同时通过本机 `smart-search fetch` 读取了 MediaWiki 官方的 [API:Etiquette](https://www.mediawiki.org/wiki/API:Etiquette)、[API:Search](https://www.mediawiki.org/wiki/API:Search)、[API:Allpages](https://www.mediawiki.org/wiki/API:Allpages)、[API:RecentChanges](https://www.mediawiki.org/wiki/API:RecentChanges)、[API:Revisions](https://www.mediawiki.org/wiki/API:Revisions)、[REST API](https://www.mediawiki.org/wiki/API:REST_API)、[Cargo 查询文档](https://www.mediawiki.org/wiki/Extension:Cargo/Querying_data)与 [Manual:Pywikibot](https://www.mediawiki.org/wiki/Manual:Pywikibot)。未使用、记录或输出任何密钥。
