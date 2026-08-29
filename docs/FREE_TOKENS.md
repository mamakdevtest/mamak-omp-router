# Free Token Havuzları

Mamak Router free API key'leri aynı anda pool'lar — tek başına `/login` OAuth değil.

## Desteklenen free gateway'ler (varsayılan 6 provider)

| Router id | BaseUrl | Örnek modeller | Env var |
|---|---|---|---|
| `deepseek` | `https://api.deepseek.com/v1` | `deepseek-chat` | `MAMAK_ROUTER_DEEPSEEK_KEYS` veya `DEEPSEEK_KEYS` |
| `openrouter` | `https://openrouter.ai/api/v1` | `deepseek/deepseek-chat` | `MAMAK_ROUTER_OPENROUTER_KEYS` |
| `zai` | `https://api.z.ai/api/paas/v4` | `glm-4.7` | `MAMAK_ROUTER_ZAI_KEYS` / `ZAI_KEYS` |
| `opencode-zen` | `https://opencode.ai/zen/v1` | `big-pickle`, `minimax-m2` | `MAMAK_ROUTER_OPENCODE_ZEN_KEYS` |
| `groq` | `https://api.groq.com/openai/v1` | `openai/gpt-oss-120b` | `MAMAK_ROUTER_GROQ_KEYS` |
| `cerebras` | `https://api.cerebras.ai/v1` | `qwen-3-coder-480b` | `MAMAK_ROUTER_CEREBRAS_KEYS` |

Hepsi OpenAI-compatible — virgülle ayır, boşlukları router temizler, duplicate key SHA-256 ile atılır.

## Hızlı kurulum (ZAI + Opencode Zen)

```sh
export MAMAK_ROUTER_ZAI_KEYS="zai-key-1,zai-key-2,zai-key-3"
export MAMAK_ROUTER_OPENCODE_ZEN_KEYS="zen-key-1,zen-key-2"
export MAMAK_ROUTER_GROQ_KEYS="groq-key-1,groq-key-2,groq-key-3,groq-key-4"
omp
```

TUI içinde:

```text
/router status        # her provider: Healthy/Cooldown/Total
/router list zai      # ****ABCD healthy
/router dashboard     # tüm havuzlar + modeller + quota
/router quota groq    # requests/rate-limits/exhausted
```

Model seçimi:

```text
mamak-router-zai/glm-4.7
mamak-router-opencode-zen/big-pickle
mamak-router-groq/openai/gpt-oss-120b
mamak-router-cerebras/qwen-3-coder-480b
```

## Coder / Codex / Common Code

- **Coder** (Qwen Coder, DeepSeek Coder, Kimi K2): `groq` veya `cerebras` havuzuna free key olarak ekle — router load-balancing yapar.
- **Codex**: OMP native `/login codex` OAuth ile giriş yapılır, router havuzu değil. Eğer Codex'i OpenAI-compatible proxy arkasında API key ile kullanıyorsan, `MAMAK_ROUTER_CONFIG` ile custom provider ekle.
- **Common Code**: tüm kod modellerini `opencode-zen` + `groq` havuzlarında topla, `/router strategy <provider> weighted` ile ağırlıklı dağıt.

## Dashboard

`/router dashboard` her provider için:

```text
zai — https://api.z.ai/api/paas/v4
credentials: healthy=2 cooldown=0 total=2
models: glm-4.7
quota: requests=42 rate-limits=1 exhausted=0
```

`credentials: 0 (set MAMAK_ROUTER_...)` görürsen env var eksiktir — set et, oturumu restart et.

## Fallback zinciri ve priority

```json
{
  "providers": [{
    "id": "zai",
    "enabled": true,
    "baseUrl": "https://api.z.ai/api/paas/v4",
    "models": ["glm-4.7"],
    "fallbackProviders": ["opencode-zen", "groq"],
    "credentialPolicies": [{ "id": "zai-1", "priority": 0, "weight": 3 }]
  }]
}
```

`priority` düşük olan önce denenir, `weight` aynı tier içinde oransal, `fallbackProviders` sadece stream `start` öncesi hata ve aynı `model id` varsa devreye girer.

## Önemli: `/router` slash ile

`router` yazıp enter ≠ komut. Mutlaka:

```text
/router status
/router dashboard
```

diye slash ile çağır. Düz `router` LLM'e gider ve hata gibi görünür.
