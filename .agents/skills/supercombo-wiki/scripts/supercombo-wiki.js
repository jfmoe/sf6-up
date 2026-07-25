const API_URL = "https://wiki.supercombo.gg/api.php";
const PAGE_ROOT = "Street Fighter 6";
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 20_000;
const RETRY_BASE_DELAY_MS = 250;
const USER_AGENT =
  process.env.SUPERCOMBO_USER_AGENT ??
  "sf6-up-supercombo/0.1 (+https://github.com/jfmoe/sf6-up)";

class CliError extends Error {
  constructor(type, message) {
    super(message);
    this.type = type;
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

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (command === "search") {
    const { query, limit } = parseSearchArgs(args);
    return search(query, limit);
  }
  if (command === "fetch") {
    return fetchPages(parseFetchArgs(args));
  }
  throw new CliError("argument_error", "命令必须是 search 或 fetch");
}

try {
  const output = await main();
  process.stdout.write(`${JSON.stringify(output)}\n`);
} catch (error) {
  const type = error instanceof CliError ? error.type : "network_error";
  const message =
    error instanceof CliError ? error.message : "SuperCombo 请求失败";
  process.stderr.write(
    `${JSON.stringify({ ok: false, error: { type, message } })}\n`,
  );
  process.exitCode = 1;
}
