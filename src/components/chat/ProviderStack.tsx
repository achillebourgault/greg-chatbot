"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { approxTokens, getProviderInfo, providerFromModelId } from "@/lib/providers";
import { getModelDisplayName, type Conversation, useChatStore } from "@/stores/chat-store";
import { fetchModels, type ModelListItem } from "@/lib/client/openrouter";
import { t } from "@/i18n";

type Pricing = { promptPerToken: number | null; completionPerToken: number | null };

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

function useModelPricingMap() {
	const [models, setModels] = useState<ModelListItem[] | null>(null);

	useEffect(() => {
		const controller = new AbortController();
		fetchModels(controller.signal).then(setModels).catch(() => setModels([]));
		return () => controller.abort();
	}, []);

	return useMemo(() => {
		const map = new Map<string, Pricing>();
		for (const m of models ?? []) {
			map.set(m.id, {
				promptPerToken: parsePrice(m.pricing?.prompt),
				completionPerToken: parsePrice(m.pricing?.completion),
			});
		}
		return { map, ready: models !== null };
	}, [models]);
}

type ProviderUsage = {
	modelId: string;
	label: string;
	providerLabel: string;
	iconUrl: string;
	fallbackIconSrc: string;
	totalUsd: number;
	free: boolean;
};

function ProviderIcon({
	src,
	fallback,
	alt,
	size,
	className,
}: {
	src: string;
	fallback: string;
	alt: string;
	size: number;
	className?: string;
}) {
	const [currentSrc, setCurrentSrc] = useState(src);

	useEffect(() => {
		setCurrentSrc(src);
	}, [src]);

	return (
		<Image
			src={currentSrc}
			alt={alt}
			width={size}
			height={size}
			unoptimized
			className={className}
			onError={() => {
				if (currentSrc === fallback) return;
				setCurrentSrc(fallback);
			}}
		/>
	);
}

export function ProviderStack({ conversation }: { conversation: Conversation }) {
	const { state } = useChatStore();
	const lang = state.settings.uiLanguage;
	const { map: pricingMap, ready } = useModelPricingMap();

	const usage = useMemo((): ProviderUsage[] => {
		const messages = conversation.messages;
		const perModel = new Map<string, ProviderUsage>();

		const record = (modelId: string, costUsd: number, free: boolean) => {
			const providerId = providerFromModelId(modelId);
			const info = getProviderInfo(providerId);
			const iconUrl = `/api/tools/icon?url=${encodeURIComponent(info.siteUrl)}`;
			const providerLabel = providerId === "unknown" ? t(lang, "providers.unknown") : info.label;

			const existing = perModel.get(modelId) ?? {
				modelId,
				label: getModelDisplayName(modelId),
				providerLabel,
				iconUrl,
				fallbackIconSrc: info.iconSrc,
				totalUsd: 0,
				free,
			};

			existing.totalUsd += costUsd;
			existing.free = existing.free && free;
			perModel.set(modelId, existing);
		};

		for (let i = 0; i < messages.length; i++) {
			const msg = messages[i];
			if (msg.role !== "assistant") continue;
			const modelId = msg.model ?? conversation.model;

			const prevUser = (() => {
				for (let j = i - 1; j >= 0; j--) {
					if (messages[j].role === "user") return messages[j];
				}
				return null;
			})();

			const inTokens = prevUser ? approxTokens(prevUser.content) : 0;
			const outTokens = approxTokens(msg.content);

			const pricing = pricingMap.get(modelId);
			const p = pricing?.promptPerToken;
			const c = pricing?.completionPerToken;

			const free = (p ?? 0) === 0 && (c ?? 0) === 0 && pricing !== undefined;
			const costUsd = (p ?? 0) * inTokens + (c ?? 0) * outTokens;
			record(modelId, costUsd, free);
		}

		// If no assistant messages yet, show the currently selected model
		if (messages.filter((m) => m.role === "assistant").length === 0) {
			record(conversation.model, 0, false);
		}

		return Array.from(perModel.values()).sort((a, b) => b.totalUsd - a.totalUsd);
	}, [conversation.messages, conversation.model, lang, pricingMap]);

	const modelIcons = usage.map((u) => ({
		label: u.label,
		providerLabel: u.providerLabel,
		src: u.iconUrl,
		fallback: u.fallbackIconSrc,
		id: u.modelId,
	}));

	return (
		<div className="relative group">
			<div className="flex items-center -space-x-2">
				{modelIcons.slice(0, 6).map((p) => (
					<div
						key={p.id}
						className="w-8 h-8 rounded-full border border-[var(--glass-border)] bg-[var(--bg-elevated)] overflow-hidden shadow-md shadow-black/30 ring-2 ring-[var(--bg-base)] hover:ring-[var(--glass-border-hover)] hover:scale-110 transition-all duration-200"
						title={`${p.label} (${p.providerLabel})`}
					>
						<ProviderIcon
							src={p.src}
							fallback={p.fallback}
							alt={p.label}
							size={32}
							className="w-full h-full object-cover"
						/>
					</div>
				))}
				{modelIcons.length > 6 ? (
					<div className="w-8 h-8 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] flex items-center justify-center text-[11px] font-medium text-[var(--text-secondary)] ring-2 ring-[var(--bg-base)]">
						+{modelIcons.length - 6}
					</div>
				) : null}
			</div>

			
			<div className="pointer-events-none opacity-0 group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-200 absolute left-0 top-full mt-3 w-[380px] z-50">
				<div className="rounded-[var(--radius-xl)] glass-strong border border-[var(--glass-border)] shadow-2xl shadow-black/30 overflow-hidden">
					<div className="px-5 py-4 border-b border-[var(--glass-border)] bg-[var(--glass-bg-subtle)]">
						<div className="text-sm font-semibold text-[var(--text-primary)]">{t(lang, "providerStack.title")}</div>
						<div className="text-[11px] text-[var(--text-muted)] mt-1">
							{t(lang, "providerStack.subtitle", { loadingPricing: !ready })}
						</div>
					</div>
					<div className="p-2 max-h-[340px] overflow-auto scrollbar-premium">
						{usage.map((m) => (
							<div key={m.modelId} className="p-2 rounded-[var(--radius-lg)] hover:bg-[var(--glass-bg-subtle)] transition-colors">
								<div className="flex items-center justify-between gap-3 px-2">
									<div className="flex items-center gap-3 min-w-0">
										<div className="w-8 h-8 rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] overflow-hidden">
											<ProviderIcon
												src={m.iconUrl}
												fallback={m.fallbackIconSrc}
												alt={m.providerLabel}
												size={32}
												className="w-full h-full object-cover"
											/>
										</div>
										<div className="min-w-0">
											<div className="text-[13px] font-medium text-[var(--text-primary)] truncate">{m.label}</div>
											<div className="text-[11px] text-[var(--text-muted)] truncate">{m.providerLabel}</div>
										</div>
									</div>
									<div className="flex-shrink-0">
										{m.free ? (
											<span className="px-2 py-0.5 rounded-full bg-[var(--accent-green)]/15 border border-[var(--accent-green)]/20 text-[11px] font-medium text-[var(--accent-green)]">
												{t(lang, "modelPicker.badge.free")}
											</span>
										) : (
											<span className="text-sm font-semibold text-[var(--text-primary)]">{formatMoneyUsd(m.totalUsd)}</span>
										)}
									</div>
								</div>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
