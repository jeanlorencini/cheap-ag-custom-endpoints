import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { userConfigFile } from "./config.js";

export type CustomEndpoint = { baseURL: string; model: string };

/** Endpoint settings are user-owned. Never read them from a repository. */
export function readUserSettings(): Record<string, unknown> {
  const file = userConfigFile();
  if (!existsSync(file)) return {};
  let value: unknown;
  try { value = JSON.parse(readFileSync(file, "utf8")); }
  catch { throw new Error("Cannot read Cheap Agent user settings; fix config.json before logging in."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Cheap Agent user settings must be an object.");
  return value as Record<string, unknown>;
}

export function normalizeEndpoint(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("A custom endpoint base URL is required.");
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { throw new Error("The custom endpoint must be a valid HTTP or HTTPS URL."); }
  const loopback = url.hostname === "localhost" || url.hostname === "[::1]" || /^127\.(?:\d{1,3}\.){2}\d{1,3}$/.test(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("Use HTTPS for remote endpoints; HTTP is allowed only on loopback hosts.");
  }
  if (url.username || url.password || url.search || url.hash || /[?#]/.test(value)) {
    throw new Error("Endpoint URLs must not contain credentials, query strings or fragments.");
  }
  return url.href.replace(/\/+$/, "");
}

export function validateCustomEndpoint(baseURL: unknown, model: unknown): CustomEndpoint {
  if (typeof model !== "string" || !model.trim() || /\s/.test(model.trim())) throw new Error("A non-empty custom model ID without whitespace is required.");
  return { baseURL: normalizeEndpoint(baseURL), model: model.trim() };
}

/** A different endpoint gets a different OpenCode credential slot, never the old key. */
export function customProviderId(endpoint: CustomEndpoint): string {
  return "cheapag-custom-" + createHash("sha256").update(normalizeEndpoint(endpoint.baseURL)).digest("hex").slice(0, 32);
}

export function customEndpoint(): CustomEndpoint | undefined {
  const value = readUserSettings().custom_endpoint;
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("custom_endpoint must contain base_url and model.");
  const config = value as Record<string, unknown>;
  return validateCustomEndpoint(config.base_url, config.model);
}

export function requireCustomEndpoint(): CustomEndpoint {
  const config = customEndpoint();
  if (!config) throw new Error("Configure a custom endpoint with cheapag login first.");
  return config;
}

export function selectProvider(provider: string) {
  const file = userConfigFile();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ ...readUserSettings(), provider }, null, 2) + "\n");
}

/** Only non-secret settings are saved here; OpenCode owns the hidden key prompt and store. */
export function saveCustomEndpoint(endpoint: CustomEndpoint) {
  const config = validateCustomEndpoint(endpoint.baseURL, endpoint.model);
  const model = "custom/" + config.model;
  const file = userConfigFile();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({
    ...readUserSettings(), provider: "custom",
    custom_endpoint: { base_url: config.baseURL, model: config.model },
    models: { implement: model, medium: model, hard: model, research: model, escalation: model, fallback: [] },
  }, null, 2) + "\n");
}

export function customProviderConfig(endpoint: CustomEndpoint, models = [endpoint.model]) {
  const config = validateCustomEndpoint(endpoint.baseURL, endpoint.model);
  return {
    npm: "@ai-sdk/openai-compatible", name: "Custom OpenAI-compatible endpoint",
    options: { baseURL: config.baseURL },
    models: Object.fromEntries(models.map(id => [id, { name: id, tool_call: true }])),
  };
}
