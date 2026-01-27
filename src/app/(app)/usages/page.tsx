"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Icons } from "@/components/ui";
import { intlLocale, t, type UiLanguage } from "@/i18n";
import { approxTokens } from "@/lib/providers";
import { fetchModels, type ModelListItem } from "@/lib/client/openrouter";
import { getModelDisplayName, useChatStore, type ChatMessage } from "@/stores/chat-store";

type Pricing = {
	promptPerToken: number | null;
	completionPerToken: number | null;
	requestUsd: number | null;
};

function parsePrice(value?: string): number | null {
	if (!value) return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

function formatMoneyUsd(value: number, lang: UiLanguage): string {
	if (!Number.isFinite(value)) return t(lang, "pricing.free");
	if (value === 0) return t(lang, "pricing.free");
	if (value < 0.01) return `$${value.toFixed(4)}`;
	if (value < 1) return `$${value.toFixed(3)}`;
	if (value < 10) return `$${value.toFixed(2)}`;
	return `$${value.toFixed(1)}`;
}

function formatInt(n: number, lang: UiLanguage): string {
	return new Intl.NumberFormat(intlLocale(lang)).format(n);
}

function formatDateTime(ts: number, lang: UiLanguage): string {
	return new Date(ts).toLocaleString(intlLocale(lang), {
		year: "numeric",
		month: "short",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function findPreviousUserMessage(messages: ChatMessage[], assistantIndex: number): ChatMessage | null {
	for (let j = assistantIndex - 1; j >= 0; j--) {
		const m = messages[j];
		if (m?.role === "user") return m;
	}
	return null;
}

function usePricingMap() {
	const [models, setModels] = useState<ModelListItem[] | null>(null);

	useEffect(() => {
		const controller = new AbortController();
		fetchModels(controller.signal)
			.then(setModels)
			.catch(() => setModels([]));
		return () => controller.abort();
	}, []);

	return useMemo(() => {
		const map = new Map<string, Pricing>();
		for (const m of models ?? []) {
			map.set(m.id, {
				promptPerToken: parsePrice(m.pricing?.prompt),
				completionPerToken: parsePrice(m.pricing?.completion),
				requestUsd: parsePrice(m.pricing?.request),
			});
		}
		return { map, ready: models !== null };
	}, [models]);
}

type UsageRow = {
	id: string;
	conversationId: string;
	conversationTitle: string;
	createdAt: number;
	modelId: string;
	inTokens: number;
	outTokens: number;
	costUsd: number;
	promptPreview: string;
};

type ModelAgg = {
	modelId: string;
	calls: number;
	inTokens: number;
	outTokens: number;
	costUsd: number;
};

function clampText(s: string, maxLen: number) {
	const t0 = (s ?? "").trim();
	if (t0.length <= maxLen) return t0;
	return t0.slice(0, Math.max(0, maxLen - 1)).trimEnd() + "…";
}

function dayKey(ts: number) {
	const d = new Date(ts);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

function buildLastNDaysSeries(rows: UsageRow[], days: number) {
	const now = new Date();
	now.setHours(0, 0, 0, 0);
	const today = now.getTime();
	const start = today - (days - 1) * 86400000;
	const buckets = new Map<number, number>();
	for (let t = start; t <= today; t += 86400000) buckets.set(t, 0);
	for (const r of rows) {
		const k = dayKey(r.createdAt);
		if (k < start || k > today) continue;
		buckets.set(k, (buckets.get(k) ?? 0) + r.costUsd);
	}
	return Array.from(buckets.entries()).map(([ts, v]) => ({ ts, v }));
}

function AnimatedLineChart({ series, label, lang }: { series: { ts: number; v: number }[]; label: string; lang: UiLanguage }) {
	const max = Math.max(0.000001, ...series.map((p) => p.v));
	const min = Math.min(0, ...series.map((p) => p.v));
	const w = 600;
	const h = 160;
	const pad = 14;
	const span = Math.max(1, series.length - 1);

	const points = series.map((p, i) => {
		const x = pad + (i / span) * (w - pad * 2);
		const y = pad + ((max - p.v) / (max - min)) * (h - pad * 2);
		return { ...p, x, y };
	});

	const d = points
		.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
		.join(" ");

	const progress = Math.min(1, points.length / 14);

	return (
		<div className="rounded-[var(--radius-xl)] bg-[var(--glass-bg-subtle)] border border-[var(--glass-border)] p-5">
			<div className="flex items-center justify-between gap-3">
				<div className="text-base font-bold text-[var(--text-primary)]">{label}</div>
				<div className="text-sm text-[var(--text-secondary)] px-3 py-1 rounded-[var(--radius-md)] bg-[var(--glass-bg)] border border-[var(--glass-border)]">
					{formatMoneyUsd(series.reduce((a, b) => a + b.v, 0), lang)}
				</div>
			</div>
			<div className="mt-4 overflow-hidden rounded-[var(--radius-lg)] bg-[var(--glass-bg-strong)] border border-[var(--glass-border)]">
				<svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[160px]">
					<defs />

					{points.length > 1 ? (
						<path
							d={`${d} L ${points[points.length - 1].x},${h - pad} L ${points[0].x},${h - pad} Z`}
							fill="var(--accent-cyan-glow)"
						/>
					) : null}

					<path
						d={d}
						fill="none"
						stroke="var(--accent-cyan)"
						strokeWidth={2.5}
						strokeLinecap="round"
						strokeLinejoin="round"
						style={{
							strokeDasharray: 2000,
							strokeDashoffset: 2000 - 2000 * progress,
							transition: "stroke-dashoffset 700ms ease-out",
						}}
					/>
					<defs />

					
					{points.map((p) => (
						<circle
							key={p.ts}
							cx={p.x}
							cy={p.y}
							r={4}
							fill="var(--glass-bg)"
							stroke="var(--accent-cyan)"
							strokeWidth="2"
							opacity={Math.min(1, progress * 1.2)}
						>
							<title>{`${new Date(p.ts).toLocaleDateString(undefined, { month: "short", day: "2-digit" })}: ${formatMoneyUsd(p.v, lang)}`}</title>
						</circle>
					))}
				</svg>
			</div>
		</div>
	);
}

export default function UsagesRoute() {
	const router = useRouter();
	const { state, resetModelStats } = useChatStore();
	const lang = state.settings.uiLanguage;
	const { map: pricingMap, ready: pricingReady } = usePricingMap();

	const [confirmResetOpen, setConfirmResetOpen] = useState(false);

	const [rangeDays, setRangeDays] = useState<number>(14);
	const [modelFilter, setModelFilter] = useState<string>("all");
	const [recentPage, setRecentPage] = useState(1);
	const [modelPage, setModelPage] = useState(1);
	const recentPageSize = 25;
	const modelPageSize = 20;

	const rows = useMemo((): UsageRow[] => {
		const all: UsageRow[] = [];
		const conversations = state.conversations;

		for (const c of conversations) {
			const messages = c.messages ?? [];
			for (let i = 0; i < messages.length; i++) {
				const msg = messages[i];
				if (!msg || msg.role !== "assistant") continue;

				const modelId = msg.model ?? c.model;
				const prevUser = findPreviousUserMessage(messages, i);
				const inTokens = prevUser ? approxTokens(prevUser.content) : 0;
				const outTokens = approxTokens(msg.content);

				const pricing = pricingMap.get(modelId);
				const p = pricing?.promptPerToken ?? 0;
				const comp = pricing?.completionPerToken ?? 0;
				const req = pricing?.requestUsd ?? 0;

				const costUsd = p * inTokens + comp * outTokens + req;
				all.push({
					id: msg.id,
					conversationId: c.id,
					conversationTitle: c.title || t(lang, "sidebar.untitled"),
					createdAt: msg.createdAt,
					modelId,
					inTokens,
					outTokens,
					costUsd,
					promptPreview: clampText(prevUser?.content ?? "", 120),
				});
			}
		}

		return all.sort((a, b) => b.createdAt - a.createdAt);
	}, [lang, pricingMap, state.conversations]);

	const filteredRows = useMemo(() => {
		let out = rows;
		if (modelFilter !== "all") {
			out = out.filter((r) => r.modelId === modelFilter);
		}
		if (rangeDays > 0) {
			const start = (() => {
				const d = new Date();
				d.setHours(0, 0, 0, 0);
				return d.getTime() - (rangeDays - 1) * 86400000;
			})();
			out = out.filter((r) => r.createdAt >= start);
		}
		return out;
	}, [modelFilter, rangeDays, rows]);

	const totals = useMemo(() => {
		const totalCost = rows.reduce((a, b) => a + b.costUsd, 0);
		const totalIn = rows.reduce((a, b) => a + b.inTokens, 0);
		const totalOut = rows.reduce((a, b) => a + b.outTokens, 0);
		const firstTs = rows.length ? Math.min(...rows.map((r) => r.createdAt)) : null;
		const lastTs = rows.length ? Math.max(...rows.map((r) => r.createdAt)) : null;
		return { totalCost, totalIn, totalOut, calls: rows.length, firstTs, lastTs };
	}, [rows]);

	const filteredTotals = useMemo(() => {
		const totalCost = filteredRows.reduce((a, b) => a + b.costUsd, 0);
		const totalIn = filteredRows.reduce((a, b) => a + b.inTokens, 0);
		const totalOut = filteredRows.reduce((a, b) => a + b.outTokens, 0);
		return { totalCost, totalIn, totalOut, calls: filteredRows.length };
	}, [filteredRows]);

	type ModelAggInternal = ModelAgg;
	const modelAgg = useMemo((): ModelAggInternal[] => {
		const map = new Map<string, ModelAggInternal>();
		for (const r of filteredRows) {
			const cur = map.get(r.modelId) ?? { modelId: r.modelId, calls: 0, inTokens: 0, outTokens: 0, costUsd: 0 };
			cur.calls += 1;
			cur.inTokens += r.inTokens;
			cur.outTokens += r.outTokens;
			cur.costUsd += r.costUsd;
			map.set(r.modelId, cur);
		}
		return Array.from(map.values()).sort((a, b) => b.costUsd - a.costUsd);
	}, [filteredRows]);

	const series = useMemo(() => {
		const days = Math.max(7, Math.min(90, rangeDays || 14));
		return buildLastNDaysSeries(filteredRows, days);
	}, [filteredRows, rangeDays]);

	const topModels = modelAgg.slice(0, 6);
	const modelIds = useMemo(() => {
		const ids = Array.from(new Set(rows.map((r) => r.modelId)));
		ids.sort((a, b) => a.localeCompare(b));
		return ids;
	}, [rows]);

	useEffect(() => {
		const id = requestAnimationFrame(() => {
			setRecentPage(1);
			setModelPage(1);
		});
		return () => cancelAnimationFrame(id);
	}, [modelFilter, rangeDays]);

	const pagedRecent = useMemo(() => {
		const total = filteredRows.length;
		const totalPages = Math.max(1, Math.ceil(total / recentPageSize));
		const page = Math.min(totalPages, Math.max(1, recentPage));
		const start = (page - 1) * recentPageSize;
		return {
			page,
			totalPages,
			items: filteredRows.slice(start, start + recentPageSize),
		};
	}, [filteredRows, recentPage]);

	const pagedModels = useMemo(() => {
		const total = modelAgg.length;
		const totalPages = Math.max(1, Math.ceil(total / modelPageSize));
		const page = Math.min(totalPages, Math.max(1, modelPage));
		const start = (page - 1) * modelPageSize;
		return { page, totalPages, items: modelAgg.slice(start, start + modelPageSize) };
	}, [modelAgg, modelPage]);

	const statCard = (label: string, value: string, hint?: string) => (
		<div className="rounded-[var(--radius-xl)] bg-[var(--glass-bg-subtle)] border border-[var(--glass-border)] p-5 hover:border-[var(--glass-border-hover)] transition-colors duration-200">
			<div className="text-xs text-[var(--text-tertiary)] font-medium">{label}</div>
			<div className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{value}</div>
			{hint ? <div className="mt-2 text-xs text-[var(--text-muted)]">{hint}</div> : null}
		</div>
	);

	return (
		<div className="h-full w-full overflow-auto scrollbar-premium">
			
			<header className="sticky top-0 z-10 flex items-center justify-between gap-3 px-6 py-4 border-b border-[var(--glass-border)] bg-[var(--glass-bg-strong)] backdrop-blur-xl">
				<div className="flex items-center gap-4">
					<button
						onClick={() => router.push("/")}
						className="w-10 h-10 rounded-[var(--radius-lg)] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] transition-all duration-200"
						title={t(lang, "actions.back")}
					>
						<Icons.arrowLeft className="w-5 h-5" />
					</button>
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-[var(--radius-lg)] bg-[var(--glass-bg-subtle)] border border-[var(--glass-border)] flex items-center justify-center">
							<Icons.chartBar className="w-5 h-5 text-[var(--text-primary)]" />
						</div>
						<div>
							<div className="text-base font-bold text-[var(--text-primary)]">{t(lang, "analytics.title")}</div>
							<div className="text-xs text-[var(--text-muted)]">{t(lang, "analytics.subtitle")}</div>
						</div>
					</div>
				</div>

				<div className="flex items-center gap-3">
					<button
						onClick={() => setConfirmResetOpen(true)}
						className="px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] transition-all duration-200"
						title={t(lang, "analytics.resetMetrics")}
					>
						{t(lang, "analytics.resetMetrics")}
					</button>
					<div className="text-xs text-[var(--text-muted)] px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--glass-bg)] border border-[var(--glass-border)]">
						{pricingReady ? t(lang, "analytics.pricing.ok") : t(lang, "analytics.pricing.loading")}
					</div>
				</div>
			</header>

			
			{confirmResetOpen ? (
				<div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-5">
					<div className="w-full max-w-md rounded-[var(--radius-xl)] glass-strong p-6 animate-scale-in">
						<div className="flex items-start gap-4">
							<div className="w-12 h-12 rounded-[var(--radius-xl)] bg-[var(--accent-orange-glow)] border border-[var(--glass-border)] ring-1 ring-[var(--accent-orange)] ring-opacity-25 flex items-center justify-center flex-shrink-0">
								<Icons.refresh className="w-6 h-6 text-[var(--accent-orange)]" />
							</div>
							<div>
								<div className="text-base font-bold text-[var(--text-primary)]">{t(lang, "analytics.resetModal.title")}</div>
								<div className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">{t(lang, "analytics.resetModal.body")}</div>
							</div>
						</div>

						<div className="mt-6 flex items-center justify-end gap-3">
							<Button variant="ghost" onClick={() => setConfirmResetOpen(false)}>
								{t(lang, "actions.cancel")}
							</Button>
							<Button
								variant="primary"
								onClick={() => {
									resetModelStats();
									setConfirmResetOpen(false);
								}}
							>
								{t(lang, "analytics.resetModal.confirm")}
							</Button>
						</div>
					</div>
				</div>
			) : null}

			<div className="px-6 py-6">
				<div className="w-full">
					
					<div className="mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
						<div className="flex items-center gap-3">
							<div className="text-xs text-[var(--text-tertiary)] font-medium">{t(lang, "analytics.range")}</div>
							<div className="relative">
								<select
									className="h-10 appearance-none rounded-[var(--radius-lg)] bg-[var(--glass-bg-subtle)] border border-[var(--glass-border)] pl-4 pr-10 text-sm text-[var(--text-secondary)] outline-none hover:bg-[var(--glass-bg)] focus:border-[var(--glass-border-hover)] transition-colors duration-200"
									value={rangeDays}
									onChange={(e) => setRangeDays(Number(e.target.value))}
								>
									{[
										{ label: t(lang, "analytics.range.7d"), value: 7 },
										{ label: t(lang, "analytics.range.14d"), value: 14 },
										{ label: t(lang, "analytics.range.30d"), value: 30 },
										{ label: t(lang, "analytics.range.90d"), value: 90 },
									].map((opt) => (
										<option className="bg-[var(--bg-base)] text-[var(--text-primary)]" key={`option-${opt.value}`} value={opt.value}>
											{opt.label}
										</option>
									))}
								</select>
								<Icons.chevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
							</div>
						</div>
						<div className="flex items-center gap-3">
							<div className="text-xs text-[var(--text-tertiary)] font-medium">{t(lang, "analytics.model")}</div>
							<div className="relative">
								<select
									className="h-10 min-w-[240px] appearance-none rounded-[var(--radius-lg)] bg-[var(--glass-bg-subtle)] border border-[var(--glass-border)] pl-4 pr-10 text-sm text-[var(--text-secondary)] outline-none hover:bg-[var(--glass-bg)] focus:border-[var(--glass-border-hover)] transition-colors duration-200"
									value={modelFilter}
									onChange={(e) => setModelFilter(e.target.value)}
								>
									<option className="bg-[var(--bg-base)] text-[var(--text-primary)]" value="all">
										{t(lang, "analytics.allModels")}
									</option>
									{modelIds.map((id) => (
										<option className="bg-[var(--bg-base)] text-[var(--text-primary)]" key={id} value={id}>
											{getModelDisplayName(id)}
										</option>
									))}
								</select>
								<Icons.chevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
							</div>
						</div>
					</div>

					
					<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
						{statCard(t(lang, "analytics.estimatedCost.filtered"), formatMoneyUsd(filteredTotals.totalCost, lang), t(lang, "analytics.estimatedCost.hint"))}
						{statCard(
							t(lang, "analytics.calls.filtered"),
							formatInt(filteredTotals.calls, lang),
							totals.firstTs && totals.lastTs ? t(lang, "analytics.totalCallsHint", { count: formatInt(totals.calls, lang) }) : undefined,
						)}
						{statCard(
							t(lang, "analytics.tokens.filtered"),
							`${formatInt(filteredTotals.totalIn + filteredTotals.totalOut, lang)}`,
							`${formatInt(filteredTotals.totalIn, lang)} in • ${formatInt(filteredTotals.totalOut, lang)} out`,
						)}
					</div>

					
					<div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
						<div className="lg:col-span-2">
							<AnimatedLineChart series={series} label={t(lang, "analytics.estimatedSpend")} lang={lang} />
						</div>
						<div className="rounded-[var(--radius-xl)] bg-[var(--glass-bg-subtle)] border border-[var(--glass-border)] p-5">
							<div className="text-base font-bold text-[var(--text-primary)]">{t(lang, "analytics.topModels")}</div>
							<div className="text-xs text-[var(--text-muted)] mt-1">{t(lang, "analytics.byEstimatedCost")}</div>
							<div className="mt-4 space-y-3">
								{topModels.length === 0 ? (
									<div className="text-sm text-[var(--text-muted)]">{t(lang, "common.noData")}</div>
								) : (
									topModels.map((m, i) => (
										<div key={m.modelId} className="flex items-center justify-between gap-3 p-2 rounded-[var(--radius-md)] hover:bg-[var(--glass-bg)] transition-colors">
											<div className="flex items-center gap-3 min-w-0">
												<div className="w-6 h-6 rounded-[var(--radius-sm)] bg-[var(--glass-bg)] border border-[var(--glass-border)] flex items-center justify-center text-[10px] font-bold text-[var(--text-muted)]">
													{i + 1}
												</div>
												<div className="min-w-0">
													<div className="text-sm text-[var(--text-primary)] truncate">{getModelDisplayName(m.modelId)}</div>
													<div className="text-[10px] text-[var(--text-muted)] truncate">{m.calls} calls</div>
												</div>
											</div>
											<div className="text-sm font-semibold text-[var(--text-primary)] flex-shrink-0">{formatMoneyUsd(m.costUsd, lang)}</div>
										</div>
									))
								)}
							</div>
						</div>
					</div>

					
					<div className="mt-6 rounded-[var(--radius-xl)] glass overflow-hidden">
						<div className="px-6 py-5 border-b border-[var(--glass-border)] bg-[var(--glass-bg-subtle)]">
							<div className="text-base font-bold text-[var(--text-primary)]">{t(lang, "analytics.byModel.title")}</div>
							<div className="text-sm text-[var(--text-muted)] mt-1">{t(lang, "analytics.byModel.subtitle")}</div>
						</div>
						<div className="overflow-auto">
							<table className="min-w-full text-sm">
								<thead className="text-[11px] uppercase tracking-wider font-semibold text-[var(--text-tertiary)] bg-[var(--glass-bg-subtle)]">
									<tr>
										<th className="text-left px-6 py-4">{t(lang, "analytics.table.model")}</th>
										<th className="text-right px-6 py-4">{t(lang, "analytics.table.calls")}</th>
										<th className="text-right px-6 py-4">{t(lang, "analytics.table.tokensIn")}</th>
										<th className="text-right px-6 py-4">{t(lang, "analytics.table.tokensOut")}</th>
										<th className="text-right px-6 py-4">{t(lang, "analytics.table.cost")}</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-[var(--glass-border)]">
									{modelAgg.length === 0 ? (
										<tr>
											<td className="px-6 py-8 text-[var(--text-muted)] text-center" colSpan={5}>
												{t(lang, "common.noData")}
											</td>
										</tr>
									) : (
										pagedModels.items.map((m) => (
											<tr key={m.modelId} className="hover:bg-[var(--glass-bg-subtle)] transition-colors">
												<td className="px-6 py-4">
													<div className="text-[var(--text-primary)] font-medium">{getModelDisplayName(m.modelId)}</div>
													<div className="text-[11px] text-[var(--text-muted)]">{m.modelId}</div>
												</td>
												<td className="px-6 py-4 text-right text-[var(--text-secondary)]">{formatInt(m.calls, lang)}</td>
												<td className="px-6 py-4 text-right text-[var(--text-secondary)]">{formatInt(m.inTokens, lang)}</td>
												<td className="px-6 py-4 text-right text-[var(--text-secondary)]">{formatInt(m.outTokens, lang)}</td>
												<td className="px-6 py-4 text-right text-[var(--text-primary)] font-medium">{formatMoneyUsd(m.costUsd, lang)}</td>
											</tr>
										))
									)}
								</tbody>
							</table>
						</div>
						<div className="flex items-center justify-between px-6 py-4 border-t border-[var(--glass-border)] text-xs text-[var(--text-muted)]">
							<div>
								{t(lang, "common.page")} {pagedModels.page}/{pagedModels.totalPages}
							</div>
							<div className="flex items-center gap-2">
								<Button variant="ghost" size="sm" disabled={pagedModels.page <= 1} onClick={() => setModelPage((p) => Math.max(1, p - 1))}>
									{t(lang, "common.prev")}
								</Button>
								<Button variant="ghost" size="sm" disabled={pagedModels.page >= pagedModels.totalPages} onClick={() => setModelPage((p) => p + 1)}>
									{t(lang, "common.next")}
								</Button>
							</div>
						</div>
					</div>

					
					<div className="mt-6 rounded-[var(--radius-xl)] glass overflow-hidden">
						<div className="px-6 py-5 border-b border-[var(--glass-border)] bg-[var(--glass-bg-subtle)]">
							<div className="text-base font-bold text-[var(--text-primary)]">{t(lang, "analytics.recentRequests")}</div>
							<div className="text-sm text-[var(--text-muted)] mt-1">{t(lang, "analytics.recentRequests.subtitle")}</div>
						</div>
						<div className="overflow-auto">
							<table className="min-w-full text-sm">
								<thead className="text-[11px] uppercase tracking-wider font-semibold text-[var(--text-tertiary)] bg-[var(--glass-bg-subtle)]">
									<tr>
										<th className="text-left px-6 py-4">{t(lang, "analytics.table.time")}</th>
										<th className="text-left px-6 py-4">{t(lang, "analytics.table.conversation")}</th>
										<th className="text-left px-6 py-4">{t(lang, "analytics.table.model")}</th>
										<th className="text-right px-6 py-4">{t(lang, "analytics.table.cost")}</th>
										<th className="text-right px-6 py-4">{t(lang, "analytics.table.tokens")}</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-[var(--glass-border)]">
									{filteredRows.length === 0 ? (
										<tr>
											<td className="px-6 py-8 text-[var(--text-muted)] text-center" colSpan={5}>
												{t(lang, "common.noData")}
											</td>
										</tr>
									) : (
										pagedRecent.items.map((r) => (
											<tr key={`${r.conversationId}:${r.id}`} className="hover:bg-[var(--glass-bg-subtle)] transition-colors">
												<td className="px-6 py-4 text-[var(--text-secondary)] whitespace-nowrap">{formatDateTime(r.createdAt, lang)}</td>
												<td className="px-6 py-4 min-w-[220px]">
													<div className="text-[var(--text-primary)] truncate max-w-[200px]">{r.conversationTitle}</div>
												</td>
												<td className="px-6 py-4">
													<div className="text-[var(--text-secondary)] truncate">{getModelDisplayName(r.modelId)}</div>
													<div className="text-[10px] text-[var(--text-muted)] truncate">{r.modelId}</div>
												</td>
												<td className="px-6 py-4 text-right text-[var(--text-primary)] font-medium whitespace-nowrap">{formatMoneyUsd(r.costUsd, lang)}</td>
												<td className="px-6 py-4 text-right text-[var(--text-secondary)] whitespace-nowrap">
													{formatInt(r.inTokens + r.outTokens, lang)}
													<div className="text-[10px] text-[var(--text-muted)]">{formatInt(r.inTokens, lang)} in • {formatInt(r.outTokens, lang)} out</div>
												</td>
											</tr>
										))
									)}
								</tbody>
							</table>
						</div>
						<div className="flex items-center justify-between px-6 py-4 border-t border-[var(--glass-border)] text-xs text-[var(--text-muted)]">
							<div>
								{t(lang, "common.page")} {pagedRecent.page}/{pagedRecent.totalPages}
							</div>
							<div className="flex items-center gap-2">
								<Button variant="ghost" size="sm" disabled={pagedRecent.page <= 1} onClick={() => setRecentPage((p) => Math.max(1, p - 1))}>
									{t(lang, "common.prev")}
								</Button>
								<Button variant="ghost" size="sm" disabled={pagedRecent.page >= pagedRecent.totalPages} onClick={() => setRecentPage((p) => p + 1)}>
									{t(lang, "common.next")}
								</Button>
							</div>
						</div>

						<div className="px-6 py-4 border-t border-[var(--glass-border)] text-xs text-[var(--text-muted)] bg-[var(--glass-bg-subtle)]">{t(lang, "analytics.note.estimates")}</div>
					</div>
				</div>
			</div>
		</div>
	);
}
