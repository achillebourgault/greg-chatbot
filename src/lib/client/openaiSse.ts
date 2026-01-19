type StreamHandlers = {
	onTextDelta: (delta: string) => void;
	onDone?: () => void;
};

type OpenAiStreamChunk = {
	choices?: Array<{
		delta?: {
			content?: unknown;
		};
	}>;
};

export async function consumeOpenAiSse(
	response: Response,
	handlers: StreamHandlers,
) {
	if (!response.body) throw new Error("Missing response body");

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	const flushEvent = (eventBlock: string) => {
		const lines = eventBlock.split("\n");
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed.startsWith("data:")) continue;

			const data = trimmed.slice("data:".length).trim();
			if (!data) continue;
			if (data === "[DONE]") {
				handlers.onDone?.();
				return;
			}

			let parsed: unknown;
			try {
				parsed = JSON.parse(data);
			} catch {
				continue;
			}

			const chunk = parsed as OpenAiStreamChunk;
			const delta = chunk.choices?.[0]?.delta?.content;
			if (typeof delta === "string" && delta.length > 0) {
				handlers.onTextDelta(delta);
			}
		}
	};

	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n");

		let boundaryIndex: number;
		while ((boundaryIndex = buffer.indexOf("\n\n")) !== -1) {
			const eventBlock = buffer.slice(0, boundaryIndex);
			buffer = buffer.slice(boundaryIndex + 2);
			flushEvent(eventBlock);
		}
	}

	handlers.onDone?.();
}
