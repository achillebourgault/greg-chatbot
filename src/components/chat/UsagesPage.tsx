"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Icons } from "@/components/ui/Icons";
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

function formatMoneyUsd(value: number): string {
	if (!Number.isFinite(value)) return "$0";
	if (value === 0) return "$0";
	if (value < 0.01) return `$${value.toFixed(4)}`;
	if (value < 1) return `$${value.toFixed(3)}`;
	if (value < 10) return `$${value.toFixed(2)}`;
	return `$${value.toFixed(1)}`;
}

function formatInt(n: number): string {
	return new Intl.NumberFormat().format(n);
}

function formatDateTime(ts: number, lang: "en" | "fr"): string {
	return new Date(ts).toLocaleString(lang === "fr" ? "fr-FR" : "en-US", {
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
	const t = (s ?? "").trim();
	if (t.length <= maxLen) return t;
	return t.slice(0, Math.max(0, maxLen - 1)).trimEnd() + "…";
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
	return Array.from(buckets.entries())
		.sort((a, b) => a[0] - b[0])
		.map(([ts, costUsd]) => ({ ts, costUsd }));
}

function AnimatedLineChart({
	series,
	label,
}: {
	series: Array<{ ts: number; costUsd: number }>;
	label: string;
}) {
	const [progress, setProgress] = useState(1);
	const rafRef = useRef<number | null>(null);
	const total = useMemo(() => series.reduce((a, b) => a + b.costUsd, 0), [series]);

	useEffect(() => {
		const start = performance.now();
		const dur = 650;
		const tick = (t: number) => {
			const p = Math.min(1, (t - start) / dur);
			// Ease out
			const eased = 1 - Math.pow(1 - p, 3);
			setProgress(eased);
			if (p < 1) rafRef.current = requestAnimationFrame(tick);
		};
		rafRef.current = requestAnimationFrame(tick);
		return () => {
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
		};
	}, [series.length, total]);

	const w = 640;
	const h = 180;
	const padX = 16;
	const padY = 18;
	const innerW = w - padX * 2;
	const innerH = h - padY * 2;
	const max = Math.max(0.000001, ...series.map((s) => s.costUsd));
	const min = 0;
	const n = Math.max(1, series.length);

	const points = series.map((s, i) => {
		const x = padX + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
		const v = s.costUsd;
		const y = padY + (1 - (v - min) / (max - min)) * innerH;
		return { x, y, v, ts: s.ts };
	});

	const pathD =
		points.length === 0
			? ""
			: points
					.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
					.join(" ");

	return (
		<div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
			<div className="flex items-end justify-between gap-3">
				<div>
					<div className="text-sm font-semibold text-zinc-100">{label}</div>
					<div className="text-xs text-zinc-500 mt-1">{series.length ? `Max: ${formatMoneyUsd(max)}` : "No data"}</div>
				</div>
				<div className="text-xs text-zinc-400">Total: {formatMoneyUsd(series.reduce((a, b) => a + b.costUsd, 0))}</div>
			</div>

			<div className="mt-3">
				<svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[180px]">
					<defs>
						<linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
							<stop offset="0%" stopColor="rgba(16,185,129,0.85)" />
							<stop offset="60%" stopColor="rgba(56,189,248,0.80)" />
							<stop offset="100%" stopColor="rgba(16,185,129,0.75)" />
						</linearGradient>
					</defs>

					{/* grid */}
					{[0.25, 0.5, 0.75].map((t) => {
						const y = padY + t * innerH;
						return <line key={t} x1={padX} x2={w - padX} y1={y} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />;
					})}

					{pathD ? (
						<>
							<path d={pathD} fill="none" stroke="rgba(16,185,129,0.12)" strokeWidth="6" strokeLinecap="round" />
							<path
								d={pathD}
								fill="none"
								stroke="url(#lineGrad)"
								strokeWidth="2.5"
								strokeLinecap="round"
								pathLength={1}
								strokeDasharray="1"
								strokeDashoffset={1 - progress}
							/>
						</>
					) : null}

					{/* points */}
					{points.map((p) => (
						<circle
							key={p.ts}
							cx={p.x}
							cy={p.y}
							r={3}
							fill="rgba(255,255,255,0.20)"
							stroke="rgba(16,185,129,0.65)"
							strokeWidth="1"
							opacity={Math.min(1, progress * 1.2)}
						>
							<title>{`${new Date(p.ts).toLocaleDateString(undefined, { month: "short", day: "2-digit" })}: ${formatMoneyUsd(p.v)}`}</title>
						</circle>
					))}
				</svg>
			</div>
		</div>
	);
}

export function UsagesPage() {
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
					conversationTitle: c.title || (lang === "fr" ? "Sans titre" : "Untitled"),
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

	const modelAgg = useMemo((): ModelAgg[] => {
		const map = new Map<string, ModelAgg>();
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
		<div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
			<div className="text-xs text-zinc-500">{label}</div>
			<div className="mt-1 text-lg font-semibold text-zinc-100">{value}</div>
			{hint ? <div className="mt-1 text-xs text-zinc-500">{hint}</div> : null}
		</div>
	);

	return (
		<div className="h-full w-full overflow-auto">
			<header className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-3 border-b border-white/[0.06] bg-zinc-950/80 backdrop-blur">
				<div className="flex items-center gap-3">
					<Button
						variant="ghost"
						size="icon"
						onClick={() => router.push("/")}
						className="text-zinc-400 hover:text-zinc-100"
						title={lang === "fr" ? "Retour" : "Back"}
					>
						<Icons.arrowLeft className="w-4 h-4" />
					</Button>
					<div>
						<div className="text-sm font-semibold text-zinc-100">{lang === "fr" ? "Analytics" : "Analytics"}</div>
						<div className="text-[11px] text-zinc-500">
							{lang === "fr"
								? "Stats locales (estimations) — tokens, modèles, coûts"
								: "Local analytics (estimates) — tokens, models, cost"}
						</div>
					</div>
				</div>

				<div className="flex items-center gap-2">
					<Button
						variant="ghost"
						onClick={() => setConfirmResetOpen(true)}
						className="text-zinc-400 hover:text-zinc-100"
						title={lang === "fr" ? "Réinitialiser les métriques" : "Reset metrics"}
					>
						{lang === "fr" ? "Reset metrics" : "Reset metrics"}
					</Button>
					<div className="text-[11px] text-zinc-500">
						{pricingReady
							? lang === "fr"
								? "Tarifs: OK"
								: "Pricing: OK"
							: lang === "fr"
								? "Tarifs: chargement…"
								: "Pricing: loading…"}
					</div>
				</div>
			</header>

			{confirmResetOpen ? (
				<div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-5">
					<div className="w-full max-w-md rounded-2xl border border-white/[0.12] bg-zinc-950 p-5">
						<div className="flex items-start justify-between gap-3">
							<div>
								<div className="text-sm font-semibold text-zinc-100">
									{lang === "fr" ? "Reset metrics" : "Reset metrics"}
								</div>
								<div className="mt-1 text-xs text-zinc-500 leading-relaxed">
									{lang === "fr"
										? "Réinitialise les compteurs locaux (par modèle). Les conversations ne sont pas supprimées."
										: "Resets local counters (per model). Conversations are not deleted."}
								</div>
							</div>
							<Button variant="ghost" size="icon" onClick={() => setConfirmResetOpen(false)} className="text-zinc-400 hover:text-zinc-100">
								<Icons.close className="w-4 h-4" />
							</Button>
						</div>

						<div className="mt-4 flex items-center justify-end gap-2">
							<Button variant="ghost" onClick={() => setConfirmResetOpen(false)}>
								{lang === "fr" ? "Annuler" : "Cancel"}
							</Button>
							<Button
								variant="secondary"
								onClick={() => {
									resetModelStats();
									setConfirmResetOpen(false);
								}}
							>
								{lang === "fr" ? "Réinitialiser" : "Reset"}
							</Button>
						</div>
					</div>
				</div>
			) : null}

			<div className="px-5 py-5">
				<div className="w-full">
					<div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
						<div className="flex items-center gap-2">
							<div className="text-[11px] text-zinc-500">{lang === "fr" ? "Période" : "Range"}</div>
							<div className="relative">
								<select
									className="h-9 appearance-none rounded-xl bg-zinc-950 border border-white/[0.08] pl-3 pr-9 text-sm text-zinc-200 outline-none hover:bg-white/[0.02] focus:border-white/[0.18]"
									value={rangeDays}
									onChange={(e) => setRangeDays(Number(e.target.value))}
								>
									<option className="bg-zinc-950 text-zinc-100" value={7}>
										{lang === "fr" ? "7 jours" : "Last 7d"}
									</option>
									<option className="bg-zinc-950 text-zinc-100" value={14}>
										{lang === "fr" ? "14 jours" : "Last 14d"}
									</option>
									<option className="bg-zinc-950 text-zinc-100" value={30}>
										{lang === "fr" ? "30 jours" : "Last 30d"}
									</option>
									<option className="bg-zinc-950 text-zinc-100" value={90}>
										{lang === "fr" ? "90 jours" : "Last 90d"}
									</option>
								</select>
								<Icons.chevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
							</div>
						</div>
						<div className="flex items-center gap-2">
							<div className="text-[11px] text-zinc-500">{lang === "fr" ? "Modèle" : "Model"}</div>
							<div className="relative">
								<select
									className="h-9 min-w-[220px] appearance-none rounded-xl bg-zinc-950 border border-white/[0.08] pl-3 pr-9 text-sm text-zinc-200 outline-none hover:bg-white/[0.02] focus:border-white/[0.18]"
									value={modelFilter}
									onChange={(e) => setModelFilter(e.target.value)}
								>
									<option className="bg-zinc-950 text-zinc-100" value="all">
										{lang === "fr" ? "Tous les modèles" : "All models"}
									</option>
									{modelIds.map((id) => (
										<option className="bg-zinc-950 text-zinc-100" key={id} value={id}>
											{getModelDisplayName(id)}
										</option>
									))}
								</select>
								<Icons.chevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
							</div>
						</div>
					</div>

					<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
						{statCard(
							lang === "fr" ? "Coût estimé (filtré)" : "Estimated cost (filtered)",
							formatMoneyUsd(filteredTotals.totalCost),
							lang === "fr"
								? "Basé sur un heuristique de tokens + pricing OpenRouter"
								: "Based on token heuristic + OpenRouter pricing",
						)}
						{statCard(
							lang === "fr" ? "Appels (filtré)" : "Calls (filtered)",
							formatInt(filteredTotals.calls),
							totals.firstTs && totals.lastTs
								? (lang === "fr"
									? `Total: ${formatInt(totals.calls)} appels`
									: `Total: ${formatInt(totals.calls)} calls`)
								: undefined,
						)}
						{statCard(
							lang === "fr" ? "Tokens (filtré)" : "Tokens (filtered)",
							`${formatInt(filteredTotals.totalIn + filteredTotals.totalOut)}`,
							`${formatInt(filteredTotals.totalIn)} in • ${formatInt(filteredTotals.totalOut)} out`,
						)}
					</div>

					<div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
						<div className="lg:col-span-2">
							<AnimatedLineChart
								series={series}
								label={lang === "fr" ? "Dépense estimée" : "Estimated spend"}
							/>
						</div>
						<div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
							<div className="text-sm font-semibold text-zinc-100">
								{lang === "fr" ? "Top modèles" : "Top models"}
							</div>
							<div className="text-xs text-zinc-500 mt-1">
								{lang === "fr" ? "Par coût estimé" : "By estimated cost"}
							</div>
							<div className="mt-3 space-y-2">
								{topModels.length === 0 ? (
									<div className="text-sm text-zinc-500">{lang === "fr" ? "Aucune donnée" : "No data"}</div>
								) : (
									topModels.map((m) => (
										<div key={m.modelId} className="flex items-center justify-between gap-3">
											<div className="min-w-0">
												<div className="text-sm text-zinc-200 truncate">{getModelDisplayName(m.modelId)}</div>
												<div className="text-[11px] text-zinc-500 truncate">{m.modelId}</div>
											</div>
											<div className="text-sm text-zinc-200 flex-shrink-0">{formatMoneyUsd(m.costUsd)}</div>
										</div>
									))
								)}
							</div>
						</div>
					</div>

					<div className="mt-6 rounded-2xl bg-zinc-900 border border-white/[0.08] overflow-hidden">
						<div className="px-5 py-4 border-b border-white/[0.06]">
							<div className="text-sm font-semibold text-zinc-100">{lang === "fr" ? "Par modèle" : "By model"}</div>
							<div className="text-xs text-zinc-500 mt-1">
								{lang === "fr" ? "Appels, tokens et coût estimé" : "Calls, tokens and estimated cost"}
							</div>
						</div>
						<div className="overflow-auto">
							<table className="min-w-full text-sm">
								<thead className="text-[11px] uppercase tracking-wide text-zinc-500 bg-zinc-950/40">
									<tr>
										<th className="text-left px-5 py-3">Model</th>
										<th className="text-right px-5 py-3">Calls</th>
										<th className="text-right px-5 py-3">Tokens in</th>
										<th className="text-right px-5 py-3">Tokens out</th>
										<th className="text-right px-5 py-3">Cost</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-white/[0.06]">
									{modelAgg.length === 0 ? (
										<tr>
											<td className="px-5 py-6 text-zinc-500" colSpan={5}>
												{lang === "fr" ? "Aucune donnée" : "No data"}
											</td>
										</tr>
									) : (
										pagedModels.items.map((m) => (
											<tr key={m.modelId} className="hover:bg-white/[0.02]">
												<td className="px-5 py-3">
													<div className="text-zinc-200">{getModelDisplayName(m.modelId)}</div>
													<div className="text-[11px] text-zinc-500">{m.modelId}</div>
												</td>
												<td className="px-5 py-3 text-right text-zinc-200">{formatInt(m.calls)}</td>
												<td className="px-5 py-3 text-right text-zinc-200">{formatInt(m.inTokens)}</td>
												<td className="px-5 py-3 text-right text-zinc-200">{formatInt(m.outTokens)}</td>
												<td className="px-5 py-3 text-right text-zinc-200">{formatMoneyUsd(m.costUsd)}</td>
											</tr>
										))
									)}
								</tbody>
							</table>
						</div>
						<div className="flex items-center justify-between px-5 py-4 border-t border-white/[0.06] text-xs text-zinc-500">
							<div>
								{lang === "fr" ? "Page" : "Page"} {pagedModels.page}/{pagedModels.totalPages}
							</div>
							<div className="flex items-center gap-2">
								<Button variant="ghost" size="sm" disabled={pagedModels.page <= 1} onClick={() => setModelPage((p) => Math.max(1, p - 1))}>
									{lang === "fr" ? "Préc" : "Prev"}
								</Button>
								<Button variant="ghost" size="sm" disabled={pagedModels.page >= pagedModels.totalPages} onClick={() => setModelPage((p) => p + 1)}>
									{lang === "fr" ? "Suiv" : "Next"}
								</Button>
							</div>
						</div>
					</div>

					<div className="mt-6 rounded-2xl bg-zinc-900 border border-white/[0.08] overflow-hidden">
						<div className="px-5 py-4 border-b border-white/[0.06]">
							<div className="text-sm font-semibold text-zinc-100">{lang === "fr" ? "Requêtes récentes" : "Recent requests"}</div>
							<div className="text-xs text-zinc-500 mt-1">
								{lang === "fr" ? "Derniers messages assistant (estimations)" : "Latest assistant messages (estimates)"}
							</div>
						</div>
						<div className="overflow-auto">
							<table className="min-w-full text-sm">
								<thead className="text-[11px] uppercase tracking-wide text-zinc-500 bg-zinc-950/40">
									<tr>
										<th className="text-left px-5 py-3">Time</th>
										<th className="text-left px-5 py-3">Conversation</th>
										<th className="text-left px-5 py-3">Model</th>
										<th className="text-right px-5 py-3">Cost</th>
										<th className="text-right px-5 py-3">Tokens</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-white/[0.06]">
									{filteredRows.length === 0 ? (
										<tr>
											<td className="px-5 py-6 text-zinc-500" colSpan={5}>
												{lang === "fr" ? "Aucune donnée" : "No data"}
											</td>
										</tr>
									) : (
										pagedRecent.items.map((r) => (
											<tr key={r.id} className="hover:bg-white/[0.02]">
												<td className="px-5 py-3 text-zinc-300 whitespace-nowrap">{formatDateTime(r.createdAt, lang)}</td>
												<td className="px-5 py-3 min-w-[220px]">
													<div className="text-zinc-200 truncate">{r.conversationTitle}</div>
													<div className="text-[11px] text-zinc-500 truncate">{r.promptPreview || (lang === "fr" ? "(pas de prompt)" : "(no prompt)")}</div>
												</td>
												<td className="px-5 py-3">
													<div className="text-zinc-200 truncate">{getModelDisplayName(r.modelId)}</div>
													<div className="text-[11px] text-zinc-500 truncate">{r.modelId}</div>
												</td>
												<td className="px-5 py-3 text-right text-zinc-200 whitespace-nowrap">{formatMoneyUsd(r.costUsd)}</td>
												<td className="px-5 py-3 text-right text-zinc-200 whitespace-nowrap">
													{formatInt(r.inTokens + r.outTokens)}
													<div className="text-[11px] text-zinc-500">{formatInt(r.inTokens)} in • {formatInt(r.outTokens)} out</div>
												</td>
											</tr>
										))
									)}
								</tbody>
							</table>
						</div>
						<div className="flex items-center justify-between px-5 py-4 border-t border-white/[0.06] text-xs text-zinc-500">
							<div>
								{lang === "fr" ? "Page" : "Page"} {pagedRecent.page}/{pagedRecent.totalPages}
							</div>
							<div className="flex items-center gap-2">
								<Button variant="ghost" size="sm" disabled={pagedRecent.page <= 1} onClick={() => setRecentPage((p) => Math.max(1, p - 1))}>
									{lang === "fr" ? "Préc" : "Prev"}
								</Button>
								<Button variant="ghost" size="sm" disabled={pagedRecent.page >= pagedRecent.totalPages} onClick={() => setRecentPage((p) => p + 1)}>
									{lang === "fr" ? "Suiv" : "Next"}
								</Button>
							</div>
						</div>

						<div className="px-5 py-4 border-t border-white/[0.06] text-xs text-zinc-500">
							{lang === "fr"
								? "Note: les coûts/tokens sont des estimations (pas des chiffres de facturation)."
								: "Note: costs/tokens are estimates (not billing data)."}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
