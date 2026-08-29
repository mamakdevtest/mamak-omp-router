import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { RoutingStrategy } from "../credentials/credential-types";

export interface RouterCommandState {
	status(): string;
	list(providerId?: string): string;
	add(providerId: string, secret: string): Promise<string>;
	remove(providerId: string, credentialId: string): string;
	setEnabled(providerId: string, credentialId: string, enabled: boolean): string;
	setStrategy(providerId: string, strategy: RoutingStrategy): string;
	quota(providerId?: string): string;
	dashboard(): string;
	/** For autocomplete — live provider ids and credential ids */
	providerIds(): string[];
	credentialIds(providerId: string): string[];
}

const SUBCOMMANDS: Array<{ value: string; label: string; description: string }> = [
	{ value: "status", label: "status", description: "Show healthy/cooldown/total per provider" },
	{ value: "dashboard", label: "dashboard", description: "Full table: providers + models + quota (Open WebUI style)" },
	{ value: "list", label: "list", description: "List credentials (masked) — list [provider]" },
	{ value: "quota", label: "quota", description: "Show request/429/exhausted counters — quota [provider]" },
	{ value: "add", label: "add", description: "Add a key in-memory for testing — add <provider> <key>" },
	{ value: "remove", label: "remove", description: "Remove in-memory — remove <provider> <credential>" },
	{ value: "enable", label: "enable", description: "Re-enable credential" },
	{ value: "disable", label: "disable", description: "Disable credential (skipped by router)" },
	{ value: "strategy", label: "strategy", description: "Set strategy — strategy <provider> <round-robin|fallback|fill-first|weighted|least-used>" },
];

const STRATEGIES: RoutingStrategy[] = ["round-robin", "fallback", "fill-first", "weighted", "least-used"];

export function registerRouterCommand(pi: ExtensionAPI, state: RouterCommandState): void {
	pi.registerCommand("router", {
		description: "Mamak Router — provider'larına çoklu key/host ekle, otomatik fallback",
		getArgumentCompletions: (argumentPrefix: string) => {
			const raw = argumentPrefix.trimStart();
			if (raw === "") return SUBCOMMANDS.map(s => ({ value: s.value + " ", label: s.label, description: s.description }));
			const parts = raw.split(/\s+/);
			if (parts.length === 1) {
				const pref = parts[0]!.toLowerCase();
				return SUBCOMMANDS.filter(s => s.value.startsWith(pref)).map(s => ({ value: s.value + " ", label: s.label, description: s.description }));
			}
			const cmd = parts[0]!.toLowerCase();
			const second = parts[1] ?? "";
			const third = parts[2] ?? "";
			const providers = state.providerIds();
			if (parts.length === 2) {
				if (["list", "quota", "dashboard", "status", "add", "remove", "enable", "disable", "strategy"].includes(cmd)) {
					return providers.filter(p => p.startsWith(second.toLowerCase())).map(p => ({ value: p + " ", label: p, description: `${p} provider — OMP listesi ile bağlı` }));
				}
			}
			if (parts.length === 3) {
				if (["remove", "enable", "disable"].includes(cmd)) {
					const ids = state.credentialIds(second);
					return ids.filter(id => id.startsWith(third)).map(id => ({ value: id, label: id, description: `${second}/${id}` }));
				}
				if (cmd === "strategy") {
					return STRATEGIES.filter(s => s.startsWith(third.toLowerCase())).map(s => ({ value: s, label: s, description: `strategy ${s}` }));
				}
				if (cmd === "add") {
					return [{ value: "paste-key-here", label: "paste-key-here", description: "API key'i yapıştır — sonra Enter, otomatik provider'a bağlanır" }];
				}
			}
			return null;
		},
		handler: async (args, ctx) => {
			const trimmed = args.trim();
			if (trimmed === "") {
				ctx.ui.notify(state.status(), "info");
				return;
			}
			const [rawCommand = "status", rawProvider, ...rest] = trimmed.split(/\s+/);
			const command = rawCommand.toLowerCase();
			const providerId = rawProvider ? normalizeProviderId(rawProvider) : undefined;
			const value = rest.join(" ");
			// Interactive /router add <provider> → key sor
			if (command === "add" && providerId && !value) {
				const key = await ctx.ui.input(`Key for ${providerId}`, "sk-... / zai-... / zen-... (boş bırakırsan iptal)");
				if (!key || !key.trim()) {
					ctx.ui.notify("Router add iptal — key girilmedi. Tekrar: /router add opencode-zen <key>", "warning");
					return;
				}
				try {
					const msg = await state.add(providerId, key.trim());
					ctx.ui.notify(msg, msg.startsWith("Router error:") ? "error" : "info");
				} catch (e) {
					ctx.ui.notify(`Router error: ${e instanceof Error ? e.message : String(e)}`, "error");
				}
				return;
			}
			try {
				const message = await runRouterCommand(state, command, providerId, value);
				ctx.ui.notify(message, message.startsWith("Router error:") ? "error" : "info");
			} catch (e) {
				ctx.ui.notify(`Router error: ${e instanceof Error ? e.message : String(e)}`, "error");
			}
		},
	});
}
function normalizeProviderId(raw: string): string {
	const lower = raw.toLowerCase().trim();
	const slug = lower.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
	const aliases: Record<string, string> = {
		"open": "openrouter",
		"open-source": "opencode-zen",
		"opencode": "opencode-zen",
		"opencodezen": "opencode-zen",
		"open-code-zen": "opencode-zen",
		"zai": "zai",
		"z-ai": "zai",
		"groq": "groq",
		"cerebras": "cerebras",
		"deepseek": "deepseek",
	};
	return aliases[slug] ?? slug;
}

async function runRouterCommand(state: RouterCommandState, command: string, providerId?: string, value?: string): Promise<string> {
	switch (command.toLowerCase()) {
		case "":
		case "status":
			return state.status();
		case "list":
			return state.list(providerId);
		case "add": {
			if (!providerId) return "Router error: usage: /router add <provider> <key>  — e.g. /router add zai sk-...  (also: export MAMAK_ROUTER_ZAI_KEYS=key1,key2 && restart)";
			if (!value) {
				return "Router error: missing key — usage: /router add <provider> <key>  (key stays in-memory, SHA-256 deduped, never logged). Example for testing: /router add opencode-zen test-key-burak-1";
			}
			return state.add(providerId, value);
		}
		case "remove":
			if (!providerId || !value) return "Router error: usage: /router remove <provider> <credential>  — see /router list <provider>";
			return state.remove(providerId, value);
		case "enable":
			if (!providerId || !value) return "Router error: usage: /router enable <provider> <credential>";
			return state.setEnabled(providerId, value, true);
		case "disable":
			if (!providerId || !value) return "Router error: usage: /router disable <provider> <credential>";
			return state.setEnabled(providerId, value, false);
		case "strategy": {
			if (!providerId || !value) return "Router error: usage: /router strategy <provider> <round-robin|fallback|fill-first|weighted|least-used>";
			if ((STRATEGIES as string[]).includes(value) === false) return `Router error: unknown strategy ${value} — pick ${STRATEGIES.join("|")}`;
			return state.setStrategy(providerId, value as RoutingStrategy);
		}
		case "quota":
			return state.quota(providerId);
		case "dashboard":
			return state.dashboard();
		default:
			return `Router error: unknown command ${command} — try: ${SUBCOMMANDS.map(s => s.value).join(", ")}`;
	}
}
