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
