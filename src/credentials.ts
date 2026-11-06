import { NPX } from "./distribution.js";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { customEndpoint, customProviderId, readUserSettings } from "./custom-endpoint.js";

/** Credentials come only from saved logins in OpenCode's store, written by `cheapag login` (ADR-0004). */

/** Providers in detection order; `label` is what `cheapag login` shows. */
export const PROVIDERS = [
  { id: "opencode-go", label: "OpenCode Go" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "commandcode", label: "Command Code" },
  { id: "custom", label: "Custom OpenAI-compatible endpoint" },
] as const;

export type Provider = { provider: (typeof PROVIDERS)[number]["id"]; via: "login" };

export const LOGIN_COMMAND = `${NPX} login`;
export const NO_PROVIDER = `FAIL reason: no worker provider; run ${LOGIN_COMMAND}`;

/** OpenCode keeps logins for every installed copy in one shared file. */
function authFile() {
  return join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "opencode", "auth.json");
}

/** Supported saved logins in legacy detection order. Custom credentials use endpoint-scoped IDs. */
export function savedProviders(): Provider["provider"][] {
  let saved: Record<string, unknown>;
  try {
    saved = existsSync(authFile()) ? JSON.parse(readFileSync(authFile(), "utf8")) : {};
  } catch {
    return []; // an unreadable auth file is the same as no login
  }
  return PROVIDERS.map((p) => p.id).filter((id) => {
    if (id !== "custom") return id in saved;
    try { const endpoint = customEndpoint(); return !!endpoint && customProviderId(endpoint) in saved; }
    catch { return false; }
  });
}

export function hasSavedLogin(id: string): boolean {
  try { return id in JSON.parse(readFileSync(authFile(), "utf8")); }
  catch { return false; }
}

export const providerLabel = (id: Provider["provider"]) => {
  const label = PROVIDERS.find(p => p.id === id)!.label;
  if (id !== "custom") return label;
  try { const endpoint = customEndpoint(); return endpoint ? `${label} (${new URL(endpoint.baseURL).origin})` : label; }
  catch { return label; }
};

/** The provider the worker uses: the first saved login. */
export function detectProvider(): Provider | undefined {
  const saved = savedProviders();
  const selected = readUserSettings().provider;
  const first = typeof selected === "string" && PROVIDERS.some(p => p.id === selected)
    ? saved.find(id => id === selected) : saved[0];
  return first && { provider: first, via: "login" };
}

/** Strips key-shaped strings (OpenRouter's sk-or-v1-…, DeepSeek/OpenAI-style sk-…) from anything that leaves the process. */
export function redact(text: string) {
  let result = text;
  try {
    const logins = JSON.parse(readFileSync(authFile(), "utf8")) as Record<string, { key?: unknown }>;
    const secrets = Object.entries(logins).filter(([id]) => /^cheapag-custom-[a-f0-9]{32}$/.test(id))
      .map(([, value]) => value?.key).filter((key): key is string => typeof key === "string" && key.length > 0)
      .flatMap(key => [key, encodeURIComponent(key), JSON.stringify(key).slice(1, -1)]).sort((a, b) => b.length - a.length);
    for (const secret of new Set(secrets)) result = result.split(secret).join("[redacted]");
  } catch {} // no readable store means no custom secret can be loaded by this process
  return result.replace(/\bsk-[A-Za-z0-9_-]{16,}/g, "[redacted]");
}
