import type { Api } from "@oh-my-pi/pi-ai";
import type { ExtensionAPI, ProviderModelConfig } from "@oh-my-pi/pi-coding-agent";
import type { RouterPluginConfig } from "../config/schema";
import { CredentialStore } from "../credentials/credential-store";
import { CredentialRouter } from "../router/credential-router";
import { createOpenAICompatibleRouterStream } from "./request-adapter";

const ROUTER_API_KEY_PLACEHOLDER = "MAMAK_ROUTER_MANAGED_KEY";

export function registerRouterProviders(pi: ExtensionAPI, config: RouterPluginConfig, store: CredentialStore): Map<string, CredentialRouter> {
	const routers = new Map<string, CredentialRouter>();
	for (const provider of config.providers) {
		if (!provider.enabled) continue;
		const router = new CredentialRouter(store.getProviderCredentials(provider.id), {
			strategy: provider.strategy ?? config.routing.defaultStrategy,
			settings: config.routing,
		});
		routers.set(provider.id, router);
		const api = `mamak-router-openai-${provider.id}` as Api;
		pi.registerProvider(`mamak-router-${provider.id}`, {
			baseUrl: provider.baseUrl,
			api,
			// OMP requires a provider key to validate dynamic registration. The custom
			// stream always replaces it with the selected in-memory pool credential.
			apiKey: ROUTER_API_KEY_PLACEHOLDER,
			streamSimple: createOpenAICompatibleRouterStream(router),
			models: provider.models.map((id) => createModelConfig(id, api)),
		});
	}
	return routers;
}

function createModelConfig(id: string, api: Api): ProviderModelConfig {
	return {
		id,
		name: id,
		api,
		reasoning: false,
		input: ["text", "image"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128_000,
		maxTokens: 16_384,
		// The OMP OpenAI transport reads compatibility flags directly. An empty
		// object selects its ordinary undefined/false behavior for custom hosts.
		compat: {},
	};
}

