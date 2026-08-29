export type CredentialStatus =
	| "healthy"
	| "cooldown"
	| "rate_limited"
	| "invalid"
	| "exhausted"
	| "disabled";

export interface RouterCredential {
	id: string;
	providerId: string;
	enabled: boolean;
	status: CredentialStatus;
	priority?: number;
	weight?: number;
	successCount: number;
	failureCount: number;
	lastUsedAt?: number;
	lastFailureAt?: number;
	cooldownUntil?: number;
	/** Non-reversible SHA-256 prefix. Never the secret itself. */
	fingerprint: string;
}

export interface CredentialSecret {
	credential: RouterCredential;
	secret: string;
}
export type RoutingStrategy = "round-robin" | "fallback" | "fill-first" | "weighted" | "least-used";

export interface CooldownSettings {
	defaultSeconds: number;
	maxSeconds: number;
}

export interface RouterSettings {
	maxAttemptsPerRequest: number;
	defaultStrategy: RoutingStrategy;
	cooldown: CooldownSettings;
}
