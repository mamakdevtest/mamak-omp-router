import type { CredentialStatus } from "../credentials/credential-types";

export type ErrorDisposition = "invalid" | "exhausted" | "cooldown" | "transient" | "non-rotatable";

export interface RetryHeaders {
	retryAfter?: string;
	rateLimitReset?: string;
}

export interface ErrorClassification {
	status?: number;
	disposition: ErrorDisposition;
	shouldRotate: boolean;
	nextStatus?: CredentialStatus;
	disableCredential: boolean;
	headers: RetryHeaders;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === "object" && value !== null;
}

function readProperty(value: UnknownRecord, key: string): unknown {
	try {
		return value[key];
	} catch {
		return undefined;
	}
}

function numericStatus(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599) {
		return value;
	}
	if (typeof value === "string" && /^\d{3}$/.test(value)) {
		const parsed = Number(value);
		return parsed >= 100 && parsed <= 599 ? parsed : undefined;
	}
	return undefined;
}

/** Extracts an HTTP status from common Fetch, Axios, and wrapped-error shapes. */
export function extractHttpStatus(error: unknown): number | undefined {
	const seen = new Set<object>();
	let current: unknown = error;

	for (let depth = 0; depth < 4 && isRecord(current); depth += 1) {
		if (seen.has(current)) break;
		seen.add(current);

		for (const key of ["status", "statusCode", "httpStatus"]) {
			const status = numericStatus(readProperty(current, key));
			if (status !== undefined) return status;
		}

		const response = readProperty(current, "response");
		if (isRecord(response)) {
			const status = numericStatus(readProperty(response, "status"));
			if (status !== undefined) return status;
		}

		current = readProperty(current, "cause");
	}

	return undefined;
}

function readHeaderContainer(headers: unknown, name: string): string | undefined {
	if (!headers) return undefined;
	const normalized = name.toLowerCase();

	if (typeof (headers as { get?: unknown }).get === "function") {
		try {
			const value = (headers as { get(key: string): unknown }).get(name);
			if (typeof value === "string" && value.trim()) return value.trim();
		} catch {
			// Continue through plain object and map-like forms.
		}
	}

	if (headers instanceof Map) {
		for (const [key, value] of headers) {
			if (String(key).toLowerCase() === normalized && value != null) return String(value).trim() || undefined;
		}
		return undefined;
	}

	if (!isRecord(headers)) return undefined;
	for (const key of Object.keys(headers)) {
		if (key.toLowerCase() !== normalized) continue;
		const value = readProperty(headers, key);
		if (typeof value === "string" || typeof value === "number") return String(value).trim() || undefined;
	}
	return undefined;
}

/** Reads retry headers without assuming a particular HTTP client error type. */
export function extractRetryHeaders(error: unknown): RetryHeaders {
	const root = isRecord(error) ? error : undefined;
	const response = root && isRecord(readProperty(root, "response")) ? readProperty(root, "response") : undefined;
	const containers = [
		root && readProperty(root, "headers"),
		isRecord(response) && readProperty(response, "headers"),
	];

	for (const headers of containers) {
		const retryAfter = readHeaderContainer(headers, "retry-after");
		const rateLimitReset = readHeaderContainer(headers, "x-ratelimit-reset");
		if (retryAfter || rateLimitReset) return { retryAfter, rateLimitReset };
	}
	return {};
}

function errorText(error: unknown): string {
	if (!isRecord(error)) return typeof error === "string" ? error.toLowerCase() : "";
	const values = [readProperty(error, "message"), readProperty(error, "code"), readProperty(error, "type")];
	const response = readProperty(error, "response");
	if (isRecord(response)) values.push(readProperty(response, "statusText"), readProperty(response, "data"));
	return values
		.map((value) => {
			if (typeof value === "string") return value;
			try {
				return typeof value === "object" && value !== null ? JSON.stringify(value) : "";
			} catch {
				return "";
			}
		})
		.join(" ")
		.toLowerCase();
}

function isQuotaFailure(error: unknown): boolean {
	return /(?:quota|rate[ _-]?limit|usage[ _-]?limit|insufficient[ _-]?(?:credit|balance|fund)|billing|payment required|exceed(?:ed)?(?: your)? (?:plan|limit)|resource exhausted)/i.test(
		errorText(error),
	);
}

/**
 * Maps transport-independent errors to a credential action.  Client request
 * errors are deliberately non-rotatable: another key cannot repair them.
 */
export function classifyError(error: unknown): ErrorClassification {
	const status = extractHttpStatus(error);
	const headers = extractRetryHeaders(error);

	if (status === 401) {
		return { status, disposition: "invalid", shouldRotate: true, nextStatus: "invalid", disableCredential: true, headers };
	}
	if (status === 403 && isQuotaFailure(error)) {
		return { status, disposition: "exhausted", shouldRotate: true, nextStatus: "exhausted", disableCredential: false, headers };
	}
	if (status === 429) {
		return { status, disposition: "cooldown", shouldRotate: true, nextStatus: "cooldown", disableCredential: false, headers };
	}
	if (status === 400 || status === 403 || status === 404 || status === 422) {
		return { status, disposition: "non-rotatable", shouldRotate: false, disableCredential: false, headers };
	}
	if (status === undefined || status >= 500 || status === 408 || status === 409 || status === 425) {
		return { status, disposition: "transient", shouldRotate: true, disableCredential: false, headers };
	}
	return { status, disposition: "non-rotatable", shouldRotate: false, disableCredential: false, headers };
}
