# Configuration

Configuration is environment-only for secrets. `MAMAK_ROUTER_CONFIG` accepts JSON with public endpoint/model/routing data and must never contain API keys.

```json
{
  "routing": {
    "maxAttemptsPerRequest": 5,
    "defaultStrategy": "round-robin",
    "cooldown": { "defaultSeconds": 30, "maxSeconds": 600 }
  },
  "providers": [
    {
      "id": "deepseek",
      "enabled": true,
      "baseUrl": "https://api.deepseek.com/v1",
      "models": ["deepseek-chat", "deepseek-reasoner"],
      "strategy": "round-robin"
    }
  ]
}
```

For provider `custom-openai`, use `MAMAK_ROUTER_CUSTOM_OPENAI_KEYS`. Legacy aliases are `DEEPSEEK_KEYS`, `OPENROUTER_KEYS`, and `ZAI_KEYS`. Comma-separated values are trimmed, empty entries ignored, and duplicate values are rejected by SHA-256 fingerprint without logging the key.

Credentials are live only for the current process. Disable/remove changes made by `/router` disappear on restart unless the source environment is changed.

## V2 scheduling and provider fallback

`strategy` supports `round-robin`, `fallback`, `fill-first`, `weighted`, and `least-used`.
The lowest numeric `priority` is the active tier; lower-priority credentials are used only after that tier is unavailable. `weight` applies within the active tier.

```json
{
  "providers": [
    {
      "id": "primary",
      "enabled": true,
      "baseUrl": "https://primary.example/v1",
      "models": ["shared-model"],
      "strategy": "weighted",
      "credentialPolicies": [
        { "id": "primary-1", "priority": 0, "weight": 8 },
        { "id": "primary-2", "priority": 0, "weight": 2 },
        { "id": "primary-3", "priority": 1 }
      ],
      "fallbackProviders": ["secondary"]
    },
    {
      "id": "secondary",
      "enabled": true,
      "baseUrl": "https://secondary.example/v1",
      "models": ["shared-model"]
    }
  ]
}
```

`credentialPolicies` references generated environment-import ids, never a secret. A fallback target must define the requested model id. It is tried only after every allowed key attempt on the source provider fails before stream output begins.

`/router quota [provider]` reports in-memory request, 429, and quota-exhaustion counters. `/router dashboard` combines current credential health with these provider counters.
