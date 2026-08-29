# Mamak Router

Multi-account API-key routing for [oh-my-pi](https://github.com/can1357/oh-my-pi).

```text
DeepSeek
key-1 → 429 → cooldown
key-2 → 429 → cooldown
key-3 → success
```

Mamak Router is a small external Marketplace plugin. It registers one OpenAI-compatible OMP provider per configured upstream and rotates only that provider's API-key pool. It does not patch OMP core.

## Features

- Any number of environment-supplied API keys per provider.
- `round-robin`, `fallback`, `fill-first`, `weighted`, and `least-used` selection.
- Priority tiers and configurable weights without storing a secret.
- Provider fallback chains for shared OpenAI-compatible model ids.
- In-memory provider request, 429, and quota-exhaustion counters.
- Retry cap: five attempts per request by default.
- 401 disables a credential; quota-like 403 exhausts it; 429 cools it down; 408/network/5xx rotate.
- No rotation for malformed requests (400, ordinary 403, 404, 422).
- Safe stream boundary: retry only before the upstream stream emits `start`; never replay visible output.
- SHA-256 key fingerprints deduplicate imports. Secrets are neither logged nor rendered.
- Built-in OpenAI-compatible defaults: DeepSeek, OpenRouter, and Z.AI; custom endpoints use JSON config.

## Installation

OMP Marketplace commands are current for `@oh-my-pi/pi-coding-agent` 18.0.11:

```sh
omp plugin marketplace add YOUR_GITHUB_USERNAME/mamak-omp-router
omp plugin install mamak-router@mamak-omp-router
```

Restart the OMP session after install so its extension module initializes. In the TUI, equivalent commands are `/marketplace add YOUR_GITHUB_USERNAME/mamak-omp-router` and `/marketplace install mamak-router@mamak-omp-router`.

## Quick start

Export a comma-separated pool before starting OMP:

```sh
export DEEPSEEK_KEYS='key-1,key-2,key-3'
omp
```

Select `mamak-router-deepseek/deepseek-chat` (or `mamak-router-deepseek/deepseek-reasoner`). The router makes the request with the next healthy key.

Provider-specific variables are also supported:

```sh
export MAMAK_ROUTER_OPENROUTER_KEYS='key-1,key-2'
export MAMAK_ROUTER_ZAI_KEYS='key-1,key-2'
```

Keys may instead be supplied as numbered variables such as `DEEPSEEK_KEY_001`, `DEEPSEEK_KEY_002`, and `MAMAK_ROUTER_DEEPSEEK_KEY_003`.

## Configuration

`MAMAK_ROUTER_CONFIG` is a JSON object. It never contains a secret.

```sh
export MAMAK_ROUTER_CONFIG='{
  "routing": {
    "maxAttemptsPerRequest": 5,
    "defaultStrategy": "round-robin",
    "cooldown": { "defaultSeconds": 30, "maxSeconds": 600 }
  },
  "providers": [
    {
      "id": "custom-openai",
      "enabled": true,
      "baseUrl": "https://example.internal/v1",
      "models": ["my-model"],
      "strategy": "fallback"
    }
  ]
}'
export MAMAK_ROUTER_CUSTOM_OPENAI_KEYS='key-1,key-2'
```

Without `MAMAK_ROUTER_CONFIG`, the plugin registers DeepSeek (`deepseek-chat`, `deepseek-reasoner`), OpenRouter (`openai/gpt-4o-mini`), and Z.AI (`glm-4.7`) defaults. Configuration validation rejects unknown fields, insecure URL schemes, duplicate provider ids, duplicate models, invalid strategies, and non-positive retry/cooldown values.

### Strategies

- **round-robin**: starts each request at the next healthy credential.
- **fallback** / **fill-first**: use the first healthy credential in the highest available priority tier.
- **weighted**: randomly chooses within that priority tier according to `weight`.
- **least-used**: chooses the fewest-successful, then least-recently-used credential in that tier.

`credentialPolicies` configures generated ids such as `deepseek-1`; lower numeric `priority` wins. `fallbackProviders` receives a request only after source-provider key attempts fail before output, and only when it declares the same model id. `/router quota [provider]` reports in-memory request/rate-limit/exhaustion counters; `/router dashboard` renders the local terminal dashboard.

Disabled, invalid, exhausted, and cooling-down credentials are skipped. A 429 cooldown honors retry hints when the transport exposes them; otherwise the default profile starts at 60 seconds and doubles, bounded by `maxSeconds`. Set `defaultSeconds` to `30` for a 30/60/120/240-second ladder.

## Commands

```text
/router status
/router list [provider]
/router quota [provider]
/router dashboard
/router remove <provider> <credential>
/router enable <provider> <credential>
/router disable <provider> <credential>
/router strategy <provider> <round-robin|fallback|fill-first|weighted|least-used>
/router add <provider>
```

`list` prints only `****` plus a non-reversible fingerprint suffix. `add` intentionally refuses to accept a key: the current public OMP extension API has no masked/secure input or secret-storage surface. `remove`, `enable`, `disable`, and `strategy` change current-session state; edit the environment and restart to persist an intended change.

## Security

Secrets remain in `process.env` and an in-memory credential object for the live OMP process. The plugin has no persistent credential file, keychain, or public OMP secret-store API available. It stores only SHA-256 fingerprints in credential metadata, and logs provider/count/attempt state only.

Do not place API keys in `MAMAK_ROUTER_CONFIG`, shell history, chat messages, source control, or issue reports.

## Updates

```sh
omp plugin marketplace update mamak-omp-router
omp plugin upgrade mamak-router@mamak-omp-router
```

`update` refreshes only the catalog. `upgrade` reinstalls the plugin version. Restart the session after an extension update.

## Compatibility

| 0.1.x | `@oh-my-pi/pi-coding-agent` and `@oh-my-pi/pi-ai` `>=18.0.11 <19` |
| 0.2.x | `@oh-my-pi/pi-coding-agent` and `@oh-my-pi/pi-ai` `>=18.0.11 <19` |

The Marketplace format has no OMP compatibility gate, so the package peer range is the compatibility signal.

## Development

```sh
bun install
bun run typecheck
bun run test
bun run build
```

## Limitations

- OAuth account pooling for Claude Code, Codex, and Gemini cannot be implemented safely with the current public OMP extension API. It exposes OAuth `login`/`refreshToken` registration but no extension-accessible account list, credential selection, or credential store.
- No secure interactive key entry or persistent secret CRUD until OMP exposes public APIs for both.
- Provider model metadata is conservative generic metadata; configure custom model ids explicitly.
- Quota tracking counts provider outcomes in memory; normalized OMP transport errors do not always retain raw quota headers.
- Retry headers are used only when propagated by the transport. OMP's built-in OpenAI stream normalizes some errors before the plugin can inspect headers.
- One visible streaming response is never replayed after an error.

## Roadmap

V2 is implemented: fill-first, weighted and least-used scheduling, credential priority, outcome counters, provider fallback chains, and a terminal dashboard.

V3 is blocked upstream: an external plugin needs public credential-pool list/select/store APIs before OAuth account pools for Claude Code, Codex, or Gemini can be built without duplicating OMP internal auth storage. The current dashboard is intentionally a local `/router dashboard` terminal surface, not a web dashboard.
