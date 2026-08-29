import type { CredentialSecret, RouterCredential } from "../credentials/credential-types";

export interface CredentialSelection {
	credential: CredentialSecret;
	index: number;
	nextCursor: number;
}

function mayUseCredential(credential: RouterCredential, now: number): boolean {
	if (!credential.enabled || credential.status === "disabled" || credential.status === "invalid" || credential.status === "exhausted") {
		return false;
	}
	if (credential.status === "cooldown" || credential.status === "rate_limited") {
		if (credential.cooldownUntil === undefined || credential.cooldownUntil > now) return false;
		credential.status = "healthy";
		credential.cooldownUntil = undefined;
	}
	return true;
}

/** Selects the next eligible credential after cursor, preserving input order around the ring. */
export function selectRoundRobin(
	credentials: readonly CredentialSecret[],
	cursor = 0,
	now = Date.now(),
	excluded?: ReadonlySet<CredentialSecret>,
): CredentialSelection | undefined {
	if (credentials.length === 0) return undefined;
	const start = ((Math.trunc(cursor) % credentials.length) + credentials.length) % credentials.length;

	for (let offset = 0; offset < credentials.length; offset += 1) {
		const index = (start + offset) % credentials.length;
		const credential = credentials[index];
		if (credential === undefined || excluded?.has(credential) || !mayUseCredential(credential.credential, now)) continue;
		return { credential, index, nextCursor: (index + 1) % credentials.length };
	}
	return undefined;
}

/** Selects the first usable supplied credential. Input order is its fallback order. */
export function selectFallback(
	credentials: readonly CredentialSecret[],
	now = Date.now(),
	excluded?: ReadonlySet<CredentialSecret>,
): CredentialSelection | undefined {
	for (let index = 0; index < credentials.length; index += 1) {
		const credential = credentials[index];
		if (credential === undefined || excluded?.has(credential) || !mayUseCredential(credential.credential, now)) continue;
		return { credential, index, nextCursor: index };
	}
	return undefined;
}
