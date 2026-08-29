import type { Api } from "@oh-my-pi/pi-ai";
import type { ExtensionAPI, ProviderModelConfig } from "@oh-my-pi/pi-coding-agent";
import type { RouterPluginConfig, RouterProviderConfig } from "../config/schema";
import { CredentialStore } from "../credentials/credential-store";
import { CredentialRouter } from "../router/credential-router";
import { ProviderQuotaTracker } from "../router/quota-tracker";
import { createOpenAICompatibleRouterStream, type RouterTransportTarget } from "./request-adapter";

const ROUTER_API_KEY_PLACEHOLDER = "MAMAK_ROUTER_MANAGED_KEY";

export interface RouterProviderRegistration {
	routers: Map<string, CredentialRouter>;
	quotaTrackers: Map<string, ProviderQuotaTracker>;
}

export function registerRouterProviders(pi: ExtensionAPI, config: RouterPluginConfig, store: CredentialStore): RouterProviderRegistration {
	const routers = new Map<string, CredentialRouter>();
	const quotaTrackers = new Map<string, ProviderQuotaTracker>();
	const providersById = new Map(config.providers.map(provider => [provider.id, provider]));

	for (const provider of config.providers) {
		if (!provider.enabled) continue;
		const quotaTracker = new ProviderQuotaTracker(provider.id);
		const router = new CredentialRouter(store.getProviderCredentials(provider.id), {
			strategy: provider.strategy ?? config.routing.defaultStrategy,
			settings: config.routing,
			quotaTracker,
		});
		routers.set(provider.id, router);
		quotaTrackers.set(provider.id, quotaTracker);
	}

	for (const provider of config.providers) {
		if (!provider.enabled) continue;
		const targets: RouterTransportTarget[] = [];
		for (const providerId of [provider.id, ...(provider.fallbackProviders ?? [])]) {
			const candidate = providersById.get(providerId);
			const router = routers.get(providerId);
			if (candidate && candidate.enabled && router) {
				targets.push({ providerId, baseUrl: candidate.baseUrl, models: candidate.models, router });
			}
		}
		const api = `mamak-router-openai-${provider.id}` as Api;
		pi.registerProvider(`mamak-router-${provider.id}`, {
			baseUrl: provider.baseUrl,
			api,
			// OMP requires a provider key to validate dynamic registration. The custom
			// stream replaces it with the selected in-memory pool credential.
			apiKey: ROUTER_API_KEY_PLACEHOLDER,
			models: provider.models.map(id => createModelConfig(id, api, provider.id)),
		});
	}
	return { routers, quotaTrackers };
}

function createModelConfig(id: string, api: Api, providerId: string): ProviderModelConfig {
	return {
		id,
		name: `${providerId}/${id} · Mamak Router`,
		api,
		reasoning: false,
		input: ["text", "image"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128_000,
		maxTokens: 16_384,
		compat: {},
	};
}
