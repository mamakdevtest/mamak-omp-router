import { cloneDefaultRouterConfig } from "./defaults";
import {
	RouterConfigurationError,
	parseRoutingStrategy,
	validateRouterPluginConfig,
} from "./schema";
import type { RouterPluginConfig } from "./schema";

export type RouterEnvironment = Readonly<Record<string, string | undefined>>;

type UnknownConfig = Record<string, unknown>;

function configurationObject(value: unknown, path: string): UnknownConfig {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new RouterConfigurationError(`${path} must be an object`);
	}
	return value as UnknownConfig;
}

function rejectUnknownFields(value: UnknownConfig, allowed: readonly string[], path: string): void {
	for (const key of Object.keys(value)) {
		if (!allowed.includes(key)) {
			throw new RouterConfigurationError(`${path}.${key} is not supported`);
		}
	}
}

function providerId(value: unknown, path: string): string {
	if (typeof value !== "string" || !/^[a-z][a-z0-9-]*$/i.test(value)) {
		throw new RouterConfigurationError(`${path} must be a non-empty provider identifier`);
	}
	return value.toLowerCase();
}

function applyProviderOverrides(config: RouterPluginConfig, value: unknown): void {
	if (!Array.isArray(value)) {
		throw new RouterConfigurationError("providers must be an array");
	}

	const seen = new Set<string>();
	for (let index = 0; index < value.length; index += 1) {
		const override = configurationObject(value[index], `providers[${index}]`);
		rejectUnknownFields(
			override,
			["id", "enabled", "baseUrl", "models", "strategy", "fallbackProviders", "credentialPolicies", "linkNormalProvider"],
			`providers[${index}]`,
		);
		const id = providerId(override.id, `providers[${index}].id`);
		if (seen.has(id)) {
			throw new RouterConfigurationError(`providers contains duplicate id "${id}"`);
		}
		seen.add(id);

		const existingIndex = config.providers.findIndex((provider) => provider.id === id);
		const existing = existingIndex === -1 ? undefined : config.providers[existingIndex];
		if (!existing && (override.enabled === undefined || override.baseUrl === undefined || override.models === undefined)) {
			throw new RouterConfigurationError(`providers[${index}] must include enabled, baseUrl, and models for a new provider`);
		}
		if (override.enabled !== undefined && typeof override.enabled !== "boolean") {
			throw new RouterConfigurationError(`providers[${index}].enabled must be a boolean`);
		}
		if (override.strategy !== undefined) {
			parseRoutingStrategy(override.strategy, `providers[${index}].strategy`);
		}

		const resolved = {
			...existing,
			...override,
			id,
			...(override.models === undefined ? {} : { models: override.models }),
		};
		if (existingIndex === -1) {
			config.providers.push(resolved as RouterPluginConfig["providers"][number]);
		} else {
			config.providers[existingIndex] = resolved as RouterPluginConfig["providers"][number];
		}
	}
}

function applyRoutingOverrides(config: RouterPluginConfig, value: unknown): void {
	const override = configurationObject(value, "routing");
	rejectUnknownFields(override, ["maxAttemptsPerRequest", "defaultStrategy", "cooldown"], "routing");
	if (override.defaultStrategy !== undefined) {
		parseRoutingStrategy(override.defaultStrategy, "routing.defaultStrategy");
	}

	let cooldown = config.routing.cooldown;
	if (override.cooldown !== undefined) {
		const cooldownOverride = configurationObject(override.cooldown, "routing.cooldown");
		rejectUnknownFields(cooldownOverride, ["defaultSeconds", "maxSeconds"], "routing.cooldown");
		cooldown = { ...cooldown, ...cooldownOverride };
	}
	config.routing = {
		...config.routing,
		...override,
		cooldown,
	} as RouterPluginConfig["routing"];
}

export function parseRouterConfigJson(value: string): unknown {
	try {
		return JSON.parse(value);
	} catch (error) {
		const detail = error instanceof Error ? error.message : "invalid JSON";
		throw new RouterConfigurationError(`must contain valid JSON (${detail})`);
	}
}

/** Resolves optional JSON overrides against the built-in configuration. */
export function loadRouterConfig(environment: RouterEnvironment = process.env): RouterPluginConfig {
	const raw = environment.MAMAK_ROUTER_CONFIG;
	if (raw === undefined || raw.trim() === "") {
		return cloneDefaultRouterConfig();
	}

	const override = configurationObject(parseRouterConfigJson(raw), "configuration");
	rejectUnknownFields(override, ["providers", "routing"], "configuration");
	const config = cloneDefaultRouterConfig();
	if (override.providers !== undefined) {
		applyProviderOverrides(config, override.providers);
	}
	if (override.routing !== undefined) {
		applyRoutingOverrides(config, override.routing);
	}
	return validateRouterPluginConfig(config);
}
