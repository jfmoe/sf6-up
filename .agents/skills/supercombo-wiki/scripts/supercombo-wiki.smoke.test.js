import { expect, test } from "bun:test";

const smokeTest = process.env.SUPERCOMBO_SMOKE === "1" ? test : test.skip;
const cli = new URL("./supercombo-wiki.js", import.meta.url).pathname;

async function runCli(args) {
  const process = Bun.spawn(["bun", cli, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  return JSON.parse(stdout);
}

smokeTest("真实 SuperCombo search 返回限定在 SF6 的稳定结构", async () => {
  const output = await runCli([
    "search",
    "Street Fighter 6 Ryu",
    "--limit",
    "3",
  ]);

  expect(output.ok).toBe(true);
  expect(output.command).toBe("search");
  expect(Array.isArray(output.results)).toBe(true);
  for (const result of output.results) {
    expect(
      result.title === "Street Fighter 6" ||
        result.title.startsWith("Street Fighter 6/"),
    ).toBe(true);
    expect(typeof result.url).toBe("string");
  }
});

smokeTest("真实 SuperCombo fetch 返回正文与修订来源", async () => {
  const output = await runCli(["fetch", "Street Fighter 6"]);

  expect(output.ok).toBe(true);
  expect(output.command).toBe("fetch");
  expect(output.pages).toHaveLength(1);
  expect(typeof output.pages[0].pageid).toBe("number");
  expect(typeof output.pages[0].revid).toBe("number");
  expect(typeof output.pages[0].updatedAt).toBe("string");
  expect(typeof output.pages[0].url).toBe("string");
  expect(typeof output.pages[0].wikitext).toBe("string");
});

smokeTest("真实 SuperCombo frame-data 返回帧数与源页版本", async () => {
  const output = await runCli(["frame-data", "Ryu", "--limit", "1"]);

  expect(output.ok).toBe(true);
  expect(output.command).toBe("frame-data");
  expect(output.character).toBe("Ryu");
  expect(Array.isArray(output.fields)).toBe(true);
  expect(Array.isArray(output.rows)).toBe(true);
  expect(output.rows.length).toBeGreaterThan(0);
  expect(output.rows.length).toBeLessThanOrEqual(1);
  expect(Array.isArray(output.sources)).toBe(true);
  expect(output.sources.length).toBeGreaterThan(0);
  for (const field of output.fields) {
    expect(field in output.rows[0]).toBe(true);
  }
  for (const source of output.sources) {
    expect(typeof source.pageid).toBe("number");
    expect(typeof source.revid).toBe("number");
    expect(typeof source.updatedAt).toBe("string");
    expect(typeof source.url).toBe("string");
  }
});
