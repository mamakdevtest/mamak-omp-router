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
		{
			id: "opencode-zen",
			enabled: true,
			baseUrl: "https://opencode.ai/zen/v1",
			models: ["big-pickle", "minimax-m2", "glm-4.7"],
		},
		{
			id: "groq",
			enabled: true,
			baseUrl: "https://api.groq.com/openai/v1",
			models: ["openai/gpt-oss-120b", "moonshotai/kimi-k2-instruct"],
		},
		{
			id: "cerebras",
			enabled: true,
			baseUrl: "https://api.cerebras.ai/v1",
			models: ["qwen-3-coder-480b", "zai/glm-4.6"],
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
