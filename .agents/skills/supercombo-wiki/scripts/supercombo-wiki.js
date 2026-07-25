const API_URL = "https://wiki.supercombo.gg/api.php";
const PAGE_ROOT = "Street Fighter 6";
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 20_000;
const RETRY_BASE_DELAY_MS = 250;
const FRAME_DATA_LIMIT = 200;
const FRAME_DATA_SCHEMA = [
  {
    output: "sourcePage",
    cargo: "sourcePage",
    query: "SF6_FrameData._pageName=sourcePage",
  },
  {
    output: "sourcePageId",
    cargo: "sourcePageId",
    query: "SF6_FrameData._pageID=sourcePageId",
  },
  { output: "moveId", cargo: "moveId", query: "moveId" },
  { output: "moveType", cargo: "moveType", query: "moveType" },
  { output: "character", cargo: "chara", query: "chara" },
  { output: "input", cargo: "input", query: "input" },
  { output: "name", cargo: "name", query: "name" },
  { output: "damage", cargo: "damage", query: "damage" },
  { output: "startup", cargo: "startup", query: "startup" },
  { output: "active", cargo: "active", query: "active" },
  { output: "recovery", cargo: "recovery", query: "recovery" },
  { output: "total", cargo: "total", query: "total" },
  { output: "guard", cargo: "guard", query: "guard" },
  { output: "cancel", cargo: "cancel", query: "cancel" },
  { output: "hitconfirm", cargo: "hitconfirm", query: "hitconfirm" },
  { output: "hitAdv", cargo: "hitAdv", query: "hitAdv" },
  { output: "blockAdv", cargo: "blockAdv", query: "blockAdv" },
  { output: "punishAdv", cargo: "punishAdv", query: "punishAdv" },
];
const USER_AGENT =
  process.env.SUPERCOMBO_USER_AGENT ??
  "sf6-up-supercombo/0.1 (+https://github.com/jfmoe/sf6-up)";

class CliError extends Error {
  constructor(type, message, details = {}) {
    super(message);
    this.type = type;
    Object.assign(this, details);
  }
}

function isSf6Title(title) {
  return title === PAGE_ROOT || title.startsWith(`${PAGE_ROOT}/`);
}

function pageUrl(title) {
  const path = title
    .split("/")
    .map((segment) => encodeURIComponent(segment.replaceAll(" ", "_")))
    .join("/");
  return `https://wiki.supercombo.gg/w/${path}`;
}

function plainText(snippet) {
  return snippet.replace(/<[^>]*>/g, "");
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestJson(url) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      if (attempt === MAX_ATTEMPTS) {
        throw new CliError("network_error", "无法连接 SuperCombo");
      }
      await delay(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      continue;
    }

    if (response.status === 429 || response.status >= 500) {
      if (attempt === MAX_ATTEMPTS) {
        throw new CliError(
          "http_error",
          `SuperCombo 返回 HTTP ${response.status}`,
        );
      }
      await delay(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      continue;
    }

    if (!response.ok) {
      throw new CliError(
        "http_error",
        `SuperCombo 返回 HTTP ${response.status}`,
      );
    }

    let body;
    try {
      body = await response.json();
    } catch {
      throw new CliError("response_error", "SuperCombo 返回了无效 JSON");
    }

    if (body.error) {
      if (body.error.code === "maxlag" && attempt < MAX_ATTEMPTS) {
        await delay(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
        continue;
      }
      throw new CliError(
        "api_error",
        `SuperCombo API 错误 ${body.error.code ?? "unknown"}：${
          body.error.info ?? "未知错误"
        }`,
      );
    }

    return body;
  }
}

async function search(query, limit) {
  const url = new URL(API_URL);
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    list: "search",
    srsearch: query,
    srnamespace: "0",
    srlimit: "20",
    srprop: "snippet|timestamp",
    maxlag: "5",
  });

  const body = await requestJson(url);
  if (!Array.isArray(body.query?.search)) {
    throw new CliError("response_error", "SuperCombo 搜索响应结构无效");
  }

  const results = body.query.search
    .map((result) => {
      if (
        result.ns !== 0 ||
        typeof result.title !== "string" ||
        !Number.isInteger(result.pageid) ||
        typeof result.snippet !== "string" ||
        typeof result.timestamp !== "string"
      ) {
        throw new CliError("response_error", "SuperCombo 搜索响应结构无效");
      }
      return {
        title: result.title,
        pageid: result.pageid,
        snippet: plainText(result.snippet),
        updatedAt: result.timestamp,
        url: pageUrl(result.title),
      };
    })
    .filter((result) => isSf6Title(result.title))
    .slice(0, limit);

  return { ok: true, command: "search", query, results };
}

async function fetchPages(titles) {
  const url = new URL(API_URL);
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    titles: titles.join("|"),
    prop: "info|revisions",
    inprop: "url",
    rvprop: "ids|timestamp|content",
    rvslots: "main",
    rvlimit: "1",
    maxlag: "5",
  });

  const body = await requestJson(url);
  if (!Array.isArray(body.query?.pages)) {
    throw new CliError("response_error", "SuperCombo 正文响应结构无效");
  }

  const pages = body.query.pages.map((page) => {
    const revision = page.revisions?.[0];
    if (
      page.ns !== 0 ||
      !isSf6Title(page.title) ||
      !Number.isInteger(page.pageid) ||
      !Number.isInteger(revision?.revid) ||
      typeof revision.timestamp !== "string" ||
      typeof revision.slots?.main?.content !== "string"
    ) {
      throw new CliError("response_error", "SuperCombo 正文响应结构无效");
    }
    return {
      title: page.title,
      pageid: page.pageid,
      revid: revision.revid,
      updatedAt: revision.timestamp,
      url: pageUrl(page.title),
      wikitext: revision.slots.main.content,
    };
  });

  return { ok: true, command: "fetch", titles, pages };
}

async function fetchPageSources(titles) {
  if (titles.length === 0) {
    return [];
  }

  const url = new URL(API_URL);
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    titles: titles.join("|"),
    prop: "info|revisions",
    inprop: "url",
    rvprop: "ids|timestamp",
    rvlimit: "1",
    maxlag: "5",
  });

  const body = await requestJson(url);
  if (!Array.isArray(body.query?.pages)) {
    throw new CliError("response_error", "SuperCombo 来源响应结构无效");
  }

  return body.query.pages.map((page) => {
    const revision = page.revisions?.[0];
    if (
      page.ns !== 0 ||
      !isSf6Title(page.title) ||
      !Number.isInteger(page.pageid) ||
      !Number.isInteger(revision?.revid) ||
      typeof revision.timestamp !== "string"
    ) {
      throw new CliError("response_error", "SuperCombo 来源响应结构无效");
    }
    return {
      title: page.title,
      pageid: page.pageid,
      revid: revision.revid,
      updatedAt: revision.timestamp,
      url: pageUrl(page.title),
    };
  });
}

function cargoString(value) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function cargoUnavailable(character, reason) {
  return new CliError(
    "cargo_unavailable",
    `SuperCombo 结构化帧数查询不可用：${reason}`,
    {
      fallback: {
        command: "search",
        query: `${character} Data`,
        select: {
          titlePrefix: `${PAGE_ROOT}/`,
          titleSuffix: "/Data",
          character,
        },
        then: "fetch",
        notice:
          "结构化查询不可用；请读取对应 SF6 页面的 Wiki 原始 wikitext",
      },
    },
  );
}

async function frameData({ character, moveType, input, limit }) {
  const conditions = [`chara=${cargoString(character)}`];
  if (moveType !== null) {
    conditions.push(`moveType=${cargoString(moveType)}`);
  }
  if (input !== null) {
    conditions.push(`input=${cargoString(input)}`);
  }

  const url = new URL(API_URL);
  url.search = new URLSearchParams({
    action: "cargoquery",
    format: "json",
    tables: "SF6_FrameData",
    fields: FRAME_DATA_SCHEMA.map((field) => field.query).join(","),
    where: conditions.join(" AND "),
    limit: String(limit),
  });

  let rows;
  try {
    const body = await requestJson(url);
    if (
      !Array.isArray(body.cargoquery) ||
      body.cargoquery.length > limit
    ) {
      throw new CliError("response_error", "SuperCombo 帧数响应结构无效");
    }
    rows = body.cargoquery.map((result) => {
      const row = result?.title;
      if (
        !row ||
        FRAME_DATA_SCHEMA.some(
          (field) => typeof row[field.cargo] !== "string",
        ) ||
        !isSf6Title(row.sourcePage) ||
        !/^\d+$/.test(row.sourcePageId) ||
        row.chara !== character
      ) {
        throw new CliError("response_error", "SuperCombo 帧数响应结构无效");
      }
      const output = Object.fromEntries(
        FRAME_DATA_SCHEMA.map((field) => [
          field.output,
          row[field.cargo],
        ]),
      );
      output.sourcePageId = Number(output.sourcePageId);
      return output;
    });
  } catch (error) {
    const reason =
      error instanceof CliError ? error.message : "SuperCombo 请求失败";
    throw cargoUnavailable(character, reason);
  }

  const sourceTitles = [...new Set(rows.map((row) => row.sourcePage))];
  const sources = await fetchPageSources(sourceTitles);
  const sourceByTitle = new Map(
    sources.map((source) => [source.title, source]),
  );
  if (
    sources.length !== sourceTitles.length ||
    rows.some(
      (row) =>
        sourceByTitle.get(row.sourcePage)?.pageid !== row.sourcePageId,
    )
  ) {
    throw cargoUnavailable(
      character,
      "SuperCombo 帧数来源与页面版本不一致",
    );
  }
  return {
    ok: true,
    command: "frame-data",
    character,
    filters: { moveType, input },
    limit,
    fields: FRAME_DATA_SCHEMA.map((field) => field.output),
    sources,
    rows,
  };
}

function parseSearchArgs(args) {
  const queryParts = [];
  let limit = 10;

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--limit") {
      const value = args[index + 1];
      if (!/^\d+$/.test(value ?? "")) {
        throw new CliError(
          "argument_error",
          "--limit 必须是 1 到 20 之间的整数",
        );
      }
      limit = Number(value);
      index += 1;
    } else if (args[index].startsWith("--")) {
      throw new CliError("argument_error", `未知参数：${args[index]}`);
    } else {
      queryParts.push(args[index]);
    }
  }

  if (limit < 1 || limit > 20) {
    throw new CliError(
      "argument_error",
      "--limit 必须是 1 到 20 之间的整数",
    );
  }

  const query = queryParts.join(" ").trim();
  if (!query) {
    throw new CliError("argument_error", "search 需要搜索词");
  }

  return { query, limit };
}

function parseFetchArgs(args) {
  if (args.length === 0) {
    throw new CliError("argument_error", "fetch 至少需要一个标题");
  }
  if (args.length > 20) {
    throw new CliError("argument_error", "fetch 每次最多读取 20 个标题");
  }

  return args.map((input) => {
    const title = input.replaceAll("_", " ").trim();
    if (!isSf6Title(title)) {
      throw new CliError(
        "scope_error",
        `标题必须是 "${PAGE_ROOT}" 根页或其子页面：${input}`,
      );
    }
    return title;
  });
}

function parseFrameDataArgs(args) {
  let character = null;
  let moveType = null;
  let input = null;
  let limit = FRAME_DATA_LIMIT;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (
      argument === "--move-type" ||
      argument === "--input" ||
      argument === "--limit"
    ) {
      const value = args[index + 1];
      if (!value?.trim()) {
        throw new CliError("argument_error", `${argument} 需要一个值`);
      }
      if (argument === "--move-type") {
        moveType = value.trim();
      } else if (argument === "--input") {
        input = value.trim();
      } else {
        if (!/^\d+$/.test(value)) {
          throw new CliError(
            "argument_error",
            "--limit 必须是 1 到 200 之间的整数",
          );
        }
        limit = Number(value);
      }
      index += 1;
    } else if (argument.startsWith("--")) {
      throw new CliError("argument_error", `未知参数：${argument}`);
    } else if (character === null) {
      character = argument.trim();
    } else {
      throw new CliError("argument_error", "frame-data 只接受一个角色名");
    }
  }

  if (!character) {
    throw new CliError("argument_error", "frame-data 需要角色名");
  }
  if (limit < 1 || limit > FRAME_DATA_LIMIT) {
    throw new CliError(
      "argument_error",
      "--limit 必须是 1 到 200 之间的整数",
    );
  }
  return { character, moveType, input, limit };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (command === "search") {
    const { query, limit } = parseSearchArgs(args);
    return search(query, limit);
  }
  if (command === "fetch") {
    return fetchPages(parseFetchArgs(args));
  }
  if (command === "frame-data") {
    return frameData(parseFrameDataArgs(args));
  }
  throw new CliError(
    "argument_error",
    "命令必须是 search、fetch 或 frame-data",
  );
}

try {
  const output = await main();
  process.stdout.write(`${JSON.stringify(output)}\n`);
} catch (error) {
  const type = error instanceof CliError ? error.type : "network_error";
  const message =
    error instanceof CliError ? error.message : "SuperCombo 请求失败";
  const fallback =
    error instanceof CliError && error.fallback
      ? { fallback: error.fallback }
      : {};
  process.stderr.write(
    `${JSON.stringify({ ok: false, error: { type, message, ...fallback } })}\n`,
  );
  process.exitCode = 1;
}
