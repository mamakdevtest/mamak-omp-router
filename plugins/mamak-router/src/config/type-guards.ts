export type ConfigRecord = Record<string, unknown>;

/** Canonical boundary guard for untyped JSON configuration. */
export function isConfigRecord(value: unknown): value is ConfigRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
