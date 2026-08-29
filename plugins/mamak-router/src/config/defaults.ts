import type { RouterPluginConfig } from "./schema";

export const DEFAULT_ROUTER_CONFIG: RouterPluginConfig = {
	providers: [
		{
			id: "deepseek",
			enabled: true,
			baseUrl: "https://api.deepseek.com/v1",
			models: ["deepseek-chat", "deepseek-reasoner"],
		},
		{
			id: "openrouter",
			enabled: true,
			baseUrl: "https://openrouter.ai/api/v1",
			models: ["deepseek/deepseek-chat"],
		},
		{
			id: "zai",
			enabled: true,
			baseUrl: "https://api.z.ai/api/paas/v4",
			models: ["glm-4.7"],
		},
	],
	routing: {
		maxAttemptsPerRequest: 5,
		defaultStrategy: "round-robin",
		cooldown: {
			defaultSeconds: 60,
			maxSeconds: 300,
		},
	},
};

export function cloneDefaultRouterConfig(): RouterPluginConfig {
	return {
		providers: DEFAULT_ROUTER_CONFIG.providers.map((provider) => ({
			...provider,
			models: [...provider.models],
		})),
		routing: {
			...DEFAULT_ROUTER_CONFIG.routing,
			cooldown: { ...DEFAULT_ROUTER_CONFIG.routing.cooldown },
		},
	};
}
