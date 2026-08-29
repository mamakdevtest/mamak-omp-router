import type { CredentialSecret, RouterCredential } from "../credentials/credential-types";

export interface CredentialSelection {
	credential: CredentialSecret;
	index: number;
	nextCursor: number;
}

interface IndexedCredential {
	credential: CredentialSecret;
	index: number;
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

/** Returns eligible credentials in their stable pool order, constrained to the highest priority tier. */
function eligibleCredentials(
	credentials: readonly CredentialSecret[],
	now: number,
	excluded?: ReadonlySet<CredentialSecret>,
): IndexedCredential[] {
	const eligible: IndexedCredential[] = [];
	let bestPriority: number | undefined;
	for (let index = 0; index < credentials.length; index += 1) {
		const credential = credentials[index];
		if (credential === undefined || excluded?.has(credential) || !mayUseCredential(credential.credential, now)) continue;
		const priority = credential.credential.priority ?? 0;
		if (bestPriority === undefined || priority < bestPriority) {
			bestPriority = priority;
			eligible.length = 0;
		}
		if (priority === bestPriority) eligible.push({ credential, index });
	}
	return eligible;
}

/** Selects the next eligible credential after cursor, preserving stable order around the ring. */
export function selectRoundRobin(
	credentials: readonly CredentialSecret[],
	cursor = 0,
	now = Date.now(),
	excluded?: ReadonlySet<CredentialSecret>,
): CredentialSelection | undefined {
	const candidates = eligibleCredentials(credentials, now, excluded);
	if (candidates.length === 0 || credentials.length === 0) return undefined;
	const start = ((Math.trunc(cursor) % credentials.length) + credentials.length) % credentials.length;
	for (let offset = 0; offset < credentials.length; offset += 1) {
		const index = (start + offset) % credentials.length;
		const candidate = candidates.find(item => item.index === index);
		if (candidate) return { credential: candidate.credential, index, nextCursor: (index + 1) % credentials.length };
	}
	return undefined;
}

/** Selects the first credential in the highest available priority tier. */
export function selectFallback(
	credentials: readonly CredentialSecret[],
	now = Date.now(),
	excluded?: ReadonlySet<CredentialSecret>,
): CredentialSelection | undefined {
	const candidate = eligibleCredentials(credentials, now, excluded)[0];
	return candidate ? { credential: candidate.credential, index: candidate.index, nextCursor: candidate.index } : undefined;
}

/** Fill-first is priority-aware fallback: use the preferred credential until it is unavailable. */
export function selectFillFirst(
	credentials: readonly CredentialSecret[],
	now = Date.now(),
	excluded?: ReadonlySet<CredentialSecret>,
): CredentialSelection | undefined {
	return selectFallback(credentials, now, excluded);
}

/** Selects randomly among the highest priority tier proportionally to configured credential weights. */
export function selectWeighted(
	credentials: readonly CredentialSecret[],
	now = Date.now(),
	excluded?: ReadonlySet<CredentialSecret>,
	random: () => number = Math.random,
): CredentialSelection | undefined {
	const candidates = eligibleCredentials(credentials, now, excluded);
	if (candidates.length === 0) return undefined;
	const totalWeight = candidates.reduce((total, candidate) => total + (candidate.credential.credential.weight ?? 1), 0);
	let threshold = Math.min(Math.max(random(), 0), 0.999_999_999_999) * totalWeight;
	for (const candidate of candidates) {
		threshold -= candidate.credential.credential.weight ?? 1;
		if (threshold < 0) return { credential: candidate.credential, index: candidate.index, nextCursor: candidate.index };
	}
	const fallback = candidates[candidates.length - 1];
	return fallback ? { credential: fallback.credential, index: fallback.index, nextCursor: fallback.index } : undefined;
}

/** Selects the least successful credential, then the least recently used one, within the priority tier. */
export function selectLeastUsed(
	credentials: readonly CredentialSecret[],
	now = Date.now(),
	excluded?: ReadonlySet<CredentialSecret>,
): CredentialSelection | undefined {
	const candidates = eligibleCredentials(credentials, now, excluded);
	let selected: IndexedCredential | undefined;
	for (const candidate of candidates) {
		if (!selected) {
			selected = candidate;
			continue;
		}
		const current = candidate.credential.credential;
		const best = selected.credential.credential;
		if (
			current.successCount < best.successCount ||
			(current.successCount === best.successCount && (current.lastUsedAt ?? 0) < (best.lastUsedAt ?? 0))
		) {
			selected = candidate;
		}
	}
	return selected ? { credential: selected.credential, index: selected.index, nextCursor: selected.index } : undefined;
}
