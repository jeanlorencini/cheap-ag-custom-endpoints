import { beforeEach, expect, test, vi } from "vitest";
import { openSession } from "../src/worker.js";

const fake = vi.hoisted(() => ({ runs: [] as unknown[][] }));
vi.mock("@opencode-ai/sdk/v2", () => ({
  createOpencodeClient: () => ({
    session: {
      create: async () => ({ data: { id: "ses_test" } }),
      promptAsync: async () => ({}),
    },
    event: {
      subscribe: async () => ({ stream: (async function* () {
        yield { type: "server.connected", properties: {} };
        for (const event of fake.runs.shift() ?? []) yield event;
        yield { type: "session.idle", properties: { sessionID: "ses_test" } };
      })() }),
    },
  }),
}));

beforeEach(() => { fake.runs = []; });
const model = { providerID: "custom-test", id: "model" };
const session = () => openSession({ opencode: { url: "http://localhost:1", password: "dummy", version: "1.19.0" }, directory: ".", model, onEvent: () => {} });
const message = (id: string, cost?: number, input = 0, output = 0, extra = {}) => ({
  type: "message.updated",
  properties: { sessionID: "ses_test", info: {
    id, role: "assistant", providerID: model.providerID, modelID: model.id,
    ...(cost !== undefined && { cost }), tokens: { input, output, reasoning: 3, cache: { read: 4, write: 5 } }, ...extra,
  } },
});
const tool = (callID: string) => ({ type: "message.part.updated", properties: {
  sessionID: "ses_test", part: { type: "tool", callID, tool: "read", state: { status: "completed", input: {} } },
} });

test("repeated assistant snapshots replace usage, while tool calls and model messages count separately across prompts", async () => {
  const worker = await session();
  const latest = message("a", 0.003, 30, 20);
  fake.runs.push([message("a", 0, 0), message("a", 0.002, 20, 10), latest, latest, tool("one"), tool("one"), tool("two")]);
  await worker.run("first");
  expect(worker.totals()).toMatchObject({ turns: 2, modelMessages: 1, usage: {
    inputTokens: 30, outputTokens: 20, reasoningTokens: 3, cacheRead: 4, cacheWrite: 5, costUsd: 0.003, costSource: "provider-reported",
  } });
  fake.runs.push([latest, message("b", 0.001, 10, 5), tool("two")]);
  await worker.run("second");
  expect(worker.totals()).toMatchObject({ turns: 2, modelMessages: 2, usage: {
    inputTokens: 40, outputTokens: 25, reasoningTokens: 6, cacheRead: 8, cacheWrite: 10, costUsd: 0.004, costSource: "provider-reported",
  }, spend: { "custom-test/model": 0.004 } });
});

test.each([0, undefined])("custom zero or absent cost (%s) is unknown, not free", async (cost) => {
  const worker = await session();
  fake.runs.push([message("a", cost, 12, 7)]);
  await worker.run("first");
  expect(worker.totals()).toMatchObject({ turns: 0, modelMessages: 1, usage: { inputTokens: 12, outputTokens: 7, costUsd: 0, costSource: "unknown" } });
});

test("absent usage and mixed unknown costs keep numeric reported spend without claiming a complete price", async () => {
  const worker = await session();
  fake.runs.push([message("a", undefined, 0, 0, { tokens: undefined }), message("b", 0.02, 15, 8)]);
  await worker.run("first");
  expect(worker.totals()).toMatchObject({ modelMessages: 2, usage: { inputTokens: 15, outputTokens: 8, costUsd: 0.02, costSource: "unknown" } });
});

test("structured cause diagnostics retain safe connection details without copying secret-bearing fields", async () => {
  const worker = await session();
  const error = { name: "APIError", data: { message: "request failed" }, cause: {
    name: "TypeError", code: "ECONNREFUSED", statusCode: 503,
    message: "secret cause", url: "https://secret", headers: { authorization: "secret" }, body: "secret",
    cause: { name: "secret name", code: "secret code", message: "secret nested cause" },
  } };
  fake.runs.push([message("a", undefined, 0, 0, { error })]);
  const result = await worker.run("first");
  expect(result.error).toBe("request failed (code=ECONNREFUSED, status=503, name=TypeError)");
  expect(result.error).not.toContain("secret");
});
