# Development

Requires Bun 1.3.14 or newer.

```sh
bun install
bun run typecheck
bun run test
bun run build
```

Tests cover router selection, error classification, cooldown timing, duplicate imports, secret-safe summaries, and the retry cap. No test uses a live provider key.

The extension uses only public package imports and the documented default extension factory/`registerProvider`/`registerCommand` contract from OMP 18.0.11. Do not replace environment import with chat input until OMP adds a secure extension input and secret storage API.
