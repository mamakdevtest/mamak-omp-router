import { describe, expect, test } from "bun:test";
import { CredentialStore } from "../src/credentials/credential-store";
import { importCredentialsFromEnvironment } from "../src/credentials/credential-import";
import type { CredentialSecret, RouterSettings } from "../src/credentials/credential-types";
import { calculateCooldownSeconds, calculateCooldownUntil } from "../src/router/cooldown-manager";
import { CredentialRouter, CredentialsUnavailableError } from "../src/router/credential-router";
import { classifyError } from "../src/router/error-classifier";

const settings: RouterSettings = {
	maxAttemptsPerRequest: 5,
	defaultStrategy: "round-robin",
	cooldown: { defaultSeconds: 30, maxSeconds: 300 },
};

function createCredential(id: string, status: CredentialSecret["credential"]["status"] = "healthy"): CredentialSecret {
	return {
		secret: `secret-${id}`,
		credential: {
			id,
			providerId: "deepseek",
			enabled: status !== "disabled",
			status,
			successCount: 0,
			failureCount: 0,
			fingerprint: `fingerprint-${id}`,
		},
	};
}

describe("CredentialRouter", () => {
	test("rotates round-robin and skips disabled or cooling credentials", async () => {
		const first = createCredential("deepseek-1");
		const disabled = createCredential("deepseek-2", "disabled");
		const cooling = createCredential("deepseek-3", "cooldown");
		cooling.credential.cooldownUntil = Date.now() + 60_000;
		const fourth = createCredential("deepseek-4");
		const router = new CredentialRouter([first, disabled, cooling, fourth], { strategy: "round-robin", settings });

		expect(await router.run(async credential => credential.credential.id)).toBe("deepseek-1");
		expect(await router.run(async credential => credential.credential.id)).toBe("deepseek-4");
		expect(await router.run(async credential => credential.credential.id)).toBe("deepseek-1");
	});

	test("caps retries and does not rotate an invalid request", async () => {
		const router = new CredentialRouter([createCredential("one"), createCredential("two")], { strategy: "fallback", settings });
		let calls = 0;
		await expect(router.run(async () => {
			calls += 1;
			throw { status: 400, message: "invalid request" };
		})).rejects.toMatchObject({ status: 400 });
		expect(calls).toBe(1);
	});

	test("disables 401 then retries the next key", async () => {
		const first = createCredential("one");
		const second = createCredential("two");
		const router = new CredentialRouter([first, second], { strategy: "fallback", settings });
		const selected = await router.run(async credential => {
			if (credential.credential.id === "one") throw { status: 401, message: "unauthorized" };
			return credential.credential.id;
		});
		expect(selected).toBe("two");
		expect(first.credential.enabled).toBeFalse();
		expect(first.credential.status).toBe("invalid");
	});

	test("reports unavailable when every credential is disabled", async () => {
		const router = new CredentialRouter([createCredential("one", "disabled")], { strategy: "fallback", settings });
		await expect(router.run(async credential => credential.secret)).rejects.toBeInstanceOf(CredentialsUnavailableError);
	});
});

describe("error classification and cooldown", () => {
	test("classifies credential and non-credential failures", () => {
		expect(classifyError({ status: 401 }).disposition).toBe("invalid");
		expect(classifyError({ status: 403, message: "quota exhausted" }).disposition).toBe("exhausted");
		expect(classifyError({ status: 408 }).shouldRotate).toBeTrue();
		expect(classifyError({ status: 429 }).disposition).toBe("cooldown");
		expect(classifyError({ status: 500 }).shouldRotate).toBeTrue();
		expect(classifyError({ status: 502 }).shouldRotate).toBeTrue();
		expect(classifyError({ status: 503 }).shouldRotate).toBeTrue();
		expect(classifyError(new Error("network timeout")).shouldRotate).toBeTrue();
		expect(classifyError({ status: 400 }).shouldRotate).toBeFalse();
	});

	test("uses retry headers then bounded exponential cooldown", () => {
		const now = 1_700_000_000_000;
		expect(calculateCooldownSeconds(1, {}, settings.cooldown, now)).toBe(30);
		expect(calculateCooldownSeconds(3, {}, settings.cooldown, now)).toBe(120);
		expect(calculateCooldownSeconds(7, {}, settings.cooldown, now)).toBe(240);
		expect(calculateCooldownUntil(1, { retryAfter: "45" }, settings.cooldown, now)).toBe(now + 45_000);
	});
});

describe("environment credential import", () => {
	test("deduplicates secrets and never exposes them in summaries", async () => {
		const store = new CredentialStore();
		const result = await importCredentialsFromEnvironment(
			store,
			[{ id: "deepseek", enabled: true }],
			{ DEEPSEEK_KEYS: "one, two, one", DEEPSEEK_KEY_003: "three" },
		);
		expect(result.added).toHaveLength(3);
		expect(result.duplicateCount).toBe(1);
		expect(JSON.stringify(store.listSummaries())).not.toContain("one");
		expect(JSON.stringify(store.listSummaries())).not.toContain("two");
		expect(JSON.stringify(store.listSummaries())).not.toContain("three");
	});
});
