import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

export interface RouterCommandState {
	status(): string;
	list(providerId?: string): string;
	remove(providerId: string, credentialId: string): string;
	setEnabled(providerId: string, credentialId: string, enabled: boolean): string;
	setStrategy(providerId: string, strategy: "round-robin" | "fallback"): string;
}

export function registerRouterCommand(pi: ExtensionAPI, state: RouterCommandState): void {
	pi.registerCommand("router", {
		description: "Manage Mamak Router credentials and routing strategy",
		handler: async (args, ctx) => {
			const [command = "status", providerId, value] = args.trim().split(/\s+/);
			const message = runRouterCommand(state, command, providerId, value);
			ctx.ui.notify(message, message.startsWith("Router error:") ? "error" : "info");
		},
	});
}

function runRouterCommand(state: RouterCommandState, command: string, providerId?: string, value?: string): string {
	switch (command) {
		case "status":
			return state.status();
		case "list":
			return state.list(providerId);
		case "add":
			return "Router error: secure API-key input is not exposed by oh-my-pi extensions. Add keys with MAMAK_ROUTER_<PROVIDER>_KEYS or MAMAK_ROUTER_CONFIG, then restart the session.";
		case "remove":
			if (!providerId || !value) return "Router error: usage: /router remove <provider> <credential>";
			return state.remove(providerId, value);
		case "enable":
			if (!providerId || !value) return "Router error: usage: /router enable <provider> <credential>";
			return state.setEnabled(providerId, value, true);
		case "disable":
			if (!providerId || !value) return "Router error: usage: /router disable <provider> <credential>";
			return state.setEnabled(providerId, value, false);
		case "strategy":
			if (value !== "round-robin" && value !== "fallback") {
				return "Router error: usage: /router strategy <provider> <round-robin|fallback>";
			}
			return providerId ? state.setStrategy(providerId, value) : "Router error: missing provider";
		default:
			return "Router error: commands: status, list [provider], add, remove, enable, disable, strategy";
	}
}

