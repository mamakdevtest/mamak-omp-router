import type { CredentialSecret, RouterCredential } from "./credential-types";
import { CredentialStore } from "./credential-store";
import type { CredentialSummary } from "./credential-store";

export interface CredentialImportProvider {
	id: string;
	enabled: boolean;
	credentialPolicies?: readonly { id: string; priority?: number; weight?: number }[];
}

export type CredentialEnvironment = Readonly<Record<string, string | undefined>>;

export interface CredentialImportResult {
	added: CredentialSummary[];
	duplicateCount: number;
}

const LEGACY_KEY_ENVIRONMENT: Record<string, string> = {
	deepseek: "DEEPSEEK_KEYS",
	openrouter: "OPENROUTER_KEYS",
	zai: "ZAI_KEYS",
};

const LEGACY_KEY_PREFIX: Record<string, string> = {
	deepseek: "DEEPSEEK_KEY_",
	openrouter: "OPENROUTER_KEY_",
	zai: "ZAI_KEY_",
};

export function providerKeysEnvironmentName(providerId: string): string {
	return `MAMAK_ROUTER_${providerId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_KEYS`;
}

function keysFromEnvironment(providerId: string, environment: CredentialEnvironment): string[] {
	const normalized = providerId.toUpperCase().replace(/[^A-Z0-9]/g, "_");
	const numberedPrefixes = [`MAMAK_ROUTER_${normalized}_KEY_`, LEGACY_KEY_PREFIX[providerId]];
	const names = [providerKeysEnvironmentName(providerId), LEGACY_KEY_ENVIRONMENT[providerId]];
	for (const name of Object.keys(environment).sort()) {
		if (numberedPrefixes.some(prefix => prefix !== undefined && name.startsWith(prefix))) names.push(name);
	}

	const keys: string[] = [];
	for (const name of names) {
		const raw = name === undefined ? undefined : environment[name];
		if (raw === undefined) continue;
		for (const key of raw.split(",")) {
			const trimmed = key.trim();
			if (trimmed !== "") keys.push(trimmed);
		}
	}
	return keys;
}

export async function sha256Fingerprint(secret: string): Promise<string> {
	const encoded = new TextEncoder().encode(secret);
	const digest = await crypto.subtle.digest("SHA-256", encoded);
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Imports comma-delimited environment values without serializing or logging their keys.
 * Duplicate SHA-256 fingerprints are ignored across all configured providers.
 */
export async function importCredentialsFromEnvironment(
	store: CredentialStore,
	providers: readonly CredentialImportProvider[],
	environment: CredentialEnvironment = process.env,
): Promise<CredentialImportResult> {
	const added: CredentialSummary[] = [];
	let duplicateCount = 0;

	for (const provider of providers) {
		const keys = keysFromEnvironment(provider.id, environment);
		let sequence = 0;
		for (const secret of keys) {
			sequence += 1;
			const fingerprint = await sha256Fingerprint(secret);
			const id = `${provider.id}-${sequence}`;
			let policy: { id: string; priority?: number; weight?: number } | undefined;
			for (const candidate of provider.credentialPolicies ?? []) {
				if (candidate.id === id) {
					policy = candidate;
					break;
				}
			}
			const credential: RouterCredential = {
				id,
				providerId: provider.id,
				enabled: provider.enabled,
				status: provider.enabled ? "healthy" : "disabled",
				successCount: 0,
				failureCount: 0,
				...(policy?.priority === undefined ? {} : { priority: policy.priority }),
				...(policy?.weight === undefined ? {} : { weight: policy.weight }),
				fingerprint,
			};
			const credentialSecret: CredentialSecret = { credential, secret };
			if (!store.add(credentialSecret)) {
				duplicateCount += 1;
				continue;
			}
			const imported = store.getSummary(credential.id);
			if (imported) {
				added.push(imported);
			}
		}
	}

	return { added, duplicateCount };
}
