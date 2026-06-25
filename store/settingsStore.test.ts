import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetForTests,
  createLocalProvider,
  DEFAULT_PROVIDERS,
  useSettingsStore,
} from "@/store/settingsStore";
import type { PersistedSettings } from "@/store/settingsStore";
import type { ProviderConfig } from "@/types";

const SETTINGS_KEY = "folio.ai.settings";
const KEYS_KEY = "folio.ai.keys";

const byokAnthropic: ProviderConfig | undefined = DEFAULT_PROVIDERS.find(
  (p) => p.id === "byok-anthropic",
);
const byokOpenai: ProviderConfig | undefined = DEFAULT_PROVIDERS.find(
  (p) => p.id === "byok-openai",
);

describe("store/settingsStore", () => {
  beforeEach(() => {
    __resetForTests();
  });

  describe("default state", () => {
    it("seeds the four built-in providers with proxy active and no keys", () => {
      const state = useSettingsStore.getState();
      expect(state.providers.map((p) => p.id)).toEqual([
        "proxy",
        "byok-anthropic",
        "byok-openai",
        "local-ollama",
      ]);
      expect(state.activeProviderId).toBe("proxy");
      expect(state.keys).toEqual({});
    });

    it("getActive resolves the currently active provider", () => {
      expect(useSettingsStore.getState().getActive()?.id).toBe("proxy");
    });

    it("getActive returns undefined for a dangling active id", () => {
      useSettingsStore.getState().setActiveProvider("does-not-exist");
      expect(useSettingsStore.getState().getActive()).toBeUndefined();
    });
  });

  describe("setActiveProvider", () => {
    it("changes the active provider and persists the id under the settings key", () => {
      useSettingsStore.getState().setActiveProvider("byok-openai");

      expect(useSettingsStore.getState().activeProviderId).toBe("byok-openai");
      const persisted = JSON.parse(
        window.localStorage.getItem(SETTINGS_KEY) ?? "{}",
      ) as PersistedSettings;
      expect(persisted.activeProviderId).toBe("byok-openai");
    });
  });

  describe("createLocalProvider", () => {
    it("assigns a unique uuid id and forces mode=local", () => {
      const a = createLocalProvider({ label: "LM Studio" });
      const b = createLocalProvider({ label: "Other" });

      expect(a.mode).toBe("local");
      expect(a.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(a.id).not.toBe(b.id);
    });

    it("applies sensible defaults for unset fields", () => {
      const p = createLocalProvider();
      expect(p.dialect).toBe("openai");
      expect(p.baseUrl).toBe("http://localhost:11434/v1");
      expect(p.model).toBe("llama3.1:8b");
      expect(p.maxTokens).toBe(4096);
    });
  });

  describe("upsertProvider", () => {
    it("appends a new provider (custom local) and persists the list", () => {
      const custom = createLocalProvider({ label: "LM Studio", baseUrl: "http://localhost:1234/v1" });
      useSettingsStore.getState().upsertProvider(custom);

      const providers = useSettingsStore.getState().providers;
      expect(providers.some((p) => p.id === custom.id)).toBe(true);
      const persisted = JSON.parse(
        window.localStorage.getItem(SETTINGS_KEY) ?? "{}",
      ) as PersistedSettings;
      expect(persisted.providers.some((p) => p.id === custom.id)).toBe(true);
    });

    it("updates an existing provider in place by id", () => {
      const updated: ProviderConfig = {
        ...(byokOpenai as ProviderConfig),
        model: "gpt-4o",
        maxTokens: 8192,
      };
      useSettingsStore.getState().upsertProvider(updated);

      const stored = useSettingsStore
        .getState()
        .providers.find((p) => p.id === "byok-openai");
      expect(stored?.model).toBe("gpt-4o");
      expect(stored?.maxTokens).toBe(8192);
      // No duplicate row introduced.
      expect(useSettingsStore.getState().providers.filter((p) => p.id === "byok-openai"))
        .toHaveLength(1);
    });
  });

  describe("removeProvider", () => {
    it("removes the provider config and its key", () => {
      useSettingsStore.getState().setKey("byok-anthropic", "sk-secret");
      useSettingsStore.getState().removeProvider("byok-anthropic");

      const state = useSettingsStore.getState();
      expect(state.providers.some((p) => p.id === "byok-anthropic")).toBe(false);
      expect(state.keys["byok-anthropic"]).toBeUndefined();
    });

    it("falls back to proxy when the active provider is removed", () => {
      useSettingsStore.getState().setActiveProvider("byok-anthropic");
      useSettingsStore.getState().removeProvider("byok-anthropic");

      expect(useSettingsStore.getState().activeProviderId).toBe("proxy");
      expect(useSettingsStore.getState().getActive()?.id).toBe("proxy");
    });
  });

  describe("setKey / clearKey", () => {
    it("stores and clears a key under the secrets key, separate from configs", () => {
      useSettingsStore.getState().setKey("byok-anthropic", "sk-secret");
      expect(useSettingsStore.getState().keys["byok-anthropic"]).toBe("sk-secret");

      const persistedKeys = JSON.parse(
        window.localStorage.getItem(KEYS_KEY) ?? "{}",
      ) as Record<string, string>;
      expect(persistedKeys).toEqual({ "byok-anthropic": "sk-secret" });

      useSettingsStore.getState().clearKey("byok-anthropic");
      expect(useSettingsStore.getState().keys["byok-anthropic"]).toBeUndefined();
    });
  });

  describe("secret / config separation (P3.1.7)", () => {
    it("never writes keys into the settings blob, and never writes configs into the keys blob", () => {
      // Touch both slices so both blobs exist on disk.
      useSettingsStore.getState().setKey("byok-anthropic", "sk-secret-value");
      useSettingsStore.getState().setActiveProvider("byok-anthropic");

      const settingsRaw = window.localStorage.getItem(SETTINGS_KEY) ?? "";
      const keysRaw = window.localStorage.getItem(KEYS_KEY) ?? "";

      // Settings blob carries configs + active id, but never secrets nor a `keys` field.
      const settingsParsed = JSON.parse(settingsRaw) as Record<string, unknown>;
      expect(settingsParsed).toHaveProperty("providers");
      expect(settingsParsed).toHaveProperty("activeProviderId");
      expect(settingsRaw).not.toContain("sk-secret-value");
      expect(settingsParsed).not.toHaveProperty("keys");

      // Keys blob contains only the secret map — no provider configs.
      const keysParsed = JSON.parse(keysRaw) as Record<string, unknown>;
      expect(keysParsed).toEqual({ "byok-anthropic": "sk-secret-value" });
      expect(keysParsed).not.toHaveProperty("providers");
      expect(keysRaw).not.toContain("baseUrl");
    });
  });

  describe("round-trip through localStorage", () => {
    it("reloads persisted providers + active id on a fresh module init", async () => {
      const custom = createLocalProvider({ label: "LM Studio" });
      useSettingsStore.getState().upsertProvider(custom);
      useSettingsStore.getState().setActiveProvider("byok-openai");

      // Simulate a fresh page load by re-importing the module: the store must
      // re-read localStorage and restore exactly what was written.
      vi.resetModules();
      const fresh = (await import("@/store/settingsStore")).useSettingsStore;

      const state = fresh.getState();
      expect(state.activeProviderId).toBe("byok-openai");
      expect(state.providers.some((p) => p.id === custom.id)).toBe(true);
    });

    it("falls back to defaults when persisted settings are corrupt JSON", async () => {
      window.localStorage.setItem(SETTINGS_KEY, "{not valid json");
      vi.resetModules();
      const fresh = (await import("@/store/settingsStore")).useSettingsStore;

      expect(fresh.getState().providers).toHaveLength(4);
      expect(fresh.getState().activeProviderId).toBe("proxy");
    });
  });

  describe("SSR safety", () => {
    it("does not touch localStorage when window is undefined", () => {
      const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
      const getItemSpy = vi.spyOn(Storage.prototype, "getItem");

      vi.stubGlobal("window", undefined);
      try {
        // Mutating actions must be persistence no-ops while window is absent.
        useSettingsStore.getState().setKey("byok-anthropic", "sk-x");
        useSettingsStore.getState().setActiveProvider("byok-openai");
        useSettingsStore.getState().upsertProvider(byokAnthropic as ProviderConfig);
      } finally {
        vi.unstubAllGlobals();
      }

      expect(setItemSpy).not.toHaveBeenCalled();
      expect(getItemSpy).not.toHaveBeenCalled();
    });
  });
});
