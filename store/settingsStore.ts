import { create } from "zustand";
import type { ProviderConfig } from "@/types";

// Persisted AI provider settings. Non-secrets live under SETTINGS_KEY; API keys
// (secrets) live under a separate KEYS_KEY so configs can be exported/logged
// without leaking secrets. Mirrors the SSR-safe localStorage pattern in appStore.
// See docs/ai-provider-design.md §4.
const SETTINGS_KEY = "folio.ai.settings"; // → { activeProviderId, providers } (no secrets)
const KEYS_KEY = "folio.ai.keys"; // → Record<providerId, apiKey> (secrets only)

/** Built-in providers seeded on first run / when nothing is persisted. */
export const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: "proxy",
    label: "Folio Cloud (default)",
    mode: "proxy",
    dialect: "anthropic",
    baseUrl: "",
    model: "claude-sonnet-4-6",
    maxTokens: 4096,
  },
  {
    id: "byok-anthropic",
    label: "Anthropic (your key)",
    mode: "byok",
    dialect: "anthropic",
    baseUrl: "https://api.anthropic.com",
    model: "claude-sonnet-4-6",
    maxTokens: 4096,
  },
  {
    id: "byok-openai",
    label: "OpenAI (your key)",
    mode: "byok",
    dialect: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    maxTokens: 4096,
  },
  {
    id: "local-ollama",
    label: "Local — Ollama",
    mode: "local",
    dialect: "openai",
    baseUrl: "http://localhost:11434/v1",
    model: "llama3.1:8b",
    maxTokens: 4096,
  },
];

const DEFAULT_ACTIVE_PROVIDER_ID = "proxy";

/** Read+parse JSON from localStorage, SSR-safe; returns `fallback` on miss/parse error. */
function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Stringify+write JSON to localStorage, SSR-safe. */
function writeJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

/** Persisted (non-secret) settings shape written under SETTINGS_KEY. */
export interface PersistedSettings {
  activeProviderId: string;
  providers: ProviderConfig[];
}

/** Validate a persisted settings blob before trusting it; fall back to defaults. */
function loadPersistedSettings(): PersistedSettings {
  const raw = readJSON<Partial<PersistedSettings> | null>(SETTINGS_KEY, null);
  if (!raw || !Array.isArray(raw.providers) || typeof raw.activeProviderId !== "string") {
    return { activeProviderId: DEFAULT_ACTIVE_PROVIDER_ID, providers: DEFAULT_PROVIDERS };
  }
  return { activeProviderId: raw.activeProviderId, providers: raw.providers };
}

const initialSettings = loadPersistedSettings();

/** Create a fresh custom `local` provider with a unique uuid id (P3.1.6). */
export function createLocalProvider(input: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: input.id ?? newLocalId(),
    label: input.label ?? "Local — custom",
    // Custom servers are always `local`; everything else is user-editable.
    mode: "local",
    dialect: input.dialect ?? "openai",
    baseUrl: input.baseUrl ?? "http://localhost:11434/v1",
    model: input.model ?? "llama3.1:8b",
    maxTokens: input.maxTokens ?? 4096,
  };
}

/** Generate a unique provider id for custom local servers. */
function newLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID (older Node).
  return `local-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export interface SettingsState {
  /** id of the currently active ProviderConfig. */
  activeProviderId: string;
  /** Built-in + user-defined providers. */
  providers: ProviderConfig[];
  /** API keys, keyed by ProviderConfig.id. Never logged. */
  keys: Record<string, string>;

  setActiveProvider: (id: string) => void;
  upsertProvider: (cfg: ProviderConfig) => void;
  removeProvider: (id: string) => void;
  setKey: (providerId: string, key: string) => void;
  clearKey: (providerId: string) => void;
  /** The active config resolved against `providers`. */
  getActive: () => ProviderConfig | undefined;
}

/** Write the non-secret settings slice to localStorage. */
function persistSettings(state: SettingsState): void {
  writeJSON(SETTINGS_KEY, {
    activeProviderId: state.activeProviderId,
    providers: state.providers,
  });
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  activeProviderId: initialSettings.activeProviderId,
  providers: initialSettings.providers,
  keys: readJSON<Record<string, string>>(KEYS_KEY, {}),

  setActiveProvider: (id) => {
    set({ activeProviderId: id });
    persistSettings(get());
  },

  upsertProvider: (cfg) => {
    const providers = get().providers.some((p) => p.id === cfg.id)
      ? get().providers.map((p) => (p.id === cfg.id ? cfg : p))
      : [...get().providers, cfg];
    set({ providers });
    persistSettings(get());
  },

  removeProvider: (id) => {
    const providers = get().providers.filter((p) => p.id !== id);
    const keys = { ...get().keys };
    delete keys[id];
    // If the active provider was removed, fall back to the default rather than
    // leaving a dangling id (getActive would resolve to undefined).
    const activeProviderId =
      get().activeProviderId === id ? DEFAULT_ACTIVE_PROVIDER_ID : get().activeProviderId;
    set({ providers, keys, activeProviderId });
    persistSettings(get());
    writeJSON(KEYS_KEY, keys);
  },

  setKey: (providerId, key) => {
    const keys = { ...get().keys, [providerId]: key };
    set({ keys });
    writeJSON(KEYS_KEY, keys);
  },

  clearKey: (providerId) => {
    const keys = { ...get().keys };
    delete keys[providerId];
    set({ keys });
    writeJSON(KEYS_KEY, keys);
  },

  getActive: () => get().providers.find((p) => p.id === get().activeProviderId),
}));

/** Test-only: clear localStorage and restore default settings + empty keys. */
export function __resetForTests(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(SETTINGS_KEY);
    window.localStorage.removeItem(KEYS_KEY);
  }
  useSettingsStore.setState({
    activeProviderId: DEFAULT_ACTIVE_PROVIDER_ID,
    providers: DEFAULT_PROVIDERS,
    keys: {},
  });
}
