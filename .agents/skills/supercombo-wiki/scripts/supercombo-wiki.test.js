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

function cargoFrameRow(overrides = {}) {
  return {
    sourcePage: "Street Fighter 6/Ryu/Data",
    sourcePageId: "65938",
    moveId: "ryu_236hp",
    moveType: "Special",
    chara: "Ryu",
    input: "236HP",
    name: "Hadoken",
    damage: "600",
    startup: "12",
    active: "-",
    recovery: "30",
    total: "41",
    guard: "All",
    cancel: "SA3",
    hitconfirm: "20",
    hitAdv: "-1",
    blockAdv: "-5",
    punishAdv: "0",
    ...overrides,
  };
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

test("frame-data 返回预定义帧数字段与源页版本", async () => {
  const result = await runCli(
    ["frame-data", "Ryu"],
    [
      {
        expected: {
          origin: "https://wiki.supercombo.gg",
          pathname: "/api.php",
          method: "GET",
          params: {
            action: "cargoquery",
            tables: "SF6_FrameData",
            fields:
              "SF6_FrameData._pageName=sourcePage,SF6_FrameData._pageID=sourcePageId,moveId,moveType,chara,input,name,damage,startup,active,recovery,total,guard,cancel,hitconfirm,hitAdv,blockAdv,punishAdv",
            where: 'chara="Ryu"',
            limit: "200",
          },
        },
        body: {
          cargoquery: [
            {
              title: cargoFrameRow(),
            },
          ],
        },
      },
      {
        expected: {
          method: "GET",
          params: {
            action: "query",
            titles: "Street Fighter 6/Ryu/Data",
            prop: "info|revisions",
            rvprop: "ids|timestamp",
          },
        },
        body: {
          query: {
            pages: [
              {
                pageid: 65938,
                ns: 0,
                title: "Street Fighter 6/Ryu/Data",
                revisions: [
                  {
                    revid: 365753,
                    timestamp: "2026-06-06T23:55:38Z",
                  },
                ],
              },
            ],
          },
        },
      },
    ],
  );

  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe("");
  expect(JSON.parse(result.stdout)).toEqual({
    ok: true,
    command: "frame-data",
    character: "Ryu",
    filters: { moveType: null, input: null },
    limit: 200,
    fields: [
      "sourcePage",
      "sourcePageId",
      "moveId",
      "moveType",
      "character",
      "input",
      "name",
      "damage",
      "startup",
      "active",
      "recovery",
      "total",
      "guard",
      "cancel",
      "hitconfirm",
      "hitAdv",
      "blockAdv",
      "punishAdv",
    ],
    sources: [
      {
        title: "Street Fighter 6/Ryu/Data",
        pageid: 65938,
        revid: 365753,
        updatedAt: "2026-06-06T23:55:38Z",
        url: "https://wiki.supercombo.gg/w/Street_Fighter_6/Ryu/Data",
      },
    ],
    rows: [
      {
        sourcePage: "Street Fighter 6/Ryu/Data",
        sourcePageId: 65938,
        moveId: "ryu_236hp",
        moveType: "Special",
        character: "Ryu",
        input: "236HP",
        name: "Hadoken",
        damage: "600",
        startup: "12",
        active: "-",
        recovery: "30",
        total: "41",
        guard: "All",
        cancel: "SA3",
        hitconfirm: "20",
        hitAdv: "-1",
        blockAdv: "-5",
        punishAdv: "0",
      },
    ],
  });
});

test("frame-data 拒绝与 Cargo 源页不一致的页面版本", async () => {
  const result = await runCli(
    ["frame-data", "Ryu", "--limit", "1"],
    [
      {
        body: {
          cargoquery: [{ title: cargoFrameRow() }],
        },
      },
      {
        body: {
          query: {
            pages: [
              {
                pageid: 1,
                ns: 0,
                title: "Street Fighter 6/Ryu/Data",
                revisions: [
                  {
                    revid: 365753,
                    timestamp: "2026-06-06T23:55:38Z",
                  },
                ],
              },
            ],
          },
        },
      },
    ],
  );

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  expect(JSON.parse(result.stderr)).toMatchObject({
    ok: false,
    error: {
      type: "cargo_unavailable",
      message:
        "SuperCombo 结构化帧数查询不可用：SuperCombo 帧数来源与页面版本不一致",
      fallback: {
        command: "search",
        query: "Ryu Data",
        then: "fetch",
      },
    },
  });
});

test("frame-data 只用固定条件应用招式类型、指令和行数筛选", async () => {
  const result = await runCli(
    [
      "frame-data",
      'A.K.I."',
      "--move-type",
      "ground_normal",
      "--input",
      '5"HP',
      "--limit",
      "1",
    ],
    [
      {
        expected: {
          params: {
            action: "cargoquery",
            tables: "SF6_FrameData",
            where:
              'chara="A.K.I.\\"" AND moveType="ground_normal" AND input="5\\"HP"',
            limit: "1",
          },
        },
        body: { cargoquery: [] },
      },
    ],
  );

  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe("");
  expect(JSON.parse(result.stdout)).toMatchObject({
    ok: true,
    command: "frame-data",
    character: 'A.K.I."',
    filters: { moveType: "ground_normal", input: '5"HP' },
    limit: 1,
    sources: [],
    rows: [],
  });
});

test("frame-data 在 Cargo 结构异常时返回可执行的降级信号", async () => {
  const result = await runCli(["frame-data", "Ryu"], [
    {
      body: {
        cargoquery: [
          {
            title: {
              sourcePage: "Street Fighter 6/Ryu/Data",
              sourcePageId: "65938",
              moveId: "ryu_236hp",
            },
          },
        ],
      },
    },
  ]);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  const output = JSON.parse(result.stderr);
  expect(output).toEqual({
    ok: false,
    error: {
      type: "cargo_unavailable",
      message:
        "SuperCombo 结构化帧数查询不可用：SuperCombo 帧数响应结构无效",
      fallback: {
        command: "search",
        query: "Ryu Data",
        select: {
          titlePrefix: "Street Fighter 6/",
          titleSuffix: "/Data",
          character: "Ryu",
        },
        then: "fetch",
        notice: "结构化查询不可用；请读取对应 SF6 页面的 Wiki 原始 wikitext",
      },
    },
  });

  const fallback = output.error.fallback;
  const searchResult = await runCli(
    [fallback.command, fallback.query],
    [
      {
        body: {
          query: {
            search: [
              {
                ns: 0,
                title: "Street Fighter 6/Ryu/Data",
                pageid: 65938,
                snippet: "Ryu frame data",
                timestamp: "2026-06-06T23:55:38Z",
              },
              {
                ns: 0,
                title: "Street Fighter 6/Ryu",
                pageid: 56282,
                snippet: "Ryu overview",
                timestamp: "2026-06-05T12:00:00Z",
              },
            ],
          },
        },
      },
    ],
  );
  expect(searchResult.exitCode).toBe(0);

  const candidate = JSON.parse(searchResult.stdout).results.find(
    (page) =>
      page.title.startsWith(fallback.select.titlePrefix) &&
      page.title.endsWith(fallback.select.titleSuffix) &&
      page.title.includes(`/${fallback.select.character}/`),
  );
  expect(candidate.title).toBe("Street Fighter 6/Ryu/Data");

  const fetchResult = await runCli(
    [fallback.then, candidate.title],
    [
      {
        body: {
          query: {
            pages: [
              {
                pageid: 65938,
                ns: 0,
                title: "Street Fighter 6/Ryu/Data",
                revisions: [
                  {
                    revid: 365753,
                    timestamp: "2026-06-06T23:55:38Z",
                    slots: { main: { content: "Ryu frame data wikitext" } },
                  },
                ],
              },
            ],
          },
        },
      },
    ],
  );
  expect(fetchResult.exitCode).toBe(0);
  expect(JSON.parse(fetchResult.stdout).pages[0]).toMatchObject({
    title: "Street Fighter 6/Ryu/Data",
    revid: 365753,
    updatedAt: "2026-06-06T23:55:38Z",
    wikitext: "Ryu frame data wikitext",
  });
});

test("frame-data 在 Cargo 请求失败时返回同一降级信号", async () => {
  const result = await runCli(["frame-data", "Ryu"], [
    {
      body: {
        error: {
          code: "internal_api_error",
          info: "Cargo query failed",
        },
      },
    },
  ]);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  expect(JSON.parse(result.stderr)).toMatchObject({
    ok: false,
    error: {
      type: "cargo_unavailable",
      fallback: {
        command: "search",
        query: "Ryu Data",
        then: "fetch",
      },
    },
  });
});

test("frame-data 在请求前拒绝越界行数和通用查询参数", async () => {
  for (const [args, message] of [
    [
      ["frame-data", "Ryu", "--limit", "201"],
      "--limit 必须是 1 到 200 之间的整数",
    ],
    [
      ["frame-data", "Ryu", "--where", "1=1"],
      "未知参数：--where",
    ],
    [["frame-data"], "frame-data 需要角色名"],
  ]) {
    const result = await runCli(args, []);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: { type: "argument_error", message },
    });
  }
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
