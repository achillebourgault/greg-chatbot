
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
	const { state, setModelPricing } = useChatStore();
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
				const pricing: Record<string, { isFree: boolean }> = {};
				for (const m of items) pricing[m.id] = { isFree: isFreeModel(m) };
				setModelPricing(pricing);
			})
			.catch((e) => {
				setError(e instanceof Error ? e.message : t(lang, "errors.modelsLoadFailed"));
				setModels([]);
			});
		return () => controller.abort();
	}, [lang, setModelPricing]);

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
					"group w-full flex items-start gap-3 px-3 py-2.5 rounded-[12px]",
					"text-left transition-all duration-200",
					isSelected 
						? "bg-[var(--accent-cyan-glow)] border border-[rgba(0,212,255,0.20)]" 
						: "hover:bg-[rgba(255,255,255,0.04)] border border-transparent hover:border-[var(--glass-border)]",
				].join(" ")}
			>
				<div className="min-w-0 flex-1">
					<div className="flex items-start justify-between gap-2">
						<div className={`text-[13px] truncate font-medium ${isSelected ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]"}`}>
							{getModelDisplayName(model.id)}
						</div>
						{isSelected ? (
							<div className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-[var(--accent-cyan-glow)] border border-[rgba(0,212,255,0.30)] flex items-center justify-center">
								<Icons.check className="w-3 h-3 text-[var(--accent-cyan)]" />
							</div>
						) : null}
					</div>
					<div className="mt-1.5 text-[11px] flex flex-wrap items-center gap-x-2 gap-y-1">
						{badge === "favorite" ? (
							<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[6px] bg-[var(--accent-orange-glow)] border border-[rgba(255,149,0,0.20)] text-[var(--accent-orange)] text-[10px] font-medium">
								<Icons.star className="w-2.5 h-2.5" />
								{t(lang, "modelPicker.badge.favorite")}
							</span>
						) : null}
						{badge === "recent" ? (
							<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[6px] bg-[rgba(255,255,255,0.04)] border border-[var(--glass-border)] text-[var(--text-secondary)] text-[10px] font-medium">
								<Icons.clock className="w-2.5 h-2.5" />
								{t(lang, "modelPicker.badge.recent")}
							</span>
						) : null}
						<span className={[
							"inline-flex items-center px-1.5 py-0.5 rounded-[6px] text-[10px] font-medium",
							free 
								? "bg-[rgba(52,199,89,0.10)] border border-[rgba(52,199,89,0.20)] text-[#34C759]" 
								: "bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[#8A8F98]"
						].join(" ")}>
							{free ? t(lang, "modelPicker.badge.free") : t(lang, "modelPicker.badge.paid")}
						</span>
						{!free && (
							<span className="text-[var(--text-subtle)] text-[10px]">
								{t(lang, "modelPicker.price.in")} {formatUsd(inPerMillion)} · {t(lang, "modelPicker.price.out")} {formatUsd(outPerMillion)}/M
							</span>
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
					"group flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-lg)]",
					"bg-[rgba(255,255,255,0.04)] border border-[var(--glass-border)]",
					"text-left transition-all duration-200",
					"hover:bg-[rgba(255,255,255,0.06)] hover:border-[var(--glass-border-hover)]",
					"disabled:opacity-50 disabled:cursor-not-allowed",
					isOpen ? "border-[rgba(0,212,255,0.25)] bg-[rgba(255,255,255,0.06)]" : "",
				].join(" ")}
			>
				<div className="min-w-0">
					<div className="text-[12px] text-[var(--text-secondary)] font-medium truncate group-hover:text-[var(--text-primary)] transition-colors">{selectedDisplayName}</div>
				</div>
				<Icons.chevronDown
					className={`w-3.5 h-3.5 text-[var(--text-subtle)] group-hover:text-[var(--text-secondary)] transition-all duration-200 ${isOpen ? "rotate-180 text-[var(--text-secondary)]" : ""}`}
				/>
			</button>

			
			{isOpen && (
				<div
					className={[
						"absolute right-0 w-[360px] z-50 animate-scale-in",
						placement === "up" ? "bottom-full mb-2" : "top-full mt-2",
					].join(" ")}
				>
					<div className="rounded-[var(--radius-2xl)] glass-strong shadow-[var(--shadow-xl)] overflow-hidden">
						
						<div className="p-3 border-b border-[var(--divider)] flex items-center justify-between gap-2">
							<div className="text-[11px] text-[var(--text-subtle)] font-medium">{t(lang, "modelPicker.pricing")}</div>
							<div className="flex items-center gap-1 p-0.5 rounded-[var(--radius-lg)] bg-[rgba(255,255,255,0.03)] border border-[var(--glass-border)]">
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
											"h-7 px-3 rounded-[var(--radius-sm)] text-[11px] font-medium transition-all duration-200",
											priceFilter === opt.id
												? "bg-[rgba(255,255,255,0.08)] text-[var(--text-primary)]"
												: "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
										].join(" ")}
									>
										{opt.label}
									</button>
								))}
							</div>
						</div>

						
						<div className="p-3 border-b border-[var(--divider)]">
							<div className="flex items-center gap-2.5 px-3 py-2.5 rounded-[var(--radius-lg)] bg-[rgba(255,255,255,0.03)] border border-[var(--glass-border)] focus-within:border-[rgba(0,212,255,0.25)] focus-within:bg-[rgba(255,255,255,0.04)] transition-all duration-200">
								<svg className="w-4 h-4 text-[var(--text-subtle)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
									className="flex-1 bg-transparent text-[13px] text-[var(--text-primary)] placeholder-[var(--text-subtle)] outline-none"
									autoFocus
								/>
								{search && (
									<button
										onClick={() => setSearch("")}
										className="text-[var(--text-subtle)] hover:text-[var(--text-primary)] transition-colors"
									>
										<Icons.close className="w-3.5 h-3.5" />
									</button>
								)}
							</div>
						</div>

						
						<div className="max-h-[min(420px,50vh)] overflow-auto scrollbar-premium">
							{error ? (
								<div className="p-6 text-center">
<div className="w-10 h-10 mx-auto mb-3 rounded-full bg-[var(--accent-red-glow)] flex items-center justify-center">
									<Icons.close className="w-5 h-5 text-[var(--accent-red)]" />
								</div>
								<div className="text-[13px] text-[var(--accent-red)]">{error}</div>
								</div>
							) : models === null ? (
								<div className="p-6 text-center">
									<div className="w-8 h-8 mx-auto mb-3 rounded-full border-2 border-[rgba(255,255,255,0.15)] border-t-[var(--accent-cyan)] animate-spin" />
									<div className="text-[13px] text-[var(--text-muted)]">{t(lang, "modelPicker.loading")}</div>
								</div>
							) : filteredModels.length === 0 ? (
								<div className="p-6 text-center">
									<div className="w-10 h-10 mx-auto mb-3 rounded-full bg-[rgba(255,255,255,0.04)] flex items-center justify-center">
										<Icons.search className="w-5 h-5 text-[var(--text-subtle)]" />
									</div>
									<div className="text-[13px] text-[var(--text-muted)]">
										{search.trim() ? t(lang, "modelPicker.emptySearch") : t(lang, "modelPicker.empty")}
									</div>
								</div>
							) : (
								<div className="p-2">
									{showSuggested && (
										<div className="mb-2">
											{favoriteModels.length > 0 && (
												<div className="mb-3">
																<div className="px-3 py-1.5 text-[10px] font-semibold text-[var(--accent-orange)] uppercase tracking-wider flex items-center gap-2">
														<Icons.star className="w-3 h-3" />
														{t(lang, "modelPicker.section.favorites")}
													</div>
													{favoriteModels.map((m) => renderModelButton(m, "favorite"))}
												</div>
											)}
											{recentModels.length > 0 && (
												<div className="mb-3">
																<div className="px-3 py-1.5 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-2">
														<Icons.clock className="w-3 h-3" />
														{t(lang, "modelPicker.section.recent")}
													</div>
													{recentModels.map((m) => renderModelButton(m, "recent"))}
												</div>
											)}
															<div className="mt-3 h-px bg-[var(--divider)]" />
										</div>
									)}

									{Array.from(groupedModels.entries()).map(([provider, providerModels]) => {
										const list = showSuggested ? providerModels.filter((m) => !suggestedIds.has(m.id)) : providerModels;
										if (list.length === 0) return null;
										return (
											<div key={provider} className="mb-3 last:mb-0">
												<div className="px-3 py-1.5 text-[10px] font-semibold text-[var(--text-subtle)] uppercase tracking-wider">
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
