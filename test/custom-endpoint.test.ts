import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { checkLocalEndpoint, customEndpoint, customProviderConfig, customProviderId, normalizeEndpoint, saveCustomEndpoint, validateCustomEndpoint } from "../src/custom-endpoint.js";
import { detectProvider, redact, savedProviders } from "../src/credentials.js";
import { consentGate, writeConsent } from "../src/consent.js";
import { fullRoute, modelName, routeModels } from "../src/routing.js";
import { ensureOpencode, stopOpencode } from "../src/opencode.js";
import { runSession } from "../src/worker.js";
import { startFakeOpencode } from "./fake-opencode.js";
import { callText, homeEnv, startServer, tempRepo } from "./harness.js";

const ENDPOINT = { baseURL: "https://api.example.com/v1", model: "example-model" };
const TEST_CREDENTIAL = "dummy-custom-credential";
let home: string;

function storeLogin(endpoint = ENDPOINT, key = TEST_CREDENTIAL, extra: Record<string, unknown> = {}) {
  const dir = join(home, "data", "opencode");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "auth.json"), JSON.stringify({ ...extra, [customProviderId(endpoint)]: { type: "api", key } }));
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "cheapag-custom-test-"));
  for (const [name, value] of Object.entries(homeEnv(home))) {
    if (name.startsWith("XDG_")) vi.stubEnv(name, value);
  }
  vi.stubEnv("CHEAPAG_OPENCODE_URL", "");
  vi.stubEnv("OPENCODE_CONFIG_CONTENT", "");
  saveCustomEndpoint(ENDPOINT);
});

afterEach(() => {
  stopOpencode(true);
  vi.unstubAllEnvs();
  rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

test("normalizes endpoint identity and rejects URLs which can leak credentials", () => {
  expect(normalizeEndpoint(" https://API.EXAMPLE.COM:443/v1/// ")).toBe(ENDPOINT.baseURL);
  expect(normalizeEndpoint("http://127.0.0.1:8000/v1")).toBe("http://127.0.0.1:8000/v1");
  expect(normalizeEndpoint("http://localhost:8000/v1")).toBe("http://localhost:8000/v1");
  expect(normalizeEndpoint("http://[::1]:8000/v1")).toBe("http://[::1]:8000/v1");
  for (const url of ["", "not a URL", "file:///tmp/model", "http://api.example.com/v1", "http://localhost.example.com/v1", "https://user:password@api.example.com/v1", "https://api.example.com/v1?key=dummy", "https://api.example.com/v1#key", "https://api.example.com/v1?"]) {
    expect(() => normalizeEndpoint(url)).toThrow();
  }
  expect(() => validateCustomEndpoint(ENDPOINT.baseURL, " ")).toThrow();
  expect(() => validateCustomEndpoint(ENDPOINT.baseURL, "bad model")).toThrow();
  expect(validateCustomEndpoint(ENDPOINT.baseURL, "vendor/model").model).toBe("vendor/model");
});

test("saved settings contain no key and default every role to the selected custom model", () => {
  storeLogin();
  const config = JSON.parse(readFileSync(join(home, "config", "cheapag", "config.json"), "utf8"));
  expect(config.custom_endpoint).toEqual({ base_url: ENDPOINT.baseURL, model: ENDPOINT.model });
  expect(JSON.stringify(config)).not.toContain(TEST_CREDENTIAL);
  const route = fullRoute("custom", config.models);
  expect(routeModels(route).map(modelName)).toEqual(["custom/example-model"]);
  expect(route.implement.providerID).toBe(customProviderId(ENDPOINT));
  expect(route.fallbacks).toEqual([]);
  expect(route.researchFallbacks).toEqual([]);
  expect(customProviderConfig(ENDPOINT).options).toEqual({ baseURL: ENDPOINT.baseURL });
});

test("loopback preflight checks transport without HTTP or credentials and detects a stopped relay", async () => {
  let requests = 0;
  const api = createServer((_, res) => { requests++; res.end(); });
  await new Promise<void>(resolve => api.listen(0, "127.0.0.1", resolve));
  const endpoint = { ...ENDPOINT, baseURL: `http://127.0.0.1:${(api.address() as { port: number }).port}/v1` };
  try {
    expect(await checkLocalEndpoint(endpoint)).toBe("tcp-reachable");
    expect(requests).toBe(0);
  } finally { await new Promise<void>(resolve => api.close(() => resolve())); }
  await expect(checkLocalEndpoint(endpoint)).rejects.toThrow(/ECONNREFUSED.*check the local relay/);
  expect(await checkLocalEndpoint(ENDPOINT)).toBe("not-checked");
});

test("an unavailable local relay fails before worktrees, jobs or worker sessions are created", async () => {
  const api = createServer();
  await new Promise<void>(resolve => api.listen(0, "127.0.0.1", resolve));
  const endpoint = { ...ENDPOINT, baseURL: `http://127.0.0.1:${(api.address() as { port: number }).port}/v1` };
  await new Promise<void>(resolve => api.close(() => resolve()));
  saveCustomEndpoint(endpoint);
  storeLogin(endpoint);
  const repo = tempRepo();
  const fake = await startFakeOpencode();
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  try {
    server = await startServer({ cwd: repo.dir, env: { ...homeEnv(home), CHEAPAG_OPENCODE_URL: fake.url }, allow: [] });
    for (const [tool, args] of [["research", { question: "where is hello?" }], ["delegate", { task: "Write hello.txt", files: "hello.txt", kind: "feature" }]] as const) {
      expect(await callText(server.client, tool, args)).toMatch(/^FAIL reason: custom endpoint loopback transport unavailable \(ECONNREFUSED\)/);
    }
    expect(existsSync(join(repo.dir, ".cheapag", "worktrees"))).toBe(false);
    expect(existsSync(join(repo.dir, ".cheapag", "jobs"))).toBe(false);
    expect(fake.recorded.sessions).toEqual([]);
    expect(fake.recorded.requests).toEqual([]);
  } finally { await server?.close(); await fake.close(); repo.cleanup(); }
});

test("a cached healthy engine does not hide a relay that stopped between jobs", async () => {
  const relay = createServer();
  await new Promise<void>(resolve => relay.listen(0, "127.0.0.1", resolve));
  const endpoint = { ...ENDPOINT, baseURL: `http://127.0.0.1:${(relay.address() as { port: number }).port}/v1` };
  const fake = await startFakeOpencode();
  try {
    saveCustomEndpoint(endpoint);
    storeLogin(endpoint);
    vi.stubEnv("CHEAPAG_OPENCODE_URL", fake.url);
    const provider = { provider: "custom", via: "login" } as const;
    await expect(ensureOpencode(provider, home, fullRoute("custom"))).resolves.toHaveProperty("url", fake.url);
    await new Promise<void>(resolve => relay.close(() => resolve()));
    await expect(ensureOpencode(provider, home, fullRoute("custom"))).rejects.toThrow("ECONNREFUSED");
    expect(fake.recorded.requests.map(r => r.path)).toEqual(["/global/health"]);
  } finally {
    relay.close();
    await fake.close();
  }
});

test("explicit custom selection beats other logins without changing built-in detection order", () => {
  storeLogin(ENDPOINT, TEST_CREDENTIAL, { openrouter: { type: "api", key: "dummy" } });
  expect(savedProviders()).toEqual(["openrouter", "custom"]);
  expect(detectProvider()?.provider).toBe("custom");
  const file = join(home, "config", "cheapag", "config.json");
  const settings = JSON.parse(readFileSync(file, "utf8"));
  delete settings.provider;
  writeFileSync(file, JSON.stringify(settings));
  expect(detectProvider()?.provider).toBe("openrouter");
});

test("an endpoint change cannot reuse the previous credential or silently select another provider", () => {
  storeLogin(ENDPOINT, TEST_CREDENTIAL, { openrouter: { type: "api", key: "dummy" } });
  const changed = { ...ENDPOINT, baseURL: "https://other.example.com/v1" };
  expect(customProviderId(changed)).not.toBe(customProviderId(ENDPOINT));
  saveCustomEndpoint(changed);
  expect(detectProvider()).toBeUndefined();
  expect(savedProviders()).toEqual(["openrouter"]);
  expect(customProviderId({ ...ENDPOINT, baseURL: ENDPOINT.baseURL + "/" })).toBe(customProviderId(ENDPOINT));
});

test("consent is bound to the endpoint even for an explicit model allowlist", () => {
  const repo = tempRepo();
  try {
    writeConsent(repo.dir, { mode: "models", provider: "custom", models: ["custom/example-model"], approvedAt: new Date().toISOString() });
    expect(consentGate(repo.dir, "custom")).toHaveProperty("route");
    saveCustomEndpoint({ ...ENDPOINT, baseURL: "https://other.example.com/v1" });
    expect(consentGate(repo.dir, "custom")).toHaveProperty("block", expect.stringMatching(/^CONSENT/));
  } finally { repo.cleanup(); }
});

test("redacts arbitrary custom key shapes, URL encodings and JSON escaping", () => {
  const key = "dummy custom/token\"value";
  storeLogin(ENDPOINT, key);
  expect(redact("error: " + key)).toBe("error: [redacted]");
  expect(redact(encodeURIComponent(key))).toBe("[redacted]");
  expect(redact(JSON.stringify({ error: key }))).toBe('{"error":"[redacted]"}');
});

test("redacts the whole custom token before applying generic prefix redaction", () => {
  const key = "sk-dummy-credential-for-testing/private-suffix";
  storeLogin(ENDPOINT, key);
  expect(redact("error: " + key)).toBe("error: [redacted]");
});

test("MCP delegation consumes the native custom config; repo settings cannot redirect it", async () => {
  storeLogin();
  const repo = tempRepo();
  const fake = await startFakeOpencode();
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  try {
    writeFileSync(join(repo.dir, "cheapag.json"), JSON.stringify({ provider: "deepseek", custom_endpoint: { base_url: "https://untrusted.example.com/v1", model: "untrusted-model" } }));
    fake.script({ edit: "hello.txt", content: "hello\n" }, { tool: "write" }, { finish: { summary: "wrote hello", risks: [], review: [], missing: [] } });
    server = await startServer({ cwd: repo.dir, env: { ...homeEnv(home), CHEAPAG_OPENCODE_URL: fake.url }, allow: [] });
    const text = await callText(server.client, "delegate", { task: "Write hello.txt containing hello", files: "hello.txt", done_when: "hello.txt contains hello" });
    expect(text).toMatch(/^OK /);
    expect(readFileSync(join(repo.dir, "hello.txt"), "utf8").replace(/\r\n/g, "\n")).toBe("hello\n");
    const config = JSON.parse(readFileSync(join(repo.dir, ".cheapag", "opencode", "opencode.json"), "utf8"));
    const id = customProviderId(ENDPOINT);
    expect(config.enabled_providers).toEqual([id]);
    expect(config.small_model).toBe(id + "/example-model");
    expect(config.provider[id]).toEqual(customProviderConfig(ENDPOINT));
    expect(JSON.stringify(config)).not.toContain(TEST_CREDENTIAL);
    expect(customEndpoint()).toEqual(ENDPOINT);
  } finally { await server?.close(); await fake.close(); repo.cleanup(); }
}, 30_000);

test("the bundled OpenCode sends the selected model and endpoint-scoped credential to a real mock HTTP API", async () => {
  const requests: { model: string; authorization?: string }[] = [];
  const api = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    if (req.url !== "/v1/chat/completions") { res.writeHead(404).end(); return; }
    const body = JSON.parse(raw);
    requests.push({ model: body.model, authorization: req.headers.authorization });
    if (body.stream) {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const base = { id: "fixture", object: "chat.completion.chunk", created: 1, model: ENDPOINT.model };
      res.write("data: " + JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: "assistant", content: "OK" }, finish_reason: null }] }) + "\n\n");
      res.write("data: " + JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }) + "\n\n");
      res.end("data: [DONE]\n\n");
    } else {
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ id: "fixture", object: "chat.completion", created: 1, model: ENDPOINT.model, choices: [{ index: 0, message: { role: "assistant", content: "OK" }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
    }
  });
  await new Promise<void>(resolve => api.listen(0, "127.0.0.1", resolve));
  try {
    const port = (api.address() as { port: number }).port;
    const endpoint = { ...ENDPOINT, baseURL: `http://127.0.0.1:${port}/v1` };
    saveCustomEndpoint(endpoint);
    storeLogin(endpoint);
    const route = fullRoute("custom");
    const opencode = await ensureOpencode({ provider: "custom", via: "login" }, home, route);
    const result = await runSession({ opencode, directory: home, model: route.implement, prompt: "Reply OK. Do not use tools.", onEvent: () => {} });
    expect(result.error).toBeUndefined();
    expect(result.text).toContain("OK");
    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) expect(request).toEqual({ model: ENDPOINT.model, authorization: "Bearer " + TEST_CREDENTIAL });
  } finally {
    stopOpencode(true);
    await new Promise<void>(resolve => api.close(() => resolve()));
  }
}, 120_000);
