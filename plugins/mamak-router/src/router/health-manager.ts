import type { RouterCredential } from "../credentials/credential-types";

export type CredentialFailureDisposition = "invalid" | "exhausted" | "cooldown" | "transient" | "non-rotatable";

/** Clears elapsed temporary state and returns whether this credential may be selected. */
export function isCredentialAvailable(credential: RouterCredential, now = Date.now()): boolean {
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

export function markCredentialUsed(credential: RouterCredential, now = Date.now()): void {
	credential.lastUsedAt = now;
}

export function recordCredentialSuccess(credential: RouterCredential, now = Date.now()): void {
	credential.successCount += 1;
	credential.lastUsedAt = now;
}

/** Applies the state transition for a failed attempt without retaining its secret. */
export function recordCredentialFailure(
	credential: RouterCredential,
	disposition: CredentialFailureDisposition,
	now = Date.now(),
	cooldownUntil?: number,
): void {
	credential.failureCount += 1;
	credential.lastFailureAt = now;

	switch (disposition) {
		case "invalid":
			credential.status = "invalid";
			credential.enabled = false;
			credential.cooldownUntil = undefined;
			break;
		case "exhausted":
			credential.status = "exhausted";
			credential.cooldownUntil = undefined;
			break;
		case "cooldown":
			credential.status = "cooldown";
			credential.cooldownUntil = cooldownUntil ?? now;
			break;
		case "transient":
		case "non-rotatable":
			break;
	}
}
