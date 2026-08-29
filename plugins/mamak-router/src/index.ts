import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { RouterPluginConfig } from "./config/schema";
import { registerRouterCommand, type RouterCommandState } from "./commands/router-command";
import { loadRouterConfig } from "./config/loader";
import { CredentialStore } from "./credentials/credential-store";
import { importCredentialsFromEnvironment } from "./credentials/credential-import";
import { registerRouterProviders, type RouterProviderRegistration } from "./provider/register-provider";
export default async function mamakRouter(pi: ExtensionAPI): Promise<void> {
	const config = loadRouterConfig();
	const store = new CredentialStore();
	const imported = await importCredentialsFromEnvironment(store, config.providers);
	const registration = registerRouterProviders(pi, config, store);

	pi.setLabel("Mamak Router");
	pi.logger.info(
		`[mamak-router] providers=${registration.routers.size} credentials=${imported.added.length} duplicates=${imported.duplicateCount}`,
	);
	registerRouterCommand(pi, createCommandState(config, store, registration));
}

function createCommandState(
	config: RouterPluginConfig,
	store: CredentialStore,
	registration: RouterProviderRegistration,
): RouterCommandState {
	return {
		status() {
			const lines = ["Mamak Router"];
			for (const provider of config.providers) {
				const summaries = store.listSummaries(provider.id);
				const count = (status: string) => summaries.filter(credential => credential.status === status).length;
				lines.push(
					"",
					provider.id,
					`Healthy: ${count("healthy")}`,
					`Cooldown: ${count("cooldown") + count("rate_limited")}`,
					`Disabled: ${count("disabled") + count("invalid")}`,
					`Exhausted: ${count("exhausted")}`,
					`Total: ${summaries.length}`,
				);
			}
			return lines.join("\n");
		},
		list(providerId) {
			const summaries = store.listSummaries(providerId);
			if (summaries.length === 0) return providerId ? `No credentials for ${providerId}.` : "No router credentials imported.";
			return summaries
				.map(credential => `${credential.id}\t****${credential.fingerprint.slice(-4).toUpperCase()}\t${credential.status}`)
				.join("\n");
		},
		remove(providerId, credentialId) {
			const credential = store.getSummary(credentialId);
			if (!credential || credential.providerId !== providerId) return `Router error: credential ${credentialId} was not found for ${providerId}.`;
			store.updateMetadata(credentialId, { enabled: false, status: "disabled" });
			store.remove(credentialId);
			return `Removed ${credentialId} from this session. Remove it from its environment variable before restarting.`;
		},
		setEnabled(providerId, credentialId, enabled) {
			const credential = store.getSummary(credentialId);
			if (!credential || credential.providerId !== providerId) return `Router error: credential ${credentialId} was not found for ${providerId}.`;
			store.updateMetadata(credentialId, {
				enabled,
				status: enabled ? "healthy" : "disabled",
				cooldownUntil: undefined,
			});
			return `${enabled ? "Enabled" : "Disabled"} ${credentialId}.`;
		},
		setStrategy(providerId, strategy) {
			const router = registration.routers.get(providerId);
			if (!router) return `Router error: provider ${providerId} is not registered.`;
			router.options.strategy = strategy;
			return `${providerId} strategy is now ${strategy} for this session.`;
		},
		quota(providerId) {
			const trackers = providerId
				? [registration.quotaTrackers.get(providerId)].filter((tracker): tracker is NonNullable<typeof tracker> => tracker !== undefined)
				: [...registration.quotaTrackers.values()];
			if (trackers.length === 0) return providerId ? `Router error: provider ${providerId} is not registered.` : "No provider quota data is available.";
			return trackers
				.map(tracker => {
					const quota = tracker.snapshot();
					return `${quota.providerId}: requests=${quota.requestCount} rate-limits=${quota.rateLimitCount} exhausted=${quota.exhaustedCount}${quota.lastStatus === undefined ? "" : ` last-status=${quota.lastStatus}`}`;
				})
				.join("\n");
		},
		dashboard() {
			const lines = ["Mamak Router Dashboard"];
			for (const provider of config.providers) {
				const summaries = store.listSummaries(provider.id);
				const quota = registration.quotaTrackers.get(provider.id)?.snapshot();
				const healthy = summaries.filter(credential => credential.status === "healthy").length;
				const cooldown = summaries.filter(credential => credential.status === "cooldown" || credential.status === "rate_limited").length;
				lines.push(
					"",
					provider.id,
					`credentials: healthy=${healthy} cooldown=${cooldown} total=${summaries.length}`,
					quota
						? `quota: requests=${quota.requestCount} rate-limits=${quota.rateLimitCount} exhausted=${quota.exhaustedCount}`
						: "quota: unavailable",
				);
			}
			return lines.join("\n");
		},
	};
}
