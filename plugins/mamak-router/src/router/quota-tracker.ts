import type { ErrorClassification } from "./error-classifier";

export interface ProviderQuotaSnapshot {
	providerId: string;
	requestCount: number;
	rateLimitCount: number;
	exhaustedCount: number;
	lastStatus?: number;
	lastUpdatedAt?: number;
}

/** In-memory aggregate of provider outcomes. It intentionally contains no credential secret or raw response body. */
export class ProviderQuotaTracker {
	readonly #snapshot: ProviderQuotaSnapshot;

	constructor(providerId: string) {
		this.#snapshot = { providerId, requestCount: 0, rateLimitCount: 0, exhaustedCount: 0 };
	}

	recordRequest(now = Date.now()): void {
		this.#snapshot.requestCount += 1;
		this.#snapshot.lastUpdatedAt = now;
	}

	recordFailure(classification: ErrorClassification, now = Date.now()): void {
		if (classification.disposition === "cooldown") this.#snapshot.rateLimitCount += 1;
		if (classification.disposition === "exhausted") this.#snapshot.exhaustedCount += 1;
		this.#snapshot.lastStatus = classification.status;
		this.#snapshot.lastUpdatedAt = now;
	}

	snapshot(): Readonly<ProviderQuotaSnapshot> {
		return { ...this.#snapshot };
	}
}
