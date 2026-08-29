import { type ConfigRecord, isConfigRecord } from "./type-guards";
import type { RouterSettings, RoutingStrategy } from "../credentials/credential-types";

export interface CredentialPolicy {
	id: string;
	priority?: number;
	weight?: number;
}

export interface RouterProviderConfig {
	id: string;
	enabled: boolean;
	baseUrl: string;
	models: string[];
	strategy?: RoutingStrategy;
	fallbackProviders?: string[];
	credentialPolicies?: CredentialPolicy[];
	linkNormalProvider?: boolean;
}

export interface RouterPluginConfig {
	providers: RouterProviderConfig[];
	routing: RouterSettings;
}

export class RouterConfigurationError extends Error {
	constructor(message: string) {
		super(`Invalid MAMAK_ROUTER_CONFIG: ${message}`);
		this.name = "RouterConfigurationError";
	}
}


const providerFields = new Set(["id", "enabled", "baseUrl", "models", "strategy", "fallbackProviders", "credentialPolicies", "linkNormalProvider"]);
const routingFields = new Set(["maxAttemptsPerRequest", "defaultStrategy", "cooldown"]);
const cooldownFields = new Set(["defaultSeconds", "maxSeconds"]);
const supportedStrategies = new Set<RoutingStrategy>(["round-robin", "fallback", "fill-first", "weighted", "least-used"]);


function assertKnownFields(value: ConfigRecord, allowed: Set<string>, path: string): void {
	for (const key of Object.keys(value)) {
		if (!allowed.has(key)) throw new RouterConfigurationError(`${path}.${key} is not supported`);
	}
}

export function parseRoutingStrategy(value: unknown, path: string): RoutingStrategy {
	if (typeof value === "string" && supportedStrategies.has(value as RoutingStrategy)) return value as RoutingStrategy;
	throw new RouterConfigurationError(`${path} must be round-robin, fallback, fill-first, weighted, or least-used`);
}

function parseProviderId(value: unknown, path: string): string {
	if (typeof value !== "string" || !/^[a-z][a-z0-9-]*$/i.test(value)) {
		throw new RouterConfigurationError(`${path} must be a non-empty provider identifier`);
	}
	return value.toLowerCase();
}

function parseBaseUrl(value: unknown, path: string): string {
	if (typeof value !== "string" || value.trim() === "") throw new RouterConfigurationError(`${path} must be a non-empty HTTP URL`);
	try {
		const url = new URL(value);
		if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("unsupported protocol");
	} catch {
		throw new RouterConfigurationError(`${path} must be a valid HTTP URL`);
	}
	return value.replace(/\/+$/, "");
}

function parseModels(value: unknown, path: string): string[] {
	if (!Array.isArray(value) || value.length === 0) throw new RouterConfigurationError(`${path} must be a non-empty array of model names`);
	const models = value.map((model, index) => {
		if (typeof model !== "string" || model.trim() === "") throw new RouterConfigurationError(`${path}[${index}] must be a non-empty model name`);
		return model.trim();
	});
	if (new Set(models).size !== models.length) throw new RouterConfigurationError(`${path} must not contain duplicate model names`);
	return models;
}

function parsePositiveInteger(value: unknown, path: string): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value < 1) throw new RouterConfigurationError(`${path} must be a positive integer`);
	return value;
}

function parseFallbackProviders(value: unknown, path: string): string[] {
	if (!Array.isArray(value)) throw new RouterConfigurationError(`${path} must be an array of provider identifiers`);
	const fallbacks = value.map((providerId, index) => parseProviderId(providerId, `${path}[${index}]`));
	if (new Set(fallbacks).size !== fallbacks.length) throw new RouterConfigurationError(`${path} must not contain duplicates`);
	return fallbacks;
}

function parseCredentialPolicies(value: unknown, path: string): CredentialPolicy[] {
	if (!Array.isArray(value)) throw new RouterConfigurationError(`${path} must be an array`);
	const policies = value.map((candidate, index) => {
		if (!isConfigRecord(candidate)) throw new RouterConfigurationError(`${path}[${index}] must be an object`);
		assertKnownFields(candidate, new Set(["id", "priority", "weight"]), `${path}[${index}]`);
		if (typeof candidate.id !== "string" || candidate.id.trim() === "") throw new RouterConfigurationError(`${path}[${index}].id must be a non-empty credential id`);
		const policy: CredentialPolicy = { id: candidate.id.trim() };
		if (candidate.priority !== undefined) {
			if (typeof candidate.priority !== "number" || !Number.isInteger(candidate.priority) || candidate.priority < 0) {
				throw new RouterConfigurationError(`${path}[${index}].priority must be a non-negative integer`);
			}
			policy.priority = candidate.priority;
		}
		if (candidate.weight !== undefined) policy.weight = parsePositiveInteger(candidate.weight, `${path}[${index}].weight`);
		return policy;
	});
	if (new Set(policies.map(policy => policy.id)).size !== policies.length) throw new RouterConfigurationError(`${path} must not contain duplicate credential ids`);
	return policies;
}

export function validateProviderConfig(value: unknown, path = "providers[]"): RouterProviderConfig {
	if (!isConfigRecord(value)) throw new RouterConfigurationError(`${path} must be an object`);
	assertKnownFields(value, providerFields, path);
	if (!("id" in value) || !("enabled" in value) || !("baseUrl" in value) || !("models" in value)) {
		throw new RouterConfigurationError(`${path} must include id, enabled, baseUrl, and models`);
	}
	if (typeof value.enabled !== "boolean") throw new RouterConfigurationError(`${path}.enabled must be a boolean`);
	return {
		id: parseProviderId(value.id, `${path}.id`),
		enabled: value.enabled,
		baseUrl: parseBaseUrl(value.baseUrl, `${path}.baseUrl`),
		models: parseModels(value.models, `${path}.models`),
		...(value.strategy === undefined ? {} : { strategy: parseRoutingStrategy(value.strategy, `${path}.strategy`) }),
		...(value.fallbackProviders === undefined ? {} : { fallbackProviders: parseFallbackProviders(value.fallbackProviders, `${path}.fallbackProviders`) }),
		...(value.credentialPolicies === undefined ? {} : { credentialPolicies: parseCredentialPolicies(value.credentialPolicies, `${path}.credentialPolicies`) }),
		...(value.linkNormalProvider === undefined ? {} : { linkNormalProvider: parseLinkNormalProvider(value.linkNormalProvider, `${path}.linkNormalProvider`) }),
	};
}

function parseLinkNormalProvider(value: unknown, path: string): boolean {
	if (typeof value !== "boolean") throw new RouterConfigurationError(`${path} must be a boolean`);
	return value;
}

export function validateRouterSettings(value: unknown, path = "routing"): RouterSettings {
	if (!isConfigRecord(value)) throw new RouterConfigurationError(`${path} must be an object`);
	assertKnownFields(value, routingFields, path);
	if (!("maxAttemptsPerRequest" in value) || !("defaultStrategy" in value) || !("cooldown" in value)) {
		throw new RouterConfigurationError(`${path} must include maxAttemptsPerRequest, defaultStrategy, and cooldown`);
	}
	if (!isConfigRecord(value.cooldown)) throw new RouterConfigurationError(`${path}.cooldown must be an object`);
	assertKnownFields(value.cooldown, cooldownFields, `${path}.cooldown`);
	if (!("defaultSeconds" in value.cooldown) || !("maxSeconds" in value.cooldown)) {
		throw new RouterConfigurationError(`${path}.cooldown must include defaultSeconds and maxSeconds`);
	}
	const defaultSeconds = parsePositiveInteger(value.cooldown.defaultSeconds, `${path}.cooldown.defaultSeconds`);
	const maxSeconds = parsePositiveInteger(value.cooldown.maxSeconds, `${path}.cooldown.maxSeconds`);
	if (defaultSeconds > maxSeconds) throw new RouterConfigurationError(`${path}.cooldown.defaultSeconds must not exceed maxSeconds`);
	return {
		maxAttemptsPerRequest: parsePositiveInteger(value.maxAttemptsPerRequest, `${path}.maxAttemptsPerRequest`),
		defaultStrategy: parseRoutingStrategy(value.defaultStrategy, `${path}.defaultStrategy`),
		cooldown: { defaultSeconds, maxSeconds },
	};
}

/** Validates a complete, resolved configuration. */
export function validateRouterPluginConfig(value: unknown): RouterPluginConfig {
	if (!isConfigRecord(value)) throw new RouterConfigurationError("configuration must be an object");
	assertKnownFields(value, new Set(["providers", "routing"]), "configuration");
	if (!Array.isArray(value.providers) || value.providers.length === 0) throw new RouterConfigurationError("providers must be a non-empty array");
	const providers = value.providers.map((provider, index) => validateProviderConfig(provider, `providers[${index}]`));
	const ids = new Set(providers.map(provider => provider.id));
	if (ids.size !== providers.length) throw new RouterConfigurationError("providers must not contain duplicate ids");
	for (const provider of providers) {
		for (const fallbackProvider of provider.fallbackProviders ?? []) {
			if (fallbackProvider === provider.id) throw new RouterConfigurationError(`providers.${provider.id}.fallbackProviders must not include itself`);
			if (!ids.has(fallbackProvider)) throw new RouterConfigurationError(`providers.${provider.id}.fallbackProviders references unknown provider ${fallbackProvider}`);
		}
	}
	return { providers, routing: validateRouterSettings(value.routing) };
}
