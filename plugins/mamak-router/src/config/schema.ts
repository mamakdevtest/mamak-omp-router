import type { RouterSettings, RoutingStrategy } from "../credentials/credential-types";

export interface RouterProviderConfig {
	id: string;
	enabled: boolean;
	baseUrl: string;
	models: string[];
	strategy?: RoutingStrategy;
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

type ConfigRecord = Record<string, unknown>;

const providerFields = new Set(["id", "enabled", "baseUrl", "models", "strategy"]);
const routingFields = new Set(["maxAttemptsPerRequest", "defaultStrategy", "cooldown"]);
const cooldownFields = new Set(["defaultSeconds", "maxSeconds"]);

function isRecord(value: unknown): value is ConfigRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertKnownFields(value: ConfigRecord, allowed: Set<string>, path: string): void {
	for (const key of Object.keys(value)) {
		if (!allowed.has(key)) {
			throw new RouterConfigurationError(`${path}.${key} is not supported`);
		}
	}
}

export function parseRoutingStrategy(value: unknown, path: string): RoutingStrategy {
	if (value === "round-robin" || value === "fallback") {
		return value;
	}
	throw new RouterConfigurationError(`${path} must be "round-robin" or "fallback"`);
}

function parseProviderId(value: unknown, path: string): string {
	if (typeof value !== "string" || !/^[a-z][a-z0-9-]*$/i.test(value)) {
		throw new RouterConfigurationError(`${path} must be a non-empty provider identifier`);
	}
	return value.toLowerCase();
}

function parseBaseUrl(value: unknown, path: string): string {
	if (typeof value !== "string" || value.trim() === "") {
		throw new RouterConfigurationError(`${path} must be a non-empty HTTP URL`);
	}

	try {
		const url = new URL(value);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			throw new Error("unsupported protocol");
		}
	} catch {
		throw new RouterConfigurationError(`${path} must be a valid HTTP URL`);
	}

	return value.replace(/\/+$/, "");
}

function parseModels(value: unknown, path: string): string[] {
	if (!Array.isArray(value) || value.length === 0) {
		throw new RouterConfigurationError(`${path} must be a non-empty array of model names`);
	}

	const models = value.map((model, index) => {
		if (typeof model !== "string" || model.trim() === "") {
			throw new RouterConfigurationError(`${path}[${index}] must be a non-empty model name`);
		}
		return model.trim();
	});

	if (new Set(models).size !== models.length) {
		throw new RouterConfigurationError(`${path} must not contain duplicate model names`);
	}
	return models;
}

function parsePositiveInteger(value: unknown, path: string): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
		throw new RouterConfigurationError(`${path} must be a positive integer`);
	}
	return value;
}

export function validateProviderConfig(value: unknown, path = "providers[]"): RouterProviderConfig {
	if (!isRecord(value)) {
		throw new RouterConfigurationError(`${path} must be an object`);
	}
	assertKnownFields(value, providerFields, path);

	if (!("id" in value) || !("enabled" in value) || !("baseUrl" in value) || !("models" in value)) {
		throw new RouterConfigurationError(`${path} must include id, enabled, baseUrl, and models`);
	}
	if (typeof value.enabled !== "boolean") {
		throw new RouterConfigurationError(`${path}.enabled must be a boolean`);
	}

	return {
		id: parseProviderId(value.id, `${path}.id`),
		enabled: value.enabled,
		baseUrl: parseBaseUrl(value.baseUrl, `${path}.baseUrl`),
		models: parseModels(value.models, `${path}.models`),
		...(value.strategy === undefined ? {} : { strategy: parseRoutingStrategy(value.strategy, `${path}.strategy`) }),
	};
}

export function validateRouterSettings(value: unknown, path = "routing"): RouterSettings {
	if (!isRecord(value)) {
		throw new RouterConfigurationError(`${path} must be an object`);
	}
	assertKnownFields(value, routingFields, path);
	if (!("maxAttemptsPerRequest" in value) || !("defaultStrategy" in value) || !("cooldown" in value)) {
		throw new RouterConfigurationError(`${path} must include maxAttemptsPerRequest, defaultStrategy, and cooldown`);
	}
	if (!isRecord(value.cooldown)) {
		throw new RouterConfigurationError(`${path}.cooldown must be an object`);
	}
	assertKnownFields(value.cooldown, cooldownFields, `${path}.cooldown`);
	if (!("defaultSeconds" in value.cooldown) || !("maxSeconds" in value.cooldown)) {
		throw new RouterConfigurationError(`${path}.cooldown must include defaultSeconds and maxSeconds`);
	}

	const defaultSeconds = parsePositiveInteger(value.cooldown.defaultSeconds, `${path}.cooldown.defaultSeconds`);
	const maxSeconds = parsePositiveInteger(value.cooldown.maxSeconds, `${path}.cooldown.maxSeconds`);
	if (defaultSeconds > maxSeconds) {
		throw new RouterConfigurationError(`${path}.cooldown.defaultSeconds must not exceed maxSeconds`);
	}

	return {
		maxAttemptsPerRequest: parsePositiveInteger(value.maxAttemptsPerRequest, `${path}.maxAttemptsPerRequest`),
		defaultStrategy: parseRoutingStrategy(value.defaultStrategy, `${path}.defaultStrategy`),
		cooldown: { defaultSeconds, maxSeconds },
	};
}

/** Validates a complete, resolved configuration. */
export function validateRouterPluginConfig(value: unknown): RouterPluginConfig {
	if (!isRecord(value)) {
		throw new RouterConfigurationError("configuration must be an object");
	}
	assertKnownFields(value, new Set(["providers", "routing"]), "configuration");
	if (!Array.isArray(value.providers) || value.providers.length === 0) {
		throw new RouterConfigurationError("providers must be a non-empty array");
	}

	const providers = value.providers.map((provider, index) => validateProviderConfig(provider, `providers[${index}]`));
	const ids = new Set(providers.map((provider) => provider.id));
	if (ids.size !== providers.length) {
		throw new RouterConfigurationError("providers must not contain duplicate ids");
	}

	return { providers, routing: validateRouterSettings(value.routing) };
}
