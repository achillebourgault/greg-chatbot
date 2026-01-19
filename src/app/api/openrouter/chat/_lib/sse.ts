export type StatusLevel = "brief" | "detailed";

export const PHASE_SEARCH = "@phase:search";
export const PHASE_FETCH = "@phase:fetch";
export const PHASE_READ = "@phase:read";
export const PHASE_WRITE = "@phase:write";

export function phase(key: string, idx?: number, total?: number, url?: string) {
	const hasCount = typeof idx === "number" && typeof total === "number" && total > 0;
	const base = hasCount ? `${key} ${idx}/${total}` : key;
	const u = (url ?? "").trim();
	return u ? `${base} ${u}` : base;
}

export function createSseStream(req: Request) {
	const encoder = new TextEncoder();
	const { readable, writable } = new TransformStream();
	const writer = writable.getWriter();
	let writerClosed = false;

	const closeWriterSafe = async () => {
		if (writerClosed) return;
		writerClosed = true;
		try {
			await writer.close();
		} catch {
			// ignore
		}
	};

	const statusMode = (req.headers.get("x-greg-status") ?? "").toLowerCase();
	const sendDetailedStatus = statusMode === "detailed" || statusMode === "mcp";
	let briefStatusEnabled = false;
	let lastStatusBrief: string | null = null;
	let lastStatusDetailed: string | null = null;

	const writeDelta = async (text: string) => {
		const payload = { choices: [{ delta: { content: text } }] };
		await writer.write(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
	};

	const writeDone = async () => {
		await writer.write(encoder.encode("data: [DONE]\n\n"));
	};

	const writeStatus = async (status: string | null, level: StatusLevel = "detailed") => {
		if (level === "detailed") {
			if (!sendDetailedStatus) return;
		} else {
			if (!(sendDetailedStatus || briefStatusEnabled)) return;
		}
		const s = status ?? "";
		if (level === "brief") {
			if (lastStatusBrief === s) return;
			lastStatusBrief = s;
		} else {
			if (lastStatusDetailed === s) return;
			lastStatusDetailed = s;
		}
		await writeDelta(`<greg_status level="${level}">${s}</greg_status>`);
	};

	return {
		readable,
		writer,
		writeDelta,
		writeDone,
		writeStatus,
		closeWriterSafe,
		get sendDetailedStatus() {
			return sendDetailedStatus;
		},
		get briefStatusEnabled() {
			return briefStatusEnabled;
		},
		set briefStatusEnabled(v: boolean) {
			briefStatusEnabled = v;
		},
	};
}

export function sseResponse(readable: ReadableStream) {
	return new Response(readable, {
		status: 200,
		headers: {
			"Content-Type": "text/event-stream; charset=utf-8",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
		},
	});
}
