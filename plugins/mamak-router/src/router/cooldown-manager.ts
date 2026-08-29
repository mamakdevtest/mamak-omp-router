import type { CooldownSettings } from "../credentials/credential-types";

export interface RetryTimingHeaders {
	retryAfter?: string;
	rateLimitReset?: string;
}

export const DEFAULT_COOLDOWN_SETTINGS: CooldownSettings = {
	defaultSeconds: 30,
	maxSeconds: 300,
};

function finiteNonNegative(value: number, fallback: number): number {
	return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** Parses Retry-After seconds or HTTP-date into an absolute timestamp. */
export function parseRetryAfter(value: string | undefined, now = Date.now()): number | undefined {
	if (!value) return undefined;
	const trimmed = value.trim();
	if (!trimmed) return undefined;

	const seconds = Number(trimmed);
	if (Number.isFinite(seconds) && seconds >= 0) return now + seconds * 1_000;

	const timestamp = Date.parse(trimmed);
	return Number.isFinite(timestamp) && timestamp >= now ? timestamp : undefined;
}

/** Parses x-ratelimit-reset epoch seconds, epoch milliseconds, or an HTTP-date. */
export function parseRateLimitReset(value: string | undefined, now = Date.now()): number | undefined {
	if (!value) return undefined;
	const trimmed = value.trim();
	if (!trimmed) return undefined;

	const numeric = Number(trimmed);
	if (Number.isFinite(numeric) && numeric >= 0) {
		if (numeric >= 1_000_000_000_000) return numeric;
		if (numeric >= 1_000_000_000) return numeric * 1_000;
		return now + numeric * 1_000;
	}

	const timestamp = Date.parse(trimmed);
	return Number.isFinite(timestamp) && timestamp >= now ? timestamp : undefined;
}

/**
 * Produces a bounded cooldown. Retry-After takes precedence over
 * x-ratelimit-reset; otherwise the configured 30/60/120/300-style sequence
 * is used, with each term capped by maxSeconds.
 */
export function calculateCooldownSeconds(
	attemptNumber: number,
	headers: RetryTimingHeaders = {},
	settings: CooldownSettings = DEFAULT_COOLDOWN_SETTINGS,
	now = Date.now(),
): number {
	const maxSeconds = finiteNonNegative(settings.maxSeconds, DEFAULT_COOLDOWN_SETTINGS.maxSeconds);
	const retryAfter = parseRetryAfter(headers.retryAfter, now);
	const rateLimitReset = parseRateLimitReset(headers.rateLimitReset, now);
	const headerDeadline = retryAfter ?? rateLimitReset;
	if (headerDeadline !== undefined) return Math.min(maxSeconds, Math.max(0, (headerDeadline - now) / 1_000));

	const initialSeconds = finiteNonNegative(settings.defaultSeconds, DEFAULT_COOLDOWN_SETTINGS.defaultSeconds);
	const exponent = Math.max(0, Math.floor(finiteNonNegative(attemptNumber, 1)) - 1);
	return Math.min(maxSeconds, initialSeconds * 2 ** Math.min(exponent, 3));
}

export function calculateCooldownUntil(
	attemptNumber: number,
	headers: RetryTimingHeaders = {},
	settings: CooldownSettings = DEFAULT_COOLDOWN_SETTINGS,
	now = Date.now(),
): number {
	return now + calculateCooldownSeconds(attemptNumber, headers, settings, now) * 1_000;
}
