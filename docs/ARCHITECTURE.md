# Architecture

`src/index.ts` loads validated public configuration, imports environment secrets into the process-only `CredentialStore`, registers each configured upstream as an OMP provider, and registers `/router`.

Each OMP provider uses a unique custom API identifier and a `streamSimple` callback. The callback selects a credential through `CredentialRouter`, invokes OMP's exported OpenAI-completions transport with that key, and waits for the transport's first event. An error before `start` is classified and may rotate; after `start`, all events are forwarded without replay.

State transitions:

- 401: credential is invalid and disabled.
- quota-like 403: exhausted.
- 429: cooldown until provider hint or exponential deadline.
- 408/network/5xx: transient; next credential is tried.
- 400/ordinary 403/404/422: returned as-is; no rotation.

No secret reaches command output, metadata, log formatting, or disk storage. The public OMP extension API currently exposes no secret store or masked text input, which is why import is environment-only.

## V2 routing

The router first limits candidates to the lowest numeric credential-priority tier. `fill-first` and `fallback` select its first available entry; `weighted` samples that tier by positive integer `weight`; `least-used` compares success count then `lastUsedAt`; and round-robin preserves its cursor within the tier.

`ProviderQuotaTracker` records only aggregate request/rate-limit/exhaustion outcomes. For a configured fallback chain, the transport finishes all allowed key attempts for the source provider before trying the next enabled provider that declares the same requested model id. Each provider fallback still obeys the no-replay stream boundary.

## V3 OAuth boundary

The OMP public extension contract permits registration of an OAuth `login`, `refreshToken`, and `getApiKey` callback, but provides no credential account list, account selection, or extension-facing AuthStorage CRUD. The plugin must not import OMP internals or create a competing encrypted credential store. OAuth pools for Claude Code, Codex, and Gemini remain blocked until that public contract exists. `/router dashboard` is a local terminal summary, not an OAuth dashboard.
