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
