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

Model seçimi — **artık normal provider doğrudan havuzlu** (linked):

```text
groq/openai/gpt-oss-120b              # önce GROQ_API_KEY dene, yok/hata → MAMAK_ROUTER_GROQ_KEYS pool
zai/glm-4.7                            # önce ZAI_API_KEY, yok/hata → MAMAK_ROUTER_ZAI_KEYS
opencode-zen/big-pickle               # önce OPENCODE_ZEN_API_KEY, yok/hata → MAMAK_ROUTER_OPENCODE_ZEN_KEYS
# pool-only (garantili havuz, normal key denenmez):
mamak-router-groq/openai/gpt-oss-120b
mamak-router-zai/glm-4.7
```

Router havuzundaki keyler normal provider'ın **içine** girer: provider'da key yoksa veya 401/429/5xx verirse aynı request havuzdan devam eder (400/404/422 dönerse pool'a düşmez). `/router status`’ta her provider `[linked]` olarak görünür.

## Dashboard (linked bilgisi)

`/router dashboard` her provider için `linked` ve `normalKey` durumunu gösterir:

```text
┌ groq — https://api.groq.com/openai/v1 [linked, normal:missing]
│ credentials: healthy=2 cooldown=0 total=2
│ models: openai/gpt-oss-120b, moonshotai/kimi-k2-instruct  (linked: groq/<model>  pool-only: mamak-router-groq/<model>)
│ quota: requests=42 rate-limits=1 exhausted=0
```

`linked` kapanırsa `MAMAK_ROUTER_CONFIG`'ta `"linkNormalProvider": false` yap — o zaman sadece `mamak-router-*` çalışır. `credentials: 0 (set MAMAK_ROUTER_...)` görürsen env var eksiktir — set et, oturumu restart et.
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
