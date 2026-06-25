# Folio — AI Provider Layer Design

Design spec for a provider-agnostic AI layer supporting **Proxy**, **BYOK** (Bring Your Own Key),
and **Local model servers** that speak either the **OpenAI** or **Anthropic** API dialect, plus a
**Settings modal** for configuring it all.

> Status: design spec (pre-implementation). Targets Phase 3 of `docs/plan.md`, which is not yet built.
> Building Phase 3 on this design from the start is cleaner than retrofitting later.

---

## 1. Goals

- Let the user choose **where inference runs**: Folio's server proxy, a cloud API with their own key, or a local server on their machine.
- Speak **both API dialects** (OpenAI-compatible and Anthropic-compatible) behind one streaming interface, so Ollama, LM Studio, OpenAI, and Anthropic all work.
- Keep the editor/AI panel code **unaware of the provider** — it only calls `streamAI(...)`.
- Persist settings (incl. keys) to **localStorage**, matching the existing app pattern.
- Privacy-first: in Local and BYOK modes, **no document content passes through Folio's server**.

---

## 2. Two-axis model

A provider is described by two independent axes instead of a long enum:

| Axis | Values | Meaning |
|---|---|---|
| `mode` | `proxy` · `byok` · `local` | **Where** the request goes |
| `dialect` | `anthropic` · `openai` | **How** the request/response is shaped |

This keeps the matrix small and composable:

| mode | dialect | Target | Key in browser? | Doc content leaves machine? |
|---|---|---|---|---|
| `proxy` | `anthropic` | `/api/ai` (Folio server → Claude) | No | Yes (to Folio + Anthropic) |
| `byok` | `anthropic` | `api.anthropic.com` direct | Yes | Yes (to Anthropic only) |
| `byok` | `openai` | `api.openai.com` direct | Yes | Yes (to OpenAI only) |
| `local` | `openai` | `http://localhost:11434/v1` (Ollama, LM Studio) | Optional | **No** |
| `local` | `anthropic` | local Anthropic-compatible endpoint | Optional | **No** |

`proxy` is the default for non-technical users (no setup). `byok` and `local` are opt-in.

---

## 3. Types (`types/index.ts` additions)

```typescript
/** Where the inference request is sent. */
export type ProviderMode = "proxy" | "byok" | "local";

/** Wire format of the request/response. */
export type ApiDialect = "anthropic" | "openai";

/** A fully-resolved provider the user can select and run against. */
export interface ProviderConfig {
  /** Stable id, e.g. "byok-anthropic" or a uuid for custom local servers. */
  id: string;
  /** Display label in the settings modal + stream badge. */
  label: string;
  mode: ProviderMode;
  dialect: ApiDialect;
  /** Base URL. Ignored for `proxy`. e.g. "https://api.anthropic.com" or "http://localhost:11434/v1". */
  baseUrl: string;
  /** Model id, e.g. "claude-sonnet-4-6", "gpt-4o-mini", "llama3.1:8b". */
  model: string;
  /** Upper bound on output tokens. */
  maxTokens: number;
}

/** Persisted AI settings. Keys are stored separately from configs (see §4). */
export interface AISettings {
  /** id of the currently active ProviderConfig. */
  activeProviderId: string;
  /** Built-in + user-defined providers. */
  providers: ProviderConfig[];
  /** API keys, keyed by ProviderConfig.id. Never logged. */
  keys: Record<string, string>;
}
```

Keys live in a separate `keys` map (not inline on `ProviderConfig`) so configs can be exported/shared
or logged for debugging **without** leaking secrets.

---

## 4. Persistence (`store/settingsStore.ts`)

A dedicated Zustand store, mirroring the localStorage helpers already in `store/appStore.ts`.

```
localStorage keys:
  folio.ai.settings   → JSON.stringify({ activeProviderId, providers })   // no secrets
  folio.ai.keys       → JSON.stringify(keys)                              // secrets, see §8
```

Storing secrets and non-secrets under separate localStorage keys means a future "export settings"
feature can serialize `folio.ai.settings` safely.

```typescript
interface SettingsStore extends AISettings {
  setActiveProvider: (id: string) => void;
  upsertProvider: (cfg: ProviderConfig) => void;
  removeProvider: (id: string) => void;
  setKey: (providerId: string, key: string) => void;
  clearKey: (providerId: string) => void;
  /** The active config resolved against `providers`. */
  getActive: () => ProviderConfig | undefined;
}
```

### Default seeded providers

```typescript
const DEFAULT_PROVIDERS: ProviderConfig[] = [
  { id: "proxy",          label: "Folio Cloud (default)", mode: "proxy", dialect: "anthropic",
    baseUrl: "",                          model: "claude-sonnet-4-6", maxTokens: 4096 },
  { id: "byok-anthropic", label: "Anthropic (your key)",  mode: "byok",  dialect: "anthropic",
    baseUrl: "https://api.anthropic.com", model: "claude-sonnet-4-6", maxTokens: 4096 },
  { id: "byok-openai",    label: "OpenAI (your key)",     mode: "byok",  dialect: "openai",
    baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini",       maxTokens: 4096 },
  { id: "local-ollama",   label: "Local — Ollama",        mode: "local", dialect: "openai",
    baseUrl: "http://localhost:11434/v1", model: "llama3.1:8b",       maxTokens: 4096 },
];
// activeProviderId defaults to "proxy".
```

Users can add custom `local` providers (e.g. LM Studio on `:1234`) via the modal; these get a uuid id.

---

## 5. Provider layer (`lib/ai.ts`)

The public surface stays exactly as Phase 3 planned — only the internals branch on `mode`/`dialect`.

```typescript
export async function* streamAI(
  messages: AIMessage[],
  system: string,
  provider: ProviderConfig,
  apiKey: string | undefined,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const req = buildRequest(provider, apiKey, messages, system);
  const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body, signal });
  if (!res.ok || !res.body) throw new Error(`AI request failed: ${res.status}`);
  yield* parseStream(provider.dialect, res.body.getReader());
}
```

### 5.1 `buildRequest(provider, apiKey, messages, system)`

Returns `{ url, headers, body }`, branching on `mode` then `dialect`.

**mode `proxy`** — unchanged from Phase 3. POST to `/api/ai`, key stays server-side:
```
url: "/api/ai"
headers: { "content-type": "application/json" }
body: { messages, system }            // server picks model + injects key
```

**mode `byok` / `local`, dialect `anthropic`**:
```
url: `${baseUrl}/v1/messages`
headers: {
  "content-type": "application/json",
  "x-api-key": apiKey,                          // omitted for keyless local
  "anthropic-version": "2023-06-01",
  "anthropic-dangerous-direct-browser-access": "true",   // required for browser calls
}
body: { model, max_tokens, system, stream: true, messages }
```

**mode `byok` / `local`, dialect `openai`**:
```
url: `${baseUrl}/chat/completions`             // baseUrl already ends in /v1
headers: {
  "content-type": "application/json",
  "authorization": `Bearer ${apiKey}`,         // omitted for keyless local
}
body: {
  model, max_tokens, stream: true,
  messages: [{ role: "system", content: system }, ...messages],   // system folded in
}
```

The two dialects differ in how `system` is passed (top-level field vs a `system` message) — `buildRequest` normalizes that.

### 5.2 `parseStream(dialect, reader)`

Both are SSE `data:` line streams; only the JSON shape of each event differs. Shared buffering logic
(split on `\n`, keep partial last line, skip malformed JSON, stop on `[DONE]`), with a per-dialect extractor:

```typescript
// anthropic: event.type === "content_block_delta" → event.delta.text
// openai:    event.choices?.[0]?.delta?.content
```

This is the only place dialect-specific parsing lives.

---

## 6. Hook wiring (`hooks/useAI.ts`)

`useAI` reads the active provider from `settingsStore` and passes it into `streamAI`:

```typescript
const provider = useSettingsStore((s) => s.getActive());
const apiKey   = useSettingsStore((s) => provider && s.keys[provider.id]);

async function run(userMessage, systemPrompt, contextContent) {
  if (!provider) { setError("No AI provider configured."); return; }
  if ((provider.mode === "byok") && !apiKey) {
    setError("This provider needs an API key. Open Settings → AI.");
    return;
  }
  // ...abort in-flight, build messages, for-await streamAI(..., provider, apiKey, signal)
}
```

Everything else (`stop()`, `clearHistory()`, history accumulation) is identical to the Phase 3 plan.
The AI cache key (Phase 4) gains `provider.id + provider.model` so a Claude answer and a local-Llama
answer for the same document don't collide.

---

## 7. Settings modal (`components/settings/SettingsModal.tsx`)

Opens from a ⚙ icon in the sidebar footer / top bar, or `⌘,`. Minimal Ink styling throughout
(Inter headings, Geist body, Funnel Sans captions, Geist Mono for URLs/models, accent `#0066FF`,
`12px` modal radius, Soft Cloud shadow).

```
┌─────────────────────────────────────────────────────────────┐
│  AI Settings                                            ✕     │  Inter 600 15px
├─────────────────────────────────────────────────────────────┤
│  PROVIDER                                                     │  Funnel Sans 10px 600 #999
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌──────────────┐  │
│  │ Folio     │ │ Anthropic │ │ OpenAI    │ │ Local —      │  │  radio cards, 8px radius
│  │ Cloud  ●  │ │ (your key)│ │ (your key)│ │ Ollama       │  │  selected: 2px #0066FF + #EBF0FF
│  └───────────┘ └───────────┘ └───────────┘ └──────────────┘  │
│                                            [ + Add local ]    │  ghost button
├─────────────────────────────────────────────────────────────┤
│  CONFIGURATION                                               │
│  Dialect   ( Anthropic ) ( OpenAI )            ← pills        │  shown for local/custom only
│  Base URL  [ https://api.anthropic.com            ]          │  Geist Mono, locked for cloud
│  Model     [ claude-sonnet-4-6                    ]          │  Geist Mono
│  Max tokens[ 4096                                 ]          │
│  API key   [ ••••••••••••••••••••••  ] [👁 Show]  [Test]     │  hidden for proxy/keyless local
│            ⓘ Stored in your browser (localStorage).          │  Funnel Sans 11px #999
├─────────────────────────────────────────────────────────────┤
│  ◯ Not tested   /   ✓ Connected (124ms)  /  ✕ <error>        │  test result line
├─────────────────────────────────────────────────────────────┤
│                                   [ Cancel ]  [ Save ]       │  Save = Inter 600 white #0066FF
└─────────────────────────────────────────────────────────────┘
```

### Behavior

- **Provider cards** select the active provider. Cloud cards (`proxy`, `byok-*`) lock `baseUrl`/`dialect`; `local`/custom cards make every field editable.
- **API key field** is a password input with a show/hide toggle. Hidden entirely for `proxy` and for keyless `local`. A "Stored in your browser" note sets expectations (see §8).
- **Test connection** sends a 1-token, non-streaming probe (e.g. "ping") to the configured endpoint and reports latency or the error string. This catches the three common failures up front: bad key (401), CORS not enabled on a local server, and wrong base URL/model.
- **Add local** spawns a new editable `local` card with a uuid id for things like LM Studio (`http://localhost:1234/v1`).
- **Save** writes configs to `folio.ai.settings` and keys to `folio.ai.keys`, then closes.

The active provider also surfaces in the AI panel's stream badge, e.g.
`Local — Ollama · llama3.1:8b · File scope`, so the user always knows where their data is going.

---

## 8. Security & operational notes

**localStorage key storage (chosen tradeoff).** Convenient and persistent, but readable by any
JavaScript running on the origin — so an XSS bug exposes the key. Mitigations to ship alongside:
sanitize all rendered markdown/AI output with `rehype-sanitize` (already flagged as a project risk),
never write keys to logs or error messages, and surface the "stored in your browser" note in the modal.
A future toggle could downgrade an individual provider to `sessionStorage`.

**Anthropic direct-from-browser.** Anthropic blocks browser calls unless
`anthropic-dangerous-direct-browser-access: true` is set, and the request still exposes the key to the
page (inherent to BYOK). The modal should make clear BYOK keys are entered at the user's own risk.

**Local CORS.** A browser calling `http://localhost:11434` is a cross-origin request; the local server
must allow Folio's origin. The modal's empty/error state for `local` should link a short hint:
Ollama → set `OLLAMA_ORIGINS`; LM Studio → enable the CORS toggle in its server settings.

**Mixed content.** A page served over `https://` cannot call `http://localhost` on some browser
configs without flags. Document this; it mainly affects the deployed (Vercel) build, not local dev.

**Proxy mode still needs its own hardening** (auth, durable rate-limit, spend cap) — tracked separately
from this design; see prior review notes.

---

## 9. Files touched

| File | Change |
|---|---|
| `types/index.ts` | Add `ProviderMode`, `ApiDialect`, `ProviderConfig`, `AISettings` |
| `store/settingsStore.ts` | **New** — Zustand store + localStorage persistence (settings + keys) |
| `lib/ai.ts` | **New** — `streamAI`, `buildRequest`, `parseStream` (both dialects) |
| `hooks/useAI.ts` | **New** — reads active provider, passes into `streamAI` |
| `components/settings/SettingsModal.tsx` | **New** — provider picker + config form + test |
| `components/ai/AIPanel.tsx` | Stream badge shows active provider; "configure" link when unset |
| `app/api/ai/route.ts` | Unchanged from Phase 3 (only used by `proxy` mode) |

---

## 10. Test plan

- `lib/ai.test.ts` — `buildRequest` produces correct url/headers/body for all six mode×dialect cells; `parseStream` extracts deltas from both Anthropic and OpenAI SSE fixtures, handles split buffers, skips malformed chunks, stops on `[DONE]`.
- `store/settingsStore.test.ts` — upsert/remove/setKey round-trips through localStorage; secrets and configs persist under separate keys; `getActive` resolves correctly.
- `components/settings/SettingsModal.test.tsx` — selecting a card swaps editable fields; key field hidden for `proxy`; Save persists; Test reports success/error.
- Manual smoke: Ollama running locally → select Local card → Test → green → "Summary" quick action streams from the local model.
```

---

## 11. Rollout order

1. Types + `settingsStore` (+ tests) — no UI yet, defaults to `proxy` so nothing changes.
2. `lib/ai.ts` dual-dialect `streamAI` (+ tests).
3. `useAI` + AIPanel wiring against the active provider.
4. `SettingsModal` (provider picker → config → Test → Save).
5. Polish: stream badge, CORS hint links, sanitize pass.

Each step is independently shippable; after step 1 the app behaves exactly as the original Phase 3
plan, with the new modes lighting up as later steps land.
