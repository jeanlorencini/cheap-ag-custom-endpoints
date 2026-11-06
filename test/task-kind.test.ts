import { expect, test } from "vitest";
import { startFakeOpencode } from "./fake-opencode.js";
import { callText, startServer, tempRepo } from "./harness.js";

async function scenario(kind: "feature" | "fix") {
  const repo = tempRepo();
  const fake = await startFakeOpencode();
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  try {
    fake.script(
      ...Array.from({ length: 13 }, () => ({ tool: "read" } as const)),
      { wait: 1000 },
      { edit: "hello.txt", content: "hello\n" },
      { finish: { summary: "added hello", risks: [], missing: [], review: [] } },
    );
    server = await startServer({ cwd: repo.dir, env: { CHEAPAG_OPENCODE_URL: fake.url }, logins: { "opencode-go": "dummy" }, allow: [] });
    return await callText(server.client, "delegate", {
      task: "Add a feature that formats error text in hello.txt",
      files: "hello.txt", done_when: "`test -f hello.txt`", kind,
    });
  } finally { await server?.close(); await fake.close(); repo.cleanup(); }
}

test("a feature mentioning error text is not stopped by the fix reproduction deadline", async () => {
  expect(await scenario("feature")).toMatch(/^OK /);
}, 20_000);

test("an explicit fix still must provide a reproduction test before its deadline", async () => {
  const result = await scenario("fix");
  expect(result).toMatch(/^FAIL /);
  expect(result).toContain("no reproduction test by turn 12");
}, 20_000);
