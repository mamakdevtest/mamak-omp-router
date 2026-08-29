# Mamak Router Memory

## Upstream contract

Validated against OMP main package version 18.0.11. Marketplace catalog is repository-root `.omp-plugin/marketplace.json`; plugin package declares `omp.extensions` with a default extension factory. Public runtime APIs used: `ExtensionAPI.registerProvider`, `ExtensionAPI.registerCommand`, and provider `streamSimple`.

## Packaging

Marketplace id: `mamak-router@mamak-omp-router`. Catalog source is `./mamak-router` under `metadata.pluginRoot: "plugins"`. OMP commands: `omp plugin marketplace add`, `omp plugin install`, `omp plugin marketplace update`, and `omp plugin upgrade`.

## Architecture

The plugin registers a distinct `mamak-router-<provider>` OMP provider for each configured OpenAI-compatible endpoint. It loads only endpoint/model/routing configuration from `MAMAK_ROUTER_CONFIG`; secrets come from provider pool environment variables and remain in memory. `CredentialRouter` owns strategy, state transitions, cap, and retry selection. The custom stream retries only before OMP's OpenAI transport has emitted `start`.

## Compatibility

Plugin 0.1.x peers: `@oh-my-pi/pi-ai` and `@oh-my-pi/pi-coding-agent` `>=18.0.11 <19`. Marketplace metadata has no OMP compatibility field.

## Known limitations

OMP's public extension API has no secret store, credential CRUD, keychain, masked input, or persistent plugin config. `/router add` safely directs users to environment import. All management changes are session-only. OAuth pools are intentionally out of scope. Retry headers may not survive OMP's normalized built-in OpenAI stream error.

## Next work

V2: fill-first/weighted/least-used strategies, priority, quota tracking, and cross-provider chains. V3: OAuth pools and dashboard after public OMP credential APIs exist.
