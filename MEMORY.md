# Mamak Router Memory

## Upstream contract

Validated against OMP main package version 18.0.11. Marketplace catalog is repository-root `.omp-plugin/marketplace.json`; plugin package declares `omp.extensions` with a default extension factory. Public runtime APIs used: `ExtensionAPI.registerProvider`, `ExtensionAPI.registerCommand`, and provider `streamSimple`.

## Packaging

Marketplace id: `mamak-router@mamak-omp-router`. Catalog source is `./mamak-router` under `metadata.pluginRoot: "plugins"`. OMP commands: `omp plugin marketplace add`, `omp plugin install`, `omp plugin marketplace update`, and `omp plugin upgrade`.

## Architecture

The plugin registers a distinct `mamak-router-<provider>` OMP provider for each configured OpenAI-compatible endpoint. It loads only endpoint/model/routing configuration from `MAMAK_ROUTER_CONFIG`; secrets come from provider pool environment variables and remain in memory. `CredentialRouter` owns priority-tiered round-robin, fallback/fill-first, weighted, and least-used selection plus a hard cap. The custom stream retries keys, then compatible configured provider fallbacks, only before OMP's OpenAI transport has emitted `start`.

## Compatibility

Plugin 0.1.x peers: `@oh-my-pi/pi-ai` and `@oh-my-pi/pi-coding-agent` `>=18.0.11 <19`. Marketplace metadata has no OMP compatibility field.

## Known limitations

OMP's public extension API has no secret store, credential CRUD, keychain, masked input, persistent plugin config, or OAuth account list/selection API. `/router add` safely directs users to environment import. All management changes are session-only. The V2 quota tracker records in-memory outcomes, not raw quota headers when OMP normalizes them. OAuth pools cannot use OMP's internal AuthStorage safely.

## V2 status

Implemented: credential priority/weight policy, fill-first, weighted, least-used, provider fallback chains for matching model ids, outcome counters, `/router quota`, and local `/router dashboard`.

## V3 blocker

`ProviderConfig.oauth` offers a host-managed login and refresh callback but no extension-facing account enumeration, credential selection, or credential-store CRUD. Claude Code, Codex, and Gemini OAuth pools therefore require a new public upstream credential-pool API; do not bypass this with internal imports or duplicate encrypted storage.
