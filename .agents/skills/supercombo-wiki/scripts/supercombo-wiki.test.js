import { expect, test } from "bun:test";

const cli = new URL("./supercombo-wiki.js", import.meta.url).pathname;
const fixture = new URL("./test-fixture.js", import.meta.url).pathname;

async function runCli(args, responses, extraEnv = {}) {
  const env = {
    ...Bun.env,
    SUPERCOMBO_TEST_RESPONSES: JSON.stringify(responses),
    ...extraEnv,
  };
  delete env.SUPERCOMBO_USER_AGENT;
  if (extraEnv.SUPERCOMBO_USER_AGENT) {
    env.SUPERCOMBO_USER_AGENT = extraEnv.SUPERCOMBO_USER_AGENT;
  }

  const process = Bun.spawn(["bun", "--preload", fixture, cli, ...args], {
    env,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);

  return { exitCode, stdout, stderr };
}

test("search 只返回 SF6 页面并保留摘要与来源", async () => {
  const response = {
    query: {
      search: [
        {
          ns: 0,
          title: "Street Fighter 6/Ryu",
          pageid: 101,
          snippet: 'Ryu 的 <span class="searchmatch">招式</span>资料',
          timestamp: "2026-07-24T12:00:00Z",
        },
        {
          ns: 0,
          title: "Street Fighter V/Ryu",
          pageid: 202,
          snippet: "另一个游戏",
          timestamp: "2026-07-23T12:00:00Z",
        },
      ],
    },
  };

  const result = await runCli(
    ["search", "Ryu"],
    [
      {
        expected: {
          origin: "https://wiki.supercombo.gg",
          pathname: "/api.php",
          method: "GET",
          userAgent:
            "sf6-up-supercombo/0.1 (+https://github.com/jfmoe/sf6-up)",
          params: {
            action: "query",
            list: "search",
            srnamespace: "0",
            srlimit: "20",
          },
        },
        body: response,
      },
    ],
  );

  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe("");
  expect(JSON.parse(result.stdout)).toEqual({
    ok: true,
    command: "search",
    query: "Ryu",
    results: [
      {
        title: "Street Fighter 6/Ryu",
        pageid: 101,
        snippet: "Ryu 的 招式资料",
        updatedAt: "2026-07-24T12:00:00Z",
        url: "https://wiki.supercombo.gg/w/Street_Fighter_6/Ryu",
      },
    ],
  });
});

test("约定环境变量会覆盖 User-Agent 联系方式", async () => {
  const userAgent = "sf6-up-supercombo/0.1 (+mailto:maintainer@example.com)";
  const result = await runCli(
    ["search", "Ryu"],
    [
      {
        expected: { method: "GET", userAgent },
        body: { query: { search: [] } },
      },
    ],
    { SUPERCOMBO_USER_AGENT: userAgent },
  );

  expect(result.exitCode).toBe(0);
});

test("search 对根页生效并严格执行结果上限", async () => {
  const searchResults = [
    {
      ns: 0,
      title: "Street Fighter 6",
      pageid: 1,
      snippet: "root",
      timestamp: "2026-07-25T00:00:00Z",
    },
    {
      ns: 0,
      title: "Street Fighter 6/Ken",
      pageid: 2,
      snippet: "child",
      timestamp: "2026-07-25T00:00:00Z",
    },
  ];
  const result = await runCli(["search", "fighter", "--limit", "1"], [
    { body: { query: { search: searchResults } } },
  ]);

  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout).results).toEqual([
    {
      title: "Street Fighter 6",
      pageid: 1,
      snippet: "root",
      updatedAt: "2026-07-25T00:00:00Z",
      url: "https://wiki.supercombo.gg/w/Street_Fighter_6",
    },
  ]);
});

test("fetch 批量读取根页和多级子页的正文与修订来源", async () => {
  const response = {
    query: {
      pages: [
        {
          pageid: 10,
          ns: 0,
          title: "Street Fighter 6",
          fullurl: "https://wiki.supercombo.gg/w/Street_Fighter_6",
          revisions: [
            {
              revid: 301,
              timestamp: "2026-07-20T08:00:00Z",
              slots: { main: { content: "root wikitext" } },
            },
          ],
        },
        {
          pageid: 11,
          ns: 0,
          title: "Street Fighter 6/A.K.I./Data",
          fullurl:
            "https://wiki.supercombo.gg/w/Street_Fighter_6/A.K.I./Data",
          revisions: [
            {
              revid: 302,
              timestamp: "2026-07-21T09:00:00Z",
              slots: { main: { content: "nested wikitext" } },
            },
          ],
        },
      ],
    },
  };

  const result = await runCli(
    ["fetch", "Street Fighter 6", "Street Fighter 6/A.K.I./Data"],
    [{ body: response }],
  );

  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe("");
  expect(JSON.parse(result.stdout)).toEqual({
    ok: true,
    command: "fetch",
    titles: ["Street Fighter 6", "Street Fighter 6/A.K.I./Data"],
    pages: [
      {
        title: "Street Fighter 6",
        pageid: 10,
        revid: 301,
        updatedAt: "2026-07-20T08:00:00Z",
        url: "https://wiki.supercombo.gg/w/Street_Fighter_6",
        wikitext: "root wikitext",
      },
      {
        title: "Street Fighter 6/A.K.I./Data",
        pageid: 11,
        revid: 302,
        updatedAt: "2026-07-21T09:00:00Z",
        url: "https://wiki.supercombo.gg/w/Street_Fighter_6/A.K.I./Data",
        wikitext: "nested wikitext",
      },
    ],
  });
});

test("fetch 在网络请求前拒绝范围外标题", async () => {
  const result = await runCli(["fetch", "Street Fighter V/Ryu"], []);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  expect(JSON.parse(result.stderr)).toEqual({
    ok: false,
    error: {
      type: "scope_error",
      message:
        '标题必须是 "Street Fighter 6" 根页或其子页面：Street Fighter V/Ryu',
    },
  });
});

test("search 在网络请求前拒绝超过 20 条的结果上限", async () => {
  const result = await runCli(["search", "Ryu", "--limit", "21"], []);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  expect(JSON.parse(result.stderr)).toEqual({
    ok: false,
    error: {
      type: "argument_error",
      message: "--limit 必须是 1 到 20 之间的整数",
    },
  });
});

test("fetch 在网络请求前拒绝超过 20 个标题", async () => {
  const titles = Array.from(
    { length: 21 },
    (_, index) => `Street Fighter 6/Page ${index + 1}`,
  );
  const result = await runCli(["fetch", ...titles], []);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  expect(JSON.parse(result.stderr)).toEqual({
    ok: false,
    error: {
      type: "argument_error",
      message: "fetch 每次最多读取 20 个标题",
    },
  });
});

for (const [name, firstResponse] of [
  ["网络错误", { networkError: "connection reset" }],
  ["HTTP 429", { status: 429, body: {} }],
  ["HTTP 5xx", { status: 503, body: {} }],
  [
    "MediaWiki maxlag",
    { body: { error: { code: "maxlag", info: "Waiting for replicas" } } },
  ],
]) {
  test(`${name} 会重试并在后续请求成功时返回结果`, async () => {
    const result = await runCli(["search", "Ryu"], [
      firstResponse,
      { body: { query: { search: [] } } },
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      command: "search",
      query: "Ryu",
      results: [],
    });
  });
}

for (const [name, failure, error] of [
  [
    "网络错误",
    { networkError: "connection reset" },
    { type: "network_error", message: "无法连接 SuperCombo" },
  ],
  [
    "HTTP 429",
    { status: 429, body: {} },
    { type: "http_error", message: "SuperCombo 返回 HTTP 429" },
  ],
  [
    "HTTP 5xx",
    { status: 503, body: {} },
    { type: "http_error", message: "SuperCombo 返回 HTTP 503" },
  ],
  [
    "MediaWiki maxlag",
    { body: { error: { code: "maxlag", info: "Waiting for replicas" } } },
    {
      type: "api_error",
      message: "SuperCombo API 错误 maxlag：Waiting for replicas",
    },
  ],
]) {
  test(`${name} 最多尝试三次`, async () => {
    const result = await runCli(["search", "Ryu"], [
      failure,
      failure,
      failure,
      { body: { query: { search: [] } } },
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error,
    });
  });
}

test("确定性 API 错误不重试", async () => {
  const result = await runCli(["search", "Ryu"], [
    {
      body: {
        error: { code: "badvalue", info: "Unrecognized value for parameter" },
      },
    },
    { body: { query: { search: [] } } },
  ]);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  expect(JSON.parse(result.stderr)).toEqual({
    ok: false,
    error: {
      type: "api_error",
      message:
        "SuperCombo API 错误 badvalue：Unrecognized value for parameter",
    },
  });
});

test("异常搜索响应返回稳定错误且不重试", async () => {
  const result = await runCli(["search", "Ryu"], [
    { body: { query: { search: [{ ns: 0 }] } } },
    { body: { query: { search: [] } } },
  ]);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  expect(JSON.parse(result.stderr)).toEqual({
    ok: false,
    error: {
      type: "response_error",
      message: "SuperCombo 搜索响应结构无效",
    },
  });
});
