import type { CredentialSecret, RouterCredential } from "./credential-types";

export type CredentialSummary = Readonly<RouterCredential>;

function summary(credential: RouterCredential): CredentialSummary {
	return { ...credential };
}

/**
 * In-memory credential registry. Secrets are only available through the router-facing
 * provider accessor; all listing APIs return metadata copies.
 */
export class CredentialStore {
	readonly #credentialsById = new Map<string, CredentialSecret>();
	readonly #credentialIdsByProvider = new Map<string, string[]>();
	readonly #credentialIdByFingerprint = new Map<string, string>();

	add(credentialSecret: CredentialSecret): boolean {
		const { credential } = credentialSecret;
		if (this.#credentialIdByFingerprint.has(credential.fingerprint)) {
			return false;
		}
		if (this.#credentialsById.has(credential.id)) {
			throw new Error(`Duplicate credential id: ${credential.id}`);
		}

		this.#credentialsById.set(credential.id, credentialSecret);
		this.#credentialIdByFingerprint.set(credential.fingerprint, credential.id);
		const credentialIds = this.#credentialIdsByProvider.get(credential.providerId);
		if (credentialIds) {
			credentialIds.push(credential.id);
		} else {
			this.#credentialIdsByProvider.set(credential.providerId, [credential.id]);
		}
		return true;
	}

	/** Returns live credential objects for the router. Do not expose this result to UI or logs. */
	getProviderCredentials(providerId: string): CredentialSecret[] {
		const credentialIds = this.#credentialIdsByProvider.get(providerId);
		if (!credentialIds) {
			return [];
		}
		return credentialIds.flatMap((id) => {
			const credential = this.#credentialsById.get(id);
			return credential ? [credential] : [];
		});
	}

	remove(id: string): CredentialSummary | undefined {
		const credentialSecret = this.#credentialsById.get(id);
		if (!credentialSecret) {
			return undefined;
		}

		const { credential } = credentialSecret;
		this.#credentialsById.delete(id);
		this.#credentialIdByFingerprint.delete(credential.fingerprint);
		const credentialIds = this.#credentialIdsByProvider.get(credential.providerId);
		if (credentialIds) {
			const index = credentialIds.indexOf(id);
			if (index >= 0) credentialIds.splice(index, 1);
			if (credentialIds.length === 0) this.#credentialIdsByProvider.delete(credential.providerId);
		}
		return summary(credential);
	}

	getSummary(id: string): CredentialSummary | undefined {
		const credential = this.#credentialsById.get(id);
		return credential ? summary(credential.credential) : undefined;
	}

	listSummaries(providerId?: string): CredentialSummary[] {
		if (providerId !== undefined) {
			return this.getProviderCredentials(providerId).map(({ credential }) => summary(credential));
		}
		return [...this.#credentialsById.values()].map(({ credential }) => summary(credential));
	}

	updateMetadata(id: string, update: Partial<Omit<RouterCredential, "id" | "providerId" | "fingerprint">>): CredentialSummary | undefined {
		const credentialSecret = this.#credentialsById.get(id);
		if (!credentialSecret) {
			return undefined;
		}
		Object.assign(credentialSecret.credential, update);
		return summary(credentialSecret.credential);
	}

	get size(): number {
		return this.#credentialsById.size;
	}
}
