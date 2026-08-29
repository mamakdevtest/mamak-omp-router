# Mamak Router — oh-my-pi Multi-Account / Multi-API-Key Marketplace Plugin

## AMAÇ

`oh-my-pi` için core koduna mümkün olduğunca dokunmadan çalışan, ayrı GitHub reposunda geliştirilebilen ve oh-my-pi Marketplace/extension sistemi üzerinden kurulabilen bir router plugin oluştur.

Ana hedef:

Bir provider için birden fazla API key / credential tanımlayabilelim ve istek başarısız olduğunda otomatik olarak sıradaki sağlıklı credential'a geçelim.

Örnek:

```text
DeepSeek
├── key-001
├── key-002
├── key-003
├── key-004
└── ...

OpenRouter
├── key-001
├── key-002
└── ...

OpenAI-compatible-provider
├── key-001
├── key-002
└── ...
```

İstek akışı:

```text
Request
  ↓
Credential 1
  ↓
Success → return
  ↓ failure
Credential 2
  ↓
Success → return
  ↓ failure
Credential 3
```

Bu plugin oh-my-pi upstream repo'sundan bağımsız yaşamalı.

---

# 1. ÖNCE ARAŞTIR

Kod yazmadan önce güncel oh-my-pi reposunu incele:

```text
https://github.com/can1357/oh-my-pi
```

Özellikle araştır:

* extension API
* `registerProvider`
* `registerCommand`
* provider registration
* custom provider transport
* marketplace formatı
* `.omp-plugin`
* `marketplace.json`
* plugin package formatı
* plugin discovery
* plugin install
* plugin update
* plugin versioning
* provider model registration
* auth/credential storage API
* extension config storage
* secret storage
* environment variable kullanımı
* request/response hooks varsa bunlar
* error handling API
* streaming response desteği
* OpenAI-compatible provider implementasyonları

Repo içerisindeki mevcut extension/plugin örneklerini mutlaka incele.

Tahmin ederek API yazma.

Güncel source code'a göre implementasyon yap.

---

# 2. GITHUB REPO YAPISI

Yeni bağımsız repo oluşturulacak.

Önerilen repo adı:

```text
mamak-omp-router
```

Alternatifler:

```text
omp-multi-account-router
oh-my-pi-router
```

Tercih:

```text
mamak-omp-router
```

Repo yapısı mümkün olduğunca aşağıdaki gibi olsun:

```text
mamak-omp-router/
│
├── .omp-plugin/
│   └── marketplace.json
│
├── plugins/
│   └── mamak-router/
│       ├── package.json
│       ├── tsconfig.json
│       ├── README.md
│       │
│       └── src/
│           ├── index.ts
│           │
│           ├── provider/
│           │   ├── register-provider.ts
│           │   ├── model-registry.ts
│           │   └── request-adapter.ts
│           │
│           ├── router/
│           │   ├── credential-router.ts
│           │   ├── strategies.ts
│           │   ├── health-manager.ts
│           │   ├── error-classifier.ts
│           │   └── cooldown-manager.ts
│           │
│           ├── credentials/
│           │   ├── credential-store.ts
│           │   ├── credential-types.ts
│           │   └── credential-import.ts
│           │
│           ├── commands/
│           │   ├── router-command.ts
│           │   ├── add-command.ts
│           │   ├── list-command.ts
│           │   ├── remove-command.ts
│           │   ├── enable-command.ts
│           │   ├── disable-command.ts
│           │   └── status-command.ts
│           │
│           └── config/
│               ├── schema.ts
│               ├── loader.ts
│               └── defaults.ts
│
├── docs/
│   ├── INSTALL.md
│   ├── CONFIGURATION.md
│   ├── ARCHITECTURE.md
│   └── DEVELOPMENT.md
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
│
├── LICENSE
├── README.md
└── package.json
```

Eğer güncel oh-my-pi Marketplace formatı farklıysa bu yapıyı gerçek formata adapte et.

---

# 3. TEMEL PRENSİP

oh-my-pi core dosyalarını değiştirme.

İlk hedef tamamen:

```text
external plugin / extension
```

olarak çalışmak.

Sadece güncel extension API'si teknik olarak yetersizse bunu raporla.

Core patch gerekiyorsa önce neden gerektiğini açıkça belirt.

Core'a patch uygulamak SON ÇARE olsun.

---

# 4. V1 SCOPE

İlk sürümü gereksiz büyütme.

V1 sadece aşağıdakileri desteklesin.

## 4.1 Multi API Key

Bir provider altında sınırsız sayıda credential tutulabilsin.

Örnek:

```json
{
  "providers": {
    "deepseek": {
      "strategy": "round-robin",
      "credentials": [
        {
          "id": "deepseek-1",
          "secretRef": "..."
        },
        {
          "id": "deepseek-2",
          "secretRef": "..."
        }
      ]
    }
  }
}
```

API key'leri mümkünse plaintext config içine yazma.

Öncelik:

1. oh-my-pi secret / credential storage
2. sistem keychain varsa onu kullan
3. environment variable
4. yalnızca zorunluysa encrypted local storage

README içinde credential güvenlik modelini açıkla.

---

# 5. CREDENTIAL MODEL

Her credential için en az:

```ts
interface RouterCredential {
  id: string
  providerId: string

  enabled: boolean

  status:
    | "healthy"
    | "cooldown"
    | "rate_limited"
    | "invalid"
    | "exhausted"
    | "disabled"

  priority?: number

  successCount: number
  failureCount: number

  lastUsedAt?: number
  lastFailureAt?: number

  cooldownUntil?: number
}
```

Secret değeri mümkünse bu obje içerisinde tutulmasın.

Sadece secret reference kullan.

---

# 6. ROUTING STRATEGY

V1'de iki strategy yeterli:

```text
round-robin
fallback
```

## Round Robin

```text
request 1 → credential 1
request 2 → credential 2
request 3 → credential 3
request 4 → credential 1
```

Disabled veya cooldown credential'lar atlanmalı.

## Fallback

```text
credential 1
↓ error
credential 2
↓ error
credential 3
```

Başarılı credential bulunduğunda dur.

Provider bazında strategy seçilebilsin.

---

# 7. ERROR CLASSIFICATION

Mutlaka merkezi `error-classifier.ts` oluştur.

En az:

```text
401
→ invalid credential
→ disable

403
→ quota / permission hatasını ayırmaya çalış
→ quota ise exhausted
→ aksi halde normal error

408
→ transient
→ next credential

429
→ rate limited
→ cooldown
→ next credential

500
502
503
504
→ transient
→ next credential
```

Network timeout:

```text
→ next credential
```

DNS/network hataları:

```text
→ next credential
```

Ama yanlış request nedeniyle oluşan:

```text
400
404
422
```

gibi hatalarda key değiştirmek yerine asıl hatayı kullanıcıya döndür.

Aksi halde aynı bozuk isteği 1000 credential üzerinden göndermesin.

---

# 8. COOLDOWN

429 alan credential otomatik cooldown'a girsin.

Default:

```text
60 seconds
```

Ama mümkünse response header kullan:

```text
Retry-After
x-ratelimit-reset
```

Provider bilgisi varsa gerçek reset zamanını kullan.

Yoksa exponential cooldown:

```text
1. failure → 30 sec
2. failure → 60 sec
3. failure → 120 sec
4. failure → 300 sec
```

Maksimum cooldown konfigüre edilebilir olsun.

---

# 9. RETRY SINIRI

En kritik güvenliklerden biri.

1000 API key eklenmiş olsa bile tek request:

```text
1000 credential
```

üzerinden geçmesin.

Default:

```text
maxAttemptsPerRequest = 5
```

Config ile değiştirilebilir olsun.

Örnek:

```json
{
  "maxAttemptsPerRequest": 5
}
```

---

# 10. STREAMING

oh-my-pi streaming kullanıyorsa streaming desteğini düzgün ele al.

Önemli kural:

Response stream'den kullanıcıya token gitmeye başladıktan sonra başka credential ile aynı request'i otomatik tekrar gönderme.

Yani:

```text
request
↓
provider cevap vermedi
↓
credential rotate
```

olabilir.

Ama:

```text
token 1
token 2
token 3
↓
stream koptu
```

sonrasında otomatik başka credential ile request'i sıfırdan replay etme.

Duplicate output oluşturabilir.

Bu durumda normal stream error dön.

---

# 11. PROVIDER YAPISI

Plugin mümkünse:

```ts
pi.registerProvider(...)
```

veya güncel oh-my-pi equivalent API'si ile gerçek bir provider oluştursun.

Provider ismi:

```text
mamak-router
```

veya:

```text
router
```

Model tarafında mümkünse upstream provider modellerini mirror et.

Örnek:

```text
router/deepseek/deepseek-v4
router/openrouter/anthropic/claude-sonnet
router/openai/gpt-*
```

Ancak kullanıcı deneyimi için daha iyi bir yöntem varsa güncel API'ye göre uygula.

Amaç:

Model seçildiğinde router hangi gerçek provider'a göndereceğini bilsin.

---

# 12. PROVIDER ADAPTER

İlk aşamada bütün dünyadaki provider'ları özel olarak yazma.

Önce OpenAI-compatible provider'ları destekle.

Minimum:

```text
DeepSeek
OpenRouter
Z.AI
OpenAI-compatible custom endpoint
```

Provider config örneği:

```json
{
  "providers": {
    "deepseek": {
      "baseUrl": "https://api.deepseek.com/v1",
      "strategy": "round-robin"
    }
  }
}
```

Sonra generic:

```text
custom-openai
```

desteği ekle.

Kullanıcı:

```text
baseUrl
api key pool
models
```

tanımlayabilsin.

---

# 13. OAUTH V1'DE YOK

V1'de OAuth credential sistemini yeniden yazma.

Claude Code, Codex, Gemini gibi OAuth hesapları için mevcut oh-my-pi mekanizmasını kullan.

V1 scope:

```text
API-key based routing
```

README içerisinde açıkça belirt.

Daha sonra V2'de OAuth routing araştırılabilir.

---

# 14. COMMANDLAR

oh-my-pi extension API destekliyorsa şu slash command'ları oluştur.

## `/router status`

Örnek çıktı:

```text
Mamak Router

DeepSeek
Healthy: 4
Cooldown: 1
Disabled: 0
Total: 5

OpenRouter
Healthy: 7
Cooldown: 0
Disabled: 1
Total: 8
```

## `/router list`

Provider ve credential listesi.

API key'in kendisini ASLA gösterme.

Sadece:

```text
deepseek-01   ****7F3A   healthy
deepseek-02   ****C21B   cooldown
```

gibi fingerprint göster.

## `/router add`

Mümkünse interaktif credential ekleme.

Örnek:

```text
/router add deepseek
```

Sonra güvenli input üzerinden API key al.

Eğer extension API secure secret input desteklemiyorsa API key'i chat history'ye yazdırma.

Alternatif:

environment variable/import yöntemi kullan.

## `/router remove`

```text
/router remove deepseek deepseek-03
```

## `/router enable`

## `/router disable`

## `/router strategy`

Örneğin:

```text
/router strategy deepseek round-robin
```

---

# 15. BULK IMPORT

Çok hesap eklemek istediğim için bulk import önemli.

Ancak secret güvenliğini koru.

Örnek `.env`:

```text
DEEPSEEK_KEYS=key1,key2,key3
OPENROUTER_KEYS=key1,key2,key3
```

veya:

```text
DEEPSEEK_KEY_001=
DEEPSEEK_KEY_002=
DEEPSEEK_KEY_003=
```

Plugin başlangıçta bunları credential pool'a import edebilsin.

Duplicate key eklenmesini engelle.

Secret'ın SHA-256 fingerprint'ini kullanarak duplicate kontrol yapılabilir.

Tam secret loglama.

---

# 16. LOGGING

Secret değerlerini hiçbir koşulda loglama.

Log örneği:

```text
[router]
provider=deepseek
credential=deepseek-04
attempt=2
result=429
action=cooldown
```

Olabilir.

Ama:

```text
api_key=sk-xxxxx
```

ASLA.

---

# 17. CONFIG

Örnek config:

```json
{
  "router": {
    "maxAttemptsPerRequest": 5,
    "defaultStrategy": "round-robin",

    "cooldown": {
      "defaultSeconds": 60,
      "maxSeconds": 600
    }
  },

  "providers": {
    "deepseek": {
      "enabled": true,
      "baseUrl": "https://api.deepseek.com/v1",
      "strategy": "round-robin"
    },

    "openrouter": {
      "enabled": true,
      "baseUrl": "https://openrouter.ai/api/v1",
      "strategy": "fallback"
    }
  }
}
```

Schema validation kullan.

Config bozuksa açık hata göster.

---

# 18. MARKETPLACE

oh-my-pi'nin güncel Marketplace spesifikasyonunu source code ve resmi dokümantasyondan öğren.

Repo root'ta gerekli marketplace manifestini oluştur.

Örnek mantık:

```text
.omp-plugin/
└── marketplace.json
```

Ama güncel format ne ise onu kullan.

Plugin:

```text
Mamak Router
```

olarak marketplace'te listelenebilmeli.

Metadata:

```text
name
displayName
description
version
repository
author
license
keywords
```

Keywords:

```text
router
multi-account
multi-api-key
fallback
round-robin
provider
rate-limit
```

---

# 19. KURULUM UX

README'de mümkün olan en kısa kurulumu oluştur.

Hedef UX:

```text
1. Marketplace ekle
2. Plugin install
3. Key'leri ekle
4. Router provider seç
5. Kullan
```

Örneğin güncel oh-my-pi komutları destekliyorsa:

```text
/marketplace add YOUR_GITHUB_USERNAME/mamak-omp-router
/marketplace install mamak-router
```

Gerçek syntax repo üzerinden doğrulanmalı.

Tahmin ederek dokümantasyon yazma.

---

# 20. UPDATE SİSTEMİ

Plugin upstream oh-my-pi'den bağımsız güncellenmeli.

GitHub repo:

```text
YOUR_GITHUB_USERNAME/mamak-omp-router
```

Versioning:

```text
Semantic Versioning
```

Örnek:

```text
0.1.0
0.2.0
0.2.1
1.0.0
```

Release oluşturulduğunda plugin marketplace upgrade mekanizmasıyla güncellenebilmeli.

GitHub Actions ile:

```text
lint
typecheck
unit test
build
```

çalıştır.

Release workflow mümkünse tag üzerinden çalışsın:

```text
v0.1.0
```

---

# 21. UPSTREAM UYUMLULUK

Oh-my-pi sürekli gelişiyor.

Bu nedenle:

* internal/private API import etme
* mümkün olduğunca documented extension API kullan
* core package içerisinde derin relative import yapma
* stable/public API kullan
* oh-my-pi version compatibility belirt

Örneğin:

```json
{
  "peerDependencies": {
    "oh-my-pi": ">=x.y.z"
  }
}
```

Eğer gerçek package ismi farklıysa doğru package adını kullan.

Compatibility matrisi oluştur:

```text
Plugin 0.1.x → OMP >= X
Plugin 0.2.x → OMP >= Y
```

---

# 22. TESTLER

Kodlama tamamlanana kadar ağır smoke-test süreçlerine girme.

Önce implementation tamamen bitir.

Sonra açıkça:

```text
Implementation complete.
Starting validation phase.
```

diye belirt.

Minimum testler:

### Router

* round robin sıra kontrolü
* disabled credential skip
* cooldown credential skip
* all credentials unavailable

### Error classification

* 401
* 403
* 408
* 429
* 500
* 502
* 503
* timeout
* 400 no rotation

### Cooldown

* expiry
* exponential increase

### Security

* secret loglanmıyor
* duplicate credential eklenmiyor

### Retry

* maxAttemptsPerRequest aşılmıyor

---

# 23. SUBAGENT KULLANIMI

Eğer agent sistemi subagent destekliyorsa paralel çalıştır.

Önerilen görev dağılımı:

```text
Agent 1
→ oh-my-pi extension API araştırması

Agent 2
→ Marketplace formatı ve plugin örnekleri

Agent 3
→ Provider API ve streaming incelemesi

Agent 4
→ Credential router implementasyonu

Agent 5
→ CLI/slash commands

Agent 6
→ Tests + security audit
```

Ancak agent'lar aynı dosyayı eşzamanlı değiştirmesin.

Ana agent:

* mimari kararları verir
* branch/state kontrol eder
* ortak interface'leri önce oluşturur
* agent çıktılarını sırayla merge eder

---

# 24. PHASE DOSYASI

Repo root'una:

```text
PHASES.md
```

oluştur.

Örnek:

```markdown
# Mamak Router Development

## Phase 1 — Research
- [ ] OMP extension API
- [ ] Marketplace format
- [ ] Provider registration
- [ ] Secret storage

## Phase 2 — Core Router
- [ ] Credential model
- [ ] Round robin
- [ ] Fallback
- [ ] Error classifier
- [ ] Cooldown

## Phase 3 — OMP Integration
- [ ] Provider registration
- [ ] Model routing
- [ ] Streaming

## Phase 4 — Commands
- [ ] status
- [ ] list
- [ ] add
- [ ] remove
- [ ] enable/disable

## Phase 5 — Marketplace
- [ ] manifest
- [ ] install
- [ ] upgrade

## Phase 6 — Validation
- [ ] tests
- [ ] build
- [ ] smoke test
- [ ] documentation
```

Her tamamlanan işi burada işaretle.

---

# 25. MEMORY DOSYASI

`MEMORY.md` oluştur.

Şunları kaydet:

* kullanılan OMP extension API'leri
* Marketplace manifest formatı
* önemli path'ler
* mimari kararlar
* compatibility bilgisi
* known limitations
* sonraki TODO'lar

Böylece sonraki coding-agent oturumunda proje hızlı anlaşılır.

---

# 26. README

README profesyonel olsun.

Şunları içersin:

```text
Mamak Router
Multi-account credential routing for oh-my-pi.

Features
Installation
Quick Start
Adding Credentials
Routing Strategies
Commands
Configuration
Security
Marketplace Updates
Compatibility
Development
Limitations
Roadmap
```

README başında net örnek:

```text
DeepSeek
key-1 → 429
key-2 → 429
key-3 → success
```

---

# 27. V1'DE YAPILMAYACAKLAR

Scope'u büyütme.

V1'de YAPMA:

```text
web dashboard
React UI
database cluster
distributed router
proxy rotation
quota analytics charts
billing
OAuth implementation
provider-to-provider AI model fallback
ML based routing
complex weighted scheduling
```

V1 tamamlandıktan sonra roadmap'e yaz.

---

# 28. ROADMAP

V2:

```text
fill-first
weighted routing
least-used
quota tracking
provider fallback chains
credential priorities
```

V3:

```text
OAuth account pools
Claude Code accounts
Codex accounts
Gemini accounts
central router dashboard
```

---

# 29. GITHUB

Repo oluşturulduğunda ilk commit temiz olsun.

Önerilen commit:

```text
feat: initialize oh-my-pi multi-account router plugin
```

Branch strategy basit olsun:

```text
main
dev
feature/*
```

Ancak tek geliştirici isek gereksiz branch karmaşası oluşturma.

`main` her zaman çalışır durumda olsun.

---

# 30. EN ÖNEMLİ KURAL

Amacımız oh-my-pi'nin alternatifini yazmak değil.

Amacımız:

```text
oh-my-pi
+
small external router plugin
```

oluşturmak.

Bir özellik OMP'de zaten varsa yeniden implement etme.

OMP'nin mevcut sistemini kullan.

Plugin kodunu mümkün olduğunca küçük, izole ve upstream değişikliklerine dayanıklı tut.

---

# BEKLENEN SONUÇ

İş tamamlandığında şu deneyimi yaşayabilmeliyim:

```text
oh-my-pi
↓
install mamak-router
↓
add DeepSeek keys
↓
10 / 100 / 1000 key
↓
select DeepSeek model
↓
request
↓
key 1 rate limited
↓
key 2 automatically selected
↓
response continues normally
```

Aynı zamanda oh-my-pi yeni sürüme geçtiğinde:

```text
oh-my-pi update
```

yapabileyim ve router plugin bağımsız kalmaya devam etsin.

Marketplace üzerinden router için ayrıca:

```text
upgrade
```

yapabileyim.

---

# ÇALIŞMA ŞEKLİ

Önce araştır.

Sonra mimariyi kısa şekilde raporla.

Ardından doğrudan implementasyona geç.

Bilinen bir OMP API'sini tahmin etme; source code ile doğrula.

Gereksiz soru sorma.

Makûl kararları kendin ver.

Öncelik sırası:

```text
working plugin
>
upstream compatibility
>
security
>
simple architecture
>
extra features
```

Implementation tamamen bittikten sonra test aşamasına geç ve bunu ayrıca bildir.

Final çıktıda bana şunları ver:

1. Oluşturulan repo yapısı
2. Marketplace kurulum komutları
3. Plugin kurulum komutları
4. Key ekleme yöntemi
5. Router kullanımı
6. Update yöntemi
7. Desteklenen provider'lar
8. Known limitations
9. V2 roadmap
