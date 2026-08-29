import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { RouterPluginConfig } from "./config/schema";
import { registerRouterCommand, type RouterCommandState } from "./commands/router-command";
import { loadRouterConfig } from "./config/loader";
import { CredentialStore } from "./credentials/credential-store";
import { importCredentialsFromEnvironment } from "./credentials/credential-import";
import { registerRouterProviders } from "./provider/register-provider";
import type { CredentialRouter } from "./router/credential-router";
export default async function mamakRouter(pi: ExtensionAPI): Promise<void> {
	const config = loadRouterConfig();
	const store = new CredentialStore();
	const imported = await importCredentialsFromEnvironment(store, config.providers);
	const routers = registerRouterProviders(pi, config, store);

	pi.setLabel("Mamak Router");
	pi.logger.info(
		`[mamak-router] providers=${routers.size} credentials=${imported.added.length} duplicates=${imported.duplicateCount}`,
	);
	registerRouterCommand(pi, createCommandState(config, store, routers));
}

function createCommandState(
	config: RouterPluginConfig,
	store: CredentialStore,
	routers: Map<string, CredentialRouter>,
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
			const router = routers.get(providerId);
			if (!router) return `Router error: provider ${providerId} is not registered.`;
			router.options.strategy = strategy;
			return `${providerId} strategy is now ${strategy} for this session.`;
		},
	};
}
