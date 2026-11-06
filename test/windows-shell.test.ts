import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { startFakeOpencode } from "./fake-opencode.js";
import { callText, startServer, tempRepo } from "./harness.js";

test.skipIf(process.platform !== "win32")("an MCP environment without ComSpec can verify an npm script", async () => {
  const repo = tempRepo();
  const fake = await startFakeOpencode();
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  try {
    writeFileSync(join(repo.dir, "package.json"), JSON.stringify({ private: true, scripts: { proof: 'node -e "process.exit(0)"' } }));
    fake.script({ edit: "hello.txt", content: "hello\n" }, { finish: { summary: "wrote hello", risks: [], review: [], missing: [] } });
    server = await startServer({ cwd: repo.dir, env: { CHEAPAG_OPENCODE_URL: fake.url, ComSpec: "" }, logins: { "opencode-go": "dummy" }, allow: [] });
    expect(await callText(server.client, "delegate", { task: "Add hello.txt", files: "hello.txt", kind: "feature", done_when: "`npm run proof`" })).toMatch(/^OK /);
  } finally { await server?.close(); await fake.close(); repo.cleanup(); }
}, 20_000);
