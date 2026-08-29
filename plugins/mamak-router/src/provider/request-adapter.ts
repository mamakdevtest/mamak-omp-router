import type {
	Api,
	AssistantMessage,
	AssistantMessageEvent,
	Context,
	Model,
	SimpleStreamOptions,
} from "@oh-my-pi/pi-ai";
import { streamOpenAICompletions } from "@oh-my-pi/pi-ai/providers/openai-completions";
import { AssistantMessageEventStream } from "@oh-my-pi/pi-ai/utils/event-stream";
import type { CredentialRouter } from "../router/credential-router";

export type RouterStream = (
	model: Model<Api>,
	context: Context,
	options?: SimpleStreamOptions,
) => AssistantMessageEventStream;

/**
 * Retries only until OpenAI's transport has accepted a response and emitted its
 * start event. Once any event is exposed, the selected stream is forwarded as-is:
 * replaying an already-visible response would duplicate assistant output.
 */
export function createOpenAICompatibleRouterStream(router: CredentialRouter): RouterStream {
	return (model, context, options) => {
		const output = new AssistantMessageEventStream();
		void output.trackLocalWork(forwardFirstCommittedAttempt(output, router, model, context, options));
		return output;
	};
}

async function forwardFirstCommittedAttempt(
	output: AssistantMessageEventStream,
	router: CredentialRouter,
	model: Model<Api>,
	context: Context,
	options: SimpleStreamOptions | undefined,
): Promise<void> {
	try {
		const committed = await router.run(async credential => {
			const openAIModel = {
				...model,
				api: "openai-completions",
				compat: model.compat ?? {},
			} as Model<"openai-completions">;
			const stream = streamOpenAICompletions(openAIModel, context, { ...options, apiKey: credential.secret });
			const iterator = stream[Symbol.asyncIterator]();
			const first = await iterator.next();
			if (first.done) throw new Error("Provider stream ended before its first event");
			if (first.value.type === "error") throw first.value.error;
			if (first.value.type !== "start") throw new Error("Provider emitted output before its start event");
			return { stream, iterator, first: first.value };
		});

		output.forwardLocalWorkFrom(committed.stream);
		output.push(committed.first);
		for (;;) {
			const event = await committed.iterator.next();
			if (event.done) return;
			output.push(event.value);
			if (event.value.type === "done" || event.value.type === "error") return;
		}
	} catch (error) {
		output.push({
			type: "error",
			reason: "error",
			error: createRouterErrorMessage(model, error),
		});
	} finally {
		output.forwardLocalWorkFrom(undefined);
	}
}

function createRouterErrorMessage(model: Model<Api>, error: unknown): AssistantMessage {
	if (isAssistantMessage(error)) return error;
	return {
		role: "assistant",
		content: [],
		api: model.api,
		provider: model.provider,
		model: model.id,
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
		stopReason: "error",
		errorMessage: error instanceof Error ? error.message : "Mamak Router request failed",
		timestamp: Date.now(),
	};
}

function isAssistantMessage(value: unknown): value is AssistantMessage {
	return typeof value === "object" && value !== null && "stopReason" in value && "content" in value;
}
