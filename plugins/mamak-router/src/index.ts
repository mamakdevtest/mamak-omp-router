import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { RouterPluginConfig } from "./config/schema";
import { registerRouterCommand, type RouterCommandState } from "./commands/router-command";
import { loadRouterConfig } from "./config/loader";
import type { CredentialSecret } from "./credentials/credential-types";
import { CredentialStore } from "./credentials/credential-store";
import { CredentialRouter } from "./router/credential-router";
import { importCredentialsFromEnvironment, sha256Fingerprint } from "./credentials/credential-import";
import { ProviderQuotaTracker } from "./router/quota-tracker";
import { createLinkedProviderStream } from "./provider/request-adapter";
import { registerRouterProviders, type RouterProviderRegistration } from "./provider/register-provider";
export default async function mamakRouter(pi: ExtensionAPI): Promise<void> {
	const config = loadRouterConfig();
	const store = new CredentialStore();
	const imported = await importCredentialsFromEnvironment(store, config.providers);
	const registration = registerRouterProviders(pi, config, store);

	pi.setLabel("Mamak Router");
	pi.logger.info(
		`[mamak-router] providers=${registration.routers.size} credentials=${imported.added.length} duplicates=${imported.duplicateCount}`,
	);
	registerRouterCommand(pi, createCommandState(pi, config, store, registration));
}

function getBaseUrlForProvider(id: string): string | undefined {
	const map: Record<string, string> = {
		"deepseek": "https://api.deepseek.com/v1",
		"openrouter": "https://openrouter.ai/api/v1",
		"zai": "https://api.z.ai/api/paas/v4",
		"opencode-zen": "https://opencode.ai/zen/v1",
		"groq": "https://api.groq.com/openai/v1",
		"cerebras": "https://api.cerebras.ai/v1",
		"openai": "https://api.openai.com/v1",
		"anthropic": "https://api.anthropic.com",
		"google": "https://generativelanguage.googleapis.com/v1",
		"mistral": "https://api.mistral.ai/v1",
		"minimax": "https://api.minimax.chat/v1",
		"qwen": "https://dashscope.aliyuncs.com/compatible-mode/v1",
	};
	return map[id];
}

function createCommandState(
	pi: ExtensionAPI,
	config: RouterPluginConfig,
	store: CredentialStore,
	registration: RouterProviderRegistration,
): RouterCommandState {
	return {
		status() {
			const lines = ["Mamak Router — type /router for completions (linked = normal provider → pool fallback)"];
			for (const provider of config.providers) {
				const summaries = store.listSummaries(provider.id);
				const count = (status: string) => summaries.filter(credential => credential.status === status).length;
				const linked = (provider.linkNormalProvider ?? true) ? "linked" : "isolated";
				const normalEnv = `${provider.id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`;
				const normalPresent = process.env[normalEnv] ? "present" : "missing";
				lines.push(
					"",
					`${provider.id} — ${provider.baseUrl} [${linked}, normalKey:${normalPresent}]`,
					`Healthy: ${count("healthy")}  Cooldown: ${count("cooldown") + count("rate_limited")}  Disabled: ${count("disabled") + count("invalid")}  Exhausted: ${count("exhausted")}  Total: ${summaries.length}`,
					`Models: ${provider.models.join(", ")}  (use ${provider.id}/<model> for linked, mamak-router-${provider.id}/<model> for pool-only)`,
				);
			}
			lines.push("", "Tip: /router dashboard for table, /router list <provider> for masked keys, export MAMAK_ROUTER_<PROVIDER>_KEYS for persistence.");
			return lines.join("\n");
		},
		list(providerId) {
			const summaries = store.listSummaries(providerId);
			if (summaries.length === 0) {
				const hint = providerId
					? `No credentials for ${providerId}. Add via /router add ${providerId} <key>  or  export MAMAK_ROUTER_${providerId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_KEYS=key1,key2 && restart.`
					: "No router credentials imported. Try /router add zai <key>  or  export MAMAK_ROUTER_ZAI_KEYS=key1,key2 && restart.";
				return hint;
			}
			return summaries
				.map(credential => `${credential.id}\t****${credential.fingerprint.slice(-4).toUpperCase()}\t${credential.status}${credential.priority !== undefined ? `\tp${credential.priority}` : ""}${credential.weight !== undefined ? `\tw${credential.weight}` : ""}`)
				.join("\n");
		},
		async add(providerId, secret) {
			const normalized = providerId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
			let cfg = config.providers.find(p => p.id === normalized);
			if (!cfg) {
				const baseUrl = getBaseUrlForProvider(normalized);
				if (!baseUrl) return `Router error: unknown provider ${providerId}. Known: ${config.providers.map(p => p.id).join(", ")} — add custom via MAMAK_ROUTER_CONFIG with baseUrl.`;
				cfg = { id: normalized, enabled: true, baseUrl, models: ["default"], linkNormalProvider: true };
				config.providers.push(cfg);
				const quotaTracker = new ProviderQuotaTracker(normalized);
				const router = new CredentialRouter([], { strategy: config.routing.defaultStrategy, settings: config.routing, quotaTracker });
				registration.routers.set(normalized, router);
				registration.quotaTrackers.set(normalized, quotaTracker);
				const targets = [{ providerId: normalized, baseUrl, models: cfg.models, router }];
				pi.registerProvider(normalized, {
					baseUrl,
					api: `mamak-router-linked-${normalized}` as never,
					apiKey: "MAMAK_ROUTER_MANAGED_KEY",
					streamSimple: createLinkedProviderStream(targets as never),
					models: cfg.models.map(id => ({ id, name: `${normalized}/${id} · Mamak Router`, api: `mamak-router-linked-${normalized}` as never, reasoning: false, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 16384, compat: {} })),
				});
				pi.logger.info(`[mamak-router] dynamically added provider ${normalized} via /router add`);
			}
			const trimmed = secret.trim();
			if (trimmed.length < 4) return "Router error: key too short";
			const fingerprint = await sha256Fingerprint(trimmed);
			const existingIds = store.listSummaries(normalized).map(s => s.id);
			const nextId = `${normalized}-${existingIds.length + 1}`;
			const credential = {
				id: nextId,
				providerId: normalized,
				enabled: true,
				status: "healthy" as const,
				successCount: 0,
				failureCount: 0,
				fingerprint,
			};
			const added = store.add({ credential, secret: trimmed });
			if (!added) return `Router skipped duplicate key (SHA-256 match) — see /router list ${normalized}`;
			const router = registration.routers.get(normalized);
			if (router) router.credentials.push({ credential, secret: trimmed });
			return `Added ${nextId} to ${normalized} (****${fingerprint.slice(-4).toUpperCase()}). Directly linked to ${normalized} — use ${normalized}/<model> and it will auto-fallback to this pool. Test: /router list ${normalized}  — persistence needs export MAMAK_ROUTER_${normalized.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_KEYS`;
		},
		remove(providerId, credentialId) {
			const credential = store.getSummary(credentialId);
			if (!credential || credential.providerId !== providerId) return `Router error: credential ${credentialId} was not found for ${providerId}.`;
			store.updateMetadata(credentialId, { enabled: false, status: "disabled" });
			store.remove(credentialId);
			const router = registration.routers.get(providerId);
			if (router) {
				const idx = router.credentials.findIndex((c: CredentialSecret) => c.credential.id === credentialId);
				if (idx >= 0) router.credentials.splice(idx, 1);
			}
			return `Removed ${credentialId} from this session. For persistence remove it from MAMAK_ROUTER_${providerId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_KEYS before restart.`;
		},
		setEnabled(providerId, credentialId, enabled) {
			const credential = store.getSummary(credentialId);
			if (!credential || credential.providerId !== providerId) return `Router error: credential ${credentialId} was not found for ${providerId}.`;
			store.updateMetadata(credentialId, {
				enabled,
				status: enabled ? "healthy" : "disabled",
				cooldownUntil: undefined,
			});
			return `${enabled ? "Enabled" : "Disabled"} ${credentialId}.`;
		},
		setStrategy(providerId, strategy) {
			const router = registration.routers.get(providerId);
			if (!router) return `Router error: provider ${providerId} is not registered.`;
			router.options.strategy = strategy;
			return `${providerId} strategy is now ${strategy} for this session.`;
		},
		quota(providerId) {
			const trackers = providerId
				? [registration.quotaTrackers.get(providerId)].filter((tracker): tracker is NonNullable<typeof tracker> => tracker !== undefined)
				: [...registration.quotaTrackers.values()];
			if (trackers.length === 0) return providerId ? `Router error: provider ${providerId} is not registered.` : "No provider quota data is available.";
			return trackers
				.map(tracker => {
					const quota = tracker.snapshot();
					return `${quota.providerId}: requests=${quota.requestCount} rate-limits=${quota.rateLimitCount} exhausted=${quota.exhaustedCount}${quota.lastStatus === undefined ? "" : ` last-status=${quota.lastStatus}`}`;
				})
				.join("\n");
		},
		dashboard() {
			const lines = ["Mamak Router Dashboard — Open WebUI style table (linked = normal→pool)", "Tip: Tab to complete, Enter to run. Add test keys: /router add <provider> <key>  (e.g. /router add zai burak-test-1)"];
			for (const provider of config.providers) {
				const summaries = store.listSummaries(provider.id);
				const quota = registration.quotaTrackers.get(provider.id)?.snapshot();
				const healthy = summaries.filter(credential => credential.status === "healthy").length;
				const cooldown = summaries.filter(credential => credential.status === "cooldown" || credential.status === "rate_limited").length;
				const envHint = `MAMAK_ROUTER_${provider.id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_KEYS`;
				const normalEnv = `${provider.id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`;
				const linked = (provider.linkNormalProvider ?? true) ? "linked" : "isolated";
				const normalPresent = process.env[normalEnv] ? "present" : "missing";
				lines.push(
					"",
					`┌ ${provider.id} — ${provider.baseUrl} [${linked}, normal:${normalPresent}]`,
					`│ credentials: healthy=${healthy} cooldown=${cooldown} total=${summaries.length} ${summaries.length === 0 ? `(add: /router add ${provider.id} <key>  or  export ${envHint}=key1,key2)` : ""}`,
					`│ models: ${provider.models.join(", ")}  (linked: ${provider.id}/<model>  pool-only: mamak-router-${provider.id}/<model>)`,
					`│ quota: requests=${quota?.requestCount ?? 0} rate-limits=${quota?.rateLimitCount ?? 0} exhausted=${quota?.exhaustedCount ?? 0}${quota?.lastStatus !== undefined ? ` last=${quota.lastStatus}` : ""}`,
				);
			}
			return lines.join("\n");
		},
		providerIds() {
			return config.providers.map(p => p.id);
		},
		credentialIds(providerId) {
			return store.listSummaries(providerId).map(s => s.id);
		},
	};
}
