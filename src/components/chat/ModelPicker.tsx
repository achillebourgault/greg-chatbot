
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchModels, type ModelListItem } from "@/lib/client/openrouter";
import { Icons } from "@/components/ui";
import { getModelDisplayName, useChatStore } from "@/stores/chat-store";
import { t, type UiLanguage } from "@/i18n";

type Props = {
	value: string;
	onChange: (model: string) => void;
	disabled?: boolean;
	placement?: "up" | "down";
	lang?: UiLanguage;
};

function parsePrice(value?: string): number | null {
	if (!value) return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

function isFreeModel(m: ModelListItem): boolean {
	const prompt = parsePrice(m.pricing?.prompt);
	const completion = parsePrice(m.pricing?.completion);
	if (prompt === null && completion === null) return false;
	return (prompt ?? 0) === 0 && (completion ?? 0) === 0;
}

function toUsdPerMillion(perToken: number | null): number | null {
	if (perToken === null) return null;
	return perToken * 1_000_000;
}

function formatUsd(value: number | null): string {
	if (value === null) return "—";
	if (value === 0) return "$0";
	if (value >= 100) return `$${value.toFixed(0)}`;
	if (value >= 10) return `$${value.toFixed(1)}`;
	if (value >= 1) return `$${value.toFixed(2)}`;
	if (value >= 0.1) return `$${value.toFixed(3)}`;
	return `$${value.toFixed(4)}`;
}

function getProvider(modelId: string): string {
	return modelId.split("/")[0] ?? "";
}

function groupModels(models: ModelListItem[]): Map<string, ModelListItem[]> {
	const groups = new Map<string, ModelListItem[]>();
	for (const model of models) {
		const provider = getProvider(model.id);
		const existing = groups.get(provider) ?? [];
		existing.push(model);
		groups.set(provider, existing);
	}
	return groups;
}

export function ModelPicker({ value, onChange, disabled, placement = "up", lang = "en" }: Props) {
	const { state } = useChatStore();
	const [models, setModels] = useState<ModelListItem[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isOpen, setIsOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [priceFilter, setPriceFilter] = useState<"all" | "free" | "paid">("all");
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const controller = new AbortController();
		fetchModels(controller.signal)
			.then((items) => {
				setModels(items);
				setError(null);
			})
			.catch((e) => {
				setError(e instanceof Error ? e.message : "Failed to load models");
				setModels([]);
			});
		return () => controller.abort();
	}, []);

	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
				setIsOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	useEffect(() => {
		if (!isOpen) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") setIsOpen(false);
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [isOpen]);

	const filteredModels = useMemo(() => {
		const list = models ?? [];
		let next = list;
		if (priceFilter !== "all") {
			next = next.filter((m) => (priceFilter === "free" ? isFreeModel(m) : !isFreeModel(m)));
		}
		if (!search.trim()) return next;
		const query = search.toLowerCase();
		return next.filter((m) => {
			const haystack = `${m.id} ${m.name ?? ""}`.toLowerCase();
			return haystack.includes(query);
		});
	}, [models, priceFilter, search]);

	const filteredIdSet = useMemo(() => new Set(filteredModels.map((m) => m.id)), [filteredModels]);
	const groupedModels = useMemo(() => groupModels(filteredModels), [filteredModels]);
	const modelById = useMemo(() => new Map((models ?? []).map((m) => [m.id, m] as const)), [models]);

	const favoriteIds = useMemo(() => {
		return Object.entries(state.modelStats.usage)
			.sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
			.map(([id]) => id)
			.filter((id) => filteredIdSet.has(id))
			.slice(0, 5);
	}, [filteredIdSet, state.modelStats.usage]);

	const recentIds = useMemo(() => {
		const favorites = new Set(favoriteIds);
		return state.modelStats.recent
			.filter((id) => filteredIdSet.has(id) && !favorites.has(id))
			.slice(0, 5);
	}, [favoriteIds, filteredIdSet, state.modelStats.recent]);

	const favoriteModels = useMemo(
		() => favoriteIds.map((id) => modelById.get(id)).filter(Boolean) as ModelListItem[],
		[favoriteIds, modelById],
	);
	const recentModels = useMemo(
		() => recentIds.map((id) => modelById.get(id)).filter(Boolean) as ModelListItem[],
		[recentIds, modelById],
	);

	const showSuggested = !search.trim() && (favoriteModels.length > 0 || recentModels.length > 0);
	const suggestedIds = useMemo(() => new Set([...favoriteIds, ...recentIds]), [favoriteIds, recentIds]);
	const selectedDisplayName = getModelDisplayName(value);

	const renderModelButton = (model: ModelListItem, badge?: "favorite" | "recent") => {
		const isSelected = model.id === value;
		const free = isFreeModel(model);
		const inPerMillion = toUsdPerMillion(parsePrice(model.pricing?.prompt));
		const outPerMillion = toUsdPerMillion(parsePrice(model.pricing?.completion));

		return (
			<button
				key={`${badge ?? "model"}:${model.id}`}
				onClick={() => {
					onChange(model.id);
					setIsOpen(false);
					setSearch("");
				}}
				className={[
					"w-full flex items-start gap-3 px-3 py-2.5 rounded-lg",
					"text-left transition-all duration-150",
					isSelected ? "bg-white/[0.08]" : "hover:bg-white/[0.04]",
				].join(" ")}
			>
				<div className="min-w-0 flex-1">
					<div className="flex items-start justify-between gap-2">
						<div className={`text-sm truncate ${isSelected ? "text-zinc-100" : "text-zinc-200"}`}>
							{getModelDisplayName(model.id)}
						</div>
						{isSelected ? <Icons.check className="w-4 h-4 text-zinc-200 flex-shrink-0 mt-0.5" /> : null}
					</div>
					<div className="mt-1 text-xs text-zinc-400 flex flex-wrap items-center gap-x-2 gap-y-1">
						{badge === "favorite" ? <span className="text-amber-300">{t(lang, "modelPicker.badge.favorite")}</span> : null}
						{badge === "recent" ? <span className="text-sky-300">{t(lang, "modelPicker.badge.recent")}</span> : null}
						{badge ? <span className="text-zinc-600">•</span> : null}
						<span className={free ? "text-emerald-300" : "text-zinc-400"}>
							{free ? t(lang, "modelPicker.badge.free") : t(lang, "modelPicker.badge.paid")}
						</span>
						{!free && (
							<>
								<span className="text-zinc-600">•</span>
								<span>
									{t(lang, "modelPicker.price.in")} {formatUsd(inPerMillion)}/1M
								</span>
								<span className="text-zinc-600">•</span>
								<span>
									{t(lang, "modelPicker.price.out")} {formatUsd(outPerMillion)}/1M
								</span>
							</>
						)}
					</div>
				</div>
			</button>
		);
	};

	return (
		<div ref={containerRef} className="relative">
			<button
				type="button"
				onClick={() => !disabled && setIsOpen((v) => !v)}
				disabled={disabled}
				className={[
					"flex items-center gap-2 px-3 py-1.5 rounded-lg",
					"bg-white/[0.04] border border-white/[0.08]",
					"text-left transition-all duration-150",
					"hover:bg-white/[0.08] hover:border-white/[0.12]",
					"disabled:opacity-50 disabled:cursor-not-allowed",
					isOpen ? "border-white/[0.15] bg-white/[0.06]" : "",
				].join(" ")}
			>
				<div className="min-w-0">
					<div className="text-xs text-zinc-100 font-medium truncate">{selectedDisplayName}</div>
				</div>
				<Icons.chevronDown
					className={`w-3.5 h-3.5 text-zinc-500 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
				/>
			</button>

			{isOpen && (
				<div
					className={[
						"absolute right-0 w-80 z-50 animate-in fade-in duration-150",
						placement === "up" ? "bottom-full mb-2 slide-in-from-bottom-2" : "top-full mt-2 slide-in-from-top-2",
					].join(" ")}
				>
					<div className="rounded-xl bg-zinc-900 border border-white/[0.08] shadow-xl shadow-black/50 overflow-hidden">
						<div className="p-2 border-b border-white/[0.06] flex items-center justify-between gap-2">
							<div className="text-[11px] text-zinc-500">{t(lang, "modelPicker.pricing")}</div>
							<div className="flex items-center gap-1">
								{(
									[
										{ id: "all" as const, label: t(lang, "modelPicker.filter.all") },
										{ id: "free" as const, label: t(lang, "modelPicker.filter.free") },
										{ id: "paid" as const, label: t(lang, "modelPicker.filter.paid") },
									] as const
								).map((opt) => (
									<button
										key={opt.id}
										type="button"
										onClick={() => setPriceFilter(opt.id)}
										className={[
											"h-7 px-2.5 rounded-lg text-[11px] border transition-colors",
											priceFilter === opt.id
												? "bg-white/[0.10] border-white/[0.16] text-zinc-100"
												: "bg-transparent border-white/[0.08] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200",
										].join(" ")}
									>
										{opt.label}
									</button>
								))}
							</div>
						</div>

						<div className="p-2 border-b border-white/[0.06]">
							<div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
								<svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
									/>
								</svg>
								<input
									type="text"
									value={search}
									onChange={(e) => setSearch(e.target.value)}
									placeholder={t(lang, "modelPicker.searchPlaceholder")}
									className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none"
									autoFocus
								/>
							</div>
						</div>

						<div className="max-h-[min(420px,50vh)] overflow-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
							{error ? (
								<div className="p-4 text-center text-sm text-red-400">{error}</div>
							) : models === null ? (
								<div className="p-4 text-center text-sm text-zinc-500">{t(lang, "modelPicker.loading")}</div>
							) : filteredModels.length === 0 ? (
								<div className="p-4 text-center text-sm text-zinc-500">
									{search.trim() ? t(lang, "modelPicker.emptySearch") : t(lang, "modelPicker.empty")}
								</div>
							) : (
								<div className="p-2">
									{showSuggested && (
										<div className="mb-2">
											{favoriteModels.length > 0 && (
												<div className="mb-2">
													<div className="px-3 py-1 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
														{t(lang, "modelPicker.section.favorites")}
													</div>
													{favoriteModels.map((m) => renderModelButton(m, "favorite"))}
												</div>
											)}
											{recentModels.length > 0 && (
												<div className="mb-2">
													<div className="px-3 py-1 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
														{t(lang, "modelPicker.section.recent")}
													</div>
													{recentModels.map((m) => renderModelButton(m, "recent"))}
												</div>
											)}
											<div className="mt-2 h-px bg-white/[0.06]" />
										</div>
									)}

									{Array.from(groupedModels.entries()).map(([provider, providerModels]) => {
										const list = showSuggested ? providerModels.filter((m) => !suggestedIds.has(m.id)) : providerModels;
										if (list.length === 0) return null;
										return (
											<div key={provider} className="mb-2 last:mb-0">
												<div className="px-3 py-1 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
													{provider}
												</div>
												{list.map((m) => renderModelButton(m))}
											</div>
										);
									})}
								</div>
							)
							}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
