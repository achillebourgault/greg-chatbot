import fs from "node:fs/promises";
import path from "node:path";

export type ConversationLogEvent = {
	ts: string;
	type: string;
	conversationId: string;
	data?: Record<string, unknown>;
};

function safeString(value: unknown, max = 600): string {
	const s = typeof value === "string" ? value : value == null ? "" : String(value);
	if (s.length <= max) return s;
	return s.slice(0, Math.max(0, max - 1)) + "…";
}

function safeData(data: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
	if (!data) return undefined;
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(data)) {
		if (typeof v === "string") out[k] = safeString(v);
		else if (Array.isArray(v)) out[k] = v.slice(0, 40).map((x) => (typeof x === "string" ? safeString(x, 300) : x));
		else out[k] = v;
	}
	return out;
}

function enabled(): boolean {
	const raw = process.env.GREG_ENABLE_LOGS;
	if (raw != null) {
		const v = raw.trim().toLowerCase();
		if (["1", "true", "yes", "y", "on"].includes(v)) return true;
		if (["0", "false", "no", "n", "off"].includes(v)) return false;
	}
	// Default: enabled in dev only.
	return process.env.NODE_ENV !== "production";
}

function logDir(): string {
	return process.env.GREG_LOG_DIR?.trim() || path.join(process.cwd(), ".greg-logs");
}

function normalizeConversationId(id: string): string {
	const s = (id ?? "").trim();
	if (!s) return "unknown";
	// Keep filesystem-safe.
	return s.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "unknown";
}

export async function appendConversationLog(conversationId: string, type: string, data?: Record<string, unknown>) {
	if (!enabled()) return;
	const cid = normalizeConversationId(conversationId);
	const dir = logDir();
	const filePath = path.join(dir, `${cid}.jsonl`);

	const ev: ConversationLogEvent = {
		ts: new Date().toISOString(),
		type,
		conversationId: cid,
		data: safeData(data),
	};

	try {
		await fs.mkdir(dir, { recursive: true });
		await fs.appendFile(filePath, JSON.stringify(ev) + "\n", "utf8");
	} catch {
		// Never break chat flow for logging errors.
	}
}
