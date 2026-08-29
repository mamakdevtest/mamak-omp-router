import type {
	CredentialSecret,
	RouterSettings,
	RoutingStrategy,
} from "../credentials/credential-types";
import { calculateCooldownUntil } from "./cooldown-manager";
import { classifyError } from "./error-classifier";
import { markCredentialUsed, recordCredentialFailure, recordCredentialSuccess } from "./health-manager";
import { selectFallback, selectRoundRobin } from "./strategies";

export interface CredentialRouterOptions {
	strategy: RoutingStrategy;
	settings: RouterSettings;
	now?: () => number;
}

export class CredentialsUnavailableError extends Error {
	constructor(message = "No healthy router credentials are available") {
		super(message);
		this.name = "CredentialsUnavailableError";
	}
}

/**
 * Holds only the process-memory pool supplied at extension load. A request can
 * visit a credential once at most and is capped by `maxAttemptsPerRequest`.
 */
export class CredentialRouter {
	#cursor = 0;
	readonly #now: () => number;

	constructor(
		readonly credentials: readonly CredentialSecret[],
		readonly options: CredentialRouterOptions,
	) {
		this.#now = options.now ?? Date.now;
	}

	async run<T>(attempt: (credential: CredentialSecret, attemptNumber: number) => Promise<T>): Promise<T> {
		const attempted = new Set<CredentialSecret>();
		const limit = Math.min(this.options.settings.maxAttemptsPerRequest, this.credentials.length);
		let lastError: unknown;

		for (let attemptNumber = 1; attemptNumber <= limit; attemptNumber += 1) {
			const now = this.#now();
			const selection =
				this.options.strategy === "round-robin"
					? selectRoundRobin(this.credentials, this.#cursor, now, attempted)
					: selectFallback(this.credentials, now, attempted);
			if (!selection) break;

			attempted.add(selection.credential);
			this.#cursor = selection.nextCursor;
			markCredentialUsed(selection.credential.credential, now);
			try {
				const result = await attempt(selection.credential, attemptNumber);
				recordCredentialSuccess(selection.credential.credential, this.#now());
				return result;
			} catch (error) {
				lastError = error;
				const classification = classifyError(error);
				const cooldownUntil =
					classification.disposition === "cooldown"
						? calculateCooldownUntil(
							selection.credential.credential.failureCount + 1,
							classification.headers,
							this.options.settings.cooldown,
							this.#now(),
						)
						: undefined;
				recordCredentialFailure(
					selection.credential.credential,
					classification.disposition,
					this.#now(),
					cooldownUntil,
				);
				if (!classification.shouldRotate) throw error;
			}
		}

		if (lastError !== undefined) throw lastError;
		throw new CredentialsUnavailableError();
	}
}
